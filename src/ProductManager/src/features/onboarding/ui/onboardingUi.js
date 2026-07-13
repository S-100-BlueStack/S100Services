export function createWelcomeDialog({ onStart, onNotNow, onDismiss }) {
  const overlay = document.createElement("div");
  overlay.className = "pm-onboarding-welcome";
  overlay.setAttribute("role", "presentation");

  const dialog = document.createElement("section");
  dialog.className = "pm-onboarding-welcome__dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "pm-onboarding-welcome-title");

  dialog.innerHTML = `
    <div class="pm-onboarding-welcome__eyebrow">Introduction</div>
    <h2 id="pm-onboarding-welcome-title">Welcome to Product Manager</h2>
    <p>Take a short tour of the main controls and Product workflows.</p>
    <div class="pm-onboarding-welcome__actions">
      <button type="button" class="pm-onboarding-button pm-onboarding-button--secondary" data-action="dismiss">Do not show again</button>
      <button type="button" class="pm-onboarding-button pm-onboarding-button--secondary" data-action="later">Not now</button>
      <button type="button" class="pm-onboarding-button pm-onboarding-button--primary" data-action="start">Start introduction</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const startButton = dialog.querySelector("[data-action='start']");
  const previousFocus = document.activeElement;

  dialog.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;

    if (action === "start") onStart();
    if (action === "later") onNotNow();
    if (action === "dismiss") onDismiss();
  });

  startButton?.focus();

  return {
    close({ restoreFocus = true } = {}) {
      overlay.remove();
      if (restoreFocus && previousFocus instanceof HTMLElement) previousFocus.focus();
    },
  };
}

export function createTourPopover({ onBack, onNext, onSkip }) {
  const highlight = document.createElement("div");
  highlight.className = "pm-onboarding-highlight";
  highlight.hidden = true;

  const popover = document.createElement("section");
  popover.className = "pm-onboarding-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-modal", "false");
  popover.setAttribute("aria-live", "polite");

  popover.innerHTML = `
    <div class="pm-onboarding-popover__meta"></div>
    <h2 class="pm-onboarding-popover__title"></h2>
    <p class="pm-onboarding-popover__description"></p>
    <div class="pm-onboarding-popover__actions">
      <button type="button" class="pm-onboarding-button pm-onboarding-button--secondary" data-action="skip">Skip</button>
      <span class="pm-onboarding-popover__spacer"></span>
      <button type="button" class="pm-onboarding-button pm-onboarding-button--secondary" data-action="back">Back</button>
      <button type="button" class="pm-onboarding-button pm-onboarding-button--primary" data-action="next">Next</button>
    </div>
  `;

  document.body.append(highlight, popover);

  popover.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "back") onBack();
    if (action === "next") onNext();
    if (action === "skip") onSkip();
  });

  return {
    render({ step, index, count, target }) {
      popover.querySelector(".pm-onboarding-popover__meta").textContent =
        `Step ${index + 1} of ${count}`;
      popover.querySelector(".pm-onboarding-popover__title").textContent = step.title;
      popover.querySelector(".pm-onboarding-popover__description").textContent = step.description;
      const backButton = popover.querySelector("[data-action='back']");
      const nextButton = popover.querySelector("[data-action='next']");
      backButton.disabled = index === 0;
      nextButton.textContent = index === count - 1 ? "Finish" : "Next";
      positionTourElements({ popover, highlight, target });
      nextButton.focus({ preventScroll: true });
    },
    reposition(target) {
      positionTourElements({ popover, highlight, target });
    },
    remove() {
      highlight.remove();
      popover.remove();
    },
  };
}

function positionTourElements({ popover, highlight, target }) {
  const margin = 12;
  const targetRect = getVisibleTargetRect(target);

  if (!targetRect) {
    highlight.hidden = true;
    popover.classList.add("is-centered");
    popover.style.removeProperty("top");
    popover.style.removeProperty("left");
    return;
  }

  highlight.hidden = false;
  highlight.style.top = `${Math.max(4, targetRect.top - 4)}px`;
  highlight.style.left = `${Math.max(4, targetRect.left - 4)}px`;
  highlight.style.width = `${Math.max(0, targetRect.width + 8)}px`;
  highlight.style.height = `${Math.max(0, targetRect.height + 8)}px`;

  popover.classList.remove("is-centered");
  const popoverRect = popover.getBoundingClientRect();
  const preferredTop = targetRect.bottom + margin;
  const fitsBelow = preferredTop + popoverRect.height <= window.innerHeight - margin;
  const top = fitsBelow
    ? preferredTop
    : Math.max(margin, targetRect.top - popoverRect.height - margin);
  const left = Math.min(
    Math.max(margin, targetRect.left),
    Math.max(margin, window.innerWidth - popoverRect.width - margin)
  );

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

function getVisibleTargetRect(target) {
  if (!(target instanceof HTMLElement) || target.hidden) return null;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}
