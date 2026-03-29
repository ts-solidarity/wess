import { FILES } from "../app/constants";
import type { FxProfile } from "../app/settings";
import type { PieceColor, PieceType, Piece, Board, Move, PublicSnapshot } from "../domain/chess-game";
import { STANDARD_CASTLING } from "../domain/piece-movement";

export interface ScenePiece {
  id: string;
  type: PieceType;
  color: PieceColor;
  square: string;
}

export interface SquareLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface ElementLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface DraggedPieceLayout {
  size: number;
  left: number;
  top: number;
}

export interface BoardMetrics {
  rect: DOMRect;
  cellSize: number;
}

export interface LayoutCenter {
  x: number;
  y: number;
}

export interface DragState {
  mode: "pending" | "dragging";
  pointerId: number;
  pointerType: string;
  pieceId: string;
  sourceSquare: string;
  legalMoves: Move[];
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  dropSquare: string | null;
  validDropSquare: string | null;
  holdTimer: number | null;
}

export interface AnimationState {
  queue: Array<() => void>;
  active: boolean;
  frameId: number | null;
  effects: unknown[];
  pendingViewportSync: boolean;
}

export interface Scene {
  squareLayer: HTMLDivElement | null;
  pieceLayer: HTMLDivElement | null;
  fxLayer: HTMLCanvasElement | null;
  rankLayer: HTMLDivElement | null;
  fileLayer: HTMLDivElement | null;
  fxContext: CanvasRenderingContext2D | null;
  squareElements: HTMLButtonElement[];
  rankLabels: HTMLSpanElement[];
  fileLabels: HTMLSpanElement[];
  pieceElements: Map<string, HTMLButtonElement>;
  piecesById: Map<string, ScenePiece>;
  squareToPieceId: Map<string, string>;
  drag: DragState | null;
  animation: AnimationState;
}

interface VisualCell {
  row: number;
  col: number;
}

interface BoardEventHandlers {
  handleBoardClick: (event: MouseEvent) => void;
  handleBoardPointerDown: (event: PointerEvent) => void;
  handleBoardPointerMove: (event: PointerEvent) => void;
  handleBoardPointerUp: (event: PointerEvent) => void;
  handleBoardPointerCancel: (event: PointerEvent) => void;
  handleBoardLostPointerCapture: (event: PointerEvent) => void;
}

interface BoardSceneConfig {
  boardElement: HTMLElement;
  coordsToSquare: (row: number, col: number) => string;
  findKingSquare: (board: Board, color: PieceColor) => string | null;
  buildSquareAria: (piece: Piece | null, square: string, state: PublicSnapshot) => string;
  pieceAriaLabel: (piece: ScenePiece) => string;
  renderPieceSvg: (piece: ScenePiece | { color: PieceColor; type: PieceType }) => string;
  getVisualCellForSquare: (square: string) => VisualCell | null;
  getBoardCoordsForVisualCell: (visualRow: number, visualCol: number) => { row: number; col: number };
  getSelectedSquare: () => string | null;
  getLegalMoves: () => Move[];
  getPendingPromotionMove: () => Move | null;
  hasClockExpired: () => boolean;
  isReplayActive: () => boolean;
  getFxProfile?: () => FxProfile;
  getPremove?: () => { from: string; to: string } | null;
}

function createSquareElement(index: number): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "square";
  button.dataset.visualIndex = String(index);
  button.tabIndex = -1;
  return button;
}

function createPieceElement(piece: ScenePiece, updatePieceElement: (element: HTMLButtonElement, piece: ScenePiece) => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "piece-node";
  button.tabIndex = -1;
  updatePieceElement(button, piece);
  return button;
}

function createCoordinateLabel(className: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.setAttribute("aria-hidden", "true");
  return element;
}

