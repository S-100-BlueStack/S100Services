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

export function createTourPopover({ onBack, onNext, onRequestClose }) {
  const highlight = document.createElement("div");
  highlight.className = "pm-onboarding-highlight";
  highlight.hidden = true;

  const popover = document.createElement("section");
  popover.className = "pm-onboarding-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-modal", "false");
  popover.setAttribute("aria-live", "polite");

  popover.innerHTML = `
    <button
      type="button"
      class="pm-onboarding-popover__close"
      data-action="close"
      aria-label="Stop introduction"
      title="Stop introduction"
    >
      <span aria-hidden="true">×</span>
    </button>
    <div class="pm-onboarding-popover__meta"></div>
    <h2 class="pm-onboarding-popover__title"></h2>
    <p class="pm-onboarding-popover__description"></p>
    <div class="pm-onboarding-popover__actions">
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
    if (action === "close") onRequestClose();
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
      positionTourElements({ popover, highlight, target, step });
      nextButton.focus({ preventScroll: true });
    },
    reposition(target, step) {
      positionTourElements({ popover, highlight, target, step });
    },
    remove() {
      highlight.remove();
      popover.remove();
    },
  };
}

export function createStopIntroductionDialog({ onContinue, onStop }) {
  const overlay = document.createElement("div");
  overlay.className = "pm-onboarding-stop";
  overlay.setAttribute("role", "presentation");

  const dialog = document.createElement("section");
  dialog.className = "pm-onboarding-stop__dialog";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "pm-onboarding-stop-title");
  dialog.setAttribute("aria-describedby", "pm-onboarding-stop-description");
  dialog.innerHTML = `
    <h2 id="pm-onboarding-stop-title">Stop introduction?</h2>
    <p id="pm-onboarding-stop-description">
      You can start the introduction again from Preferences.
    </p>
    <div class="pm-onboarding-stop__actions">
      <button type="button" class="pm-onboarding-button pm-onboarding-button--secondary" data-action="continue">Continue introduction</button>
      <button type="button" class="pm-onboarding-button pm-onboarding-button--primary" data-action="stop">Stop introduction</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const continueButton = dialog.querySelector("[data-action='continue']");
  continueButton?.focus({ preventScroll: true });

  dialog.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "continue") onContinue();
    if (action === "stop") onStop();
  });

  return {
    remove() {
      overlay.remove();
    },
  };
}

function positionTourElements({ popover, highlight, target, step }) {
  const targetRect = getVisibleTargetRect(target);
  const shouldHighlight = step?.highlight !== false && Boolean(targetRect);

  if (shouldHighlight) {
    positionHighlight(highlight, targetRect);
  } else {
    highlight.hidden = true;
  }

  popover.classList.remove("is-centered");
  popover.style.removeProperty("transform");

  const position = calculatePopoverPosition({
    popoverRect: popover.getBoundingClientRect(),
    targetRect,
    placement: step?.placement,
  });

  if (position.centered) {
    popover.classList.add("is-centered");
    popover.style.removeProperty("top");
    popover.style.removeProperty("left");
    return;
  }

  popover.style.top = `${position.top}px`;
  popover.style.left = `${position.left}px`;
}

function positionHighlight(highlight, targetRect) {
  const padding = 5;
  highlight.hidden = false;
  highlight.style.top = `${Math.max(4, targetRect.top - padding)}px`;
  highlight.style.left = `${Math.max(4, targetRect.left - padding)}px`;
  highlight.style.width = `${Math.max(0, targetRect.width + padding * 2)}px`;
  highlight.style.height = `${Math.max(0, targetRect.height + padding * 2)}px`;
}

function calculatePopoverPosition({ popoverRect, targetRect, placement = "auto" }) {
  const margin = 12;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (placement === "center" || !targetRect) {
    return { centered: true };
  }

  if (placement === "left-center") {
    return clampPosition({
      top: (viewportHeight - popoverRect.height) / 2,
      left: margin,
      popoverRect,
      margin,
      viewportWidth,
      viewportHeight,
    });
  }

  if (placement === "right-center") {
    return clampPosition({
      top: Math.max(targetRect.bottom + margin, (viewportHeight - popoverRect.height) / 2),
      left: viewportWidth - popoverRect.width - margin,
      popoverRect,
      margin,
      viewportWidth,
      viewportHeight,
    });
  }

  const candidates = createPlacementCandidates({ targetRect, popoverRect, margin, placement });
  const fittingCandidate = candidates.find((candidate) => {
    return (
      candidate.top >= margin &&
      candidate.left >= margin &&
      candidate.top + popoverRect.height <= viewportHeight - margin &&
      candidate.left + popoverRect.width <= viewportWidth - margin
    );
  });

  return clampPosition({
    ...(fittingCandidate ?? candidates[0]),
    popoverRect,
    margin,
    viewportWidth,
    viewportHeight,
  });
}

function createPlacementCandidates({ targetRect, popoverRect, margin, placement }) {
  const placements = {
    left: [
      {
        top: targetRect.top + (targetRect.height - popoverRect.height) / 2,
        left: targetRect.left - popoverRect.width - margin,
      },
      { top: targetRect.bottom + margin, left: targetRect.right - popoverRect.width },
    ],
    below: [
      { top: targetRect.bottom + margin, left: targetRect.left },
      { top: targetRect.bottom + margin, left: targetRect.right - popoverRect.width },
    ],
    auto: [
      { top: targetRect.bottom + margin, left: targetRect.left },
      {
        top: targetRect.top + (targetRect.height - popoverRect.height) / 2,
        left: targetRect.right + margin,
      },
      {
        top: targetRect.top + (targetRect.height - popoverRect.height) / 2,
        left: targetRect.left - popoverRect.width - margin,
      },
      { top: targetRect.top - popoverRect.height - margin, left: targetRect.left },
    ],
  };

  return placements[placement] ?? placements.auto;
}

function clampPosition({ top, left, popoverRect, margin, viewportWidth, viewportHeight }) {
  return {
    centered: false,
    top: Math.min(
      Math.max(margin, top),
      Math.max(margin, viewportHeight - popoverRect.height - margin)
    ),
    left: Math.min(
      Math.max(margin, left),
      Math.max(margin, viewportWidth - popoverRect.width - margin)
    ),
  };
}

function getVisibleTargetRect(target) {
  if (!(target instanceof HTMLElement) || target.hidden) return null;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}
