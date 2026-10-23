/**
 * Pure Web Audio API synthesized sound effects for practice sessions and timers.
 * Zero external audio assets required.
 */

let audioCtx: AudioContext | null = null;

export function isSoundMuted(): boolean {
  if (typeof window !== "undefined" && window.localStorage) {
    const val = localStorage.getItem("interviewpro_sound_muted");
    if (val !== null) return val === "true";
  }
  return false;
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem("interviewpro_sound_muted", muted ? "true" : "false");
  }
}

export function toggleSoundMuted(): boolean {
  const next = !isSoundMuted();
  setSoundMuted(next);
  return next;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a gentle ascending chime when practice session begins or countdown finishes.
 */
export function playRoundStartChime() {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [440, 554.37, 659.25]; // A4 -> C#5 -> E5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);

    gain.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.12 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + i * 0.12);
    osc.stop(ctx.currentTime + i * 0.12 + 0.4);
  });
}

/**
 * Play a warm celebration arpeggio when high rubric score or drill completion is achieved.
 */
export function playSuccessChime() {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 -> E5 -> G5 -> C6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);

    gain.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.1 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + i * 0.1);
    osc.stop(ctx.currentTime + i * 0.1 + 0.5);
  });
}
