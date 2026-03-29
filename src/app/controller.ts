import { ChessGame } from "../domain/chess-game";
import type { PieceColor, PieceType, Move, PublicSnapshot } from "../domain/chess-game";
import { getPromotionTargets } from "../domain/piece-movement";
import { showDraft, hideDraft, getCurrentPlacements } from "./draft-controller";
import { draftsToFen } from "../domain/draft";
import type { DraftPlacement } from "../domain/draft";
import {
  PIECE_NAMES,
  SESSION_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  CLOCK_UPDATE_MS,
  REPLAY_STEP_DELAY_MS,
} from "./constants";
import {
  loadSettings,
  saveSettings,
  getFxProfile as getSettingsFxProfile,
  prefersReducedMotion as settingsPrefersReducedMotion,
} from "./settings";
import { createAudioController } from "../ui/audio-controller";
import {
  normalizeClockPreset,
  createClockSnapshot,
  cloneClockSnapshot,
  normalizeTimelineMove,
  createEmptySession,
  formatClockValue,
  buildClockSnapshotsForMoves,
  normalizeStoredSession as normalizePersistedSession,
  buildPgnText as buildPgnExportText,
  parsePgnMoves as parsePgnText,
} from "../domain/session";
import type { ClockSnapshot, Session, TimelineMove } from "../domain/session";
import {
  coordsToSquare,
  colorName,
  findKingSquare,
  describePosition,
  getVisualCellForSquare as projectSquareToVisualCell,
  getBoardCoordsForVisualCell as projectBoardCoords,
  buildSquareAria,
  pieceAriaLabel,
} from "../ui/board-helpers";
import { createAnimationController } from "../ui/animation-controller";
import { createBoardInput } from "../ui/board-input";
import { createBoardScene } from "../ui/board-scene";
import type { SquareLayout, ElementLayout } from "../ui/board-scene";
import { renderPieceSvg } from "../ui/piece-set";
import * as mp from "./multiplayer";

const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;

let settings = loadSettings(SETTINGS_STORAGE_KEY);

function getSettings() {
  return settings;
}

const game = new ChessGame();

let orientation: PieceColor = "w";
let selectedSquare: string | null = null;
let legalMoves: Move[] = [];
let pendingPromotionMove: Move | null = null;
let resizeFrame: number | null = null;
let layoutObserver: ResizeObserver | null = null;
let currentState = game.snapshot();
const START_FEN = currentState.fen;

const boardElement = document.querySelector<HTMLElement>("#board")!;
const boardPanelElement = document.querySelector<HTMLElement>(".board-panel");
const boardWrapElement = document.querySelector<HTMLElement>(".board-wrap");
const statusTextElement = document.querySelector<HTMLElement>("#status-text")!;
const turnBadgeElement = document.querySelector<HTMLElement>("#turn-badge")!;
const checkBadgeElement = document.querySelector<HTMLElement>("#check-badge")!;
const moveCounterElement = document.querySelector<HTMLElement>("#move-counter")!;
const orientationBadgeElement = document.querySelector<HTMLElement>("#orientation-badge")!;
const historyListElement = document.querySelector<HTMLElement>("#history-list")!;
const fenTextElement = document.querySelector<HTMLElement>("#fen-text")!;
const promotionDialog = document.querySelector<HTMLDialogElement>("#promotion-dialog")!;
const promotionTitleElement = document.querySelector<HTMLElement>("#promotion-title")!;
const promotionOptionsElement = document.querySelector<HTMLElement>("#promotion-options")!;
const copyFenButton = document.querySelector<HTMLButtonElement>("#copy-fen-button")!;
const flipButton = document.querySelector<HTMLButtonElement>("#flip-button")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset-button")!;
const promotionCancelButton = document.querySelector<HTMLButtonElement>("#promotion-cancel")!;
const sessionCardElement = document.querySelector<HTMLElement>("#session-card");
const whiteClockElement = document.querySelector<HTMLElement>("#white-clock");
const blackClockElement = document.querySelector<HTMLElement>("#black-clock");
const timelineBadgeElement = document.querySelector<HTMLElement>("#timeline-badge");
const timelineModeElement = document.querySelector<HTMLElement>("#timeline-mode");
const timelineTextElement = document.querySelector<HTMLElement>("#timeline-text");
const sessionNoteElement = document.querySelector<HTMLElement>("#session-note");
const jumpStartButton = document.querySelector<HTMLButtonElement>("#jump-start-button")!;
const undoButton = document.querySelector<HTMLButtonElement>("#undo-button")!;
const redoButton = document.querySelector<HTMLButtonElement>("#redo-button")!;
const jumpEndButton = document.querySelector<HTMLButtonElement>("#jump-end-button")!;
const replayButton = document.querySelector<HTMLButtonElement>("#replay-button")!;
const liveButton = document.querySelector<HTMLButtonElement>("#live-button")!;
const saveSessionButton = document.querySelector<HTMLButtonElement>("#save-session-button")!;
const restoreSessionButton = document.querySelector<HTMLButtonElement>("#restore-session-button")!;
const clearSessionButton = document.querySelector<HTMLButtonElement>("#clear-session-button")!;
const exportPgnButton = document.querySelector<HTMLButtonElement>("#export-pgn-button")!;
const copyPgnButton = document.querySelector<HTMLButtonElement>("#copy-pgn-button")!;
const importPgnButton = document.querySelector<HTMLButtonElement>("#import-pgn-button")!;
const pgnTextarea = document.querySelector<HTMLTextAreaElement>("#pgn-textarea")!;
const pgnStatusElement = document.querySelector<HTMLElement>("#pgn-status");
const utilityBackdropElement = document.querySelector<HTMLElement>("#utility-backdrop");
const utilityDrawerElement = document.querySelector<HTMLElement>("#utility-drawer");
const utilityTabListElement = document.querySelector<HTMLElement>("#utility-tablist");
const utilityTabElements = [...document.querySelectorAll<HTMLButtonElement>("[data-utility-tab]")];
const utilityPanelElements = [...document.querySelectorAll<HTMLElement>("[data-utility-panel]")];
const turnChipElement = turnBadgeElement?.closest(".status-chip");
const checkChipElement = checkBadgeElement?.closest(".status-chip");
const orientationChipElement = orientationBadgeElement?.closest(".status-chip");
let activeUtilityTab = utilityTabElements.find((button) => button.getAttribute("aria-expanded") === "true")
  ?.dataset.utilityTab ?? null;
let lastUtilityTriggerButton: HTMLButtonElement | null = null;

let session: Session = createEmptySession(START_FEN);

function getVisualCellForSquare(square: string) {
  return projectSquareToVisualCell(square, orientation);
}

function getBoardCoordsForVisualCell(visualRow: number, visualCol: number) {
  return projectBoardCoords(visualRow, visualCol, orientation);
}

const boardScene = createBoardScene({
  boardElement,
  coordsToSquare,
  findKingSquare,
  buildSquareAria,
  pieceAriaLabel,
  renderPieceSvg,
  getVisualCellForSquare,
  getBoardCoordsForVisualCell,
  getSelectedSquare: () => selectedSquare,
  getLegalMoves: () => legalMoves,
  getPendingPromotionMove: () => pendingPromotionMove,
  hasClockExpired,
  isReplayActive,
  getFxProfile,
});

