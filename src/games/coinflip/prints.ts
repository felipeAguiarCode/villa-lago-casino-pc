import { FONT, GOLD, INK, INK_SOFT, makeCanvas } from '../../table/prints';
import { arcText } from './coin';

/** Felt prints of the Coin Flip table (gold on felt, like the classic game-show layouts). */

function goldRing(g: CanvasRenderingContext2D, r: number, w: number, alpha = 0.85) {
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = GOLD;
  g.lineWidth = w;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

function star(g: CanvasRenderingContext2D, R: number, r: number) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r : R;
    if (k) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
}

/** The crown over "VL" (HEADS), drawn in gold line art. */
function headsEmblem(g: CanvasRenderingContext2D, s: number) {
  g.save();
  g.scale(s, s);
  g.strokeStyle = GOLD;
  g.fillStyle = GOLD;
  g.lineJoin = 'round';
  g.lineWidth = 5;
  // crown
  g.save();
  g.translate(0, -46);
  const w = 120;
  const h = 52;
  const peaks = [-0.5, -0.25, 0, 0.25, 0.5];
  const hs = [0.62, 0.8, 1, 0.8, 0.62];
  g.beginPath();
  g.moveTo(-0.5 * w, 0);
  peaks.forEach((p, i) => {
    g.lineTo(p * w, -hs[i] * h);
    if (i < 4) g.lineTo((p + 0.125) * w, -0.34 * h);
  });
  g.lineTo(0.5 * w, 0);
  g.closePath();
  g.globalAlpha = 0.28;
  g.fill();
  g.globalAlpha = 0.9;
  g.stroke();
  peaks.forEach((p, i) => {
    g.beginPath();
    g.arc(p * w, -hs[i] * h - 7, 6, 0, Math.PI * 2);
    g.fill();
  });
  g.beginPath();
  g.roundRect(-0.56 * w, 0, 1.12 * w, 0.3 * h, 4);
  g.globalAlpha = 0.9;
  g.fill();
  g.restore();
  // monogram
  g.globalAlpha = 0.92;
  g.font = '700 132px "Cinzel", serif';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText('V', -32, 90);
  g.fillText('L', 36, 90);
  g.restore();
}

