// Package v1 listing has no server text-search parameter; match only fields on the loaded page.
export function matchesLoadedPackage(item, query) {
  const needle = String(query ?? "")
    .trim()
    .toLocaleLowerCase();
  if (!needle) return true;
  return [item?.name, item?.shortId, item?.title].some(
    (value) => typeof value === "string" && value.toLocaleLowerCase().includes(needle)
  );
}
