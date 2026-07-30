import { apiGet } from "../../../shared/api/apiClient.js";
import {
  PRODUCT_HISTORY_EVENT_TYPE,
  PRODUCT_HISTORY_SOURCE,
  normalizeProductHistoryResponse,
} from "../model/productHistoryTypes.js";
import { getStatusName, isFrozenStatus } from "../../data/stores/statusStore.js";

const PRODUCT_HISTORY_ENDPOINT = "electronicproducts";

export async function fetchProductHistory(datasetName) {
  const normalizedDatasetName = normalizeDatasetName(datasetName);

  if (!normalizedDatasetName) {
    throw new Error("datasetName is required to fetch product history.");
  }

  const payload = await apiGet(
    `${PRODUCT_HISTORY_ENDPOINT}/${encodeURIComponent(normalizedDatasetName)}/history`,
    `Product history request failed for ${normalizedDatasetName}`
  );

  return normalizeProductHistoryResponse(
    normalizeBackendProductHistory(payload, normalizedDatasetName)
  );
}

function normalizeBackendProductHistory(payload, requestedDatasetName) {
  const records = getHistoryRecords(payload);
  const datasetName =
    records
      .map((record) => normalizeDatasetName(readFirstDefined(record, ["Name", "name"])))
      .find(Boolean) ?? requestedDatasetName;

  return {
    endpointAvailable: true,
    datasetName,
    source: PRODUCT_HISTORY_SOURCE.BACKEND,
    generatedAt: readFirstDefined(payload, ["Timestamp", "timestamp"]) ?? new Date().toISOString(),
    warnings: [],
    events: records.map((record, index) =>
      normalizeBackendHistoryRecord(record, {
        index,
        datasetName,
        previousRecord: records[index + 1] ?? null,
      })
    ),
  };
}

function normalizeBackendHistoryRecord(record, { index, datasetName, previousRecord }) {
  const status = readFirstDefined(record, ["Status", "status"]);
  const previousStatus = readFirstDefined(previousRecord, ["Status", "status"]);
  const from = readFirstDefined(record, ["From", "from"]);
  const to = readFirstDefined(record, ["To", "to"]);
  const owner = readFirstDefined(record, ["Owner", "owner"]);
  const edition = readFirstDefined(record, ["Edition", "edition"]);
  const previousEdition = readFirstDefined(previousRecord, ["Edition", "edition"]);
  const update = readFirstDefined(record, ["Update", "update"]);
  const previousUpdate = readFirstDefined(previousRecord, ["Update", "update"]);
  const change = createProductHistoryChange({
    status,
    previousStatus,
    edition,
    previousEdition,
    update,
    previousUpdate,
  });
  const isCurrent = isOpenEndedHistoryDate(to);

  return {
    id: createHistoryEventId({
      datasetName,
      status,
      from,
      to,
      index,
    }),
    type: change.type,
    timestamp: from,
    title: change.title,
    description: change.description,
    actor: normalizeText(owner),
    source: "Backend",
    details: [
      ...createStatusDetails({
        statusLabel: change.statusLabel,
        previousStatusLabel: change.previousStatusLabel,
        hasPreviousStatus: previousStatus !== undefined && previousStatus !== null,
      }),
      ...createValueDetails({
        label: "Edition",
        value: edition,
        previousValue: previousEdition,
      }),
      ...createValueDetails({
        label: "Update",
        value: update,
        previousValue: previousUpdate,
      }),
      {
        label: "From",
        value: formatHistoryDate(from),
      },
      {
        label: "To",
        value: isCurrent ? "Present" : formatHistoryDate(to),
      },
      {
        label: "Owner",
        value: owner,
      },
    ].filter((detail) => hasDisplayableValue(detail.value)),
  };
}

function createProductHistoryChange({
  status,
  previousStatus,
  edition,
  previousEdition,
  update,
  previousUpdate,
}) {
  const statusChange = createStatusChange(status, previousStatus);
  const valueChanges = createValueChanges([
    {
      label: "Edition",
      value: edition,
      previousValue: previousEdition,
    },
    {
      label: "Update",
      value: update,
      previousValue: previousUpdate,
    },
  ]);

  if (previousStatus === undefined || previousStatus === null) {
    return statusChange;
  }

  if (String(status) !== String(previousStatus)) {
    return {
      ...statusChange,
      description: joinDescriptionParts([
        statusChange.description,
        ...valueChanges.map((change) => change.description),
      ]),
    };
  }

  if (valueChanges.length > 0) {
    const direction = getValueChangeDirection(valueChanges);

    return {
      type: getValueChangeEventType(direction),
      title: getValueChangeTitle(direction),
      description: valueChanges.map((change) => change.description).join(" "),
      statusLabel: statusChange.statusLabel,
      previousStatusLabel: statusChange.previousStatusLabel,
    };
  }

  return statusChange;
}

