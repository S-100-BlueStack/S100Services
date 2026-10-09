import { resolveProductContext } from "../../products/domain/productContext.js";
import { normalizeElectronicProductStatus } from "../../dataSources/domain/electronicProductStatus.js";

export const PACKAGE_ACTION_UNAVAILABLE =
  "Package actions are not yet connected. Workflow state and action eligibility are unavailable.";

/**
 * Popup-owned presentation only. workflowPresentation is an optional application
 * projection for F7B to map after contract review, never a live DTO or Graphic field.
 * Dispatch stays disabled even for verified presentation fixtures.
 */
export function createPackagePopupPresentation({
  productContext,
  graphic = productContext?.graphic,
  attributes = {},
  workflowPresentation,
  workflowStatusLabels = {},
} = {}) {
  if (!isCurrentPackagePopupContext(productContext, attributes, graphic)) return null;

  const projection = validateWorkflowPresentation(workflowPresentation, productContext, attributes);
  const paused = projection?.paused;
  const pauseOperation = paused === true ? "resume" : "pause";
  const eligible = projection?.eligibleMembers;
  const primaryOperation = projection?.primaryAction === "accept" ? "accept" : "send";
  const primaryLabel =
    primaryOperation === "accept"
      ? "Accept"
      : eligible?.length
        ? `Send (${eligible.length})`
        : "Send";
  const workflowStatus = normalizeElectronicProductStatus(
    attributes.workUnitStatus?.workflowStatus
  );
  const workflowLabel = workflowStatus === undefined ? null : workflowStatusLabels[workflowStatus];

  const action = (id, operation, label, icon, helpText) => ({
    id,
    operation,
    label,
    icon,
    helpText,
    ariaLabel: label,
    controlKind: "unavailable-package",
    textEnabled: false,
    disabled: true,
    disabledReason: `${helpText} ${PACKAGE_ACTION_UNAVAILABLE}`,
    loading: false,
    availability: {
      frontendSupported: true,
      backendAuthorized:
        typeof projection?.actionEligibility?.[operation] === "boolean"
          ? projection.actionEligibility[operation]
          : null,
      // No input flag can install a package dispatcher in F7A.
      dispatchImplemented: false,
    },
    className: "popup-action-bar__action--package",
  });

  return {
    actions: [
      action(
        "package-pause-resume",
        pauseOperation,
        paused === true ? "Resume" : "Pause",
        paused === true ? "play" : "pause",
        paused === undefined
          ? "Actual Pause state is unavailable until package workflow integration is connected."
          : "Pause affects delivery only; detection, generation and validation may continue."
      ),
      action(
        "package-discard-export",
        "discard",
        "Discard",
        "x-circle",
        "Discard both package candidates before sending. This is not Product Cancel Export."
      ),
      action(
        "package-send-accept",
        primaryOperation,
        primaryLabel,
        primaryOperation === "accept" ? "check" : "send",
        primaryOperation === "accept"
          ? "Acknowledge workflow results and allow completion; this does not approve a failed product."
          : eligible?.length
            ? `Delivery includes: ${eligible.map((member) => member.datasetName).join(", ")}.`
            : "The products eligible for delivery have not been verified."
      ),
    ],
    explanation: PACKAGE_ACTION_UNAVAILABLE,
    summary: {
      workflowText:
        typeof workflowLabel === "string" && workflowLabel.trim()
          ? `Package workflow: ${workflowLabel}`
          : "Package workflow status unavailable.",
      unavailableText: "Package actions not yet connected.",
      pausedText:
        typeof paused === "boolean"
          ? paused
            ? "Delivery paused; internal processing may continue."
            : "Delivery is not paused."
          : null,
      scheduledSendAt: projection?.scheduledSendAt ?? null,
      outcomeText: projection?.outcomeText ?? null,
    },
  };
}