const { scene } = boardScene;
const {
  applyMoveToScene,
  getBoardMetrics,
  getDraggedPieceLayout,
  getElementLayout,
  getLayoutCenter,
  getSquareFromPointer,
  getSquareLayout,
  initializeBoardScene,
  pinPieceElementToLayout,
  positionAllPieces,
  positionDraggedPiece,
  refreshBoardScene,
  resetScenePiecesFromSnapshot,
  syncFxLayerSize,
  updateBoardClocks,
} = boardScene;

function getFxProfile() {
  return getSettingsFxProfile(settings);
}

function setUtilityTab(tabId: string | null, options: { focus?: boolean; focusTarget?: HTMLElement | null } = {}) {
  const selectedButton = tabId
    ? utilityTabElements.find((button) => button.dataset.utilityTab === tabId) ?? null
    : null;
  const isOpen = Boolean(selectedButton);

  activeUtilityTab = selectedButton?.dataset.utilityTab ?? null;
  if (selectedButton) {
    lastUtilityTriggerButton = selectedButton;
  }

  utilityTabElements.forEach((button) => {
    const isActive = button === selectedButton;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-expanded", String(isActive));
    button.setAttribute("aria-selected", String(isActive));
  });

  utilityPanelElements.forEach((panel) => {
    const isActive = panel.dataset.utilityPanel === activeUtilityTab;
    panel.hidden = !isActive;
    panel.classList.toggle("active", isActive);
    panel.setAttribute("aria-hidden", String(!isActive));
  });

  utilityDrawerElement?.classList.toggle("open", isOpen);
  utilityBackdropElement?.classList.toggle("open", isOpen);
  utilityBackdropElement?.setAttribute("aria-hidden", String(!isOpen));

  if (options.focus) {
    const focusTarget = options.focusTarget
      ?? selectedButton
      ?? lastUtilityTriggerButton
      ?? utilityTabElements[0];
    focusTarget?.focus();
  }
}

function prefersReducedMotion() {
  return settingsPrefersReducedMotion(settings, reducedMotionQuery);
}

function isAnimationActive() {
  return scene.animation.active;
}

const audioController = createAudioController({
  AudioContextCtor: window.AudioContext ?? (window as any).webkitAudioContext ?? null,
  getSettings,
  getFxProfile: () => getSettingsFxProfile(settings),
  onStateChange: () => {},
});

function primeAudio() {
  audioController.prime();
}

function scheduleMoveAudio(record: Move, state: PublicSnapshot, moveDuration: number) {
  audioController.scheduleMoveAudio(record, state, moveDuration);
}

function isLatestTimelinePosition() {
  return session.currentPly === session.moves.length;
}

function isReplayActive() {
  return session.replaying;
}

function hasClockExpired() {
  return Boolean(session.timeoutWinner);
}

function resolveUiTone(state: PublicSnapshot) {
  if (session.timeoutWinner || state.result.reason === "checkmate") {
    return "critical";
  }

  if (state.check) {
    return "warning";
  }

  if (isReplayActive()) {
    return "replay";
  }

  if (!isLatestTimelinePosition()) {
    return "review";
  }

  return "live";
}

function setSessionNote(text: string, tone: string = "muted") {
  if (!sessionNoteElement) {
    return;
  }

  sessionNoteElement.textContent = text;
  sessionNoteElement.dataset.tone = tone;
  sessionNoteElement.hidden = !text;
}

function setPgnStatus(text: string, tone: string = "muted") {
  if (!pgnStatusElement) {
    return;
  }

  pgnStatusElement.textContent = text;
  pgnStatusElement.dataset.tone = tone;
  pgnStatusElement.hidden = !text;
}

function getStoredClockSnapshot(ply = session.currentPly) {
  const snapshot = session.clockSnapshots[ply] ?? session.clockSnapshots[session.clockSnapshots.length - 1];
  return cloneClockSnapshot(snapshot ?? createClockSnapshot(session.clockInitialMs));
}

function getDisplayedClockSnapshot(now = Date.now()) {
  const snapshot = getStoredClockSnapshot();

  if (!isLatestTimelinePosition() || isReplayActive() || hasClockExpired() || currentState.result.over) {
    return snapshot;
  }

  if (snapshot.activeColor !== "w" && snapshot.activeColor !== "b") {
    return snapshot;
  }

  const elapsed = Math.max(now - session.liveClockStartedAt, 0);
  const key = snapshot.activeColor === "w" ? "whiteMs" : "blackMs";
  snapshot[key] = Math.max(snapshot[key] - elapsed, 0);
  return snapshot;
}

function commitCurrentClockSnapshot() {
  const snapshot = getDisplayedClockSnapshot();
  session.clockSnapshots[session.currentPly] = snapshot;
  session.liveClockStartedAt = Date.now();
  return snapshot;
}

function getSessionResultText() {
  if (session.timeoutWinner) {
    return session.timeoutWinner === "w" ? "1-0" : "0-1";
  }

  if (!currentState.result.over) {
    return "*";
  }

  if (currentState.result.winner === "w") {
    return "1-0";
  }

  if (currentState.result.winner === "b") {
    return "0-1";
  }

  return "1/2-1/2";
}

function persistSession(options: { silent?: boolean } = {}) {
  if (mp.isMultiplayer()) return;
  try {
    const currentClock = getDisplayedClockSnapshot();
    const storedSnapshots = session.clockSnapshots.map((snapshot, index) => (
      index === session.currentPly ? currentClock : cloneClockSnapshot(snapshot)
    ));

    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      initialFen: session.initialFen,
      moves: session.moves,
      currentPly: session.currentPly,
      clockInitialMs: session.clockInitialMs,
      clockSnapshots: storedSnapshots,
      orientation,
      timeoutWinner: session.timeoutWinner,
      savedAt: Date.now(),
    }));

    if (!options.silent) {
      setSessionNote("Session saved.", "ready");
    }
  } catch (error) {
    console.warn("Session save failed:", error);
    if (!options.silent) {
      setSessionNote("Session could not be saved.", "warn");
    }
  }
}

function clearStoredSession(options: { silent?: boolean } = {}) {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    if (!options.silent) {
      setSessionNote("Saved session cleared.", "muted");
    }
  } catch (error) {
    console.warn("Session clear failed:", error);
    if (!options.silent) {
      setSessionNote("Saved session could not be cleared.", "warn");
    }
  }
}

function rebuildGameToPly(ply: number) {
  if (session.initialFen === START_FEN) {
    game.reset();
  } else {
    game.loadFen(session.initialFen!);
  }

  let record: Move | null = null;

  for (let index = 0; index < ply; index += 1) {
    const move = session.moves[index];
    record = game.makeMove(move.from, move.to, move.promotion);
    if (!record) {
      throw new Error(`Could not rebuild move ${index + 1}.`);
    }
  }

  currentState = game.snapshot();
  return {
    record,
    state: currentState,
  };
}

function normalizeStoredSession(data: unknown) {
  return normalizePersistedSession(data, { startFen: START_FEN });
}

