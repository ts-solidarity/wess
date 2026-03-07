import { ChessGame } from "./chess-engine.js";
import { renderPieceSvg } from "./piece-set.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PIECE_NAMES = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};
const DRAG_MOVE_THRESHOLD = 6;
const TOUCH_DRAG_HOLD_MS = 160;

const game = new ChessGame();

let orientation = "w";
let selectedSquare = null;
let legalMoves = [];
let pendingPromotionMove = null;
let resizeFrame = null;
let viewportBaseHeight = window.innerHeight;
let pieceIdCounter = 1;
let suppressNextClick = false;
let currentState = game.snapshot();

const boardElement = document.querySelector("#board");
const boardWrapElement = document.querySelector(".board-wrap");
const statusTextElement = document.querySelector("#status-text");
const turnBadgeElement = document.querySelector("#turn-badge");
const checkBadgeElement = document.querySelector("#check-badge");
const moveCounterElement = document.querySelector("#move-counter");
const orientationBadgeElement = document.querySelector("#orientation-badge");
const historyListElement = document.querySelector("#history-list");
const fenTextElement = document.querySelector("#fen-text");
const promotionDialog = document.querySelector("#promotion-dialog");
const promotionTitleElement = document.querySelector("#promotion-title");
const promotionOptionsElement = document.querySelector("#promotion-options");
const copyFenButton = document.querySelector("#copy-fen-button");
const flipButton = document.querySelector("#flip-button");
const resetButton = document.querySelector("#reset-button");
const promotionCancelButton = document.querySelector("#promotion-cancel");

const scene = {
  squareLayer: null,
  pieceLayer: null,
  fxLayer: null,
  fxContext: null,
  squareElements: [],
  pieceElements: new Map(),
  piecesById: new Map(),
  squareToPieceId: new Map(),
  drag: null,
};

function coordsToSquare(row, col) {
  return `${FILES[col]}${8 - row}`;
}

function squareToCoords(square) {
  if (typeof square !== "string" || square.length !== 2) {
    return null;
  }

  const file = square[0].toLowerCase();
  const rank = Number(square[1]);
  const col = FILES.indexOf(file);

  if (col === -1 || Number.isNaN(rank) || rank < 1 || rank > 8) {
    return null;
  }

  return {
    row: 8 - rank,
    col,
  };
}

function colorName(color) {
  return color === "w" ? "White" : "Black";
}

function findKingSquare(board, color) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece?.type === "k" && piece.color === color) {
        return coordsToSquare(row, col);
      }
    }
  }

  return null;
}

function describePosition(state) {
  if (state.result.over) {
    switch (state.result.reason) {
      case "checkmate":
        return `Checkmate. ${colorName(state.result.winner)} wins.`;
      case "stalemate":
        return "Draw by stalemate.";
      case "insufficient material":
        return "Draw by insufficient material.";
      case "threefold repetition":
        return "Draw by threefold repetition.";
      case "fifty-move rule":
        return "Draw by the fifty-move rule.";
      default:
        return "Game over.";
    }
  }

  if (state.check) {
    return `${colorName(state.turn)} to move. King is in check.`;
  }

  return `${colorName(state.turn)} to move.`;
}

function getVisualCellForCoords(row, col) {
  if (orientation === "w") {
    return { row, col };
  }

  return {
    row: 7 - row,
    col: 7 - col,
  };
}

function getVisualCellForSquare(square) {
  const coords = squareToCoords(square);
  return coords ? getVisualCellForCoords(coords.row, coords.col) : null;
}

function getBoardCoordsForVisualCell(visualRow, visualCol) {
  if (orientation === "w") {
    return { row: visualRow, col: visualCol };
  }

  return {
    row: 7 - visualRow,
    col: 7 - visualCol,
  };
}

function buildSquareAria(piece, square, state) {
  const location = `${square[0].toUpperCase()}${square[1]}`;
  if (!piece) {
    return `Empty square ${location}`;
  }

  const turnHint = piece.color === state.turn ? ", selectable" : "";
  return `${colorName(piece.color)} ${PIECE_NAMES[piece.type]} on ${location}${turnHint}`;
}

