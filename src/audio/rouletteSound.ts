/**
 * The sound of a roulette ball, driven frame by frame by the ball itself (src/games/roulette):
 *
 * - On the ball track: the roar of a hard ball rolling round a wooden bowl. Bright and loud while
 *   it is fast, it darkens and drops with the speed and pulses once a lap. Near the end it starts
 *   to chatter against the wall: the roll turns rough and little clicks crowd in.
 * - Down the stator: a softer, smoother roll that stops dead while the ball is in the air.
 * - The hits: the brass deflector's metallic clack, the drop onto the rotor, the hops over the
 *   brass frets and the pocket floors (each with its quick micro-bounces), and the rattle as the
 *   ball rocks to rest in its pocket.
 * - Under it all, the low hum of the rotor turning.
 *
 * All synthesized from one noise buffer: filtered noise for the rolling, short bursts for the
 * grains and the clacks, damped sines for the ring of the brass.
 */
export interface Mixer {
  ctx: AudioContext;
  out: AudioNode;
  noise: AudioBuffer;
}

export type BallPhase = 'lift' | 'track' | 'stator' | 'rotor' | 'rock';

export interface BallSound {
  phase: BallPhase;
  /** Ball speed, table units per second (real time). */
  speed: number;
  /** Laps per second round the wheel (real time). */
  laps: number;
  /** The ball is off the surface (a hop): no rolling. */
  air: boolean;
  /** Rotor speed, rad per second (real time). */
  rotor: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class RouletteSound {
  private ctx: AudioContext;
  private out: GainNode;
  private sources: AudioScheduledSourceNode[] = [];
  private roll: GainNode;
  private rollBand: BiquadFilterNode;
  private hiss: GainNode;
  private hum: GainNode;
  private lap = 0;
  private wobble = 0;
  private grains = 0;
  private stopped = false;

  constructor(private m: Mixer) {
    const ctx = m.ctx;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(m.out);

    // the rolling: noise through a band-pass, coloured by the wooden bowl's body resonance
    this.rollBand = ctx.createBiquadFilter();
    this.rollBand.type = 'bandpass';
    this.rollBand.Q.value = 0.85;
    this.rollBand.frequency.value = 1500;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 920;
    body.Q.value = 3.5;
    body.gain.value = 7;
    this.roll = ctx.createGain();
    this.roll.gain.value = 0;
    this.loop().connect(this.rollBand).connect(body).connect(this.roll).connect(this.out);

    // the hiss of a fast ball
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4200;
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    this.loop().connect(hp).connect(this.hiss).connect(this.out);

    // the rotor's low hum
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    lp.Q.value = 0.7;
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    this.loop().connect(lp).connect(this.hum).connect(this.out);
  }

  private loop() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.m.noise;
    src.loop = true;
    src.start(this.ctx.currentTime, Math.random() * 0.9);
    this.sources.push(src);
    return src;
  }

