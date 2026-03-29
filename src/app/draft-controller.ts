import { renderPieceSvg } from "../ui/piece-set";
import {
  type DraftPlacement,
  validateDraft,
  classicDraft,
  draftsToFen,
  draftablePieces,
  DRAFT_BUDGET,
  PIECE_COSTS,
} from "../domain/draft";
import type { PieceColor } from "../domain/piece-movement";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

const PIECE_DESCRIPTIONS: Record<string, string> = {
  p: "Moves forward, captures diagonally. Double push from starting rank. Promotes on the last rank.",
  s: "Moves 1 square orthogonally, captures 1 square diagonally. Cheap defensive utility.",
  n: "Leaps in an L-shape (2+1), jumping over pieces. 8 possible destinations.",
  b: "Slides diagonally any distance. Stays on one square color.",
  d: "Leaps exactly 2 squares in any direction, jumping over pieces. 8 possible destinations in a ring.",
  l: "Slides up to 3 squares forward or forward-diagonal. Retreats or sidesteps 1 square.",
  r: "Slides orthogonally any distance. Participates in castling with the king.",
  v: "Slides diagonally like a bishop. Also moves (not captures) up to 2 squares orthogonally.",
  a: "Combines bishop and knight movement. Slides diagonally or leaps in an L-shape.",
  c: "Combines rook and knight movement. Slides orthogonally or leaps in an L-shape.",
  q: "Slides in all 8 directions any distance. The most powerful standard piece.",
  k: "Moves 1 square in any direction. Mandatory — exactly 1 required. Can castle with rooks.",
};

interface DraftState {
  color: PieceColor;
  placements: DraftPlacement[];
  selectedType: string | null;
}

let state: DraftState = { color: "w", placements: [], selectedType: null };
let onReady: ((fen: string) => void) | null = null;
let draftTimerInterval: ReturnType<typeof setInterval> | null = null;

const overlay = document.getElementById("draft-overlay")!;
const boardEl = document.getElementById("draft-board")!;
const pieceListEl = document.getElementById("draft-piece-list")!;
const budgetFill = document.getElementById("draft-budget-fill")!;
const budgetText = document.getElementById("draft-budget-text")!;
const errorsEl = document.getElementById("draft-errors")!;
const timerEl = document.getElementById("draft-timer")!;
const pieceInfoEl = document.getElementById("draft-piece-info")!;
const readyBtn = document.getElementById("draft-ready-btn") as HTMLButtonElement;
const classicBtn = document.getElementById("draft-classic-btn")!;
const clearBtn = document.getElementById("draft-clear-btn")!;

