import { focusWithVisibleState } from "../../../shared/ui/focus/visibleFocus.js";

let activeDropdown = null;

const DROPDOWN_POINTER_CLOSE_DISTANCE = 90;
const DROPDOWN_NODE_CLASS = "popup-action-dropdown__node";
const DROPDOWN_NODE_HAS_CHILDREN_CLASS = "popup-action-dropdown__node--has-children";
const DROPDOWN_ITEM_CLASS = "popup-action-dropdown__item";
const DROPDOWN_SUBMENU_CLASS = "popup-action-dropdown--submenu";
const DROPDOWN_OPEN_CLASS = "is-open";

export function togglePopupActionDropdown({
  anchorElement,
  items,
  focusFirstItem = false,
  restoreFocusOnClose = true,
}) {
  if (activeDropdown?.anchorElement === anchorElement) {
    closePopupActionDropdown({
      restoreFocus: restoreFocusOnClose,
    });
    return;
  }

  openPopupActionDropdown({
    anchorElement,
    items,
    focusFirstItem,
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
    void focusWithVisibleState(anchorElement);
  }
}

function openPopupActionDropdown({ anchorElement, items, focusFirstItem = false }) {
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

  if (!focusFirstItem) {
    anchorElement.blur?.();
  }

  activeDropdown = {
    element: dropdown,
    anchorElement,
  };

  requestAnimationFrame(() => {
    if (!activeDropdown || activeDropdown.element !== dropdown) {
      return;
    }

    if (focusFirstItem) {
      focusFirstEnabledMenuItem(dropdown);
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
  node.className = DROPDOWN_NODE_CLASS;

  if (hasChildren) {
    node.classList.add(DROPDOWN_NODE_HAS_CHILDREN_CLASS);
  }

  const item = document.createElement("button");
  item.type = "button";
  item.className = DROPDOWN_ITEM_CLASS;
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
    item.setAttribute("aria-expanded", "false");
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

    node.addEventListener("mouseenter", () => {
      openSubmenu(item);
    });

    node.addEventListener("mouseleave", () => {
      if (!node.contains(document.activeElement)) {
        closeSubmenu(item);
      }
    });

    node.addEventListener("focusout", () => {
      requestAnimationFrame(() => {
        if (!node.contains(document.activeElement)) {
          closeSubmenu(item);
        }
      });
    });

    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      openSubmenu(item);
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

function handleDropdownKeydown(event) {
  if (!activeDropdown) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();

    closePopupActionDropdown({ restoreFocus: true });
    return;
  }

  if (event.key === "Tab") {
    closePopupActionDropdown();
    return;
  }

  const item = getEventDropdownItem(event);

  if (!item) {
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    event.stopPropagation();

    focusAdjacentMenuItem(item, 1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    event.stopPropagation();

    focusAdjacentMenuItem(item, -1);
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    event.stopPropagation();

    focusFirstEnabledMenuItem(getCurrentMenu(item));
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    event.stopPropagation();

    focusLastEnabledMenuItem(getCurrentMenu(item));
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    event.stopPropagation();

    focusChildMenu(item);
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    event.stopPropagation();

    focusParentMenu(item);
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();

    if (itemHasSubmenu(item)) {
      focusChildMenu(item);
      return;
    }

    item.click();
  }
}

function getEventDropdownItem(event) {
  const item = event.target?.closest?.(`.${DROPDOWN_ITEM_CLASS}`);

  if (!item || !activeDropdown?.element.contains(item)) {
    return null;
  }

  return item;
}

function focusAdjacentMenuItem(item, direction) {
  const menu = getCurrentMenu(item);
  const items = getEnabledMenuItems(menu);

  if (items.length === 0) {
    return;
  }

  const currentIndex = items.indexOf(item);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (startIndex + direction + items.length) % items.length;

  focusMenuItem(items[nextIndex]);
}

function focusFirstEnabledMenuItem(menu) {
  const item = getEnabledMenuItems(menu)[0];

  if (!item) {
    return false;
  }

  focusMenuItem(item);
  return true;
}

function focusLastEnabledMenuItem(menu) {
  const items = getEnabledMenuItems(menu);
  const item = items[items.length - 1];

  if (!item) {
    return false;
  }

  focusMenuItem(item);
  return true;
}

function focusChildMenu(item) {
  const submenu = openSubmenu(item);

  if (!submenu) {
    return false;
  }

  return focusFirstEnabledMenuItem(submenu);
}

function focusParentMenu(item) {
  const currentMenu = getCurrentMenu(item);
  const parentItem = getParentMenuItem(currentMenu);

  if (!parentItem) {
    return false;
  }

  closeSubmenu(parentItem);
  focusMenuItem(parentItem);

  return true;
}

function focusMenuItem(item) {
  closePeerSubmenus(item);
  void focusWithVisibleState(item);
}

function getCurrentMenu(item) {
  return item.closest(".popup-action-dropdown");
}

function getEnabledMenuItems(menu) {
  if (!menu) {
    return [];
  }

  return getDirectMenuItems(menu).filter((item) => {
    return !item.disabled && item.dataset.busy !== "true";
  });
}

function getDirectMenuItems(menu) {
  return getDirectMenuNodes(menu)
    .map((node) => {
      return Array.from(node.children).find((child) => {
        return child.classList.contains(DROPDOWN_ITEM_CLASS);
      });
    })
    .filter(Boolean);
}

function getDirectMenuNodes(menu) {
  if (!menu) {
    return [];
  }

  return Array.from(menu.children).filter((child) => {
    return child.classList.contains(DROPDOWN_NODE_CLASS);
  });
}

function itemHasSubmenu(item) {
  return Boolean(getSubmenuForItem(item));
}

function openSubmenu(item) {
  const submenu = getSubmenuForItem(item);

  if (!submenu) {
    return null;
  }

  closePeerSubmenus(item);

  const node = item.parentElement;

  node?.classList.add(DROPDOWN_OPEN_CLASS);
  item.setAttribute("aria-expanded", "true");

  return submenu;
}

function closeSubmenu(item) {
  const submenu = getSubmenuForItem(item);

  if (!submenu) {
    return;
  }

  closeNestedSubmenus(submenu);

  const node = item.parentElement;

  node?.classList.remove(DROPDOWN_OPEN_CLASS);
  item.setAttribute("aria-expanded", "false");
}

function closeNestedSubmenus(menu) {
  for (const item of getDirectMenuItems(menu)) {
    closeSubmenu(item);
  }
}

function closePeerSubmenus(item) {
  const menu = getCurrentMenu(item);
  const currentNode = item.parentElement;

  for (const node of getDirectMenuNodes(menu)) {
    if (node === currentNode) {
      continue;
    }

    const peerItem = Array.from(node.children).find((child) => {
      return child.classList.contains(DROPDOWN_ITEM_CLASS);
    });

    if (peerItem) {
      closeSubmenu(peerItem);
    }
  }
}

function getSubmenuForItem(item) {
  const node = item.parentElement;

  if (!node?.classList.contains(DROPDOWN_NODE_HAS_CHILDREN_CLASS)) {
    return null;
  }

  return Array.from(node.children).find((child) => {
    return child.classList.contains(DROPDOWN_SUBMENU_CLASS);
  });
}

function getParentMenuItem(menu) {
  if (!menu?.classList.contains(DROPDOWN_SUBMENU_CLASS)) {
    return null;
  }

  const parentNode = menu.parentElement;

  if (!parentNode?.classList.contains(DROPDOWN_NODE_HAS_CHILDREN_CLASS)) {
    return null;
  }

  return Array.from(parentNode.children).find((child) => {
    return child.classList.contains(DROPDOWN_ITEM_CLASS);
  });
}

function positionDropdown(dropdown, anchorElement) {
  const rect = anchorElement.getBoundingClientRect();
  const dropdownOffset = 8;
  const viewportPadding = 8;

  const left = Math.min(rect.left, window.innerWidth - dropdown.offsetWidth - viewportPadding);
  const arrowLeft = rect.left + rect.width / 2 - left - 5;

  dropdown.style.top = `${rect.bottom + dropdownOffset}px`;
  dropdown.style.left = `${left}px`;
  dropdown.style.setProperty("--pc-popup-dropdown-arrow-left", `${Math.max(12, arrowLeft)}px`);
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
