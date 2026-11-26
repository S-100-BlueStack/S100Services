import test from "node:test";
import assert from "node:assert/strict";
import { createAssignmentSession } from "../state/createAssignmentSession.js";
import { createLiveAssignmentServices } from "./liveAssignmentServices.js";
import { createJobStore } from "../../jobs/state/jobStore.js";

function setup({ bindings = [], discarded = false } = {}) {
  const calls = [];
  const events = [];
  const active = new Set(bindings);
  const control = { discarded, failure: null, later: null, attempted: [], hold: null };
  const store = createJobStore({
    service: {
      loadJobs({ freshWorkspaceCatalogue }) {
        calls.push(freshWorkspaceCatalogue ? "fresh-overview" : "load-jobs");
        return Promise.resolve({ ok: true, data: { jobs: [] } });
      },
    },
  });
  const returns = async () => {
    if (store.hasPendingMembershipRefresh()) await store.loadJobs({ cancelOnLeave: true });
  };
  const status = () => (control.discarded ? "discarded" : active.size ? "assigned" : "notAssigned");
  const methods = {
    async package(id) {
      calls.push("package");
      return { id, assignmentStatus: status(), pipelineIds: [...active] };
    },
    async packages(query) {
      calls.push(["list", query.assignmentStatus]);
      return { items: [{ id: "pkg", assignmentStatus: "discarded", status: "Discarded" }] };
    },
    async bindings() {
      calls.push("bindings");
      return [...active].map((pipelineId) => ({ pipelineId, id: pipelineId, workspaces: [] }));
    },
    async packageComments() {
      calls.push("package-comments");
      return { items: [], nextBefore: null };
    },
    async packageHistory() {
      calls.push("history");
      return { items: [...events], nextBefore: null };
    },
    async savePackageOperation(_id, operation) {
      calls.push(operation.kind);
      control.attempted.push({ ...operation });
      if (control.hold) await control.hold;
      if (operation.kind === "discardReason" && active.size) throw new Error("Active binding");
      const event = {
        operationId: operation.id,
        eventType: {
          discardReason: "packageDiscarded",
          reopen: "packageReopened",
        }[operation.kind],
        commentText: operation.kind === "reopen" ? null : operation.text.trim(),
      };
      if (!events.some((item) => item.operationId === operation.id)) events.unshift(event);
      control.discarded = operation.kind === "discardReason";
      control.afterDecision?.();
      if (control.failure === operation.kind) {
        events.shift();
        control.later = event;
        if (control.noCommit) control.discarded = false;
        throw new Error("Lost write response");
      }
    },
    async bind(_id, pipelineId) {
      calls.push(`bind:${pipelineId}`);
      if (control.discarded || control.failure === "bind") {
        throw Object.assign(new Error("Rejected bind"), { status: 409 });
      }
      active.add(pipelineId);
    },
    async unbind(pipelineId) {
      calls.push(`unbind:${pipelineId}`);
      if (control.failure === pipelineId)
        throw Object.assign(new Error("Rejected unbind"), { status: 409 });
      active.delete(pipelineId);
    },
  };
  const services = createLiveAssignmentServices(methods, {
    onMembershipInvalidated: store.invalidateMembership,
    onCommentsInvalidated: () => calls.push("binding-availability"),
  });
  return {
    active,
    calls,
    control,
    events,
    session: createAssignmentSession({ services }),
    services,
    returns,
  };
}

