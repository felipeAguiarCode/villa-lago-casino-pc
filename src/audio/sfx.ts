/** Casino sound effects (Kenney "Casino Audio", CC0) plus small synthesized jingles. */

const GROUPS: Record<string, string[]> = {
  slide: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `card-slide-${n}`),
  place: [1, 2, 3, 4].map((n) => `card-place-${n}`),
  shove: [1, 2, 3, 4].map((n) => `card-shove-${n}`),
  fan: ['card-fan-1', 'card-fan-2'],
  shuffle: ['card-shuffle'],
  chip: ['chip-lay-1', 'chip-lay-2', 'chip-lay-3'],
  chips: [1, 2, 3, 4].map((n) => `chips-collide-${n}`),
  handle: [1, 2, 3, 4, 5, 6].map((n) => `chips-handle-${n}`),
  stack: [1, 2, 3, 4, 5, 6].map((n) => `chips-stack-${n}`),
  /** Dice (craps): picking the pair up, shaking it in the hand, the throw, and a single die landing. */
  diceGrab: ['dice-grab-1', 'dice-grab-2'],
  diceShake: [1, 2, 3].map((n) => `dice-shake-${n}`),
  diceThrow: [1, 2, 3].map((n) => `dice-throw-${n}`),
  dieThrow: [1, 2, 3, 4].map((n) => `die-throw-${n}`),
};

