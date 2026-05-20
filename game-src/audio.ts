// Programmatic sound effects via the Web Audio API — no audio asset
// files. Everything is synthesised at call time (oscillators + noise
// buffers), so these count as "made within the jam" with zero binary
// assets to credit.
//
// The game IIFE re-runs every frame, so module scope is wiped each
// frame. The AudioContext is therefore cached on `globalThis` to
// survive — creating a fresh context per frame would leak contexts and
// never actually play. Browser autoplay policy requires a user gesture
// before audio starts; by the time these fire the player has already
// tapped to shoot, so a resume() is enough.

/* eslint-disable @typescript-eslint/no-explicit-any */

const KEY = "__dtdAudioCtx";

function ctx(): any {
  const g = globalThis as any;
  if (g[KEY]) return g[KEY];
  const AC = g.AudioContext || g.webkitAudioContext;
  if (!AC) return null;
  try {
    g[KEY] = new AC();
  } catch {
    return null;
  }
  return g[KEY];
}

function resume(c: any): void {
  if (c && c.state === "suspended" && typeof c.resume === "function") c.resume();
}

/** A single enveloped oscillator note. */
function tone(
  c: any,
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  t0: number,
  dur: number,
  peak: number,
): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freqStart, t0);
  if (freqEnd !== freqStart) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

type OscillatorType = "sine" | "square" | "sawtooth" | "triangle";

/** Bright rising two-note chime + a soft body thunk — "you caught it!". */
export function playCatch(): void {
  const c = ctx();
  if (!c) return;
  resume(c);
  const now = c.currentTime;
  tone(c, "triangle", 660, 680, now, 0.18, 0.28);
  tone(c, "triangle", 990, 1010, now + 0.07, 0.22, 0.28);
  tone(c, "sine", 1480, 1500, now + 0.14, 0.20, 0.18);
  // low body thunk
  tone(c, "sine", 200, 90, now, 0.16, 0.3);
}

/** Filtered noise burst + low thump — a satisfying explosion. */
export function playExplosion(): void {
  const c = ctx();
  if (!c) return;
  resume(c);
  const now = c.currentTime;
  const dur = 0.55;
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const decay = Math.pow(1 - i / data.length, 2);
    data[i] = (Math.random() * 2 - 1) * decay;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1200, now);
  lp.frequency.exponentialRampToValueAtTime(120, now + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.55, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.connect(lp).connect(g).connect(c.destination);
  src.start(now);
  src.stop(now + dur);
  // low thump under the noise
  tone(c, "sine", 130, 42, now, 0.4, 0.45);
}

/** Descending whistle — an incoming cannonball careening toward you. */
export function playWhistle(): void {
  const c = ctx();
  if (!c) return;
  resume(c);
  const now = c.currentTime;
  tone(c, "sine", 1500, 520, now, 0.85, 0.12);
}

/** Short low boom an enemy cannon makes when it fires. */
export function playEnemyFire(): void {
  const c = ctx();
  if (!c) return;
  resume(c);
  const now = c.currentTime;
  tone(c, "sine", 220, 70, now, 0.18, 0.3);
}
