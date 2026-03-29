import {
  MOVE_ANIMATION_MS,
  CASTLE_ANIMATION_MS,
  CAPTURE_FADE_MS,
  IMPACT_FLASH_MS,
  PROMOTION_BEAM_MS,
  PROMOTION_RESOLVE_MS,
  SOURCE_PULSE_MS,
  LANDING_PULSE_MS,
  EN_PASSANT_SLASH_MS,
  CHECK_STREAK_MS,
  CHECK_PULSE_MS,
  MATE_FLASH_MS,
  FORK_LANDING_PULSE_MS,
  FORK_TARGET_RING_MS,
  FORK_TARGET_SPARK_MS,
  FORK_TARGET_STAGGER_MS,
  FORK_BEAM_MS,
  FORK_FLASH_MS,
  FORK_RETICLE_MS,
  TRAIL_WINDOW,
} from "../app/constants";
import { detectKnightKingQueenFork } from "../domain/tactics";
import type { PieceColor, PieceType, Board, Move, PublicSnapshot } from "../domain/chess-game";
import { getDefinition, STANDARD_CASTLING } from "../domain/piece-movement";

type RGB = [number, number, number];

interface Point {
  x: number;
  y: number;
}

interface SquareLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface TrailPalette {
  core: RGB;
  glow: RGB;
  haze: RGB;
  smoke: RGB;
}

interface FxProfile {
  alphaScale: number;
  sizeScale: number;
  glowScale: number;
  soundScale: number;
  blurScale: number;
  sparkScale: number;
  detailScale: number;
  dprCap: number;
}

interface RenderProfile {
  blurScale: number;
  sparkScale: number;
  detailScale: number;
}

interface BoardMetrics {
  rect: DOMRect;
  cellSize: number;
}

interface AnimateFramesOptions {
  duration: number;
  delay?: number;
  onFrame: (progress: number, timestamp: number) => void;
  onComplete?: () => void;
}

interface PieceTravelOptions {
  duration?: number;
  delay?: number;
  scaleBoost?: number;
  arc?: number;
  palette?: TrailPalette;
  fadeIn?: number;
  fadeOut?: number;
}

interface CapturedPieceOptions {
  duration?: number;
  delay?: number;
  palette?: TrailPalette;
}

interface ResolvedPieceOptions {
  duration?: number;
  delay?: number;
  palette?: TrailPalette;
}

interface PulseEffectOptions {
  startTime?: number;
  duration?: number;
  radiusScale?: number;
  spread?: number;
  strength?: number;
  fadeIn?: number;
  fadeOut?: number;
}

interface TrailEffectOptions {
  startTime?: number;
  travelDuration?: number;
  lingerDuration?: number;
  width?: number;
  fadeIn?: number;
}

interface SparkBurstEffectOptions {
  startTime?: number;
  duration?: number;
  radiusScale?: number;
  count?: number;
  angle?: number | null;
  spreadAngle?: number;
  drift?: number;
  strength?: number;
  fadeIn?: number;
  fadeOut?: number;
}

interface RingEffectOptions {
  startTime?: number;
  duration?: number;
  radiusScale?: number;
  fadeIn?: number;
  fadeOut?: number;
}

interface ImpactEffectOptions {
  startTime?: number;
  duration?: number;
  radiusScale?: number;
  fadeIn?: number;
  fadeOut?: number;
}

interface BeamEffectOptions {
  startTime?: number;
  duration?: number;
  widthScale?: number;
  heightScale?: number;
  fadeIn?: number;
  fadeOut?: number;
}

interface BoardFlashEffectOptions {
  startTime?: number;
  duration?: number;
  fadeIn?: number;
  fadeOut?: number;
}

interface ReticleEffectOptions {
  startTime?: number;
  duration?: number;
  radiusScale?: number;
  rotate?: number;
  strength?: number;
  fadeIn?: number;
  fadeOut?: number;
}

interface FxEffectBase {
  startTime: number;
  duration: number;
  palette: TrailPalette;
  fadeIn?: number;
  fadeOut?: number;
  alphaScale?: number;
  sizeScale?: number;
  blurScale?: number;
  sparkScale?: number;
  detailScale?: number;
}

interface PulseEffect extends FxEffectBase {
  type: "pulse";
  x: number;
  y: number;
  radius: number;
  spread?: number;
  strength?: number;
}

interface TrailEffect {
  type: "trail";
  startTime: number;
  travelDuration: number;
  lingerDuration: number;
  from: Point;
  to: Point;
  width: number;
  palette: TrailPalette;
  fadeIn?: number;
  fadeOut?: number;
  alphaScale?: number;
  sizeScale?: number;
  blurScale?: number;
  sparkScale?: number;
  detailScale?: number;
}

interface ImpactEffect extends FxEffectBase {
  type: "impact";
  x: number;
  y: number;
  radius: number;
}

interface SparkEffect extends FxEffectBase {
  type: "sparks";
  x: number;
  y: number;
  radius: number;
  count?: number;
  angle: number | null;
  spreadAngle?: number;
  drift?: number;
  strength?: number;
}

interface RingEffect extends FxEffectBase {
  type: "ring";
  x: number;
  y: number;
  radius: number;
}

interface BeamEffect extends FxEffectBase {
  type: "beam";
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BoardFlashEffect extends FxEffectBase {
  type: "board-flash";
}

interface ReticleEffect extends FxEffectBase {
  type: "reticle";
  x: number;
  y: number;
  radius: number;
  rotate?: number;
  strength?: number;
}

type FxEffect =
  | PulseEffect
  | TrailEffect
  | ImpactEffect
  | SparkEffect
  | RingEffect
  | BeamEffect
  | BoardFlashEffect
  | ReticleEffect;

interface ScenePiece {
  id: string;
  type: PieceType;
  color: PieceColor;
  square: string;
}

interface SceneAnimation {
  queue: AnimationQueueItem[];
  active: boolean;
  frameId: number | null;
  effects: FxEffect[];
  pendingViewportSync: boolean;
}

interface Scene {
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
  drag: { mode: string; pieceId: string; currentX: number; currentY: number; dropSquare?: string | null; validDropSquare?: string | null } | null;
  animation: SceneAnimation;
}

interface AnimationQueueItem {
  task: () => Promise<void>;
  resolve: (value: void) => void;
  reject: (reason?: unknown) => void;
}

interface AnimateSceneMoveOptions {
  dragStartLayout?: SquareLayout;
  effectStartLayout?: SquareLayout;
}

interface KnightFork {
  forkingSquare: string;
  kingSquare: string;
  queenSquares: string[];
}

interface AnimationControllerConfig {
  boardElement: HTMLElement;
  scene: Scene;
  getFxProfile: () => FxProfile;
  onAnimationSettled: (() => void) | null;
  scheduleMoveAudio: (record: Move, afterState: PublicSnapshot, duration: number) => void;
  prefersReducedMotion: () => boolean;
  updateBoardViewportSize: () => void;
  getBoardMetrics: () => BoardMetrics;
  getSquareLayout: (square: string) => SquareLayout | null;
  getElementLayout: (element: HTMLElement) => SquareLayout;
  getLayoutCenter: (layout: SquareLayout) => Point;
  pinPieceElementToLayout: (element: HTMLElement, layout: SquareLayout) => void;
  applyMoveToScene: (record: Move, afterState: PublicSnapshot) => void;
  renderSnapshot: (snapshot: PublicSnapshot) => void;
  resetScenePiecesFromSnapshot: (snapshot: PublicSnapshot) => void;
  coordsToSquare: (row: number, col: number) => string;
  findKingSquare: (board: Board, turn: PieceColor) => string | null;
}

declare global {
  interface Navigator {
    deviceMemory?: number;
  }
}

function rgba([red, green, blue]: RGB, alpha: number): string {
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function lerp(start: number, end: number, progress: number): number {
  return start + ((end - start) * progress);
}

function lerpPoint(from: Point, to: Point, progress: number): Point {
  return {
    x: lerp(from.x, to.x, progress),
    y: lerp(from.y, to.y, progress),
  };
}

function easeOutCubic(progress: number): number {
  return 1 - ((1 - progress) ** 3);
}

function easeInOutSine(progress: number): number {
  return -(Math.cos(Math.PI * progress) - 1) / 2;
}

function easeInOutQuint(progress: number): number {
  return progress < 0.5
    ? 16 * (progress ** 5)
    : 1 - (((-2 * progress) + 2) ** 5) / 2;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 127.1) * 43758.5453123;
  return value - Math.floor(value);
}

function smoothStep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }

  const scaled = clamp01((value - edge0) / (edge1 - edge0));
  return scaled * scaled * (3 - (2 * scaled));
}

