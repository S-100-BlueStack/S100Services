import { loadNavbar } from "../features/layout/services/navbarLoader.js";
import { initNavbarNotifications } from "../features/notices/ui/navbarNotifications.js";
import { initNoticePanel } from "../features/notices/ui/noticePanel.js";
import { initNoticeToasts } from "../features/notices/ui/noticeToastRenderer.js";
import { configureArcGIS } from "../shared/config/arcgisConfig.js";
import { registerConfirmDialog } from "../shared/ui/confirm/services/confirmService.js";
import { getCurrentRoute } from "./routing/appRoute.js";
import { initOnboarding } from "../features/onboarding/services/onboardingService.js";
import { initPreferencesPanel } from "../features/preferences/ui/preferencesPanel.js";

export async function initUI() {
  configureArcGIS();

  initNoticeToasts();
  initNoticePanel();

  await loadNavbar();
  initNavbarNotifications();
  registerConfirmDialog();

  const onboarding = initOnboarding({
    routeName: getCurrentRoute().name,
  });
  const preferencesPanel = initPreferencesPanel({
    onStartIntroduction: () => onboarding.startCurrentRoute({ manual: true }),
  });

  return { onboarding, preferencesPanel };
}
