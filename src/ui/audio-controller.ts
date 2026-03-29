import type { PieceColor, Move, PublicSnapshot } from "../domain/chess-game";
import type { Settings } from "../app/settings";
import type { FxProfile } from "../app/settings";

interface SynthSweepOptions {
  delayMs?: number;
  durationMs?: number;
  attackMs?: number;
  releaseMs?: number;
  fromFrequency?: number;
  toFrequency?: number;
  gain?: number;
  type?: OscillatorType;
  detune?: number;
  filterType?: BiquadFilterType;
  filterFrequency?: number;
  q?: number;
}

interface MoveCueOptions {
  pitchScale?: number;
  gainScale?: number;
}

interface AudioControllerConfig {
  AudioContextCtor: (new () => AudioContext) | null;
  getSettings: () => Settings;
  getFxProfile: (settings: Settings) => FxProfile;
  onStateChange?: () => void;
}

interface AudioState {
  context: AudioContext | null;
  masterGain: GainNode | null;
  supported: boolean;
}

interface AudioStatus {
  text: string;
  tone: string;
}

export interface AudioController {
  ensureReady: () => Promise<AudioContext | null>;
  getStatus: () => AudioStatus;
  prime: () => void;
  scheduleMoveAudio: (record: Move, state: PublicSnapshot, moveDuration: number) => void;
  suspend: () => Promise<void>;
}

function getSoundScale(getSettings: () => Settings, getFxProfile: (settings: Settings) => FxProfile): number {
  const settings = getSettings();
  return settings.soundEnabled ? getFxProfile(settings).soundScale : 0;
}

