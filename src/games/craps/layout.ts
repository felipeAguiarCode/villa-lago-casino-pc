import { POINTS } from './rules';

/**
 * Geometry of the craps table in table units (1 unit = 10 cm), laid out rigidly from one anchor.
 * Pure maths, no three.js.
 *
 * Seen from the player's rail (+z toward the player): one end of a classic double layout on the
 * left — the PASS LINE along the bottom and wrapping up the end, the DON'T PASS BAR inside it, the
 * DON'T COME BAR box and the number boxes 4 5 SIX 8 NINE 10 along the top, COME, then BIG 6/8 and
 * the FIELD — and the centre proposition box on the right, with the shooter's dice under it.
 * Above the layout a band of open felt (the landing area) runs to the back wall, lined with the
 * rubber diamond pyramids the dice must hit. The padded rail runs round three sides.
 */
export const DIM = {
  /** Pass line and don't pass bar widths. */
  PW: 0.6,
  DW: 0.46,
  /** Number boxes: don't-come strip on top, come point cell with the number, place strip below. */
  DCH: 0.42,
  COH: 0.6,
  PLH: 0.54,
  /** Come and field row heights; big 6/8 corner width. */
  CH: 0.92,
  FH: 1.04,
  BW: 1.12,
  /** Main layout width, gap, centre box width. */
  LW: 7.6,
  GAP: 0.3,
  CW: 2.7,
  /** Open felt between the layout and the back wall (where the dice land). */
  APRON: 1.5,
  /** Felt between the layout's ends and the side walls. */
  SIDE: 0.25,
  /** Centre box rows: any seven, two hardway rows, 2/12, 3/11, horn, any craps, C & E. */
  R_ANY7: 0.42,
  R_HARD: 0.62,
  R_P: 0.5,
  R_HORN: 0.36,
  R_CRAPS: 0.42,
  R_CE: 0.42,
  /** The wall: inner height, and the depth of the rubber pyramids on it. */
  WALL_H: 0.5,
  PYR: 0.045,
};

export interface Rect {
  /** Centre and size. */
  x: number;
  z: number;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  z: number;
}

export interface Bounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface NumberBox {
  n: number;
  box: Rect;
  dc: Rect;
  come: Rect;
  place: Rect;
}

export interface CrapsLayout {
  main: Bounds;
  center: Bounds;
  /** Rectangles of every betting area (one bet can span two, the L-shaped lines). */
  areas: Map<string, Rect[]>;
  /** Where each bet's chips sit. */
  piles: Map<string, Pt>;
  numbers: Map<number, NumberBox>;
  dcBox: Rect;
  bigBox: Rect;
  field: Rect;
  comeBox: Rect;
  passBottom: Rect;
  passSide: Rect;
  dpBottom: Rect;
  dpSide: Rect;
  /** Centre box rows. */
  rows: { any7: Rect; hard: Rect[]; p: Rect[]; horn: Rect; anyCraps: Rect; ce: Rect };
  puckOff: Pt;
  puckOn: Map<number, Pt>;
  /** The shooter's dice between rolls (centre of the pair). */
  home: Pt;
  /** Inner faces of the walls (the side walls run on past the player's rail). */
  walls: { xL: number; xR: number; zW: number; zB: number };
  /** Where thrown dice may come to rest. */
  landing: Bounds;
  /** The house's chip bank in the landing band's right end. */
  bank: Rect;
  /** Area of the felt print. */
  print: Bounds;
  /** Everything on the table, for the camera framing. */
  extent: Bounds;
}

const R = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, h: z1 - z0 });

/** Number boxes left to right. */
export const BOX_ORDER = [...POINTS];

