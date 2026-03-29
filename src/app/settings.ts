import { DEFAULT_SETTINGS, FX_PROFILES, BOARD_SIZE_MIN, BOARD_SIZE_MAX } from "./constants";

export type FxProfile = typeof FX_PROFILES[keyof typeof FX_PROFILES];
export type ThemeMode = "system" | "light" | "dark";

export interface Settings {
  soundEnabled: boolean;
  fxIntensity: string;
  motionMode: string;
  boardMaxSize: number;
  theme: ThemeMode;
}

export function normalizeFxIntensity(value: unknown): string {
  return value === "low" || value === "medium" || value === "full"
    ? value
    : DEFAULT_SETTINGS.fxIntensity;
}

export function normalizeMotionMode(value: unknown): string {
  return value === "system" || value === "full" || value === "reduced"
    ? value
    : DEFAULT_SETTINGS.motionMode;
}

export function normalizeBoardMaxSize(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_SETTINGS.boardMaxSize;
  if (num <= 0) return 0;
  return Math.max(BOARD_SIZE_MIN, Math.min(BOARD_SIZE_MAX, Math.round(num)));
}

export function normalizeTheme(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : DEFAULT_SETTINGS.theme as ThemeMode;
}

export function loadSettings(storageKey: string, storage: Storage = window.localStorage): Settings {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return { ...DEFAULT_SETTINGS } as Settings;
    }

    const parsed = JSON.parse(raw);
    return {
      soundEnabled: parsed?.soundEnabled !== false,
      fxIntensity: normalizeFxIntensity(parsed?.fxIntensity),
      motionMode: normalizeMotionMode(parsed?.motionMode),
      boardMaxSize: normalizeBoardMaxSize(parsed?.boardMaxSize),
      theme: normalizeTheme(parsed?.theme),
    };
  } catch {
    return { ...DEFAULT_SETTINGS } as Settings;
  }
}

export function resolveTheme(theme: ThemeMode): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return theme;
}

export function saveSettings(storageKey: string, settings: Settings, storage: Storage = window.localStorage): boolean {
  try {
    storage.setItem(storageKey, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function getFxProfile(settings: Settings): FxProfile {
  return FX_PROFILES[settings.fxIntensity as keyof typeof FX_PROFILES] ?? FX_PROFILES.full;
}

export function prefersReducedMotion(settings: Settings, reducedMotionQuery: MediaQueryList | null): boolean {
  if (settings.motionMode === "reduced") {
    return true;
  }

  if (settings.motionMode === "full") {
    return false;
  }

  return reducedMotionQuery?.matches ?? false;
}
