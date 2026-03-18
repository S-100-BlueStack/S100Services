export function initRefreshControls() {
  const refreshBtn = document.getElementById("refresh-button");
  const autoSwitch = document.getElementById("auto-refresh-switch");

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.loading = true;

      await refreshService.refresh();
      refreshBtn.blur(); // fjerner stuck hover/active
      refreshBtn.loading = false;
    });
  }

  if (autoSwitch) {
    autoSwitch.addEventListener("calciteSwitchChange", (e) => {
      refreshService.setAuto(e.target.checked);
    });
  }
}