function fadeEnvelope(progress: number, fadeIn: number = 0.14, fadeOut: number = 0.2): number {
  const fadeInFactor = fadeIn > 0 ? smoothStep(0, fadeIn, progress) : 1;
  const fadeOutFactor = fadeOut > 0 ? 1 - smoothStep(1 - fadeOut, 1, progress) : 1;
  return fadeInFactor * fadeOutFactor;
}

function animateFrames({ duration, delay = 0, onFrame, onComplete }: AnimateFramesOptions): Promise<void> {
  return new Promise<void>((resolve) => {
    const startTime = performance.now() + delay;

    function step(timestamp: number): void {
      if (timestamp < startTime) {
        window.requestAnimationFrame(step);
        return;
      }

      const progress = duration <= 0
        ? 1
        : Math.min((timestamp - startTime) / duration, 1);

      onFrame(progress, timestamp);

      if (progress < 1) {
        window.requestAnimationFrame(step);
        return;
      }

      onComplete?.();
      resolve();
    }

    window.requestAnimationFrame(step);
  });
}

function getTrailPalette(color: PieceColor): TrailPalette {
  if (color === "w") {
    return {
      core: [245, 249, 255],
      glow: [103, 210, 255],
      haze: [43, 110, 255],
      smoke: [115, 160, 255],
    };
  }

  return {
    core: [255, 120, 96],
    glow: [255, 50, 40],
    haze: [96, 0, 0],
    smoke: [26, 0, 0],
  };
}

