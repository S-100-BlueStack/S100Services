import { getStoredTheme, themes, toggleTheme } from "./themeService.js";

export function registerThemeToggle(view = null) {
  const button = document.getElementById("theme-toggle");
  if (!button) return;

  updateThemeToggle(button);

  button.addEventListener("click", () => {
    toggleTheme(view);
    updateThemeToggle(button);
  });
}

function updateThemeToggle(button) {
  const isDark = getStoredTheme() === themes.dark;
  const nextThemeLabel = isDark ? "Switch to light mode" : "Switch to dark mode";
  const nextThemeIcon = isDark ? "brightness" : "moon";

  button.icon = nextThemeIcon;
  button.label = nextThemeLabel;
  button.title = nextThemeLabel;
}
