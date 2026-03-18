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

// export async function changeFreezeState(datasetName, frozen) {
//   try {
//     const response = await fetch(`${API_BASE_URL}freeze/${datasetName}`, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       credentials: "include",
//       body: JSON.stringify({ frozen }),
//     });

//     if (!response.ok) {
//       return {
//         success: false,
//         status: response.status,
//         statusText: response.statusText,
//       };
//     }

//     return { success: true };
//   } catch {
//     return { success: false, networkError: true };
//   }
// }
export async function changeFreezeState(datasetName, state) {
  const ranNum = Math.floor(Math.random() * (3 - 1) + 1);
  switch (ranNum) {
    case 1:
      return {
        success: true,
        status: 200,
        data: { frozen: state },
      };
    case 2:
      return {
        success: false,
        status: 500,
        statusText: "Internal Server Error",
      };
    case 3:
      return {
        success: false,
        networkError: true,
        error: "Simulated network error",
      };
    default:
      return {
        success: false,
        status: 500,
        statusText: "Internal Server Error",
      };
  }
}