function applySessionData(data: unknown, options: { noteText?: string | null; noteTone?: string } = {}) {
  const normalized = normalizeStoredSession(data);
  if (!normalized) {
    throw new Error("Session data is invalid.");
  }

  pendingPromotionMove = null;
  closePromotionDialog();
  clearSelection();
  resetDragState();
  clearFxEffects();

  session = {
    initialFen: normalized.initialFen,
    moves: normalized.moves,
    currentPly: normalized.currentPly,
    clockInitialMs: normalized.clockInitialMs,
    clockSnapshots: normalized.clockSnapshots,
    liveClockStartedAt: Date.now(),
    replayToken: session.replayToken + 1,
    replaying: false,
    timeoutWinner: normalized.timeoutWinner,
  };

  orientation = normalized.orientation;
  rebuildGameToPly(session.currentPly);
  resetScenePiecesFromSnapshot(currentState);
  renderSnapshot(currentState);
  queueBoardResize();

  if (options.noteText != null) {
    setSessionNote(options.noteText, options.noteTone ?? "ready");
  }
}

function restorePersistedSession(options: { silent?: boolean } = {}) {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      if (!options.silent) {
        setSessionNote("No saved session found.", "muted");
      }
      return false;
    }

    const parsed = JSON.parse(raw);
    applySessionData(parsed, {
      noteText: options.silent ? null : "Saved session restored.",
      noteTone: "ready",
    });
    return true;
  } catch (error) {
    console.warn("Session restore failed:", error);
    if (!options.silent) {
      setSessionNote("Saved session could not be restored.", "warn");
    }
    return false;
  }
}

function handleClockExpiration(snapshot: ClockSnapshot) {
  const expiredColor = snapshot.activeColor;
  if (expiredColor !== "w" && expiredColor !== "b") {
    return;
  }

  const key = expiredColor === "w" ? "whiteMs" : "blackMs";
  snapshot[key] = 0;
  snapshot.activeColor = null;
  session.clockSnapshots[session.currentPly] = snapshot;
  session.timeoutWinner = expiredColor === "w" ? "b" : "w";
  session.liveClockStartedAt = Date.now();
  clearSelection();
  resetDragState();
  render();
  persistSession({ silent: true });
  setSessionNote(`Time. ${colorName(session.timeoutWinner)} wins.`, "warn");
}

const gameBoardCol = document.querySelector<HTMLElement>(".game-board-col");
const gameBanner = document.getElementById("game-banner");

function showGameBanner(text: string, style: "info" | "result" | "warn" = "info") {
  if (!gameBanner) return;
  gameBanner.textContent = text;
  gameBanner.className = `game-banner ${style}`;
  gameBanner.hidden = false;
}

function hideGameBanner() {
  if (gameBanner) gameBanner.hidden = true;
}

let firstMoveTimer: ReturnType<typeof setInterval> | null = null;

function startFirstMoveCountdown(deadlineMs: number) {
  stopFirstMoveCountdown();
  firstMoveTimer = setInterval(() => {
    const remaining = Math.max(0, deadlineMs - Date.now());
    const secs = Math.ceil(remaining / 1000);
    if (remaining > 0) {
      const whoseTurn = session.moves.length === 0 ? "White" : "Black";
      showGameBanner(`${whoseTurn}'s first move — ${secs}s`, "info");
    } else {
      stopFirstMoveCountdown();
    }
  }, 250);
}

function stopFirstMoveCountdown() {
  if (firstMoveTimer) {
    clearInterval(firstMoveTimer);
    firstMoveTimer = null;
  }
}

function renderClockState() {
  if (gameBoardCol) gameBoardCol.dataset.orientation = orientation;

  const snapshot = getDisplayedClockSnapshot();
  const activeColor = (
    !isReplayActive()
    && !hasClockExpired()
    && isLatestTimelinePosition()
    && !currentState.result.over
  ) ? snapshot.activeColor : null;

  whiteClockElement?.classList.toggle("active", activeColor === "w");
  blackClockElement?.classList.toggle("active", activeColor === "b");
  whiteClockElement?.classList.toggle("expired", snapshot.whiteMs <= 0);
  blackClockElement?.classList.toggle("expired", snapshot.blackMs <= 0);

  const whiteValue = whiteClockElement?.querySelector(".clock-value");
  const blackValue = blackClockElement?.querySelector(".clock-value");
  if (whiteValue) {
    whiteValue.textContent = formatClockValue(snapshot.whiteMs);
  }
  if (blackValue) {
    blackValue.textContent = formatClockValue(snapshot.blackMs);
  }

  updateBoardClocks(snapshot.whiteMs, snapshot.blackMs, activeColor, mp.isMultiplayer());

  if (
    !hasClockExpired()
    && isLatestTimelinePosition()
    && !isReplayActive()
    && !currentState.result.over
    && (snapshot.activeColor === "w" || snapshot.activeColor === "b")
  ) {
    const key = snapshot.activeColor === "w" ? "whiteMs" : "blackMs";
    if (snapshot[key] <= 0) {
      handleClockExpiration(snapshot);
    }
  }
}

