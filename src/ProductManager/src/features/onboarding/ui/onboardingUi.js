export function createWelcomeDialog({
  title = "Welcome to Product Manager",
  description = "Take a short tour of the main controls and Product workflows.",
  onStart,
  onNotNow,
  onDismiss,
}) {
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
    <h2 id="pm-onboarding-welcome-title"></h2>
    <p class="pm-onboarding-welcome__description"></p>
    <div class="pm-onboarding-welcome__actions">
      <button type="button" class="pm-onboarding-button pm-onboarding-button--secondary" data-action="dismiss">Do not show again</button>
      <button type="button" class="pm-onboarding-button pm-onboarding-button--secondary" data-action="later">Not now</button>
      <button type="button" class="pm-onboarding-button pm-onboarding-button--primary" data-action="start">Start introduction</button>
    </div>
  `;

  dialog.querySelector("#pm-onboarding-welcome-title").textContent = title;
  dialog.querySelector(".pm-onboarding-welcome__description").textContent = description;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const startButton = dialog.querySelector("[data-action='start']");
  const previousFocus = document.activeElement;

  dialog.addEventListener("click", (event) => {
    const action = getAction(event);

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
  const highlightLayer = document.createElement("div");
  highlightLayer.className = "pm-onboarding-highlight-layer";
  highlightLayer.setAttribute("aria-hidden", "true");

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

  document.body.append(highlightLayer, popover);

  popover.addEventListener("click", (event) => {
    const action = getAction(event);
    if (action === "back") onBack();
    if (action === "next") onNext();
    if (action === "close") onRequestClose();
  });

  return {
    render({
      step,
      index,
      count,
      targets,
      nextDisabled = false,
      nextLabel = null,
      nextTitle = null,
      focusNext = true,
    }) {
      popover.dataset.stepId = step.id;
      popover.querySelector(".pm-onboarding-popover__meta").textContent =
        `Step ${index + 1} of ${count}`;
      popover.querySelector(".pm-onboarding-popover__title").textContent = step.title;
      popover.querySelector(".pm-onboarding-popover__description").textContent = step.description;

      const backButton = popover.querySelector("[data-action='back']");
      const nextButton = popover.querySelector("[data-action='next']");
      backButton.disabled = index === 0;
      nextButton.disabled = Boolean(nextDisabled);
      nextButton.textContent = nextLabel || (index === count - 1 ? "Finish" : "Next");

      if (nextTitle) {
        nextButton.title = nextTitle;
      } else {
        nextButton.removeAttribute("title");
      }

      positionTourElements({ popover, highlightLayer, targets, step });

      if (focusNext && !nextButton.disabled) {
        nextButton.focus({ preventScroll: true });
      }
    },
    reposition(targets, step) {
      positionTourElements({ popover, highlightLayer, targets, step });
    },
    remove() {
      highlightLayer.remove();
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
    const action = getAction(event);
    if (action === "continue") onContinue();
    if (action === "stop") onStop();
  });

  return {
    remove() {
      overlay.remove();
    },
  };
}

function positionTourElements({ popover, highlightLayer, targets, step }) {
  const targetRects = getVisibleTargetRects(targets);
  const anchorRect = getCombinedRect(targetRects);
  const shouldHighlight = step?.highlight !== false && targetRects.length > 0;

  renderHighlights(highlightLayer, shouldHighlight ? targetRects : []);

  popover.classList.remove("is-centered");
  popover.style.removeProperty("transform");

  const position = calculatePopoverPosition({
    popoverRect: popover.getBoundingClientRect(),
    targetRect: anchorRect,
    placement: step?.placement,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    minimumTop: getApplicationContentTop(),
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

function renderHighlights(layer, targetRects) {
  layer.replaceChildren();

  for (const targetRect of targetRects) {
    const highlight = document.createElement("div");
    highlight.className = "pm-onboarding-highlight";
    positionHighlight(highlight, targetRect);
    layer.appendChild(highlight);
  }
}

function positionHighlight(highlight, targetRect) {
  const padding = 4;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = Math.max(2, targetRect.left - padding);
  const top = Math.max(2, targetRect.top - padding);
  const right = Math.min(viewportWidth - 2, targetRect.right + padding);
  const bottom = Math.min(viewportHeight - 2, targetRect.bottom + padding);

  highlight.style.top = `${top}px`;
  highlight.style.left = `${left}px`;
  highlight.style.width = `${Math.max(0, right - left)}px`;
  highlight.style.height = `${Math.max(0, bottom - top)}px`;
}

export function calculatePopoverPosition({
  popoverRect,
  targetRect,
  placement = "auto",
  viewportWidth,
  viewportHeight,
  margin = 12,
  minimumTop = margin,
}) {
  if (placement === "center" || !targetRect) {
    return { centered: true };
  }

  if (placement === "left-center") {
    return clampPosition({
      top: minimumTop + (viewportHeight - minimumTop - popoverRect.height) / 2,
      left: margin,
      popoverRect,
      margin,
      minimumTop,
      viewportWidth,
      viewportHeight,
    });
  }

  if (placement === "right-center") {
    return clampPosition({
      top: minimumTop + (viewportHeight - minimumTop - popoverRect.height) / 2,
      left: viewportWidth - popoverRect.width - margin,
      popoverRect,
      margin,
      minimumTop,
      viewportWidth,
      viewportHeight,
    });
  }

  if (placement === "adjacent-horizontal") {
    return calculateAdjacentHorizontalPosition({
      popoverRect,
      targetRect,
      viewportWidth,
      viewportHeight,
      margin,
      minimumTop,
    });
  }

  if (placement === "target-top-right") {
    return clampPosition({
      top: targetRect.top + margin,
      left: targetRect.right - popoverRect.width - margin,
      popoverRect,
      margin,
      minimumTop,
      viewportWidth,
      viewportHeight,
    });
  }

  const candidates = createPlacementCandidates({
    targetRect,
    popoverRect,
    margin,
    placement,
  });
  return pickAndClampPosition({
    candidates,
    popoverRect,
    margin,
    minimumTop,
    viewportWidth,
    viewportHeight,
  });
}

function calculateAdjacentHorizontalPosition({
  popoverRect,
  targetRect,
  viewportWidth,
  viewportHeight,
  margin,
  minimumTop,
}) {
  const alignedTop = Math.max(minimumTop, targetRect.top);
  const candidates = [
    {
      top: alignedTop,
      left: targetRect.right + margin,
    },
    {
      top: alignedTop,
      left: targetRect.left - popoverRect.width - margin,
    },
  ];

  // Side placement should not be rejected merely because a tall card would
  // extend above the map content. The vertical coordinate is clamped after the
  // side with sufficient horizontal room has been selected.
  const horizontalCandidate = candidates.find((candidate) => {
    return candidate.left >= margin && candidate.left + popoverRect.width <= viewportWidth - margin;
  });

  if (horizontalCandidate) {
    return clampPosition({
      ...horizontalCandidate,
      popoverRect,
      margin,
      minimumTop,
      viewportWidth,
      viewportHeight,
    });
  }

  const spaceOnRight = viewportWidth - targetRect.right;
  const spaceOnLeft = targetRect.left;
  const fallbackLeft =
    spaceOnRight >= spaceOnLeft ? viewportWidth - popoverRect.width - margin : margin;

  return clampPosition({
    top: targetRect.bottom + margin,
    left: fallbackLeft,
    popoverRect,
    margin,
    minimumTop,
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
      {
        top: targetRect.bottom + margin,
        left: targetRect.right - popoverRect.width,
      },
    ],
    below: [
      {
        top: targetRect.bottom + margin,
        left: targetRect.left + (targetRect.width - popoverRect.width) / 2,
      },
      { top: targetRect.bottom + margin, left: targetRect.left },
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
      {
        top: targetRect.top - popoverRect.height - margin,
        left: targetRect.left,
      },
    ],
  };

  return placements[placement] ?? placements.auto;
}

function pickAndClampPosition({
  candidates,
  popoverRect,
  margin,
  minimumTop,
  viewportWidth,
  viewportHeight,
}) {
  const fittingCandidate = candidates.find((candidate) => {
    return (
      candidate.top >= minimumTop &&
      candidate.left >= margin &&
      candidate.top + popoverRect.height <= viewportHeight - margin &&
      candidate.left + popoverRect.width <= viewportWidth - margin
    );
  });

  return clampPosition({
    ...(fittingCandidate ?? candidates[0]),
    popoverRect,
    margin,
    minimumTop,
    viewportWidth,
    viewportHeight,
  });
}

function clampPosition({
  top,
  left,
  popoverRect,
  margin,
  minimumTop,
  viewportWidth,
  viewportHeight,
}) {
  return {
    centered: false,
    top: Math.min(
      Math.max(minimumTop, top),
      Math.max(minimumTop, viewportHeight - popoverRect.height - margin)
    ),
    left: Math.min(
      Math.max(margin, left),
      Math.max(margin, viewportWidth - popoverRect.width - margin)
    ),
  };
}

function getVisibleTargetRects(targets = []) {
  return targets.map(getVisibleTargetRect).filter(Boolean);
}

function getVisibleTargetRect(target) {
  if (!(target instanceof HTMLElement) || target.hidden) return null;
  const rect = target.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);

  if (right <= left || bottom <= top) return null;

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function getCombinedRect(rects) {
  if (rects.length === 0) return null;

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function getApplicationContentTop() {
  const headerBottom = document.getElementById("header")?.getBoundingClientRect().bottom ?? 0;
  return Math.max(12, headerBottom + 10);
}

function getAction(event) {
  const target = event.target;
  return target instanceof Element ? target.closest("[data-action]")?.dataset.action : null;
}
