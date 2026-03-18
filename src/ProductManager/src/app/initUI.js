import { loadNavbar } from "../features/layout/services/navbarLoader.js";
import { initNavbarNotifications } from "../features/notices/ui/navbarNotifications.js";
import { initNoticePanel } from "../features/notices/ui/noticePanel.js";
import { initNoticeToasts } from "../features/notices/ui/noticeToastRenderer.js";
import { configureArcGIS } from "../shared/config/arcgisConfig.js";

export async function initUI() {
  configureArcGIS();

  initNoticeToasts();
  initNoticePanel();

  await loadNavbar();
  initNavbarNotifications();
}
