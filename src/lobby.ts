import { navigate } from "./router";
import { loadSettings, saveSettings, resolveTheme } from "./app/settings";
import type { ThemeMode } from "./app/settings";
import { SETTINGS_STORAGE_KEY, BOARD_SIZE_MIN, BOARD_SIZE_MAX, BOARD_SIZE_STEP } from "./app/constants";
import { applyTheme } from "./main";
import * as mp from "./app/multiplayer";

const NAME_STORAGE_KEY = "wess-player-name";

function getPlayerName(): string {
  const input = document.getElementById("player-name-input") as HTMLInputElement | null;
  const name = input?.value.trim() || localStorage.getItem(NAME_STORAGE_KEY) || "Player";
  localStorage.setItem(NAME_STORAGE_KEY, name);
  return name;
}

function initNameInput() {
  const input = document.getElementById("player-name-input") as HTMLInputElement | null;
  if (!input) return;
  const saved = localStorage.getItem(NAME_STORAGE_KEY);
  if (saved) input.value = saved;
  input.addEventListener("change", () => {
    localStorage.setItem(NAME_STORAGE_KEY, input.value.trim() || "Player");
  });
}

function initPlaceholderGrid() {
  const grid = document.querySelector(".placeholder-grid");
  if (!grid) return;

  for (let i = 0; i < 64; i++) {
    const cell = document.createElement("div");
    const row = Math.floor(i / 8);
    cell.style.background = (row + (i % 8)) % 2 === 0
      ? "var(--board-light)"
      : "var(--board-dark)";
    grid.appendChild(cell);
  }
}

function initRangeInputs() {
  const timeRange = document.getElementById("time-range") as HTMLInputElement | null;
  const timeValue = document.getElementById("time-value");
  const incRange = document.getElementById("increment-range") as HTMLInputElement | null;
  const incValue = document.getElementById("increment-value");
  const draftRange = document.getElementById("draft-time-range") as HTMLInputElement | null;
  const draftValue = document.getElementById("draft-time-value");

  timeRange?.addEventListener("input", () => {
    if (timeValue) timeValue.textContent = timeRange.value;
  });

  incRange?.addEventListener("input", () => {
    if (incValue) incValue.textContent = incRange.value;
  });

  draftRange?.addEventListener("input", () => {
    if (draftValue) {
      const secs = Number(draftRange.value);
      draftValue.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    }
  });
}

function initColorPicker() {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".color-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

const DEFAULT_CLOCK_MS = 300000;
const DEFAULT_INCREMENT_MS = 0;
const DEFAULT_DRAFT_MS = 120000;

const TC_PRESETS: Record<string, { clock: number; increment: number }> = {
  bullet: { clock: 60000, increment: 0 },
  blitz: { clock: 180000, increment: 2000 },
  rapid: { clock: 600000, increment: 0 },
  classical: { clock: 1800000, increment: 0 },
};

async function createAndNavigate(clockMs: number, draftMs: number, incrementMs: number = 0) {
  try {
    mp.resetState();
    const name = getPlayerName();
    const result = await mp.createGame(clockMs, draftMs, incrementMs, name);
    window.location.href = `/game/${result.gameId}`;
  } catch {
    alert("Could not create game. Is the server running?");
  }
}

function initNavigation() {
  // Play Now → multiplayer with defaults
  document.querySelector(".play-now-btn")?.addEventListener("click", () => {
    createAndNavigate(DEFAULT_CLOCK_MS, DEFAULT_DRAFT_MS, DEFAULT_INCREMENT_MS);
  });

  // Quick play time control cards → multiplayer with preset
  document.querySelectorAll<HTMLButtonElement>(".tc-card").forEach((card) => {
    card.addEventListener("click", () => {
      const tc = card.dataset.tc ?? "blitz";
      const preset = TC_PRESETS[tc] ?? { clock: DEFAULT_CLOCK_MS, increment: 0 };
      createAndNavigate(preset.clock, DEFAULT_DRAFT_MS, preset.increment);
    });
  });

  // Create Game → multiplayer with custom params
  document.querySelector(".create-game-btn")?.addEventListener("click", () => {
    const timeRange = document.getElementById("time-range") as HTMLInputElement | null;
    const incRange = document.getElementById("increment-range") as HTMLInputElement | null;
    const draftRange = document.getElementById("draft-time-range") as HTMLInputElement | null;
    const clockMs = (Number(timeRange?.value) || 10) * 60000;
    const incrementMs = (Number(incRange?.value) || 0) * 1000;
    const draftMs = (Number(draftRange?.value) || 120) * 1000;
    createAndNavigate(clockMs, draftMs, incrementMs);
  });

  // Playground → local timeless
  document.querySelector(".playground-btn")?.addEventListener("click", () => {
    navigate("/play");
  });

  // Logo → home
  document.querySelector(".site-logo")?.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/");
  });

  // Nav links
  document.querySelectorAll<HTMLAnchorElement>(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      const nav = link.dataset.nav;
      if (nav === "about") {
        navigate("/about");
      } else if (nav === "play") {
        navigate("/");
      }
    });
  });
}

function initThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const settings = loadSettings(SETTINGS_STORAGE_KEY);
    const current = resolveTheme(settings.theme);
    const next: ThemeMode = current === "dark" ? "light" : "dark";
    settings.theme = next;
    saveSettings(SETTINGS_STORAGE_KEY, settings);
    applyTheme();
  });
}

function initBoardSizeSlider() {
  const range = document.getElementById("board-size-range") as HTMLInputElement | null;
  const output = document.getElementById("board-size-value");
  if (!range || !output) return;

  const settings = loadSettings(SETTINGS_STORAGE_KEY);
  const displayValue = settings.boardMaxSize > 0 ? settings.boardMaxSize : 680;
  range.value = String(displayValue);
  output.textContent = settings.boardMaxSize > 0 ? String(settings.boardMaxSize) : "Fit";
  range.min = String(BOARD_SIZE_MIN);
  range.max = String(BOARD_SIZE_MAX);
  range.step = String(BOARD_SIZE_STEP);

  range.addEventListener("input", () => {
    output.textContent = range.value;
    const settings = loadSettings(SETTINGS_STORAGE_KEY);
    settings.boardMaxSize = Number(range.value);
    saveSettings(SETTINGS_STORAGE_KEY, settings);
    window.dispatchEvent(new Event("resize"));
  });

  const fitBtn = document.getElementById("board-size-fit");
  fitBtn?.addEventListener("click", () => {
    const settings = loadSettings(SETTINGS_STORAGE_KEY);
    settings.boardMaxSize = 0;
    saveSettings(SETTINGS_STORAGE_KEY, settings);
    output.textContent = "Fit";
    range.value = "680";
    window.dispatchEvent(new Event("resize"));
  });
}

initPlaceholderGrid();
initNameInput();
initRangeInputs();
initColorPicker();
initNavigation();
initThemeToggle();
initBoardSizeSlider();
