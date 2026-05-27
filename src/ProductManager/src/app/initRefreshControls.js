export function initRefreshControls({ refreshService }) {
  const refreshBtn = document.getElementById("refresh-button");
  const autoSwitch = document.getElementById("auto-refresh-switch");

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      try {
        refreshBtn.loading = true;

        await refreshService.refresh({
          source: "manual",
        });
      } finally {
        refreshBtn.blur();
        refreshBtn.loading = false;
      }
    });
  }

  if (autoSwitch) {
    autoSwitch.checked = refreshService.isAutoEnabled?.() ?? true;

    autoSwitch.addEventListener("calciteSwitchChange", (event) => {
      refreshService.setAuto(event.target.checked);
    });
  }
}
