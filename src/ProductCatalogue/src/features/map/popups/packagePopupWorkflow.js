/** Reconcile this sibling independently so workflow updates cannot replace the member table. */
export function updatePackagePopupWorkflow(container, presentation) {
  let section = Array.from(container.children).find((child) =>
    child.classList.contains("popup-package-workflow")
  );
  if (!presentation) {
    section?.remove();
    return;
  }
  if (!section) {
    section = document.createElement("div");
    section.className = "popup-package-workflow";
    section.setAttribute("role", "group");
    section.setAttribute("aria-label", "Package workflow");
    container.appendChild(section);
  }
  const summary = presentation.summary;
  const signature = JSON.stringify(summary);
  if (section.presentationSignature === signature) return;

  // Update text in existing nodes; selection/focus in unrelated sections is untouched.
  const values = [summary.workflowText, summary.unavailableText, summary.pausedText];
  if (summary.scheduledSendAt) {
    values.push(`Planned send: ${summary.scheduledSendAt}`);
  }
  if (summary.outcomeText) values.push(summary.outcomeText);
  const lines = values.filter(Boolean);
  for (const [index, value] of lines.entries()) {
    let line = section.children[index];
    if (!line) {
      line = document.createElement("p");
      section.appendChild(line);
    }
    if (line.textContent !== value) line.textContent = value;
  }
  while (section.children.length > lines.length) section.lastElementChild.remove();
  section.presentationSignature = signature;
}
