/**
 * Card back patterns (PC): the classic designs of real playing-card backs, drawn on a canvas with
 * paths only. A back is the white card stock, a coloured field with a thin double frame, and a fine
 * engraved pattern filling the field: no emblem, logo, monogram, picture or text anywhere.
 *
 * Every design is point-symmetric about the card centre (the back reads the same both ways up), is
 * deterministic, and is scaled by `s = w / FACE_W`, so the same call makes the 512 × 716 texture and
 * the small menu thumbnails (where the finest engraving is left out and lines stay at least 1 px).
 */
import { FACE_H, FACE_W } from './cardFaces';

export interface BackPattern {
  id: string;
  en: string;
  pt: string;
}

/** A colourway: the field colour, a darker shade of it, and the ink of the pattern lines. */
export interface BackTint {
  id: string;
  en: string;
  pt: string;
  base: string;
  dark: string;
  ink: string;
}

export const BACK_PATTERNS: BackPattern[] = [
  { id: 'lattice', en: 'Diamond Lattice', pt: 'Treliça de Losangos' },
  { id: 'crosshatch', en: 'Fine Crosshatch', pt: 'Hachurado Fino' },
  { id: 'dots', en: 'Polka Dots', pt: 'Poá' },
  { id: 'checker', en: 'Small Checks', pt: 'Xadrez Miúdo' },
  { id: 'argyle', en: 'Argyle', pt: 'Argyle' },
  { id: 'tartan', en: 'Tartan', pt: 'Xadrez Escocês' },
  { id: 'herringbone', en: 'Herringbone', pt: 'Espinha de Peixe' },
  { id: 'houndstooth', en: 'Houndstooth', pt: 'Pied-de-poule' },
  { id: 'waves', en: 'Waves', pt: 'Ondas' },
  { id: 'scales', en: 'Fish Scales', pt: 'Escamas' },
  { id: 'chevron', en: 'Chevron', pt: 'Chevron' },
  { id: 'honeycomb', en: 'Honeycomb', pt: 'Favo de Mel' },
  { id: 'quatrefoil', en: 'Quatrefoil', pt: 'Quadrifólio' },
  { id: 'meander', en: 'Greek Key', pt: 'Grega' },
  { id: 'basketweave', en: 'Basketweave', pt: 'Cestaria' },
  { id: 'rings', en: 'Interlocking Rings', pt: 'Anéis Entrelaçados' },
  { id: 'stars', en: 'Star Grid', pt: 'Estrelinhas' },
  { id: 'guilloche', en: 'Guilloché', pt: 'Guilhochê' },
  { id: 'moire', en: 'Moiré', pt: 'Moiré' },
  { id: 'pinstripe', en: 'Diagonal Pinstripe', pt: 'Risca Diagonal' },
  { id: 'ogee', en: 'Ogee Trellis', pt: 'Treliça Ogival' },
  { id: 'arabesque', en: 'Arabesque', pt: 'Arabesco' },
  { id: 'floral', en: 'Four-Petal Tiles', pt: 'Ladrilho de Pétalas' },
  { id: 'sunburst', en: 'Sunburst', pt: 'Raios de Sol' },
  { id: 'zigzag', en: 'Zigzag', pt: 'Zigue-zague' },
];

export const BACK_TINTS: BackTint[] = [
  { id: 'crimson', en: 'Crimson', pt: 'Carmim', base: '#b5121c', dark: '#6e0a10', ink: '#fff2ea' },
  { id: 'royal', en: 'Royal Blue', pt: 'Azul Real', base: '#1d4fa8', dark: '#0e2a5e', ink: '#eef3ff' },
  { id: 'emerald', en: 'Emerald', pt: 'Esmeralda', base: '#0f6b46', dark: '#073a26', ink: '#eefbf3' },
  { id: 'onyx', en: 'Onyx & Gold', pt: 'Ônix e Ouro', base: '#1d1d22', dark: '#0a0a0c', ink: '#d8b660' },
  { id: 'burgundy', en: 'Burgundy', pt: 'Bordô', base: '#7a1430', dark: '#40081a', ink: '#f6e6c8' },
  { id: 'canary', en: 'Green & Yellow', pt: 'Verde e Amarelo', base: '#0b6a34', dark: '#063d1e', ink: '#ffd83a' },
  { id: 'navy', en: 'Navy', pt: 'Azul-Marinho', base: '#18295a', dark: '#0a1430', ink: '#eef1fa' },
  { id: 'teal', en: 'Teal', pt: 'Verde-Petróleo', base: '#0c6b70', dark: '#05383b', ink: '#e8fbf9' },
  { id: 'forest', en: 'Forest Green', pt: 'Verde-Floresta', base: '#26472b', dark: '#112314', ink: '#f0e7c9' },
  { id: 'purple', en: 'Purple', pt: 'Roxo', base: '#5a2a8a', dark: '#2c124d', ink: '#f3ecff' },
  { id: 'plum', en: 'Plum', pt: 'Ameixa', base: '#6a2350', dark: '#360f28', ink: '#fbe6f1' },
  { id: 'chocolate', en: 'Chocolate', pt: 'Chocolate', base: '#5b351d', dark: '#2d180b', ink: '#f3e2c2' },
  { id: 'charcoal', en: 'Charcoal', pt: 'Grafite', base: '#3b3e44', dark: '#1b1c20', ink: '#ececec' },
  { id: 'silver', en: 'Black & Silver', pt: 'Preto e Prata', base: '#18191c', dark: '#060607', ink: '#c8ced8' },
  { id: 'gold', en: 'Gold & Black', pt: 'Ouro e Preto', base: '#c99b30', dark: '#8a6414', ink: '#19130a' },
  { id: 'white-red', en: 'White & Red', pt: 'Branco e Vermelho', base: '#fffdf8', dark: '#ecd2cc', ink: '#bf1420' },
  { id: 'white-blue', en: 'White & Blue', pt: 'Branco e Azul', base: '#fcfdff', dark: '#d3ddef', ink: '#1d4aa0' },
  { id: 'orange', en: 'Orange', pt: 'Laranja', base: '#dc6814', dark: '#8c3a05', ink: '#fff4e4' },
  { id: 'pink', en: 'Pink', pt: 'Rosa', base: '#d9548b', dark: '#93204b', ink: '#fff0f6' },
  { id: 'sky', en: 'Sky Blue', pt: 'Azul-Celeste', base: '#4a98d2', dark: '#1f5c8c', ink: '#ffffff' },
];

export const DEFAULT_PATTERN = 'lattice';

// ---------------------------------------------------------------------------------------------
// drawing kit

type G = CanvasRenderingContext2D;

