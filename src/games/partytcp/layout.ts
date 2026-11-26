/**
 * Party Three Card table geometry, in table units (pure math, no three.js).
 *
 * Five seats on a curve facing the dealer, listed from the player's left (third base) to the right
 * (first base, the dealer's left, who acts first), with the same seat frames as Party Blackjack:
 * `lx` to the seat's right, `ly` toward the dealer (see `onTable`). The frame's origin is the seat's
 * ANTE ring. Like a real Three Card Poker layout, each seat has its three cards toward the dealer
 * and a column of betting rings: PAIR PLUS on top, ANTE, then PLAY nearest the rail. The column sits
 * a little left of centre so the dealer's payouts land just to the right of each ring, inside the
 * box (where the table's betting places pay the player's own bets: PAY_DX).
 *
 * The seats are spread sideways with the stage's stretch; what is inside a seat keeps its size.
 * Spaced so that the boxes stay clear of each other even without any stretch.
 */
import { onTable, type SeatGeo } from '../partybj/layout';

export { onTable };

export const PLAYER_SEAT = 2;
/** Payouts land this far to the right of a ring (BetSpots.payout's offset for the player's bets). */
export const PAY_DX = 0.46;

export type RingId = 'pairPlus' | 'ante' | 'play';
/** The betting rings of a seat, from the dealer's side to the rail. */
export const RINGS: RingId[] = ['pairPlus', 'ante', 'play'];

export interface TcpSeatGeo extends SeatGeo {
  ringR: number;
  /** lx of the ring column. */
  colX: number;
  /** ly of each betting ring. */
  ring: Record<RingId, number>;
  /** ly of the centre of the three cards, and the step between them. */
  cards: number;
  fan: number;
  /** ly of the seat's tag (above the cards) and of the name plate (under the box). */
  tag: number;
  plate: number;
  /** ly where the seat's own chips come from (beyond the rail side of the box). */
  home: number;
}

/** Seat centres at stretch 1, how far each one sits toward the dealer, and its turn. */
const SEAT_X = [-2.9, -1.5, 0, 1.5, 2.9];
const SEAT_LIFT = [1.1, 0.25, 0, 0.25, 1.1];
const SEAT_YAW = [-0.16, -0.06, 0, 0.06, 0.16];

/** The player's box is a little larger: bigger rings and a wider fan to read the cards. */
const PLAYER = { halfW: 0.7, bottom: -1.0, top: 1.99, ringR: 0.28, colX: -0.23, gap: 0.64, cards: 1.47, fan: 0.3, tag: 2.09, plate: -1.3, home: -1.7 };
const AI = { halfW: 0.6, bottom: -0.91, top: 1.91, ringR: 0.25, colX: -0.22, gap: 0.58, cards: 1.385, fan: 0.22, tag: 2.0, plate: -1.2, home: -1.6 };

/** The five seats; `anteZ` is the table z of the player's ANTE ring. */
export function seatLayout(anteZ: number, stretch: number): TcpSeatGeo[] {
  return SEAT_X.map((x, i) => {
    const big = i === PLAYER_SEAT;
    const k = big ? PLAYER : AI;
    return {
      x: x * stretch,
      z: anteZ - SEAT_LIFT[i],
      yaw: SEAT_YAW[i],
      big,
      halfW: k.halfW,
      bottom: k.bottom,
      top: k.top,
      ringR: k.ringR,
      colX: k.colX,
      ring: { pairPlus: k.gap, ante: 0, play: -k.gap },
      cards: k.cards,
      fan: k.fan,
      // a turned seat's tag sits a little higher, clear of the corners of its cards
      tag: k.tag + 0.55 * Math.abs(SEAT_YAW[i]),
      plate: k.plate,
      home: k.home,
    };
  });
}

/** Card i of a seat's three: a slight fan around the hand's centre, later cards to the right and on top. */
export function cardPlace(s: TcpSeatGeo, i: number): { lx: number; ly: number; yaw: number; lift: number } {
  const k = i - 1;
  return { lx: k * s.fan, ly: s.cards - Math.abs(k) * 0.025, yaw: -k * 0.075, lift: i * 0.0035 };
}

/** A folded hand: the three cards squared into one face-down pile, pushed a little toward the dealer. */
export function muckPlace(s: TcpSeatGeo, i: number): { lx: number; ly: number; yaw: number; lift: number } {
  return { lx: (i - 1) * 0.014, ly: s.cards + 0.08 + i * 0.01, yaw: (i - 1) * 0.035, lift: i * 0.004 };
}

/** The dealer's three cards: a row centred over the table. */
export const DEALER_GAP = 0.68;
export const dealerX = (i: number) => (i - 1) * DEALER_GAP;