test("Direct Discard and Reopen do not refresh Main Map or set binding Save feedback", async (t) => {
  const { calls, events, session, returns } = setup();
  await session.select("pkg");
  assert.deepEqual(calls, ["package", "bindings"]);
  for (const invalid of ["", "  \t ", "x".repeat(4001)]) {
    assert.equal(await session.changePackageDecision("discardReason", invalid), false);
  }
  assert.equal(await session.changePackageDecision("discardReason", " New reason "), true);
  assert.equal(session.snapshot().record.assignmentStatus, "discarded");
  assert.equal(session.snapshot().saveConfirmed, false);
  await returns();
  assert.equal(await session.changePackageDecision("reopen"), true);
  await returns();
  assert.equal(session.snapshot().record.assignmentStatus, "notAssigned");
  assert.equal(events.filter((event) => event.eventType === "packageDiscarded").length, 1);
  assert.equal(
    events.find((item) => item.eventType === "packageDiscarded").commentText,
    "New reason"
  );
  assert.deepEqual(
    calls.filter((call) => call === "fresh-overview" || call === "binding-availability"),
    []
  );
  t.diagnostic(
    `Assignment traffic: ${calls.join(", ")}. Main Map refresh and binding availability: 0.`
  );
});

test("Discard never sends an implicit unbind or proceeds after partial explicit removal", async () => {
  const { active, calls, control, session } = setup({ bindings: ["enc", "paper"] });
  await session.select("pkg");
  assert.equal(await session.changePackageDecision("discardReason", "Reason"), false);
  session.setAssigned("enc", false);
  session.setAssigned("paper", false);
  assert.equal(await session.changePackageDecision("discardReason", "Reason"), false);
  assert.equal(
    calls.some((call) => call.startsWith("unbind:")),
    false
  );
  control.failure = "paper";
  assert.equal(await session.save(), false);
  assert.deepEqual([...active], ["paper"]);
  assert.equal(await session.changePackageDecision("discardReason", "Reason"), false);
  assert.equal(calls.includes("discardReason"), false);
  assert.equal(session.snapshot().saveConfirmed, false);
});

test("Selecting a Workstream for Discarded confirms Reopen before bind and preserves partial failure", async (t) => {
  const { active, calls, control, session, returns } = setup({ discarded: true });
  await session.select("pkg");
  session.setAssigned("enc", true);
  assert.equal(session.snapshot().draft.decision.kind, "reopen");
  control.failure = "bind";
  assert.equal(await session.save(), false);
  assert.equal(session.snapshot().record.assignmentStatus, "notAssigned");
  assert.equal(session.snapshot().draft.decision, undefined);
  assert.deepEqual(session.snapshot().draft.activeIds, ["enc"]);
  assert.equal(session.snapshot().saveConfirmed, false);
  const reopen = calls.indexOf("reopen");
  assert.ok(
    reopen < calls.indexOf("history") && calls.indexOf("history") < calls.indexOf("bind:enc")
  );

  control.failure = null;
  assert.equal(await session.save(), true);
  assert.deepEqual([...active], ["enc"]);
  assert.equal(session.snapshot().record.assignmentStatus, "assigned");
  await returns();
  await returns();
  assert.equal(calls.filter((call) => call === "fresh-overview").length, 1);
  assert.equal(calls.includes("binding-availability"), false);
  t.diagnostic(
    "Reopen and binding Save: one coalesced membership generation, zero binding comment notifications."
  );
});

test("Lost Discard response retains the exact reason and operation through read-only recovery", async () => {
  const { calls, events, control, session } = setup();
  await session.select("pkg");
  control.failure = "discardReason";
  assert.equal(
    await session.changePackageDecision("discardReason", "Reason retained on timeout"),
    false
  );
  assert.equal(session.snapshot().pendingDecision.id, control.attempted[0].id);
  assert.equal(session.snapshot().pendingDecision.awaitingConfirmation, true);
  assert.equal(session.snapshot().reconciliationRequired, true);
  assert.equal(session.snapshot().saveConfirmed, false);
  events.unshift(control.later);
  assert.equal(await session.reconcile(), true);
  assert.equal(session.snapshot().record.assignmentStatus, "discarded");
  assert.equal(session.snapshot().draft.decision, undefined);
  assert.equal(session.snapshot().saveConfirmed, false);
  assert.equal(calls.filter((call) => call === "discardReason").length, 1);
});