export type SfxName = keyof typeof GROUPS;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer[]>();
  private lastPick = new Map<string, number>();
  private volume = 0.8;
  private muted = false;

  constructor(private base: string) {
    const unlock = () => {
      this.ensure();
      this.ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  setVolume(v: number, muted: boolean) {
    this.volume = v;
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : v;
  }

  async load(onProgress?: (f: number) => void) {
    const ctx = this.ensure();
    if (!ctx) return;
    const names = Object.values(GROUPS).flat();
    let done = 0;
    const decoded = new Map<string, AudioBuffer>();
    await Promise.all(
      names.map(async (n) => {
        try {
          const res = await fetch(`${this.base}${n}.wav`);
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          decoded.set(n, buf);
        } catch {
          /* missing sound: stay silent */
        }
        onProgress?.(++done / names.length);
      }),
    );
    for (const [g, list] of Object.entries(GROUPS)) this.buffers.set(g, list.map((n) => decoded.get(n)).filter(Boolean) as AudioBuffer[]);
  }

  play(name: SfxName, o: { vol?: number; rate?: number; delay?: number } = {}) {
    const ctx = this.ctx;
    const list = this.buffers.get(name);
    if (!ctx || !this.master || !list || !list.length || ctx.state !== 'running') return;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.lastPick.get(name)) i = (i + 1) % list.length;
    this.lastPick.set(name, i);
    const src = ctx.createBufferSource();
    src.buffer = list[i];
    src.playbackRate.value = (o.rate ?? 1) * (0.95 + Math.random() * 0.1);
    const g = ctx.createGain();
    g.gain.value = (o.vol ?? 1) * 0.9;
    src.connect(g).connect(this.master);
    src.start(ctx.currentTime + (o.delay ?? 0));
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private ready() {
    return !!(this.ctx && this.master && this.ctx.state === 'running');
  }

  click() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(1650, t, 0.06, 'sine', 0.12);
    this.tone(2480, t, 0.04, 'triangle', 0.05);
  }

  /** Bright arpeggio and a few coins for a win; `big` adds the casino bell and a coin shower. */
  win(big = false) {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    const notes = big ? [784, 988, 1175, 1568, 1976, 2349] : [1047, 1319, 1568, 2093];
    notes.forEach((f, i) => {
      this.tone(f, t + i * 0.075, 0.45, 'triangle', 0.13);
      this.tone(f * 2, t + i * 0.075, 0.25, 'sine', 0.04);
    });
    this.coins(big ? 18 : 5, 0.3);
    if (big) {
      this.bell(0.35);
      for (let i = 0; i < 10; i++) this.tone(2600 + Math.random() * 1600, t + 0.45 + i * 0.05, 0.25, 'sine', 0.035);
    }
  }

  /** A "wah-wah" for a lost hand: two falling notes through a closing filter. */
  lose() {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    [
      [392, 330, 0],
      [330, 247, 0.26],
    ].forEach(([f0, f1, d]) => {
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t + d);
      o.frequency.exponentialRampToValueAtTime(f1, t + d + 0.42);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(1800, t + d);
      f.frequency.exponentialRampToValueAtTime(380, t + d + 0.45);
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.07, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0008, t + d + 0.5);
      o.connect(f).connect(g).connect(this.master!);
      o.start(t + d);
      o.stop(t + d + 0.55);
    });
  }

  // ---------------------------------------------------------------- casino machine sounds (PC)
  private noiseBuf: AudioBuffer | null = null;

  /**
   * The audio context, the master bus and the shared noise buffer, for sound engines that build
   * their own voices (the roulette ball). Null until the audio has started.
   */
  mixer(): { ctx: AudioContext; out: AudioNode; noise: AudioBuffer } | null {
    if (!this.ready()) return null;
    return { ctx: this.ctx!, out: this.master!, noise: this.noiseBuffer() };
  }

  /** One second of white noise, made once. */
  private noiseBuffer() {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  private noise(at: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, q = 1, freqTo?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, at);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, at + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.05);
  }

  /** The mechanical clunk of a machine button. */
  button() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.05, 0.25, 'bandpass', 2400, 1.2);
    this.tone(140, t, 0.09, 'sine', 0.16);
    this.tone(620, t + 0.004, 0.04, 'square', 0.025);
  }

  /** One metallic coin ding. */
  private coin(at: number, vol = 0.05) {
    const f = 2600 + Math.random() * 1500;
    this.tone(f, at, 0.32, 'sine', vol);
    this.tone(f * 1.51, at, 0.18, 'sine', vol * 0.5);
    this.tone(f * 2.37, at, 0.1, 'sine', vol * 0.3);
  }

  /** Coins dropping into a tray (slot payout); `n` coins after `delay` seconds. */
  coins(n = 8, delay = 0) {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime + delay;
    let at = t;
    for (let i = 0; i < n; i++) {
      at += 0.035 + Math.random() * 0.045;
      this.coin(at, 0.035 + Math.random() * 0.03);
    }
  }

  /** The casino bell. */
  bell(delay = 0) {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime + delay;
    for (let k = 0; k < 6; k++)
      [1, 2.76, 5.4, 8.9].forEach((m, i) => this.tone(880 * m, t + k * 0.11, 0.9 - i * 0.18, 'sine', 0.06 / (i + 1)));
  }

  /** Jackpot: bell, a rising run and a long coin shower. */
  jackpot() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, t + i * 0.07, 0.5, 'square', 0.045));
    this.bell(0.45);
    this.coins(40, 0.5);
  }

  /** A short tick (wheel frets, reels, pegs). */
  tick(vol = 0.12, pitch = 1) {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.025, vol, 'highpass', 3200 * pitch, 0.7);
    this.tone(1900 * pitch, t, 0.03, 'triangle', vol * 0.25);
  }

  // ---------------------------------------------------------------- achievements
  /**
   * An achievement unlocking, in the spirit of a console's achievement pop: an airy swell, a warm
   * round "bloop" gliding up, then two soft bells a fifth apart ringing into a short echo. A rare
   * one (gold, platinum) adds a third bell and a sparkle. An original sound, synthesized.
   */
  achievement(rare = false) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(this.master!);
    // a short, soft echo
    const send = ctx.createGain();
    send.gain.value = 0.28;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.13;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    send.connect(delay).connect(lp).connect(fb).connect(delay);
    lp.connect(out);
    const bus = ctx.createGain();
    bus.connect(out);
    bus.connect(send);

    // the airy swell under it
    this.noise(t, 0.42, 0.045, 'bandpass', 450, 0.8, 2800);

    // the bloop: a round sine gliding up an octave, with a softer octave above
    const bloop = (type: OscillatorType, f0: number, f1: number, vol: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + 0.085);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.55);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.6);
    };
    bloop('sine', 233, 466, 0.26);
    bloop('triangle', 466, 932, 0.07);

    // a bell: two slightly detuned sines (a gentle chorus) and a quiet upper partial
    const bell = (f: number, at: number, dur: number, vol: number) => {
      for (const [mul, v, d] of [
        [1, 1, 1],
        [1.004, 0.6, 1],
        [2.76, 0.18, 0.3],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mul;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(vol * v, at + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0006, at + dur * d);
        o.connect(g).connect(bus);
        o.start(at);
        o.stop(at + dur * d + 0.05);
      }
    };
    bell(1318.51, t + 0.07, 0.9, 0.075); // E6
    bell(1975.53, t + 0.17, 1.1, 0.06); // B6
    if (rare) {
      bell(2637.02, t + 0.29, 1.3, 0.05); // E7
      for (let i = 0; i < 6; i++) bell(3500 + Math.random() * 1800, t + 0.36 + i * 0.06, 0.35, 0.016);
    }
    setTimeout(() => out.disconnect(), 2600);
  }

  // ---------------------------------------------------------------- trump cards (Trump 21)
  /**
   * A trump card coming out of the deck with a hit: a rising shimmer as it flies out, a soft snap
   * as it turns over, then a quick run of glassy bells that lands on a chord. Uncommon cards ring
   * brighter; a rare one climbs higher and sparkles. `faceDown`: the dealer's or a regular's, a
   * quieter shimmer and the landing only. Timed to the flight in trump21/trumpUi.ts; `speed`
   * follows the animation speed setting. Original, synthesized.
   */
  trumpDraw(rarity: 'common' | 'uncommon' | 'rare' = 'common', faceDown = false, speed = 1) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const k = 1 / Math.max(0.25, speed);
    const t = ctx.currentTime + 0.01;
    // the flight: noise swept up through a band-pass, and a faint rising sine under it
    this.noise(t, 0.46 * k, faceDown ? 0.025 : 0.05, 'bandpass', 700, 2.2, 6500);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(330, t);
    o.frequency.exponentialRampToValueAtTime(990, t + 0.42 * k);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(faceDown ? 0.015 : 0.03, t + 0.2 * k);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.46 * k);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + 0.5 * k);
    if (faceDown) {
      // it lands on the pile
      this.noise(t + 0.5 * k, 0.04, 0.05, 'bandpass', 2200, 1.2);
      this.tone(1568, t + 0.5 * k, 0.25, 'sine', 0.03);
      return;
    }
    // the turn-over: a short snap and a low, soft body
    const flip = t + 0.43 * k;
    this.noise(flip, 0.035, 0.08, 'highpass', 2800, 0.8);
    this.tone(196, flip, 0.16, 'sine', 0.09);
    // the bells: a fast run up a pentatonic scale onto a held chord
    const runs = {
      common: [784, 880, 1047, 1319, 1568],
      uncommon: [880, 1047, 1175, 1397, 1760],
      rare: [1047, 1175, 1397, 1568, 2093, 2637],
    };
    const run = runs[rarity];
    const at0 = t + 0.53 * k;
    run.forEach((f, i) => {
      const at = at0 + i * 0.05 * k;
      this.tone(f, at, 0.42, 'sine', 0.065);
      this.tone(f * 2.005, at, 0.16, 'triangle', 0.018);
    });
    const end = at0 + run.length * 0.05 * k;
    const chord = rarity === 'rare' ? [1047, 1319, 1568, 2093] : [run[0], run[2], run[4]];
    chord.forEach((f) => {
      this.tone(f, end, 1.1, 'sine', 0.045);
      this.tone(f * 1.003, end, 1.1, 'sine', 0.025);
    });
    if (rarity !== 'common') for (let i = 0; i < (rarity === 'rare' ? 10 : 4); i++) this.tone(2800 + Math.random() * 2400, end + 0.04 + i * 0.06, 0.3, 'sine', 0.018);
  }

  /** A trump card lifted to be read (held): a soft paper lift. */
  trumpLift() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.09, 0.05, 'bandpass', 1800, 1.4, 3200);
    this.tone(1175, t + 0.02, 0.12, 'sine', 0.025);
  }

  /** A Barrier stopping an attack: a glassy clang with a ring that falls away. */
  barrier() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.06, 0.16, 'bandpass', 3400, 1.6);
    [[620, 0.09, 0.7], [1490, 0.05, 0.45], [2310, 0.03, 0.3]].forEach(([f, v, d]) => this.tone(f, t, d, 'sine', v));
    this.tone(180, t, 0.14, 'triangle', 0.08);
  }

  // ---------------------------------------------------------------- slot machine (Poker Slots)
  /**
   * The reel motor: a low hum and the rush of the strips going round, until the returned function
   * is called (then it winds down).
   */
  reelMotor(): () => void {
    if (!this.ready()) return () => {};
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(1, t + 0.25);
    out.connect(this.master!);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.045;
    src.connect(f).connect(ng).connect(out);
    // the strips' card edges flicking past: the rush pulses
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 19;
    lg.gain.value = 0.02;
    lfo.connect(lg).connect(ng.gain);
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 58;
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 240;
    const hg = ctx.createGain();
    hg.gain.value = 0.03;
    hum.connect(hf).connect(hg).connect(out);
    src.start(t, Math.random() * 0.5);
    lfo.start(t);
    hum.start(t);
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const e = ctx.currentTime;
      out.gain.cancelScheduledValues(e);
      out.gain.setValueAtTime(out.gain.value, e);
      out.gain.linearRampToValueAtTime(0, e + 0.3);
      hum.frequency.linearRampToValueAtTime(34, e + 0.3);
      for (const n of [src, lfo, hum]) n.stop(e + 0.35);
    };
  }

  /** A reel landing: the brake's clunk and the click of the stop pawl. */
  reelStop(reel = 0) {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(120 - reel * 6, t, 0.14, 'sine', 0.22);
    this.noise(t, 0.06, 0.2, 'bandpass', 1500 + reel * 120, 1.4);
    this.tone(760 + reel * 40, t + 0.005, 0.05, 'square', 0.03);
    this.noise(t + 0.07, 0.03, 0.08, 'highpass', 3600, 0.8);
  }

  /** The side lever: a ratchet on the way down and the spring on the way back. */
  lever() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 6; i++) this.noise(t + i * 0.025, 0.02, 0.09, 'highpass', 2800 - i * 120, 0.9);
    this.tone(180, t + 0.15, 0.12, 'sine', 0.18);
    this.noise(t + 0.15, 0.05, 0.12, 'bandpass', 900, 1.2);
    const o = this.ctx!.createOscillator();
    const g = this.ctx!.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(240, t + 0.2);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.55);
    g.gain.setValueAtTime(0, t + 0.2);
    g.gain.linearRampToValueAtTime(0.035, t + 0.24);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.6);
    o.connect(g).connect(this.master!);
    o.start(t + 0.2);
    o.stop(t + 0.65);
  }

  /** A HOLD key latching (on) or releasing (off). */
  holdKey(on: boolean) {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.04, 0.16, 'bandpass', on ? 2600 : 1700, 1.3);
    this.tone(on ? 1320 : 880, t, 0.09, 'triangle', 0.08);
    if (on) this.tone(1760, t + 0.06, 0.12, 'triangle', 0.06);
  }

  /** The HOLD keys light up: a quick two-tone chime. */
  holdsOn() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    [988, 1319, 988, 1319].forEach((f, i) => this.tone(f, t + i * 0.09, 0.16, 'square', 0.035));
  }

  /** Suspense while the last reel keeps spinning: a rising, trembling tone. */
  anticipation(sec = 1.5) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const trem = ctx.createOscillator();
    const tg = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(880, t + sec);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + sec);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.15);
    g.gain.setValueAtTime(0.05, t + sec - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0008, t + sec + 0.1);
    trem.frequency.value = 11;
    tg.gain.value = 0.025;
    trem.connect(tg).connect(g.gain);
    o.connect(f).connect(g).connect(this.master!);
    o.start(t);
    trem.start(t);
    o.stop(t + sec + 0.15);
    trem.stop(t + sec + 0.15);
  }

  /** An airy whoosh (a coin toss, a quick spin). */
  whoosh(dur = 0.5) {
    if (!this.ready()) return;
    this.noise(this.ctx!.currentTime, dur, 0.12, 'bandpass', 600, 1.4, 2600);
  }

  /** A coin spinning and wobbling down on the felt. */
  coinSpin(sec = 1.6) {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    let at = 0;
    let gap = 0.03;
    while (at < sec) {
      this.tone(3200 + Math.random() * 300, t + at, 0.05, 'sine', 0.03 * (1 - at / sec) + 0.01);
      at += gap;
      gap *= 1.07;
    }
    this.coin(t + sec, 0.07);
  }

  /** The bugle call to the post (race start). */
  fanfare() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    const seq: [number, number][] = [
      [523, 0.14],
      [659, 0.14],
      [784, 0.14],
      [1047, 0.3],
      [784, 0.14],
      [1047, 0.5],
    ];
    let at = 0;
    for (const [f, d] of seq) {
      this.tone(f, t + at, d + 0.08, 'sawtooth', 0.035);
      this.tone(f * 2, t + at, d, 'triangle', 0.02);
      at += d;
    }
  }

  /** Hooves on turf for `sec` seconds. */
  gallop(sec = 6) {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    for (let at = 0; at < sec; at += 0.16 + Math.random() * 0.03)
      [0, 0.05, 0.09].forEach((d) => {
        this.noise(t + at + d, 0.05, 0.06, 'lowpass', 420, 0.9);
        this.tone(90 + Math.random() * 30, t + at + d, 0.06, 'sine', 0.05);
      });
  }

  push() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.tone(660, t, 0.22, 'sine', 0.08);
    this.tone(660, t + 0.14, 0.22, 'sine', 0.06);
  }

  levelUp() {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, t + i * 0.09, 0.6, 'triangle', 0.12));
    this.bell(0.45);
  }
}
