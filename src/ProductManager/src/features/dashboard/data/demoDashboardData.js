export function createDemoDashboardPayload(range) {
  const now = new Date();
  const activities = [
    createActivity({
      id: "demo-export-failed",
      offsetHours: 1,
      datasetName: "101DK0040943E",
      type: "export",
      severity: "critical",
      status: "failed",
      title: "Export failed",
      description: "All Edition export failed validation and needs review before retry.",
      details: [
        { label: "Scope", value: "All" },
        { label: "Export type", value: "Edition" },
      ],
      links: {
        review: true,
        analyze: true,
        history: true,
        icEncReport: { available: true, reportId: "demo-icenc-101DK0040943E" },
        internalValidation: { available: true, reportId: "demo-validation-101DK0040943E" },
      },
      now,
    }),
    createActivity({
      id: "demo-product-frozen",
      offsetHours: 3,
      datasetName: "101DK0050301E",
      type: "freeze",
      severity: "important",
      status: "completed",
      title: "Product frozen",
      description: "Product was frozen for operational handoff.",
      details: [{ label: "State", value: "Frozen" }],
      links: {
        review: true,
        analyze: true,
        history: true,
      },
      now,
    }),
    createActivity({
      id: "demo-icenc-report",
      offsetHours: 6,
      datasetName: "101DK0062280E",
      type: "analysis",
      severity: "warning",
      status: "completed",
      title: "IC-ENC report available",
      description: "A new IC-ENC report is available for inspection.",
      details: [{ label: "Report", value: "IC-ENC XML" }],
      links: {
        review: true,
        analyze: true,
        history: true,
        icEncReport: { available: true, reportId: "demo-icenc-101DK0062280E" },
      },
      now,
    }),
    createActivity({
      id: "demo-send-completed",
      offsetHours: 20,
      datasetName: "101DK0037000E",
      type: "send",
      severity: "normal",
      status: "completed",
      title: "Sent to IC-ENC",
      description: "Product was sent to IC-ENC successfully.",
      details: [{ label: "Operation", value: "Send to IC-ENC" }],
      links: {
        review: true,
        analyze: true,
        history: true,
      },
      now,
    }),
    createActivity({
      id: "demo-validation-placeholder",
      offsetHours: 34,
      datasetName: "101DK0028400E",
      type: "validation",
      severity: "important",
      status: "completed",
      title: "Internal validation placeholder",
      description: "Internal validation report metadata is ready for backend integration.",
      details: [{ label: "Report", value: "Internal validation" }],
      links: {
        review: true,
        analyze: true,
        history: true,
        internalValidation: { available: false, reportId: null },
      },
      now,
    }),
  ];

  return {
    success: true,
    data: {
      generatedAt: now.toISOString(),
      range: {
        preset: range.preset,
        from: range.fromIso,
        to: range.toIso,
        label: range.label,
        displayLabel: range.displayLabel,
      },
      summary: {
        totalActivities: activities.length,
        productsTouched: new Set(activities.map((activity) => activity.datasetName)).size,
        importantChanges: activities.filter((activity) => activity.severity !== "normal").length,
        failedOperations: activities.filter((activity) => activity.status === "failed").length,
        reportsAvailable: activities.filter((activity) => {
          return (
            activity.links.icEncReport?.available || activity.links.internalValidation?.available
          );
        }).length,
      },
      statusSummary: [
        { status: "completed", count: 4 },
        { status: "failed", count: 1 },
      ],
      operationSummary: [
        { type: "export", count: 1, failed: 1 },
        { type: "freeze", count: 1, failed: 0 },
        { type: "analysis", count: 1, failed: 0 },
        { type: "send", count: 1, failed: 0 },
        { type: "validation", count: 1, failed: 0 },
      ],
      activities,
    },
  };
}

function createActivity({ offsetHours, now, ...activity }) {
  const timestamp = new Date(now);
  timestamp.setHours(timestamp.getHours() - offsetHours);

  return {
    actor: "Product Manager",
    ...activity,
    timestamp: timestamp.toISOString(),
  };
}
