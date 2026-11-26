import { GOLD, INK, INK_SOFT, makeCanvas } from '../../table/prints';
import type { CrapsLayout, Rect } from './layout';

/** Canvas pixels per table unit of the layout print. */
const PX = 200;
const RED = '#d0303a';

export interface PrintText {
  pass: string;
  dontPass: string;
  dontCome: string[];
  come: string;
  field: string;
  big: string;
  place: string;
  dcLay: string;
  pays: (a: number, b: number) => string;
  payDouble: string;
  payTriple: string;
  seven: string;
  anyCraps: string;
  horn: string;
  hornSub: string;
  ce: string;
  house: string;
  title: string;
  wall: string;
  shooter: string;
  numberNames: Record<number, string>;
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/**
 * The printed felt: one end of a classic craps layout plus the centre box, the landing band's
 * watermark and the shooter's place, in the house style (gold lines, ivory Cinzel / Barlow
 * Condensed lettering, the classic red for COME, BIG 6/8, SEVEN and the dice).
 */
export function crapsPrint(L: CrapsLayout, T: PrintText): HTMLCanvasElement {
  const B = L.print;
  const W = Math.round((B.x1 - B.x0) * PX);
  const H = Math.round((B.z1 - B.z0) * PX);
  const { cv, g } = makeCanvas(W, H);
  const X = (x: number) => (x - B.x0) * PX;
  const Y = (z: number) => (z - B.z0) * PX;
  const U = (u: number) => u * PX;

  const rr = (x: number, y: number, w: number, h: number, r: number | number[]) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  };
  const box = (r: Rect, lw = 5, color = GOLD, alpha = 0.92, radius = 6) => {
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = color;
    g.lineWidth = lw;
    rr(X(r.x - r.w / 2), Y(r.z - r.h / 2), U(r.w), U(r.h), radius);
    g.stroke();
    g.restore();
  };
  const text = (s: string, x: number, y: number, font: string, color = INK, o: { rot?: number; spacing?: number; maxW?: number; stroke?: string; strokeW?: number; alpha?: number; align?: CanvasTextAlign } = {}) => {
    g.save();
    g.translate(x, y);
    if (o.rot) g.rotate(o.rot);
    g.font = font;
    g.textAlign = o.align ?? 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = o.alpha ?? 1;
    if (o.spacing) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing}px`;
    if (o.maxW) {
      const w = g.measureText(s).width;
      if (w > o.maxW) g.scale(o.maxW / w, 1);
    }
    if (o.stroke) {
      g.strokeStyle = o.stroke;
      g.lineWidth = o.strokeW ?? 4;
      g.lineJoin = 'round';
      g.strokeText(s, 0, 0);
    }
    g.fillStyle = color;
    g.fillText(s, 0, 0);
    g.restore();
  };
  const cinzel = (u: number) => `700 ${Math.round(U(u))}px "Cinzel", serif`;
  const barlow = (u: number, w = 700) => `${w} ${Math.round(U(u))}px "Barlow Condensed", sans-serif`;
  const italic = (u: number) => `italic 500 ${Math.round(U(u))}px "Barlow Condensed", sans-serif`;

  /** A red casino die seen from above, with white pips. */
  const die = (cx: number, cy: number, s: number, n: number) => {
    g.save();
    g.translate(cx, cy);
    const grd = g.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
    grd.addColorStop(0, '#ee3a44');
    grd.addColorStop(1, '#9a0d17');
    g.fillStyle = grd;
    rr(-s / 2, -s / 2, s, s, s * 0.14);
    g.fill();
    g.strokeStyle = 'rgba(255,220,200,.55)';
    g.lineWidth = Math.max(1.5, s * 0.04);
    g.stroke();
    g.fillStyle = '#fbf7ee';
    for (const [px, py] of PIPS[n]) {
      g.beginPath();
      g.arc(px * s * 0.27, py * s * 0.27, s * 0.1, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };
  const pair = (cx: number, cy: number, s: number, a: number, b: number) => {
    die(cx - s * 0.58, cy, s, a);
    die(cx + s * 0.58, cy, s, b);
  };
  const line = (x0: number, y0: number, x1: number, y1: number, lw = 5, alpha = 0.92, dash: number[] = []) => {
    g.save();
    g.strokeStyle = GOLD;
    g.globalAlpha = alpha;
    g.lineWidth = lw;
    g.setLineDash(dash);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    g.restore();
  };

  // ---------------------------------------------------------------- landing band watermark
  const ld = L.landing;
  const bandY = Y((L.walls.zW + L.main.z0) / 2);
  const bandX = X((ld.x0 + ld.x1) / 2);
  text(T.house, bandX, bandY - U(0.3), cinzel(0.3), GOLD, { spacing: U(0.12), alpha: 0.22 });
  text(T.title, bandX, bandY + U(0.12), cinzel(0.56), GOLD, { spacing: U(0.3), alpha: 0.18 });
  text(T.wall, bandX, bandY + U(0.52), italic(0.17), INK_SOFT, { spacing: U(0.04), alpha: 0.45 });

  // ---------------------------------------------------------------- main layout
  const M = L.main;
  // a soft darker bed under the layout
  g.save();
  g.fillStyle = 'rgba(0,0,0,.08)';
  rr(X(M.x0), Y(M.z0), U(M.x1 - M.x0), U(M.z1 - M.z0), [U(0.12), U(0.12), U(0.12), U(0.7)]);
  g.fill();
  g.restore();
  // the outer edge, curving round the end of the table under the pass line
  g.save();
  g.strokeStyle = GOLD;
  g.lineWidth = 7;
  g.globalAlpha = 0.95;
  g.beginPath();
  g.roundRect(X(M.x0), Y(M.z0), U(M.x1 - M.x0), U(M.z1 - M.z0), [U(0.12), U(0.12), U(0.12), U(0.7)]);
  g.stroke();
  g.restore();

  // pass line (L): the inner edge
  const ps = L.passSide;
  const pb = L.passBottom;
  const ds = L.dpSide;
  const db = L.dpBottom;
  g.save();
  g.strokeStyle = GOLD;
  g.lineWidth = 5;
  g.globalAlpha = 0.92;
  g.beginPath();
  g.moveTo(X(ps.x + ps.w / 2), Y(ps.z - ps.h / 2));
  g.lineTo(X(ps.x + ps.w / 2), Y(pb.z - pb.h / 2) - U(0.3));
  g.arcTo(X(ps.x + ps.w / 2), Y(pb.z - pb.h / 2), X(ps.x + ps.w / 2) + U(0.3), Y(pb.z - pb.h / 2), U(0.3));
  g.lineTo(X(pb.x + pb.w / 2), Y(pb.z - pb.h / 2));
  // don't pass bar (L): its inner edge
  g.moveTo(X(ds.x + ds.w / 2), Y(ds.z - ds.h / 2));
  g.lineTo(X(ds.x + ds.w / 2), Y(db.z - db.h / 2) - U(0.18));
  g.arcTo(X(ds.x + ds.w / 2), Y(db.z - db.h / 2), X(ds.x + ds.w / 2) + U(0.18), Y(db.z - db.h / 2), U(0.18));
  g.lineTo(X(db.x + db.w / 2), Y(db.z - db.h / 2));
  // the top of both lines, under the don't come bar
  g.moveTo(X(M.x0), Y(ps.z - ps.h / 2));
  g.lineTo(X(ds.x + ds.w / 2), Y(ps.z - ps.h / 2));
  g.stroke();
  g.restore();
  // lettering
  const passY = Y(pb.z);
  const pbL = X(pb.x - pb.w / 2) + U(1.2);
  const pbR = X(pb.x + pb.w / 2);
  for (const k of [0.26, 0.74]) text(T.pass, pbL + (pbR - pbL) * k, passY + 2, cinzel(0.36), INK, { spacing: U(0.08), maxW: U(2.9) });
  text(T.pass, X(ps.x), Y(ps.z) - U(0.1), cinzel(0.3), INK, { rot: -Math.PI / 2, spacing: U(0.06), maxW: U(ps.h - 0.5) });
  const dpY = Y(db.z);
  // two "DON'T PASS BAR ⚅⚅" groups, clear of the chips' place between them
  g.save();
  g.font = cinzel(0.2);
  const dpSpace = U(0.035);
  const tw = Math.min(U(2.3), g.measureText(T.dontPass).width + dpSpace * (T.dontPass.length - 1));
  g.restore();
  for (const c of [1.72, 5.4]) {
    const gw = tw + U(0.12 + 0.44);
    const left = X(db.x - db.w / 2) + U(c) - gw / 2;
    text(T.dontPass, left + tw / 2, dpY + 1, cinzel(0.2), INK, { spacing: dpSpace, maxW: U(2.3) });
    pair(left + tw + U(0.12 + 0.22), dpY, U(0.19), 6, 6);
  }
  text(T.dontPass, X(ds.x), Y(ds.z), cinzel(0.18), INK, { rot: -Math.PI / 2, spacing: U(0.03), maxW: U(ds.h - 0.2) });

  // don't come bar
  const dc = L.dcBox;
  box(dc, 5);
  // the OFF puck rests in the top of the box; the lettering and the 6-6 below it
  T.dontCome.forEach((w, i) => text(w, X(dc.x), Y(dc.z - dc.h / 2) + U(0.78 + i * 0.24), cinzel(0.2), INK, { spacing: U(0.04), maxW: U(dc.w - 0.14) }));
  pair(X(dc.x), Y(dc.z - dc.h / 2) + U(1.45), U(0.14), 6, 6);

  // number boxes
  for (const nb of L.numbers.values()) {
    box(nb.box, 5);
    const x0 = X(nb.box.x - nb.box.w / 2);
    const x1 = X(nb.box.x + nb.box.w / 2);
    line(x0 + 8, Y(nb.dc.z + nb.dc.h / 2), x1 - 8, Y(nb.dc.z + nb.dc.h / 2), 2.5, 0.55, [10, 8]);
    line(x0 + 8, Y(nb.place.z - nb.place.h / 2), x1 - 8, Y(nb.place.z - nb.place.h / 2), 3, 0.7);
    text(T.numberNames[nb.n], X(nb.come.x), Y(nb.come.z) + 3, cinzel(nb.n === 6 || nb.n === 9 ? 0.34 : 0.44), INK, { spacing: U(0.03), maxW: U(nb.come.w - 0.12) });
    const [a, b] = nb.n === 4 || nb.n === 10 ? [9, 5] : nb.n === 5 || nb.n === 9 ? [7, 5] : [7, 6];
    text(T.place, X(nb.place.x), Y(nb.place.z) - U(0.1), barlow(0.15), INK_SOFT, { spacing: U(0.04) });
    text(T.pays(a, b), X(nb.place.x), Y(nb.place.z) + U(0.1), barlow(0.17), GOLD, { spacing: U(0.02) });
    text(T.dcLay, X(nb.dc.x), Y(nb.dc.z) - U(0.11), barlow(0.1, 600), INK_SOFT, { spacing: U(0.03), alpha: 0.7 });
  }

  // come
  const cb = L.comeBox;
  box(cb, 5);
  text(T.come, X(cb.x), Y(cb.z) + 4, `italic ${cinzel(0.6)}`, RED, { spacing: U(0.16), stroke: 'rgba(255,233,180,.85)', strokeW: 5 });

  // big 6 / 8
  const bb = L.bigBox;
  box(bb, 5);
  line(X(bb.x), Y(bb.z - bb.h / 2) + 8, X(bb.x), Y(bb.z + bb.h / 2) - 8, 4, 0.85);
  for (const [k, n] of [
    [-1, 6],
    [1, 8],
  ]) {
    const cx = X(bb.x + (k * bb.w) / 4);
    text(T.big, cx, Y(bb.z - bb.h / 2) + U(0.17), cinzel(0.16), GOLD, { spacing: U(0.03) });
    text(String(n), cx, Y(bb.z) + U(0.1), cinzel(0.56), RED, { stroke: 'rgba(255,233,180,.85)', strokeW: 4 });
  }

  // field
  const f = L.field;
  box(f, 5);
  const nums = [2, 3, 4, 9, 10, 11, 12];
  const fx0 = X(f.x - f.w / 2) + U(0.45);
  const fx1 = X(f.x + f.w / 2) - U(0.45);
  const fy = Y(f.z - f.h / 2) + U(0.33);
  nums.forEach((n, i) => {
    const cx = fx0 + ((fx1 - fx0) * i) / (nums.length - 1);
    if (n === 2 || n === 12) {
      g.save();
      g.strokeStyle = GOLD;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(cx, fy, U(0.2), 0, Math.PI * 2);
      g.stroke();
      g.restore();
      text(n === 2 ? T.payDouble : T.payTriple, cx, fy + U(0.34), barlow(0.12), GOLD, { spacing: U(0.02) });
    }
    text(String(n), cx, fy + 2, cinzel(n === 2 || n === 12 ? 0.24 : 0.28), INK);
    if (i < nums.length - 1) {
      const nx = fx0 + ((fx1 - fx0) * (i + 0.5)) / (nums.length - 1);
      g.save();
      g.fillStyle = GOLD;
      g.globalAlpha = 0.8;
      g.beginPath();
      g.arc(nx, fy, U(0.025), 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  });
  text(T.field, X(f.x), Y(f.z + f.h / 2) - U(0.27), cinzel(0.36), GOLD, { spacing: U(0.4) });

  // ---------------------------------------------------------------- centre box
  const C = L.center;
  const cRect: Rect = { x: (C.x0 + C.x1) / 2, z: (C.z0 + C.z1) / 2, w: C.x1 - C.x0, h: C.z1 - C.z0 };
  g.save();
  g.fillStyle = 'rgba(0,0,0,.1)';
  rr(X(C.x0), Y(C.z0), U(C.x1 - C.x0), U(C.z1 - C.z0), 10);
  g.fill();
  g.restore();
  box(cRect, 7, GOLD, 0.95, 10);
  const R = L.rows;
  const rowLine = (r: Rect) => line(X(C.x0) + 4, Y(r.z + r.h / 2), X(C.x1) - 4, Y(r.z + r.h / 2), 4, 0.85);
  const midLine = (r: Rect) => line(X(cRect.x), Y(r.z - r.h / 2) + 4, X(cRect.x), Y(r.z + r.h / 2) - 4, 4, 0.85);
  // any seven
  text(T.seven, X(R.any7.x), Y(R.any7.z) + 2, cinzel(0.3), RED, { spacing: U(0.1), stroke: 'rgba(255,233,180,.8)', strokeW: 3, maxW: U(1.3) });
  for (const k of [-1, 1]) text(T.pays(4, 1), X(R.any7.x + k * 0.98), Y(R.any7.z), barlow(0.17), GOLD);
  rowLine(R.any7);
  // hardways
  const hard: [number, number, number][][] = [
    [
      [3, 3, 9],
      [5, 5, 7],
    ],
    [
      [4, 4, 9],
      [2, 2, 7],
    ],
  ];
  R.hard.forEach((r, i) => {
    midLine(r);
    hard[i].forEach(([a, b, p], j) => {
      const cx = X(C.x0 + (j + 0.5) * (cRect.w / 2));
      pair(cx - U(0.26), Y(r.z), U(0.24), a, b);
      text(T.pays(p, 1), cx + U(0.36), Y(r.z), barlow(0.17), GOLD);
    });
    rowLine(r);
  });
  // 2 / 12 and 3 / 11
  const props: [number, number, number][][] = [
    [
      [1, 1, 30],
      [6, 6, 30],
    ],
    [
      [1, 2, 15],
      [5, 6, 15],
    ],
  ];
  R.p.forEach((r, i) => {
    midLine(r);
    props[i].forEach(([a, b, p], j) => {
      const cx = X(C.x0 + (j + 0.5) * (cRect.w / 2));
      pair(cx - U(0.26), Y(r.z), U(0.21), a, b);
      text(T.pays(p, 1), cx + U(0.38), Y(r.z), barlow(0.16), GOLD);
    });
    rowLine(r);
  });
  // horn
  text(T.horn, X(R.horn.x) - U(0.62), Y(R.horn.z) + 2, cinzel(0.2), INK, { spacing: U(0.06), maxW: U(0.95) });
  text(T.hornSub, X(R.horn.x) + U(0.55), Y(R.horn.z), barlow(0.15), GOLD, { spacing: U(0.02), maxW: U(1.1) });
  rowLine(R.horn);
  // any craps
  text(T.anyCraps, X(R.anyCraps.x), Y(R.anyCraps.z) + 2, cinzel(0.22), RED, { spacing: U(0.05), stroke: 'rgba(255,233,180,.8)', strokeW: 3, maxW: U(1.45) });
  for (const k of [-1, 1]) text(T.pays(7, 1), X(R.anyCraps.x + k * 1.05), Y(R.anyCraps.z), barlow(0.15), GOLD);
  rowLine(R.anyCraps);
  // C & E
  for (const [k, s] of [
    [-1.08, 'C'],
    [-0.72, 'E'],
  ] as [number, string][]) {
    const cx = X(R.ce.x + k);
    g.save();
    g.strokeStyle = GOLD;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, Y(R.ce.z), U(0.15), 0, Math.PI * 2);
    g.stroke();
    g.restore();
    text(s, cx, Y(R.ce.z) + 2, cinzel(0.17), INK);
  }
  text(T.ce, X(R.ce.x) + U(0.4), Y(R.ce.z), barlow(0.16), GOLD, { spacing: U(0.02), maxW: U(1.75) });

  // the shooter's place under the centre box
  const h = L.home;
  g.save();
  g.strokeStyle = GOLD;
  g.globalAlpha = 0.45;
  g.lineWidth = 3;
  g.setLineDash([12, 9]);
  rr(X(h.x - 0.55), Y(h.z - 0.22), U(1.1), U(0.44), U(0.22));
  g.stroke();
  g.restore();
  text(T.shooter, X(h.x), Y(h.z + 0.32), barlow(0.12, 600), INK_SOFT, { spacing: U(0.08), alpha: 0.8 });

  return cv;
}

/** Top face texture of the ON / OFF puck. */
export function puckFace(on: boolean, label: string): HTMLCanvasElement {
  const { cv, g } = makeCanvas(256, 256);
  g.translate(128, 128);
  const grd = g.createRadialGradient(-30, -40, 10, 0, 0, 128);
  if (on) {
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#dcd8cc');
  } else {
    grd.addColorStop(0, '#3a3a40');
    grd.addColorStop(1, '#0b0b0d');
  }
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, 127, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = on ? '#1a1a1a' : '#d8b660';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(0, 0, 108, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = on ? '#111' : '#f4efe0';
  g.font = `700 ${label.length > 3 ? 70 : 92}px "Cinzel", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 0, 6);
  return cv;
}
