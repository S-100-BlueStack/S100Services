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

    return {
      success: true,
      status: response.status,
      data: await response.json(),
    };
  } catch (error) {
    return {
      success: false,
      networkError: true,
      error: error.message,
    };
  }
}
