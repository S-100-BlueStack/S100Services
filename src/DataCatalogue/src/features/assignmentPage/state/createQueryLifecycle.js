// Each result surface owns one generation, including delayed searches and retries.
export function createQueryLifecycle() {
  let generation = 0;
  let alive = true;
  return {
    begin() {
      const current = ++generation;
      return () => alive && current === generation;
    },
    invalidate() {
      generation++;
    },
    destroy() {
      alive = false;
      generation++;
    },
  };
}
