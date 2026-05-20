import { apiRequest } from "../../../shared/api/apiClient.js";

export async function uploadProduct(datasetName) {
  return apiRequest(datasetName, {
    method: "PUT",
  });
}

// Aktivér den her, når backend-endpointet er klar.
export async function changeFreezeState(datasetName, state) {
  if (state === true) {
    return apiRequest(`upload/${encodeURIComponent(datasetName)}/freeze`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
    });
  } else {
    return apiRequest(`upload/${encodeURIComponent(datasetName)}/unfreeze`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
// export async function changeFreezeState(datasetName, state) {
//   const ranNum = Math.floor(Math.random() * (3 - 1) + 1);
//   switch (ranNum) {
//     case 1:
//       return {
//         success: true,
//         status: 200,
//         data: { frozen: state },
//       };
//     case 2:
//       return {
//         success: false,
//         status: 500,
//         statusText: "Internal Server Error",
//       };
//     case 3:
//       return {
//         success: false,
//         networkError: true,
//         error: "Simulated network error",
//       };
//     default:
//       return {
//         success: false,
//         status: 500,
//         statusText: "Internal Server Error",
//       };
//   }
// }