/** The star in its laurel wreath (TAILS). */
function tailsEmblem(g: CanvasRenderingContext2D, s: number) {
  g.save();
  g.scale(s, s);
  g.fillStyle = GOLD;
  g.strokeStyle = GOLD;
  g.globalAlpha = 0.9;
  for (const side of [-1, 1]) {
    const a0 = Math.PI / 2 + side * 0.18;
    const a1 = Math.PI / 2 + side * 2.25;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(0, 0, 118, Math.min(a0, a1), Math.max(a0, a1));
    g.stroke();
    for (let k = 0; k < 9; k++) {
      const a = a0 + ((a1 - a0) * (k + 0.5)) / 9;
      for (const [rr, off] of [
        [132, side * 0.7],
        [104, -side * 0.7],
      ] as const) {
        g.save();
        g.rotate(a);
        g.translate(rr, 0);
        g.rotate(Math.PI / 2 + off);
        g.beginPath();
        g.ellipse(0, 0, 6, 15 - k * 0.5, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
  }
  star(g, 78, 32);
  g.globalAlpha = 0.3;
  g.fill();
  g.globalAlpha = 0.95;
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.stroke();
  // facet lines
  g.lineWidth = 2;
  g.globalAlpha = 0.6;
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? 32 : 78;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    g.stroke();
  }
  g.restore();
}

/** A betting box: title on top, the face's emblem, and the payout at the bottom. 0.95 × 1.5 units. */
export function boxPrint(kind: 'heads' | 'tails', title: string, foot: string): HTMLCanvasElement {
  const W = 512;
  const H = 808;
  const { cv, g } = makeCanvas(W, H);
  g.save();
  g.fillStyle = 'rgba(0,0,0,.14)';
  g.beginPath();
  g.roundRect(10, 10, W - 20, H - 20, 46);
  g.fill();
  g.strokeStyle = GOLD;
  g.globalAlpha = 0.9;
  g.lineWidth = 7;
  g.stroke();
  g.lineWidth = 2.5;
  g.beginPath();
  g.roundRect(26, 26, W - 52, H - 52, 34);
  g.stroke();
  g.restore();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = INK;
  let size = 76;
  g.font = FONT.title(size);
  while (g.measureText(title).width > W - 110 && size > 40) g.font = FONT.title(--size);
  g.fillText(title, W / 2, 96);
  g.globalAlpha = 0.8;
  g.fillStyle = GOLD;
  g.fillRect(W / 2 - 120, 146, 240, 3);
  g.globalAlpha = 1;
  // the emblem sits in a double ring; the stacks land on its lower half
  g.save();
  g.translate(W / 2, 370);
  goldRing(g, 178, 5, 0.75);
  goldRing(g, 164, 2, 0.6);
  if (kind === 'heads') headsEmblem(g, 1.02);
  else tailsEmblem(g, 1.02);
  g.restore();
  g.fillStyle = GOLD;
  g.font = FONT.bold(52);
  g.fillText(foot, W / 2, H - 82);
  return cv;
}

/** The ringed landing circle with its gold sunburst and the edge rule printed around it. */
export function landingPrint(top: string, bottom: string): HTMLCanvasElement {
  const S = 1024;
  const { cv, g } = makeCanvas(S, S);
  g.translate(S / 2, S / 2);
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, 420);
  glow.addColorStop(0, 'rgba(255,214,120,.26)');
  glow.addColorStop(0.6, 'rgba(255,214,120,.08)');
  glow.addColorStop(1, 'rgba(255,214,120,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(0, 0, 420, 0, Math.PI * 2);
  g.fill();
  // sunburst rays
  const n = 48;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 0.5) / n) * Math.PI * 2;
    g.fillStyle = k % 2 ? 'rgba(216,182,96,.13)' : 'rgba(216,182,96,.24)';
    g.beginPath();
    g.moveTo(Math.cos(a0) * 70, Math.sin(a0) * 70);
    g.lineTo(Math.cos(a0) * 404, Math.sin(a0) * 404);
    g.lineTo(Math.cos(a1) * 404, Math.sin(a1) * 404);
    g.lineTo(Math.cos(a1) * 70, Math.sin(a1) * 70);
    g.closePath();
    g.fill();
  }
  goldRing(g, 70, 3, 0.7);
  goldRing(g, 412, 4, 0.85);
  goldRing(g, 488, 3, 0.75);
  goldRing(g, 503, 8, 0.9);
  // dots between the rings
  g.fillStyle = GOLD;
  g.globalAlpha = 0.7;
  for (const a of [Math.PI, 0]) {
    g.beginPath();
    g.arc(Math.cos(a) * 450, Math.sin(a) * 450, 8, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 0.9;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = INK;
  g.font = FONT.title(40);
  arcText(g, top, 450, 0, true, 1.12);
  g.fillStyle = GOLD;
  g.font = FONT.bold(42);
  arcText(g, bottom, 450, 0, false, 1.06);
  return cv;
}

/** The game's name across the felt, between the dealer's cradle and the landing circle. */
export function titlePrint(l1: string, l2: string): HTMLCanvasElement {
  const { cv, g } = makeCanvas(1024, 230);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = INK;
  g.font = FONT.title(78);
  g.save();
  const w = g.measureText(l1).width;
  g.fillText(l1, 512, 98);
  g.restore();
  g.fillStyle = GOLD;
  g.globalAlpha = 0.85;
  g.fillRect(512 - w / 2 - 60, 66, 40, 3);
  g.fillRect(512 + w / 2 + 20, 66, 40, 3);
  g.globalAlpha = 1;
  g.fillStyle = INK_SOFT;
  g.font = FONT.italic(46);
  g.fillText(l2, 512, 170);
  return cv;
}