function renderSessionState() {
  renderClockState();

  const timelineMode = isReplayActive()
    ? "Replay"
    : isLatestTimelinePosition()
      ? "Live"
      : "Review";

  if (timelineModeElement) {
    timelineModeElement.textContent = timelineMode;
  }

  if (timelineTextElement) {
    timelineTextElement.textContent = `${session.currentPly} / ${session.moves.length}`;
  }

  timelineBadgeElement?.classList.toggle("active", isLatestTimelinePosition() && !isReplayActive());
  if (timelineBadgeElement instanceof HTMLElement) {
    timelineBadgeElement.dataset.mode = timelineMode.toLowerCase();
  }

  const clockButtons = sessionCardElement?.querySelectorAll<HTMLElement>("[data-clock-preset]") ?? [];
  clockButtons.forEach((button) => {
    const isActive = normalizeClockPreset(button.dataset.clockPreset) === session.clockInitialMs;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  jumpStartButton.disabled = session.currentPly === 0 || isReplayActive() || isAnimationActive();
  undoButton.disabled = session.currentPly === 0 || isReplayActive() || isAnimationActive();
  redoButton.disabled = session.currentPly >= session.moves.length || isReplayActive() || isAnimationActive();
  jumpEndButton.disabled = session.currentPly >= session.moves.length || isReplayActive() || isAnimationActive();
  liveButton.disabled = isLatestTimelinePosition() || isReplayActive() || isAnimationActive();
  replayButton.disabled = session.moves.length === 0 || isAnimationActive();
  replayButton.textContent = isReplayActive() ? "Stop" : "Replay";

  if (!hasClockExpired()) {
    if (isReplayActive()) {
      setSessionNote(`Replaying move ${session.currentPly} of ${session.moves.length}.`, "warn");
    } else if (!isLatestTimelinePosition()) {
      setSessionNote(`Reviewing move ${session.currentPly} of ${session.moves.length}. New moves branch from here.`, "muted");
    }
  }
}

async function navigateToPly(targetPly: number, options: { keepReplay?: boolean; animateForward?: boolean } = {}) {
  const clampedTarget = Math.min(Math.max(targetPly, 0), session.moves.length);
  if (clampedTarget === session.currentPly) {
    renderSessionState();
    return;
  }

  if (!options.keepReplay) {
    session.replaying = false;
    session.replayToken += 1;
  }

  pendingPromotionMove = null;
  closePromotionDialog();
  clearSelection();
  resetDragState();

  if (options.animateForward && clampedTarget === session.currentPly + 1) {
    const move = session.moves[session.currentPly];
    const beforeState = currentState;
    const record = game.makeMove(move.from, move.to, move.promotion);
    const afterState = game.snapshot();

    session.currentPly = clampedTarget;
    refreshBoardScene(beforeState);
    await queueSceneAnimation(() => animateSceneMove(record!, afterState, {
      effectStartLayout: getSquareLayout(record!.from) ?? undefined,
    }));
  } else {
    rebuildGameToPly(clampedTarget);
    resetScenePiecesFromSnapshot(currentState);
    renderSnapshot(currentState);
  }

  session.currentPly = clampedTarget;
  session.liveClockStartedAt = Date.now();
  renderSessionState();
  persistSession({ silent: true });
}

async function setClockPreset(clockInitialMs: unknown) {
  const normalized = normalizeClockPreset(clockInitialMs);

  pendingPromotionMove = null;
  closePromotionDialog();
  clearSelection();
  resetDragState();
  clearFxEffects();
  game.reset();
  currentState = game.snapshot();

  session = createEmptySession(START_FEN, normalized);
  orientation = "w";
  resetScenePiecesFromSnapshot(currentState);
  render();
  queueBoardResize();
  persistSession({ silent: true });
  setSessionNote(`Clock set to ${Math.floor(normalized / 60000)} minutes.`, "ready");
}

async function startReplay() {
  if (session.moves.length === 0) {
    return;
  }

  if (isReplayActive()) {
    session.replaying = false;
    session.replayToken += 1;
    renderSessionState();
    setSessionNote("Replay stopped.", "muted");
    return;
  }

  session.replaying = true;
  session.replayToken += 1;
  const replayToken = session.replayToken;

  if (session.currentPly >= session.moves.length) {
    await navigateToPly(0, { keepReplay: true });
  }

  renderSessionState();

  while (session.replaying && replayToken === session.replayToken && session.currentPly < session.moves.length) {
    await navigateToPly(session.currentPly + 1, {
      animateForward: true,
      keepReplay: true,
    });

    if (!session.replaying || replayToken !== session.replayToken) {
      break;
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, REPLAY_STEP_DELAY_MS);
    });
  }

  if (replayToken === session.replayToken) {
    session.replaying = false;
    renderSessionState();
  }
}

function buildPgnText() {
  return buildPgnExportText({
    moves: session.moves,
    initialFen: session.initialFen,
    startFen: START_FEN,
    timeoutWinner: session.timeoutWinner,
  });
}

function parsePgnMoves(pgnText: string) {
  return parsePgnText(pgnText, START_FEN);
}

const animationController = createAnimationController({
  boardElement,
  scene: scene as any,
  getFxProfile,
  onAnimationSettled: () => renderSessionState(),
  scheduleMoveAudio,
  prefersReducedMotion,
  updateBoardViewportSize,
  getBoardMetrics,
  getSquareLayout,
  getElementLayout,
  getLayoutCenter,
  pinPieceElementToLayout,
  applyMoveToScene,
  renderSnapshot,
  resetScenePiecesFromSnapshot,
  coordsToSquare,
  findKingSquare,
});

const {
  animateSceneMove,
  clearFxEffects,
  queueSceneAnimation,
} = animationController;

function renderHistory(state: PublicSnapshot) {
  historyListElement.innerHTML = "";

  if (state.moveHistory.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-history";
    emptyState.textContent = "No moves yet.";
    historyListElement.append(emptyState);
    return;
  }

  for (let index = 0; index < state.moveHistory.length; index += 2) {
    const whiteMove = state.moveHistory[index];
    const blackMove = state.moveHistory[index + 1];
    const row = document.createElement("div");
    row.className = "history-row";

    const moveNumber = document.createElement("span");
    moveNumber.className = "move-number";
    moveNumber.textContent = `${Math.floor(index / 2) + 1}.`;

    const whiteCell = document.createElement("button");
    whiteCell.type = "button";
    whiteCell.className = "history-cell history-move";
    whiteCell.textContent = whiteMove.notation ?? "";
    whiteCell.dataset.ply = String(index + 1);
    whiteCell.classList.toggle("active", session.currentPly === index + 1);

    if (blackMove) {
      const blackCell = document.createElement("button");
      blackCell.type = "button";
      blackCell.className = "history-cell history-move";
      blackCell.textContent = blackMove.notation ?? "";
      blackCell.dataset.ply = String(index + 2);
      blackCell.classList.toggle("active", session.currentPly === index + 2);
      row.append(moveNumber, whiteCell, blackCell);
    } else {
      const blackCell = document.createElement("span");
      blackCell.className = "history-cell";
      blackCell.textContent = "";
      row.append(moveNumber, whiteCell, blackCell);
    }
    historyListElement.append(row);
  }
}

function renderStatus(state: PublicSnapshot) {
  let statusText = describePosition(state);
  const tone = resolveUiTone(state);
  if (session.timeoutWinner) {
    statusText = `Time. ${colorName(session.timeoutWinner)} wins.`;
  } else if (isReplayActive()) {
    statusText = `Replaying. ${statusText}`;
  } else if (!isLatestTimelinePosition()) {
    statusText = `Reviewing move ${session.currentPly} of ${session.moves.length}. ${statusText}`;
  }

  statusTextElement.textContent = statusText;
  statusTextElement.dataset.tone = tone;
  turnBadgeElement.textContent = colorName(state.turn);
  turnBadgeElement.dataset.side = state.turn;
  checkBadgeElement.textContent = session.timeoutWinner ? "Time" : state.check ? "Yes" : "No";
  checkBadgeElement.dataset.state = session.timeoutWinner ? "time" : state.check ? "on" : "off";
  moveCounterElement.textContent = String(state.moveHistory.length);
  orientationBadgeElement.textContent = colorName(orientation);
  orientationBadgeElement.dataset.side = orientation;
  fenTextElement.textContent = state.fen;

  if (document.body) {
    document.body.dataset.tone = tone;
  }

  // Update banner based on game state (skip if game already ended via resign/draw/timeout)
  if (state.result.over && state.result.reason && !session.timeoutWinner) {
    const reason = state.result.reason;
    if (reason === "checkmate") {
      showGameBanner(`Checkmate! ${colorName(state.result.winner!)} wins.`, "result");
    } else if (reason === "stalemate") {
      showGameBanner("Stalemate — draw.", "result");
    } else if (reason === "insufficient material" || reason === "threefold repetition" || reason === "fifty-move rule") {
      showGameBanner(`Draw by ${reason}.`, "result");
    }
    if (mpControlsElement) mpControlsElement.hidden = true;
    showRematchButton();
  } else if (!state.result.over && !session.timeoutWinner && mp.isMultiplayer()) {
    if (session.moves.length > 0 && firstMoveTimer) {
      stopFirstMoveCountdown();
    }
    const lastMove = state.moveHistory.length > 0 ? state.moveHistory[state.moveHistory.length - 1] : null;
    if (state.check && lastMove) {
      showGameBanner(`${lastMove.notation} — ${colorName(state.turn)} is in check!`, "warn");
    } else if (lastMove && session.moves.length >= 2) {
      const mover = lastMove.color === "w" ? "White" : "Black";
      showGameBanner(`${mover}: ${lastMove.notation}`, "info");
    } else if (session.moves.length >= 2) {
      hideGameBanner();
    }
  }

  if (boardPanelElement instanceof HTMLElement) {
    boardPanelElement.dataset.tone = tone;
  }

  boardElement!.dataset.tone = tone;
  turnChipElement?.setAttribute("data-side", state.turn);
  checkChipElement?.setAttribute("data-state", session.timeoutWinner ? "time" : state.check ? "on" : "off");
  orientationChipElement?.setAttribute("data-side", orientation);
}

