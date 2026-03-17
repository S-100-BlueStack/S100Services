export async function loadAppData() {
  const result = {
    statuses: null,
    usages: null,
    geoJson: null,
  };

  // Kør parallelt hvor muligt
  const [statuses, usages] = await Promise.all([loadStatuses(), loadUsages()]);

  result.statuses = statuses;
  result.usages = usages;

  // GeoJSON separat (ofte den der fejler)
  result.geoJson = await fetchGeoJson();

  return result;
}

// isolér fetch så den kan retries alene hvis nødvendigt
export async function fetchGeoJson() {
  const response = await fetch("https://localhost:7271/mock/products");

  if (!response.ok) {
    throw new Error(`GeoJSON request failed: ${response.status}`);
  }

  return await response.json();
}
