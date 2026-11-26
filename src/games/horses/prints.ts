import { FONT, GOLD, INK, INK_SOFT, makeCanvas } from '../../table/prints';
import { arcText } from '../coinflip/coin';
import type { HorseDef } from './rules';

/** Felt prints of the Lucky Horses infield: the five betting boxes and the two end emblems. */

export const BOX_W = 1.0;
export const BOX_H = 1.45;
const PX = 512;
const BW = PX;
const BH = Math.round(BOX_H * PX);
/** Where the stacks sit inside a box (from its top, in units), and their side offset. */
export const PILE_Z = 0.91;
export const PILE_DX = 0.23;

function star(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, r: number) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r : R;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (k) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
}

function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const tryLine = cur ? `${cur} ${w}` : w;
    if (g.measureText(tryLine).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = tryLine;
  }
  if (cur) lines.push(cur);
  return lines;
}

export interface BoxInfo {
  def: HorseDef;
  name: string;
  odds: string;
  form: number;
  bet: string;
  house: string;
}

/** Draws (or redraws) a betting box: colours, number and name, the price, the form stars and the two stack spots. */
export function drawBox(cv: HTMLCanvasElement | null, b: BoxInfo): HTMLCanvasElement {
  if (!cv) {
    cv = makeCanvas(BW, BH).cv;
  }
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, BW, BH);
  const dark = b.def.n === 3 ? '#1b1405' : '#ffffff';
  g.save();
  g.fillStyle = 'rgba(0,0,0,.16)';
  g.beginPath();
  g.roundRect(8, 8, BW - 16, BH - 16, 36);
  g.fill();
  // the stable's colour band
  g.save();
  g.clip();
  g.fillStyle = b.def.color;
  g.globalAlpha = 0.92;
  g.fillRect(0, 0, BW, 150);
  g.globalAlpha = 0.35;
  g.fillStyle = b.def.dark;
  g.fillRect(0, 144, BW, 6);
  g.restore();
  g.strokeStyle = b.def.color;
  g.lineWidth = 9;
  g.beginPath();
  g.roundRect(8, 8, BW - 16, BH - 16, 36);
  g.stroke();
  g.strokeStyle = GOLD;
  g.globalAlpha = 0.75;
  g.lineWidth = 2.5;
  g.beginPath();
  g.roundRect(22, 22, BW - 44, BH - 44, 26);
  g.stroke();
  g.restore();
  // number disc
  g.fillStyle = '#f7f4ec';
  g.beginPath();
  g.arc(84, 80, 50, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = b.def.dark;
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = b.def.n === 3 ? '#1b1405' : b.def.color;
  g.font = FONT.bold(84);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(b.def.n), 84, 86);
  // name
  g.fillStyle = dark;
  g.textAlign = 'left';
  let size = 40;
  g.font = FONT.title(size);
  let lines = wrap(g, b.name.toUpperCase(), 330);
  while ((lines.length > 2 || lines.some((l) => g.measureText(l).width > 330)) && size > 24) {
    g.font = FONT.title(--size);
    lines = wrap(g, b.name.toUpperCase(), 330);
  }
  const lh = size * 1.08;
  lines.forEach((l, i) => g.fillText(l, 152, 80 + (i - (lines.length - 1) / 2) * lh));
  // the price
  g.textAlign = 'center';
  g.fillStyle = GOLD;
  g.font = FONT.title(96);
  g.fillText(b.odds, BW / 2, 222);
  // form: five stars, filled to the horse's form
  for (let k = 0; k < 5; k++) {
    const cx = BW / 2 + (k - 2) * 64;
    const cy = 304;
    const fill = Math.min(1, Math.max(0, b.form - k));
    if (fill > 0) {
      g.save();
      g.beginPath();
      g.rect(cx - 30, cy - 30, 60 * fill, 60);
      g.clip();
      star(g, cx, cy, 27, 11);
      g.fillStyle = GOLD;
      g.fill();
      g.restore();
    }
    star(g, cx, cy, 27, 11);
    g.strokeStyle = fill > 0 ? GOLD : INK_SOFT;
    g.lineWidth = 2.5;
    g.lineJoin = 'round';
    g.stroke();
  }
  // the two stack spots: the player's bet and the house's cover
  const py = PILE_Z * PX;
  for (const [dx, label] of [
    [-PILE_DX, b.bet],
    [PILE_DX, b.house],
  ] as const) {
    const cx = BW / 2 + dx * PX;
    g.strokeStyle = GOLD;
    g.globalAlpha = 0.7;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, py, 102, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 0.65;
    g.fillStyle = INK;
    g.font = FONT.bold(27);
    g.fillText(label, cx, py + 128);
    g.globalAlpha = 1;
  }
  return cv;
}

function horseshoe(g: CanvasRenderingContext2D, s: number) {
  g.save();
  g.scale(s, s);
  g.strokeStyle = GOLD;
  g.lineCap = 'round';
  g.lineWidth = 30;
  g.beginPath();
  g.arc(0, -10, 78, Math.PI * 0.78, Math.PI * 2.22);
  g.stroke();
  // nail holes
  g.fillStyle = 'rgba(0,0,0,.45)';
  for (let k = 0; k < 8; k++) {
    const a = Math.PI * 0.86 + (k / 7) * Math.PI * 1.28;
    g.beginPath();
    g.arc(Math.cos(a) * 78, -10 + Math.sin(a) * 78, 5, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function trophy(g: CanvasRenderingContext2D, s: number) {
  g.save();
  g.scale(s, s);
  g.fillStyle = GOLD;
  g.strokeStyle = GOLD;
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(-62, -80);
  g.lineTo(62, -80);
  g.quadraticCurveTo(60, 10, 0, 22);
  g.quadraticCurveTo(-60, 10, -62, -80);
  g.fill();
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(sx * 66, -48, 26, sx > 0 ? -Math.PI / 2 : Math.PI / 2, sx > 0 ? Math.PI / 2 : (Math.PI * 3) / 2);
    g.stroke();
  }
  g.fillRect(-10, 20, 20, 36);
  g.fillRect(-44, 54, 88, 16);
  g.fillRect(-56, 70, 112, 14);
  g.restore();
}

/** Round emblem for an end of the infield: text around, a horseshoe or a trophy inside. */
export function endPrint(kind: 'shoe' | 'cup', top: string, bottom: string): HTMLCanvasElement {
  const { cv, g } = makeCanvas(512, 512);
  g.translate(256, 256);
  g.strokeStyle = GOLD;
  g.globalAlpha = 0.85;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(0, 0, 246, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(0, 0, 160, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 0.9;
  if (kind === 'shoe') horseshoe(g, 1.2);
  else trophy(g, 1.05);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = INK;
  let size = 44;
  g.font = FONT.title(size);
  while (g.measureText(top).width > 520 && size > 26) g.font = FONT.title(--size);
  arcText(g, top, 203, 0, true, 1.06);
  g.fillStyle = GOLD;
  size = 40;
  g.font = FONT.bold(size);
  while (g.measureText(bottom).width > 480 && size > 24) g.font = FONT.bold(--size);
  arcText(g, bottom, 203, 0, false, 1.04);
  return cv;
}
