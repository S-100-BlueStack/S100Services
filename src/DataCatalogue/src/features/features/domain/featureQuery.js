export function pageItems(items, { page = 0, pageSize = 25 } = {}) {
  const size = Math.max(1, Math.min(100, Math.trunc(Number(pageSize)) || 25));
  const index = Math.max(
    0,
    Math.min(Math.ceil(items.length / size) - 1, Math.trunc(Number(page)) || 0)
  );
  return {
    items: items.slice(index * size, (index + 1) * size),
    total: items.length,
    page: index,
    pageSize: size,
  };
}

export function matchesFeature(feature, { type = "", status = "", search = "" } = {}) {
  return (
    (!type || feature.type === type) &&
    (!status || feature.status === status) &&
    feature.name.toLowerCase().includes(search.trim().toLowerCase())
  );
}
