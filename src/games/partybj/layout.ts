/**
 * Party Blackjack table geometry, in table units (pure math, no three.js).
 *
 * Five seats on a semicircle facing the dealer, listed from the player's left (third base) to the
 * right (first base, the dealer's left, who acts first). Each seat is a rigid group with its own
 * frame: `lx` to the seat's right, `ly` toward the dealer, origin at the centre of its chip circle.
 * The seats are spread sideways with the stage's stretch; what is inside a seat keeps its size.
 */

export interface SeatGeo {
  /** Chip circle centre on the table. */
  x: number;
  z: number;
  /** Turn of the seat toward the dealer (three.js rotation.y). */
  yaw: number;
  /** The player's own seat (bigger box). */
  big: boolean;
  /** Box half width and its extent along ly. */
  halfW: number;
  bottom: number;
  top: number;
}

/** Seat centres at stretch 1, how far each one sits toward the dealer, and its turn. */
const SEAT_X = [-2.4, -1.2, 0, 1.2, 2.4];
const SEAT_LIFT = [1.0, 0.3, 0, 0.3, 1.0];
const SEAT_YAW = [-0.22, -0.1, 0, 0.1, 0.22];
export const PLAYER_SEAT = 2;

/** Where things sit in a seat's frame (ly). */
export const LY = {
  cards: 1.12,
  bubble: 0.46,
  tag: 1.86,
  plateAi: -0.66,
  platePlayer: -0.84,
  /** The seat's own chips come from here (beyond the rail side of the box). */
  home: -1.5,
};

/** The five seats; `playerZ` is the table z of the player's chip circle. */
export function seatLayout(playerZ: number, stretch: number): SeatGeo[] {
  return SEAT_X.map((x, i) => {
    const big = i === PLAYER_SEAT;
    return {
      x: x * stretch,
      z: playerZ - SEAT_LIFT[i],
      yaw: SEAT_YAW[i],
      big,
      halfW: big ? 0.66 : 0.56,
      bottom: big ? -0.5 : -0.42,
      top: big ? 1.78 : 1.7,
    };
  });
}

/** A point of a seat's frame on the table. */
export function onTable(s: SeatGeo, lx: number, ly: number): { x: number; z: number } {
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  return { x: s.x + lx * c - ly * n, z: s.z - lx * n - ly * c };
}

/** Sideways offset of hand j when a seat plays n hands (after splits). */
export function handLx(n: number, j: number): number {
  const gap = n <= 1 ? 0 : n === 2 ? 0.95 : n === 3 ? 0.8 : 0.7;
  return (j - (n - 1) / 2) * gap;
}

/**
 * Card i of an n-card hand, slightly fanned around the hand's centre: later cards to the right,
 * on top, turned a little clockwise. A doubled hand's last card lies across the others.
 */
export function fanPlace(n: number, i: number, doubled: boolean): { lx: number; ly: number; yaw: number; lift: number } {
  const k = i - (n - 1) / 2;
  const step = n > 1 ? Math.min(0.17, 0.62 / (n - 1)) : 0;
  const p = { lx: k * step, ly: -Math.abs(k) * 0.025, yaw: -k * 0.075, lift: i * 0.0035 };
  if (doubled && n >= 3 && i === n - 1) {
    p.lx += 0.06;
    p.ly = 0.02;
    p.yaw = Math.PI / 2 + 0.04;
  }
  return p;
}

/** Dealer's cards: a tight row centred over the table. */
export function dealerX(n: number, i: number): number {
  return (i - (n - 1) / 2) * 0.24;
}
