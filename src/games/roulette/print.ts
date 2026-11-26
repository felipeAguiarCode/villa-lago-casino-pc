import { colorOf } from './rules';
import { DIM, EVEN_ORDER, type Layout } from './layout';
import { GOLD, INK, INK_SOFT, makeCanvas } from '../../table/prints';

/** Pixels per table unit of the printed layout. */
const PPU = 300;

const FILL = {
  red: ['#c81b28', '#8c0c16'],
  black: ['#26262a', '#08080a'],
  green: ['#1f9a54', '#0d6332'],
};

export interface PrintText {
  title: string;
  sub: string;
  dozens: [string, string, string];
  column: string;
  low: string;
  even: string;
  odd: string;
  high: string;
}

/** Letter-spaced text (canvas letterSpacing is not everywhere yet). */
function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  const ws = [...text].map((ch) => g.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0) + spacing * (ws.length - 1);
  let at = x - total / 2;
  const align = g.textAlign;
  g.textAlign = 'left';
  [...text].forEach((ch, i) => {
    g.fillText(ch, at, y);
    at += ws[i] + spacing;
  });
  g.textAlign = align;
  return total;
}

/** Sets the largest font (down to half size) at which the spaced text fits in maxW pixels. */
function fit(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, maxW: number, spacing: number) {
  const min = px * 0.5;
  for (;;) {
    g.font = font(px);
    if (g.measureText(text).width + spacing * (text.length - 1) <= maxW || px <= min) return;
    px *= 0.95;
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * The printed betting layout: one canvas for the whole felt print. Red and black number boxes, a
 * green zero with its pointed end, gold lines, Cinzel lettering, the red and black diamonds.
 */
export function layoutPrint(L: Layout, txt: PrintText): HTMLCanvasElement {
  const { CW, CH, ZW, KW, DH, EH } = DIM;
  const P = L.print;
  const W = Math.round((P.x1 - P.x0) * PPU);
  const H = Math.round((P.z1 - P.z0) * PPU);
  const { cv, g } = makeCanvas(W, H);
  const X = (x: number) => (x - P.x0) * PPU;
  const Z = (z: number) => (z - P.z0) * PPU;
  const u = (n: number) => n * PPU;
  const { gx, gz } = L;
  const gridR = gx + 12 * CW;
  const bottom = gz + 3 * CH;
  const end = bottom + DH + EH;

  // a slightly darker printed panel under the whole layout
  g.save();
  g.fillStyle = 'rgba(0,0,0,.14)';
  roundRect(g, X(gx - ZW - 0.07), Z(gz - 0.07), u(ZW + 12 * CW + KW + 0.14), u(3 * CH + DH + EH + 0.14), u(0.08));
  g.fill();
  g.restore();

  // number boxes
  const inset = 0.035;
  for (const [n, c] of L.cells) {
    if (n === 0) continue;
    const col = colorOf(n) as 'red' | 'black';
    const x = X(c.x - c.w / 2 + inset);
    const y = Z(c.z - c.h / 2 + inset);
    const w = u(c.w - 2 * inset);
    const h = u(c.h - 2 * inset);
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, FILL[col][0]);
    grad.addColorStop(1, FILL[col][1]);
    g.fillStyle = grad;
    roundRect(g, x, y, w, h, u(0.035));
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.12)';
    g.lineWidth = u(0.006);
    g.stroke();
  }

  // the zero: a green box with the classic pointed end
  const zx0 = gx - ZW;
  const tip = 0.2;
  const zeroPath = (pad: number) => {
    g.beginPath();
    g.moveTo(X(gx - pad), Z(gz + pad));
    g.lineTo(X(zx0 + tip + pad * 0.6), Z(gz + pad));
    g.lineTo(X(zx0 + pad), Z(gz + 1.5 * CH));
    g.lineTo(X(zx0 + tip + pad * 0.6), Z(bottom - pad));
    g.lineTo(X(gx - pad), Z(bottom - pad));
    g.closePath();
  };
  zeroPath(inset);
  const zg = g.createLinearGradient(0, Z(gz), 0, Z(bottom));
  zg.addColorStop(0, FILL.green[0]);
  zg.addColorStop(1, FILL.green[1]);
  g.fillStyle = zg;
  g.fill();

  // numerals
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.55)';
  g.shadowBlur = u(0.02);
  g.shadowOffsetY = u(0.008);
  g.fillStyle = '#fbf6e6';
  g.font = `700 ${u(0.25)}px "Cinzel", serif`;
  for (const [n, c] of L.cells) {
    if (n === 0) continue;
    g.fillText(String(n), X(c.x), Z(c.z) + u(0.012));
  }
  g.font = `700 ${u(0.34)}px "Cinzel", serif`;
  g.fillText('0', X(gx - ZW / 2 + 0.05), Z(gz + 1.5 * CH) + u(0.015));
  g.shadowColor = 'transparent';

  // gold lines
  g.strokeStyle = GOLD;
  g.lineCap = 'square';
  g.lineWidth = u(0.018);
  const line = (xa: number, za: number, xb: number, zb: number) => {
    g.beginPath();
    g.moveTo(X(xa), Z(za));
    g.lineTo(X(xb), Z(zb));
    g.stroke();
  };
  for (let c = 0; c <= 12; c++) line(gx + c * CW, gz, gx + c * CW, bottom);
  line(gridR + KW, gz, gridR + KW, bottom);
  for (let r = 0; r <= 3; r++) line(gx, gz + r * CH, gridR + KW, gz + r * CH);
  line(gx, bottom + DH, gridR, bottom + DH);
  line(gx, end, gridR, end);
  for (let k = 0; k <= 3; k++) line(gx + 4 * k * CW, bottom, gx + 4 * k * CW, bottom + DH);
  for (let i = 0; i <= 6; i++) line(gx + 2 * i * CW, bottom + DH, gx + 2 * i * CW, end);
  zeroPath(0);
  g.lineJoin = 'round';
  g.stroke();

  // double outer rule around the whole layout
  g.lineWidth = u(0.012);
  g.globalAlpha = 0.75;
  g.beginPath();
  const o = 0.05;
  g.moveTo(X(gx - o * 0.4), Z(gz - o));
  g.lineTo(X(gridR + KW + o), Z(gz - o));
  g.lineTo(X(gridR + KW + o), Z(bottom + o));
  g.lineTo(X(gridR + o), Z(bottom + o));
  g.lineTo(X(gridR + o), Z(end + o));
  g.lineTo(X(gx - o), Z(end + o));
  g.lineTo(X(gx - o), Z(bottom + o));
  g.lineTo(X(zx0 + tip - o * 0.4), Z(bottom + o));
  g.lineTo(X(zx0 - o), Z(gz + 1.5 * CH));
  g.lineTo(X(zx0 + tip - o * 0.4), Z(gz - o));
  g.closePath();
  g.stroke();
  g.globalAlpha = 1;

  // outside boxes
  g.fillStyle = INK;
  const cinzel = (px: number) => `700 ${px}px "Cinzel", serif`;
  fit(g, txt.column, cinzel, u(0.125), u(KW - 0.1), u(0.006));
  for (const k of [1, 2, 3]) {
    const b = L.boxes.get(`col${k}`)!;
    spaced(g, txt.column, X(b.x), Z(b.z) + u(0.008), u(0.006));
  }
  for (const k of [1, 2, 3]) {
    fit(g, txt.dozens[k - 1], cinzel, u(0.21), u(4 * CW - 0.3), u(0.03));
    const b = L.boxes.get(`doz${k}`)!;
    spaced(g, txt.dozens[k - 1], X(b.x), Z(b.z) + u(0.01), u(0.03));
  }
  const evenTxt: Record<string, string> = { low: txt.low, even: txt.even, odd: txt.odd, high: txt.high };
  for (const id of EVEN_ORDER) {
    const b = L.boxes.get(id)!;
    if (id === 'red' || id === 'black') {
      // the classic diamonds
      const hw = u(0.3);
      const hh = u(0.15);
      const cx = X(b.x);
      const cy = Z(b.z);
      g.beginPath();
      g.moveTo(cx - hw, cy);
      g.lineTo(cx, cy - hh);
      g.lineTo(cx + hw, cy);
      g.lineTo(cx, cy + hh);
      g.closePath();
      const dg = g.createLinearGradient(0, cy - hh, 0, cy + hh);
      dg.addColorStop(0, FILL[id][0]);
      dg.addColorStop(1, FILL[id][1]);
      g.fillStyle = dg;
      g.fill();
      g.strokeStyle = GOLD;
      g.lineWidth = u(0.014);
      g.stroke();
      g.fillStyle = INK;
      continue;
    }
    fit(g, evenTxt[id], cinzel, u(0.21), u(b.w - 0.16), u(0.025));
    spaced(g, evenTxt[id], X(b.x), Z(b.z) + u(0.01), u(0.025));
  }

  // header and footer lines
  const midX = X((gx - ZW + gridR + KW) / 2);
  g.fillStyle = GOLD;
  fit(g, txt.title, cinzel, u(0.2), u(4.2), u(0.06));
  const tw = spaced(g, txt.title, midX, Z(gz - 0.27), u(0.06));
  g.strokeStyle = GOLD;
  g.lineWidth = u(0.01);
  g.globalAlpha = 0.8;
  for (const s of [-1, 1]) {
    const a = midX + s * (tw / 2 + u(0.16));
    const b = midX + s * (tw / 2 + u(1.5));
    g.beginPath();
    g.moveTo(a, Z(gz - 0.27));
    g.lineTo(b, Z(gz - 0.27));
    g.stroke();
    g.beginPath();
    g.arc(a - s * u(0.06), Z(gz - 0.27), u(0.025), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = INK_SOFT;
  fit(g, txt.sub, (px) => `italic 500 ${px}px "Barlow Condensed", sans-serif`, u(0.15), u(ZW + 12 * CW + KW), u(0.012));
  spaced(g, txt.sub, midX, Z(end + 0.24), u(0.012));
  return cv;
}

/** Soft round shadow under the wheel. */
export function wheelShadow(): HTMLCanvasElement {
  const { cv, g } = makeCanvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,.62)');
  grad.addColorStop(0.72, 'rgba(0,0,0,.34)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return cv;
}
