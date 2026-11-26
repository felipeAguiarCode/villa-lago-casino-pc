import type { Card } from '../../core/cards';
import { renderFace } from '../../table/cardFaces';

/**
 * The four reels of Poker Slots, drawn on one canvas as drums: every card is bent around the
 * cylinder (sliced and placed by the sine of its angle), the drum darkens toward its top and bottom
 * edges and carries a soft gloss. A reel kicks back, spins up to speed with its cards smeared by
 * motion blur, then brakes onto its stop, overshoots and settles with a damped spring, like the
 * mechanical reels of a casino machine.
 *
 * Positions are in cards along the strip: at `pos` = k the strip's card k sits on the payline,
 * card k + 1 above it. Spinning raises `pos`, so the cards travel downward.
 */
export interface ReelHooks {
  /** A card crossed the payline while the reel was braking (for the tick sound). */
  tick?: (reel: number) => void;
  /** A reel came to rest. */
  stopped?: (reel: number) => void;
}

type Mode = 'idle' | 'kick' | 'spin' | 'brake' | 'settle';

interface Reel {
  strip: Card[];
  pos: number;
  vel: number;
  mode: Mode;
  t: number;
  // brake / settle
  from: number;
  to: number;
  dur: number;
  stopAt: number;
  held: boolean;
  /** Anticipation glow 0..1 (the last reel when a big hand is one card away). */
  glow: number;
  glowTo: number;
  done?: () => void;
}

const VMAX = 21; // cards per second at full speed
const KICK = 0.2; // the little pull back before a reel spins (cards)
const OVER = 0.24; // overshoot when braking (cards)

export class Reels {
  private ctx: CanvasRenderingContext2D;
  private reels: Reel[];
  private sharp = new Map<Card, HTMLCanvasElement>();
  private blur = new Map<Card, HTMLCanvasElement>();
  private pending: Card[] = [];
  private W = 1;
  private H = 1;
  private dpr = 1;
  private geo = { m: 0, gap: 0, rw: 0, cw: 0, ch: 0, R: 0, phi: 0, tmax: 0, cy: 0 };
  private shade: HTMLCanvasElement | null = null;
  private clock = 0;
  private dirty = true;
  /** Winning payline: pulse on these reels. */
  private win: boolean[] | null = null;
  private winT = 0;
  private ro: ResizeObserver;