function buildBoard() {
  boardEl.innerHTML = "";
  const rows = state.color === "w" ? [5, 6, 7] : [0, 1, 2];
  const displayRows = state.color === "w" ? [...rows] : [...rows].reverse();

  for (const row of displayRows) {
    for (let col = 0; col < 8; col++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `draft-square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
      btn.dataset.row = String(row);
      btn.dataset.col = String(col);
      btn.title = `${FILES[col]}${8 - row}`;

      btn.addEventListener("click", () => handleSquareClick(row, col));

      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const idx = state.placements.findIndex((p) => p.row === row && p.col === col);
        if (idx >= 0) {
          state.placements.splice(idx, 1);
          renderDraftState();
        }
      });

      btn.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        const placement = state.placements.find((p) => p.row === row && p.col === col);
        if (placement) {
          e.preventDefault();
          startDrag(placement.type, { row, col }, e);
        }
      });

      boardEl.appendChild(btn);
    }
  }
}

function buildPalette() {
  pieceListEl.innerHTML = "";
  const pieces = draftablePieces();

  for (const p of pieces) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "draft-piece-btn";
    btn.dataset.pieceType = p.type;

    const svg = renderPieceSvg({ color: state.color, type: p.type }, "draft-piece-svg");
    const costLabel = p.type === "k" ? "free" : `${p.cost}pt`;

    btn.innerHTML = `
      <span class="draft-piece-icon">${svg}</span>
      <span class="draft-piece-name">${p.displayName}</span>
      <span class="draft-piece-cost">${costLabel}</span>
    `;

    btn.addEventListener("click", () => {
      state.selectedType = state.selectedType === p.type ? null : p.type;
      renderPaletteSelection();
    });

    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startDrag(p.type, null, e);
    });

    pieceListEl.appendChild(btn);
  }
}

function renderPaletteSelection() {
  pieceListEl.querySelectorAll<HTMLButtonElement>(".draft-piece-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.pieceType === state.selectedType);
  });

  if (state.selectedType && pieceInfoEl) {
    const pieces = draftablePieces();
    const info = pieces.find((p) => p.type === state.selectedType);
    const desc = PIECE_DESCRIPTIONS[state.selectedType] || "";
    const cost = state.selectedType === "k" ? "free" : `${PIECE_COSTS[state.selectedType]}pt`;
    const svg = renderPieceSvg({ color: state.color, type: state.selectedType }, "draft-info-svg");
    pieceInfoEl.innerHTML = `
      <div class="draft-info-header">
        <span class="draft-info-icon">${svg}</span>
        <strong class="draft-info-name">${info?.displayName ?? state.selectedType}</strong>
        <span class="draft-info-cost">${cost}</span>
      </div>
      <p class="draft-info-desc">${desc}</p>
    `;
    pieceInfoEl.hidden = false;
  } else if (pieceInfoEl) {
    pieceInfoEl.hidden = true;
  }
}

// --- Drag and drop ---

let dragType: string | null = null;
let dragFromSquare: { row: number; col: number } | null = null;
let dragGhost: HTMLElement | null = null;
let didDrag = false;

function startDrag(pieceType: string, fromSquare: { row: number; col: number } | null, e: PointerEvent) {
  dragType = pieceType;
  dragFromSquare = fromSquare;
  didDrag = true;

  dragGhost = document.createElement("div");
  dragGhost.className = "draft-drag-ghost";
  dragGhost.innerHTML = renderPieceSvg({ color: state.color, type: pieceType }, "draft-ghost-svg");
  document.body.appendChild(dragGhost);
  moveDragGhost(e.clientX, e.clientY);

  document.addEventListener("pointermove", onDragMove);
  document.addEventListener("pointerup", onDragEnd);
}

function moveDragGhost(x: number, y: number) {
  if (!dragGhost) return;
  dragGhost.style.left = `${x}px`;
  dragGhost.style.top = `${y}px`;
}

function onDragMove(e: PointerEvent) {
  moveDragGhost(e.clientX, e.clientY);

  // Highlight drop target
  boardEl.querySelectorAll(".draft-square").forEach((sq) => sq.classList.remove("drop-target"));
  const target = getSquareFromPoint(e.clientX, e.clientY);
  if (target) target.classList.add("drop-target");
}

function onDragEnd(e: PointerEvent) {
  document.removeEventListener("pointermove", onDragMove);
  document.removeEventListener("pointerup", onDragEnd);

  boardEl.querySelectorAll(".draft-square").forEach((sq) => sq.classList.remove("drop-target"));

  if (dragGhost) {
    dragGhost.remove();
    dragGhost = null;
  }

  const targetSq = getSquareFromPoint(e.clientX, e.clientY);

  if (targetSq && dragType) {
    const row = Number(targetSq.dataset.row);
    const col = Number(targetSq.dataset.col);

    // Dropped on same square — do nothing
    if (dragFromSquare && dragFromSquare.row === row && dragFromSquare.col === col) {
      dragType = null;
      dragFromSquare = null;
      return;
    }

    // Remove from source if dragging from board
    if (dragFromSquare) {
      const srcIdx = state.placements.findIndex((p) => p.row === dragFromSquare!.row && p.col === dragFromSquare!.col);
      if (srcIdx >= 0) state.placements.splice(srcIdx, 1);
    }

    // Place at target (replace if occupied)
    const destIdx = state.placements.findIndex((p) => p.row === row && p.col === col);
    if (destIdx >= 0) {
      state.placements[destIdx] = { type: dragType, row, col };
    } else {
      state.placements.push({ type: dragType, row, col });
    }

    renderDraftState();
  } else if (!targetSq && dragFromSquare) {
    // Dragged off board → remove piece
    const srcIdx = state.placements.findIndex((p) => p.row === dragFromSquare!.row && p.col === dragFromSquare!.col);
    if (srcIdx >= 0) state.placements.splice(srcIdx, 1);
    renderDraftState();
  }

  dragType = null;
  dragFromSquare = null;
}

function getSquareFromPoint(x: number, y: number): HTMLElement | null {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    if (el instanceof HTMLElement && el.classList.contains("draft-square")) return el;
  }
  return null;
}

function handleSquareClick(row: number, col: number) {
  // After a drag, suppress the click only if it would delete (no piece selected)
  if (didDrag) {
    didDrag = false;
    if (!state.selectedType) return;
  }
  const existingIdx = state.placements.findIndex((p) => p.row === row && p.col === col);

  if (existingIdx >= 0 && !state.selectedType) {
    state.placements.splice(existingIdx, 1);
  } else if (existingIdx >= 0 && state.selectedType) {
    state.placements[existingIdx] = { type: state.selectedType, row, col };
  } else if (state.selectedType) {
    state.placements.push({ type: state.selectedType, row, col });
  }

  renderDraftState();
}

function renderBoardPieces() {
  boardEl.querySelectorAll<HTMLButtonElement>(".draft-square").forEach((sq) => {
    const row = Number(sq.dataset.row);
    const col = Number(sq.dataset.col);
    const placement = state.placements.find((p) => p.row === row && p.col === col);

    if (placement) {
      sq.innerHTML = renderPieceSvg({ color: state.color, type: placement.type }, "draft-placed-svg");
      sq.classList.add("occupied");
    } else {
      sq.innerHTML = "";
      sq.classList.remove("occupied");
    }
  });
}

function renderValidation() {
  const result = validateDraft(state.placements, state.color);

  const pct = Math.min(100, (result.pointsUsed / DRAFT_BUDGET) * 100);
  budgetFill.style.width = `${pct}%`;
  budgetFill.classList.toggle("over", result.pointsUsed > DRAFT_BUDGET);
  budgetText.textContent = `${result.pointsUsed} / ${DRAFT_BUDGET}`;

  if (result.errors.length > 0) {
    errorsEl.innerHTML = result.errors.map((e) => `<div class="draft-error">${e}</div>`).join("");
    errorsEl.hidden = false;
  } else {
    errorsEl.hidden = true;
  }

  readyBtn.disabled = !result.valid;
}

function renderDraftState() {
  renderBoardPieces();
  renderValidation();
}

classicBtn.addEventListener("click", () => {
  state.placements = classicDraft(state.color);
  renderDraftState();
});

clearBtn.addEventListener("click", () => {
  state.placements = [];
  renderDraftState();
});

let multiplayerSubmit: ((placements: DraftPlacement[]) => Promise<boolean>) | null = null;

function stopTimer() {
  if (draftTimerInterval) {
    clearInterval(draftTimerInterval);
    draftTimerInterval = null;
  }
  timerEl.hidden = true;
}

function startTimer(draftTimeMs: number) {
  stopTimer();
  const deadline = Date.now() + draftTimeMs;
  timerEl.hidden = false;

  function tick() {
    const remaining = Math.max(0, deadline - Date.now());
    const secs = Math.ceil(remaining / 1000);
    const min = Math.floor(secs / 60);
    const sec = secs % 60;
    timerEl.textContent = `${min}:${String(sec).padStart(2, "0")}`;
    timerEl.classList.toggle("urgent", remaining < 15000);

    if (remaining <= 0) {
      stopTimer();
      // Auto-submit: if valid, submit as-is; otherwise submit classic
      const result = validateDraft(state.placements, state.color);
      if (!result.valid) {
        state.placements = classicDraft(state.color);
        renderDraftState();
      }
      readyBtn.click();
    }
  }

  tick();
  draftTimerInterval = setInterval(tick, 250);
}

readyBtn.addEventListener("click", async () => {
  const result = validateDraft(state.placements, state.color);
  if (!result.valid) return;

  stopTimer();

  if (multiplayerSubmit) {
    readyBtn.disabled = true;
    readyBtn.textContent = "Waiting...";
    errorsEl.innerHTML = '<div class="draft-waiting">Waiting for opponent to finish drafting...</div>';
    errorsEl.hidden = false;
    await multiplayerSubmit(state.placements);
  } else {
    const opponentColor: PieceColor = state.color === "w" ? "b" : "w";
    const opponentDraft = classicDraft(opponentColor);

    const fen = state.color === "w"
      ? draftsToFen(state.placements, opponentDraft)
      : draftsToFen(opponentDraft, state.placements);

    overlay.hidden = true;
    onReady?.(fen);
  }
});

export function getCurrentPlacements(): DraftPlacement[] {
  return [...state.placements];
}

export function hideDraft() {
  stopTimer();
  overlay.hidden = true;
}

export function showDraft(
  color: PieceColor,
  callback: (fen: string) => void,
  options?: {
    submitToServer?: (placements: DraftPlacement[]) => Promise<boolean>;
    draftTimeMs?: number;
  },
) {
  state = { color, placements: classicDraft(color), selectedType: null };
  onReady = callback;
  multiplayerSubmit = options?.submitToServer ?? null;

  readyBtn.textContent = "Ready";
  readyBtn.disabled = false;
  errorsEl.hidden = true;

  buildBoard();
  buildPalette();
  renderDraftState();

  overlay.hidden = false;

  if (options?.draftTimeMs) {
    startTimer(options.draftTimeMs);
  } else {
    stopTimer();
  }
}
