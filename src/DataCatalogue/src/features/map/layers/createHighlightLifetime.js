export function createHighlightLifetime() {
  let generation = 0;
  let activeHandle = null;
  let disposed = false;

  function removeHandle() {
    activeHandle?.remove();
    activeHandle = null;
  }

  function begin() {
    if (disposed) {
      return null;
    }

    generation += 1;
    removeHandle();
    return generation;
  }

  function isCurrent(token) {
    return !disposed && token !== null && token === generation;
  }

  function install(token, handle) {
    if (!isCurrent(token)) {
      handle?.remove();
      return false;
    }

    removeHandle();
    activeHandle = handle;
    return true;
  }

  function clear() {
    // Clearing a visible handle must also invalidate an in-flight query.
    generation += 1;
    removeHandle();
  }

  function destroy() {
    disposed = true;
    clear();
  }

  return { begin, isCurrent, install, clear, destroy };
}
