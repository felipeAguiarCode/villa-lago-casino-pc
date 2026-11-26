/** Canvas helpers for the text and rings printed on the felt. */

export const INK = 'rgba(246,240,220,.86)';
export const INK_SOFT = 'rgba(246,240,220,.62)';
export const GOLD = '#d8b660';

/** Text along the bottom of a circle (a "smile"), like the classic table layouts. */
export function smileText(
  g: CanvasRenderingContext2D,
  text: string,
  cx: number,
  baseY: number,
  R: number,
  font: string,
  color: string,
  spacing = 0,
) {
  g.save();
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const ws = [...text].map((ch) => g.measureText(ch).width + spacing);
  const total = ws.reduce((a, b) => a + b, 0) - spacing;
  let acc = -total / 2;
  const cy0 = baseY - R;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i] - spacing;
    const th = (acc + w / 2) / R;
    g.save();
    g.translate(cx + R * Math.sin(th), cy0 + R * Math.cos(th));
    g.rotate(-th);
    g.fillText(text[i], 0, 0);
    g.restore();
    acc += ws[i];
  }
  g.restore();
}

/** An arc stroke matching smileText's circle. */
export function smileArc(g: CanvasRenderingContext2D, cx: number, baseY: number, R: number, halfAngle: number, color: string, width: number) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.arc(cx, baseY - R, R, Math.PI / 2 - halfAngle, Math.PI / 2 + halfAngle);
  g.stroke();
  g.restore();
}

export function makeCanvas(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return { cv, g: cv.getContext('2d')! };
}

/** Gold betting ring with an optional label printed inside/below. */
export function betRing(label = '', sub = ''): HTMLCanvasElement {
  const { cv, g } = makeCanvas(320, 320);
  g.translate(160, 160);
  g.strokeStyle = GOLD;
  g.globalAlpha = 0.85;
  g.lineWidth = 7;
  g.beginPath();
  g.arc(0, 0, 148, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(0, 0, 134, 0, Math.PI * 2);
  g.stroke();
  if (label) {
    g.globalAlpha = 0.78;
    g.fillStyle = INK;
    // PC: larger lettering, shrunk only when a long label would leave the ring
    let size = 54;
    g.font = `700 ${size}px "Cinzel", serif`;
    const w = g.measureText(label).width;
    if (w > 236) size = Math.floor((size * 236) / w);
    g.font = `700 ${size}px "Cinzel", serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 0, sub ? -14 : 0);
    if (sub) {
      g.font = '600 36px "Barlow Condensed", sans-serif';
      g.fillText(sub, 0, 38);
    }
  }
  cv.dataset.ring = '1';
  return cv;
}

/** Blackjack layout: house name, payout line, dealer rule and the insurance band. */
export function blackjackPrint(line1: string, line2: string, band: string): HTMLCanvasElement {
  const { cv, g } = makeCanvas(1024, 470);
  smileText(g, 'VILLA LAGO', 512, 70, 1500, '700 50px "Cinzel", serif', GOLD, 10);
  smileText(g, line1, 512, 176, 820, '700 64px "Cinzel", serif', INK, 2);
  smileText(g, line2, 512, 246, 820, 'italic 500 48px "Barlow Condensed", sans-serif', INK_SOFT, 1);
  smileArc(g, 512, 322, 900, 0.44, GOLD, 4);
  smileArc(g, 512, 384, 900, 0.44, GOLD, 4);
  smileText(g, band, 512, 367, 900, '700 36px "Cinzel", serif', GOLD, 6);
  return cv;
}

export interface PrintLine {
  text: string;
  y: number;
  R?: number;
  font: string;
  color?: string;
  spacing?: number;
}

/**
 * Vertical extent of smileText's lettering: every glyph box, rotated with the curve. The ends of a
 * wide line climb the circle, so their tops sit well above the centre's.
 */
function smileExtent(g: CanvasRenderingContext2D, text: string, baseY: number, R: number, font: string, spacing: number) {
  g.save();
  g.font = font;
  const ms = [...text].map((ch) => g.measureText(ch));
  g.restore();
  const ws = ms.map((m) => m.width + spacing);
  const total = ws.reduce((a, b) => a + b, 0) - spacing;
  let acc = -total / 2;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < ms.length; i++) {
    const w = ws[i] - spacing;
    const th = (acc + w / 2) / R;
    const oy = baseY - R + R * Math.cos(th);
    const asc = ms[i].actualBoundingBoxAscent;
    const desc = ms[i].actualBoundingBoxDescent;
    const s = Math.sin(th);
    const c = Math.cos(th);
    // glyph box corners (local x across, y down) rotated by -th
    for (const [x, y] of [[-w / 2, -asc], [w / 2, -asc], [-w / 2, desc], [w / 2, desc]]) {
      const ry = x * -s + y * c;
      y0 = Math.min(y0, oy + ry);
      y1 = Math.max(y1, oy + ry);
    }
    acc += ws[i];
  }
  return { y0, y1 };
}

/**
 * Generic felt print: smile-curved lines plus optional gold arcs. When the curved lettering would
 * run past the canvas (a wide title's ends climb the arc), the canvas grows by the same amount at
 * the top and the bottom, so the print keeps its place on the felt and nothing gets cut.
 */
export function tablePrint(lines: PrintLine[], h = 470, arcs: { y: number; R: number; half: number }[] = []): HTMLCanvasElement {
  const probe = makeCanvas(1, 1).g;
  let top = Infinity;
  let bottom = -Infinity;
  for (const l of lines) {
    const e = smileExtent(probe, l.text, l.y, l.R ?? 900, l.font, l.spacing ?? 2);
    top = Math.min(top, e.y0);
    bottom = Math.max(bottom, e.y1);
  }
  for (const a of arcs) {
    top = Math.min(top, a.y - a.R + a.R * Math.cos(a.half) - 2);
    bottom = Math.max(bottom, a.y + 2);
  }
  const margin = 4;
  const pad = top > bottom ? 0 : Math.ceil(Math.max(0, margin - top, bottom - h + margin));
  const { cv, g } = makeCanvas(1024, h + 2 * pad);
  g.translate(0, pad);
  for (const a of arcs) smileArc(g, 512, a.y, a.R, a.half, GOLD, 4);
  for (const l of lines) smileText(g, l.text, 512, l.y, l.R ?? 900, l.font, l.color ?? INK, l.spacing ?? 2);
  return cv;
}

export const FONT = {
  title: (px: number) => `700 ${px}px "Cinzel", serif`,
  italic: (px: number) => `italic 500 ${px}px "Barlow Condensed", sans-serif`,
  bold: (px: number) => `700 ${px}px "Barlow Condensed", sans-serif`,
};
