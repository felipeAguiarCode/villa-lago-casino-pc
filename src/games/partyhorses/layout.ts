import { BOX_H, BOX_W, PILE_Z } from '../horses/prints';

/**
 * Party Lucky Horses' layout, in table units around the centre of the oval (Lucky Horses' track,
 * unchanged; one anchor, so nothing stretches). Pure numbers: checked in the test.
 *
 *   - the five betting boxes stay in the infield, a little toward the back;
 *   - in front of each box, a row of four marked places takes the regulars' chips (small stacks in
 *     their seat colours, left to right in seat order);
 *   - the five seats are along the table's near rail, under the front straight, the player's in
 *     the middle.
 */

/** Vertical anchor of the oval's centre in the portrait layout frame (as Lucky Horses). */
export const V_CENTER = 0.45;
export const BOX_GAP = 0.12;
/** Centre x of horse i's box. */
export const boxX = (i: number) => (i - 2) * (BOX_W + BOX_GAP);
/** The boxes sit this much toward the back of the infield (z of their centre from the oval's centre). */
export const BOX_DZ = -0.12;
/** z of the player's stacks (and the house's covers) in the boxes. */
export const PILE_DZ = BOX_DZ - BOX_H / 2 + PILE_Z;

/**
 * The crowd's row in front of a box: centre z, depth and width, and the four places' x offsets
 * (seats 0, 1, 3, 4). The print is a little wider than the row (`print`), for the places' glow.
 */
export const ROW = {
  dz: 0.83,
  h: 0.39,
  w: BOX_W + 0.08,
  print: BOX_W + 0.14,
  dx: [-0.3975, -0.1325, 0.1325, 0.3975],
  /** Radius of a printed place. */
  r: 0.128,
} as const;
/** The regulars' chips are small stacks: this scale of a full chip. Each stack wears its seat's colour marker on top. */
export const MINI = 0.6;

/** Seats along the near rail: x of seat position 0..4 (left to right), and z of the plates. */
export const SEAT = {
  dx: 2.2,
  dz: 2.85,
  /** The seat's tag sits this far behind its plate (toward the track). */
  tagDz: -0.52,
  /** Chips leave a seat from this height above its plate. */
  homeY: 0.45,
} as const;
export const seatX = (pos: number) => (pos - 2) * SEAT.dx;
export const N_SEATS = 5;
export const PLAYER_SEAT = 2;
/** Index in a box's row of the regular at seat position `pos` (the player has no row place). */
export const rowIndex = (pos: number) => (pos < PLAYER_SEAT ? pos : pos - 1);
