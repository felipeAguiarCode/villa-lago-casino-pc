/**
 * The boot chime of the "Made with CARD ENGINE" splash: a short 16-bit console style jingle, all
 * synthesized (an original melody, nothing sampled). Pulse-wave blips as the three cards of the
 * emblem land, a quick bell run when the shine sweeps across, and a bright "item got" chord with
 * a sparkle on top. Everything runs through a feedback echo with a dark filter in the loop, the
 * warm echo of the 16-bit consoles' sound chip.
 *
 * It has its own audio context, because it plays before the game's sounds are loaded; the context
 * is closed once the chime has rung out. Browsers only start audio after a key or a click, so the
 * splash asks `ready()` first and waits for a key press when the answer is no.
 */
const NOTE = {
  G4: 392,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  C6: 1046.5,
  E6: 1318.51,
  G6: 1567.98,
  C7: 2093,
  E7: 2637.02,
  G7: 3135.96,
  C8: 4186.01,
  C3: 130.81,
  G3: 196,
};

export class BootChime {
  private ctx: AudioContext | null = null;
  /** The jingle was scheduled (dev checks). */
  played = false;

  constructor(
    private volume: number,
    private muted: boolean,
  ) {}

  /** Muted in the settings: no chime and no reason to wait for a key. */
  get silent() {
    return this.muted || this.volume <= 0;
  }

  private context() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
    } catch {
      return null;
    }
    return this.ctx;
  }

  /** Asks the browser to start audio (call it from a key or click handler to unlock it). */
  unlock() {
    void this.context()?.resume().catch(() => {});
  }

  /** True when the chime can sound now (without waiting for a key). */
  async ready(timeout = 250): Promise<boolean> {
    const ctx = this.context();
    if (!ctx) return false;
    // read through a function: the state changes while we wait
    const running = () => ctx.state === 'running';
    if (running()) return true;
    try {
      await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, timeout))]);
    } catch {
      /* not allowed yet */
    }
    return running();
  }

  /** Plays the jingle, timed to the splash animation that starts at the same moment. */
  play() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.silent) return;
    const t0 = ctx.currentTime + 0.02;
    this.played = true;

    const master = ctx.createGain();
    master.gain.value = 0.68 * this.volume;
    master.connect(ctx.destination);
    // the echo: a delay feeding back through a low-pass, mixed under the dry signal
    const dry = ctx.createGain();
    dry.connect(master);
    const send = ctx.createGain();
    send.gain.value = 0.38;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.17;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 2300;
    send.connect(delay);
    delay.connect(dark);
    dark.connect(fb);
    fb.connect(delay);
    dark.connect(master);
    const bus = ctx.createGain();
    bus.connect(dry);
    bus.connect(send);

    // a 25 % pulse wave, the classic chip lead
    const pulse = pulseWave(ctx, 0.25);

    const blip = (f: number, at: number, dur: number, vol: number) => {
      const o = ctx.createOscillator();
      o.setPeriodicWave(pulse);
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.006);
      g.gain.exponentialRampToValueAtTime(vol * 0.35, at + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
      o.connect(lp).connect(g).connect(bus);
      o.start(at);
      o.stop(at + dur + 0.05);
    };

    // a bell: the fundamental and an inharmonic partial that dies quickly
    const bell = (f: number, at: number, dur: number, vol: number) => {
      for (const [mul, v, d] of [
        [1, 1, 1],
        [2.76, 0.32, 0.35],
        [5.4, 0.12, 0.18],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mul;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(vol * v, at + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0005, at + dur * d);
        o.connect(g).connect(bus);
        o.start(at);
        o.stop(at + dur * d + 0.05);
      }
    };

    // a soft triangle pad under the final chord
    const pad = (f: number, at: number, dur: number, vol: number) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
      o.connect(g).connect(bus);
      o.start(at);
      o.stop(at + dur + 0.05);
    };

    // the three cards of the emblem land (src/ui/hud.css, #splash.engine)
    blip(NOTE.G4, t0 + 0.6, 0.16, 0.16);
    blip(NOTE.C5, t0 + 0.76, 0.16, 0.17);
    blip(NOTE.E5, t0 + 0.97, 0.22, 0.2);
    bell(NOTE.E6, t0 + 0.97, 0.5, 0.05);
    // the name comes in: a run up as the shine sweeps
    [NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6].forEach((f, i) => {
      blip(f, t0 + 1.42 + i * 0.055, 0.14, 0.13);
      bell(f, t0 + 1.42 + i * 0.055, 0.3, 0.06);
    });
    // the "item got" chord
    const hit = t0 + 1.68;
    for (const f of [NOTE.C6, NOTE.E6, NOTE.G6]) blip(f, hit, 1.1, 0.1);
    bell(NOTE.C7, hit, 1.6, 0.16);
    pad(NOTE.C3, hit, 1.3, 0.16);
    pad(NOTE.G3, hit, 1.2, 0.08);
    // the sparkle on top
    [NOTE.C8, NOTE.G7, NOTE.E7, NOTE.C8, NOTE.G7, NOTE.C8].forEach((f, i) => bell(f, hit + 0.08 + i * 0.07, 0.4, 0.035 - i * 0.003));

    // the context goes once the echo has died
    setTimeout(() => void ctx.close().catch(() => {}), 5200);
    this.ctx = null;
  }
}

/** A pulse wave of the given duty cycle (its Fourier series). */
function pulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    imag[k] = 0;
  }
  return ctx.createPeriodicWave(real, imag);
}
