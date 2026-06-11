import { getCurrentTheme, themes, toggleTheme } from "./themeService.js";

export function registerThemeToggle(view = null) {
  const button = document.getElementById("theme-toggle");
  if (!button) return;

  syncThemeToggle();

  button.addEventListener("click", () => {
    toggleTheme(view);
    syncThemeToggle();
  });
}

export function syncThemeToggle() {
  const button = document.getElementById("theme-toggle");

  if (!button) {
    return;
  }

  updateThemeToggle(button);
}

function updateThemeToggle(button) {
  const isDark = getCurrentTheme() === themes.dark;
  const nextThemeLabel = isDark ? "Switch to light mode" : "Switch to dark mode";
  const nextThemeIcon = isDark ? "brightness" : "moon";

  button.icon = nextThemeIcon;
  button.label = nextThemeLabel;
  button.title = nextThemeLabel;
}