export function createAudioController({
  AudioContextCtor,
  getSettings,
  getFxProfile,
  onStateChange,
}: AudioControllerConfig): AudioController {
  const audioState: AudioState = {
    context: null,
    masterGain: null,
    supported: Boolean(AudioContextCtor),
  };

  function notifyStateChange(): void {
    onStateChange?.();
  }

  function getStatus(): AudioStatus {
    const settings = getSettings();

    if (!audioState.supported) {
      return {
        text: "Synth audio is unavailable in this browser.",
        tone: "muted",
      };
    }

    if (!settings.soundEnabled) {
      return {
        text: "Sound is muted.",
        tone: "muted",
      };
    }

    if (audioState.context?.state === "running") {
      return {
        text: "Synth audio is armed.",
        tone: "ready",
      };
    }

    return {
      text: "Synth audio arms on first board interaction.",
      tone: "warn",
    };
  }

  async function ensureReady(): Promise<AudioContext | null> {
    const settings = getSettings();
    if (!audioState.supported || !settings.soundEnabled) {
      notifyStateChange();
      return null;
    }

    if (!audioState.context) {
      audioState.context = new AudioContextCtor!();
      audioState.masterGain = audioState.context.createGain();
      audioState.masterGain.gain.value = 0.92;
      audioState.masterGain.connect(audioState.context.destination);
    }

    if (audioState.context.state !== "running") {
      try {
        await audioState.context.resume();
      } catch {
        // Browser blocked resume outside a user gesture.
      }
    }

    notifyStateChange();
    return audioState.context.state === "running"
      ? audioState.context
      : null;
  }

  function prime(): void {
    if (!getSettings().soundEnabled) {
      notifyStateChange();
      return;
    }

    void ensureReady();
  }

  async function suspend(): Promise<void> {
    if (audioState.context?.state === "running") {
      try {
        await audioState.context.suspend();
      } catch {
        // Ignore browser suspension failures.
      }
    }

    notifyStateChange();
  }

  function playSynthSweep(options: SynthSweepOptions = {}): void {
    const context = audioState.context;
    const masterGain = audioState.masterGain;
    const soundScale = getSoundScale(getSettings, getFxProfile);

    if (!context || !masterGain || context.state !== "running" || soundScale <= 0) {
      return;
    }

    const startTime = context.currentTime + ((options.delayMs ?? 0) / 1000);
    const durationSeconds = Math.max((options.durationMs ?? 120) / 1000, 0.03);
    const attackSeconds = Math.max((options.attackMs ?? 8) / 1000, 0.002);
    const releaseSeconds = Math.max((options.releaseMs ?? ((options.durationMs ?? 120) * 0.72)) / 1000, 0.02);
    const endTime = startTime + durationSeconds;
    const stopTime = endTime + 0.05;
    const fromFrequency = Math.max(options.fromFrequency ?? 220, 24);
    const toFrequency = Math.max(options.toFrequency ?? fromFrequency, 24);
    const targetGain = Math.max((options.gain ?? 0.014) * soundScale, 0.00001);

    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const amp = context.createGain();

    oscillator.type = options.type ?? "triangle";
    oscillator.frequency.setValueAtTime(fromFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(toFrequency, endTime);
    oscillator.detune.setValueAtTime(options.detune ?? 0, startTime);

    filter.type = options.filterType ?? "lowpass";
    filter.frequency.setValueAtTime(options.filterFrequency ?? 1800, startTime);
    filter.Q.setValueAtTime(options.q ?? 0.5, startTime);

    amp.gain.setValueAtTime(0.00001, startTime);
    amp.gain.linearRampToValueAtTime(targetGain, startTime + attackSeconds);
    amp.gain.exponentialRampToValueAtTime(0.00001, Math.max(endTime, startTime + releaseSeconds));

    oscillator.connect(filter);
    filter.connect(amp);
    amp.connect(masterGain);

    oscillator.start(startTime);
    oscillator.stop(stopTime);
  }

  // --- Wood-tap style sounds: warm, soft, quick ---

  function playMoveCue(color: PieceColor, delayMs: number = 0, options: MoveCueOptions = {}): void {
    const base = color === "w" ? 280 : 220;
    const pitch = options.pitchScale ?? 1;
    const gainScale = options.gainScale ?? 1;

    // Soft thud
    playSynthSweep({
      delayMs,
      durationMs: 60,
      attackMs: 3,
      releaseMs: 55,
      fromFrequency: base * pitch,
      toFrequency: base * 0.7 * pitch,
      gain: 0.013 * gainScale,
      type: "sine",
      filterFrequency: 900,
    });

    // Subtle resonance
    playSynthSweep({
      delayMs: delayMs + 5,
      durationMs: 80,
      attackMs: 4,
      releaseMs: 72,
      fromFrequency: (base * 1.5) * pitch,
      toFrequency: (base * 1.2) * pitch,
      gain: 0.005 * gainScale,
      type: "triangle",
      filterFrequency: 600,
    });
  }

  function playCaptureCue(color: PieceColor, delayMs: number = 0): void {
    const base = color === "w" ? 200 : 170;

    // Snap
    playSynthSweep({
      delayMs,
      durationMs: 70,
      attackMs: 2,
      releaseMs: 64,
      fromFrequency: base * 1.6,
      toFrequency: base * 0.5,
      gain: 0.018,
      type: "triangle",
      filterFrequency: 1100,
      q: 0.8,
    });

    // Low thump
    playSynthSweep({
      delayMs: delayMs + 8,
      durationMs: 50,
      attackMs: 2,
      releaseMs: 44,
      fromFrequency: 160,
      toFrequency: 80,
      gain: 0.01,
      type: "sine",
      filterFrequency: 400,
    });
  }

  function playCastleCue(color: PieceColor, delayMs: number = 0): void {
    playMoveCue(color, delayMs, { gainScale: 0.85 });
    playMoveCue(color, delayMs + 60, { gainScale: 0.65, pitchScale: 1.12 });
  }

  function playPromotionCue(color: PieceColor, delayMs: number = 0): void {
    const base = color === "w" ? 220 : 180;

    playSynthSweep({
      delayMs,
      durationMs: 160,
      attackMs: 6,
      releaseMs: 148,
      fromFrequency: base,
      toFrequency: base * 2.2,
      gain: 0.012,
      type: "sine",
      filterFrequency: 1600,
    });

    playSynthSweep({
      delayMs: delayMs + 20,
      durationMs: 120,
      attackMs: 5,
      releaseMs: 110,
      fromFrequency: base * 1.5,
      toFrequency: base * 2.8,
      gain: 0.006,
      type: "triangle",
      filterFrequency: 2000,
    });
  }

  function playCheckCue(color: PieceColor, delayMs: number = 0): void {
    const base = color === "w" ? 480 : 400;

    playSynthSweep({
      delayMs,
      durationMs: 60,
      attackMs: 3,
      releaseMs: 52,
      fromFrequency: base,
      toFrequency: base * 0.88,
      gain: 0.01,
      type: "triangle",
      filterFrequency: 1200,
    });

    playSynthSweep({
      delayMs: delayMs + 70,
      durationMs: 65,
      attackMs: 3,
      releaseMs: 58,
      fromFrequency: base * 0.88,
      toFrequency: base * 0.76,
      gain: 0.009,
      type: "triangle",
      filterFrequency: 1000,
    });
  }

  function playMateCue(color: PieceColor, delayMs: number = 0): void {
    const base = color === "w" ? 360 : 300;

    playSynthSweep({
      delayMs,
      durationMs: 140,
      attackMs: 5,
      releaseMs: 130,
      fromFrequency: base,
      toFrequency: base * 0.6,
      gain: 0.014,
      type: "triangle",
      filterFrequency: 900,
    });

    playSynthSweep({
      delayMs: delayMs + 100,
      durationMs: 150,
      attackMs: 5,
      releaseMs: 140,
      fromFrequency: base * 0.7,
      toFrequency: base * 0.42,
      gain: 0.011,
      type: "sine",
      filterFrequency: 700,
    });

    playSynthSweep({
      delayMs: delayMs + 24,
      durationMs: 200,
      attackMs: 6,
      releaseMs: 188,
      fromFrequency: base * 0.35,
      toFrequency: base * 0.2,
      gain: 0.008,
      type: "sine",
      filterFrequency: 400,
    });
  }

  function scheduleMoveAudio(record: Move, state: PublicSnapshot, moveDuration: number): void {
    const settings = getSettings();
    if (!settings.soundEnabled) return;

    // Ensure audio context is ready
    if (!audioState.context || audioState.context.state !== "running") {
      void ensureReady().then(() => {
        if (audioState.context?.state === "running") {
          scheduleMoveAudioInner(record, state, moveDuration);
        }
      });
      return;
    }

    scheduleMoveAudioInner(record, state, moveDuration);
  }

  function scheduleMoveAudioInner(record: Move, state: PublicSnapshot, moveDuration: number): void {
    if (!audioState.context || audioState.context.state !== "running") return;

    if (record.isCastling) {
      playCastleCue(record.color, 0);
    } else {
      playMoveCue(record.color, 0);
    }

    if (record.capture) {
      playCaptureCue(
        record.color,
        Math.max(70, moveDuration * (record.isEnPassant ? 0.62 : 0.52)),
      );
    }

    if (record.promotion) {
      playPromotionCue(record.color, Math.max(36, moveDuration - 56));
    }

    if (state.result.reason === "checkmate") {
      playMateCue(record.color, moveDuration + 52);
      return;
    }

    if (state.check) {
      playCheckCue(record.color, moveDuration + 28);
    }
  }

  return {
    ensureReady,
    getStatus,
    prime,
    scheduleMoveAudio,
    suspend,
  };
}
