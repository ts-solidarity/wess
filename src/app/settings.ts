import { DEFAULT_SETTINGS, FX_PROFILES } from "./constants";

export type FxProfile = typeof FX_PROFILES[keyof typeof FX_PROFILES];

export interface Settings {
  soundEnabled: boolean;
  fxIntensity: string;
  motionMode: string;
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

export function loadSettings(storageKey: string, storage: Storage = window.localStorage): Settings {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(raw);
    return {
      soundEnabled: parsed?.soundEnabled !== false,
      fxIntensity: normalizeFxIntensity(parsed?.fxIntensity),
      motionMode: normalizeMotionMode(parsed?.motionMode),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
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
