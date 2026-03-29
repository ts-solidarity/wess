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

  // --- Arrow drawing ---
  let arrowSvg: SVGSVGElement | null = null;

  function ensureArrowLayer(): SVGSVGElement {
    if (arrowSvg) return arrowSvg;
    arrowSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrowSvg.setAttribute("class", "board-layer arrow-layer");
    arrowSvg.setAttribute("aria-hidden", "true");
    arrowSvg.setAttribute("viewBox", "0 0 800 800");
    arrowSvg.style.pointerEvents = "none";
    arrowSvg.style.zIndex = "10";
    // Position on top of the square layer, not the whole board
    arrowSvg.style.position = "absolute";
    arrowSvg.style.inset = "0";
    arrowSvg.style.width = "100%";
    arrowSvg.style.height = "100%";
    arrowSvg.style.overflow = "visible";
    // Append to square layer's parent so it aligns with squares
    if (scene.squareLayer) {
      scene.squareLayer.parentElement!.appendChild(arrowSvg);
    } else {
      boardElement.appendChild(arrowSvg);
    }

    return arrowSvg;
  }

  interface DrawnArrow {
    from: string;
    to: string;
    element: SVGElement;
  }

  const drawnArrows: DrawnArrow[] = [];
  let arrowDragFrom: string | null = null;
  let arrowPreview: SVGElement | null = null;

  function getSquareCenter(square: string): { x: number; y: number } | null {
    const layout = getSquareLayout(square);
    if (!layout) return null;
    const squareLayerRect = scene.squareLayer?.getBoundingClientRect();
    if (!squareLayerRect || squareLayerRect.width === 0) return null;
    // Layout coords are pixels relative to the square layer
    // Convert to viewBox units (0-800)
    const x = ((layout.left + layout.width / 2) / squareLayerRect.width) * 800;
    const y = ((layout.top + layout.height / 2) / squareLayerRect.height) * 800;
    return { x, y };
  }

  function createArrowLine(x1: number, y1: number, x2: number, y2: number, isPreview: boolean): SVGGElement {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const opacity = isPreview ? "0.45" : "0.75";
    g.setAttribute("opacity", opacity);

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    const headLen = 38;
    const headW = 34;
    const shaftW = 16;
    const shaftLen = Math.max(0, len - headLen * 0.7);

    // Build arrow shape: shaft rectangle + triangular head
    const halfShaft = shaftW / 2;
    const halfHead = headW / 2;
    const points = [
      `0,${-halfShaft}`,
      `${shaftLen},${-halfShaft}`,
      `${shaftLen},${-halfHead}`,
      `${shaftLen + headLen},0`,
      `${shaftLen},${halfHead}`,
      `${shaftLen},${halfShaft}`,
      `0,${halfShaft}`,
    ].join(" ");

    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", points);
    polygon.setAttribute("fill", "rgba(0, 190, 190, 0.8)");
    polygon.setAttribute("stroke", "rgba(0, 120, 130, 0.35)");
    polygon.setAttribute("stroke-width", "2");
    polygon.setAttribute("stroke-linejoin", "round");

    g.setAttribute("transform", `translate(${x1},${y1}) rotate(${angle})`);
    g.appendChild(polygon);
    return g;
  }

  function createCircleHighlight(square: string): SVGCircleElement | null {
    const center = getSquareCenter(square);
    if (!center) return null;
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(center.x));
    circle.setAttribute("cy", String(center.y));
    circle.setAttribute("r", "35");
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", "rgba(0, 190, 190, 0.8)");
    circle.setAttribute("stroke-width", "8");
    return circle;
  }

  function clearArrows(): void {
    const svg = arrowSvg;
    if (!svg) return;
    for (const arrow of drawnArrows) {
      arrow.element.remove();
    }
    drawnArrows.length = 0;
    svg.querySelectorAll("circle").forEach((c) => c.remove());
  }

  function toggleArrow(from: string, to: string): void {
    const svg = ensureArrowLayer();
    const existing = drawnArrows.findIndex((a) => a.from === from && a.to === to);
    if (existing >= 0) {
      drawnArrows[existing].element.remove();
      drawnArrows.splice(existing, 1);
      return;
    }

    const fromCenter = getSquareCenter(from);
    const toCenter = getSquareCenter(to);
    if (!fromCenter || !toCenter) return;

    const line = createArrowLine(fromCenter.x, fromCenter.y, toCenter.x, toCenter.y, false);
    svg.appendChild(line);
    drawnArrows.push({ from, to, element: line });
  }

  function toggleCircle(square: string): void {
    const svg = ensureArrowLayer();
    const existing = svg.querySelector(`circle[data-square="${square}"]`);
    if (existing) {
      existing.remove();
      return;
    }
    const circle = createCircleHighlight(square);
    if (circle) {
      circle.setAttribute("data-square", square);
      svg.appendChild(circle);
    }
  }

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

      const pieceMoves = piece ? getPieceMoves(square) : [];
      if (pieceMoves.length > 0) {
        setSelectedSquare(square);
        setLegalMoves(pieceMoves);
        render();
        return;
      }

      clearSelection();
      render();
      return;
    }

    if (piece && !currentState.result.over && !hasClockExpired()) {
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
    // Right-click: start arrow drawing
    if (event.button === 2) {
      event.preventDefault();
      const square = getSquareFromPointer(event.clientX, event.clientY);
      if (square) {
        arrowDragFrom = square;
        if (arrowPreview) { arrowPreview.remove(); arrowPreview = null; }
      }
      return;
    }

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
    // Arrow preview on right-drag
    if (arrowDragFrom && (event.buttons & 2)) {
      const toSquare = getSquareFromPointer(event.clientX, event.clientY);
      if (!toSquare || toSquare === arrowDragFrom) {
        if (arrowPreview) { arrowPreview.remove(); arrowPreview = null; }
      } else {
        const fromCenter = getSquareCenter(arrowDragFrom);
        const toCenter = getSquareCenter(toSquare);
        if (fromCenter && toCenter) {
          if (arrowPreview) arrowPreview.remove();
          arrowPreview = createArrowLine(fromCenter.x, fromCenter.y, toCenter.x, toCenter.y, true);
          ensureArrowLayer().appendChild(arrowPreview);
        }
      }
      return;
    }

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
    // Right-click release: finalize arrow
    if (event.button === 2 && arrowDragFrom) {
      if (arrowPreview) { arrowPreview.remove(); arrowPreview = null; }
      const toSquare = getSquareFromPointer(event.clientX, event.clientY);
      if (toSquare && toSquare !== arrowDragFrom) {
        toggleArrow(arrowDragFrom, toSquare);
      } else if (toSquare === arrowDragFrom) {
        toggleCircle(arrowDragFrom);
      }
      arrowDragFrom = null;
      return;
    }

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

  // Suppress context menu on board
  boardElement.addEventListener("contextmenu", (e) => e.preventDefault());

  // Left click clears arrows
  const origHandleBoardClick = handleBoardClick;
  function handleBoardClickWithArrowClear(event: MouseEvent): void {
    if (drawnArrows.length > 0 || arrowSvg?.querySelector("circle")) {
      clearArrows();
    }
    origHandleBoardClick(event);
  }

  return {
    beginDrag,
    clearDragHoldTimer,
    clearSelection,
    handleBoardClick: handleBoardClickWithArrowClear,
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