function createStatusChange(status, previousStatus) {
  const statusLabel = formatStatus(status);
  const previousStatusLabel = previousStatus === undefined ? null : formatStatus(previousStatus);

  if (previousStatus === undefined || previousStatus === null) {
    return {
      type: PRODUCT_HISTORY_EVENT_TYPE.STATUS,
      title: `Initial status: ${statusLabel}`,
      description: `The product history starts in status ${statusLabel}.`,
      statusLabel,
      previousStatusLabel,
    };
  }

  const wasFrozen = isFrozenStatus(previousStatus);
  const isFrozen = isFrozenStatus(status);

  if (!wasFrozen && isFrozen) {
    return {
      type: PRODUCT_HISTORY_EVENT_TYPE.FREEZE,
      title: "Product frozen",
      description: `The product changed from ${previousStatusLabel} to ${statusLabel}.`,
      statusLabel,
      previousStatusLabel,
    };
  }

  if (wasFrozen && !isFrozen) {
    return {
      type: PRODUCT_HISTORY_EVENT_TYPE.UNFREEZE,
      title: "Product unfrozen",
      description: `The product changed from ${previousStatusLabel} to ${statusLabel}.`,
      statusLabel,
      previousStatusLabel,
    };
  }

  if (String(status) !== String(previousStatus)) {
    return {
      type: PRODUCT_HISTORY_EVENT_TYPE.STATUS,
      title: `Status changed to ${statusLabel}`,
      description: `The product changed from ${previousStatusLabel} to ${statusLabel}.`,
      statusLabel,
      previousStatusLabel,
    };
  }

  return {
    type: PRODUCT_HISTORY_EVENT_TYPE.STATUS,
    title: `Status: ${statusLabel}`,
    description: `The product remained in status ${statusLabel}.`,
    statusLabel,
    previousStatusLabel,
  };
}

function createValueChanges(fields) {
  return fields
    .filter(({ value, previousValue }) => {
      return (
        hasComparableValue(value) &&
        hasComparableValue(previousValue) &&
        !areEqualHistoryValues(value, previousValue)
      );
    })
    .map(({ label, value, previousValue }) => ({
      label,
      value,
      previousValue,
      direction: getNumericDirection(previousValue, value),
      description: `${label} changed from ${formatHistoryValue(previousValue)} to ${formatHistoryValue(value)}.`,
    }));
}

function createStatusDetails({ statusLabel, previousStatusLabel, hasPreviousStatus }) {
  if (!hasPreviousStatus) {
    return [
      {
        label: "Status",
        value: statusLabel,
      },
    ];
  }

  return [
    {
      label: "Previous status",
      value: previousStatusLabel,
    },
    {
      label: "New status",
      value: statusLabel,
    },
  ];
}

function createValueDetails({ label, value, previousValue }) {
  if (hasComparableValue(previousValue) && !areEqualHistoryValues(value, previousValue)) {
    return [
      {
        label: `Previous ${label.toLowerCase()}`,
        value: previousValue,
      },
      {
        label: `New ${label.toLowerCase()}`,
        value,
      },
    ];
  }

  return [
    {
      label,
      value,
    },
  ];
}

function getValueChangeDirection(changes) {
  if (changes.some((change) => change.direction === "decrease")) {
    return "decrease";
  }

  if (changes.some((change) => change.direction === "increase")) {
    return "increase";
  }

  return "change";
}

function getValueChangeEventType(direction) {
  if (direction === "decrease") {
    return PRODUCT_HISTORY_EVENT_TYPE.ROLLBACK;
  }

  if (direction === "increase") {
    return PRODUCT_HISTORY_EVENT_TYPE.EXPORT;
  }

  return PRODUCT_HISTORY_EVENT_TYPE.STATUS;
}

function getValueChangeTitle(direction) {
  if (direction === "decrease") {
    return "Product version decreased";
  }

  if (direction === "increase") {
    return "Product version increased";
  }

  return "Product version changed";
}

function getNumericDirection(previousValue, value) {
  const previousNumber = Number(previousValue);
  const number = Number(value);

  if (!Number.isFinite(previousNumber) || !Number.isFinite(number)) {
    return "change";
  }

  if (number < previousNumber) {
    return "decrease";
  }

  if (number > previousNumber) {
    return "increase";
  }

  return "change";
}

function getHistoryRecords(payload) {
  const data = payload?.Data ?? payload?.data ?? payload;

  if (Array.isArray(data)) {
    return data.filter((record) => record && typeof record === "object");
  }

  return [];
}

function createHistoryEventId({ datasetName, status, from, to, index }) {
  return [
    normalizeDatasetName(datasetName) ?? "product",
    normalizeText(status) ?? "status",
    normalizeText(from) ?? "unknown-from",
    normalizeText(to) ?? "unknown-to",
    index,
  ].join(":");
}

function formatStatus(status) {
  if (status === null || status === undefined || status === "") {
    return "Unknown";
  }

  return String(getStatusName(status) ?? status);
}

function formatHistoryDate(value) {
  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatHistoryValue(value) {
  return normalizeText(value) ?? "Unknown";
}

function isOpenEndedHistoryDate(value) {
  const text = normalizeText(value);

  if (!text) {
    return true;
  }

  return text.startsWith("9999-12-31");
}

function readFirstDefined(source, keys) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (Object.hasOwn(source, key) && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return undefined;
}

function normalizeDatasetName(datasetName) {
  const normalizedDatasetName = String(datasetName ?? "").trim();

  return normalizedDatasetName || null;
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  return text.length > 0 ? text : null;
}

function hasDisplayableValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function hasComparableValue(value) {
  return value !== null && value !== undefined;
}

function areEqualHistoryValues(left, right) {
  return String(left) === String(right);
}

function joinDescriptionParts(parts) {
  return parts.filter(Boolean).join(" ");
}