function renderSnapshot(state: PublicSnapshot) {
  currentState = state;
  refreshBoardScene(state);
  renderStatus(state);
  renderHistory(state);
  renderSessionState();
}

function render() {
  renderSnapshot(game.snapshot());
}

function clearSelection() {
  selectedSquare = null;
  legalMoves = [];
}

function closePromotionDialog() {
  if (promotionDialog.open) {
    promotionDialog.close();
  } else {
    promotionDialog.removeAttribute("open");
  }
}

function showPromotionDialog(move: Move) {
  pendingPromotionMove = move;
  promotionTitleElement.textContent = `${colorName(move.color)} promotes on ${move.to}`;
  promotionOptionsElement.innerHTML = "";

  for (const type of getPromotionTargets()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "promotion-button";
    button.dataset.piece = type;
    button.innerHTML = `
      ${renderPieceSvg({ color: move.color, type }, "piece-svg promotion-piece")}
      <span class="promotion-label">${colorName(move.color)} ${PIECE_NAMES[type] ?? type}</span>
    `;
    button.addEventListener("click", () => {
      closePromotionDialog();
      void commitMove(move.from, move.to, type);
    });
    promotionOptionsElement.append(button);
  }

  render();

  if (typeof promotionDialog.showModal === "function") {
    promotionDialog.showModal();
  } else {
    promotionDialog.setAttribute("open", "open");
  }
}

async function commitMove(from: string, to: string, promotion?: string, options: { dragStartLayout?: ElementLayout | null; effectStartLayout?: SquareLayout | null } = {}) {
  if (session.timeoutWinner || isReplayActive()) {
    return null;
  }

  if (mp.isMultiplayer() && (mp.isSpectator() || !mp.isMyTurn(currentState.turn))) {
    return null;
  }

  const beforeState = currentState;
  const currentClock = commitCurrentClockSnapshot();

  if (!isLatestTimelinePosition()) {
    session.moves = session.moves.slice(0, session.currentPly);
    session.clockSnapshots = session.clockSnapshots.slice(0, session.currentPly + 1);
    session.timeoutWinner = null;
  }

  const record = game.makeMove(from, to, promotion);
  pendingPromotionMove = null;

  if (!record) {
    clearSelection();
    render();
    return null;
  }

  clearSelection();
  refreshBoardScene(beforeState);

  const afterState = game.snapshot();
  session.moves.push({
    from,
    to,
    promotion: record.promotion,
  });
  session.currentPly = session.moves.length;
  session.clockSnapshots[session.currentPly - 1] = currentClock;

  // During multiplayer grace period (first 2 moves), clocks don't tick
  const clockGrace = mp.isMultiplayer() && session.moves.length < 2;
  const incrementGrace = mp.isMultiplayer() && session.moves.length < 3;
  const increment = !incrementGrace && mp.isMultiplayer() ? mp.getIncrementMs() : 0;
  const moverColor = afterState.turn === "w" ? "b" : "w"; // the player who just moved
  session.clockSnapshots[session.currentPly] = {
    whiteMs: currentClock.whiteMs + (moverColor === "w" ? increment : 0),
    blackMs: currentClock.blackMs + (moverColor === "b" ? increment : 0),
    activeColor: afterState.result.over || clockGrace || !mp.isMultiplayer() ? null : afterState.turn,
  };
  session.liveClockStartedAt = Date.now();
  await queueSceneAnimation(() => animateSceneMove(record, afterState, {
    dragStartLayout: options.dragStartLayout ?? undefined,
    effectStartLayout: options.effectStartLayout ?? undefined,
  }));
  historyListElement.scrollTop = historyListElement.scrollHeight;
  persistSession({ silent: true });

  if (mp.isMultiplayer() && !mp.isSpectator()) {
    mp.sendMove({ from, to, promotion: record.promotion }).catch(() => {
      setSessionNote("Move could not be sent to server.", "warn");
    });
  }

  return record;
}

function getPieceMoves(square: string) {
  if (mp.isMultiplayer() && !mp.isMyTurn(currentState.turn)) return [];
  return game.getLegalMoves(square);
}

function canStartDragFromSquare(square: string) {
  if (mp.isMultiplayer() && !mp.isMyTurn(currentState.turn)) return false;
  return getPieceMoves(square).length > 0;
}

const boardInput = createBoardInput({
  boardElement,
  scene,
  game,
  getCurrentState: () => currentState,
  getSelectedSquare: () => selectedSquare,
  setSelectedSquare: (square) => {
    selectedSquare = square;
  },
  getLegalMoves: () => legalMoves,
  setLegalMoves: (moves) => {
    legalMoves = moves;
  },
  getPendingPromotionMove: () => pendingPromotionMove,
  isAnimationActive,
  isReplayActive,
  hasClockExpired,
  primeAudio,
  render,
  refreshBoardScene,
  showPromotionDialog,
  commitMove,
  getPieceMoves,
  canStartDragFromSquare,
  getSquareFromPointer,
  positionDraggedPiece,
  getSquareLayout,
  getElementLayout,
});

const {
  clearDragHoldTimer,
  handleBoardClick,
  handleBoardLostPointerCapture,
  handleBoardPointerCancel,
  handleBoardPointerDown,
  handleBoardPointerMove,
  handleBoardPointerUp,
  handleSquareClick,
  resetDragState,
} = boardInput;

function updateBoardViewportSize() {
  if (isAnimationActive()) {
    scene.animation.pendingViewportSync = true;
    return;
  }

  if (!boardElement || !boardPanelElement || !boardWrapElement) {
    return;
  }

  const coordinateGutter = Math.round(Number.parseFloat(
    window.getComputedStyle(boardWrapElement).getPropertyValue("--board-coordinate-gutter"),
  ) || 0);
  const borderWidth = Math.round(Number.parseFloat(
    window.getComputedStyle(boardWrapElement).getPropertyValue("--board-border-width"),
  ) || 0);
  const availableWidth = Math.max(Math.floor(boardPanelElement.clientWidth - coordinateGutter - 2 * borderWidth), 0);
  settings = loadSettings(SETTINGS_STORAGE_KEY);
  const headerH = Math.round(Number.parseFloat(
    window.getComputedStyle(document.documentElement).getPropertyValue("--header-h"),
  ) || 52);
  const fitHeight = Math.max(Math.floor(window.innerHeight - headerH - 40 - coordinateGutter - 2 * borderWidth), 0);
  const maxSize = settings.boardMaxSize > 0 ? settings.boardMaxSize : Math.min(availableWidth, fitHeight);
  const boardSize = Math.max(Math.floor(Math.min(maxSize, availableWidth)), 0);

  if (boardSize <= 0) {
    return;
  }

  boardElement.style.setProperty("--board-size", `${boardSize}px`);
  boardElement.style.setProperty("--piece-size", `${Math.max(22, boardSize * 0.103)}px`);
  boardWrapElement.style.setProperty("--board-render-size", `${boardSize}px`);
  syncFxLayerSize();
  positionAllPieces();
}

