let activeDropdown = null;

const DROPDOWN_POINTER_CLOSE_DISTANCE = 90;

export function togglePopupActionDropdown({ anchorElement, items }) {
  if (activeDropdown?.anchorElement === anchorElement) {
    closePopupActionDropdown({ restoreFocus: true });
    return;
  }

  openPopupActionDropdown({
    anchorElement,
    items,
  });
}

export function closePopupActionDropdown({ restoreFocus = false } = {}) {
  if (!activeDropdown) {
    return;
  }

  const { element, anchorElement } = activeDropdown;

  element.remove();
  resetDropdownAnchorState(anchorElement);

  activeDropdown = null;

  document.removeEventListener("click", handleOutsideDropdownClick);
  document.removeEventListener("pointermove", handleDropdownPointerMove);
  document.removeEventListener("keydown", handleDropdownKeydown);
  window.removeEventListener("resize", closePopupActionDropdown);
  window.removeEventListener("scroll", closePopupActionDropdown, true);

  if (restoreFocus) {
    anchorElement?.focus?.();
  }
}

function openPopupActionDropdown({ anchorElement, items }) {
  closePopupActionDropdown();

  if (!anchorElement || !items?.length) {
    return;
  }

  const dropdown = document.createElement("div");
  dropdown.id = createDropdownId(anchorElement);
  dropdown.className = "popup-action-dropdown";
  dropdown.setAttribute("role", "menu");

  for (const item of items) {
    dropdown.appendChild(createDropdownItem(item));
  }

  document.body.appendChild(dropdown);
  positionDropdown(dropdown, anchorElement);
  setDropdownAnchorState(anchorElement, dropdown.id);
  anchorElement.blur?.();

  activeDropdown = {
    element: dropdown,
    anchorElement,
  };

  requestAnimationFrame(() => {
    if (!activeDropdown || activeDropdown.element !== dropdown) {
      return;
    }

    document.addEventListener("click", handleOutsideDropdownClick);
    document.addEventListener("pointermove", handleDropdownPointerMove);
    document.addEventListener("keydown", handleDropdownKeydown);
    window.addEventListener("resize", closePopupActionDropdown);
    window.addEventListener("scroll", closePopupActionDropdown, true);
  });
}

function createDropdownItem(itemConfig, level = 0) {
  const hasChildren = Array.isArray(itemConfig.items) && itemConfig.items.length > 0;
  const loading = itemConfig.loading === true;
  const disabled = itemConfig.disabled === true || loading;

  const node = document.createElement("div");
  node.className = "popup-action-dropdown__node";

  if (hasChildren) {
    node.classList.add("popup-action-dropdown__node--has-children");
  }

  const item = document.createElement("button");
  item.type = "button";
  item.className = "popup-action-dropdown__item";
  item.disabled = disabled;
  item.setAttribute("role", "menuitem");
  item.dataset.dropdownActionId = itemConfig.id;
  item.style.setProperty("--popup-action-dropdown-level", String(level));

  if (loading) {
    item.classList.add("popup-action-dropdown__item--loading");
    item.dataset.busy = "true";
    item.setAttribute("aria-busy", "true");
  }

  if (hasChildren) {
    item.classList.add("popup-action-dropdown__item--has-children");
    item.setAttribute("aria-haspopup", "menu");
  }

  if (disabled) {
    item.setAttribute("aria-disabled", "true");
    item.title = itemConfig.disabledReason ?? "This action is unavailable.";
  }

  item.appendChild(createDropdownLeadingVisual(itemConfig));

  const label = document.createElement("span");
  label.className = "popup-action-dropdown__label";
  label.textContent = itemConfig.label;
  item.appendChild(label);

  if (hasChildren) {
    const indicator = document.createElement("calcite-icon");
    indicator.className = "popup-action-dropdown__submenu-indicator";
    indicator.icon = "chevron-right";
    indicator.scale = "s";
    item.appendChild(indicator);

    const submenu = document.createElement("div");
    submenu.className = "popup-action-dropdown popup-action-dropdown--submenu";
    submenu.setAttribute("role", "menu");

    for (const childItem of itemConfig.items) {
      submenu.appendChild(createDropdownItem(childItem, level + 1));
    }

    // Parent items are hover-only submenu triggers. Preventing focus keeps the
    // submenu interaction stable when users move between parent and child menus.
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      item.blur();
    });

    node.appendChild(item);
    node.appendChild(submenu);

    return node;
  }

  item.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (item.disabled || item.dataset.busy === "true") {
      return;
    }

    // Dropdown items are removed before actions run. Keep the top-level action
    // as the confirmation anchor so shared confirm popovers have a stable target.
    const stableAnchorElement = activeDropdown?.anchorElement ?? item;

    closePopupActionDropdown();

    await itemConfig.onClick?.({
      anchorElement: stableAnchorElement,
      actionElement: item,
    });
  });

  node.appendChild(item);

  return node;
}

