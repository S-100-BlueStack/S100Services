export const JOB_STATUS = Object.freeze({
  TODO: "todo",
  IN_PROGRESS: "inProgress",
  DONE: "done",
});

export const JOB_STATUS_OPTIONS = Object.freeze([
  {
    value: JOB_STATUS.TODO,
    label: "To do",
  },
  {
    value: JOB_STATUS.IN_PROGRESS,
    label: "In Progress",
  },
  {
    value: JOB_STATUS.DONE,
    label: "Done",
  },
]);

const JOB_STATUS_LABEL_BY_VALUE = new Map(
  JOB_STATUS_OPTIONS.map((option) => [option.value, option.label])
);

export function normalizeJobStatus(value) {
  if (JOB_STATUS_LABEL_BY_VALUE.has(value)) {
    return value;
  }

  return JOB_STATUS.TODO;
}

export function getJobStatusLabel(value) {
  return JOB_STATUS_LABEL_BY_VALUE.get(value) ?? "To do";
}

export function isActiveJobStatus(value) {
  return value !== JOB_STATUS.DONE;
}
