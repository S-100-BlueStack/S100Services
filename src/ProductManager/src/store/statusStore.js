const statusMap = new Map();
const API_BASE_URL = "https://localhost:7271/";

export async function loadStatuses() {
  const response = await fetch(`${API_BASE_URL}productstates`);

  if (!response.ok) {
    throw new Error("Failed to load product states");
  }

  const data = await response.json();

  data.forEach((state) => {
    statusMap.set(state.Id, state.Name);
  });
}

export function getStatusName(id) {
  return statusMap.get(id) ?? id;
}
