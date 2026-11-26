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

  private noise(at: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, q = 1, freqTo?: number) {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
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

  /** An airy whoosh (a coin toss, a quick spin). */
  whoosh(dur = 0.5) {
    if (!this.ready()) return;
    this.noise(this.ctx!.currentTime, dur, 0.12, 'bandpass', 600, 1.4, 2600);
  }

  /** The ball rolling round a roulette wheel and slowing: `sec` seconds of rolling ticks. */
  ballRoll(sec = 5) {
    if (!this.ready()) return;
    const t = this.ctx!.currentTime;
    this.noise(t, sec, 0.05, 'bandpass', 900, 0.8, 300);
    let at = 0;
    let gap = 0.045;
    while (at < sec) {
      const k = at / sec;
      this.noise(t + at, 0.02, 0.05 + 0.05 * k, 'highpass', 2600, 0.6);
      at += gap;
      gap *= 1.035;
    }
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
