// Keep the user-facing Package identity independent of the composite contextual Job ID.
export function getLiveJobPresentation(job) {
  if (job?.source !== "live") return null;

  const shortId = displayText(job.shortId) || displayText(job.packageId) || "Package";
  const packageTitle = displayText(job.packageTitle);
  const pipeline = displayText(job.pipelineName);
  const workspace = displayText(job.workspaceName);

  return {
    shortId,
    packageTitle: packageTitle && packageTitle !== shortId ? packageTitle : "",
    context: [pipeline, workspace].filter(Boolean).join(" / "),
    pipeline,
  };
}

function displayText(value) {
  return typeof value === "string" ? value.trim() : "";
}
