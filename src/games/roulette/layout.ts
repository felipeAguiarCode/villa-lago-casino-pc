import { BETS, cellNumber, colOf, rowOf, type BetDef } from './rules';

/**
 * Geometry of the roulette table in table units (1 unit = 10 cm), laid out rigidly from one anchor:
 * the wheel on the left, then the classic horizontal layout (zero, 3 × 12 numbers, the three
 * "2 to 1" boxes; dozens and the even chances below). Pure maths, no three.js.
 */
export const DIM = {
  /** Number cell width and height. */
  CW: 0.5,
  CH: 0.6,
  /** Zero box width (pointed end on the left). */
  ZW: 0.6,
  /** "2 to 1" column boxes width. */
  KW: 0.6,
  /** Dozens row and even-chances row heights. */
  DH: 0.5,
  EH: 0.5,
  /** Wheel outer radius and the felt between wheel and layout. */
  RW: 1.36,
  GAP: 0.42,
  /** Hit-band thickness of the split / street lines and size of the corner squares. */
  LINE: 0.14,
  CORNER: 0.17,
};

export interface Box {
  /** Centre and size. */
  x: number;
  z: number;
  w: number;
  h: number;
}

export interface SpotGeo {
  bet: BetDef;
  x: number;
  z: number;
  w: number;
  h: number;
}

export interface Layout {
  /** Top-left corner of the number grid (cell of 3). */
  gx: number;
  gz: number;
  /** Wheel centre. */
  wheel: { x: number; z: number; r: number };
  /** Number → cell (0 → the zero box). */
  cells: Map<number, Box>;
  /** Outside bet id → its printed box. */
  boxes: Map<string, Box>;
  /** Every betting place, in stacking order (larger places first, so the small ones sit on top). */
  spots: SpotGeo[];
  /** Area of the printed layout decal (with its header and footer lines). */
  print: { x0: number; x1: number; z0: number; z1: number };
  /** Everything on the table: wheel, layout, the result tag under the wheel. */
  extent: { x0: number; x1: number; z0: number; z1: number };
}

export const EVEN_ORDER = ['low', 'even', 'red', 'black', 'odd', 'high'] as const;

/** Lays the table out around the anchor (ax, az), the centre of the whole composition. */
export function rouletteLayout(ax: number, az: number): Layout {
  const { CW, CH, ZW, KW, DH, EH, RW, GAP, LINE, CORNER } = DIM;
  const layoutW = ZW + 12 * CW + KW;
  const layoutH = 3 * CH + DH + EH;
  const totalW = 2 * RW + GAP + layoutW;
  const x0 = ax - totalW / 2;
  const wheel = { x: x0 + RW, z: az, r: RW };
  const gx = x0 + 2 * RW + GAP + ZW;
  const gz = az - layoutH / 2;
  const colX = (c: number) => gx + (c + 0.5) * CW;
  const rowZ = (r: number) => gz + (r + 0.5) * CH;
  const bottom = gz + 3 * CH;

  const cells = new Map<number, Box>();
  cells.set(0, { x: gx - ZW / 2, z: gz + 1.5 * CH, w: ZW, h: 3 * CH });
  for (let c = 0; c < 12; c++) for (let r = 0; r < 3; r++) cells.set(cellNumber(c, r), { x: colX(c), z: rowZ(r), w: CW, h: CH });

  const boxes = new Map<string, Box>();
  for (const k of [1, 2, 3]) boxes.set(`col${k}`, { x: gx + 12 * CW + KW / 2, z: rowZ(3 - k), w: KW, h: CH });
  for (const k of [1, 2, 3]) boxes.set(`doz${k}`, { x: gx + (4 * (k - 1) + 2) * CW, z: bottom + DH / 2, w: 4 * CW, h: DH });
  EVEN_ORDER.forEach((id, i) => boxes.set(id, { x: gx + (2 * i + 1) * CW, z: bottom + DH + EH / 2, w: 2 * CW, h: EH }));

  const place = (b: BetDef): SpotGeo => {
    const ns = b.numbers;
    const at = (x: number, z: number, w: number, h: number) => ({ bet: b, x, z, w, h });
    switch (b.kind) {
      case 'straight': {
        const c = cells.get(ns[0])!;
        return at(c.x, c.z, c.w, c.h);
      }
      case 'split': {
        const [a, d] = ns;
        if (a === 0) return at(gx, rowZ(rowOf(d)), LINE, CH - CORNER);
        if (d === a + 3) return at(gx + (colOf(a) + 1) * CW, rowZ(rowOf(a)), LINE, CH - CORNER);
        // a and a+1 share a column: the line between their rows
        return at(colX(colOf(a)), gz + rowOf(a) * CH, CW - CORNER, LINE);
      }
      case 'street': {
        if (ns[0] === 0) return at(gx, gz + (ns[1] === 1 ? 2 : 1) * CH, CORNER, CORNER);
        return at(colX(colOf(ns[0])), bottom, CW - CORNER, LINE);
      }
      case 'corner': {
        if (ns[0] === 0) return at(gx, bottom, CORNER, CORNER);
        const a = ns[0];
        return at(gx + (colOf(a) + 1) * CW, gz + rowOf(a) * CH, CORNER, CORNER);
      }
      case 'line':
        return at(gx + (colOf(ns[0]) + 1) * CW, bottom, CORNER, CORNER);
      default: {
        const bx = boxes.get(b.id)!;
        return at(bx.x, bx.z, bx.w, bx.h);
      }
    }
  };

  const rank: Record<string, number> = { column: 0, dozen: 0, even: 0, straight: 1, split: 2, street: 3, corner: 4, line: 5 };
  const spots = BETS.map(place).sort((p, q) => rank[p.bet.kind] - rank[q.bet.kind]);

  const print = { x0: gx - ZW - 0.16, x1: gx + 12 * CW + KW + 0.16, z0: gz - 0.52, z1: gz + layoutH + 0.44 };
  const extent = {
    x0: x0 - 0.06,
    x1: x0 + totalW + 0.06,
    z0: Math.min(print.z0, wheel.z - RW - 0.3),
    z1: Math.max(print.z1, wheel.z + RW + 0.48),
  };
  return { gx, gz, wheel, cells, boxes, spots, print, extent };
}