export function isCurrentPackagePopupContext(context, attributes = {}, graphic = context?.graphic) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return false;
  const statusMembers = attributes.workUnitStatus?.members;
  if (statusMembers !== undefined && !Array.isArray(statusMembers)) return false;
  const layer = graphic?.layer;
  const source = layer?.appSourceDefinition;
  const unit = context?.workUnit;
  if (
    unit?.kind !== "package" ||
    source?.workUnit?.kind !== "package" ||
    source.id !== context.sourceId ||
    layer.visible === false ||
    graphic.visible === false ||
    JSON.stringify(source.workUnit) !== JSON.stringify(unit)
  ) {
    return false;
  }
  const current = resolveProductContext({ graphic });
  const graphics = layer.graphics?.toArray?.() ?? layer.graphics;
  if (
    !current ||
    current.identityKey !== context.identityKey ||
    current.datasetName !== context.datasetName ||
    current.productType !== context.productType ||
    (graphics && !Array.from(graphics).includes(graphic)) ||
    !Array.isArray(unit.members) ||
    !unit.members.length ||
    unit.members[0]?.key !== unit.primaryMemberKey ||
    unit.members[0]?.sourceId !== context.sourceId ||
    unit.members.some((member) => !member.key || !member.sourceId || !member.exportStandard) ||
    new Set(unit.members.map((member) => member.key)).size !== unit.members.length ||
    new Set(unit.members.map((member) => member.sourceId)).size !== unit.members.length
  ) {
    return false;
  }
  for (const field of [
    "sourceId",
    "productKey",
    "productIdentityKey",
    "productType",
    "datasetName",
  ]) {
    const expected = field === "productIdentityKey" ? context.identityKey : context[field];
    if (Object.hasOwn(attributes, field) && attributes[field] !== expected) return false;
  }

  const names = new Set();
  for (const member of unit.members) {
    const metadata = attributes.workUnitMetadata?.members?.[member.key];
    const name = metadata?.datasetName;
    if (name === undefined) continue;
    if (typeof name !== "string" || !name.trim()) return false;
    const normalized = name.trim().toUpperCase();
    if (names.has(normalized)) return false;
    names.add(normalized);
    if (
      (member.key === unit.primaryMemberKey &&
        normalized !== context.datasetName.trim().toUpperCase()) ||
      (member.key !== unit.primaryMemberKey &&
        normalized === context.datasetName.trim().toUpperCase())
    ) {
      return false;
    }
    const statusMember = statusMembers?.find((item) => item.key === member.key);
    if (statusMember?.datasetName && statusMember.datasetName !== name) return false;
  }
  return true;
}

function validateWorkflowPresentation(projection, context, attributes) {
  if (
    projection?.verified !== true ||
    projection.identityKey !== context.identityKey ||
    typeof projection.paused !== "boolean" ||
    !["send", "accept"].includes(projection.primaryAction)
  ) {
    return null;
  }
  let eligibleMembers = null;
  if (Array.isArray(projection.eligibleMembers)) {
    const seen = new Set();
    const valid = projection.eligibleMembers.every((member) => {
      const declared = context.workUnit.members.some((item) => item.key === member?.key);
      const currentName = attributes.workUnitMetadata?.members?.[member?.key]?.datasetName;
      if (!declared || !currentName || member.datasetName !== currentName || seen.has(member.key)) {
        return false;
      }
      seen.add(member.key);
      return true;
    });
    if (!valid) return null;
    eligibleMembers = projection.eligibleMembers;
  }
  const timestamp = projection.scheduledSendAt;
  const scheduledSendAt = isValidSendTimestamp(timestamp) ? timestamp : null;
  return {
    paused: projection.paused,
    primaryAction: projection.primaryAction,
    eligibleMembers,
    actionEligibility: projection.actionEligibility,
    scheduledSendAt,
    outcomeText:
      projection.primaryAction === "accept" && typeof projection.outcomeText === "string"
        ? projection.outcomeText.trim() || null
        : null,
  };
}

function isValidSendTimestamp(value) {
  if (typeof value !== "string") return false;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/
  );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second, offsetHour = "0", offsetMinute = "0"] = match;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return (
    Number(month) >= 1 &&
    Number(month) <= 12 &&
    Number(day) >= 1 &&
    Number(day) <= daysInMonth &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59 &&
    Number(offsetHour) <= 23 &&
    Number(offsetMinute) <= 59
  );
}