  private set(p: AudioParam, v: number, tc = 0.018) {
    p.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  /** Follows the ball (call every frame with the real time step). */
  update(dt: number, s: BallSound) {
    if (this.stopped || dt <= 0) return;
    const now = this.ctx.currentTime;
    this.set(this.hum.gain, 0.028 * clamp01(s.rotor / 2.2));
    let roll = 0;
    let hiss = 0;
    let band = 600;
    let grainRate = 0;
    let grainVol = 0;
    if (s.phase === 'track') {
      const v = clamp01(s.speed / 16);
      // past about half speed the ball begins to chatter against the wall
      const rough = clamp01((0.58 - v) / 0.4);
      this.lap += s.laps * dt;
      this.wobble += (Math.random() - 0.5) * dt * 9;
      this.wobble *= 1 - dt * 3;
      const pulse = 1 + (0.16 + 0.22 * rough) * Math.sin(this.lap * Math.PI * 2) + rough * this.wobble * 0.9;
      roll = (0.05 + 0.17 * v) * Math.max(0.25, pulse);
      hiss = 0.055 * v * v;
      band = 560 + 1900 * v;
      grainRate = 14 + 26 * v + 70 * rough;
      grainVol = 0.009 + 0.035 * rough;
    } else if (s.phase === 'stator' && !s.air) {
      const v = clamp01(s.speed / 9);
      roll = 0.045 + 0.075 * v;
      hiss = 0.014 * v;
      band = 430 + 760 * v;
      grainRate = 9;
      grainVol = 0.008;
    } else if (s.phase === 'rock' && !s.air) {
      // rocking in the pocket: a short, low roll
      const v = clamp01(s.speed / 1.4);
      roll = 0.06 * v;
      band = 330;
    }
    this.set(this.roll.gain, roll);
    this.set(this.hiss.gain, hiss);
    this.set(this.rollBand.frequency, band, 0.05);
    // the grains of the rolling (and the chatter against the wall)
    this.grains += grainRate * dt;
    while (this.grains >= 1) {
      this.grains -= 1;
      this.burst(now + Math.random() * dt, 2400 + Math.random() * 2600, 2.2, 0.01, grainVol * (0.5 + Math.random()));
    }
  }

  // ---------------------------------------------------------------- hits
  /** A short noise burst through a band-pass. */
  private burst(at: number, freq: number, q: number, dur: number, vol: number) {
    if (vol <= 0) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.m.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0004, at + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(at, Math.random() * 0.9);
    src.stop(at + dur + 0.02);
  }

  /** The ring of brass: two damped, inharmonic sines. */
  private ring(at: number, freq: number, dur: number, vol: number) {
    const ctx = this.ctx;
    for (const [mul, v, d] of [
      [1, 1, 1],
      [2.41, 0.4, 0.45],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol * v, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0004, at + dur * d);
      o.connect(g).connect(this.out);
      o.start(at);
      o.stop(at + dur * d + 0.02);
    }
  }

  /** A low knock (the ball landing on wood). */
  private thump(at: number, freq: number, vol: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.6, at);
    o.frequency.exponentialRampToValueAtTime(freq, at + 0.03);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0004, at + 0.09);
    o.connect(g).connect(this.out);
    o.start(at);
    o.stop(at + 0.12);
  }

  /** The croupier's flick: the ball leaves the fingers and the air rushes. */
  launch() {
    if (this.stopped) return;
    const at = this.ctx.currentTime;
    this.burst(at, 2600, 1.5, 0.03, 0.08);
    const src = this.ctx.createBufferSource();
    src.buffer = this.m.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(500, at);
    f.frequency.exponentialRampToValueAtTime(2400, at + 0.32);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.07, at + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0004, at + 0.4);
    src.connect(f).connect(g).connect(this.out);
    src.start(at);
    src.stop(at + 0.45);
  }

  /** The ball clips a brass deflector, flies a little and comes down twice. */
  diamond(scale = 1) {
    if (this.stopped) return;
    const at = this.ctx.currentTime;
    this.burst(at, 3300, 2.4, 0.035, 0.34);
    this.ring(at, 2960, 0.32, 0.09);
    this.thump(at, 300, 0.08);
    const land1 = at + 0.26 / scale;
    this.burst(land1, 2100, 1.6, 0.03, 0.13);
    this.thump(land1, 220, 0.05);
    this.burst(at + 0.38 / scale, 2300, 1.6, 0.02, 0.05);
  }

  /** The ball drops off the stator onto the rotor: a fret and the wood under it. */
  rotorDrop() {
    if (this.stopped) return;
    const at = this.ctx.currentTime;
    this.burst(at, 1750, 1.3, 0.05, 0.3);
    this.thump(at, 175, 0.2);
    this.ring(at, 2620, 0.2, 0.06);
    this.burst(at + 0.024, 2000, 1.5, 0.02, 0.09);
  }

  /** Landing after hop j: over a brass fret or onto a pocket floor, with its micro-bounces. */
  hop(j: number) {
    if (this.stopped) return;
    const at = this.ctx.currentTime;
    const k = 0.72 ** j;
    const fret = j % 2 === 0;
    this.burst(at, fret ? 3000 : 1600, 1.6, 0.035, 0.24 * k);
    this.thump(at, fret ? 240 : 170, 0.12 * k);
    if (fret) this.ring(at, 2780 + j * 90, 0.16, 0.05 * k);
    this.burst(at + 0.022, 2100, 1.6, 0.018, 0.08 * k);
    this.burst(at + 0.04, 2200, 1.6, 0.012, 0.035 * k);
  }

  /** The ball rattles in its pocket, ever faster and softer, and sits. */
  settle() {
    if (this.stopped) return;
    let at = this.ctx.currentTime;
    let gap = 0.055;
    let vol = 0.08;
    for (let i = 0; i < 7; i++) {
      this.burst(at, 2000 + Math.random() * 900, 1.8, 0.016, vol);
      at += gap;
      gap *= 0.72;
      vol *= 0.7;
    }
    this.thump(at + 0.02, 150, 0.06);
  }

  /** Fades everything out and frees the voices. */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    for (const g of [this.roll, this.hiss, this.hum]) g.gain.setTargetAtTime(0, now, 0.08);
    const end = now + 0.6;
    for (const s of this.sources) s.stop(end);
    setTimeout(() => this.out.disconnect(), 900);
  }
}
