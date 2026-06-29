/**
 * Opt-in sound effects — tiny synthesized blips via the Web Audio API (no audio
 * assets to ship or load). A single shared AudioContext is created lazily on the
 * first enable/play, which doubles as the required user-gesture unlock.
 *
 * The module owns the on/off state (a singleton), so any call site can just
 * `sound.move()` / `sound.capture()` without prop-drilling; everything no-ops
 * when disabled. Off by default — the player turns it on from the top bar.
 */

let ctx: AudioContext | null = null;
let enabled = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  // Browsers suspend the context until a gesture; resume best-effort.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

type BlipOpts = { type?: OscillatorType; vol?: number; delay?: number; slideTo?: number };

/** One enveloped oscillator note. Soft attack + exponential decay so it reads as
 *  a gentle blip, never a click. All volumes are deliberately low. */
function blip(freq: number, dur: number, opts: BlipOpts = {}): void {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
  const vol = opts.vol ?? 0.14;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

export const sound = {
  get enabled(): boolean {
    return enabled;
  },
  /** Set the on/off flag only — does NOT touch the AudioContext, so restoring a
   *  persisted "on" at load never trips the pre-gesture autoplay warning. */
  setEnabled(on: boolean): void {
    enabled = on;
  },
  /** Create/resume the context. Call from a real user gesture (the toggle) so the
   *  first sound is unlocked and instant. Sounds also lazily unlock on first play. */
  unlock(): void {
    getCtx();
  },
  /** A quiet wood-tap for a quiet move. */
  move(): void {
    if (!enabled) return;
    blip(523.25, 0.06, { vol: 0.09 });
  },
  /** A lower "thunk" with a downward slide — a prisoner taken. */
  capture(): void {
    if (!enabled) return;
    blip(200, 0.13, { type: 'triangle', vol: 0.16, slideTo: 130 });
  },
  /** A bright rising two-note flourish on promotion to general. */
  promote(): void {
    if (!enabled) return;
    blip(659.25, 0.1, { vol: 0.12 });
    blip(987.77, 0.18, { vol: 0.12, delay: 0.1 });
  },
  /** A small ascending C-major arpeggio on victory. */
  win(): void {
    if (!enabled) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.22, { vol: 0.13, delay: i * 0.1 }));
  },
  /** A soft descending two-note on a loss/draw — gentle, not punishing. */
  lose(): void {
    if (!enabled) return;
    blip(392, 0.22, { type: 'sine', vol: 0.1 });
    blip(294, 0.3, { type: 'sine', vol: 0.1, delay: 0.14 });
  },
};
