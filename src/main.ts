import "./lobby";
import { startRouter } from "./router";
import { loadSettings, resolveTheme } from "./app/settings";
import { SETTINGS_STORAGE_KEY } from "./app/constants";

let controllerLoaded = false;

// Apply theme immediately to prevent flash
export function applyTheme() {
  const settings = loadSettings(SETTINGS_STORAGE_KEY);
  const resolved = resolveTheme(settings.theme);
  document.documentElement.dataset.theme = resolved;
}

applyTheme();

// React to OS theme changes when set to "system"
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  const settings = loadSettings(SETTINGS_STORAGE_KEY);
  if (settings.theme === "system") {
    applyTheme();
  }
});

const views = ["lobby", "about", "game"] as const;

function showView(name: typeof views[number]) {
  for (const v of views) {
    const el = document.querySelector<HTMLElement>(`[data-view="${v}"]`);
    if (el) el.hidden = v !== name;
  }
}

startRouter(async (route) => {
  if (route.type === "lobby") {
    showView("lobby");
  } else if (route.type === "about") {
    showView("about");
  } else {
    showView("game");
    if (!controllerLoaded) {
      controllerLoaded = true;
      await import("./app/controller");
    }
  }
});