test("Discarded list uses the authoritative status filter with no per-row read", async () => {
  const { calls, services } = setup();
  const result = await services.features.search({ status: "Discarded" });
  assert.equal(result.items[0].status, "Discarded");
  assert.deepEqual(calls, [["list", "discarded"]]);
});

test("A direct Discard follows a separate confirmed unbind Save and each cycle needs a fresh reason", async () => {
  const { calls, events, session, active } = setup({ bindings: ["enc"] });
  await session.select("pkg");
  session.setAssigned("enc", false);
  assert.equal(await session.save(), true);
  assert.equal(session.snapshot().saveConfirmed, true);
  assert.equal(await session.changePackageDecision("discardReason", "Explicitly removed"), true);
  assert.deepEqual([...active], []);
  assert.ok(calls.indexOf("unbind:enc") < calls.indexOf("discardReason"));
  assert.equal(session.snapshot().saveConfirmed, false);
  assert.equal(await session.changePackageDecision("reopen"), true);
  assert.equal(await session.changePackageDecision("discardReason"), false);
  assert.equal(await session.changePackageDecision("discardReason", "Different reason"), true);
  assert.deepEqual(
    events.filter((item) => item.eventType === "packageDiscarded").map((item) => item.commentText),
    ["Different reason", "Explicitly removed"]
  );
});

test("A read-only check permits a retry with the same UUID and original text", async () => {
  const { session, control, calls } = setup();
  await session.select("pkg");
  control.failure = "discardReason";
  control.noCommit = true;
  assert.equal(await session.changePackageDecision("discardReason", "Exact reason"), false);
  assert.equal(await session.reconcile(), true);
  assert.equal(calls.filter((call) => call === "discardReason").length, 1);
  control.failure = null;
  assert.equal(await session.changePackageDecision("discardReason", "Ignored replacement"), true);
  assert.equal(control.attempted[0].id, control.attempted[1].id);
  assert.equal(control.attempted[1].text, "Exact reason");
});

test("An in-flight decision blocks duplicate actions and selection and cannot publish after disposal", async () => {
  const { session, control, calls } = setup();
  await session.select("pkg");
  let release;
  control.hold = new Promise((resolve) => {
    release = resolve;
  });
  const saving = session.changePackageDecision("discardReason", "Reason");
  await new Promise(setImmediate);
  assert.equal(session.snapshot().saving, true);
  assert.equal(await session.changePackageDecision("discardReason", "Duplicate"), false);
  assert.equal(await session.select("other"), false);
  session.destroy();
  release();
  assert.equal(await saving, false);
  assert.equal(calls.filter((call) => call === "discardReason").length, 1);
  assert.equal(session.snapshot().record.assignmentStatus, "notAssigned");
});

test("An acknowledged historical decision with a later current status does not report success", async () => {
  const { session, control, events } = setup();
  await session.select("pkg");
  control.afterDecision = () => {
    control.discarded = false;
  };
  assert.equal(await session.changePackageDecision("discardReason", "Reason"), false);
  assert.equal(events.filter((item) => item.eventType === "packageDiscarded").length, 1);
  assert.equal(session.snapshot().record.assignmentStatus, "notAssigned");
  assert.equal(session.snapshot().saveConfirmed, false);
  assert.match(session.snapshot().error, /since changed/);
});

test("A concurrent binding becomes saved context without staging an unbind", async () => {
  const { session, active, calls } = setup();
  await session.select("pkg");
  active.add("external");
  assert.equal(await session.changePackageDecision("discardReason", "Reason"), false);
  assert.deepEqual(session.snapshot().draft.activeIds, ["external"]);
  assert.equal(session.snapshot().dirty, false);
  assert.equal(session.snapshot().record.assignmentStatus, "assigned");
  assert.equal(calls.includes("discardReason"), false);
  assert.equal(
    calls.some((call) => call.startsWith("unbind:")),
    false
  );
});
