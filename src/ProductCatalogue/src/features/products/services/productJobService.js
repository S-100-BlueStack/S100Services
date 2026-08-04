import {
  getActiveProductJobs as fetchActiveProductJobs,
  getProductJobStatus,
} from "../../data/api/productJobApi.js";
import { noticeError, noticeSuccess, noticeWarning } from "../../notices/services/noticeService.js";
import {
  createProductJobActionResult,
  createProductJobCompletionTitle,
  createProductJobRecord,
  getProductJobFailureMessage,
  isRollbackOperation,
  isSendToIcEncOperation,
  isTerminalProductJobStatus,
  normalizeStoredProductJob,
} from "../domain/productJob.js";
import {
  PRODUCT_OPERATION_TYPE,
  clearExternalProductOperations,
  replaceExternalProductOperations,
} from "../state/productOperationState.js";

const STORAGE_KEY = "productCatalogue.activeProductJobs.v1";
const SYNC_CHANNEL_NAME = "productCatalogue.productJobs.v1";
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_INTERVAL_MS = 10_000;
const RECONCILE_INTERVAL_MS = 1_000;
const REMOTE_RECONCILE_INTERVAL_MS = 3_000;
const REMOTE_DISCOVERY_GRACE_MS = 15_000;

const activePolls = new Map();
const syncedDatasetNames = new Set();
const activeRemoteWatches = new Map();
let initialized = false;
let restoredTerminalHandler = null;
let syncChannel = null;
let reconcileIntervalId = null;

export async function runProductJob({
  datasetName,
  operationType,
  exportTarget = null,
  label,
  startJob,
  onAccepted,
}) {
  if (!datasetName) {
    return {
      success: false,
      errorMessage: "Cannot start a product job without a datasetName.",
    };
  }
  if (typeof startJob !== "function") {
    return {
      success: false,
      errorMessage: "Cannot start a product job without a start request.",
    };
  }

  const startResult = await startJob();
  if (!startResult?.success) {
    return startResult;
  }

  const record = createProductJobRecord({
    response: startResult.data,
    datasetName,
    operationType,
    exportTarget,
    label,
  });
  if (!record) {
    return {
      success: false,
      status: startResult.status,
      data: {
        code: "JOB_RESPONSE_INVALID",
        message: "The operation started, but the job response was incomplete.",
      },
    };
  }

  upsertStoredJob(record);
  syncExternalProductOperations();
  invokeAcceptedHandler(onAccepted, startResult.data, record);

  return trackProductJob(record, { restored: false });
}

function invokeAcceptedHandler(handler, response, record) {
  if (typeof handler !== "function") {
    return;
  }

  try {
    handler(response, record);
  } catch (error) {
    // Accepted-job tracking must continue even when optional UI feedback fails.
    console.error("Failed to handle accepted product job.", error);
  }
}

export function initializeProductJobTracking({ onRestoredTerminal } = {}) {
  if (typeof onRestoredTerminal === "function") {
    restoredTerminalHandler = onRestoredTerminal;
  }

  reconcileStoredProductJobs();

  if (!initialized) {
    registerCrossTabSync();
    initialized = true;
  }

  return getStoredProductJobs();
}

export function synchronizeProductJobTracking() {
  reconcileStoredProductJobs();
  return getStoredProductJobs();
}

export async function synchronizeActiveProductJobs(datasetName) {
  const normalizedDatasetName = normalizeDatasetKey(datasetName);
  if (!normalizedDatasetName) {
    return {
      success: false,
      errorMessage: "Cannot synchronize active product jobs without a datasetName.",
    };
  }

  const result = await fetchActiveProductJobs(datasetName);
  if (!result?.success) {
    return result;
  }
  const responses = Array.isArray(result.data) ? result.data : [];
  const currentRecords = getStoredProductJobs();
  const currentByJobId = new Map(currentRecords.map((record) => [record.jobId, record]));
  const remoteRecords = responses
    .map((response) => {
      const record = createProductJobRecord({
        response,
        datasetName,
        operationType: response?.operationType,
        exportTarget: response?.exportTarget,
      });

      if (!record) {
        return null;
      }
      return {
        ...(currentByJobId.get(record.jobId) ?? {}),
        ...record,
      };
    })
    .filter(Boolean);
  const remoteJobIds = new Set(remoteRecords.map((record) => record.jobId));
  const now = Date.now();
  const nextRecords = currentRecords.filter((record) => {
    if (normalizeDatasetKey(record.datasetName) !== normalizedDatasetName) {
      return true;
    }

    if (remoteJobIds.has(record.jobId)) {
      return false;
    }
    if (activePolls.has(record.jobId)) {
      return true;
    }

    return isWithinRemoteDiscoveryGrace(record, now);
  });

  for (const record of remoteRecords) {
    const existingIndex = nextRecords.findIndex((candidate) => candidate.jobId === record.jobId);

    if (existingIndex >= 0) {
      nextRecords[existingIndex] = record;
    } else {
      nextRecords.push(record);
    }
  }

  writeStoredProductJobsIfChanged(nextRecords);
  syncExternalProductOperations();
  resumeStoredProductJobs();
  return {
    ...result,
    data: remoteRecords,
  };
}