function queueBoardResize() {
  if (resizeFrame !== null) {
    window.cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = null;
    updateBoardViewportSize();
  });
}

function handleViewportResize() {
  queueBoardResize();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    pendingPromotionMove = null;
    closePromotionDialog();

    if (scene.drag) {
      if (scene.drag.mode === "dragging") {
        selectedSquare = scene.drag.sourceSquare;
        legalMoves = scene.drag.legalMoves;
      } else {
        clearSelection();
      }

      resetDragState({ suppressClick: true });
      return;
    }

    if (activeUtilityTab) {
      setUtilityTab(null, { focus: true });
      return;
    }

    clearSelection();
    render();
  }
});

promotionCancelButton.addEventListener("click", () => {
  pendingPromotionMove = null;
  closePromotionDialog();
  render();
});

promotionDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  pendingPromotionMove = null;
  closePromotionDialog();
  render();
});

document.addEventListener("pointerdown", (event) => {
  if (!activeUtilityTab || !(event.target instanceof Element)) {
    return;
  }

  if (utilityDrawerElement?.contains(event.target)) {
    return;
  }

  if (event.target.closest("[data-utility-tab]")) {
    return;
  }

  setUtilityTab(null);
}, true);

utilityBackdropElement?.addEventListener("click", () => {
  if (!activeUtilityTab) {
    return;
  }

  setUtilityTab(null, { focus: true });
});

utilityTabListElement?.addEventListener("click", (event) => {
  const button = event.target instanceof Element
    ? event.target.closest("[data-utility-tab]")
    : null;
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const requestedTab = button.dataset.utilityTab ?? null;
  setUtilityTab(activeUtilityTab === requestedTab ? null : requestedTab, {
    focus: true,
    focusTarget: button,
  });
});

utilityTabListElement?.addEventListener("keydown", (event) => {
  const button = event.target instanceof Element
    ? event.target.closest("[data-utility-tab]")
    : null;
  if (!(button instanceof HTMLButtonElement) || utilityTabElements.length === 0) {
    return;
  }

  const currentIndex = utilityTabElements.findIndex((tab) => tab === button);
  if (currentIndex === -1) {
    return;
  }

  let nextIndex = currentIndex;

  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
      nextIndex = (currentIndex + 1) % utilityTabElements.length;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      nextIndex = (currentIndex - 1 + utilityTabElements.length) % utilityTabElements.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = utilityTabElements.length - 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  setUtilityTab(utilityTabElements[nextIndex]?.dataset.utilityTab ?? null, {
    focus: true,
    focusTarget: utilityTabElements[nextIndex],
  });
});

sessionCardElement?.addEventListener("click", (event) => {
  const button = (event.target as Element | null)?.closest<HTMLElement>("[data-clock-preset]");
  if (!button || isAnimationActive() || isReplayActive()) {
    return;
  }

  void setClockPreset(button.dataset.clockPreset);
});

historyListElement.addEventListener("click", (event) => {
  const moveButton = (event.target as Element | null)?.closest<HTMLElement>(".history-move");
  if (!moveButton || isAnimationActive() || isReplayActive()) {
    return;
  }

  void navigateToPly(Number(moveButton.dataset.ply));
});

jumpStartButton.addEventListener("click", () => {
  void navigateToPly(0);
});

undoButton.addEventListener("click", () => {
  void navigateToPly(session.currentPly - 1);
});

redoButton.addEventListener("click", () => {
  void navigateToPly(session.currentPly + 1);
});

jumpEndButton.addEventListener("click", () => {
  void navigateToPly(session.moves.length);
});

replayButton.addEventListener("click", () => {
  void startReplay();
});

liveButton.addEventListener("click", () => {
  void navigateToPly(session.moves.length);
});

saveSessionButton.addEventListener("click", () => {
  if (isAnimationActive()) {
    return;
  }

  persistSession();
});

restoreSessionButton.addEventListener("click", () => {
  if (isAnimationActive()) {
    return;
  }

  restorePersistedSession();
});

clearSessionButton.addEventListener("click", () => {
  clearStoredSession();
});

exportPgnButton.addEventListener("click", () => {
  try {
    pgnTextarea.value = buildPgnText();
    setPgnStatus("PGN exported to the text area.", "ready");
  } catch {
    setPgnStatus("PGN export failed.", "warn");
  }
});

copyPgnButton.addEventListener("click", async () => {
  try {
    if (!pgnTextarea.value.trim()) {
      pgnTextarea.value = buildPgnText();
    }

    await navigator.clipboard.writeText(pgnTextarea.value);
    setPgnStatus("PGN copied to the clipboard.", "ready");
  } catch {
    setPgnStatus("PGN could not be copied.", "warn");
  }
});

importPgnButton.addEventListener("click", () => {
  if (isAnimationActive() || isReplayActive()) {
    return;
  }

  try {
    const parsed = parsePgnMoves(pgnTextarea.value);
    const normalizedMoves = parsed.moves.map((move) => normalizeTimelineMove(move)).filter((m): m is TimelineMove => m !== null);

    pendingPromotionMove = null;
    closePromotionDialog();
    clearSelection();
    resetDragState();
    clearFxEffects();
    session = {
      initialFen: parsed.initialFen,
      moves: normalizedMoves,
      currentPly: normalizedMoves.length,
      clockInitialMs: session.clockInitialMs,
      clockSnapshots: buildClockSnapshotsForMoves(
        normalizedMoves,
        parsed.initialFen,
        START_FEN,
        session.clockInitialMs,
      ),
      liveClockStartedAt: Date.now(),
      replayToken: session.replayToken + 1,
      replaying: false,
      timeoutWinner: null,
    };

    rebuildGameToPly(session.currentPly);
    resetScenePiecesFromSnapshot(currentState);
    render();
    queueBoardResize();
    persistSession({ silent: true });
    setPgnStatus("PGN imported.", "ready");
    setSessionNote("PGN loaded into the current session.", "ready");
  } catch (error) {
    setPgnStatus(error instanceof Error ? error.message : "PGN import failed.", "warn");
  }
});

flipButton.addEventListener("click", () => {
  if (isAnimationActive() || isReplayActive()) {
    return;
  }

  clearFxEffects();
  orientation = orientation === "w" ? "b" : "w";
  render();
  queueBoardResize();
  persistSession({ silent: true });
});

function startGameFromFen(fen: string) {
  pendingPromotionMove = null;
  closePromotionDialog();
  clearSelection();
  resetDragState();
  clearFxEffects();
  hideGameBanner();
  game.loadFen(fen);
  currentState = game.snapshot();
  session = createEmptySession(fen, session.clockInitialMs);
  orientation = "w";
  resetScenePiecesFromSnapshot(currentState);
  render();
  queueBoardResize();
  persistSession({ silent: true });
}

