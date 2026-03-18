import { DRAG_MOVE_THRESHOLD, TOUCH_DRAG_HOLD_MS } from "../app/constants";
import type { ChessGame } from "../domain/chess-game";
import type { Move, PublicSnapshot } from "../domain/chess-game";
import type { Scene, SquareLayout, ElementLayout } from "./board-scene";

interface BoardInputConfig {
  boardElement: HTMLElement;
  scene: Scene;
  game: ChessGame;
  getCurrentState: () => PublicSnapshot;
  getSelectedSquare: () => string | null;
  setSelectedSquare: (square: string | null) => void;
  getLegalMoves: () => Move[];
  setLegalMoves: (moves: Move[]) => void;
  getPendingPromotionMove: () => Move | null;
  isAnimationActive: () => boolean;
  isReplayActive: () => boolean;
  hasClockExpired: () => boolean;
  primeAudio: () => void;
  render: () => void;
  refreshBoardScene: (state: PublicSnapshot) => void;
  showPromotionDialog: (move: Move) => void;
  commitMove: (from: string, to: string, promotion?: string, options?: {
    dragStartLayout?: ElementLayout | null;
    effectStartLayout?: SquareLayout | null;
  }) => Promise<Move | null>;
  getPieceMoves: (square: string) => Move[];
  canStartDragFromSquare: (square: string) => boolean;
  getSquareFromPointer: (clientX: number, clientY: number) => string | null;
  positionDraggedPiece: (pieceId: string, clientX: number, clientY: number) => void;
  getSquareLayout: (square: string) => SquareLayout | null;
  getElementLayout: (element: HTMLElement) => ElementLayout;
}