export function watchActiveProductJobs(datasetName) {
  const normalizedDatasetName = normalizeDatasetKey(datasetName);
  if (!normalizedDatasetName) {
    return () => {};
  }

  const existing = activeRemoteWatches.get(normalizedDatasetName);
  if (existing) {
    existing.refCount += 1;
    void synchronizeActiveProductJobs(existing.datasetName);
    return () => releaseRemoteWatch(normalizedDatasetName);
  }
  const watch = {
    datasetName,
    refCount: 1,
    intervalId: null,
  };

  if (typeof globalThis.setInterval === "function") {
    watch.intervalId = globalThis.setInterval(() => {
      void synchronizeActiveProductJobs(watch.datasetName);
    }, REMOTE_RECONCILE_INTERVAL_MS);
  }

  activeRemoteWatches.set(normalizedDatasetName, watch);
  void synchronizeActiveProductJobs(datasetName);

  return () => releaseRemoteWatch(normalizedDatasetName);
}

export function getActiveProductJobs() {
  return getStoredProductJobs();
}

function reconcileStoredProductJobs() {
  syncExternalProductOperations();
  resumeStoredProductJobs();
}

function reconcileRemoteWatchedJobs() {
  for (const watch of activeRemoteWatches.values()) {
    void synchronizeActiveProductJobs(watch.datasetName);
  }
}

function resumeStoredProductJobs() {
  for (const record of getStoredProductJobs()) {
    void trackProductJob(record, { restored: true });
  }
}

function trackProductJob(record, { restored }) {
  const existingPoll = activePolls.get(record.jobId);
  if (existingPoll) {
    return existingPoll;
  }

  const poll = pollProductJob(record)
    .then(async (result) => {
      if (restored) {
        announceRestoredTerminal(record, result);
        await invokeRestoredTerminalHandler(result, record);
      }

      return result;
    })
    .finally(() => {
      activePolls.delete(record.jobId);
    });
  activePolls.set(record.jobId, poll);
  return poll;
}

async function pollProductJob(record) {
  let pollDelayMs = 0;

  while (true) {
    if (pollDelayMs > 0) {
      await delay(pollDelayMs);
    }

    const result = await getProductJobStatus(record.jobId);

    if (result?.success) {
      pollDelayMs = POLL_INTERVAL_MS;

      if (!isTerminalProductJobStatus(result.data?.status)) {
        continue;
      }
      removeStoredJob(record.jobId);
      syncExternalProductOperations();
      return createProductJobActionResult(result.data, {
        expectedOperationType: record.operationType,
      });
    }

    if (result?.status === 404) {
      removeStoredJob(record.jobId);
      syncExternalProductOperations();
      return {
        success: false,
        status: result.status,
        data: {
          ...(result.data && typeof result.data === "object" ? result.data : {}),
          code: result.data?.code ?? "JOB_NOT_FOUND",
          message:
            result.data?.message ??
            "The operation job could not be found. Its final result is unavailable.",
        },
      };
    }

    // A transient network, authentication or server error must not unlock the
    // product while the backend job may still be running. Keep the persisted
    // operation and retry with a bounded backoff.
    pollDelayMs = Math.min(
      pollDelayMs > 0 ? pollDelayMs * 2 : POLL_INTERVAL_MS,
      MAX_POLL_INTERVAL_MS
    );
  }
}

function announceRestoredTerminal(record, result) {
  const dedupeKey = `product-job:${record.jobId}:terminal`;
  if (result.success) {
    const warning = result.data?.warning;
    if (warning) {
      noticeWarning(
        `${createProductJobCompletionTitle(record, result.data)} with a warning`,
        warning.message,
        { dedupeKey }
      );
      return;
    }

    noticeSuccess(createProductJobCompletionTitle(record, result.data), result.data?.message, {
      dedupeKey,
    });
    return;
  }
  noticeError(
    createProductJobCompletionTitle(record, result.data),
    getProductJobFailureMessage(result.data),
    { dedupeKey }
  );
}

async function invokeRestoredTerminalHandler(result, record) {
  if (typeof restoredTerminalHandler !== "function") {
    return;
  }

  try {
    await restoredTerminalHandler(result, record);
  } catch (error) {
    console.error("Failed to handle restored product job completion.", error);
  }
}

function syncExternalProductOperations() {
  const records = getStoredProductJobs();
  const grouped = new Map();

  for (const record of records) {
    const key = normalizeDatasetKey(record.datasetName);
    const group = grouped.get(key) ?? {
      datasetName: record.datasetName,
      records: [],
    };

    group.records.push(record);
    grouped.set(key, group);
  }

  const nextDatasetNames = new Set(grouped.keys());
  for (const [key, group] of grouped.entries()) {
    replaceExternalProductOperations(
      group.datasetName,
      group.records.map(createExternalProductOperation)
    );
    syncedDatasetNames.add(key);
  }

  for (const key of [...syncedDatasetNames]) {
    if (nextDatasetNames.has(key)) {
      continue;
    }

    clearExternalProductOperations(key);
    syncedDatasetNames.delete(key);
  }
}

