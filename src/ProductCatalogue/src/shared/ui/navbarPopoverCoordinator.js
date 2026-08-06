const DEFAULT_EVENT_TARGET = typeof document === "undefined" ? null : document;

export function createNavbarPopoverCoordinator({ eventTarget = DEFAULT_EVENT_TARGET } = {}) {
  const participants = new Map();
  let activeId = null;
  let listening = false;
  let destroyed = false;

  function register(id, participant) {
    assertUsable();
    const normalizedId = normalizeId(id);

    if (!normalizedId) {
      throw new Error("A navbar popover id is required.");
    }
    if (participants.has(normalizedId)) {
      throw new Error(`Navbar popover "${normalizedId}" is already registered.`);
    }

    const normalizedParticipant = normalizeParticipant(participant);
    participants.set(normalizedId, normalizedParticipant);

    return () => {
      if (activeId === normalizedId) {
        close(normalizedId, { restoreFocus: false });
      }
      participants.delete(normalizedId);
    };
  }

  function open(id, { focusInitial = true } = {}) {
    assertUsable();
    const normalizedId = normalizeId(id);
    const participant = participants.get(normalizedId);

    if (!participant) {
      return false;
    }
    if (activeId === normalizedId && participant.isOpen()) {
      return true;
    }

    closeAll({ restoreFocus: false });
    participant.open({ focusInitial });
    activeId = normalizedId;
    return true;
  }

  function toggle(id, options = {}) {
    const normalizedId = normalizeId(id);
    const participant = participants.get(normalizedId);

    if (!participant) {
      return false;
    }
    if (activeId === normalizedId && participant.isOpen()) {
      return close(normalizedId, { restoreFocus: true });
    }

    return open(normalizedId, options);
  }

  function close(id, { restoreFocus = false } = {}) {
    const normalizedId = normalizeId(id);
    const participant = participants.get(normalizedId);

    if (!participant || !participant.isOpen()) {
      if (activeId === normalizedId) {
        activeId = null;
      }
      return false;
    }

    participant.close({ restoreFocus });
    if (activeId === normalizedId) {
      activeId = null;
    }
    return true;
  }

  function closeAll(options = {}) {
    let closed = false;
    const currentActiveId = activeId;

    if (currentActiveId) {
      closed = close(currentActiveId, options) || closed;
    }

    for (const [id, participant] of participants.entries()) {
      if (id === currentActiveId || !participant.isOpen()) {
        continue;
      }
      participant.close(options);
      closed = true;
    }

    activeId = null;
    return closed;
  }

  function getActiveId() {
    return activeId;
  }

  function start() {
    assertUsable();
    if (listening || !eventTarget?.addEventListener) {
      return false;
    }

    eventTarget.addEventListener("click", handleDocumentClick);
    eventTarget.addEventListener("keydown", handleDocumentKeydown);
    listening = true;
    return true;
  }

  function stop() {
    if (!listening || !eventTarget?.removeEventListener) {
      return false;
    }

    eventTarget.removeEventListener("click", handleDocumentClick);
    eventTarget.removeEventListener("keydown", handleDocumentKeydown);
    listening = false;
    return true;
  }

  function destroy() {
    if (destroyed) {
      return;
    }

    stop();
    closeAll({ restoreFocus: false });
    participants.clear();
    destroyed = true;
  }

  function handleDocumentClick(event) {
    const participant = activeId ? participants.get(activeId) : null;

    if (!participant || !participant.isOpen() || participant.containsTarget(event?.target)) {
      return;
    }

    close(activeId, { restoreFocus: false });
  }

  function handleDocumentKeydown(event) {
    if (event?.key !== "Escape" || event.defaultPrevented || !activeId) {
      return;
    }

    const closed = close(activeId, { restoreFocus: true });
    if (!closed) {
      return;
    }

    event.preventDefault?.();
    event.stopPropagation?.();
  }

  return {
    register,
    open,
    toggle,
    close,
    closeAll,
    getActiveId,
    start,
    stop,
    destroy,
  };

  function assertUsable() {
    if (destroyed) {
      throw new Error("The navbar popover coordinator has been destroyed.");
    }
  }
}

function normalizeParticipant(participant) {
  if (
    typeof participant?.open !== "function" ||
    typeof participant?.close !== "function" ||
    typeof participant?.isOpen !== "function"
  ) {
    throw new Error("A navbar popover must provide open, close, and isOpen functions.");
  }

  return {
    open: participant.open,
    close: participant.close,
    isOpen: participant.isOpen,
    containsTarget:
      typeof participant.containsTarget === "function" ? participant.containsTarget : () => false,
  };
}

function normalizeId(value) {
  return String(value ?? "").trim();
}
