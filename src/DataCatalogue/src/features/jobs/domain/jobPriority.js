export const JOB_PRIORITY = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
});

export const JOB_PRIORITY_OPTIONS = Object.freeze([
  {
    value: JOB_PRIORITY.LOW,
    label: "Low",
  },
  {
    value: JOB_PRIORITY.MEDIUM,
    label: "Medium",
  },
  {
    value: JOB_PRIORITY.HIGH,
    label: "High",
  },
]);

const JOB_PRIORITY_LABEL_BY_VALUE = new Map(
  JOB_PRIORITY_OPTIONS.map((option) => [option.value, option.label])
);

export function normalizeJobPriority(value) {
  if (JOB_PRIORITY_LABEL_BY_VALUE.has(value)) {
    return value;
  }

  return JOB_PRIORITY.MEDIUM;
}

export function getJobPriorityLabel(value) {
  return JOB_PRIORITY_LABEL_BY_VALUE.get(value) ?? "Medium";
}
