export async function initUI() {
  configureArcGIS();

  initNoticeToasts();
  initNoticePanel();

  await loadNavbar();
  initNavbarNotifications();
  initRefreshControls();
}