function openPlayground() {
  let whitePlacements: DraftPlacement[] = [];

  showDraft("w", () => {
    whitePlacements = getCurrentPlacements();
    showDraft("b", () => {
      const blackPlacements = getCurrentPlacements();
      const fen = draftsToFen(whitePlacements, blackPlacements);
      // Timeless: set huge clock so it never expires, null activeColor so clocks don't tick
      session.clockInitialMs = 99999999;
      startGameFromFen(fen);
      session.clockSnapshots[0] = { whiteMs: 99999999, blackMs: 99999999, activeColor: null };
      setSessionNote("Playground — no clocks, control both sides.", "ready");
    });
  });
}

function openDraftThenStart() {
  openPlayground();
}

resetButton.addEventListener("click", () => {
  if (isAnimationActive() || isReplayActive()) {
    return;
  }
  if (mp.isMultiplayer()) {
    window.location.href = "/";
  } else {
    // Playground: restart with fresh draft
    localStorage.removeItem(SESSION_STORAGE_KEY);
    openPlayground();
  }
});

copyFenButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(game.toFen());
    copyFenButton.textContent = "Copied";
  } catch {
    copyFenButton.textContent = "Unavailable";
  }

  window.setTimeout(() => {
    copyFenButton.textContent = "Copy";
  }, 1200);
});

initializeBoardScene({
  handleBoardClick,
  handleBoardLostPointerCapture,
  handleBoardPointerCancel,
  handleBoardPointerDown,
  handleBoardPointerMove,
  handleBoardPointerUp,
});
layoutObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver(() => {
    queueBoardResize();
  })
  : null;
if (boardPanelElement) {
  layoutObserver?.observe(boardPanelElement);
}
setUtilityTab(activeUtilityTab);

// ---- Multiplayer ----

const mpControlsElement = document.getElementById("mp-controls");
const resignButton = document.getElementById("resign-button");
const drawButton = document.getElementById("draw-button");
const addTimeButton = document.getElementById("add-time-button");

function applyMultiplayerUiState(): void {
  updateConnectionStatus();
  if (!mp.isMultiplayer()) return;
  resetButton!.disabled = false; // New Game always works — navigates to lobby
  saveSessionButton!.disabled = true;
  restoreSessionButton!.disabled = true;
  clearSessionButton!.disabled = true;
  importPgnButton!.disabled = true;
  undoButton!.disabled = true;
  const clockPresetButtons = document.querySelectorAll<HTMLButtonElement>("[data-clock-preset]");
  clockPresetButtons.forEach((btn) => { btn.disabled = true; });

  if (mpControlsElement && !mp.isSpectator()) {
    mpControlsElement.hidden = false;
  }

  if (mp.isSpectator()) {
    showGameBanner("Spectating", "info");
  }
}

resignButton?.addEventListener("click", async () => {
  if (!mp.isMultiplayer() || mp.isSpectator()) return;
  const ok = await mp.resign();
  if (!ok) setSessionNote("Failed to resign.", "warn");
});

drawButton?.addEventListener("click", async () => {
  if (!mp.isMultiplayer() || mp.isSpectator()) return;
  const ok = await mp.offerDraw();
  if (ok && drawButton) {
    drawButton.textContent = "Draw offered";
    (drawButton as HTMLButtonElement).disabled = true;
  }
});

addTimeButton?.addEventListener("click", async () => {
  if (!mp.isMultiplayer() || mp.isSpectator()) return;
  const ok = await mp.addTimeToOpponent();
  if (ok) setSessionNote("Added 15s to opponent's clock.", "ready");
});

const rematchBtn = document.getElementById("rematch-btn") as HTMLButtonElement | null;

function showRematchButton() {
  if (rematchBtn && mp.isMultiplayer() && !mp.isSpectator()) {
    rematchBtn.hidden = false;
    rematchBtn.textContent = "Rematch";
    rematchBtn.disabled = false;
  }
}

rematchBtn?.addEventListener("click", async () => {
  if (!mp.isMultiplayer() || mp.isSpectator()) return;
  rematchBtn.textContent = "Waiting...";
  rematchBtn.disabled = true;
  await mp.offerRematch();
});

function handleRemoteMove(move: TimelineMove, clock: ClockSnapshot, firstMoveDeadline?: number | null): void {
  // Update first-move countdown based on server state
  if (firstMoveDeadline && firstMoveDeadline > Date.now()) {
    startFirstMoveCountdown(firstMoveDeadline);
  } else if (!firstMoveDeadline) {
    stopFirstMoveCountdown();
  }
  const expectedPly = session.moves.length + 1;

  // If this move is already applied locally (our own echo), just sync the clock
  if (session.moves.length > 0) {
    const lastMove = session.moves[session.moves.length - 1];
    if (lastMove.from === move.from && lastMove.to === move.to && session.currentPly === expectedPly - 1) {
      // Ignore echo but sync clock from server
      return;
    }
  }

  // Sync clock from server for our own move (ply already applied)
  if (session.currentPly >= expectedPly) {
    session.clockSnapshots[session.currentPly] = clock;
    session.liveClockStartedAt = Date.now();
    return;
  }

  const record = game.makeMove(move.from, move.to, move.promotion);
  if (!record) return;

  clearSelection();
  const afterState = game.snapshot();
  currentState = afterState;

  session.moves.push({ from: move.from, to: move.to, promotion: record.promotion });
  session.currentPly = session.moves.length;
  session.clockSnapshots[session.currentPly] = clock;
  session.liveClockStartedAt = Date.now();

  queueSceneAnimation(() => animateSceneMove(record, afterState, {}));
  applyMultiplayerUiState();
}

const playerNameElement = document.getElementById("player-name");
const opponentNameElement = document.getElementById("opponent-name");

function setPlayerNames(names: { w: string | null; b: string | null }) {
  const myColor = mp.getPlayerColor();
  if (mp.isSpectator()) {
    if (playerNameElement) playerNameElement.textContent = names.w || "White";
    if (opponentNameElement) opponentNameElement.textContent = names.b || "Black";
  } else if (myColor === "w") {
    if (playerNameElement) playerNameElement.textContent = names.w || "You";
    if (opponentNameElement) opponentNameElement.textContent = names.b || "Waiting...";
  } else {
    if (playerNameElement) playerNameElement.textContent = names.b || "You";
    if (opponentNameElement) opponentNameElement.textContent = names.w || "Opponent";
  }
}

let onOpponentJoinCallback: (() => void) | null = null;

function handleRemoteJoin(name?: string): void {
  if (name && opponentNameElement && !mp.isSpectator()) {
    opponentNameElement.textContent = name;
  }
  if (onOpponentJoinCallback) {
    onOpponentJoinCallback();
    onOpponentJoinCallback = null;
  }
}

function handleRemoteTimeout(winner: PieceColor, clock: ClockSnapshot): void {
  session.timeoutWinner = winner;
  session.clockSnapshots[session.currentPly] = clock;
  session.liveClockStartedAt = Date.now();
  clearSelection();
  resetDragState();
  if (mpControlsElement) mpControlsElement.hidden = true;
  render();
  showGameBanner(`Time's up! ${colorName(winner)} wins.`, "result");
  showRematchButton();
}