export function createBoardInput({
  boardElement,
  scene,
  game,
  getCurrentState,
  getSelectedSquare,
  setSelectedSquare,
  getLegalMoves,
  setLegalMoves,
  getPendingPromotionMove,
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
}: BoardInputConfig) {
  let suppressNextClick = false;

  function clearSelection(): void {
    setSelectedSquare(null);
    setLegalMoves([]);
  }

  function handleSquareClick(square: string): void {
    const currentState = getCurrentState();
    if (getPendingPromotionMove() || isAnimationActive() || isReplayActive() || hasClockExpired()) {
      return;
    }

    const piece = game.getPiece(square);
    const selectedSquare = getSelectedSquare();
    const legalMoves = getLegalMoves();

    if (selectedSquare) {
      if (square === selectedSquare) {
        clearSelection();
        render();
        return;
      }

      const selectedMove = legalMoves.find((move: Move) => move.to === square);
      if (selectedMove) {
        if (selectedMove.promotionRequired) {
          showPromotionDialog(selectedMove);
          return;
        }

        void commitMove(selectedSquare, square);
        return;
      }

      if (piece?.color === currentState.turn) {
        const pieceMoves = getPieceMoves(square);
        setSelectedSquare(pieceMoves.length > 0 ? square : null);
        setLegalMoves(pieceMoves);
        render();
        return;
      }

      clearSelection();
      render();
      return;
    }

    if (piece?.color === currentState.turn && !currentState.result.over && !hasClockExpired()) {
      const pieceMoves = getPieceMoves(square);
      if (pieceMoves.length > 0) {
        setSelectedSquare(square);
        setLegalMoves(pieceMoves);
        render();
      }
    }
  }

  function clearDragHoldTimer(dragState: { holdTimer: number | null } | null = scene.drag): void {
    if (dragState?.holdTimer) {
      window.clearTimeout(dragState.holdTimer);
      dragState.holdTimer = null;
    }
  }

  function resetDragState(options: { suppressClick?: boolean } = {}): void {
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

    refreshBoardScene(getCurrentState());
  }

  function beginDrag(): void {
    if (!scene.drag || scene.drag.mode !== "pending") {
      return;
    }

    clearDragHoldTimer(scene.drag);
    scene.drag.mode = "dragging";
    setSelectedSquare(scene.drag.sourceSquare);
    setLegalMoves(scene.drag.legalMoves);
    boardElement.classList.add("dragging-active");
    updateDragPointer(scene.drag.currentX, scene.drag.currentY);
    refreshBoardScene(getCurrentState());
  }

  function updateDragPointer(clientX: number, clientY: number): void {
    if (!scene.drag) {
      return;
    }

    scene.drag.currentX = clientX;
    scene.drag.currentY = clientY;

    if (scene.drag.mode !== "dragging") {
      return;
    }

    positionDraggedPiece(scene.drag.pieceId, clientX, clientY);

    const hoveredSquare = getSquareFromPointer(clientX, clientY);
    const validDropSquare = scene.drag.legalMoves.some((move: Move) => move.to === hoveredSquare)
      ? hoveredSquare
      : null;
    const didSquareChange = hoveredSquare !== scene.drag.dropSquare;
    const didValidityChange = validDropSquare !== scene.drag.validDropSquare;

    scene.drag.dropSquare = hoveredSquare;
    scene.drag.validDropSquare = validDropSquare;

    if (didSquareChange || didValidityChange) {
      refreshBoardScene(getCurrentState());
    }
  }

  function handleBoardPointerDown(event: PointerEvent): void {
    const currentState = getCurrentState();
    if (
      getPendingPromotionMove()
      || isAnimationActive()
      || isReplayActive()
      || hasClockExpired()
      || currentState.result.over
      || event.button > 0
    ) {
      return;
    }

    primeAudio();

    const pieceElement = (event.target as Element).closest<HTMLElement>(".piece-node");
    if (!pieceElement) {
      return;
    }

    const square = pieceElement.dataset.square;
    const piece = game.getPiece(square!);
    if (!piece || piece.color !== currentState.turn || !canStartDragFromSquare(square!)) {
      return;
    }

    const moves = getPieceMoves(square!);
    if (moves.length === 0) {
      return;
    }

    scene.drag = {
      mode: "pending",
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      pieceId: pieceElement.dataset.pieceId!,
      sourceSquare: square!,
      legalMoves: moves,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      dropSquare: square!,
      validDropSquare: null,
      holdTimer: null,
    };

    if (event.pointerType === "touch") {
      scene.drag.holdTimer = window.setTimeout(beginDrag, TOUCH_DRAG_HOLD_MS);
    }

    boardElement.setPointerCapture(event.pointerId);
  }

  function handleBoardPointerMove(event: PointerEvent): void {
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

  function handleBoardPointerUp(event: PointerEvent): void {
    if (!scene.drag || scene.drag.pointerId !== event.pointerId) {
      return;
    }

    const activeDrag = scene.drag;

    if (activeDrag.mode !== "dragging") {
      resetDragState({ suppressClick: true });
      handleSquareClick(activeDrag.sourceSquare);
      return;
    }

    const dropMove = activeDrag.legalMoves.find((move: Move) => move.to === activeDrag.validDropSquare);

    if (!dropMove) {
      setSelectedSquare(activeDrag.sourceSquare);
      setLegalMoves(activeDrag.legalMoves);
      resetDragState({ suppressClick: true });
      return;
    }

    if (dropMove.promotionRequired) {
      setSelectedSquare(activeDrag.sourceSquare);
      setLegalMoves(activeDrag.legalMoves);
      resetDragState({ suppressClick: true });
      showPromotionDialog(dropMove);
      return;
    }

    const movingElement = scene.pieceElements.get(activeDrag.pieceId);
    const dragStartLayout = movingElement ? getElementLayout(movingElement) : null;
    const effectStartLayout = getSquareLayout(activeDrag.sourceSquare);

    resetDragState({ suppressClick: true });
    void commitMove(activeDrag.sourceSquare, dropMove.to, undefined, {
      dragStartLayout,
      effectStartLayout,
    });
  }

  function handleBoardPointerCancel(event: PointerEvent): void {
    if (!scene.drag || scene.drag.pointerId !== event.pointerId) {
      return;
    }

    setSelectedSquare(scene.drag.sourceSquare);
    setLegalMoves(scene.drag.legalMoves);
    resetDragState({ suppressClick: true });
  }

  function handleBoardLostPointerCapture(): void {
    if (!scene.drag) {
      return;
    }

    if (scene.drag.mode === "dragging") {
      setSelectedSquare(scene.drag.sourceSquare);
      setLegalMoves(scene.drag.legalMoves);
    }

    resetDragState({ suppressClick: true });
  }

  function handleBoardClick(event: MouseEvent): void {
    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      return;
    }

    if (
      getPendingPromotionMove()
      || isAnimationActive()
      || isReplayActive()
      || scene.drag?.mode === "dragging"
    ) {
      return;
    }

    primeAudio();

    const pieceElement = (event.target as Element).closest<HTMLElement>(".piece-node");
    const squareElement = (event.target as Element).closest<HTMLElement>(".square");
    const square = pieceElement?.dataset.square ?? squareElement?.dataset.square;

    if (!square) {
      return;
    }

    handleSquareClick(square);
  }

  return {
    beginDrag,
    clearDragHoldTimer,
    clearSelection,
    handleBoardClick,
    handleBoardLostPointerCapture,
    handleBoardPointerCancel,
    handleBoardPointerDown,
    handleBoardPointerMove,
    handleBoardPointerUp,
    handleSquareClick,
    resetDragState,
    updateDragPointer,
  };
}
