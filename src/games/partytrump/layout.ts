/**
 * Party Trump 21 table geometry, in table units (pure math, no three.js).
 *
 * Five seats on a curve facing the dealer, listed from the player's left (third base) to the right
 * (first base, the dealer's left, who acts first), with Party Blackjack's seat frames: `lx` to the
 * seat's right, `ly` toward the dealer, origin at the centre of the BET ring (see `onTable`). Each
 * box holds a BET ring and a smaller STAKES UP ring beside it, the total bubble above them and the
 * hand of numbered cards toward the dealer; the name plate (with the regular's face-down trumps)
 * hangs under the box. The seats are spread sideways with the stage's stretch; what is inside a
 * seat keeps its size.
 */
import { onTable, type SeatGeo } from '../partybj/layout';

export { onTable, type SeatGeo };

export const PLAYER_SEAT = 2;

/** Seat centres at stretch 1, how far each one sits toward the dealer, and its turn. */
const SEAT_X = [-2.72, -1.38, 0, 1.38, 2.72];
const SEAT_LIFT = [1.02, 0.28, 0, 0.28, 1.02];
const SEAT_YAW = [-0.2, -0.08, 0, 0.08, 0.2];

/** Where things sit in a seat's frame (ly), and the two rings (lx, radius). */
export const LY = {
  cards: 1.16,
  bubble: 0.5,
  tag: 1.98,
  plateAi: -0.66,
  platePlayer: -0.84,
  /** The seat's own chips come from here (beyond the rail side of the box). */
  home: -1.55,
};
export const RING = { bet: { lx: -0.2, r: 0.28 }, stakes: { lx: 0.36, r: 0.2 } };

/** The five seats; `playerZ` is the table z of the player's BET ring. */
export function seatLayout(playerZ: number, stretch: number): SeatGeo[] {
  return SEAT_X.map((x, i) => {
    const big = i === PLAYER_SEAT;
    return {
      x: x * stretch,
      z: playerZ - SEAT_LIFT[i],
      yaw: SEAT_YAW[i],
      big,
      halfW: big ? 0.68 : 0.62,
      bottom: big ? -0.48 : -0.4,
      top: big ? 1.82 : 1.76,
    };
  });
}

/**
 * Card i of an n-card hand of numbered cards: a gentle fan around the hand's centre, later cards
 * to the right and on top, turned a little clockwise; long hands close up.
 */
export function cardPlace(n: number, i: number): { lx: number; ly: number; yaw: number; lift: number } {
  const k = i - (n - 1) / 2;
  const step = n > 1 ? Math.min(0.2, 0.74 / (n - 1)) : 0;
  return { lx: k * step, ly: -Math.abs(k) * 0.022, yaw: -k * 0.06, lift: i * 0.0035 };
}

/** The dealer's cards: a row centred over the table (numbers stay readable). */
export function dealerX(n: number, i: number): number {
  const gap = Math.min(0.5, 2.6 / Math.max(1, n));
  return (i - (n - 1) / 2) * gap;
}