function createExternalProductOperation(record) {
  const sendOperation = isSendToIcEncOperation(record.operationType);
  const rollbackOperation = isRollbackOperation(record.operationType);

  return {
    id: record.jobId,
    operationId: record.jobId,
    datasetName: record.datasetName,
    type: sendOperation
      ? PRODUCT_OPERATION_TYPE.SEND
      : rollbackOperation
        ? PRODUCT_OPERATION_TYPE.ROLLBACK
        : PRODUCT_OPERATION_TYPE.EXPORT,
    label: record.label,
    source: "backend",
    startedAt: record.createdAt,
    exportTarget: record.exportTarget,
    exportType: sendOperation || rollbackOperation ? null : "Edition",
    status: record.status ?? null,
  };
}

function getStoredProductJobs() {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeStoredProductJob).filter(Boolean);
  } catch {
    return [];
  }
}

function upsertStoredJob(record) {
  const records = getStoredProductJobs().filter((candidate) => candidate.jobId !== record.jobId);
  records.push(record);
  writeStoredProductJobsIfChanged(records);
}

function removeStoredJob(jobId) {
  const records = getStoredProductJobs().filter((record) => record.jobId !== jobId);
  writeStoredProductJobsIfChanged(records);
}

function writeStoredProductJobsIfChanged(records) {
  const currentRecords = getStoredProductJobs();
  if (areStoredJobListsEqual(currentRecords, records)) {
    return false;
  }

  writeStoredProductJobs(records);
  return true;
}

function writeStoredProductJobs(records) {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(records));
    publishStoredJobsChanged();
  } catch (error) {
    console.error("Failed to persist active product jobs.", error);
  }
}

function areStoredJobListsEqual(left, right) {
  const normalize = (records) =>
    [...records]
      .sort((a, b) => String(a.jobId).localeCompare(String(b.jobId)))
      .map((record) => JSON.stringify(record));

  const leftValues = normalize(left);
  const rightValues = normalize(right);
  return (
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index])
  );
}

function isWithinRemoteDiscoveryGrace(record, now) {
  const createdAt = Date.parse(record?.createdAt ?? "");
  return Number.isFinite(createdAt) && now - createdAt < REMOTE_DISCOVERY_GRACE_MS;
}

function releaseRemoteWatch(normalizedDatasetName) {
  const watch = activeRemoteWatches.get(normalizedDatasetName);
  if (!watch) {
    return;
  }
  watch.refCount -= 1;
  if (watch.refCount > 0) {
    return;
  }

  if (watch.intervalId !== null && typeof globalThis.clearInterval === "function") {
    globalThis.clearInterval(watch.intervalId);
  }

  activeRemoteWatches.delete(normalizedDatasetName);
}

function registerCrossTabSync() {
  registerStorageListener();
  registerBroadcastChannel();
  registerWindowReconciliation();
  registerReconcileInterval();
}

function registerStorageListener() {
  if (typeof window === "undefined") {
    return;
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) {
      return;
    }

    reconcileStoredProductJobs();
  });
}

function registerBroadcastChannel() {
  if (typeof globalThis.BroadcastChannel !== "function") {
    return;
  }
  try {
    syncChannel = new globalThis.BroadcastChannel(SYNC_CHANNEL_NAME);
    syncChannel.addEventListener("message", (event) => {
      if (event.data?.type !== "stored-product-jobs-changed") {
        return;
      }

      reconcileStoredProductJobs();
    });
  } catch (error) {
    syncChannel = null;
    console.warn("Product job BroadcastChannel could not be initialized.", error);
  }
}

function registerWindowReconciliation() {
  if (typeof window !== "undefined") {
    window.addEventListener("focus", () => {
      reconcileStoredProductJobs();
      reconcileRemoteWatchedJobs();
    });
    window.addEventListener("pageshow", () => {
      reconcileStoredProductJobs();
      reconcileRemoteWatchedJobs();
    });
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        reconcileStoredProductJobs();
        reconcileRemoteWatchedJobs();
      }
    });
  }
}

function registerReconcileInterval() {
  if (reconcileIntervalId !== null || typeof globalThis.setInterval !== "function") {
    return;
  }

  reconcileIntervalId = globalThis.setInterval(reconcileStoredProductJobs, RECONCILE_INTERVAL_MS);
}

function publishStoredJobsChanged() {
  try {
    syncChannel?.postMessage({ type: "stored-product-jobs-changed" });
  } catch (error) {
    console.warn("Product job cross-tab update could not be broadcast.", error);
  }
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeDatasetKey(datasetName) {
  return String(datasetName ?? "")
    .trim()
    .toLowerCase();
}

function delay(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

export const PRODUCT_JOB_SERVICE_INTERNALS = Object.freeze({
  STORAGE_KEY,
  SYNC_CHANNEL_NAME,
  POLL_INTERVAL_MS,
  MAX_POLL_INTERVAL_MS,
  RECONCILE_INTERVAL_MS,
  REMOTE_RECONCILE_INTERVAL_MS,
  REMOTE_DISCOVERY_GRACE_MS,
});