export function createAnimationController({
  boardElement,
  scene,
  getFxProfile,
  onAnimationSettled,
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
}: AnimationControllerConfig) {
  function getRenderProfile(): RenderProfile {
    const fxProfile = getFxProfile();
    const { rect } = getBoardMetrics();
    const area = rect.width * rect.height;
    const viewportMin = Math.min(window.innerWidth, window.innerHeight);
    const lowPowerDevice = (
      (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4)
      || (typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4)
      || viewportMin <= 820
    );
    const areaScale = area >= 520000 ? 0.82 : area >= 380000 ? 0.9 : 1;
    const deviceScale = lowPowerDevice ? 0.82 : 1;

    return {
      blurScale: (fxProfile.blurScale ?? 0.8) * areaScale * deviceScale,
      sparkScale: (fxProfile.sparkScale ?? 0.8) * areaScale * deviceScale,
      detailScale: (fxProfile.detailScale ?? 0.9) * areaScale * deviceScale,
    };
  }

  function animatePieceTravel(element: HTMLElement, startLayout: SquareLayout, endLayout: SquareLayout, options: PieceTravelOptions = {}): Promise<void> {
    const duration = options.duration ?? MOVE_ANIMATION_MS;
    const dx = endLayout.left - startLayout.left;
    const dy = endLayout.top - startLayout.top;
    const tilt = Math.max(-5, Math.min(5, dx / 28));
    const scaleBoost = options.scaleBoost ?? 0.08;
    const arcHeight = (options.arc ?? 0) * Math.max(Math.abs(dx), Math.abs(dy));
    const palette = options.palette ?? { glow: [255, 255, 255] as RGB, core: [255, 255, 255] as RGB };
    const fxProfile = getFxProfile();

    return animateFrames({
      duration,
      delay: options.delay ?? 0,
      onFrame(progress: number) {
        const eased = easeInOutQuint(progress);
        const envelope = fadeEnvelope(progress, options.fadeIn ?? 0.14, options.fadeOut ?? 0.2);
        const launch = smoothStep(0, 0.16, progress);
        const settle = 1 - smoothStep(0.78, 1, progress);
        const shimmer = Math.sin(progress * Math.PI);
        const x = lerp(0, dx, eased);
        const arcOffset = arcHeight * Math.sin(progress * Math.PI);
        const y = lerp(0, dy, eased) - arcOffset;
        const scaleX = 1
          + (shimmer * scaleBoost * (0.58 + (envelope * 0.34)))
          + (launch * 0.038)
          - (settle * 0.014);
        const scaleY = 1
          - (shimmer * scaleBoost * 0.16)
          - (launch * 0.026)
          + (settle * 0.01);
        const rotate = tilt * shimmer * (0.52 + (envelope * 0.3));
        const glowRadius = (12 + (22 * envelope)) * fxProfile.glowScale;
        const elevation = shimmer * 8 * fxProfile.glowScale;

        element.style.transform = `translate3d(${x}px, ${y}px, 0px) scale(${scaleX}, ${scaleY}) rotate(${rotate}deg)`;
        element.style.filter = `
          drop-shadow(0 ${4 + elevation}px ${8 + elevation * 2}px rgba(42, 31, 24, ${0.18 + shimmer * 0.12}))
          drop-shadow(0 0 ${glowRadius}px ${rgba(palette.glow, (0.14 + (envelope * 0.28)) * fxProfile.alphaScale)})
          drop-shadow(0 0 ${Math.max(8, glowRadius * 0.58)}px ${rgba(palette.core, (0.08 + (envelope * 0.16)) * fxProfile.alphaScale)})
        `;
        element.style.opacity = String(0.92 + (envelope * 0.08 * fxProfile.alphaScale));
      },
      onComplete() {
        pinPieceElementToLayout(element, endLayout);
        element.style.removeProperty("transform");
        element.style.removeProperty("filter");
        element.style.removeProperty("opacity");
      },
    });
  }

  function animateCapturedPiece(element: HTMLElement, options: CapturedPieceOptions = {}): Promise<void> {
    const duration = options.duration ?? CAPTURE_FADE_MS;
    const palette = options.palette ?? { glow: [255, 255, 255] as RGB, core: [255, 255, 255] as RGB };
    const fxProfile = getFxProfile();

    return animateFrames({
      duration,
      delay: options.delay ?? 0,
      onFrame(progress: number) {
        const eased = easeOutCubic(progress);
        const envelope = fadeEnvelope(progress, 0.14, 0.3);
        const scale = Math.max(0.18, 1 - (eased * 0.82));
        const rotate = 12 * eased;
        const opacity = 1 - eased;
        const glowRadius = (8 + (12 * envelope)) * fxProfile.glowScale;
        const flinch = progress < 0.2
          ? Math.sin(progress * 50) * 3 * (1 - progress / 0.2)
          : 0;

        element.style.transform = `scale(${scale}) rotate(${rotate}deg) translateX(${flinch}px)`;
        element.style.opacity = String(opacity);
        element.style.filter = `
          drop-shadow(0 0 ${glowRadius}px ${rgba(palette.glow, (0.08 + (envelope * 0.2)) * fxProfile.alphaScale)})
          drop-shadow(0 0 ${Math.max(4, glowRadius * 0.45)}px ${rgba(palette.core, (0.06 + (envelope * 0.12)) * fxProfile.alphaScale)})
        `;
      },
      onComplete() {
        element.style.opacity = "0";
        element.style.removeProperty("filter");
      },
    });
  }

  function animateResolvedPiece(element: HTMLElement, options: ResolvedPieceOptions = {}): Promise<void> {
    const duration = options.duration ?? PROMOTION_RESOLVE_MS;
    const palette = options.palette ?? { glow: [255, 255, 255] as RGB, core: [255, 255, 255] as RGB };
    const fxProfile = getFxProfile();

    return animateFrames({
      duration,
      delay: options.delay ?? 0,
      onFrame(progress: number) {
        const eased = easeOutCubic(progress);
        const envelope = fadeEnvelope(progress, 0.1, 0.34);
        const scale = 0.74 + (0.26 * eased) + (Math.sin(progress * Math.PI) * 0.08);
        const glowRadius = (10 + (14 * envelope)) * fxProfile.glowScale;

        element.style.transform = `scale(${scale})`;
        element.style.opacity = String(0.58 + (0.42 * eased));
        element.style.filter = `
          drop-shadow(0 0 ${glowRadius}px ${rgba(palette.glow, (0.14 + (envelope * 0.24)) * fxProfile.alphaScale)})
          drop-shadow(0 0 ${Math.max(4, glowRadius * 0.5)}px ${rgba(palette.core, (0.08 + (envelope * 0.14)) * fxProfile.alphaScale)})
        `;
      },
      onComplete() {
        element.style.removeProperty("transform");
        element.style.removeProperty("opacity");
        element.style.removeProperty("filter");
      },
    });
  }

  function addFxEffect(effect: FxEffect): void {
    const fxProfile = getFxProfile();
    const renderProfile = getRenderProfile();
    scene.animation.effects.push({
      ...effect,
      alphaScale: fxProfile.alphaScale,
      sizeScale: fxProfile.sizeScale,
      blurScale: renderProfile.blurScale,
      sparkScale: renderProfile.sparkScale,
      detailScale: renderProfile.detailScale,
    });
    ensureFxLoop();
  }

  function clearFxEffects(): void {
    scene.animation.effects = [];

    if (scene.animation.frameId !== null) {
      window.cancelAnimationFrame(scene.animation.frameId);
      scene.animation.frameId = null;
    }

    if (scene.fxContext && scene.squareLayer) {
      const { rect } = getBoardMetrics();
      scene.fxContext.clearRect(0, 0, rect.width, rect.height);
    }
  }

  function emitPulseEffect(layout: SquareLayout | null, palette: TrailPalette, options: PulseEffectOptions = {}): void {
    if (!layout) {
      return;
    }

    const center = getLayoutCenter(layout);
    addFxEffect({
      type: "pulse",
      startTime: options.startTime ?? performance.now(),
      duration: options.duration ?? LANDING_PULSE_MS,
      x: center.x,
      y: center.y,
      radius: layout.width * (options.radiusScale ?? 0.46),
      spread: options.spread ?? 1,
      strength: options.strength ?? 1,
      palette,
      fadeIn: options.fadeIn ?? 0.12,
      fadeOut: options.fadeOut ?? 0.34,
    });
  }

  function emitTrailEffect(fromLayout: SquareLayout | null, toLayout: SquareLayout | null, palette: TrailPalette, options: TrailEffectOptions = {}): void {
    if (!fromLayout || !toLayout) {
      return;
    }

    addFxEffect({
      type: "trail",
      startTime: options.startTime ?? performance.now(),
      travelDuration: options.travelDuration ?? MOVE_ANIMATION_MS,
      lingerDuration: options.lingerDuration ?? 110,
      from: getLayoutCenter(fromLayout),
      to: getLayoutCenter(toLayout),
      width: options.width ?? (Math.max(fromLayout.width, toLayout.width) * 0.22),
      palette,
      fadeIn: options.fadeIn ?? 0.18,
    });
  }

  function emitSparkBurstEffect(layout: SquareLayout | null, palette: TrailPalette, options: SparkBurstEffectOptions = {}): void {
    if (!layout) {
      return;
    }

    const center = getLayoutCenter(layout);
    const renderProfile = getRenderProfile();
    const desiredCount = Math.max(2, Math.round((options.count ?? 8) * renderProfile.sparkScale));
    addFxEffect({
      type: "sparks",
      startTime: options.startTime ?? performance.now(),
      duration: options.duration ?? 220,
      x: center.x,
      y: center.y,
      radius: layout.width * (options.radiusScale ?? 0.46),
      count: desiredCount,
      angle: options.angle ?? null,
      spreadAngle: options.spreadAngle ?? (Math.PI * 0.9),
      drift: options.drift ?? 1,
      strength: options.strength ?? 1,
      palette,
      fadeIn: options.fadeIn ?? 0.06,
      fadeOut: options.fadeOut ?? 0.34,
    });
  }

  function emitRingEffect(layout: SquareLayout | null, palette: TrailPalette, options: RingEffectOptions = {}): void {
    if (!layout) {
      return;
    }

    const center = getLayoutCenter(layout);
    addFxEffect({
      type: "ring",
      startTime: options.startTime ?? performance.now(),
      duration: options.duration ?? FORK_TARGET_RING_MS,
      x: center.x,
      y: center.y,
      radius: layout.width * (options.radiusScale ?? 0.62),
      palette,
      fadeIn: options.fadeIn ?? 0.14,
      fadeOut: options.fadeOut ?? 0.24,
    });
  }

  function emitImpactEffect(layout: SquareLayout | null, palette: TrailPalette, options: ImpactEffectOptions = {}): void {
    if (!layout) {
      return;
    }

    const center = getLayoutCenter(layout);
    addFxEffect({
      type: "impact",
      startTime: options.startTime ?? performance.now(),
      duration: options.duration ?? IMPACT_FLASH_MS,
      x: center.x,
      y: center.y,
      radius: layout.width * (options.radiusScale ?? 0.46),
      palette,
      fadeIn: options.fadeIn ?? 0.14,
      fadeOut: options.fadeOut ?? 0.28,
    });
  }

  function emitBeamEffect(layout: SquareLayout | null, palette: TrailPalette, options: BeamEffectOptions = {}): void {
    if (!layout) {
      return;
    }

    const center = getLayoutCenter(layout);
    addFxEffect({
      type: "beam",
      startTime: options.startTime ?? performance.now(),
      duration: options.duration ?? FORK_BEAM_MS,
      x: center.x,
      y: center.y,
      width: layout.width * (options.widthScale ?? 0.72),
      height: layout.height * (options.heightScale ?? 1.8),
      palette,
      fadeIn: options.fadeIn ?? 0.16,
      fadeOut: options.fadeOut ?? 0.22,
    });
  }

  function emitBoardFlashEffect(palette: TrailPalette, options: BoardFlashEffectOptions = {}): void {
    addFxEffect({
      type: "board-flash",
      startTime: options.startTime ?? performance.now(),
      duration: options.duration ?? FORK_FLASH_MS,
      palette,
      fadeIn: options.fadeIn ?? 0.08,
      fadeOut: options.fadeOut ?? 0.34,
    });
  }

  function emitReticleEffect(layout: SquareLayout | null, palette: TrailPalette, options: ReticleEffectOptions = {}): void {
    if (!layout) {
      return;
    }

    const center = getLayoutCenter(layout);
    addFxEffect({
      type: "reticle",
      startTime: options.startTime ?? performance.now(),
      duration: options.duration ?? FORK_RETICLE_MS,
      x: center.x,
      y: center.y,
      radius: layout.width * (options.radiusScale ?? 0.66),
      palette,
      rotate: options.rotate ?? 0.08,
      strength: options.strength ?? 1,
      fadeIn: options.fadeIn ?? 0.14,
      fadeOut: options.fadeOut ?? 0.24,
    });
  }

  function drawTrailEffect(context: CanvasRenderingContext2D, effect: TrailEffect, timestamp: number): boolean {
    const elapsed = timestamp - effect.startTime;
    if (elapsed < 0) {
      return true;
    }

    const travelDuration = effect.travelDuration ?? effect.lingerDuration;
    const lingerDuration = effect.lingerDuration ?? 0;
    const totalDuration = travelDuration + lingerDuration;
    if (elapsed >= totalDuration) {
      return false;
    }

    const inTravel = elapsed <= travelDuration || lingerDuration === 0;
    let headProgress: number;
    let tailProgress: number;
    let alphaEnvelope: number;
    let widthScale: number;

    if (inTravel) {
      const travelProgress = travelDuration <= 0 ? 1 : Math.min(elapsed / travelDuration, 1);
      const easedHead = easeInOutSine(travelProgress);
      headProgress = easedHead;
      tailProgress = Math.max(easedHead - TRAIL_WINDOW, 0);
      alphaEnvelope = fadeEnvelope(travelProgress, effect.fadeIn ?? 0.16, 0) * (effect.alphaScale ?? 1);
      widthScale = 0.84 + (alphaEnvelope * 0.16);
    } else {
      const lingerProgress = Math.min((elapsed - travelDuration) / lingerDuration, 1);
      headProgress = 1;
      tailProgress = Math.min(1, (1 - TRAIL_WINDOW) + (easeOutCubic(lingerProgress) * TRAIL_WINDOW));
      alphaEnvelope = (1 - smoothStep(0, 1, lingerProgress)) * (effect.alphaScale ?? 1);
      widthScale = 0.8 - (lingerProgress * 0.22);
    }

    const head = lerpPoint(effect.from, effect.to, headProgress);
    const tail = lerpPoint(effect.from, effect.to, tailProgress);
    const width = effect.width * widthScale * (effect.sizeScale ?? 1);
    const blurScale = effect.blurScale ?? 0.8;
    const detailScale = effect.detailScale ?? 0.9;
    const routeGradient = context.createLinearGradient(effect.from.x, effect.from.y, effect.to.x, effect.to.y);
    routeGradient.addColorStop(0, rgba(effect.palette.haze, 0.18 * alphaEnvelope));
    routeGradient.addColorStop(0.45, rgba(effect.palette.glow, 0.28 * alphaEnvelope));
    routeGradient.addColorStop(1, rgba(effect.palette.core, 0.38 * alphaEnvelope));

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalCompositeOperation = "lighter";

    context.shadowBlur = width * 0.76 * blurScale;
    context.shadowColor = rgba(effect.palette.glow, 0.38 * alphaEnvelope);
    context.strokeStyle = routeGradient;
    context.lineWidth = width * 0.28;
    context.beginPath();
    context.moveTo(effect.from.x, effect.from.y);
    context.lineTo(effect.to.x, effect.to.y);
    context.stroke();

    if (detailScale >= 0.88) {
      context.strokeStyle = rgba(effect.palette.smoke, 0.22 * alphaEnvelope);
      context.lineWidth = width * 0.78;
      context.beginPath();
      context.moveTo(tail.x, tail.y);
      context.lineTo(head.x, head.y);
      context.stroke();
    }

    context.shadowBlur = width * 0.96 * blurScale;
    context.shadowColor = rgba(effect.palette.glow, alphaEnvelope);
    context.strokeStyle = rgba(effect.palette.glow, 0.78 * alphaEnvelope);
    context.lineWidth = width * 0.34;
    context.beginPath();
    context.moveTo(tail.x, tail.y);
    context.lineTo(head.x, head.y);
    context.stroke();

    context.shadowBlur = width * 0.64 * blurScale;
    context.shadowColor = rgba(effect.palette.core, 0.9 * alphaEnvelope);
    context.fillStyle = rgba(effect.palette.core, 0.9 * alphaEnvelope);
    context.beginPath();
    context.arc(head.x, head.y, width * 0.18, 0, Math.PI * 2);
    context.fill();

    context.restore();
    return true;
  }

  function drawPulseEffect(context: CanvasRenderingContext2D, effect: PulseEffect, timestamp: number): boolean {
    const elapsed = timestamp - effect.startTime;
    if (elapsed < 0) {
      return true;
    }

    const progress = Math.min(elapsed / effect.duration, 1);
    if (progress >= 1) {
      return false;
    }

    const alpha = fadeEnvelope(progress, effect.fadeIn ?? 0.12, effect.fadeOut ?? 0.34);
    const eased = easeOutCubic(progress);
    const radius = effect.radius * (0.32 + (eased * (effect.spread ?? 1))) * (effect.sizeScale ?? 1);
    const strength = effect.strength ?? 1;
    const blurScale = effect.blurScale ?? 0.8;
    const detailScale = effect.detailScale ?? 0.9;
    const gradient = context.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, radius);
    gradient.addColorStop(0, rgba(effect.palette.core, 0.3 * alpha * strength));
    gradient.addColorStop(0.28, rgba(effect.palette.glow, 0.2 * alpha * strength));
    gradient.addColorStop(0.72, rgba(effect.palette.haze, 0.1 * alpha * strength));
    gradient.addColorStop(1, rgba(effect.palette.haze, 0));

    context.save();
    context.globalCompositeOperation = "lighter";
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    context.fill();

    context.shadowBlur = radius * 0.38 * blurScale;
    context.shadowColor = rgba(effect.palette.glow, 0.8 * alpha * strength);
    context.strokeStyle = rgba(effect.palette.glow, 0.44 * alpha * strength);
    context.lineWidth = Math.max(1.2, radius * 0.06);
    context.beginPath();
    context.arc(effect.x, effect.y, radius * 0.72, 0, Math.PI * 2);
    context.stroke();

    if (detailScale >= 0.86) {
      context.strokeStyle = rgba(effect.palette.core, 0.72 * alpha * strength);
      context.lineWidth = Math.max(1, radius * 0.03);
      context.beginPath();
      context.arc(effect.x, effect.y, radius * 0.36, 0, Math.PI * 2);
      context.stroke();
    }

    context.restore();
    return true;
  }

  function drawImpactEffect(context: CanvasRenderingContext2D, effect: ImpactEffect, timestamp: number): boolean {
    const elapsed = timestamp - effect.startTime;
    if (elapsed < 0) {
      return true;
    }

    const progress = Math.min(elapsed / effect.duration, 1);
    if (progress >= 1) {
      return false;
    }

    const eased = easeOutCubic(progress);
    const radius = effect.radius * (0.24 + (eased * 1.2));
    const alpha = (1 - progress) * fadeEnvelope(progress, effect.fadeIn ?? 0.12, effect.fadeOut ?? 0.28) * (effect.alphaScale ?? 1);
    const scaledRadius = radius * (effect.sizeScale ?? 1);
    const blurScale = effect.blurScale ?? 0.8;
    const detailScale = effect.detailScale ?? 0.9;
    const gradient = context.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, scaledRadius);
    gradient.addColorStop(0, rgba(effect.palette.core, 0.88 * alpha));
    gradient.addColorStop(0.28, rgba(effect.palette.glow, 0.48 * alpha));
    gradient.addColorStop(0.75, rgba(effect.palette.haze, 0.18 * alpha));
    gradient.addColorStop(1, rgba(effect.palette.haze, 0));

    context.save();
    context.globalCompositeOperation = "lighter";
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(effect.x, effect.y, scaledRadius, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = rgba(effect.palette.core, 0.9 * alpha);
    context.lineWidth = Math.max(2, effect.radius * (effect.sizeScale ?? 1) * 0.08 * alpha);
    context.shadowBlur = effect.radius * (effect.sizeScale ?? 1) * 0.58 * blurScale;
    context.shadowColor = rgba(effect.palette.glow, 0.9 * alpha);

    const rayCount = Math.max(2, Math.round(2 + (detailScale * 2)));
    for (let index = 0; index < rayCount; index += 1) {
      const angle = (Math.PI / rayCount) + (((Math.PI * 2) / rayCount) * index);
      const inner = scaledRadius * 0.22;
      const outer = scaledRadius * 0.98;
      context.beginPath();
      context.moveTo(effect.x + (Math.cos(angle) * inner), effect.y + (Math.sin(angle) * inner));
      context.lineTo(effect.x + (Math.cos(angle) * outer), effect.y + (Math.sin(angle) * outer));
      context.stroke();
    }

    context.restore();
    return true;
  }

  function drawSparkEffect(context: CanvasRenderingContext2D, effect: SparkEffect, timestamp: number): boolean {
    const elapsed = timestamp - effect.startTime;
    if (elapsed < 0) {
      return true;
    }

    const progress = Math.min(elapsed / effect.duration, 1);
    if (progress >= 1) {
      return false;
    }

    const eased = easeOutCubic(progress);
    const alpha = (1 - progress) * fadeEnvelope(progress, effect.fadeIn ?? 0.06, effect.fadeOut ?? 0.34) * (effect.alphaScale ?? 1);
    const radius = effect.radius * (effect.sizeScale ?? 1);
    const count = effect.count ?? 8;
    const drift = effect.drift ?? 1;
    const strength = effect.strength ?? 1;
    const blurScale = effect.blurScale ?? 0.8;

    context.save();
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";

    for (let index = 0; index < count; index += 1) {
      const seed = (index + 1) * 1.173;
      const angleNoise = pseudoRandom(seed + (effect.x * 0.013) + (effect.y * 0.019));
      const lengthNoise = pseudoRandom((seed * 1.9) + 4.7);
      const widthNoise = pseudoRandom((seed * 2.7) + 1.3);
      const angle = effect.angle === null
        ? angleNoise * Math.PI * 2
        : effect.angle + ((angleNoise - 0.5) * (effect.spreadAngle ?? Math.PI));
      const inner = radius * (0.08 + (eased * 0.12));
      const outer = radius * (0.28 + ((0.78 + (lengthNoise * 0.32)) * eased * drift));
      const innerX = effect.x + (Math.cos(angle) * inner);
      const innerY = effect.y + (Math.sin(angle) * inner);
      const outerX = effect.x + (Math.cos(angle) * outer);
      const outerY = effect.y + (Math.sin(angle) * outer);
      const lineWidth = Math.max(1.1, radius * (0.025 + (widthNoise * 0.018)));

      context.strokeStyle = rgba(effect.palette.glow, 0.5 * alpha * strength);
      context.shadowBlur = radius * 0.24 * blurScale;
      context.shadowColor = rgba(effect.palette.glow, 0.8 * alpha * strength);
      context.strokeStyle = rgba(effect.palette.core, 0.92 * alpha * strength);
      context.lineWidth = lineWidth;
      context.beginPath();
      context.moveTo(innerX, innerY);
      context.lineTo(outerX, outerY);
      context.stroke();
    }

    context.restore();
    return true;
  }

  function drawRingEffect(context: CanvasRenderingContext2D, effect: RingEffect, timestamp: number): boolean {
    const elapsed = timestamp - effect.startTime;
    if (elapsed < 0) {
      return true;
    }

    const progress = Math.min(elapsed / effect.duration, 1);
    if (progress >= 1) {
      return false;
    }

    const radius = effect.radius * (0.52 + (easeOutCubic(progress) * 0.72)) * (effect.sizeScale ?? 1);
    const alpha = (1 - progress) * fadeEnvelope(progress, effect.fadeIn ?? 0.16, effect.fadeOut ?? 0.24) * (effect.alphaScale ?? 1);
    const blurScale = effect.blurScale ?? 0.8;
    const detailScale = effect.detailScale ?? 0.9;

    context.save();
    context.globalCompositeOperation = "lighter";
    context.strokeStyle = rgba(effect.palette.glow, 0.58 * alpha);
    context.lineWidth = Math.max(1.6, effect.radius * 0.11 * alpha);
    context.shadowBlur = effect.radius * 0.48 * blurScale;
    context.shadowColor = rgba(effect.palette.glow, 0.9 * alpha);
    context.beginPath();
    context.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    context.stroke();

    if (detailScale >= 0.9) {
      context.strokeStyle = rgba(effect.palette.core, 0.82 * alpha);
      context.lineWidth = Math.max(1.2, effect.radius * 0.04 * alpha);
      context.beginPath();
      context.arc(effect.x, effect.y, radius * 0.76, 0, Math.PI * 2);
      context.stroke();
    }

    context.restore();
    return true;
  }

  function drawBeamEffect(context: CanvasRenderingContext2D, effect: BeamEffect, timestamp: number): boolean {
    const elapsed = timestamp - effect.startTime;
    if (elapsed < 0) {
      return true;
    }

    const progress = Math.min(elapsed / effect.duration, 1);
    if (progress >= 1) {
      return false;
    }

    const alpha = (1 - progress) * fadeEnvelope(progress, effect.fadeIn ?? 0.14, effect.fadeOut ?? 0.24) * (effect.alphaScale ?? 1);
    const width = effect.width * (0.24 + ((1 - progress) * 0.14)) * (effect.sizeScale ?? 1);
    const blurScale = effect.blurScale ?? 0.8;
    const gradient = context.createLinearGradient(effect.x, effect.y - effect.height, effect.x, effect.y + effect.height);
    gradient.addColorStop(0, rgba(effect.palette.haze, 0));
    gradient.addColorStop(0.2, rgba(effect.palette.glow, 0.22 * alpha));
    gradient.addColorStop(0.45, rgba(effect.palette.core, 0.78 * alpha));
    gradient.addColorStop(0.7, rgba(effect.palette.glow, 0.28 * alpha));
    gradient.addColorStop(1, rgba(effect.palette.haze, 0));

    context.save();
    context.globalCompositeOperation = "lighter";
    context.fillStyle = gradient;
    context.shadowBlur = width * 0.9 * blurScale;
    context.shadowColor = rgba(effect.palette.glow, 0.92 * alpha);
    context.fillRect(effect.x - (width / 2), effect.y - effect.height, width, effect.height * 2);
    context.restore();
    return true;
  }

  function drawBoardFlashEffect(context: CanvasRenderingContext2D, effect: BoardFlashEffect, timestamp: number): boolean {
    const elapsed = timestamp - effect.startTime;
    if (elapsed < 0) {
      return true;
    }

    const progress = Math.min(elapsed / effect.duration, 1);
    if (progress >= 1) {
      return false;
    }

    const { rect } = getBoardMetrics();
    const alpha = (1 - progress) * 0.36 * fadeEnvelope(progress, effect.fadeIn ?? 0.08, effect.fadeOut ?? 0.36) * (effect.alphaScale ?? 1);
    const gradient = context.createRadialGradient(
      rect.width / 2,
      rect.height / 2,
      rect.width * 0.12,
      rect.width / 2,
      rect.height / 2,
      rect.width * 0.82,
    );
    gradient.addColorStop(0, rgba(effect.palette.glow, alpha));
    gradient.addColorStop(0.45, rgba(effect.palette.haze, alpha * 0.68));
    gradient.addColorStop(1, rgba(effect.palette.smoke, 0));

    context.save();
    context.globalCompositeOperation = "lighter";
    context.fillStyle = gradient;
    context.fillRect(0, 0, rect.width, rect.height);
    context.restore();
    return true;
  }

  function drawReticleEffect(context: CanvasRenderingContext2D, effect: ReticleEffect, timestamp: number): boolean {
    const elapsed = timestamp - effect.startTime;
    if (elapsed < 0) {
      return true;
    }

    const progress = Math.min(elapsed / effect.duration, 1);
    if (progress >= 1) {
      return false;
    }

    const alpha = (1 - progress) * fadeEnvelope(progress, effect.fadeIn ?? 0.14, effect.fadeOut ?? 0.24)
      * (effect.alphaScale ?? 1);
    const eased = easeOutCubic(progress);
    const radius = effect.radius * (0.8 + (eased * 0.18)) * (effect.sizeScale ?? 1);
    const rotate = (effect.rotate ?? 0.08) * (1 - eased);
    const strength = effect.strength ?? 1;
    const blurScale = effect.blurScale ?? 0.8;
    const detailScale = effect.detailScale ?? 0.9;
    const bracketOffset = radius * 0.58;
    const bracketArm = radius * 0.28;
    const crossLength = radius * 0.2;

    context.save();
    context.globalCompositeOperation = "lighter";
    context.translate(effect.x, effect.y);
    context.rotate(rotate);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.shadowBlur = radius * 0.34 * blurScale;
    context.shadowColor = rgba(effect.palette.glow, 0.86 * alpha * strength);
    context.strokeStyle = rgba(effect.palette.core, 0.88 * alpha * strength);
    context.lineWidth = Math.max(1.5, radius * 0.045);

    const cornerSigns: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];

    for (const [xSign, ySign] of cornerSigns) {
      const cornerX = bracketOffset * xSign;
      const cornerY = bracketOffset * ySign;
      context.beginPath();
      context.moveTo(cornerX, cornerY - (bracketArm * ySign));
      context.lineTo(cornerX, cornerY);
      context.lineTo(cornerX - (bracketArm * xSign), cornerY);
      context.stroke();
    }

    context.strokeStyle = rgba(effect.palette.glow, 0.62 * alpha * strength);
    context.lineWidth = Math.max(1.1, radius * 0.028);
    context.beginPath();
    context.moveTo(-crossLength, 0);
    context.lineTo(crossLength, 0);
    context.moveTo(0, -crossLength);
    context.lineTo(0, crossLength);
    context.stroke();

    if (detailScale >= 0.88) {
      context.fillStyle = rgba(effect.palette.core, 0.8 * alpha * strength);
      context.beginPath();
      context.arc(0, 0, Math.max(1.2, radius * 0.06), 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
    return true;
  }

  function renderFxFrame(timestamp: number): void {
    if (!scene.fxContext || !scene.squareLayer) {
      scene.animation.frameId = null;
      return;
    }

    const { rect } = getBoardMetrics();
    scene.fxContext.clearRect(0, 0, rect.width, rect.height);

    scene.animation.effects = scene.animation.effects.filter((effect: FxEffect) => {
      switch (effect.type) {
        case "trail":
          return drawTrailEffect(scene.fxContext!, effect, timestamp);
        case "pulse":
          return drawPulseEffect(scene.fxContext!, effect, timestamp);
        case "impact":
          return drawImpactEffect(scene.fxContext!, effect, timestamp);
        case "sparks":
          return drawSparkEffect(scene.fxContext!, effect, timestamp);
        case "ring":
          return drawRingEffect(scene.fxContext!, effect, timestamp);
        case "beam":
          return drawBeamEffect(scene.fxContext!, effect, timestamp);
        case "board-flash":
          return drawBoardFlashEffect(scene.fxContext!, effect, timestamp);
        case "reticle":
          return drawReticleEffect(scene.fxContext!, effect, timestamp);
        default:
          return false;
      }
    });

    if (scene.animation.effects.length > 0) {
      scene.animation.frameId = window.requestAnimationFrame(renderFxFrame);
      return;
    }

    scene.animation.frameId = null;
  }

  function ensureFxLoop(): void {
    if (scene.animation.frameId !== null) {
      return;
    }

    scene.animation.frameId = window.requestAnimationFrame(renderFxFrame);
  }

  function queueSceneAnimation(task: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      scene.animation.queue.push({ task, resolve, reject });
      processSceneAnimationQueue();
    });
  }

  async function processSceneAnimationQueue(): Promise<void> {
    if (scene.animation.active) {
      return;
    }

    const next = scene.animation.queue.shift();
    if (!next) {
      return;
    }

    scene.animation.active = true;
    boardElement.classList.add("animating-active");

    try {
      const result = await next.task();
      next.resolve(result);
    } catch (error) {
      next.reject(error);
    } finally {
      scene.animation.active = false;
      boardElement.classList.remove("animating-active");

      if (scene.animation.pendingViewportSync) {
        scene.animation.pendingViewportSync = false;
        updateBoardViewportSize();
      }

      onAnimationSettled?.();
      processSceneAnimationQueue();
    }
  }

  function emitMoveEffects(record: Move, startLayout: SquareLayout, endLayout: SquareLayout, duration: number): void {
    const palette = getTrailPalette(record.color);
    const now = performance.now();
    const startCenter = getLayoutCenter(startLayout);
    const endCenter = getLayoutCenter(endLayout);
    const travelAngle = Math.atan2(endCenter.y - startCenter.y, endCenter.x - startCenter.x);

    emitPulseEffect(startLayout, palette, {
      startTime: now,
      duration: SOURCE_PULSE_MS,
      radiusScale: 0.34,
      spread: 0.78,
      strength: 0.72,
      fadeIn: 0.08,
      fadeOut: 0.5,
    });
    emitSparkBurstEffect(startLayout, palette, {
      startTime: now + 12,
      duration: SOURCE_PULSE_MS + 80,
      radiusScale: 0.26,
      count: 5,
      angle: travelAngle + Math.PI,
      spreadAngle: Math.PI * 0.62,
      drift: 0.84,
      strength: 0.72,
    });

    emitTrailEffect(startLayout, endLayout, palette, {
      startTime: now,
      travelDuration: duration,
      lingerDuration: 160,
      width: Math.max(startLayout.width, endLayout.width) * 0.18,
      fadeIn: 0.12,
    });

    emitPulseEffect(endLayout, palette, {
      startTime: now + Math.max(40, duration * 0.62),
      duration: LANDING_PULSE_MS,
      radiusScale: record.capture ? 0.56 : 0.46,
      spread: record.capture ? 1.08 : 0.88,
      strength: record.capture ? 1.04 : 0.82,
      fadeIn: 0.14,
      fadeOut: 0.34,
    });
    emitSparkBurstEffect(endLayout, palette, {
      startTime: now + Math.max(52, duration * 0.66),
      duration: LANDING_PULSE_MS + 40,
      radiusScale: record.capture ? 0.42 : 0.3,
      count: record.capture ? 9 : 6,
      angle: travelAngle,
      spreadAngle: Math.PI * (record.capture ? 0.92 : 0.72),
      drift: record.capture ? 1.06 : 0.88,
      strength: record.capture ? 1.08 : 0.74,
      fadeOut: 0.28,
    });

    if (record.capture) {
      const captureLayout = record.isEnPassant
        ? getSquareLayout(coordsToSquare(record.capturedRow!, record.capturedCol!))
        : endLayout;

      if (record.isEnPassant && captureLayout) {
        emitTrailEffect(endLayout, captureLayout, palette, {
          startTime: now + Math.max(70, duration * 0.52),
          travelDuration: EN_PASSANT_SLASH_MS,
          lingerDuration: 55,
          width: captureLayout.width * 0.12,
          fadeIn: 0.16,
        });

        emitPulseEffect(captureLayout, palette, {
          startTime: now + Math.max(105, duration * 0.6),
          duration: LANDING_PULSE_MS - 30,
          radiusScale: 0.44,
          spread: 0.9,
          strength: 0.94,
          fadeIn: 0.16,
          fadeOut: 0.32,
        });
        emitSparkBurstEffect(captureLayout, palette, {
          startTime: now + Math.max(108, duration * 0.62),
          duration: LANDING_PULSE_MS,
          radiusScale: 0.36,
          count: 7,
          angle: travelAngle,
          spreadAngle: Math.PI * 0.76,
          drift: 0.92,
          strength: 0.94,
        });
      }

      addFxEffect({
        type: "impact",
        startTime: now + Math.max(90, duration * (record.isEnPassant ? 0.62 : 0.52)),
        duration: IMPACT_FLASH_MS,
        x: captureLayout?.centerX ?? getLayoutCenter(endLayout).x,
        y: captureLayout?.centerY ?? getLayoutCenter(endLayout).y,
        radius: (captureLayout?.width ?? endLayout.width) * 0.48,
        palette,
        fadeIn: 0.16,
        fadeOut: 0.3,
      });
      emitSparkBurstEffect(captureLayout ?? endLayout, palette, {
        startTime: now + Math.max(96, duration * (record.isEnPassant ? 0.64 : 0.54)),
        duration: IMPACT_FLASH_MS + 40,
        radiusScale: 0.48,
        count: 12,
        angle: travelAngle,
        spreadAngle: Math.PI * 1.2,
        drift: 1.12,
        strength: 1.18,
        fadeOut: 0.24,
      });
    }

    if (record.promotion) {
      emitPulseEffect(endLayout, palette, {
        startTime: now + Math.max(30, duration * 0.72),
        duration: LANDING_PULSE_MS + 40,
        radiusScale: 0.62,
        spread: 1.18,
        strength: 1.08,
        fadeIn: 0.16,
        fadeOut: 0.28,
      });

      addFxEffect({
        type: "beam",
        startTime: now + Math.max(30, duration - 70),
        duration: PROMOTION_BEAM_MS,
        x: getLayoutCenter(endLayout).x,
        y: getLayoutCenter(endLayout).y,
        width: endLayout.width,
        height: endLayout.height * 1.55,
        palette,
        fadeIn: 0.18,
        fadeOut: 0.24,
      });
      emitSparkBurstEffect(endLayout, palette, {
        startTime: now + Math.max(38, duration * 0.74),
        duration: PROMOTION_BEAM_MS - 40,
        radiusScale: 0.5,
        count: 11,
        angle: -Math.PI / 2,
        spreadAngle: Math.PI * 0.66,
        drift: 1.18,
        strength: 1.06,
        fadeOut: 0.2,
      });
    }
  }

  function emitResultEffects(record: Move, state: PublicSnapshot): void {
    const kingSquare = state.check ? findKingSquare(state.board, state.turn) : null;
    if (!kingSquare) {
      return;
    }

    const kingLayout = getSquareLayout(kingSquare);
    if (!kingLayout) {
      return;
    }

    const center = getLayoutCenter(kingLayout);
    const palette = getTrailPalette(record.color);
    const attackerLayout = getSquareLayout(record.to);
    const now = performance.now();

    if (attackerLayout && kingSquare !== record.to) {
      emitTrailEffect(attackerLayout, kingLayout, palette, {
        startTime: now,
        travelDuration: CHECK_STREAK_MS,
        lingerDuration: state.result.reason === "checkmate" ? 90 : 55,
        width: kingLayout.width * (state.result.reason === "checkmate" ? 0.14 : 0.1),
        fadeIn: 0.18,
      });
    }

    emitPulseEffect(kingLayout, palette, {
      startTime: now + 28,
      duration: LANDING_PULSE_MS + (state.result.reason === "checkmate" ? 80 : 20),
      radiusScale: state.result.reason === "checkmate" ? 0.76 : 0.54,
      spread: state.result.reason === "checkmate" ? 1.22 : 0.96,
      strength: state.result.reason === "checkmate" ? 1.22 : 0.9,
      fadeIn: 0.12,
      fadeOut: 0.3,
    });

    addFxEffect({
      type: "ring",
      startTime: now + 40,
      duration: CHECK_PULSE_MS,
      x: center.x,
      y: center.y,
      radius: kingLayout.width * (state.result.reason === "checkmate" ? 0.92 : 0.72),
      palette,
      fadeIn: 0.16,
      fadeOut: 0.24,
    });
    emitSparkBurstEffect(kingLayout, palette, {
      startTime: now + 62,
      duration: state.result.reason === "checkmate" ? CHECK_PULSE_MS + 120 : CHECK_PULSE_MS - 80,
      radiusScale: state.result.reason === "checkmate" ? 0.56 : 0.34,
      count: state.result.reason === "checkmate" ? 12 : 7,
      spreadAngle: Math.PI * 2,
      drift: state.result.reason === "checkmate" ? 1.12 : 0.82,
      strength: state.result.reason === "checkmate" ? 1.12 : 0.72,
      fadeOut: 0.22,
    });

    if (state.result.reason === "checkmate") {
      boardElement.classList.add("checkmate-shake");
      setTimeout(() => boardElement.classList.remove("checkmate-shake"), 400);

      emitPulseEffect(kingLayout, palette, {
        startTime: now + 180,
        duration: LANDING_PULSE_MS + 120,
        radiusScale: 0.94,
        spread: 1.34,
        strength: 1.3,
        fadeIn: 0.14,
        fadeOut: 0.38,
      });

      addFxEffect({
        type: "board-flash",
        startTime: now,
        duration: MATE_FLASH_MS,
        palette,
        fadeIn: 0.1,
        fadeOut: 0.4,
      });
    }
  }

  function emitKnightForkEffects(record: Move, state: PublicSnapshot, fork: KnightFork): boolean {
    const knightLayout = getSquareLayout(fork.forkingSquare);
    const kingLayout = getSquareLayout(fork.kingSquare);
    const queenLayouts = fork.queenSquares
      .map((square: string) => ({
        square,
        layout: getSquareLayout(square),
      }))
      .filter((entry: { square: string; layout: SquareLayout | null }) => Boolean(entry.layout));

    if (!knightLayout || !kingLayout || queenLayouts.length === 0) {
      return false;
    }

    const palette = getTrailPalette(record.color);
    const now = performance.now();

    emitBoardFlashEffect(palette, {
      startTime: now + 132,
      duration: FORK_FLASH_MS,
      fadeIn: 0.06,
      fadeOut: 0.32,
    });

    emitPulseEffect(knightLayout, palette, {
      startTime: now + 16,
      duration: FORK_LANDING_PULSE_MS,
      radiusScale: 0.56,
      spread: 1.02,
      strength: 0.68,
      fadeIn: 0.12,
      fadeOut: 0.22,
    });
    emitSparkBurstEffect(knightLayout, palette, {
      startTime: now + 40,
      duration: FORK_TARGET_SPARK_MS + 10,
      radiusScale: 0.28,
      count: 6,
      spreadAngle: Math.PI * 2,
      drift: 0.82,
      strength: 0.54,
      fadeOut: 0.28,
    });

    emitImpactEffect(kingLayout, palette, {
      startTime: now + 112,
      duration: IMPACT_FLASH_MS + 60,
      radiusScale: 0.74,
      fadeIn: 0.14,
      fadeOut: 0.22,
    });
    emitReticleEffect(kingLayout, palette, {
      startTime: now + 122,
      duration: FORK_RETICLE_MS + 60,
      radiusScale: 0.88,
      rotate: 0.1,
      strength: 1.16,
    });
    emitSparkBurstEffect(kingLayout, palette, {
      startTime: now + 136,
      duration: FORK_TARGET_SPARK_MS + 80,
      radiusScale: 0.62,
      count: 18,
      spreadAngle: Math.PI * 2,
      drift: 1.18,
      strength: 1.22,
      fadeOut: 0.2,
    });

    queenLayouts.forEach(({ layout }: { layout: SquareLayout | null }, index: number) => {
      const offset = (index + 1) * FORK_TARGET_STAGGER_MS;
      emitImpactEffect(layout, palette, {
        startTime: now + 122 + offset,
        duration: IMPACT_FLASH_MS + 40,
        radiusScale: 0.54,
        fadeIn: 0.14,
        fadeOut: 0.22,
      });
      emitReticleEffect(layout, palette, {
        startTime: now + 132 + offset,
        duration: FORK_RETICLE_MS - 40,
        radiusScale: 0.7,
        rotate: -0.08,
        strength: 0.9,
      });
      emitSparkBurstEffect(layout, palette, {
        startTime: now + 146 + offset,
        duration: FORK_TARGET_SPARK_MS + 60,
        radiusScale: 0.5,
        count: 12,
        spreadAngle: Math.PI * 2,
        drift: 1.04,
        strength: 0.94,
        fadeOut: 0.22,
      });
    });

    if (state.result.reason === "checkmate") {
      emitBoardFlashEffect(palette, {
        startTime: now + 120,
        duration: MATE_FLASH_MS,
        fadeIn: 0.1,
        fadeOut: 0.4,
      });
    }

    return true;
  }

  async function animateSceneMove(record: Move, afterState: PublicSnapshot, options: AnimateSceneMoveOptions = {}): Promise<void> {
    const moveDuration = record.isCastling ? CASTLE_ANIMATION_MS : MOVE_ANIMATION_MS;
    scheduleMoveAudio(record, afterState, moveDuration);

    if (prefersReducedMotion()) {
      applyMoveToScene(record, afterState);
      renderSnapshot(afterState);
      return;
    }

    const movingPieceId = scene.squareToPieceId.get(record.from);
    const movingElement = movingPieceId ? scene.pieceElements.get(movingPieceId) : null;
    const movingPiece = movingPieceId ? scene.piecesById.get(movingPieceId) : null;

    if (!movingElement || !movingPiece) {
      resetScenePiecesFromSnapshot(afterState);
      renderSnapshot(afterState);
      return;
    }

    const movingStartLayout = options.dragStartLayout ?? getElementLayout(movingElement);
    const movingEndLayout = getSquareLayout(record.to);
    const effectStartLayout = options.effectStartLayout ?? movingStartLayout;
    const animatedElements: HTMLElement[] = [movingElement];
    const palette = getTrailPalette(record.color);
    let capturedElement: HTMLElement | null | undefined = null;

    if (!movingEndLayout) {
      applyMoveToScene(record, afterState);
      renderSnapshot(afterState);
      return;
    }

    const animations: Promise<void>[] = [];

    pinPieceElementToLayout(movingElement, movingStartLayout);
    movingElement.classList.add("animating-piece");
    emitMoveEffects(record, effectStartLayout, movingEndLayout, moveDuration);

    animations.push(animatePieceTravel(
      movingElement,
      movingStartLayout,
      movingEndLayout,
      {
        duration: moveDuration,
        scaleBoost: getDefinition(movingPiece.type).animationProfile === "leaper" ? 0.11 : 0.085,
        arc: getDefinition(movingPiece.type).animationProfile === "leaper" ? 0.3 : 0.06,
        palette,
        fadeIn: 0.12,
        fadeOut: 0.18,
      },
    ));

    if (record.capture) {
      const captureSquare = record.isEnPassant
        ? coordsToSquare(record.capturedRow!, record.capturedCol!)
        : record.to;
      const capturedPieceId = scene.squareToPieceId.get(captureSquare);
      capturedElement = capturedPieceId ? scene.pieceElements.get(capturedPieceId) : null;

      if (capturedElement && capturedPieceId !== movingPieceId) {
        pinPieceElementToLayout(capturedElement, getElementLayout(capturedElement));
        capturedElement.classList.add("captured-piece");
        animations.push(animateCapturedPiece(capturedElement, {
          delay: Math.max(80, moveDuration * 0.48),
          duration: CAPTURE_FADE_MS,
          palette,
        }));
      }
    }

    if (record.isCastling) {
      const castling = STANDARD_CASTLING;
      const side = record.castleSide === "k" ? castling.kingSide : castling.queenSide;
      const backRankRow = record.color === "w" ? 7 : 0;
      const rookFrom = coordsToSquare(backRankRow, side.rookFromCol);
      const rookTo = coordsToSquare(backRankRow, side.rookToCol);
      const rookId = scene.squareToPieceId.get(rookFrom);
      const rookElement = rookId ? scene.pieceElements.get(rookId) : null;
      const rookStartLayout = rookElement ? getElementLayout(rookElement) : null;
      const rookEndLayout = getSquareLayout(rookTo);

      if (rookElement && rookStartLayout && rookEndLayout) {
        animatedElements.push(rookElement);
        pinPieceElementToLayout(rookElement, rookStartLayout);
        rookElement.classList.add("animating-piece");

        emitPulseEffect(rookStartLayout, palette, {
          startTime: performance.now() + 20,
          duration: SOURCE_PULSE_MS - 20,
          radiusScale: 0.28,
          spread: 0.72,
          strength: 0.58,
          fadeIn: 0.08,
          fadeOut: 0.5,
        });

        emitPulseEffect(rookEndLayout, palette, {
          startTime: performance.now() + Math.max(60, moveDuration * 0.62),
          duration: LANDING_PULSE_MS - 20,
          radiusScale: 0.38,
          spread: 0.82,
          strength: 0.68,
          fadeIn: 0.12,
          fadeOut: 0.34,
        });

        emitTrailEffect(rookStartLayout, rookEndLayout, palette, {
          startTime: performance.now() + 30,
          travelDuration: moveDuration,
          lingerDuration: 95,
          width: rookStartLayout.width * 0.16,
          fadeIn: 0.16,
        });

        animations.push(animatePieceTravel(
          rookElement,
          rookStartLayout,
          rookEndLayout,
          {
            duration: moveDuration,
            delay: 30,
            scaleBoost: 0.04,
            palette,
            fadeIn: 0.12,
            fadeOut: 0.2,
          },
        ));
      }
    }

    await Promise.all(animations);
    applyMoveToScene(record, afterState);
    renderSnapshot(afterState);
    let promotionResolveTarget: HTMLElement | null | undefined = null;

    if (record.promotion) {
      const promotedPieceId = scene.squareToPieceId.get(record.to);
      promotionResolveTarget = promotedPieceId ? scene.pieceElements.get(promotedPieceId) : null;
    }

    for (const element of animatedElements) {
      element.classList.remove("animating-piece");
      element.style.removeProperty("transform");
      element.style.removeProperty("filter");
      element.style.removeProperty("opacity");
    }

    if (capturedElement) {
      capturedElement.classList.remove("captured-piece");
    }

    const fork = detectKnightKingQueenFork(record, afterState);
    const emittedForkEffects = fork ? emitKnightForkEffects(record, afterState, fork) : false;
    if (!emittedForkEffects) {
      emitResultEffects(record, afterState);
    }

    if (promotionResolveTarget) {
      await animateResolvedPiece(promotionResolveTarget, {
        duration: PROMOTION_RESOLVE_MS,
        palette,
      });
    }
  }

  return {
    animateSceneMove,
    clearFxEffects,
    queueSceneAnimation,
  };
}
