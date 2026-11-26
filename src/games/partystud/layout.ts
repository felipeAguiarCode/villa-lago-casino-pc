/**
 * Party Seven-Card Stud table geometry, in table units (pure math, no three.js).
 *
 * Five seats on a curve facing the dealer, listed from the player's left (third base) to the right
 * (first base, the dealer's left, who acts first). Each seat is a rigid group with its own frame:
 * `lx` to the seat's right, `ly` toward the dealer, origin at the centre of its row of chip circles.
 * A seat holds, from the rail: the row of circles (BONUS · ANTE · BLIND · RAISE), the down cards
 * (1st, 2nd and 7th, overlapped by half) and, toward the dealer, the four up cards (overlapped by half).
 * The seats are spread sideways with the stage's stretch; what is inside a seat keeps its size.
 */

export interface SeatGeo {
  /** Origin of the seat's frame (centre of its row of circles) on the table. */
  x: number;
  z: number;
  /** Turn of the seat toward the dealer (three.js rotation.y). */
  yaw: number;
  /** The player's own seat. */
  big: boolean;
  /** Box half width and its extent along ly. */
  halfW: number;
  bottom: number;
  top: number;
}

/** Seat origins at stretch 1, how far each one sits toward the dealer, and its turn. */
export const SEAT_X = [-4.0, -2.0, 0, 2.0, 4.0];
export const SEAT_LIFT = [0.95, 0.2, 0, 0.2, 0.95];
export const SEAT_YAW = [-0.18, -0.08, 0, 0.08, 0.18];
export const PLAYER_SEAT = 2;

/** Card size (cardMesh.ts) and the overlap steps of a seat's rows. */
export const CARD_W = 0.63;
export const CARD_H = 0.88;
export const UP_STEP = 0.32;
export const DOWN_STEP = 0.32;

/** The chip circles of a seat (lx), radius and spacing: a chip pile is 0.42 across. */
export const RING_R = 0.21;
export const RINGS = { bonus: -0.69, ante: -0.23, blind: 0.23, raise: 0.69 } as const;
export type RingId = keyof typeof RINGS;

/** Where things sit in a seat's frame (ly). */
export const LY = {
  rings: 0,
  down: 0.8,
  up: 1.7,
  tag: 2.4,
  plateAi: -0.6,
  platePlayer: -0.74,
  /** The seat's own chips come from here (beyond the rail side of the box). */
  home: -1.5,
};

/** The five seats; `playerZ` is the table z of the player's row of circles. */
export function seatLayout(playerZ: number, stretch: number): SeatGeo[] {
  return SEAT_X.map((x, i) => ({
    x: x * stretch,
    z: playerZ - SEAT_LIFT[i],
    yaw: SEAT_YAW[i],
    big: i === PLAYER_SEAT,
    halfW: 0.95,
    bottom: -0.3,
    top: LY.up + CARD_H / 2 + 0.08,
  }));
}

/** A point of a seat's frame on the table. */
export function onTable(s: SeatGeo, lx: number, ly: number): { x: number; z: number } {
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  return { x: s.x + lx * c - ly * n, z: s.z - lx * n - ly * c };
}

/**
 * Card i (0..6, in deal order) of a seat's hand in the seat's frame: the down cards (1st, 2nd, 7th)
 * on the near row, the up cards (3rd–6th) on the far row; later cards lie on top.
 */
export function cardSpot(i: number): { lx: number; ly: number; lift: number } {
  const down = i < 2 || i === 6;
  const k = down ? (i === 6 ? 2 : i) : i - 2;
  return down
    ? { lx: (k - 1) * DOWN_STEP, ly: LY.down, lift: k * 0.0035 }
    : { lx: (k - 1.5) * UP_STEP, ly: LY.up, lift: k * 0.0035 };
}

/** The dealer's row: seven cards in line, the down ones tucked toward the dealer. */
export const DEALER_PITCH = 0.66;
export const DEALER_TUCK = 0.12;
export function dealerSpot(i: number): { x: number; dz: number } {
  const down = i < 2 || i === 6;
  return { x: (i - 3) * DEALER_PITCH, dz: down ? -DEALER_TUCK : 0 };
}

/** The felt print (partyPrint, 1024 × 360 px) is laid this wide; where its lettering ends. */
export const PRINT_W = 4.1;
const PPU = 1024 / PRINT_W;
/**
 * Lowest table z (nearest the player) of the print's lettering and gold arcs at table x, relative
 * to the print's centre: the arcs are smiles (R = 900 px, ±0.5 rad), so they rise toward the ends.
 * Null beyond the lettering.
 */
export function printBottom(x: number): number | null {
  const px = Math.abs(x) * PPU;
  const half = 900 * Math.sin(0.5);
  if (px > half) return null;
  const rise = 900 - Math.sqrt(900 * 900 - px * px);
  // bottom arc at 300 px of 360, plus its stroke
  return (302 - rise - 180) / PPU;
}
/** Highest z (toward the dealer) of the print's lettering, relative to its centre (title tops). */
export const PRINT_TOP = (58 - 180) / PPU;
