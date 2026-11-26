import * as THREE from 'three';
import { FACE_H, FACE_W } from '../../table/cardFaces';
import { FONT, GOLD, INK, INK_SOFT, makeCanvas, smileArc, smileText } from '../../table/prints';
import { drawSuit } from '../../table/suits';
import { BLACK_JOKER, RED_JOKER, SYMBOLS, type Sym } from './rules';

/**
 * Suit Poker's picture cards, drawn on canvas in the house style of the card art (cream paper,
 * gold frame, red ♥ ♦ and dark ♠ ♣): one big symbol in the middle, small ones in the corners, and
 * two joker designs with a star medallion — the red "big" joker and the black one.
 */

const RAD = 34;
const RED = '#d0121f';
const BLACK = '#16161c';
/** Ink of each symbol on the cards. */
export const SYMBOL_INK = [RED, BLACK, BLACK, RED, RED, BLACK];
/** Our symbol index → the suit glyph of src/table/suits.ts (0 ♠, 1 ♥, 2 ♦, 3 ♣). */
const SUIT_OF = [-1, -1, 0, 1, 2, 3];

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Five-pointed star centred at (0, 0), point up, outer radius r. */
function starPath(r: number, inner = 0.42): Path2D {
  const p = new Path2D();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    if (i === 0) p.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  p.closePath();
  return p;
}

/**
 * Draws symbol `s` centred at (cx, cy), `size` tall, with the current fill style. The jokers are
 * stars: filled for the red one, an outline star with a small filled core for the black one, so
 * they stay apart in one colour too (felt prints).
 */
export function drawSymbol(g: CanvasRenderingContext2D, s: Sym, cx: number, cy: number, size: number, flip = false) {
  if (SUIT_OF[s] >= 0) {
    drawSuit(g, SUIT_OF[s], cx, cy, size, flip);
    return;
  }
  g.save();
  g.translate(cx, cy + size * 0.04);
  if (flip) g.rotate(Math.PI);
  const r = size * 0.55;
  if (s === RED_JOKER) g.fill(starPath(r));
  else {
    g.lineWidth = Math.max(1.5, size * 0.09);
    g.lineJoin = 'round';
    g.strokeStyle = g.fillStyle;
    g.stroke(starPath(r * 0.92));
    g.fill(starPath(r * 0.36));
  }
  g.restore();
}

function paper(g: CanvasRenderingContext2D) {
  roundRect(g, 2, 2, FACE_W - 4, FACE_H - 4, RAD);
  const grd = g.createLinearGradient(0, 0, FACE_W * 0.3, FACE_H);
  grd.addColorStop(0, '#fffef9');
  grd.addColorStop(1, '#f4efe1');
  g.fillStyle = grd;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(60,50,30,.28)';
  g.stroke();
}

/** Thin gold double frame inside the edge. */
function frame(g: CanvasRenderingContext2D) {
  g.save();
  g.strokeStyle = 'rgba(176,138,60,.8)';
  g.lineWidth = 4;
  roundRect(g, 26, 26, FACE_W - 52, FACE_H - 52, RAD - 12);
  g.stroke();
  g.lineWidth = 1.5;
  roundRect(g, 36, 36, FACE_W - 72, FACE_H - 72, RAD - 18);
  g.stroke();
  g.restore();
}

/** Small symbol in the top-left corner and, turned, in the bottom-right one. */
function corners(g: CanvasRenderingContext2D, s: Sym, word = '') {
  for (let k = 0; k < 2; k++) {
    g.save();
    if (k) {
      g.translate(FACE_W, FACE_H);
      g.rotate(Math.PI);
    }
    g.fillStyle = SYMBOL_INK[s];
    drawSymbol(g, s, 72, 90, 66);
    if (word) {
      g.font = '700 36px "Cinzel", serif';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      for (let i = 0; i < word.length; i++) g.fillText(word[i], 72, 162 + i * 40);
    }
    g.restore();
  }
}

