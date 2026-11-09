// Surface actionable geometry failures without repeating successful coverage counts.
export function formatWorkspaceMapFailures({ failures = [], navigationError = "" } = {}) {
  const messages = failures
    .slice(0, 3)
    .map(({ workspace, message }) =>
      [workspace?.name || workspace?.workspaceId, message].filter(Boolean).join(": ")
    );
  if (failures.length > 3)
    messages.push(`${failures.length - 3} more Workspace geometry failures.`);
  if (navigationError) messages.push(navigationError);
  return messages.join(" ");
}