function startGameFromServerFen(fen: string, clockInitialMs: number, clockSnapshots?: any[]) {
  game.loadFen(fen);
  currentState = game.snapshot();
  session = createEmptySession(fen, clockInitialMs);
  if (clockSnapshots) {
    session.clockSnapshots = clockSnapshots;
  }
  session.liveClockStartedAt = Date.now();
  resetScenePiecesFromSnapshot(currentState);
  render();
  queueBoardResize();
}

async function initMultiplayerMode(id: string): Promise<void> {
  try {
    const savedName = localStorage.getItem("wess-player-name") || "Player";
    const result = await mp.joinGame(id, savedName);
    const color = result.color;

    if (result.state.playerNames) {
      setPlayerNames(result.state.playerNames);
    }

    if (color === "w" || color === "b") {
      orientation = color;
    } else {
      orientation = "w";
    }

    const handleDraftComplete = (fen: string, firstMoveDeadline?: number) => {
      hideDraft();
      startGameFromServerFen(fen, result.state.clockInitialMs, result.state.clockSnapshots);
      if (firstMoveDeadline) {
        startFirstMoveCountdown(firstMoveDeadline);
      } else {
        showGameBanner("Game started! Make your first move.", "info");
      }
    };

    const handleGameCancelled = (reason: string) => {
      hideDraft();
      stopFirstMoveCountdown();
      session.timeoutWinner = "w"; // Mark game as over to block moves
      if (mpControlsElement) mpControlsElement.hidden = true;
      showGameBanner(`Game cancelled: ${reason}`, "warn");
    };

    mp.connectEvents(id, {
      onMove: handleRemoteMove,
      onJoin: handleRemoteJoin,
      onTimeout: handleRemoteTimeout,
      onSync: () => {},
      onDraftComplete: handleDraftComplete,
      onGameCancelled: handleGameCancelled,
      onResign: (loser, winner) => {
        session.timeoutWinner = winner;
        if (mpControlsElement) mpControlsElement.hidden = true;
        showGameBanner(`${colorName(loser)} resigned. ${colorName(winner)} wins!`, "result");
        showRematchButton();
        renderSessionState();
      },
      onDrawOffer: (from) => {
        if (from !== mp.getPlayerColor() && drawButton) {
          drawButton.textContent = "Accept Draw";
          (drawButton as HTMLButtonElement).disabled = false;
          showGameBanner(`${colorName(from)} offers a draw.`, "info");
        }
      },
      onDrawAccepted: () => {
        session.timeoutWinner = "w";
        if (mpControlsElement) mpControlsElement.hidden = true;
        showGameBanner("Game drawn by agreement.", "result");
        showRematchButton();
        renderSessionState();
      },
      onAddTime: (from, to, addedMs, clock) => {
        const idx = session.clockSnapshots.length - 1;
        if (idx >= 0) {
          session.clockSnapshots[idx] = { ...clock };
        }
        const secs = Math.round(addedMs / 1000);
        showGameBanner(`${colorName(from)} added ${secs}s to ${colorName(to)}'s clock.`, "info");
        renderClockState();
      },
      onRematchOffer: (from) => {
        if (from !== mp.getPlayerColor() && rematchBtn) {
          rematchBtn.hidden = false;
          rematchBtn.textContent = "Accept Rematch";
          rematchBtn.disabled = false;
        }
      },
      onRematchAccepted: (newGameId) => {
        window.location.href = `/game/${newGameId}`;
      },
    });

    const waitingOverlay = document.getElementById("waiting-overlay");
    const waitingLink = document.getElementById("waiting-link");
    const waitingCopyBtn = document.getElementById("waiting-copy-btn");

    function showWaitingOverlay() {
      if (waitingOverlay) {
        waitingOverlay.hidden = false;
        if (waitingLink) waitingLink.textContent = window.location.href;
        waitingCopyBtn?.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            waitingCopyBtn.textContent = "Copied!";
            setTimeout(() => { waitingCopyBtn.textContent = "Copy"; }, 1500);
          } catch { /* ignore */ }
        });
      }
    }

    function hideWaitingOverlay() {
      if (waitingOverlay) waitingOverlay.hidden = true;
    }

    function startDraftPhase() {
      hideWaitingOverlay();
      showDraft(color as "w" | "b", () => {}, {
        submitToServer: (placements) => mp.submitDraft(placements),
        draftTimeMs: result.state.draftTimeMs,
      });
    }

    if (result.state.phase === "drafting" && (color === "w" || color === "b")) {
      resetScenePiecesFromSnapshot(currentState);
      render();

      const bothJoined = result.state.whiteJoined && result.state.blackJoined;
      if (bothJoined) {
        startDraftPhase();
      } else {
        showWaitingOverlay();
        onOpponentJoinCallback = startDraftPhase;
      }
    } else if (result.state.phase === "playing" && result.state.initialFen) {
      // Game already started (reconnect after draft)
      if (result.state.moves.length > 0) {
        applySessionData({
          initialFen: result.state.initialFen,
          moves: result.state.moves,
          currentPly: result.state.moves.length,
          clockInitialMs: result.state.clockInitialMs,
          clockSnapshots: result.state.clockSnapshots,
          orientation,
          timeoutWinner: result.state.timeoutWinner,
        }, {});
      } else {
        startGameFromServerFen(result.state.initialFen, result.state.clockInitialMs, result.state.clockSnapshots);
      }
    } else {
      // Fallback: standard board
      game.reset();
      currentState = game.snapshot();
      session = createEmptySession(null, result.state.clockInitialMs);
      session.clockSnapshots = result.state.clockSnapshots;
      session.liveClockStartedAt = Date.now();
      resetScenePiecesFromSnapshot(currentState);
      render();
    }

    applyMultiplayerUiState();
  } catch {
    setSessionNote("Could not connect to game.", "warn");
  }
}

const onlineStatusElement = document.getElementById("online-button");

function updateConnectionStatus() {
  if (!onlineStatusElement) return;
  if (mp.isMultiplayer()) {
    onlineStatusElement.textContent = "Connected";
    onlineStatusElement.className = "connection-status connected";
  } else {
    onlineStatusElement.textContent = "Offline";
    onlineStatusElement.className = "connection-status disconnected";
  }
}

// ---- Initialization ----

const route = mp.detectMultiplayerRoute();
if (route) {
  resetScenePiecesFromSnapshot(currentState);
  render();
  initMultiplayerMode(route.gameId);
} else if (!restorePersistedSession({ silent: true })) {
  resetScenePiecesFromSnapshot(currentState);
  render();
  openDraftThenStart();
}
updateConnectionStatus();
handleViewportResize();
window.addEventListener("resize", handleViewportResize);
window.addEventListener("orientationchange", handleViewportResize);
reducedMotionQuery?.addEventListener?.("change", () => {
  clearFxEffects();
  render();
});
window.addEventListener("beforeunload", () => {
  persistSession({ silent: true });
});
window.setInterval(() => {
  renderClockState();
}, CLOCK_UPDATE_MS);