function suitFace(g: CanvasRenderingContext2D, s: Sym) {
  paper(g);
  frame(g);
  const red = SYMBOL_INK[s] === RED;
  // a soft cartouche behind the big symbol
  g.save();
  g.translate(256, 358);
  const grd = g.createRadialGradient(0, -30, 10, 0, 0, 210);
  grd.addColorStop(0, red ? 'rgba(208,18,31,.10)' : 'rgba(22,22,28,.08)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(0, 0, 172, 214, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(176,138,60,.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(0, 0, 166, 206, 0, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 1.2;
  g.beginPath();
  g.ellipse(0, 0, 154, 194, 0, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  // the symbol with a soft sheen (drawn apart so the sheen stays on the ink), and a little depth
  const { cv: big, g: bg } = makeCanvas(300, 300);
  bg.fillStyle = SYMBOL_INK[s];
  drawSymbol(bg, s, 150, 150, 250);
  bg.globalCompositeOperation = 'source-atop';
  const shine = bg.createLinearGradient(40, 30, 230, 260);
  shine.addColorStop(0, 'rgba(255,255,255,.26)');
  shine.addColorStop(0.5, 'rgba(255,255,255,0)');
  bg.fillStyle = shine;
  bg.fillRect(0, 0, 300, 300);
  g.save();
  g.shadowColor = 'rgba(0,0,0,.24)';
  g.shadowBlur = 14;
  g.shadowOffsetY = 8;
  g.drawImage(big, 256 - 150, 352 - 150);
  g.restore();
  corners(g, s);
}

function jokerFace(g: CanvasRenderingContext2D, big: boolean) {
  paper(g);
  frame(g);
  const s = big ? RED_JOKER : BLACK_JOKER;
  g.save();
  g.translate(256, 358);
  // the big joker radiates: gold rays behind the medallion
  if (big) {
    g.strokeStyle = 'rgba(201,163,90,.75)';
    g.lineCap = 'round';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      // a sunburst above and below; the sides stay clear for the corner lettering
      if (Math.abs(Math.cos(a)) > 0.8) continue;
      const long = i % 2 === 0;
      g.lineWidth = long ? 5 : 3;
      g.beginPath();
      g.moveTo(Math.cos(a) * 150, Math.sin(a) * 182);
      g.lineTo(Math.cos(a) * (long ? 186 : 172), Math.sin(a) * (long ? 224 : 208));
      g.stroke();
    }
  }
  // medallion
  const grd = g.createRadialGradient(0, -50, 16, 0, 0, 180);
  if (big) {
    grd.addColorStop(0, '#f2545c');
    grd.addColorStop(0.65, '#a3121f');
    grd.addColorStop(1, '#5a0610');
  } else {
    grd.addColorStop(0, '#59647e');
    grd.addColorStop(0.65, '#242a3b');
    grd.addColorStop(1, '#0c0e15');
  }
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(0, 0, 140, 170, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = GOLD;
  g.lineWidth = 9;
  g.stroke();
  g.strokeStyle = 'rgba(255,236,170,.7)';
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(0, 0, 124, 154, 0, 0, Math.PI * 2);
  g.stroke();
  // a ring of small beads
  g.fillStyle = big ? '#f2d27a' : '#d9dde6';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath();
    g.arc(Math.cos(a) * 112, Math.sin(a) * 140, 4.5, 0, Math.PI * 2);
    g.fill();
  }
  // the star
  const r = big ? 104 : 88;
  const sg = g.createLinearGradient(-r, -r, r, r);
  if (big) {
    sg.addColorStop(0, '#fff6cf');
    sg.addColorStop(0.5, '#e8b84e');
    sg.addColorStop(1, '#a8731a');
  } else {
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(0.5, '#d3d9e6');
    sg.addColorStop(1, '#8a93a8');
  }
  g.save();
  g.translate(0, 6);
  g.shadowColor = 'rgba(0,0,0,.4)';
  g.shadowBlur = 12;
  g.shadowOffsetY = 5;
  g.fillStyle = sg;
  g.fill(starPath(r));
  g.restore();
  g.save();
  g.translate(0, 6);
  g.strokeStyle = big ? 'rgba(90,40,0,.55)' : 'rgba(10,12,20,.6)';
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.stroke(starPath(r));
  // a small inner star (the black joker's mark is hollow)
  g.fillStyle = big ? '#b3121f' : '#1a1d28';
  g.fill(starPath(r * 0.3));
  g.restore();
  g.restore();
  corners(g, s, 'JOKER');
}

/** Renders the face of symbol `s` at the size of the card faces. */
export function renderSymbolFace(s: Sym): HTMLCanvasElement {
  const { cv, g } = makeCanvas(FACE_W, FACE_H);
  if (s === RED_JOKER || s === BLACK_JOKER) jokerFace(g, s === RED_JOKER);
  else suitFace(g, s);
  return cv;
}

/**
 * The six face textures, made on first use and kept for the table's life (Card3D.destroy does not
 * dispose a map assigned from outside the CardFactory): call dispose() on leaving the table.
 */
export class SymbolFaces {
  private tex = new Map<Sym, THREE.CanvasTexture>();
  constructor(private anisotropy: number) {}

  get(s: Sym): THREE.Texture {
    let t = this.tex.get(s);
    if (!t) {
      t = new THREE.CanvasTexture(renderSymbolFace(s));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = this.anisotropy;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      this.tex.set(s, t);
    }
    return t;
  }

  /** Pre-renders every face. */
  warm() {
    for (let s = 0; s < SYMBOLS; s++) this.get(s);
  }

  dispose() {
    for (const t of this.tex.values()) t.dispose();
    this.tex.clear();
  }
}

/** Largest font size (≤ px) at which `text` with letter `spacing` is at most `maxW` wide. */
function fitFont(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, maxW: number, spacing: number): string {
  for (; px > 12; px--) {
    g.font = font(px);
    let w = -spacing;
    for (const ch of text) w += g.measureText(ch).width + spacing;
    if (w <= maxW) break;
  }
  return font(px);
}

/**
 * Felt print: the title, a line, the symbol order (★ › ☆ › ♠ › ♥ › ♦ › ♣) in gold, and the raise
 * rule between two gold arcs. Long lines (Portuguese) are set smaller to stay on the curve.
 */
export function feltPrint(title: string, sub: string, rule: string): HTMLCanvasElement {
  const W = 1024;
  const Hh = 336;
  const { cv, g } = makeCanvas(W, Hh);
  const R = 1100;
  smileText(g, title, 512, 96, 1600, fitFont(g, title, FONT.title, 60, 600, 5), INK, 5);
  smileText(g, sub, 512, 148, R, fitFont(g, sub, FONT.italic, 36, 640, 1), INK_SOFT, 1);
  // symbol order on the same curve
  const step = 74;
  const y0 = 204;
  const cy = y0 - R;
  for (let i = 0; i < SYMBOLS * 2 - 1; i++) {
    const x = (i - (SYMBOLS * 2 - 2) / 2) * (step / 2);
    const th = x / R;
    const px = 512 + R * Math.sin(th);
    const py = cy + R * Math.cos(th);
    g.save();
    g.translate(px, py);
    g.rotate(-th);
    if (i % 2 === 0) {
      g.fillStyle = GOLD;
      drawSymbol(g, i / 2, 0, -14, 40);
    } else {
      g.fillStyle = INK_SOFT;
      g.font = FONT.bold(34);
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.fillText('›', 0, -2);
    }
    g.restore();
  }
  smileArc(g, 512, 244, R, 0.36, GOLD, 4);
  smileArc(g, 512, 312, R, 0.36, GOLD, 4);
  smileText(g, rule, 512, 290, R, fitFont(g, rule, FONT.title, 24, 660, 3), GOLD, 3);
  return cv;
}
