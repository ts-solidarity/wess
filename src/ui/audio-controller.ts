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

  function playMoveCue(color: PieceColor, delayMs: number = 0, options: MoveCueOptions = {}): void {
    const base = color === "w" ? 430 : 320;
    const pitch = options.pitchScale ?? 1;
    const gainScale = options.gainScale ?? 1;

    playSynthSweep({
      delayMs,
      durationMs: 92,
      attackMs: 5,
      releaseMs: 86,
      fromFrequency: base * pitch,
      toFrequency: base * 1.42 * pitch,
      gain: 0.016 * gainScale,
      type: "triangle",
      filterFrequency: 1800,
    });

    playSynthSweep({
      delayMs: delayMs + 8,
      durationMs: 118,
      attackMs: 8,
      releaseMs: 106,
      fromFrequency: (base * 0.64) * pitch,
      toFrequency: (base * 0.9) * pitch,
      gain: 0.007 * gainScale,
      type: "sine",
      filterFrequency: 920,
    });
  }

  function playCaptureCue(color: PieceColor, delayMs: number = 0): void {
    const base = color === "w" ? 260 : 210;

    playSynthSweep({
      delayMs,
      durationMs: 128,
      attackMs: 4,
      releaseMs: 118,
      fromFrequency: base * 1.9,
      toFrequency: base * 0.62,
      gain: 0.024,
      type: "sawtooth",
      filterFrequency: 1500,
      q: 1.2,
    });

    playSynthSweep({
      delayMs: delayMs + 10,
      durationMs: 76,
      attackMs: 3,
      releaseMs: 68,
      fromFrequency: 980,
      toFrequency: 240,
      gain: 0.011,
      type: "square",
      filterFrequency: 2300,
      q: 0.9,
    });
  }

  function playCastleCue(color: PieceColor, delayMs: number = 0): void {
    playMoveCue(color, delayMs, { gainScale: 0.9 });
    playMoveCue(color, delayMs + 78, {
      gainScale: 0.72,
      pitchScale: 1.14,
    });
  }

  function playPromotionCue(color: PieceColor, delayMs: number = 0): void {
    const base = color === "w" ? 300 : 230;

    playSynthSweep({
      delayMs,
      durationMs: 220,
      attackMs: 8,
      releaseMs: 206,
      fromFrequency: base,
      toFrequency: base * 2.85,
      gain: 0.018,
      type: "triangle",
      filterFrequency: 2400,
    });

    playSynthSweep({
      delayMs: delayMs + 34,
      durationMs: 180,
      attackMs: 6,
      releaseMs: 170,
      fromFrequency: base * 1.5,
      toFrequency: base * 3.3,
      gain: 0.009,
      type: "sine",
      filterFrequency: 2800,
    });
  }

  function playCheckCue(color: PieceColor, delayMs: number = 0): void {
    const base = color === "w" ? 700 : 560;

    playSynthSweep({
      delayMs,
      durationMs: 84,
      attackMs: 4,
      releaseMs: 72,
      fromFrequency: base,
      toFrequency: base * 0.92,
      gain: 0.012,
      type: "square",
      filterFrequency: 2100,
    });

    playSynthSweep({
      delayMs: delayMs + 88,
      durationMs: 90,
      attackMs: 4,
      releaseMs: 82,
      fromFrequency: base * 0.92,
      toFrequency: base * 0.84,
      gain: 0.011,
      type: "square",
      filterFrequency: 1900,
    });
  }

  function playMateCue(color: PieceColor, delayMs: number = 0): void {
    const base = color === "w" ? 520 : 420;

    playSynthSweep({
      delayMs,
      durationMs: 170,
      attackMs: 6,
      releaseMs: 160,
      fromFrequency: base,
      toFrequency: base * 0.62,
      gain: 0.018,
      type: "sawtooth",
      filterFrequency: 1300,
      q: 1,
    });

    playSynthSweep({
      delayMs: delayMs + 120,
      durationMs: 180,
      attackMs: 6,
      releaseMs: 170,
      fromFrequency: base * 0.76,
      toFrequency: base * 0.48,
      gain: 0.014,
      type: "triangle",
      filterFrequency: 1100,
    });

    playSynthSweep({
      delayMs: delayMs + 32,
      durationMs: 260,
      attackMs: 8,
      releaseMs: 240,
      fromFrequency: base * 0.42,
      toFrequency: base * 0.24,
      gain: 0.012,
      type: "sine",
      filterFrequency: 700,
    });
  }

  function scheduleMoveAudio(record: Move, state: PublicSnapshot, moveDuration: number): void {
    const settings = getSettings();
    if (!settings.soundEnabled || !audioState.context || audioState.context.state !== "running") {
      return;
    }

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