  constructor(
    private canvas: HTMLCanvasElement,
    strips: Card[][],
    stops: number[],
    private hooks: ReelHooks = {},
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.reels = strips.map((strip, i) => ({ strip, pos: stops[i], vel: 0, mode: 'idle', t: 0, from: 0, to: 0, dur: 0, stopAt: stops[i], held: false, glow: 0, glowTo: 0 }));
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  dispose() {
    this.ro.disconnect();
    this.sharp.clear();
    this.blur.clear();
  }

  /** Every card has its sprites (spinning is smooth from the first frame). */
  get ready() {
    return this.pending.length === 0;
  }

  get busy() {
    return this.reels.some((r) => r.mode !== 'idle');
  }

  /** Card on the payline of each reel. */
  line(): Card[] {
    return this.reels.map((r) => r.strip[mod52(Math.round(r.pos))]);
  }

  setHeld(i: number, held: boolean) {
    this.reels[i].held = held;
    this.dirty = true;
  }

  /** Anticipation: the reel glows while it keeps spinning. */
  setGlow(i: number, on: boolean) {
    this.reels[i].glowTo = on ? 1 : 0;
  }

  showWin(reels: boolean[] | null) {
    this.win = reels;
    this.winT = 0;
    this.dirty = true;
  }

  // ---------------------------------------------------------------- layout and sprites
  private resize() {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(r.width * dpr);
    const H = Math.round(r.height * dpr);
    if (W === this.W && H === this.H) return;
    this.W = this.canvas.width = W;
    this.H = this.canvas.height = H;
    this.dpr = dpr;
    const n = this.reels.length;
    const m = W * 0.012;
    const gap = W * 0.018;
    const rw = (W - 2 * m - (n - 1) * gap) / n;
    // the drum: the window shows ±tmax of it; the card on the line plus most of its neighbours
    const tmax = 0.98;
    const R = H / 2 / Math.sin(tmax);
    let ch = R * 0.62;
    let cw = (ch * 512) / 716;
    if (cw > rw * 0.86) {
      cw = rw * 0.86;
      ch = (cw * 716) / 512;
    }
    const pitch = ch * 1.1;
    this.geo = { m, gap, rw, cw, ch, R, phi: pitch / R, tmax, cy: H / 2 };
    // sprites at the new size
    const keep = new Set([...this.sharp.keys()]);
    this.sharp.clear();
    this.blur.clear();
    const all = new Set<Card>();
    for (const r2 of this.reels) for (let k = -2; k <= 2; k++) all.add(r2.strip[mod52(Math.round(r2.pos) + k)]);
    for (const c of keep) all.add(c);
    for (const r2 of this.reels) for (const c of r2.strip) all.add(c);
    this.pending = [...all];
    // the visible cards first, at once
    for (let k = 0; k < 20 && this.pending.length; k++) this.sprite(this.pending.shift()!);
    this.shade = this.makeShade();
    this.dirty = true;
  }

  private sprite(c: Card) {
    const { cw, ch } = this.geo;
    const w = Math.max(8, Math.round(cw));
    const h = Math.max(8, Math.round(ch));
    // step the 512 px face down by halves for a clean small sprite
    let src: HTMLCanvasElement = renderFace(c);
    while (src.width / 2 >= w * 1.6) {
      const half = document.createElement('canvas');
      half.width = Math.round(src.width / 2);
      half.height = Math.round(src.height / 2);
      const g = half.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, half.width, half.height);
      src = half;
    }
    const s = document.createElement('canvas');
    s.width = w;
    s.height = h;
    const g = s.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, w, h);
    this.sharp.set(c, s);
    // vertical motion blur: the card averaged over a short travel
    const b = document.createElement('canvas');
    b.width = w;
    b.height = h;
    const gb = b.getContext('2d')!;
    const taps = 18;
    const span = h * 0.42;
    for (let i = 0; i < taps; i++) {
      gb.globalAlpha = 1 / (i + 1);
      gb.drawImage(s, 0, (i / (taps - 1) - 0.5) * span);
    }
    this.blur.set(c, b);
  }

  /** Drum shading for one reel: dark toward the top and bottom, a soft gloss above the line. */
  private makeShade() {
    const { rw } = this.geo;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(rw));
    cv.height = this.H;
    const g = cv.getContext('2d')!;
    const v = g.createLinearGradient(0, 0, 0, this.H);
    v.addColorStop(0, 'rgba(0,0,0,0.92)');
    v.addColorStop(0.12, 'rgba(0,0,0,0.62)');
    v.addColorStop(0.28, 'rgba(0,0,0,0.2)');
    v.addColorStop(0.4, 'rgba(0,0,0,0)');
    v.addColorStop(0.6, 'rgba(0,0,0,0)');
    v.addColorStop(0.72, 'rgba(0,0,0,0.2)');
    v.addColorStop(0.88, 'rgba(0,0,0,0.62)');
    v.addColorStop(1, 'rgba(0,0,0,0.92)');
    g.fillStyle = v;
    g.fillRect(0, 0, cv.width, cv.height);
    const gl = g.createLinearGradient(0, this.H * 0.18, 0, this.H * 0.42);
    gl.addColorStop(0, 'rgba(255,255,255,0)');
    gl.addColorStop(0.6, 'rgba(255,255,255,0.13)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl;
    g.fillRect(0, this.H * 0.18, cv.width, this.H * 0.24);
    // the reel's sides curve away too
    const hz = g.createLinearGradient(0, 0, cv.width, 0);
    hz.addColorStop(0, 'rgba(0,0,0,0.35)');
    hz.addColorStop(0.12, 'rgba(0,0,0,0)');
    hz.addColorStop(0.88, 'rgba(0,0,0,0)');
    hz.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = hz;
    g.fillRect(0, 0, cv.width, cv.height);
    return cv;
  }

  // ---------------------------------------------------------------- motion
  /** Starts reel `i` (unless held) after `delay` seconds. */
  spin(i: number, delay = 0) {
    const r = this.reels[i];
    if (r.held) return;
    r.mode = 'kick';
    r.t = -delay;
    r.from = r.pos;
    r.vel = 0;
  }

  /** Brakes reel `i` onto strip index `stop`; resolves when it has settled. */
  stop(i: number, stop: number): Promise<void> {
    const r = this.reels[i];
    if (r.held || r.mode === 'idle') {
      r.pos = stop;
      this.dirty = true;
      return Promise.resolve();
    }
    return new Promise((res) => {
      r.done = res;
      const v = Math.max(r.vel, 6);
      // brake over ~0.55 s with an ease-out cubic, whose starting slope 3·dist/dur matches v
      const want = (v * 0.55) / 3;
      // while the cards are a blur, skip whole cards (the fractional position, the only thing the
      // eye can follow, is kept) so the brake ends exactly on the stop
      const jump = Math.round(stop + OVER - r.pos - want);
      r.pos += jump;
      r.from = r.pos;
      r.stopAt = stop;
      r.to = stop + OVER;
      r.dur = (3 * (r.to - r.from)) / v;
      r.mode = 'brake';
      r.t = 0;
    });
  }

  /** Advances the animation; call every frame. */
  frame(dt: number) {
    dt = Math.min(dt, 1 / 20);
    this.clock += dt;
    let moving = false;
    this.reels.forEach((r, i) => {
      if (Math.abs(r.glow - r.glowTo) > 0.001) {
        r.glow += (r.glowTo - r.glow) * Math.min(1, dt * 6);
        moving = true;
      }
      if (r.mode === 'idle') return;
      moving = true;
      r.t += dt;
      if (r.t < 0) return;
      const before = Math.floor(r.pos);
      switch (r.mode) {
        case 'kick': {
          // back a touch, then away
          const k = Math.min(1, r.t / 0.13);
          r.pos = r.from - KICK * Math.sin(k * Math.PI * 0.5);
          if (k >= 1) {
            r.mode = 'spin';
            r.t = 0;
            r.vel = 0;
          }
          break;
        }
        case 'spin':
          r.vel = Math.min(VMAX, r.vel + dt * VMAX * 3.2);
          r.pos += r.vel * dt;
          break;
        case 'brake': {
          const k = Math.min(1, r.t / r.dur);
          const e = 1 - (1 - k) ** 3;
          const prev = r.pos;
          r.pos = r.from + (r.to - r.from) * e;
          r.vel = (r.pos - prev) / dt;
          if (Math.floor(r.pos) !== before) this.hooks.tick?.(i);
          if (k >= 1) {
            r.mode = 'settle';
            r.t = 0;
            this.hooks.stopped?.(i);
          }
          break;
        }
        case 'settle': {
          // damped spring back from the overshoot
          const a = Math.exp(-9 * r.t) * Math.cos(2 * Math.PI * 2.6 * r.t);
          r.pos = r.stopAt + OVER * a;
          r.vel = 0;
          if (r.t > 0.5) {
            r.mode = 'idle';
            r.pos = mod52(r.stopAt);
            const d = r.done;
            r.done = undefined;
            d?.();
          }
          break;
        }
      }
    });
    if (this.pending.length) {
      // a few sprites per frame until every card is ready
      for (let k = 0; k < 3 && this.pending.length; k++) this.sprite(this.pending.shift()!);
    }
    if (this.win) {
      this.winT += dt;
      moving = true;
    }
    if (moving || this.dirty || this.reels.some((r) => r.held)) this.draw();
    this.dirty = false;
  }

  // ---------------------------------------------------------------- drawing
  private draw() {
    const g = this.ctx;
    const { m, gap, rw, cw, ch, R, phi, tmax, cy } = this.geo;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    this.reels.forEach((r, i) => {
      const x0 = m + i * (rw + gap);
      g.save();
      g.beginPath();
      g.rect(x0, 0, rw, this.H);
      g.clip();
      // the drum band
      const band = g.createLinearGradient(x0, 0, x0 + rw, 0);
      band.addColorStop(0, '#05380f');
      band.addColorStop(0.5, '#16a33a');
      band.addColorStop(1, '#05380f');
      g.fillStyle = band;
      g.fillRect(x0, 0, rw, this.H);
      const fast = Math.abs(r.vel) > 7;
      const base = Math.floor(r.pos);
      const cx = x0 + (rw - cw) / 2;
      const half = ch / 2 / R;
      for (let k = -2; k <= 2; k++) {
        const idx = base + k;
        const tc = (idx - r.pos) * phi;
        if (tc - half > tmax + 0.05 || tc + half < -tmax - 0.05) continue;
        const card = r.strip[mod52(idx)];
        const img = (fast ? this.blur.get(card) : this.sharp.get(card)) ?? this.sharp.get(card);
        if (!img) continue;
        const S = 10;
        for (let s = 0; s < S; s++) {
          const v0 = s / S;
          const v1 = (s + 1) / S;
          const a0 = tc + (0.5 - v0) * 2 * half;
          const a1 = tc + (0.5 - v1) * 2 * half;
          if (a1 > tmax + 0.05 || a0 < -tmax - 0.05) continue;
          const y0 = cy - R * Math.sin(clampA(a0));
          const y1 = cy - R * Math.sin(clampA(a1));
          if (y1 - y0 < 0.2) continue;
          g.drawImage(img, 0, v0 * img.height, img.width, (v1 - v0) * img.height, cx, y0, cw, y1 - y0 + 0.7);
        }
      }
      if (this.shade) g.drawImage(this.shade, x0, 0, rw, this.H);
      // held: a gold frame round the card on the line
      if (r.held) {
        const p = 0.6 + 0.4 * Math.sin(this.clock * 5);
        g.strokeStyle = `rgba(255, 214, 90, ${0.75 + 0.25 * p})`;
        g.lineWidth = 3 * this.dpr;
        g.shadowColor = '#ffcf4a';
        g.shadowBlur = 14 * this.dpr * p;
        roundRect(g, cx - 2 * this.dpr, cy - ch / 2 - 2 * this.dpr, cw + 4 * this.dpr, ch + 4 * this.dpr, 8 * this.dpr);
        g.stroke();
        g.shadowBlur = 0;
      }
      // anticipation: the reel lights up while it keeps on spinning
      if (r.glow > 0.01) {
        const p = r.glow * (0.65 + 0.35 * Math.sin(this.clock * 14));
        g.fillStyle = `rgba(255, 200, 60, ${0.22 * p})`;
        g.fillRect(x0, 0, rw, this.H);
        g.strokeStyle = `rgba(255, 220, 110, ${0.9 * p})`;
        g.lineWidth = 4 * this.dpr;
        g.strokeRect(x0 + 2 * this.dpr, 2 * this.dpr, rw - 4 * this.dpr, this.H - 4 * this.dpr);
      }
      // a win: the cards on the line glow and a shine sweeps across them
      if (this.win?.[i]) {
        const p = 0.5 + 0.5 * Math.sin(this.winT * 9);
        g.strokeStyle = `rgba(255, 236, 150, ${0.7 + 0.3 * p})`;
        g.lineWidth = 4 * this.dpr;
        g.shadowColor = '#ffd84a';
        g.shadowBlur = (10 + 16 * p) * this.dpr;
        roundRect(g, cx - 3 * this.dpr, cy - ch / 2 - 3 * this.dpr, cw + 6 * this.dpr, ch + 6 * this.dpr, 9 * this.dpr);
        g.stroke();
        g.shadowBlur = 0;
        const sweep = ((this.winT * 0.9 + i * 0.12) % 1.6) - 0.3;
        const sx = cx + sweep * cw * 1.6;
        const sh = g.createLinearGradient(sx - cw * 0.3, cy - ch / 2, sx + cw * 0.3, cy + ch / 2);
        sh.addColorStop(0, 'rgba(255,255,255,0)');
        sh.addColorStop(0.5, 'rgba(255,255,255,0.42)');
        sh.addColorStop(1, 'rgba(255,255,255,0)');
        g.save();
        roundRect(g, cx, cy - ch / 2, cw, ch, 7 * this.dpr);
        g.clip();
        g.fillStyle = sh;
        g.fillRect(cx, cy - ch / 2, cw, ch);
        g.restore();
      }
      g.restore();
    });
  }
}

const mod52 = (n: number) => ((n % 52) + 52) % 52;
const clampA = (a: number) => Math.max(-1.45, Math.min(1.45, a));

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
