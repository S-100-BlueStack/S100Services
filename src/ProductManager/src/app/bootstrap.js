async function waitForCalcite() {
  await customElements.whenDefined("calcite-loader");
}
export async function bootstrap() {
  try {
    await waitForCalcite();
    showLoader("Initializing application...");

    await initUI();

    setLoaderText("Initializing map...");
    initMap();

    await loadDataIncrementally();
  } catch (error) {
    hideLoader();
    noticeError(`Application failed: ${error.message}`);
  }
}
