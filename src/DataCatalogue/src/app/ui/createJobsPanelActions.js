export function createJobsPanelActions({
  isOpen,
  resetContext,
  prepareOpen,
  prepareClose,
  setOpen,
}) {
  function open() {
    resetContext();
    prepareOpen();
    setOpen(true);
  }

  function close() {
    resetContext();
    prepareClose();
    setOpen(false);
  }

  return {
    open,
    toggle() {
      if (isOpen()) {
        close();
        return;
      }

      open();
    },
  };
}
