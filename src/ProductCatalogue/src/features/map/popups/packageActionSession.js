import { apiRequest } from "../../../shared/api/apiClient.js";
import { getApiResultErrorMessage } from "../../../shared/api/apiResult.js";
import {
  noticeError,
  noticeInfo,
  noticeSuccess,
  noticeWarning,
} from "../../notices/services/noticeService.js";

const REQUEST_TIMEOUT = 15000;
const JOB_POLL_MS = 1000;
const JOB_WAIT_MS = 30000;

// Keep simulated delivery opt-in and unavailable in production builds.
export function isPackageDemoEnabled(env = import.meta.env) {
  return env?.DEV === true && env?.VITE_PACKAGE_DEMO_ENABLED === "true";
}

/** Popup-owned lifecycle. Never writes to a Graphic, a Product store or the map. */
export function createPackageActionSession({
  sourceName,
  identityKey,
  memberNames,
  isCurrent,
  onChange,
  onDiscardSucceeded,
  request = apiRequest,
  notify = { error: noticeError, info: noticeInfo, success: noticeSuccess, warning: noticeWarning },
  wait = (ms, signal) =>
    new Promise((resolve) => {
      const handle = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(handle);
          resolve();
        },
        { once: true }
      );
    }),
  demoEnabled = isPackageDemoEnabled(),
} = {}) {
  let disposed = false;
  let started = false;
  let requestId = 0;
  let busy = false;
  let snapshot = null;
  let simulatedAccept = false;
  let hasDiscarded = false;
  let restrictionCode = null;
  const abort = new AbortController();
  const path = `electronicproducts/packages/${encodeURIComponent(sourceName)}`;

  function current() {
    return !disposed && isCurrent?.() !== false;
  }
  function publish() {
    if (current()) onChange?.();
  }

  function validate(data) {
    const get = (name) => data?.[name] ?? data?.[name[0].toUpperCase() + name.slice(1)];
    const packageId = get("packageId");
    const canonicalSource = get("sourceDatasetName");
    const members = get("eligibleMembers");
    if (
      !/^[0-9a-f-]{36}$/i.test(packageId ?? "") ||
      canonicalSource?.toUpperCase() !== sourceName.toUpperCase() ||
      typeof get("paused") !== "boolean" ||
      !Array.isArray(members)
    )
      return null;
    const eligibleMembers = [];
    const seen = new Set();
    const resolvedMemberNames = typeof memberNames === "function" ? memberNames() : memberNames;
    for (const member of members) {
      const key = member.key ?? member.Key;
      const datasetName = member.datasetName ?? member.DatasetName;
      if (
        !Object.hasOwn(resolvedMemberNames ?? {}, key) ||
        datasetName !== resolvedMemberNames[key] ||
        seen.has(key)
      )
        return null;
      seen.add(key);
      eligibleMembers.push({ key, datasetName });
    }
    return {
      packageId,
      paused: get("paused"),
      controlVersion: get("controlVersion") ?? null,
      canPause: get("canPause") === true,
      canResume: get("canResume") === true,
      canDiscard: get("canDiscard") === true,
      eligibleMembers,
      restrictionCode: ["MEMBER_TRACK_MISSING", "MEMBERS_NOT_READY"].includes(
        get("restrictionCode")
      )
        ? get("restrictionCode")
        : null,
    };
  }

  async function refresh() {
    if (!current() || busy || hasDiscarded) return false;
    const id = ++requestId;
    try {
      const response = await request(`${path}/actions`, {
        method: "GET",
        cache: "no-store",
        signal: abort.signal,
      });
      if (!current() || id !== requestId) return false;
      snapshot = response.success ? validate(response.data) : null;
      restrictionCode =
        snapshot?.restrictionCode ??
        (response.status === 404 ? "PACKAGE_NOT_FOUND" : "PACKAGE_STATE_UNAVAILABLE");
      if (!snapshot) simulatedAccept = false;
      publish();
      return Boolean(snapshot);
    } catch {
      if (!current() || id !== requestId) return false;
      snapshot = null;
      restrictionCode = "PACKAGE_STATE_UNAVAILABLE";
      simulatedAccept = false;
      publish();
      return false;
    }
  }

  async function start() {
    if (started) return;
    started = true;
    await refresh();
  }

  function projection() {
    if (!current()) return null;
    if (!snapshot && !demoEnabled) return null;
    return {
      verified: true,
      liveVerified: Boolean(snapshot),
      identityKey,
      paused: snapshot?.paused ?? false,
      primaryAction: simulatedAccept ? "accept" : "send",
      eligibleMembers: snapshot?.eligibleMembers ?? [],
      restrictionCode,
      actionEligibility: {
        pause: !busy && !simulatedAccept && snapshot?.canPause === true,
        resume: !busy && !simulatedAccept && snapshot?.canResume === true,
        discard: !busy && !simulatedAccept && snapshot?.canDiscard === true,
        send: !busy && demoEnabled && !simulatedAccept && !snapshot?.paused && !hasDiscarded,
        accept: !busy && demoEnabled && simulatedAccept && !hasDiscarded,
      },
    };
  }

  async function invoke(operation) {
    const state = projection();
    if (!state?.actionEligibility?.[operation] || !current()) return false;
    if (operation === "send" || operation === "accept") {
      simulatedAccept = operation === "send";
      notify.info?.(
        operation === "send" ? "Demo: Send" : "Demo: Accept",
        operation === "send"
          ? "Demo only — no products were sent to IC-ENC."
          : "Demo only — no results were acknowledged or committed.",
        { countAsUnread: false, storeInCenter: false }
      );
      publish();
      return true;
    }
    if (!snapshot) return false;
    busy = true;
    requestId++; // A pending read must not overwrite a completed action.
    publish();
    const currentPackageId = snapshot.packageId;
    try {
      const body =
        operation === "discard"
          ? { packageId: currentPackageId }
          : { packageId: currentPackageId, expectedControlVersion: snapshot.controlVersion };
      const result = await request(`${path}/${operation === "discard" ? "discard" : operation}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abort.signal,
        timeoutMs: REQUEST_TIMEOUT,
      });
      if (!current()) return false;
      if (!result.success) {
        notify.error?.(
          "Package action failed",
          getApiResultErrorMessage(result, "The package action was rejected.")
        );
        return false;
      }
      if (operation === "discard") {
        const jobId = result.data?.jobId ?? result.data?.JobId;
        if (!jobId || !(await waitForDiscard(jobId))) return false;
        hasDiscarded = true;
        snapshot = null;
        simulatedAccept = false;
        let detailsRefreshed = true;
        try {
          detailsRefreshed = (await onDiscardSucceeded?.()) !== false;
        } catch {
          detailsRefreshed = false;
        }
        if (!current()) return true;
        notify.success?.("Package discarded", "The package candidates were discarded.");
        if (!detailsRefreshed) {
          notify.warning?.(
            "Package details pending",
            "Product details could not be refreshed. Refresh the map to update the popup."
          );
        }
        globalThis.window?.dispatchEvent?.(new CustomEvent("pc-package-action-refresh"));
        return true;
      }
      const responseId = result.data?.packageId ?? result.data?.PackageId;
      const paused = result.data?.paused ?? result.data?.Paused;
      const version = result.data?.controlVersion ?? result.data?.ControlVersion;
      if (responseId !== currentPackageId || typeof paused !== "boolean") return false;
      snapshot = {
        ...snapshot,
        paused,
        controlVersion: version ?? null,
        canPause: !paused,
        canResume: paused,
      };
      notify.success?.(
        paused ? "Package paused" : "Package resumed",
        paused ? "Delivery is paused; internal processing may continue." : "Delivery pause removed."
      );
      return true;
    } catch {
      if (current())
        notify.error?.("Package action failed", "The package action could not be completed.");
      return false;
    } finally {
      busy = false;
      publish();
    }
  }

  async function waitForDiscard(jobId) {
    for (let elapsed = 0; elapsed <= JOB_WAIT_MS; elapsed += JOB_POLL_MS) {
      if (!current()) return false;
      const response = await request(
        `electronicproducts/packages/discard-jobs/${encodeURIComponent(jobId)}`,
        {
          method: "GET",
          cache: "no-store",
          signal: abort.signal,
          timeoutMs: REQUEST_TIMEOUT,
        }
      );
      if (!current()) return false;
      if (!response.success) {
        notify.warning?.("Discard status unavailable", "Check the Worker before retrying Discard.");
        return false;
      }
      const status = response.data?.status ?? response.data?.Status;
      if (status === "Succeeded") return true;
      if (status === "Failed" || status === "Cancelled") {
        notify.error?.(
          "Package discard failed",
          "The Worker could not discard the package. Refresh before retrying."
        );
        return false;
      }
      if (elapsed < JOB_WAIT_MS) await wait(JOB_POLL_MS, abort.signal);
    }
    notify.warning?.(
      "Discard still processing",
      "The Worker has not confirmed completion. Check the package before retrying."
    );
    return false;
  }

  function destroy() {
    disposed = true;
    requestId++;
    abort.abort();
    snapshot = null;
  }

  return { start, refresh, projection, invoke, destroy };
}
