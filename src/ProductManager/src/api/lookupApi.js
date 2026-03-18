const API_BASE_URL = "https://localhost:7271/";

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
// export async function changeFreezeState(datasetName, state) {
//   try {
//     const response = await fetch(`${API_BASE_URL}${datasetName}/state`, {
//       method: "PUT",
//       credentials: "include",
//     });

//     if (!response.ok) {
//       return {
//         success: false,
//         status: response.status,
//         statusText: response.statusText,
//       };
//     }

//     return {
//       success: true,
//       status: response.status,
//       data: await response.json(),
//     };
//   } catch (error) {
//     return {
//       success: false,
//       networkError: true,
//       error: error.message,
//     };
//   }
// }
