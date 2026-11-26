import { GOLD, makeCanvas } from '../../table/prints';
import { ROW } from './layout';

/** Canvas pixels per table unit of the crowd row. */
const PPU = 420;

/**
 * The crowd's row in front of a horse's box: a slim gold-edged bar with four neon places, one per
 * regular, in their seat colours (left to right in seat order). Their small stacks sit on them, so
 * a glance at the board shows who backed whom. Lay it with `addDecalAt(cv, x, z, ROW.print)`.
 */
export function crowdRow(colors: readonly string[]): HTMLCanvasElement {
  const W = Math.round(ROW.print * PPU);
  const H = Math.round(ROW.h * PPU);
  const { cv, g } = makeCanvas(W, H);
  const bw = ROW.w * PPU;
  const x0 = (W - bw) / 2;
  const pad = 6;
  g.beginPath();
  g.roundRect(x0, pad, bw, H - 2 * pad, H / 2 - pad);
  g.fillStyle = 'rgba(0,0,0,.18)';
  g.fill();
  g.strokeStyle = GOLD;
  g.globalAlpha = 0.6;
  g.lineWidth = 3;
  g.stroke();
  g.globalAlpha = 1;
  ROW.dx.forEach((dx, k) => {
    const color = colors[k];
    const cx = W / 2 + dx * PPU;
    const cy = H / 2;
    const r = ROW.r * PPU;
    g.fillStyle = color;
    g.globalAlpha = 0.14;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 12;
    g.lineWidth = 7;
    g.beginPath();
    g.arc(cx, cy, r - 3.5, 0, Math.PI * 2);
    g.stroke();
    g.shadowBlur = 0;
    g.globalAlpha = 0.5;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, r - 14, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  });
  return cv;
}
