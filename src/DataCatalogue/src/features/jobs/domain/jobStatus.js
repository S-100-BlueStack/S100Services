export const JOB_STATUS = Object.freeze({
  TODO: "todo",
  IN_PROGRESS: "inProgress", // Legacy mock input; not an actionable status.
  DONE: "done",
  NO_UPDATE: "noUpdate",
});

export const JOB_STATUS_OPTIONS = Object.freeze([
  { value: JOB_STATUS.DONE, label: "Done" },
  { value: JOB_STATUS.NO_UPDATE, label: "No update" },
]);

const VALID_STATUSES = new Set(Object.values(JOB_STATUS));
const TERMINAL_STATUSES = new Set([JOB_STATUS.DONE, JOB_STATUS.NO_UPDATE]);

export function normalizeJobStatus(value) {
  return VALID_STATUSES.has(value) ? value : JOB_STATUS.TODO;
}

export function getJobStatusLabel(value) {
  return JOB_STATUS_OPTIONS.find((item) => item.value === value)?.label ?? "Open";
}

export function isActiveJobStatus(value) {
  return !TERMINAL_STATUSES.has(value);
}

export function isCompletedJobStatus(value) {
  return TERMINAL_STATUSES.has(value);
}
