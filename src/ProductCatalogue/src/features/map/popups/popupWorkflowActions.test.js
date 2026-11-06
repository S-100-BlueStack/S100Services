import assert from "node:assert/strict";
import test from "node:test";
import { createPopupWorkflowActions } from "./popupWorkflowActions.js";

const ids = ["package-pause-resume", "package-discard-export", "package-send-accept"];

test("all Product sources receive a single consistent icon-only action definition", () => {
  const ordinary = createPopupWorkflowActions();
  const packaged = createPopupWorkflowActions({ subject: "package" });
  assert.deepEqual(
    ordinary.map((item) => item.id),
    ids
  );
  assert.deepEqual(
    packaged.map((item) => item.id),
    ids
  );
  assert.deepEqual(
    ordinary.map((item) => item.icon),
    packaged.map((item) => item.icon)
  );
  assert.equal(
    ordinary.every((item) => item.disabled && !item.onClick),
    true
  );
  assert.equal(
    ordinary.every((item) => item.textEnabled === false),
    true
  );
  assert.equal(
    ordinary.every((item) => item.availability.dispatchImplemented === false),
    true
  );
  assert.equal(
    ordinary.every((item) => item.controlKind === "unavailable-package"),
    true
  );
});

test("pause and primary slots change in place without changing action identity", () => {
  const defaultActions = createPopupWorkflowActions();
  const changed = createPopupWorkflowActions({ paused: true, primaryAction: "accept" });
  assert.deepEqual(
    changed.map((item) => item.id),
    defaultActions.map((item) => item.id)
  );
  assert.deepEqual(
    changed.map((item) => item.label),
    ["Resume", "Discard", "Accept"]
  );
  assert.deepEqual(
    changed.map((item) => item.icon),
    ["play", "x-circle", "check"]
  );
});

test("trusted backend eligibility is presentation metadata, never permission to dispatch", () => {
  const actions = createPopupWorkflowActions({
    subject: "package",
    actionEligibility: { pause: true, discard: true, send: true },
    eligibleMembers: [{ key: "a" }, { key: "b" }],
  });
  assert.equal(actions[2].label, "Send (2)");
  assert.equal(actions[0].availability.backendAuthorized, true);
  assert.equal(actions[0].disabled, true);
  assert.equal(actions[0].onClick, undefined);
  assert.equal(actions[0].availability.dispatchImplemented, false);
});

test("malformed and unknown primary operations fail closed to Send", () => {
  const actions = createPopupWorkflowActions({ primaryAction: "unknown", actionEligibility: null });
  assert.equal(actions[2].operation, "send");
  assert.equal(actions[2].disabled, true);
  assert.equal(actions[2].availability.backendAuthorized, null);
});
