let activeResolver = null;
let dismissHandlersRegistered = false;

export function confirmAction({
  title = "Confirm action",
  message = "Are you sure?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  anchorElement = null,
} = {}) {
  const popover = document.getElementById("confirm-popover");
  const card = popover?.querySelector(".confirm-popover__card");
  const titleElement = document.getElementById("confirm-popover-title");
  const messageElement = document.getElementById("confirm-popover-message");
  const confirmButton = document.getElementById("confirm-popover-confirm");
  const cancelButton = document.getElementById("confirm-popover-cancel");

  if (!popover || !card || !titleElement || !messageElement || !confirmButton || !cancelButton) {
    throw new Error("Confirm popover elements were not found in the DOM");
  }

  if (activeResolver) {
    activeResolver(false);
    activeResolver = null;
  }

  titleElement.textContent = title;
  messageElement.textContent = message;
  confirmButton.textContent = confirmText;
  cancelButton.textContent = cancelText;

  popover.hidden = false;
  positionPopover(popover, card, anchorElement);

  return new Promise((resolve) => {
    activeResolver = resolve;
  });
}

export function registerConfirmDialog() {
  const popover = document.getElementById("confirm-popover");
  const confirmButton = document.getElementById("confirm-popover-confirm");
  const cancelButton = document.getElementById("confirm-popover-cancel");

  if (!popover || !confirmButton || !cancelButton) {
    throw new Error("Confirm popover elements were not found in the DOM");
  }

  const closePopover = (result) => {
    popover.hidden = true;

    if (activeResolver) {
      activeResolver(result);
      activeResolver = null;
    }
  };

  confirmButton.addEventListener("click", () => closePopover(true));
  cancelButton.addEventListener("click", () => closePopover(false));

  if (!dismissHandlersRegistered) {
    document.addEventListener("pointerdown", (event) => {
      if (popover.hidden) {
        return;
      }

      const clickedInside = popover.contains(event.target);
      if (!clickedInside) {
        closePopover(false);
      }
    });

    window.addEventListener("resize", () => {
      if (!popover.hidden) {
        closePopover(false);
      }
    });

    window.addEventListener(
      "scroll",
      () => {
        if (!popover.hidden) {
          closePopover(false);
        }
      },
      true
    );

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !popover.hidden) {
        closePopover(false);
      }
    });

    dismissHandlersRegistered = true;
  }
}

function positionPopover(popover, card, anchorElement) {
  const viewportPadding = 12;
  const gap = 10;

  if (!anchorElement) {
    card.style.top = "80px";
    card.style.left = "50%";
    card.style.transform = "translateX(-50%)";
    card.style.setProperty("--confirm-popover-arrow-left", "50%");
    card.dataset.placement = "bottom";
    return;
  }

  const anchorRect = anchorElement.getBoundingClientRect();

  card.style.top = "0px";
  card.style.left = "0px";
  card.style.transform = "none";

  const cardRect = card.getBoundingClientRect();

  const preferredLeft = anchorRect.left + anchorRect.width / 2 - cardRect.width / 2;
  const minLeft = viewportPadding;
  const maxLeft = window.innerWidth - cardRect.width - viewportPadding;

  const left = Math.min(Math.max(preferredLeft, minLeft), Math.max(minLeft, maxLeft));

  let top = anchorRect.bottom + gap;
  let placement = "bottom";

  if (top + cardRect.height > window.innerHeight - viewportPadding) {
    const topAbove = anchorRect.top - cardRect.height - gap;

    if (topAbove >= viewportPadding) {
      top = topAbove;
      placement = "top";
    } else {
      top = Math.max(viewportPadding, window.innerHeight - cardRect.height - viewportPadding);
    }
  }

  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const arrowOffsetPx = anchorCenterX - left;
  const arrowPadding = 18;
  const clampedArrowOffsetPx = Math.min(
    Math.max(arrowOffsetPx, arrowPadding),
    cardRect.width - arrowPadding
  );

  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
  card.style.setProperty("--confirm-popover-arrow-left", `${clampedArrowOffsetPx}px`);
  card.dataset.placement = placement;
}
