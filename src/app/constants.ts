import { PIECE_DEFINITIONS } from "../domain/piece-movement";

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export const PIECE_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(PIECE_DEFINITIONS).map(([key, def]) => [key, def.displayName]),
);

export const DRAG_MOVE_THRESHOLD = 6;
export const TOUCH_DRAG_HOLD_MS = 160;
export const MOVE_ANIMATION_MS = 300;
export const CASTLE_ANIMATION_MS = 360;
export const CAPTURE_FADE_MS = 200;
export const IMPACT_FLASH_MS = 240;
export const PROMOTION_BEAM_MS = 430;
export const PROMOTION_RESOLVE_MS = 220;
export const SOURCE_PULSE_MS = 150;
export const LANDING_PULSE_MS = 210;
export const EN_PASSANT_SLASH_MS = 160;
export const CHECK_STREAK_MS = 180;
export const CHECK_PULSE_MS = 760;
export const MATE_FLASH_MS = 980;
export const FORK_LANDING_PULSE_MS = 260;
export const FORK_BRANCH_STREAK_MS = 220;
export const FORK_BRANCH_LINGER_MS = 90;
export const FORK_QUEEN_STREAK_MS = 240;
export const FORK_QUEEN_LINGER_MS = 70;
export const FORK_TARGET_RING_MS = 420;
export const FORK_TARGET_SPARK_MS = 220;
export const FORK_TARGET_STAGGER_MS = 24;
export const FORK_BEAM_MS = 360;
export const FORK_FLASH_MS = 440;
export const FORK_RETICLE_MS = 520;
export const TRAIL_WINDOW = 0.36;

export const SETTINGS_STORAGE_KEY = "wess-settings-v1";
export const SESSION_STORAGE_KEY = "wess-session-v2";

export const CLOCK_UPDATE_MS = 200;
export const DEFAULT_CLOCK_MS = 300000;
export const REPLAY_STEP_DELAY_MS = 220;
export const CLOCK_PRESETS = new Set([180000, 300000, 600000]);

export const FX_PROFILES = {
  low: {
    alphaScale: 0.56,
    sizeScale: 0.72,
    glowScale: 0.7,
    soundScale: 0.66,
    blurScale: 0.52,
    sparkScale: 0.38,
    detailScale: 0.72,
    dprCap: 1,
  },
  medium: {
    alphaScale: 0.8,
    sizeScale: 0.86,
    glowScale: 0.84,
    soundScale: 0.84,
    blurScale: 0.68,
    sparkScale: 0.62,
    detailScale: 0.84,
    dprCap: 1.3,
  },
  full: {
    alphaScale: 1,
    sizeScale: 1,
    glowScale: 1,
    soundScale: 1,
    blurScale: 0.82,
    sparkScale: 0.82,
    detailScale: 0.92,
    dprCap: 1.5,
  },
};

export const DEFAULT_SETTINGS = {
  soundEnabled: true,
  fxIntensity: "full",
  motionMode: "system",
  boardMaxSize: 0,
  theme: "system",
};

export const BOARD_SIZE_MIN = 400;
export const BOARD_SIZE_MAX = 920;
export const BOARD_SIZE_STEP = 40;