export function createBoardScene({
  boardElement,
  coordsToSquare,
  findKingSquare,
  buildSquareAria,
  pieceAriaLabel,
  renderPieceSvg,
  getVisualCellForSquare,
  getBoardCoordsForVisualCell,
  getSelectedSquare,
  getLegalMoves,
  getPendingPromotionMove,
  hasClockExpired,
  isReplayActive,
  getFxProfile,
  getPremove,
}: BoardSceneConfig) {
  const scene: Scene = {
    squareLayer: null,
    pieceLayer: null,
    fxLayer: null,
    rankLayer: null,
    fileLayer: null,
    fxContext: null,
    squareElements: [],
    rankLabels: [],
    fileLabels: [],
    pieceElements: new Map(),
    piecesById: new Map(),
    squareToPieceId: new Map(),
    drag: null,
    animation: {
      queue: [],
      active: false,
      frameId: null,
      effects: [],
      pendingViewportSync: false,
    },
  };

  let pieceIdCounter = 1;

  function updatePieceElement(element: HTMLButtonElement, piece: ScenePiece): void {
    element.dataset.pieceId = piece.id;
    element.dataset.square = piece.square;
    element.dataset.piece = piece.type;
    element.dataset.color = piece.color;
    element.setAttribute("aria-label", pieceAriaLabel(piece));
    element.innerHTML = renderPieceSvg(piece);
  }

  function getBoardMetrics(): BoardMetrics {
    const rect = scene.squareLayer!.getBoundingClientRect();
    return {
      rect,
      cellSize: rect.width / 8,
    };
  }

  function getSquareFromPointer(clientX: number, clientY: number): string | null {
    const { rect } = getBoardMetrics();
    if (
      clientX < rect.left
      || clientX > rect.right
      || clientY < rect.top
      || clientY > rect.bottom
    ) {
      return null;
    }

    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width - 1);
    const y = Math.min(Math.max(clientY - rect.top, 0), rect.height - 1);
    const visualCol = Math.floor(x / (rect.width / 8));
    const visualRow = Math.floor(y / (rect.height / 8));
    const { row, col } = getBoardCoordsForVisualCell(visualRow, visualCol);

    return coordsToSquare(row, col);
  }

  function getDraggedPieceLayout(clientX: number, clientY: number): DraggedPieceLayout {
    const { rect, cellSize } = getBoardMetrics();
    return {
      size: cellSize,
      left: clientX - rect.left - (cellSize / 2),
      top: clientY - rect.top - (cellSize / 2),
    };
  }

  function getSquareLayout(square: string): SquareLayout | null {
    const visualCell = getVisualCellForSquare(square);
    if (!visualCell) {
      return null;
    }

    const { cellSize } = getBoardMetrics();
    return {
      left: visualCell.col * cellSize,
      top: visualCell.row * cellSize,
      width: cellSize,
      height: cellSize,
      centerX: (visualCell.col * cellSize) + (cellSize / 2),
      centerY: (visualCell.row * cellSize) + (cellSize / 2),
    };
  }

  function getElementLayout(element: HTMLElement): ElementLayout {
    const boardRect = scene.squareLayer!.getBoundingClientRect();
    const rect = element.getBoundingClientRect();

    return {
      left: rect.left - boardRect.left,
      top: rect.top - boardRect.top,
      width: rect.width,
      height: rect.height,
      centerX: (rect.left - boardRect.left) + (rect.width / 2),
      centerY: (rect.top - boardRect.top) + (rect.height / 2),
    };
  }

  function getLayoutCenter(layout: SquareLayout | ElementLayout): LayoutCenter {
    return {
      x: layout.left + (layout.width / 2),
      y: layout.top + (layout.height / 2),
    };
  }

  function pinPieceElementToLayout(element: HTMLElement, layout: SquareLayout | ElementLayout): void {
    element.style.left = `${layout.left}px`;
    element.style.top = `${layout.top}px`;
    element.style.width = `${layout.width}px`;
    element.style.height = `${layout.height}px`;
  }

  function positionDraggedPiece(pieceId: string, clientX: number, clientY: number): void {
    const element = scene.pieceElements.get(pieceId);
    if (!element) {
      return;
    }

    const layout = getDraggedPieceLayout(clientX, clientY);
    element.style.left = `${layout.left}px`;
    element.style.top = `${layout.top}px`;
    element.style.width = `${layout.size}px`;
    element.style.height = `${layout.size}px`;
    element.classList.add("dragging");
  }

  function positionPieceElement(piece: ScenePiece): void {
    const element = scene.pieceElements.get(piece.id);
    if (!element) {
      return;
    }

    const activeDrag = scene.drag;
    const isDraggingPiece = activeDrag?.mode === "dragging" && activeDrag.pieceId === piece.id;

    if (isDraggingPiece) {
      const layout = getDraggedPieceLayout(activeDrag.currentX, activeDrag.currentY);
      element.style.left = `${layout.left}px`;
      element.style.top = `${layout.top}px`;
      element.style.width = `${layout.size}px`;
      element.style.height = `${layout.size}px`;
      element.classList.add("dragging");
      return;
    }

    const visualCell = getVisualCellForSquare(piece.square);
    if (!visualCell) {
      return;
    }

    element.style.left = `${visualCell.col * 12.5}%`;
    element.style.top = `${visualCell.row * 12.5}%`;
    element.style.width = "12.5%";
    element.style.height = "12.5%";
    element.classList.remove("dragging");
  }

  function positionAllPieces(): void {
    for (const piece of scene.piecesById.values()) {
      positionPieceElement(piece);
    }
  }

  function syncFxLayerSize(): void {
    const { rect } = getBoardMetrics();
    const fxProfile = getFxProfile?.() ?? ({} as Partial<FxProfile>);
    const dprCap = fxProfile.dprCap ?? 1.5;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);

    scene.fxLayer!.width = Math.round(rect.width * dpr);
    scene.fxLayer!.height = Math.round(rect.height * dpr);
    scene.fxContext!.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene.fxContext!.clearRect(0, 0, rect.width, rect.height);
  }

  // Board clock overlay state (hoisted for access in updateBoardClocks)
  let clockLayer: HTMLDivElement | null = null;
  const clockElements: Record<string, HTMLDivElement> = {};
  const clockRoles = ["wMin", "wSec", "bMin", "bSec"];

  function positionClockDigits() {
    if (!clockLayer) return;
    const { cellSize } = getBoardMetrics();
    if (cellSize <= 0) return;

    // Squares: wMin=d4, wSec=e4, bMin=d5, bSec=e5
    // When flipped, swap left/right so minutes stays visually left
    const a1Cell = getVisualCellForSquare("a1");
    const flipped = a1Cell ? a1Cell.col > 0 : false;
    const squares = flipped
      ? ["e4", "d4", "e5", "d5"]
      : ["d4", "e4", "d5", "e5"];

    // Corner alignment within each square [justifyContent, alignItems]:
    // Normal (white view):  wMin=right,top  wSec=left,top  bMin=right,bottom  bSec=left,bottom
    // Flipped (black view): everything mirrors — top↔bottom, left↔right
    const aligns: [string, string][] = flipped
      ? [
          ["flex-end", "flex-end"],    // wMin: right, bottom
          ["flex-start", "flex-end"],  // wSec: left, bottom
          ["flex-end", "flex-start"],  // bMin: right, top
          ["flex-start", "flex-start"],// bSec: left, top
        ]
      : [
          ["flex-end", "flex-start"],  // wMin: right, top
          ["flex-start", "flex-start"],// wSec: left, top
          ["flex-end", "flex-end"],    // bMin: right, bottom
          ["flex-start", "flex-end"],  // bSec: left, bottom
        ];

    for (let i = 0; i < 4; i++) {
      const cell = getVisualCellForSquare(squares[i]);
      if (!cell) continue;
      const el = clockElements[clockRoles[i]];
      if (!el) continue;
      el.style.left = `${cell.col * cellSize}px`;
      el.style.top = `${cell.row * cellSize}px`;
      el.style.width = `${cellSize}px`;
      el.style.height = `${cellSize}px`;
      el.style.fontSize = `${Math.max(10, cellSize * 0.22)}px`;
      el.style.justifyContent = aligns[i][0];
      el.style.alignItems = aligns[i][1];
    }
  }

  function initializeBoardScene(eventHandlers: BoardEventHandlers): void {
    boardElement.innerHTML = "";
    scene.squareElements = [];
    scene.rankLabels = [];
    scene.fileLabels = [];

    boardElement.parentElement?.querySelectorAll(".board-coordinates").forEach((element) => {
      element.remove();
    });

    scene.squareLayer = document.createElement("div");
    scene.squareLayer.className = "board-layer square-layer";

    for (let index = 0; index < 64; index += 1) {
      const square = createSquareElement(index);
      scene.squareElements.push(square);
      scene.squareLayer.append(square);
    }

    scene.fxLayer = document.createElement("canvas");
    scene.fxLayer.className = "board-layer fx-layer";
    scene.fxLayer.setAttribute("aria-hidden", "true");
    scene.fxContext = scene.fxLayer.getContext("2d", {
      alpha: true,
      desynchronized: true,
    });

    scene.pieceLayer = document.createElement("div");
    scene.pieceLayer.className = "board-layer piece-layer";

    scene.rankLayer = document.createElement("div");
    scene.rankLayer.className = "board-coordinates board-ranks";

    scene.fileLayer = document.createElement("div");
    scene.fileLayer.className = "board-coordinates board-files";

    for (let index = 0; index < 8; index += 1) {
      const rankLabel = createCoordinateLabel("board-coordinate board-rank");
      const fileLabel = createCoordinateLabel("board-coordinate board-file");
      scene.rankLabels.push(rankLabel);
      scene.fileLabels.push(fileLabel);
      scene.rankLayer.append(rankLabel);
      scene.fileLayer.append(fileLabel);
    }

    // Board clock overlay — digits rendered on squares, behind pieces
    clockLayer = document.createElement("div");
    clockLayer.className = "board-layer clock-overlay-layer";
    clockLayer.setAttribute("aria-hidden", "true");

    for (let i = 0; i < 4; i++) {
      const el = document.createElement("div");
      el.className = "board-clock-digit";
      el.dataset.clockRole = clockRoles[i];
      clockElements[clockRoles[i]] = el;
      clockLayer.appendChild(el);
    }

    boardElement.append(scene.squareLayer, scene.fxLayer, scene.pieceLayer, clockLayer);
    (boardElement.parentElement ?? boardElement).append(scene.rankLayer, scene.fileLayer);

    boardElement.addEventListener("click", eventHandlers.handleBoardClick);
    boardElement.addEventListener("pointerdown", eventHandlers.handleBoardPointerDown);
    boardElement.addEventListener("pointermove", eventHandlers.handleBoardPointerMove);
    boardElement.addEventListener("pointerup", eventHandlers.handleBoardPointerUp);
    boardElement.addEventListener("pointercancel", eventHandlers.handleBoardPointerCancel);
    boardElement.addEventListener("lostpointercapture", eventHandlers.handleBoardLostPointerCapture);
  }

  function resetScenePiecesFromSnapshot(snapshot: PublicSnapshot): void {
    for (const element of scene.pieceElements.values()) {
      element.remove();
    }

    scene.pieceElements.clear();
    scene.piecesById.clear();
    scene.squareToPieceId.clear();
    pieceIdCounter = 1;

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = snapshot.board[row][col];
        if (!piece) {
          continue;
        }

        const descriptor: ScenePiece = {
          id: `piece-${pieceIdCounter}`,
          type: piece.type,
          color: piece.color,
          square: coordsToSquare(row, col),
        };
        pieceIdCounter += 1;

        const element = createPieceElement(descriptor, updatePieceElement);
        scene.piecesById.set(descriptor.id, descriptor);
        scene.pieceElements.set(descriptor.id, element);
        scene.squareToPieceId.set(descriptor.square, descriptor.id);
        scene.pieceLayer!.append(element);
      }
    }

    positionAllPieces();
  }

  function removeScenePiece(pieceId: string): void {
    const piece = scene.piecesById.get(pieceId);
    const element = scene.pieceElements.get(pieceId);

    if (!piece || !element) {
      return;
    }

    scene.squareToPieceId.delete(piece.square);
    scene.piecesById.delete(pieceId);
    scene.pieceElements.delete(pieceId);
    element.remove();
  }

  function applyMoveToScene(record: Move, fallbackSnapshot: PublicSnapshot): void {
    const movingPieceId = scene.squareToPieceId.get(record.from);
    if (!movingPieceId) {
      resetScenePiecesFromSnapshot(fallbackSnapshot);
      return;
    }

    const movingPiece = scene.piecesById.get(movingPieceId)!;
    scene.squareToPieceId.delete(record.from);

    if (record.capture) {
      const captureSquare = record.isEnPassant
        ? coordsToSquare(record.capturedRow!, record.capturedCol!)
        : record.to;
      const capturedPieceId = scene.squareToPieceId.get(captureSquare);
      if (capturedPieceId && capturedPieceId !== movingPieceId) {
        removeScenePiece(capturedPieceId);
      }
    }

    if (record.isCastling) {
      const castling = STANDARD_CASTLING;
      const side = record.castleSide === "k" ? castling.kingSide : castling.queenSide;
      const backRankRow = record.color === "w" ? 7 : 0;
      const rookFrom = coordsToSquare(backRankRow, side.rookFromCol);
      const rookTo = coordsToSquare(backRankRow, side.rookToCol);
      const rookId = scene.squareToPieceId.get(rookFrom);

      if (rookId) {
        const rookPiece = scene.piecesById.get(rookId)!;
        scene.squareToPieceId.delete(rookFrom);
        rookPiece.square = rookTo;
        scene.squareToPieceId.set(rookTo, rookId);
        updatePieceElement(scene.pieceElements.get(rookId)!, rookPiece);
      }
    }

    movingPiece.square = record.to;
    if (record.promotion) {
      movingPiece.type = record.promotion as PieceType;
    }

    scene.squareToPieceId.set(record.to, movingPieceId);
    updatePieceElement(scene.pieceElements.get(movingPieceId)!, movingPiece);
    positionAllPieces();
  }

  function refreshSquareLayer(state: PublicSnapshot): void {
    const lastMove = state.moveHistory[state.moveHistory.length - 1] ?? null;
    const checkedKingSquare = state.check ? findKingSquare(state.board, state.turn) : null;
    const moveTargets = new Map<string, Move>(getLegalMoves().map((move) => [move.to, move]));
    const dropSquare = scene.drag?.dropSquare ?? null;
    const validDropSquare = scene.drag?.validDropSquare ?? null;
    const selectedSquare = getSelectedSquare();

    boardElement.classList.toggle("has-selection", Boolean(selectedSquare));
    boardElement.classList.toggle("has-targets", moveTargets.size > 0);
    boardElement.classList.toggle("in-check", Boolean(checkedKingSquare));

    scene.squareElements.forEach((element: HTMLButtonElement, index: number) => {
      const visualRow = Math.floor(index / 8);
      const visualCol = index % 8;
      const { row, col } = getBoardCoordsForVisualCell(visualRow, visualCol);
      const square = coordsToSquare(row, col);
      const piece = state.board[row][col];
      const moveTarget = moveTargets.get(square);

      element.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
      element.dataset.square = square;
      element.dataset.piece = piece?.type ?? "";
      element.dataset.pieceColor = piece?.color ?? "";
      element.setAttribute("aria-label", buildSquareAria(piece, square, state));

      if (square === selectedSquare) {
        element.classList.add("selected");
      }

      if (moveTarget) {
        element.classList.add("legal-target");
        if (moveTarget.capture) {
          element.classList.add("capture-target");
        }
      }

      if (lastMove && (square === lastMove.from || square === lastMove.to)) {
        element.classList.add("last-move");
      }

      const premove = getPremove?.();
      if (premove && (square === premove.from || square === premove.to)) {
        element.classList.add("premove");
      }

      if (checkedKingSquare && square === checkedKingSquare) {
        element.classList.add("king-in-check");
      }

      if (dropSquare && square === dropSquare) {
        element.classList.add("drop-hover");
        if (validDropSquare === square) {
          element.classList.add("drop-valid");
        }
      }
    });

    scene.rankLabels.forEach((label: HTMLSpanElement, index: number) => {
      const { row } = getBoardCoordsForVisualCell(index, 0);
      label.textContent = String(8 - row);
    });

    scene.fileLabels.forEach((label: HTMLSpanElement, index: number) => {
      const { col } = getBoardCoordsForVisualCell(7, index);
      label.textContent = FILES[col];
    });
  }

  function refreshPieceLayer(state: PublicSnapshot): void {
    const pendingPromotionMove = getPendingPromotionMove();
    const selectedSquare = getSelectedSquare();

    for (const piece of scene.piecesById.values()) {
      const element = scene.pieceElements.get(piece.id);
      const canDrag = (
        !pendingPromotionMove
        && !state.result.over
        && !hasClockExpired()
        && !isReplayActive()
        && piece.color === state.turn
      );

      element!.classList.toggle("can-drag", canDrag);
      element!.classList.toggle("selected-piece", piece.square === selectedSquare);
      positionPieceElement(piece);
    }
  }

  function refreshBoardScene(state: PublicSnapshot): void {
    refreshSquareLayer(state);
    refreshPieceLayer(state);
  }

  return {
    scene,
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
    removeScenePiece,
    resetScenePiecesFromSnapshot,
    syncFxLayerSize,
    updateBoardClocks(whiteMs: number, blackMs: number, activeColor: string | null, showClocks: boolean = true) {
      if (!clockLayer) return;

      if (!showClocks) {
        clockLayer.hidden = true;
        return;
      }
      clockLayer.hidden = false;

      const wMin = Math.floor(Math.max(whiteMs, 0) / 60000);
      const wSec = Math.floor((Math.max(whiteMs, 0) % 60000) / 1000);
      const bMin = Math.floor(Math.max(blackMs, 0) / 60000);
      const bSec = Math.floor((Math.max(blackMs, 0) % 60000) / 1000);

      clockElements.wMin.textContent = String(wMin);
      clockElements.wSec.textContent = String(wSec).padStart(2, "0");
      clockElements.bMin.textContent = String(bMin);
      clockElements.bSec.textContent = String(bSec).padStart(2, "0");

      clockLayer?.classList.toggle("clock-w-active", activeColor === "w");
      clockLayer?.classList.toggle("clock-b-active", activeColor === "b");
      positionClockDigits();
    },
    updatePieceElement,
  };
}