function createDropdownLeadingVisual(itemConfig) {
  if (itemConfig.loading) {
    const loader = document.createElement("calcite-loader");
    loader.scale = "s";
    loader.inline = true;
    loader.type = "indeterminate";
    loader.className = "popup-action-dropdown__loader";

    return loader;
  }

  return createDropdownIcon(itemConfig.icon);
}

function createDropdownIcon(iconName) {
  if (!iconName) {
    const placeholder = document.createElement("span");
    placeholder.className = "popup-action-dropdown__icon-placeholder";
    return placeholder;
  }

  const icon = document.createElement("calcite-icon");
  icon.icon = iconName;
  icon.scale = "s";

  return icon;
}

function positionDropdown(dropdown, anchorElement) {
  const rect = anchorElement.getBoundingClientRect();
  const dropdownOffset = 8;
  const viewportPadding = 8;

  const left = Math.min(rect.left, window.innerWidth - dropdown.offsetWidth - viewportPadding);
  const arrowLeft = rect.left + rect.width / 2 - left - 5;

  dropdown.style.top = `${rect.bottom + dropdownOffset}px`;
  dropdown.style.left = `${left}px`;
  dropdown.style.setProperty("--pm-popup-dropdown-arrow-left", `${Math.max(12, arrowLeft)}px`);
}

function handleOutsideDropdownClick(event) {
  if (!activeDropdown) {
    return;
  }

  const target = event.target;

  if (activeDropdown.element.contains(target) || activeDropdown.anchorElement.contains?.(target)) {
    return;
  }

  closePopupActionDropdown();
}

function handleDropdownPointerMove(event) {
  if (!activeDropdown) {
    return;
  }

  const target = event.target;

  if (activeDropdown.element.contains(target) || activeDropdown.anchorElement.contains?.(target)) {
    return;
  }

  const safeRect = getExpandedDropdownSafeRect(activeDropdown, DROPDOWN_POINTER_CLOSE_DISTANCE);

  if (isPointInsideRect(event.clientX, event.clientY, safeRect)) {
    return;
  }

  closePopupActionDropdown();
}

function handleDropdownKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  closePopupActionDropdown({ restoreFocus: true });
}

function setDropdownAnchorState(anchorElement, dropdownId) {
  anchorElement?.setAttribute("aria-expanded", "true");
  anchorElement?.setAttribute("aria-controls", dropdownId);
}

function resetDropdownAnchorState(anchorElement) {
  anchorElement?.setAttribute("aria-expanded", "false");
  anchorElement?.removeAttribute("aria-controls");
}

function createDropdownId(anchorElement) {
  const actionId = anchorElement?.dataset?.popupActionId ?? "action";
  const safeActionId = actionId.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();

  return `popup-action-dropdown-${safeActionId}-${crypto.randomUUID()}`;
}

function getExpandedDropdownSafeRect(dropdownState, distance) {
  const dropdownRect = dropdownState.element.getBoundingClientRect();
  const anchorRect = dropdownState.anchorElement.getBoundingClientRect();

  return {
    top: Math.min(dropdownRect.top, anchorRect.top) - distance,
    right: Math.max(dropdownRect.right, anchorRect.right) + distance,
    bottom: Math.max(dropdownRect.bottom, anchorRect.bottom) + distance,
    left: Math.min(dropdownRect.left, anchorRect.left) - distance,
  };
}

function isPointInsideRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