function pieceAriaLabel(piece) {
  const location = `${piece.square[0].toUpperCase()}${piece.square[1]}`;
  return `${colorName(piece.color)} ${PIECE_NAMES[piece.type]} on ${location}`;
}

function getBoardMetrics() {
  const rect = scene.squareLayer.getBoundingClientRect();
  return {
    rect,
    cellSize: rect.width / 8,
  };
}

function getSquareFromPointer(clientX, clientY) {
  const { rect } = getBoardMetrics();
  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
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

function getDraggedPieceLayout(clientX, clientY) {
  const { rect, cellSize } = getBoardMetrics();
  return {
    size: cellSize,
    left: clientX - rect.left - (cellSize / 2),
    top: clientY - rect.top - (cellSize / 2),
  };
}

function createSquareElement(index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "square";
  button.dataset.visualIndex = String(index);
  button.tabIndex = -1;
  return button;
}

function createPieceElement(piece) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "piece-node";
  button.tabIndex = -1;
  updatePieceElement(button, piece);
  return button;
}

function updatePieceElement(element, piece) {
  element.dataset.pieceId = piece.id;
  element.dataset.square = piece.square;
  element.dataset.piece = piece.type;
  element.dataset.color = piece.color;
  element.setAttribute("aria-label", pieceAriaLabel(piece));
  element.innerHTML = renderPieceSvg(piece);
}

function positionPieceElement(piece) {
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

function positionAllPieces() {
  for (const piece of scene.piecesById.values()) {
    positionPieceElement(piece);
  }
}

function syncFxLayerSize() {
  const { rect } = getBoardMetrics();
  const dpr = window.devicePixelRatio || 1;

  scene.fxLayer.width = Math.round(rect.width * dpr);
  scene.fxLayer.height = Math.round(rect.height * dpr);
  scene.fxContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  scene.fxContext.clearRect(0, 0, rect.width, rect.height);
}

function initializeBoardScene() {
  boardElement.innerHTML = "";

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
  scene.fxContext = scene.fxLayer.getContext("2d");

  scene.pieceLayer = document.createElement("div");
  scene.pieceLayer.className = "board-layer piece-layer";

  boardElement.append(scene.squareLayer, scene.fxLayer, scene.pieceLayer);

  boardElement.addEventListener("click", handleBoardClick);
  boardElement.addEventListener("pointerdown", handleBoardPointerDown);
  boardElement.addEventListener("pointermove", handleBoardPointerMove);
  boardElement.addEventListener("pointerup", handleBoardPointerUp);
  boardElement.addEventListener("pointercancel", handleBoardPointerCancel);
  boardElement.addEventListener("lostpointercapture", handleBoardLostPointerCapture);
}

function resetScenePiecesFromSnapshot(snapshot) {
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

      const descriptor = {
        id: `piece-${pieceIdCounter}`,
        type: piece.type,
        color: piece.color,
        square: coordsToSquare(row, col),
      };
      pieceIdCounter += 1;

      const element = createPieceElement(descriptor);
      scene.piecesById.set(descriptor.id, descriptor);
      scene.pieceElements.set(descriptor.id, element);
      scene.squareToPieceId.set(descriptor.square, descriptor.id);
      scene.pieceLayer.append(element);
    }
  }

  positionAllPieces();
}