/** Lays the table out around the anchor (ax, az), the centre of the whole composition. */
export function crapsLayout(ax: number, az: number): CrapsLayout {
  const D = DIM;
  const TW = D.LW + D.GAP + D.CW;
  const LH = D.DCH + D.COH + D.PLH + D.CH + D.FH + D.DW + D.PW;
  // vertical composition: rail (0.5) · landing band · layout · room for the amounts (0.4)
  const total = 0.5 + D.APRON + LH + 0.4;
  const top = az - total / 2;
  const zW = top + 0.5;
  const Z0 = zW + D.APRON;
  const Z1 = Z0 + LH;
  const X0 = ax - TW / 2;
  const X1 = X0 + D.LW;
  const Xi = X0 + D.PW + D.DW;
  const NH = D.DCH + D.COH + D.PLH;
  const zCome = Z0 + NH;
  const zField = zCome + D.CH;
  const zDP = zField + D.FH;
  const zPass = zDP + D.DW;

  const areas = new Map<string, Rect[]>();
  const piles = new Map<string, Pt>();
  const add = (id: string, r: Rect, pile?: Pt) => {
    areas.set(id, [...(areas.get(id) ?? []), r]);
    if (pile && !piles.has(id)) piles.set(id, pile);
  };

  const passBottom = R(X0, zPass, X1, Z1);
  const passSide = R(X0, zCome, X0 + D.PW, zPass);
  const dpBottom = R(X0 + D.PW, zDP, X1, zPass);
  const dpSide = R(X0 + D.PW, zCome, Xi, zDP);
  const lineX = X0 + 4.3;
  add('pass', passBottom, { x: lineX, z: passBottom.z });
  add('pass', passSide);
  add('dpass', dpBottom, { x: lineX, z: dpBottom.z });
  add('dpass', dpSide);
  piles.set('passOdds', { x: lineX + 0.42, z: passBottom.z + 0.03 });
  piles.set('dpassOdds', { x: lineX + 0.42, z: dpBottom.z });

  const dcBox = R(X0, Z0, Xi, zCome);
  add('dcome', dcBox, { x: dcBox.x, z: Z0 + 1.12 });
  const puckOff = { x: dcBox.x, z: Z0 + 0.4 };

  const numbers = new Map<number, NumberBox>();
  const puckOn = new Map<number, Pt>();
  const bw = (X1 - Xi) / 6;
  BOX_ORDER.forEach((n, i) => {
    const x0 = Xi + i * bw;
    const x1 = x0 + bw;
    const nb: NumberBox = {
      n,
      box: R(x0, Z0, x1, zCome),
      dc: R(x0, Z0, x1, Z0 + D.DCH),
      come: R(x0, Z0 + D.DCH, x1, Z0 + D.DCH + D.COH),
      place: R(x0, Z0 + D.DCH + D.COH, x1, zCome),
    };
    numbers.set(n, nb);
    const cx = nb.box.x;
    add(`dc${n}`, nb.dc, { x: cx - 0.33, z: nb.dc.z });
    piles.set(`dco${n}`, { x: cx + 0.33, z: nb.dc.z });
    add(`c${n}`, nb.come, { x: cx - 0.24, z: nb.come.z + 0.02 });
    piles.set(`co${n}`, { x: cx + 0.24, z: nb.come.z + 0.02 });
    add(`place${n}`, nb.place, { x: cx, z: nb.place.z });
    puckOn.set(n, { x: cx, z: nb.dc.z });
  });

  const comeBox = R(Xi, zCome, X1, zField);
  add('come', comeBox, { x: comeBox.x + 1.75, z: comeBox.z + 0.06 });
  const bigBox = R(Xi, zField, Xi + D.BW, zDP);
  add('big6', R(Xi, zField, Xi + D.BW / 2, zDP), { x: Xi + D.BW / 4, z: bigBox.z + 0.2 });
  add('big8', R(Xi + D.BW / 2, zField, Xi + D.BW, zDP), { x: Xi + (3 * D.BW) / 4, z: bigBox.z + 0.2 });
  const field = R(Xi + D.BW, zField, X1, zDP);
  add('field', field, { x: field.x + 0.2, z: field.z + 0.14 });

  // the centre box
  const P0 = X1 + D.GAP;
  const P1 = P0 + D.CW;
  const PM = (P0 + P1) / 2;
  let z = Z0;
  const row = (h: number) => {
    const r = R(P0, z, P1, z + h);
    z += h;
    return r;
  };
  const any7 = row(D.R_ANY7);
  const h1 = row(D.R_HARD);
  const h2 = row(D.R_HARD);
  const pA = row(D.R_P);
  const pB = row(D.R_P);
  const horn = row(D.R_HORN);
  const anyCraps = row(D.R_CRAPS);
  const ce = row(D.R_CE);
  const half = (r: Rect, left: boolean) => R(left ? P0 : PM, r.z - r.h / 2, left ? PM : P1, r.z + r.h / 2);
  const cell = (id: string, r: Rect) => add(id, r, { x: r.x + r.w * 0.22, z: r.z });
  add('any7', any7, { x: any7.x + 0.95, z: any7.z });
  cell('hard6', half(h1, true));
  cell('hard10', half(h1, false));
  cell('hard8', half(h2, true));
  cell('hard4', half(h2, false));
  cell('p2', half(pA, true));
  cell('p12', half(pA, false));
  cell('p3', half(pB, true));
  cell('p11', half(pB, false));
  add('horn', horn, { x: horn.x + 0.95, z: horn.z });
  add('anyCraps', anyCraps, { x: anyCraps.x + 0.95, z: anyCraps.z });
  add('ce', ce, { x: ce.x + 0.95, z: ce.z });
  const home = { x: PM, z: (z + Z1) / 2 - 0.02 };

  const walls = { xL: X0 - D.SIDE, xR: P1 + D.SIDE, zW, zB: Z1 + 4 };
  const bank = R(walls.xR - 2.45, zW + 0.12, walls.xR - 0.12, zW + 0.72);
  // the left end of the band stays clear: the history board covers that corner of the screen
  const landing = { x0: walls.xL + 2.4, x1: bank.x - bank.w / 2 - 0.2, z0: zW + D.PYR + 0.1, z1: Z0 - 0.16 };
  const print = { x0: walls.xL, x1: walls.xR, z0: zW, z1: Z1 + 0.3 };
  const extent = { x0: walls.xL - 0.42, x1: walls.xR + 0.42, z0: zW - 0.52, z1: Z1 + 0.38 };
  return {
    main: { x0: X0, x1: X1, z0: Z0, z1: Z1 },
    center: { x0: P0, x1: P1, z0: Z0, z1: z },
    areas,
    piles,
    numbers,
    dcBox,
    bigBox,
    field,
    comeBox,
    passBottom,
    passSide,
    dpBottom,
    dpSide,
    rows: { any7, hard: [h1, h2], p: [pA, pB], horn, anyCraps, ce },
    puckOff,
    puckOn,
    home,
    walls,
    landing,
    bank,
    print,
    extent,
  };
}

/** The betting area an odds bet belongs to (for highlights). */
export function areaOf(id: string): string {
  if (id === 'passOdds') return 'pass';
  if (id === 'dpassOdds') return 'dpass';
  if (/^co\d/.test(id)) return `c${id.slice(2)}`;
  if (/^dco\d/.test(id)) return `dc${id.slice(3)}`;
  return id;
}
