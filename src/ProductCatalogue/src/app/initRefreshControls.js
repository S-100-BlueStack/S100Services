export function initRefreshControls({ refreshService }) {
  const refreshBtn = document.getElementById("refresh-button");
  const autoSwitch = document.getElementById("auto-refresh-switch");

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      if (refreshService.isRefreshInProgress?.()) {
        return;
      }

      const wasDisabled = refreshBtn.disabled;

      try {
        refreshBtn.loading = true;
        refreshBtn.disabled = true;
        refreshBtn.toggleAttribute("active", true);

        await refreshService.refresh({
          source: "manual",
        });
      } finally {
        refreshBtn.blur();
        refreshBtn.loading = false;
        refreshBtn.disabled = wasDisabled;
        refreshBtn.toggleAttribute("active", false);
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
