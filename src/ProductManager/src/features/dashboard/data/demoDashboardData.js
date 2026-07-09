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
        icEncReports: [
          {
            id: "demo-icenc-101DK0040943E",
            title: "IC-ENC validation report",
            status: "failed",
            generatedAt: now.toISOString(),
          },
        ],
        internalValidationReports: [
          {
            id: "demo-validation-101DK0040943E",
            title: "Internal validation",
            status: "warning",
            generatedAt: now.toISOString(),
          },
        ],
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
        icEncReports: [],
        internalValidationReports: [],
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
        icEncReports: [
          {
            id: "demo-icenc-101DK0062280E",
            title: "IC-ENC XML report",
            status: "available",
            generatedAt: now.toISOString(),
          },
        ],
        internalValidationReports: [],
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
        icEncReports: [],
        internalValidationReports: [],
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
        icEncReports: [],
        internalValidationReports: [],
      },
      now,
    }),
  ];

  return {
    Success: true,
    Data: {
      GeneratedAt: now.toISOString(),
      Range: {
        Preset: range.preset,
        From: range.fromIso,
        To: range.toIso,
        Label: range.label,
        DisplayLabel: range.displayLabel,
        TimeZone: range.timeZone,
      },
      Summary: {
        TotalActivities: activities.length,
        ProductsTouched: new Set(activities.map((activity) => activity.datasetName)).size,
        ImportantChanges: activities.filter((activity) => activity.severity !== "normal").length,
        FailedOperations: activities.filter((activity) => activity.status === "failed").length,
        ReportsAvailable: activities.reduce((count, activity) => {
          return (
            count +
            (activity.links.icEncReports?.length ?? 0) +
            (activity.links.internalValidationReports?.length ?? 0)
          );
        }, 0),
      },
      StatusSummary: [
        { Status: "completed", Count: 4 },
        { Status: "failed", Count: 1 },
      ],
      OperationSummary: [
        { Type: "export", Count: 1, Failed: 1 },
        { Type: "freeze", Count: 1, Failed: 0 },
        { Type: "analysis", Count: 1, Failed: 0 },
        { Type: "send", Count: 1, Failed: 0 },
        { Type: "validation", Count: 1, Failed: 0 },
      ],
      Activities: activities,
    },
  };
}

function createActivity({ offsetHours, now, ...activity }) {
  const timestamp = new Date(now);
  timestamp.setHours(timestamp.getHours() - offsetHours);

  return {
    Actor: "Product Manager",
    ...activity,
    Timestamp: timestamp.toISOString(),
  };
}