function removeScenePiece(pieceId) {
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

function applyMoveToScene(record) {
  const movingPieceId = scene.squareToPieceId.get(record.from);
  if (!movingPieceId) {
    resetScenePiecesFromSnapshot(game.snapshot());
    return;
  }

  const movingPiece = scene.piecesById.get(movingPieceId);
  scene.squareToPieceId.delete(record.from);

  if (record.capture) {
    const captureSquare = record.isEnPassant
      ? coordsToSquare(record.capturedRow, record.capturedCol)
      : record.to;
    const capturedPieceId = scene.squareToPieceId.get(captureSquare);
    if (capturedPieceId && capturedPieceId !== movingPieceId) {
      removeScenePiece(capturedPieceId);
    }
  }

  if (record.isCastling) {
    const backRank = record.color === "w" ? "1" : "8";
    const rookFrom = record.castleSide === "k" ? `h${backRank}` : `a${backRank}`;
    const rookTo = record.castleSide === "k" ? `f${backRank}` : `d${backRank}`;
    const rookId = scene.squareToPieceId.get(rookFrom);

    if (rookId) {
      const rookPiece = scene.piecesById.get(rookId);
      scene.squareToPieceId.delete(rookFrom);
      rookPiece.square = rookTo;
      scene.squareToPieceId.set(rookTo, rookId);
      updatePieceElement(scene.pieceElements.get(rookId), rookPiece);
    }
  }

  movingPiece.square = record.to;
  if (record.promotion) {
    movingPiece.type = record.promotion;
  }

  scene.squareToPieceId.set(record.to, movingPieceId);
  updatePieceElement(scene.pieceElements.get(movingPieceId), movingPiece);
  positionAllPieces();
}

function refreshSquareLayer(state) {
  const lastMove = state.moveHistory[state.moveHistory.length - 1] ?? null;
  const checkedKingSquare = state.check ? findKingSquare(state.board, state.turn) : null;
  const moveTargets = new Map(legalMoves.map((move) => [move.to, move]));
  const dropSquare = scene.drag?.dropSquare ?? null;
  const validDropSquare = scene.drag?.validDropSquare ?? null;

  scene.squareElements.forEach((element, index) => {
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

    if (visualCol === 0) {
      element.dataset.rankLabel = String(8 - row);
    } else {
      delete element.dataset.rankLabel;
    }

    if (visualRow === 7) {
      element.dataset.fileLabel = FILES[col];
    } else {
      delete element.dataset.fileLabel;
    }

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
}

function refreshPieceLayer(state) {
  for (const piece of scene.piecesById.values()) {
    const element = scene.pieceElements.get(piece.id);
    const canDrag = !pendingPromotionMove && !state.result.over && piece.color === state.turn;

    element.classList.toggle("can-drag", canDrag);
    element.classList.toggle("selected-piece", piece.square === selectedSquare);
    positionPieceElement(piece);
  }
}

function refreshBoardScene(state) {
  refreshSquareLayer(state);
  refreshPieceLayer(state);
}

function renderHistory(state) {
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

    const whiteCell = document.createElement("span");
    whiteCell.className = "history-cell";
    whiteCell.textContent = whiteMove.notation;

    const blackCell = document.createElement("span");
    blackCell.className = "history-cell";
    blackCell.textContent = blackMove?.notation ?? "";

    row.append(moveNumber, whiteCell, blackCell);
    historyListElement.append(row);
  }
}

function renderStatus(state) {
  statusTextElement.textContent = describePosition(state);
  turnBadgeElement.textContent = colorName(state.turn);
  checkBadgeElement.textContent = state.check ? "Yes" : "No";
  moveCounterElement.textContent = String(state.moveHistory.length);
  orientationBadgeElement.textContent = colorName(orientation);
  fenTextElement.textContent = state.fen;
}

function render() {
  currentState = game.snapshot();
  refreshBoardScene(currentState);
  renderStatus(currentState);
  renderHistory(currentState);
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

function showPromotionDialog(move) {
  pendingPromotionMove = move;
  promotionTitleElement.textContent = `${colorName(move.color)} promotes on ${move.to}`;
  promotionOptionsElement.innerHTML = "";

  for (const type of ["q", "r", "b", "n"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "promotion-button";
    button.dataset.piece = type;
    button.innerHTML = `
      ${renderPieceSvg({ color: move.color, type }, "piece-svg promotion-piece")}
      <span class="promotion-label">${colorName(move.color)} ${PIECE_NAMES[type]}</span>
    `;
    button.addEventListener("click", () => {
      closePromotionDialog();
      commitMove(move.from, move.to, type);
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

function commitMove(from, to, promotion) {
  const record = game.makeMove(from, to, promotion);
  pendingPromotionMove = null;

  if (!record) {
    clearSelection();
    render();
    return null;
  }

  applyMoveToScene(record);
  clearSelection();
  render();
  historyListElement.scrollTop = historyListElement.scrollHeight;
  return record;
}

function handleSquareClick(square) {
  if (pendingPromotionMove) {
    return;
  }

  const piece = game.getPiece(square);

  if (selectedSquare) {
    if (square === selectedSquare) {
      clearSelection();
      render();
      return;
    }

    const selectedMove = legalMoves.find((move) => move.to === square);
    if (selectedMove) {
      if (selectedMove.promotionRequired) {
        showPromotionDialog(selectedMove);
        return;
      }

      commitMove(selectedSquare, square);
      return;
    }

    if (piece?.color === currentState.turn) {
      selectedSquare = square;
      legalMoves = game.getLegalMoves(square);
      render();
      return;
    }

    clearSelection();
    render();
    return;
  }

  if (piece?.color === currentState.turn && !currentState.result.over) {
    selectedSquare = square;
    legalMoves = game.getLegalMoves(square);
    render();
  }
}

function clearDragHoldTimer(dragState = scene.drag) {
  if (dragState?.holdTimer) {
    window.clearTimeout(dragState.holdTimer);
    dragState.holdTimer = null;
  }
}

function resetDragState(options = {}) {
  const { suppressClick = false } = options;
  const activeDrag = scene.drag;

  if (activeDrag) {
    clearDragHoldTimer(activeDrag);
    scene.drag = null;

    if (boardElement.hasPointerCapture?.(activeDrag.pointerId)) {
      try {
        boardElement.releasePointerCapture(activeDrag.pointerId);
      } catch {
        // Ignore invalid release attempts.
      }
    }
  }
  boardElement.classList.remove("dragging-active");

  if (suppressClick) {
    suppressNextClick = true;
  }

  refreshBoardScene(currentState);
}

function beginDrag() {
  if (!scene.drag || scene.drag.mode !== "pending") {
    return;
  }

  clearDragHoldTimer(scene.drag);
  scene.drag.mode = "dragging";
  selectedSquare = scene.drag.sourceSquare;
  legalMoves = scene.drag.legalMoves;
  boardElement.classList.add("dragging-active");
  updateDragPointer(scene.drag.currentX, scene.drag.currentY);
  refreshBoardScene(currentState);
}

function updateDragPointer(clientX, clientY) {
  if (!scene.drag) {
    return;
  }

  scene.drag.currentX = clientX;
  scene.drag.currentY = clientY;

  if (scene.drag.mode !== "dragging") {
    return;
  }

  const hoveredSquare = getSquareFromPointer(clientX, clientY);
  scene.drag.dropSquare = hoveredSquare;
  scene.drag.validDropSquare = scene.drag.legalMoves.some((move) => move.to === hoveredSquare)
    ? hoveredSquare
    : null;
  refreshBoardScene(currentState);
}

function handleBoardPointerDown(event) {
  if (pendingPromotionMove || currentState.result.over || event.button > 0) {
    return;
  }

  const pieceElement = event.target.closest(".piece-node");
  if (!pieceElement) {
    return;
  }

  const square = pieceElement.dataset.square;
  const piece = game.getPiece(square);
  if (!piece || piece.color !== currentState.turn) {
    return;
  }

  const moves = game.getLegalMoves(square);
  if (moves.length === 0) {
    return;
  }

  scene.drag = {
    mode: "pending",
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    pieceId: pieceElement.dataset.pieceId,
    sourceSquare: square,
    legalMoves: moves,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    dropSquare: square,
    validDropSquare: null,
    holdTimer: null,
  };

  if (event.pointerType === "touch") {
    scene.drag.holdTimer = window.setTimeout(beginDrag, TOUCH_DRAG_HOLD_MS);
  }

  boardElement.setPointerCapture(event.pointerId);
}

function handleBoardPointerMove(event) {
  if (!scene.drag || scene.drag.pointerId !== event.pointerId) {
    return;
  }

  scene.drag.currentX = event.clientX;
  scene.drag.currentY = event.clientY;

  if (scene.drag.mode === "pending") {
    const distance = Math.hypot(
      event.clientX - scene.drag.startX,
      event.clientY - scene.drag.startY,
    );

    if (scene.drag.pointerType === "touch") {
      if (distance >= (DRAG_MOVE_THRESHOLD * 2)) {
        clearDragHoldTimer(scene.drag);
        beginDrag();
      }
      return;
    }

    if (distance >= DRAG_MOVE_THRESHOLD) {
      beginDrag();
    }
    return;
  }

  updateDragPointer(event.clientX, event.clientY);
}

function handleBoardPointerUp(event) {
  if (!scene.drag || scene.drag.pointerId !== event.pointerId) {
    return;
  }

  const activeDrag = scene.drag;

  if (activeDrag.mode !== "dragging") {
    resetDragState();
    return;
  }

  const dropMove = activeDrag.legalMoves.find((move) => move.to === activeDrag.validDropSquare);

  if (!dropMove) {
    selectedSquare = activeDrag.sourceSquare;
    legalMoves = activeDrag.legalMoves;
    resetDragState({ suppressClick: true });
    return;
  }

  if (dropMove.promotionRequired) {
    selectedSquare = activeDrag.sourceSquare;
    legalMoves = activeDrag.legalMoves;
    resetDragState({ suppressClick: true });
    showPromotionDialog(dropMove);
    return;
  }

  resetDragState({ suppressClick: true });
  commitMove(activeDrag.sourceSquare, dropMove.to);
}

function handleBoardPointerCancel(event) {
  if (!scene.drag || scene.drag.pointerId !== event.pointerId) {
    return;
  }

  selectedSquare = scene.drag.sourceSquare;
  legalMoves = scene.drag.legalMoves;
  resetDragState({ suppressClick: true });
}

function handleBoardLostPointerCapture() {
  if (!scene.drag) {
    return;
  }

  if (scene.drag.mode === "dragging") {
    selectedSquare = scene.drag.sourceSquare;
    legalMoves = scene.drag.legalMoves;
  }

  resetDragState({ suppressClick: true });
}

function handleBoardClick(event) {
  if (suppressNextClick) {
    suppressNextClick = false;
    event.preventDefault();
    return;
  }

  if (pendingPromotionMove || scene.drag?.mode === "dragging") {
    return;
  }

  const pieceElement = event.target.closest(".piece-node");
  const squareElement = event.target.closest(".square");
  const square = pieceElement?.dataset.square ?? squareElement?.dataset.square;

  if (!square) {
    return;
  }

  handleSquareClick(square);
}

function updateBoardViewportSize() {
  const viewportHeight = viewportBaseHeight;
  const viewportWidth = window.innerWidth;
  const useViewportFit = viewportWidth <= 1040 || viewportHeight <= 760;
  const naturalSize = Math.min(860, Math.floor(boardWrapElement.clientWidth));
  const naturalPieceSize = Math.max(22, naturalSize * 0.103);

  if (!useViewportFit) {
    boardElement.style.removeProperty("--board-size");
    boardElement.style.setProperty("--piece-size", `${naturalPieceSize}px`);
    syncFxLayerSize();
    positionAllPieces();
    return;
  }

  const topOffset = Math.max(boardWrapElement.getBoundingClientRect().top, 0);
  const availableHeight = Math.floor(viewportHeight - topOffset - 12);
  const boardSize = Math.min(naturalSize, Math.max(availableHeight, 0));

  if (boardSize > 0 && boardSize < naturalSize - 8) {
    boardElement.style.setProperty("--board-size", `${boardSize}px`);
  } else {
    boardElement.style.removeProperty("--board-size");
  }

  const renderedSize = boardElement.clientWidth || boardSize || naturalSize;
  boardElement.style.setProperty("--piece-size", `${Math.max(22, renderedSize * 0.103)}px`);
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
  viewportBaseHeight = window.innerHeight;
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

flipButton.addEventListener("click", () => {
  orientation = orientation === "w" ? "b" : "w";
  render();
  queueBoardResize();
});

resetButton.addEventListener("click", () => {
  pendingPromotionMove = null;
  closePromotionDialog();
  clearSelection();
  resetDragState();
  game.reset();
  currentState = game.snapshot();
  resetScenePiecesFromSnapshot(currentState);
  render();
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

initializeBoardScene();
resetScenePiecesFromSnapshot(currentState);
render();
handleViewportResize();
window.addEventListener("resize", handleViewportResize);
window.addEventListener("orientationchange", handleViewportResize);
