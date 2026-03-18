const API_BASE_URL = "https://localhost:7271/";

export async function uploadProduct(datasetName) {
  try {
    const response = await fetch(`${API_BASE_URL}${datasetName}`, {
      method: "PUT",
      credentials: "include",
    });

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        statusText: response.statusText,
      };
    }

    return { success: true };
  } catch {
    return { success: false, networkError: true };
  }
}

export async function changeFreezeState(datasetName, frozen) {
  try {
    const response = await fetch(`${API_BASE_URL}freeze/${datasetName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ frozen }),
    });

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        statusText: response.statusText,
      };
    }

    return { success: true };
  } catch {
    return { success: false, networkError: true };
  }
}
