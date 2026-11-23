import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDashboardPayload } from "./dashboardActivity.js";
import { normalizeDashboardReporting } from "./dashboardReporting.js";

const RANGE = {
  preset: "last-7-days",
  fromIso: "2026-11-02T00:00:00.000Z",
  toIso: "2026-11-17T13:00:00.000Z",
  timeZone: "Europe/Copenhagen",
};

describe("Dashboard reporting contract", () => {
  it("accepts the PascalCase API contract, keeps live and simulated decisions separate", () => {
    const dashboard = normalizeDashboardPayload(
      {
        Success: true,
        Data: {
          Activities: [{ Id: "a", ProductSpecification: "S101", Status: "completed" }],
          Summary: { TotalActivities: 80, FailedOperations: 2, ReportsAvailable: 16 },
          Distribution: {
            Live: {
              Sent: 0,
              Accepted: 0,
              Rejected: 0,
              Pending: 0,
              Uncertain: 0,
              AcceptanceRatePercent: null,
            },
            Simulation: {
              Sent: 2,
              Accepted: 2,
              Rejected: 0,
              Pending: 0,
              Uncertain: 0,
              AcceptanceRatePercent: 100,
            },
            BySpecification: [
              { ProductSpecification: "S101", IsSimulation: true, Counts: { Accepted: 1 } },
              { ProductSpecification: "S57", IsSimulation: true, Counts: { Accepted: 1 } },
            ],
          },
          OperationalHealth: {
            Tracks: 12,
            OpenErrors: 1,
            Processing: 0,
            AwaitingIcEnc: 0,
            Paused: 0,
          },
          ReportSummary: { Total: 16, IcEnc: 2, InternalValidation: 0, ValidationDiagnostics: 14 },
          ActivityTrend: [{ Day: "2026-11-13", Activities: 80, Failed: 2, Important: 2 }],
          DistributionTrend: [],
          ProductBreakdown: [
            { ProductSpecification: "S101", Activities: 40, ProductsTouched: 6, Failed: 2 },
            { ProductSpecification: "S57", Activities: 40, ProductsTouched: 6, Failed: 0 },
          ],
        },
      },
      RANGE
    );
    assert.equal(dashboard.summary.totalActivities, 80);
    assert.equal(dashboard.activities.length, 1); // Aggregates never use the current activity page.
    assert.equal(dashboard.activities[0].productSpecification, "S101");
    assert.deepEqual(dashboard.distribution.live, {
      sent: 0,
      accepted: 0,
      rejected: 0,
      pending: 0,
      uncertain: 0,
      acceptanceRatePercent: null,
    });
    assert.equal(dashboard.distribution.simulation.accepted, 2);
    assert.deepEqual(
      dashboard.distribution.bySpecification.map((item) => [
        item.specification,
        item.isSimulation,
        item.counts.accepted,
      ]),
      [
        ["S101", true, 1],
        ["S57", true, 1],
      ]
    );
    assert.equal(dashboard.operationalHealth.openErrors, 1);
    assert.equal(dashboard.reportSummary.validationDiagnostics, 14);
    assert.equal(dashboard.activityTrend[0].activities, 80);
    assert.equal(dashboard.productBreakdown[0].activities, 40);
    assert.deepEqual(dashboard.distributionTrend, []);
  });

  it("normalizes camelCase and sorts trend buckets without inferring zero for missing values", () => {
    const reporting = normalizeDashboardReporting({
      distribution: { live: { accepted: 3, acceptanceRatePercent: 75 } },
      activityTrend: [
        { day: "2026-11-17", activities: 9, failed: 1, important: 0 },
        { day: "2026-11-15", activities: 4, failed: 0, important: 1 },
      ],
    });
    assert.equal(reporting.distribution.live.accepted, 3);
    assert.equal(reporting.distribution.live.sent, null);
    assert.equal(reporting.distribution.live.acceptanceRatePercent, 75);
    assert.deepEqual(
      reporting.activityTrend.map((bucket) => bucket.day),
      ["2026-11-15", "2026-11-17"]
    );
  });

  it("leaves optional reporting unavailable for older/demo responses", () => {
    const dashboard = normalizeDashboardPayload({ Data: { Activities: [] } }, RANGE);
    assert.equal(dashboard.distribution, null);
    assert.equal(dashboard.operationalHealth, null);
    assert.equal(dashboard.reportSummary, null);
    assert.equal(dashboard.activityTrend, null);
    assert.equal(dashboard.productBreakdown, null);
  });

  it("rejects invalid optional counters without displaying false successful zeros", () => {
    const reporting = normalizeDashboardReporting({
      Distribution: {
        Live: { Accepted: "", Sent: -2, Rejected: "N/A", Pending: 0, AcceptanceRatePercent: 121 },
      },
      OperationalHealth: { OpenErrors: null },
      ActivityTrend: [
        { Day: "not-a-day", Activities: 80 },
        { Day: "2026-11-13", Activities: -10 },
      ],
    });
    assert.equal(reporting.distribution.live.accepted, null);
    assert.equal(reporting.distribution.live.sent, null);
    assert.equal(reporting.distribution.live.rejected, null);
    assert.equal(reporting.distribution.live.pending, 0);
    assert.equal(reporting.distribution.live.acceptanceRatePercent, null);
    assert.equal(reporting.operationalHealth.openErrors, null);
    assert.deepEqual(reporting.activityTrend, []);
  });
});
