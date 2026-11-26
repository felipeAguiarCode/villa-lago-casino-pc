/**
 * Party Ultimate Texas Hold'em table geometry, in table units (pure math, no three.js).
 *
 * Five seats on a curve facing the dealer, like Party Blackjack, listed from the player's left
 * (third base) to the right (first base, who acts first). Each seat is a rigid group with its own
 * frame (`onTable` of Party Blackjack: `lx` to the seat's right, `ly` toward the dealer, origin at
 * the centre of the ANTE circle row). The seats are spread sideways with the stage's stretch; what
 * is inside a seat keeps its size.
 *
 * From the dealer down: the dealer's two cards, the five-card board, the curved felt print, then
 * the seats. The print's arcs follow the seats' curve, so the inner seats (lifted toward the dealer)
 * sit beside the print's rising ends and the player's seat under its middle.
 */
import { onTable, type SeatGeo } from '../partybj/layout';
import type { BoxRing } from '../partybj/partyKit';

export { onTable };
export type { SeatGeo };

export const PLAYER_SEAT = 2;
export const N_SEATS = 5;

/** The four betting circles of a seat. */
export type BetId = 'trips' | 'ante' | 'blind' | 'play';
export const BET_IDS: BetId[] = ['trips', 'ante', 'blind', 'play'];

/** What a seat box holds, in the seat's frame. */
export interface BoxSpec {
  halfW: number;
  /** ly of the box's rail edge and dealer edge. */
  bottom: number;
  top: number;
  /** Chip circles: radius, lx of the two columns (±), ly of the second row (the first is at 0). */
  ringR: number;
  ringX: number;
  row2: number;
  /** Hole cards: ly of their centres and lx of each one (±). */
  cardsLy: number;
  cardLx: number;
  /** The seat's tag (over the cards) and its name plate (under the box). */
  tagLy: number;
  plateLy: number;
  /** How far beside its circle a winning bet's payout lands (outward). */
  payGap: number;
}

/**
 * The player's box is a little larger than the regulars'. Two rows of chip circles,
 * ANTE · BLIND near the rail and TRIPS · PLAY above them, then the two hole cards side by side.
 */
export const BOX: { player: BoxSpec; ai: BoxSpec } = {
  player: { halfW: 0.7, bottom: -0.36, top: 1.97, ringR: 0.27, ringX: 0.33, row2: 0.64, cardsLy: 1.46, cardLx: 0.32, tagLy: 2.15, plateLy: -0.86, payGap: 0.42 },
  ai: { halfW: 0.64, bottom: -0.34, top: 1.86, ringR: 0.25, ringX: 0.3, row2: 0.58, cardsLy: 1.36, cardLx: 0.3, tagLy: 2.04, plateLy: -0.72, payGap: 0.42 },
};

/** Seat centres at stretch 1, how far each one sits toward the dealer, and its turn. */
const SEAT_X = [-2.7, -1.35, 0, 1.35, 2.7];
const SEAT_LIFT = [1.15, 0.3, 0, 0.3, 1.15];
const SEAT_YAW = [-0.24, -0.11, 0, 0.11, 0.24];

export const boxOf = (big: boolean) => (big ? BOX.player : BOX.ai);

/** The five seats; `playerZ` is the table z of the player's ANTE row. */
export function seatGeos(playerZ: number, stretch: number): SeatGeo[] {
  return SEAT_X.map((x, i) => {
    const big = i === PLAYER_SEAT;
    const b = boxOf(big);
    return { x: x * stretch, z: playerZ - SEAT_LIFT[i], yaw: SEAT_YAW[i], big, halfW: b.halfW, bottom: b.bottom, top: b.top };
  });
}

/** Centre of a betting circle in its seat's frame. */
export function ringAt(b: BoxSpec, id: BetId): { lx: number; ly: number } {
  const left = id === 'ante' || id === 'trips';
  const top = id === 'trips' || id === 'play';
  return { lx: left ? -b.ringX : b.ringX, ly: top ? b.row2 : 0 };
}

/** Where the dealer puts a winning bet's payout: beside its circle, on the outer side of the column. */
export function payoutAt(b: BoxSpec, id: BetId): { lx: number; ly: number } {
  const r = ringAt(b, id);
  return { lx: r.lx + Math.sign(r.lx) * b.payGap, ly: r.ly };
}

/** The labelled circles for `seatBox`. */
export function boxRings(b: BoxSpec, labels: Record<BetId, string>): BoxRing[] {
  return BET_IDS.map((id) => ({ ...ringAt(b, id), r: b.ringR, label: labels[id] }));
}

/** Hole card i (0 left, 1 right) in the seat's frame; a folded hand is mucked into one squared pile. */
export function holePlace(b: BoxSpec, i: number, mucked = false): { lx: number; ly: number; yaw: number; lift: number } {
  if (mucked) return { lx: (i - 0.5) * 0.03, ly: b.cardsLy + 0.06, yaw: (i - 0.5) * 0.08, lift: i * 0.0035 };
  return { lx: (i * 2 - 1) * b.cardLx, ly: b.cardsLy, yaw: (i * 2 - 1) * -0.012, lift: i * 0.0035 };
}

/**
 * The middle of the table, relative to the player's ANTE row (table units, rigid): the board's
 * card row, the dealer's cards above it, and the felt print under the board.
 */
export const MID = {
  board: -3.98,
  dealer: -5.08,
  /** Centre of the print decal and its width (the Party family prints at 4.1). */
  print: -2.88,
  printW: 4.1,
  /** Card spacing of the board and of the dealer's pair. */
  boardGap: 0.68,
  dealerGap: 0.68,
};

/** x of card i of the board (5 cards) or of the dealer's pair (2 cards). */
export const boardX = (i: number) => (i - 2) * MID.boardGap;
export const dealerX = (i: number) => (i - 0.5) * MID.dealerGap;

/** ly of a seat's tag: over its cards, a little higher for the turned outer seats (clear of the cards' corners). */
export const tagLy = (g: SeatGeo) => boxOf(g.big).tagLy + Math.abs(g.yaw) * 0.6;