/** What a pattern painter gets: the context (already clipped to the field) and the area to cover. */
interface Paint {
  g: G;
  t: BackTint;
  /** Pixels per design unit (1 at the card face size). */
  k: number;
  /** Room for the finest engraving (false on small thumbnails). */
  fine: boolean;
  /** Ink alpha multiplier: fine lines need more ink to hold their own on a pale field. */
  ia: number;
  /** Card centre: every tiling is centred here, so the back is point-symmetric. */
  cx: number;
  cy: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Painter = (p: Paint) => void;

const TAU = Math.PI * 2;

const rgbCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1, 7), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${Math.min(1, a).toFixed(3)})`;
}

/** Sets a stroke of `px` design units and ink alpha `a`; hairlines stay 1 px wide but fainter. */
function pen(p: Paint, px: number, a: number, col = p.t.ink): void {
  const w = px * p.k;
  const al = col === p.t.ink ? a * p.ia : a;
  p.g.lineWidth = Math.max(1, w);
  p.g.strokeStyle = rgba(col, w < 1 ? al * (0.45 + 0.55 * w) : al);
}

function ink(p: Paint, a: number): void {
  p.g.fillStyle = rgba(p.t.ink, a * p.ia);
}

function shade(p: Paint, a: number): void {
  p.g.fillStyle = rgba(p.t.dark, a);
}

/**
 * Calls `fn` for every node of a lattice centred on the card centre, covering the area. Node (0,0)
 * is the centre; with `stagger`, odd rows shift by half a step (a diamond / hexagonal lattice).
 */
function grid(p: Paint, dx: number, dy: number, stagger: boolean, fn: (x: number, y: number, i: number, j: number) => void, pad = 1): void {
  const nj = Math.ceil((p.cy - p.y0) / dy) + pad;
  const ni = Math.ceil((p.cx - p.x0) / dx) + pad;
  for (let j = -nj; j <= nj; j++) {
    const off = stagger && (j & 1) !== 0 ? dx / 2 : 0;
    for (let i = -ni - 1; i <= ni; i++) fn(p.cx + i * dx + off, p.cy + j * dy, i, j);
  }
}

/** Adds a family of parallel straight lines at angle `ang`, `sp` apart, offset `(n + phase) * sp` from the centre. */
function family(p: Paint, ang: number, sp: number, phase: number, pick: (n: number) => boolean = () => true): void {
  const { g, cx, cy } = p;
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const R = Math.hypot(p.x1 - p.x0, p.y1 - p.y0) / 2 + sp;
  const N = Math.ceil(R / sp) + 1;
  for (let n = -N; n <= N; n++) {
    if (!pick(n)) continue;
    const o = (n + phase) * sp;
    const px = cx - uy * o;
    const py = cy + ux * o;
    g.moveTo(px - ux * R, py - uy * R);
    g.lineTo(px + ux * R, py + uy * R);
  }
}

/** Positions `(i + phase) * step` from the centre along x (or y), symmetric about it and covering the area. */
function samples(p: Paint, step: number, vertical = false, phase = 0): number[] {
  const c = vertical ? p.cy : p.cx;
  const n = Math.ceil((c - (vertical ? p.y0 : p.x0)) / step) + 2;
  const out: number[] = [];
  for (let i = -n - 1; i <= n; i++) out.push(c + (i + phase) * step);
  return out;
}

/** Adds the polyline y = cy + off + f(x − cx) (or, with `vertical`, x = cx + off + f(y − cy)). */
function curve(p: Paint, s: number[], off: number, f: (u: number) => number, vertical = false, reverse = false): void {
  const { g, cx, cy } = p;
  const n = s.length;
  for (let q = 0; q < n; q++) {
    const v = s[reverse ? n - 1 - q : q];
    const x = vertical ? cx + off + f(v - cy) : v;
    const y = vertical ? v : cy + off + f(v - cx);
    if (q === 0 && !reverse) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
}

/** Odd triangle wave: 0 at u = 0, peak `A` at u = half / 2. */
function tri(u: number, half: number, A: number): number {
  return ((A * 2) / Math.PI) * Math.asin(Math.sin((Math.PI * u) / half));
}

/**
 * Adds the sine y = cy + off + A·sin(2π(x − cx)/lam + ph) across the area (or, with `vertical`, the
 * same along y) as one cubic Bézier per half wave: smooth, and far cheaper to stroke than a polyline.
 * With `reverse` it runs the other way and joins the current subpath (to close a band).
 */
function sine(p: Paint, off: number, A: number, lam: number, ph: number, vertical = false, reverse = false): void {
  const { g, cx, cy } = p;
  const L = lam / 2;
  const a = (4 * L) / (3 * Math.PI);
  const hgt = (4 * A) / 3;
  const u0 = (-ph * lam) / TAU;
  const c = vertical ? cy : cx;
  const lo = (vertical ? p.y0 : p.x0) - c - L;
  const hi = (vertical ? p.y1 : p.x1) - c + L;
  const m0 = Math.floor((lo - u0) / L);
  const m1 = Math.ceil((hi - u0) / L);
  const X = (u: number, v: number) => (vertical ? cx + off + v : cx + u);
  const Y = (u: number, v: number) => (vertical ? cy + u : cy + off + v);
  if (!reverse) {
    g.moveTo(X(u0 + m0 * L, 0), Y(u0 + m0 * L, 0));
    for (let m = m0; m < m1; m++) {
      const s = m & 1 ? -hgt : hgt;
      const ua = u0 + m * L;
      g.bezierCurveTo(X(ua + a, s), Y(ua + a, s), X(ua + L - a, s), Y(ua + L - a, s), X(ua + L, 0), Y(ua + L, 0));
    }
  } else {
    g.lineTo(X(u0 + m1 * L, 0), Y(u0 + m1 * L, 0));
    for (let m = m1 - 1; m >= m0; m--) {
      const s = m & 1 ? -hgt : hgt;
      const ua = u0 + m * L;
      g.bezierCurveTo(X(ua + L - a, s), Y(ua + L - a, s), X(ua + a, s), Y(ua + a, s), X(ua, 0), Y(ua, 0));
    }
  }
}

/** Draws the top half of the area, then the same again turned 180° for the bottom half (for designs with a direction). */
function mirrored(p: Paint, draw: () => void): void {
  const { g, cx, cy } = p;
  for (let r = 0; r < 2; r++) {
    g.save();
    if (r) {
      g.translate(2 * cx, 2 * cy);
      g.rotate(Math.PI);
    }
    g.beginPath();
    g.rect(p.x0 - 4, p.y0 - 4, p.x1 - p.x0 + 8, cy - p.y0 + 4);
    g.clip();
    draw();
    g.restore();
  }
}

function dotPath(g: G, x: number, y: number, r: number): void {
  g.moveTo(x + r, y);
  g.arc(x, y, r, 0, TAU);
}

function diamondPath(g: G, x: number, y: number, rx: number, ry: number): void {
  g.moveTo(x, y - ry);
  g.lineTo(x + rx, y);
  g.lineTo(x, y + ry);
  g.lineTo(x - rx, y);
  g.closePath();
}

/** A star with `n` points; `radii` cycles over the points (alternating long and short rays). */
function starPath(g: G, x: number, y: number, n: number, radii: number[], inner: number, rot = -Math.PI / 2): void {
  for (let i = 0; i < 2 * n; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i & 1 ? inner : radii[(i >> 1) % radii.length];
    if (i === 0) g.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    else g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  g.closePath();
}

/** A pointed leaf / petal from (x, y) along angle `a`. */
function leafPath(g: G, x: number, y: number, a: number, len: number, wid: number): void {
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const tx = x + ux * len;
  const ty = y + uy * len;
  const mx = x + (ux * len) / 2;
  const my = y + (uy * len) / 2;
  g.moveTo(x, y);
  g.quadraticCurveTo(mx - uy * wid, my + ux * wid, tx, ty);
  g.quadraticCurveTo(mx + uy * wid, my - ux * wid, x, y);
  g.closePath();
}

function hexPath(g: G, x: number, y: number, r: number, ccw = false): void {
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + ((ccw ? -i : i) * Math.PI) / 3;
    if (i === 0) g.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    else g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  g.closePath();
}

/** Four overlapping circular lobes (radius `r`, `a` from the centre) traced as one outline. */
function quatrefoilPath(g: G, x: number, y: number, a: number, r: number): void {
  const t = (Math.SQRT2 * a + Math.sqrt(Math.max(0, 4 * r * r - 2 * a * a))) / 2;
  const P = t / Math.SQRT2;
  const phi = Math.atan2(P, P - a);
  g.moveTo(x + a + r * Math.cos(-phi), y + r * Math.sin(-phi));
  for (let q = 0; q < 4; q++) {
    const ang = (q * Math.PI) / 2;
    g.arc(x + a * Math.cos(ang), y + a * Math.sin(ang), r, ang - phi, ang + phi);
  }
  g.closePath();
}

// ---------------------------------------------------------------------------------------------
// the patterns

/** Diamond lattice: double-ruled diagonals, harlequin shading, beads at the crossings. */
function lattice(p: Paint): void {
  const { g, k, fine } = p;
  const dx = 28 * k;
  const dy = 32 * k;
  g.beginPath();
  grid(p, dx, dy / 2, true, (x, y, _i, j) => {
    if (j & 1) diamondPath(g, x, y, dx / 2, dy / 2);
  });
  shade(p, 0.42);
  g.fill();
  if (fine) {
    g.beginPath();
    grid(p, dx, dy / 2, true, (x, y) => diamondPath(g, x, y, dx * 0.24, dy * 0.24));
    pen(p, 0.75, 0.42);
    g.stroke();
  }
  const a = Math.atan2(dy, dx);
  const sp = (dx * dy) / Math.hypot(dx, dy);
  g.beginPath();
  if (fine) {
    const d = (1.6 * k) / sp;
    for (const sg of [-1, 1]) {
      family(p, a, sp, 0.5 + sg * d);
      family(p, -a, sp, 0.5 + sg * d);
    }
    pen(p, 0.9, 0.9);
  } else {
    family(p, a, sp, 0.5);
    family(p, -a, sp, 0.5);
    pen(p, 1.6, 0.85);
  }
  g.stroke();
  // beads where the rules cross, a point in each light diamond
  g.beginPath();
  grid(p, dx, dy / 2, true, (x, y, _i, j) => {
    diamondPath(g, x + dx / 2, y, 3.4 * k, 3.4 * k);
    if (!(j & 1)) dotPath(g, x, y, 1.6 * k);
  });
  ink(p, 0.95);
  g.fill();
}

/** Fine crosshatch: dense engraved diagonals, every fourth rule heavier, pearls where heavy rules cross. */
function crosshatch(p: Paint): void {
  const { g, k, fine } = p;
  const sp = (fine ? 6.5 : 9) * k;
  const q = Math.PI / 4;
  g.beginPath();
  family(p, q, sp, 0, (n) => n % 4 !== 0);
  family(p, -q, sp, 0, (n) => n % 4 !== 0);
  pen(p, 0.7, 0.42);
  g.stroke();
  g.beginPath();
  family(p, q, sp, 0, (n) => n % 4 === 0);
  family(p, -q, sp, 0, (n) => n % 4 === 0);
  pen(p, 1.3, 0.82);
  g.stroke();
  const L = 2 * Math.SQRT2 * sp;
  g.beginPath();
  grid(p, 2 * L, L, true, (x, y) => dotPath(g, x, y, 2.4 * k));
  ink(p, 0.95);
  g.fill();
  if (fine) {
    g.beginPath();
    grid(p, 2 * L, L, true, (x, y) => dotPath(g, x + L, y, 1.3 * k));
    ink(p, 0.75);
    g.fill();
  }
}

/** Polka dots on a hexagonal lattice, each ringed by a hairline, seed dots between them. */
function dots(p: Paint): void {
  const { g, k, fine } = p;
  const dx = 24 * k;
  const dy = dx * 0.866;
  if (fine) {
    g.beginPath();
    grid(p, dx, dy, true, (x, y) => dotPath(g, x, y, 6.6 * k));
    pen(p, 0.7, 0.4);
    g.stroke();
    g.beginPath();
    grid(p, dx, dy, true, (x, y) => {
      dotPath(g, x + dx / 2, y + dy / 3, 1.1 * k);
      dotPath(g, x + dx, y + (2 * dy) / 3, 1.1 * k);
    });
    ink(p, 0.6);
    g.fill();
  }
  g.beginPath();
  grid(p, dx, dy, true, (x, y) => dotPath(g, x, y, 4.4 * k));
  ink(p, 0.93);
  g.fill();
}

/** Small checks: inked squares, each light one with a point, each inked one with a hairline square. */
function checker(p: Paint): void {
  const { g, k, fine } = p;
  const q = 14 * k;
  g.beginPath();
  grid(p, q, q, false, (x, y, i, j) => {
    if ((i + j) & 1) g.rect(x - q / 2, y - q / 2, q, q);
  });
  ink(p, 0.74);
  g.fill();
  g.beginPath();
  grid(p, q, q, false, (x, y, i, j) => {
    if (!((i + j) & 1)) diamondPath(g, x, y, q * 0.2, q * 0.2);
  });
  ink(p, 0.6);
  g.fill();
  if (fine) {
    g.beginPath();
    grid(p, q, q, false, (x, y, i, j) => {
      if ((i + j) & 1) g.rect(x - q * 0.29, y - q * 0.29, q * 0.58, q * 0.58);
    });
    pen(p, 0.8, 0.85, p.t.base);
    g.stroke();
  }
}

/** Argyle: three-tone harlequin diamonds under a stitched overcheck. */
function argyle(p: Paint): void {
  const { g, k, cx, cy, fine } = p;
  const dx = 52 * k;
  const dy = 78 * k;
  g.beginPath();
  grid(p, dx, dy / 2, true, (x, y, _i, j) => {
    if (j & 1) diamondPath(g, x, y, dx / 2, dy / 2);
  });
  shade(p, 0.72);
  g.fill();
  g.beginPath();
  grid(p, dx, dy / 2, true, (x, y, _i, j) => {
    if ((j & 3) === 2) diamondPath(g, x, y, dx / 2, dy / 2);
  });
  ink(p, 0.17);
  g.fill();
  const a = Math.atan2(dy, dx);
  const sp = (dx * dy) / Math.hypot(dx, dy);
  g.beginPath();
  family(p, a, sp, 0.5);
  family(p, -a, sp, 0.5);
  pen(p, 0.8, 0.35);
  g.stroke();
  // overcheck: dashes centred on the diamond centres, through which the rules pass
  const D = Math.hypot(dx, dy) / 2;
  const per = D / 4;
  const half = per * 0.28;
  const span = Math.hypot(p.x1 - p.x0, p.y1 - p.y0);
  const ni = Math.ceil((p.x1 - p.x0) / 2 / dx + (p.y1 - p.y0) / 2 / dy) + 2;
  g.beginPath();
  for (const sg of [1, -1]) {
    const ux = Math.cos(a);
    const uy = sg * Math.sin(a);
    for (let n = -ni; n <= ni; n++) {
      const sx = cx + n * dx;
      const M = Math.ceil((span + Math.abs(n * dx)) / per);
      for (let m = -M; m <= M; m++) {
        const t = m * per;
        g.moveTo(sx + ux * (t - half), cy + uy * (t - half));
        g.lineTo(sx + ux * (t + half), cy + uy * (t + half));
      }
    }
  }
  pen(p, fine ? 1.3 : 1.6, 0.85);
  g.stroke();
}

/** Tartan: a symmetric sett of shaded bands and fine ink stripes woven both ways, on a twill. */
function tartan(p: Paint): void {
  const { g, k, cx, cy, fine } = p;
  // half-sett from the pivot: [from, to, ink?, alpha] in design units; the sett mirrors at 0 and 48
  const half: [number, number, boolean, number][] = [
    [0, 10, false, 0.42],
    [13, 14.4, true, 0.62],
    [17.5, 23, false, 0.38],
    [27, 31, true, 0.12],
    [38, 39.6, true, 0.5],
    [43, 48, false, 0.3],
  ];
  const L = 96 * k;
  const W = p.x1 - p.x0;
  const H = p.y1 - p.y0;
  const reps = Math.ceil(Math.max(W, H) / 2 / L) + 1;
  for (const vertical of [false, true]) {
    for (const [a, b, isInk, al] of half) {
      g.beginPath();
      for (let r = -reps; r <= reps; r++) {
        for (const [lo, hi] of [
          [r * L + a * k, r * L + b * k],
          [r * L - b * k, r * L - a * k],
        ]) {
          if (vertical) g.rect(cx + lo, p.y0, hi - lo, H);
          else g.rect(p.x0, cy + lo, W, hi - lo);
        }
      }
      if (isInk) ink(p, al);
      else shade(p, al);
      g.fill();
    }
  }
  if (fine) {
    g.beginPath();
    family(p, Math.PI / 4, 3 * k, 0);
    pen(p, 0.7, 0.16, p.t.dark);
    g.stroke();
  }
}

/** Herringbone: columns of slanting twill, alternate columns turned and set off by half a step (the broken twill of tweed). */
function herringbone(p: Paint): void {
  const { g, k, cx, cy, fine } = p;
  const cw = 15 * k;
  const sp = (fine ? 5 : 7) * k;
  const ni = Math.ceil((p.x1 - p.x0) / 2 / cw) + 1;
  const nn = Math.ceil(((p.y1 - p.y0) / 2 + cw) / sp) + 1;
  g.beginPath();
  for (let i = -ni; i <= ni; i++) if (i & 1) g.rect(cx + i * cw - cw / 2, p.y0, cw, p.y1 - p.y0);
  shade(p, 0.38);
  g.fill();
  g.beginPath();
  const gap = 1.1 * k;
  for (let i = -ni; i <= ni; i++) {
    const xc = cx + i * cw;
    const odd = (i & 1) !== 0;
    const sl = odd ? -0.75 : 0.75;
    const o = odd ? sp / 2 : 0;
    for (let n = -nn; n <= nn; n++) {
      const y = cy + n * sp + o;
      g.moveTo(xc - cw / 2 + gap, y - sl * (cw / 2 - gap));
      g.lineTo(xc + cw / 2 - gap, y + sl * (cw / 2 - gap));
    }
  }
  pen(p, fine ? 1 : 1.2, 0.82);
  g.stroke();
  if (fine) {
    g.beginPath();
    for (let i = -ni; i <= ni; i++) {
      const x = cx + (i + 0.5) * cw;
      g.moveTo(x, p.y0);
      g.lineTo(x, p.y1);
    }
    pen(p, 0.6, 0.35);
    g.stroke();
  }
}

function houndCell(a: number, b: number): boolean {
  const m4 = (((a + b) % 4) + 4) % 4;
  return m4 < 2 ? ((a % 8) + 8) % 8 < 4 : ((b % 8) + 8) % 8 < 4;
}

/** Houndstooth: the 2/2 twill of four dark and four light threads, booked at the centre line. */
function houndstooth(p: Paint): void {
  const { g, k, cx, cy } = p;
  const c = 4.5 * k;
  const a0 = Math.floor((p.x0 - cx) / c) - 1;
  const a1 = Math.ceil((p.x1 - cx) / c) + 1;
  const b0 = Math.floor((p.y0 - cy) / c) - 1;
  mirrored(p, () => {
    g.beginPath();
    for (let b = b0; b < 0; b++) {
      let start = 0;
      let open = false;
      for (let a = a0; a <= a1 + 1; a++) {
        const on = a <= a1 && houndCell(a + 2, b + 4);
        if (on && !open) {
          start = a;
          open = true;
        } else if (!on && open) {
          g.rect(cx + start * c, cy + b * c, (a - start) * c, c);
          open = false;
        }
      }
    }
    ink(p, 0.72);
    g.fill();
  });
}

/** Waves: engraved sine rules, alternate bands shaded, a hairline running in each band. */
function waves(p: Paint): void {
  const { g, k, fine } = p;
  const sp = 10 * k;
  const A = 3.4 * k;
  const lam = 44 * k;
  const N = Math.ceil((p.y1 - p.y0) / 2 / sp) + 2;
  g.beginPath();
  for (let n = -N; n <= N; n++) {
    if (!(n & 1)) continue;
    sine(p, (n - 0.5) * sp, A, lam, 0);
    sine(p, (n + 0.5) * sp, A, lam, 0, false, true);
    g.closePath();
  }
  shade(p, 0.4);
  g.fill();
  g.beginPath();
  for (let n = -N; n <= N; n++) sine(p, (n + 0.5) * sp, A, lam, 0);
  pen(p, 1.2, 0.86);
  g.stroke();
  if (fine) {
    g.beginPath();
    for (let n = -N; n <= N; n++) sine(p, n * sp, A, lam, 0);
    pen(p, 0.6, 0.4);
    g.stroke();
  }
}

/** Fish scales: imbricated arches with a shaded rim and an engraved inner arc, booked at the centre line. */
function scales(p: Paint): void {
  const { g, k, cx, cy, fine } = p;
  const r = 12 * k;
  const dx = 2 * r;
  const ni = Math.ceil((p.x1 - p.x0) / 2 / dx) + 1;
  const nj = Math.ceil((cy - p.y0) / r) + 1;
  // each scale shows the top half of its circle; the rim is the sliver between that arc and a
  // smaller circle sitting lower inside it
  const ix = r * Math.sqrt(0.84 * 0.84 - 0.16 * 0.16);
  const aR = Math.atan2(-0.16 * r, ix);
  const aL = Math.atan2(-0.16 * r, -ix);
  const each = (fn: (x: number, y: number) => void) => {
    for (let j = -nj; j <= 0; j++) {
      const off = j & 1 ? r : 0;
      for (let i = -ni - 1; i <= ni; i++) fn(cx + i * dx + off, cy + j * r);
    }
  };
  mirrored(p, () => {
    g.beginPath();
    each((x, y) => {
      g.moveTo(x - r, y);
      g.arc(x, y, r, Math.PI, TAU);
      g.lineTo(x + ix, y);
      g.arc(x, y + 0.16 * r, 0.84 * r, aR, aL, true);
      g.closePath();
    });
    shade(p, 0.55);
    g.fill();
    if (fine) {
      g.beginPath();
      each((x, y) => {
        g.moveTo(x - 0.56 * r, y);
        g.arc(x, y, 0.56 * r, Math.PI, TAU);
      });
      pen(p, 0.7, 0.42);
      g.stroke();
    }
    g.beginPath();
    each((x, y) => {
      g.moveTo(x - r, y);
      g.arc(x, y, r, Math.PI, TAU);
    });
    pen(p, 1, 0.95);
    g.stroke();
  });
}

/** Chevron: zigzag bands in two tones between double rules, a hairline down each band. */
function chevron(p: Paint): void {
  const { g, k, fine } = p;
  const bh = 16 * k;
  const hp = 20 * k;
  const f = (u: number) => tri(u, hp, 8 * k);
  const xs = samples(p, hp, false, 0.5);
  const N = Math.ceil((p.y1 - p.y0) / 2 / bh) + 2;
  g.beginPath();
  for (let n = -N; n <= N; n++) {
    if (n & 1) continue;
    curve(p, xs, (n + 0.5) * bh, f);
    curve(p, xs, (n + 1.5) * bh, f, false, true);
    g.closePath();
  }
  shade(p, 0.5);
  g.fill();
  g.beginPath();
  for (let n = -N; n <= N; n++) {
    if (fine) {
      curve(p, xs, (n + 0.5) * bh - 1.7 * k, f);
      curve(p, xs, (n + 0.5) * bh + 1.7 * k, f);
    } else curve(p, xs, (n + 0.5) * bh, f);
  }
  g.lineJoin = 'miter';
  pen(p, fine ? 1 : 1.5, 0.9);
  g.stroke();
  if (fine) {
    g.beginPath();
    for (let n = -N; n <= N; n++) curve(p, xs, n * bh, f);
    pen(p, 0.6, 0.4);
    g.stroke();
  }
}

/** Honeycomb: embossed hexagons, an engraved hexagon inside each, every third cell shaded. */
function honeycomb(p: Paint): void {
  const { g, k, fine } = p;
  const R = 14 * k;
  const dx = Math.sqrt(3) * R;
  const dy = 1.5 * R;
  g.beginPath();
  grid(p, dx, dy, true, (x, y, i, j) => {
    const q = i - (j - (j & 1)) / 2;
    if ((((q - j) % 3) + 3) % 3 === 0) hexPath(g, x, y, R);
  });
  shade(p, 0.42);
  g.fill();
  // a shadow line just inside every wall, then the walls
  g.beginPath();
  grid(p, dx, dy, true, (x, y) => hexPath(g, x, y, R - 2 * k));
  pen(p, 1, 0.7, p.t.dark);
  g.stroke();
  g.beginPath();
  grid(p, dx, dy, true, (x, y) => hexPath(g, x, y, R));
  pen(p, 1.2, 0.88);
  g.stroke();
  if (fine) {
    g.beginPath();
    grid(p, dx, dy, true, (x, y) => hexPath(g, x, y, R * 0.58));
    pen(p, 0.75, 0.42);
    g.stroke();
  }
  g.beginPath();
  grid(p, dx, dy, true, (x, y) => dotPath(g, x, y, 1.6 * k));
  ink(p, 0.8);
  g.fill();
}

/** Quatrefoils on a square lattice with four-point stars between them. */
function quatrefoil(p: Paint): void {
  const { g, k, fine } = p;
  const D = 34 * k;
  const a = 6.4 * k;
  const r = 8.2 * k;
  g.beginPath();
  grid(p, D, D, false, (x, y) => quatrefoilPath(g, x, y, a, r));
  shade(p, 0.5);
  g.fill();
  pen(p, 1, 0.95);
  g.stroke();
  if (fine) {
    g.beginPath();
    grid(p, D, D, false, (x, y) => quatrefoilPath(g, x, y, a * 0.6, r * 0.6));
    pen(p, 0.7, 0.45);
    g.stroke();
    g.beginPath();
    grid(p, D, D, false, (x, y) => {
      g.moveTo(x + D / 2 - 6 * k, y + D / 2);
      g.lineTo(x + D / 2 + 6 * k, y + D / 2);
      g.moveTo(x + D / 2, y + D / 2 - 6 * k);
      g.lineTo(x + D / 2, y + D / 2 + 6 * k);
    });
    pen(p, 0.6, 0.35);
    g.stroke();
  }
  g.beginPath();
  grid(p, D, D, false, (x, y) => {
    starPath(g, x + D / 2, y + D / 2, 4, [4.6 * k], 1.3 * k, 0);
    dotPath(g, x, y, 1.7 * k);
  });
  ink(p, 0.92);
  g.fill();
}

/** One unit of the Greek key (y up): a square spiral of one and a half turns off a running rail. */
const KEY: [number, number][] = [
  [0, 0],
  [0, 4],
  [4, 4],
  [4, 1],
  [2, 1],
  [2, 2],
  [3, 2],
  [3, 3],
  [1, 3],
  [1, 0],
];

/** Greek key field: rows of running meander, each pair of rows turned 180° about its middle. */
function meander(p: Paint): void {
  const { g, k, cx, cy } = p;
  const u = 4.4 * k;
  const pairH = 11 * u;
  const nu = Math.ceil((p.x1 - p.x0) / 2 / (5 * u)) + 2;
  const nj = Math.ceil((p.y1 - p.y0) / 2 / pairH) + 1;
  g.beginPath();
  for (let j = -nj; j <= nj; j++) {
    const py = cy + j * pairH;
    for (const rot of [1, -1]) {
      let first = true;
      for (let n = -nu; n <= nu; n++) {
        for (const [a, b] of KEY) {
          const x = cx + rot * (n * 5 + a - 2.5) * u;
          const y = py + rot * (4.75 - b) * u;
          if (first) g.moveTo(x, y);
          else g.lineTo(x, y);
          first = false;
        }
      }
    }
  }
  pen(p, 1.5, 0.92);
  g.stroke();
  if (p.fine) {
    g.beginPath();
    for (let j = -nj; j <= nj; j++) {
      const y = cy + j * pairH + 5.5 * u;
      g.moveTo(p.x0, y);
      g.lineTo(p.x1, y);
    }
    pen(p, 0.6, 0.4);
    g.stroke();
  }
}

/** Basketweave: blocks of three strips, alternately across and down, shaded where they dip under. */
function basketweave(p: Paint): void {
  const { g, k, cx, cy, fine } = p;
  const B = 27 * k;
  const w = B / 3;
  const blocks = (fn: (x: number, y: number, horiz: boolean) => void) =>
    grid(p, B, B, false, (x, y, i, j) => fn(x, y, !((i + j) & 1)));
  // the ends of the strips dip under the neighbouring block
  for (const [len, al] of [
    [0.3, 0.3],
    [0.14, 0.32],
  ]) {
    g.beginPath();
    blocks((x, y, horiz) => {
      const e = B * len;
      if (horiz) {
        g.rect(x - B / 2, y - B / 2, e, B);
        g.rect(x + B / 2 - e, y - B / 2, e, B);
      } else {
        g.rect(x - B / 2, y - B / 2, B, e);
        g.rect(x - B / 2, y + B / 2 - e, B, e);
      }
    });
    shade(p, al);
    g.fill();
  }
  // the strips: a hairline down each, and the two edges between them
  for (const [offs, px, al] of [
    [fine ? [-1, 0, 1] : [], 0.7, 0.3],
    [[-0.5, 0.5], 0.9, 0.75],
  ] as [number[], number, number][]) {
    if (!offs.length) continue;
    g.beginPath();
    blocks((x, y, horiz) => {
      const e = offs.length === 3 ? B * 0.2 : 0;
      for (const o of offs) {
        if (horiz) {
          g.moveTo(x - B / 2 + e, y + o * w);
          g.lineTo(x + B / 2 - e, y + o * w);
        } else {
          g.moveTo(x + o * w, y - B / 2 + e);
          g.lineTo(x + o * w, y + B / 2 - e);
        }
      }
    });
    pen(p, px, al);
    g.stroke();
  }
  // the block edges, as long rules
  g.beginPath();
  const nx = Math.ceil((p.x1 - p.x0) / 2 / B) + 1;
  const ny = Math.ceil((p.y1 - p.y0) / 2 / B) + 1;
  for (let i = -nx; i < nx; i++) {
    g.moveTo(cx + (i + 0.5) * B, p.y0);
    g.lineTo(cx + (i + 0.5) * B, p.y1);
  }
  for (let j = -ny; j < ny; j++) {
    g.moveTo(p.x0, cy + (j + 0.5) * B);
    g.lineTo(p.x1, cy + (j + 0.5) * B);
  }
  pen(p, 1.4, 0.85);
  g.stroke();
}

/** Interlocking rings: hollow double-ruled rings on a hexagonal lattice, each overlapping six. */
function rings(p: Paint): void {
  const { g, k, fine } = p;
  const D = 24 * k;
  const R = 0.64 * D;
  const dy = D * 0.866;
  // each ring a pair of fine rules: a hollow band
  g.beginPath();
  grid(p, D, dy, true, (x, y) => {
    if (fine) {
      dotPath(g, x, y, R - 1.3 * k);
      dotPath(g, x, y, R + 1.3 * k);
    } else dotPath(g, x, y, R);
  });
  pen(p, fine ? 1 : 1.6, 0.9);
  g.stroke();
  g.beginPath();
  grid(p, D, dy, true, (x, y) => starPath(g, x, y, 4, [3 * k], 0.9 * k, 0));
  ink(p, 0.85);
  g.fill();
}

/** Star grid: eight-point stars and four-point sparkles in a diagonal lattice, seed points between. */
function stars(p: Paint): void {
  const { g, k, fine } = p;
  const dx = 26 * k;
  const dy = 13 * k;
  if (fine) {
    g.beginPath();
    grid(p, dx, dy, true, (x, y, _i, j) => {
      if (!(j & 1)) dotPath(g, x, y, 8.6 * k);
    });
    pen(p, 0.6, 0.32);
    g.stroke();
    g.beginPath();
    grid(p, dx, dy, true, (x, y) => diamondPath(g, x + dx / 2, y, 1.3 * k, 1.3 * k));
    ink(p, 0.6);
    g.fill();
  }
  g.beginPath();
  grid(p, dx, dy, true, (x, y, _i, j) => {
    if (j & 1) starPath(g, x, y, 4, [3.6 * k], 1 * k, 0);
    else starPath(g, x, y, 8, [6.2 * k, 3.6 * k], 1.7 * k);
  });
  ink(p, 0.93);
  g.fill();
}

/**
 * Guilloché: the woven line work of banknote grounds. Two families of sine rules, each rule a little
 * further along in phase than the one above it (one family forward, one back), cross into bundles
 * and lenses that lattice the whole field evenly, with no centre to it.
 */
function guilloche(p: Paint): void {
  const { g, k, fine } = p;
  const sp = (fine ? 7 : 10) * k;
  const A = 9 * k;
  const lam = 80 * k;
  const step = TAU / 10;
  const N = Math.ceil(((p.y1 - p.y0) / 2 + A) / sp) + 1;
  for (const fam of [1, -1]) {
    g.beginPath();
    for (let n = -N; n <= N; n++) sine(p, n * sp, A, lam, fam * n * step);
    pen(p, 0.8, fine ? 0.6 : 0.7);
    g.stroke();
  }
}

/**
 * Moiré (watered silk): two gratings of fine wavy rules of slightly different wavelength laid one on
 * the other; where they fall in step the rules merge, where they fall out of step they mesh, and soft
 * broad bands of light and dark ripple across the card.
 */
function moire(p: Paint): void {
  const { g, k, fine } = p;
  const sp = (fine ? 5.5 : 8) * k;
  const A = 3 * k;
  const N = Math.ceil(((p.y1 - p.y0) / 2 + A) / sp) + 1;
  for (const lam of [36 * k, 41 * k]) {
    g.beginPath();
    for (let n = -N; n <= N; n++) sine(p, n * sp, A, lam, 0);
    pen(p, 0.8, 0.62);
    g.stroke();
  }
}

/** Diagonal pinstripe: shaded and plain bands between ink pinstripes, a hairline in each plain band. */
function pinstripe(p: Paint): void {
  const { g, k, fine } = p;
  const sp = 11 * k;
  const a = -Math.PI / 4;
  const band = sp / Math.SQRT2;
  g.beginPath();
  family(p, a, band, 0, (n) => (n & 1) !== 0);
  g.lineWidth = band;
  g.strokeStyle = rgba(p.t.dark, 0.45);
  g.stroke();
  g.beginPath();
  if (fine) {
    family(p, a, band, 0.5 - 0.17, (n) => (n & 1) === 0);
    family(p, a, band, 0.5 + 0.17, (n) => (n & 1) === 1);
    pen(p, 0.9, 0.9);
  } else {
    family(p, a, band, 0.5);
    pen(p, 1.2, 0.85);
  }
  g.stroke();
  if (fine) {
    g.beginPath();
    family(p, a, band, 0, (n) => (n & 1) === 0);
    pen(p, 0.6, 0.4);
    g.stroke();
  }
}

/** Ogee trellis: onion-shaped cells with reflex-curved tips, alternate cells shaded. */
function ogee(p: Paint): void {
  const { g, k, fine } = p;
  const P = 32 * k;
  const A = P / 2;
  const lam = 96 * k;
  const H = lam / 4;
  // each quarter of the onion: from the spire straight down, then a reflex curve out to the widest point
  const lens = (x: number, y: number, sc: number) => {
    const w = A * sc;
    const h = H * (0.35 + 0.65 * sc);
    g.moveTo(x, y - h);
    g.bezierCurveTo(x, y - h * 0.45, x + w, y - h * 0.62, x + w, y);
    g.bezierCurveTo(x + w, y + h * 0.62, x, y + h * 0.45, x, y + h);
    g.bezierCurveTo(x, y + h * 0.45, x - w, y + h * 0.62, x - w, y);
    g.bezierCurveTo(x - w, y - h * 0.62, x, y - h * 0.45, x, y - h);
    g.closePath();
  };
  const each = (fn: (x: number, y: number, i: number, j: number) => void) => grid(p, P, lam / 2, false, fn);
  g.beginPath();
  each((x, y, i, j) => {
    if ((i + j) & 1) lens(x, y, 1);
  });
  shade(p, 0.5);
  g.fill();
  g.beginPath();
  each((x, y) => lens(x, y, 1));
  pen(p, 1.4, 0.9);
  g.stroke();
  if (fine) {
    g.beginPath();
    each((x, y) => lens(x, y, 0.58));
    pen(p, 0.7, 0.45);
    g.stroke();
  }
  g.beginPath();
  each((x, y) => {
    dotPath(g, x, y, 1.8 * k);
    diamondPath(g, x + P / 2, y + lam / 4, 2.6 * k, 4.2 * k);
  });
  ink(p, 0.92);
  g.fill();
}

/** The vine of the arabesque, in design units: columns `VINE_P` apart, stem amplitude `VINE_A`, wavelength `VINE_L`. */
const VINE_P = 36;
const VINE_A = 9;
const VINE_L = 64;

/** A tendril leaving the stem at phase `vb`, turned `off` from it, curling ever tighter (relative to a stem inflection). */
function tendril(vb: number, off: number, len: number, k0: number, k1: number, pw: number, n: number): [number, number][] {
  let x = VINE_A * Math.sin(vb);
  let y = (vb / TAU) * VINE_L;
  const slope = (VINE_A * Math.cos(vb) * TAU) / VINE_L;
  let th = Math.atan2(1, slope) + off;
  const pts: [number, number][] = [[x, y]];
  const ds = len / n;
  for (let i = 1; i <= n; i++) {
    th += ds * (k0 + k1 * Math.pow(i / n, pw));
    x += Math.cos(th) * ds;
    y += Math.sin(th) * ds;
    pts.push([x, y]);
  }
  return pts;
}

/** Per crest of the vine: the big curl filling the hollow, and a small hook on the other side. */
const CURL = tendril(0.1, 0.75, 52, 0, 0.36, 1.25, 26);
const HOOK = tendril(1.75, -0.7, 12, -0.05, -0.95, 1.6, 10);
/** Leaves on the stem per crest: [stem phase, angle off the stem, length, half-width]. */
const VINE_LEAVES: [number, number, number, number][] = [
  [1.2, 1.15, 9.5, 3.4],
  [2.75, -1.0, 7, 2.6],
];

/**
 * Arabesque: a field of running vine scrolls. Wavy stems run down the card; in every hollow of the
 * wave a tendril curls into a spiral, with a hook and leaves beside it. Successive crests are turned
 * 180° about the stem's inflections, so the field is point-symmetric about the centre.
 */
function arabesque(p: Paint): void {
  const { g, k, cx, cy, fine } = p;
  const P = VINE_P * k;
  const lam = VINE_L * k;
  const nk = Math.ceil((p.x1 - p.x0) / 2 / P) + 1;
  const nm = Math.ceil((p.y1 - p.y0) / lam) + 2;
  /** Calls `fn` with the placement of every crest: its column x, the inflection y it hangs from, and ±1 (turned). */
  const crests = (fn: (x: number, y: number, s: number) => void) => {
    for (let c = -nk; c <= nk; c++)
      for (let m = -nm; m <= nm; m++) {
        const odd = (m & 1) !== 0;
        fn(cx + c * P, cy + (odd ? (m + 1) / 2 : m / 2) * lam, odd ? -1 : 1);
      }
  };
  g.beginPath();
  for (let c = -nk; c <= nk; c++) sine(p, c * P, VINE_A * k, lam, 0, true);
  pen(p, 1.6, 0.92);
  g.stroke();
  g.beginPath();
  crests((x, y, s) => {
    for (const pts of fine ? [CURL, HOOK] : [CURL]) {
      for (let q = 0; q < pts.length; q++) {
        const px = x + s * pts[q][0] * k;
        const py = y + s * pts[q][1] * k;
        if (q === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
    }
  });
  pen(p, fine ? 1 : 1.2, 0.9);
  g.stroke();
  g.beginPath();
  crests((x, y, s) => {
    for (const [vb, off, len, wid] of fine ? VINE_LEAVES : VINE_LEAVES.slice(0, 1)) {
      const bx = VINE_A * Math.sin(vb);
      const by = (vb / TAU) * VINE_L;
      const a = Math.atan2(1, (VINE_A * Math.cos(vb) * TAU) / VINE_L) + off + (s < 0 ? Math.PI : 0);
      leafPath(g, x + s * bx * k, y + s * by * k, a, len * k, wid * k);
    }
    const [ex, ey] = CURL[CURL.length - 1];
    dotPath(g, x + s * ex * k, y + s * ey * k, 1.8 * k);
  });
  ink(p, 0.92);
  g.fill();
}

/** Four-petal tiles: a flower on every tile, tiles shaded in a check, small buds at the corners. */
function floral(p: Paint): void {
  const { g, k, fine } = p;
  const D = 34 * k;
  g.beginPath();
  grid(p, D, D, false, (x, y, i, j) => {
    if ((i + j) & 1) g.rect(x - D / 2, y - D / 2, D, D);
  });
  shade(p, 0.36);
  g.fill();
  g.beginPath();
  grid(p, D, D, false, (x, y) => g.rect(x - D / 2, y - D / 2, D, D));
  pen(p, 0.8, 0.5);
  g.stroke();
  if (fine) {
    g.beginPath();
    grid(p, D, D, false, (x, y) => g.rect(x - D / 2 + 2.5 * k, y - D / 2 + 2.5 * k, D - 5 * k, D - 5 * k));
    pen(p, 0.55, 0.28);
    g.stroke();
  }
  g.beginPath();
  grid(p, D, D, false, (x, y) => {
    for (let q = 0; q < 4; q++) leafPath(g, x, y, Math.PI / 4 + (q * Math.PI) / 2, 12.5 * k, 5.2 * k);
  });
  ink(p, 0.9);
  g.fill();
  if (fine) {
    g.beginPath();
    grid(p, D, D, false, (x, y) => {
      for (let q = 0; q < 4; q++) {
        const a = Math.PI / 4 + (q * Math.PI) / 2;
        g.moveTo(x + Math.cos(a) * 3 * k, y + Math.sin(a) * 3 * k);
        g.lineTo(x + Math.cos(a) * 9 * k, y + Math.sin(a) * 9 * k);
      }
    });
    pen(p, 0.7, 0.75, p.t.base);
    g.stroke();
  }
  g.beginPath();
  grid(p, D, D, false, (x, y) => dotPath(g, x, y, 2.6 * k));
  g.fillStyle = p.t.base;
  g.fill();
  g.beginPath();
  grid(p, D, D, false, (x, y) => {
    dotPath(g, x, y, 1.5 * k);
    for (let q = 0; q < 4; q++) leafPath(g, x + D / 2, y + D / 2, (q * Math.PI) / 2, 5 * k, 1.8 * k);
  });
  ink(p, 0.85);
  g.fill();
}

/** Sunburst: rays from the centre in alternating tones, ruled at every edge. */
function sunburst(p: Paint): void {
  const { g, k, cx, cy, fine } = p;
  const N = 72;
  const R = Math.hypot(p.x1 - cx, p.y1 - cy) + 8 * k;
  g.beginPath();
  for (let i = 0; i < N; i += 2) {
    const a0 = (i * TAU) / N;
    const a1 = ((i + 1) * TAU) / N;
    g.moveTo(cx, cy);
    g.lineTo(cx + R * Math.cos(a0), cy + R * Math.sin(a0));
    g.lineTo(cx + R * Math.cos(a1), cy + R * Math.sin(a1));
    g.closePath();
  }
  shade(p, 0.48);
  g.fill();
  const rays = (sel: (i: number) => boolean, r0: number, half: boolean) => {
    g.beginPath();
    for (let i = 0; i < N; i++) {
      if (!sel(i)) continue;
      const a = ((i + (half ? 0.5 : 0)) * TAU) / N;
      // r0 < 0: a start that wanders with the ray (the same on opposite rays), so no ring forms
      const r = r0 >= 0 ? r0 : (18 + 22 * (((i % (N / 2)) * 0.618) % 1)) * k;
      g.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
    }
  };
  rays((i) => i % 6 !== 0, -1, false);
  pen(p, 0.8, 0.55);
  g.stroke();
  rays((i) => i % 6 === 0, 6 * k, false);
  pen(p, 1.5, 0.9);
  g.stroke();
  if (fine) {
    rays((i) => !(i & 1), 70 * k, true);
    pen(p, 0.55, 0.32);
    g.stroke();
  }
}

/** Zigzag: upright columns of zigzag rules, alternate columns shaded, hairlines between. */
function zigzag(p: Paint): void {
  const { g, k, fine } = p;
  const sp = 10 * k;
  const hp = 9 * k;
  const f = (u: number) => tri(u, hp, 3.6 * k);
  const ys = samples(p, hp, true, 0.5);
  const N = Math.ceil((p.x1 - p.x0) / 2 / sp) + 2;
  g.beginPath();
  for (let n = -N; n <= N; n++) {
    if (!(n & 1)) continue;
    curve(p, ys, (n - 0.5) * sp, f, true);
    curve(p, ys, (n + 0.5) * sp, f, true, true);
    g.closePath();
  }
  shade(p, 0.42);
  g.fill();
  g.beginPath();
  for (let n = -N; n <= N; n++) curve(p, ys, (n + 0.5) * sp, f, true);
  g.lineJoin = 'miter';
  pen(p, 1.3, 0.88);
  g.stroke();
  if (fine) {
    g.beginPath();
    for (let n = -N; n <= N; n++) curve(p, ys, n * sp, f, true);
    pen(p, 0.6, 0.4);
    g.stroke();
  }
}

const PAINTERS = new Map<string, Painter>([
  ['lattice', lattice],
  ['crosshatch', crosshatch],
  ['dots', dots],
  ['checker', checker],
  ['argyle', argyle],
  ['tartan', tartan],
  ['herringbone', herringbone],
  ['houndstooth', houndstooth],
  ['waves', waves],
  ['scales', scales],
  ['chevron', chevron],
  ['honeycomb', honeycomb],
  ['quatrefoil', quatrefoil],
  ['meander', meander],
  ['basketweave', basketweave],
  ['rings', rings],
  ['stars', stars],
  ['guilloche', guilloche],
  ['moire', moire],
  ['pinstripe', pinstripe],
  ['ogee', ogee],
  ['arabesque', arabesque],
  ['floral', floral],
  ['sunburst', sunburst],
  ['zigzag', zigzag],
]);

function roundRectPath(g: G, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/** A card back of `w × h` pixels (the card face size by default). */
export function renderPatternBack(patternId: string, tintId: string, w = FACE_W, h = FACE_H): HTMLCanvasElement {
  const tint = BACK_TINTS.find((t) => t.id === tintId) ?? BACK_TINTS[0];
  const paint = PAINTERS.get(patternId) ?? PAINTERS.get(DEFAULT_PATTERN)!;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const s = w / FACE_W;
  const lw = (px: number) => Math.max(1, px * s);
  const cx = w / 2;
  const cy = h / 2;

  // card stock with its white margin
  g.beginPath();
  roundRectPath(g, 2 * s, 2 * s, w - 4 * s, h - 4 * s, 34 * s);
  g.fillStyle = '#fbf8f1';
  g.fill();
  g.lineWidth = lw(3);
  g.strokeStyle = 'rgba(60,50,30,.28)';
  g.stroke();

  // the coloured field
  const m = 22 * s;
  const fr = 20 * s;
  g.save();
  g.beginPath();
  roundRectPath(g, m, m, w - 2 * m, h - 2 * m, fr);
  g.fillStyle = tint.base;
  g.fill();
  g.clip();

  // the pattern, inside the frame (a plain rectangular clip is much cheaper; the band below squares the corners off)
  const pi = m + 11 * s;
  const pr = fr - 11 * s;
  // thumbnails keep the motifs a little larger than true scale, so they still read
  const k = Math.max(s, 0.34);
  g.save();
  g.beginPath();
  g.rect(pi, pi, w - 2 * pi, h - 2 * pi);
  g.clip();
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  const [br, bg, bb] = rgb(tint.base);
  const lum = (0.2126 * br + 0.7152 * bg + 0.0722 * bb) / 255;
  const ia = 1 + 0.4 * Math.min(1, Math.max(0, (lum - 0.55) / 0.4));
  paint({ g, t: tint, k, fine: k >= 0.5, ia, cx, cy, x0: pi, y0: pi, x1: w - pi, y1: h - pi });
  g.restore();
  g.beginPath();
  g.rect(0, 0, w, h);
  roundRectPath(g, pi, pi, w - 2 * pi, h - 2 * pi, pr);
  g.fillStyle = tint.base;
  g.fill('evenodd');

  // depth: the field darkens toward the frame
  g.save();
  g.translate(cx, cy);
  g.scale(1, (h - 2 * m) / (w - 2 * m));
  const R = ((w - 2 * m) / 2) * 1.45;
  const vg = g.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
  vg.addColorStop(0, rgba(tint.dark, 0));
  vg.addColorStop(0.62, rgba(tint.dark, 0.16));
  vg.addColorStop(1, rgba(tint.dark, 0.62));
  g.fillStyle = vg;
  g.fillRect(-w, -h, 2 * w, 2 * h);
  g.restore();
  g.restore();

  // the frame: a ruled line and a hairline inside the field
  const fo = m + 5.5 * s;
  g.beginPath();
  roundRectPath(g, fo, fo, w - 2 * fo, h - 2 * fo, fr - 5.5 * s);
  g.lineWidth = lw(1.8);
  g.strokeStyle = rgba(tint.ink, 0.95);
  g.stroke();
  g.beginPath();
  roundRectPath(g, pi, pi, w - 2 * pi, h - 2 * pi, pr);
  g.lineWidth = lw(0.9);
  g.strokeStyle = rgba(tint.ink, 0.75);
  g.stroke();
  return cv;
}
