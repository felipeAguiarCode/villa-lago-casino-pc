/**
 * PC edition: the part of the portrait layout each table really uses, so tables with room to spare
 * are shown larger (cards, chips and betting circles together). v0..v1 run down the phone frame
 * (0 = top), u0..u1 across it. Measured with the cards dealt (src/dev/previews.ts → measureTable),
 * plus room for the tags above the dealer's cards and the amounts under the bets. Tables not listed
 * use the default band (u 0.04..0.96, v 0.08..0.85): their layout already fills the height.
 */
export interface Framing {
  v0: number;
  v1: number;
  u0?: number;
  u1?: number;
  /** Uses the whole screen width (no side zones): roulette, the race track. */
  wide?: boolean;
}

export const PC_FRAMING: Record<string, Framing> = {
  blackjack: { v0: 0.11, v1: 0.84 },
  videobj: { v0: 0.09, v1: 0.77 },
  trump21: { v0: 0.12, v1: 0.78 },
  threecard: { v0: 0.13, v1: 0.83 },
  tcpfaceup: { v0: 0.13, v1: 0.83 },
  videopife: { v0: 0.3, v1: 0.85, u0: -0.12, u1: 1.12 },
  dragontiger: { v0: 0.12, v1: 0.78 },
  showdown: { v0: 0.03, v1: 0.83 },
  fourcard: { v0: 0.13, v1: 0.83 },
  crazy4: { v0: 0.13, v1: 0.83 },
  holdem3: { v0: 0.12, v1: 0.84 },
  videopoker: { v0: 0.3, v1: 0.78, u0: -0.04, u1: 1.04 },
  doubledraw: { v0: 0.12, v1: 0.82 },
  hcf: { v0: 0.13, v1: 0.83 },
  baccarat: { v0: 0.15, v1: 0.83 },
  caribbean: { v0: 0.13, v1: 0.83 },
  russian: { v0: 0.13, v1: 0.83 },
  thb: { v0: 0.12, v1: 0.82 },
  uth: { v0: 0.12, v1: 0.83 },
  letitride: { v0: 0.15, v1: 0.8 },
  paigow: { v0: 0.1, v1: 0.845 },
  war: { v0: 0.16, v1: 0.83 },
  reddog: { v0: 0.19, v1: 0.82 },
  highlow: { v0: 0.1, v1: 0.79 },
  redblack: { v0: 0.1, v1: 0.76 },
  picknum: { v0: 0.09, v1: 0.79 },
  roulette: { u0: -1.12, u1: 2.12, v0: 0.215, v1: 0.79, wide: true },
  partybj: { v0: 0.08, v1: 0.88, u0: -0.44, u1: 1.44, wide: true },
  coinflip: { v0: -0.04, v1: 0.76, u0: -0.08, u1: 1.08 },
  horses: { v0: -0.05, v1: 0.82, u0: -1.25, u1: 2.25, wide: true },
  partyuth: { v0: -0.02, v1: 0.88, u0: -0.44, u1: 1.44, wide: true },
  vanunu: { v0: 0.08, v1: 0.84, u0: -0.24, u1: 1.24 },
  craps: { u0: -1.42, u1: 2.42, v0: 0.04, v1: 0.99, wide: true },
  partytrump: { v0: 0.08, v1: 0.88, u0: -0.52, u1: 1.52, wide: true },
  partyhorses: { v0: -0.05, v1: 0.9, u0: -1.25, u1: 2.25, wide: true },
  partystud: { v0: 0.1, v1: 0.93, u0: -1.1, u1: 2.1, wide: true },
  stud7: { v0: 0.11, v1: 0.87, u0: -0.22, u1: 1.22 },
  pokerdice: { v0: -0.01, v1: 0.91, u0: -0.13, u1: 1.12 },
  suitpoker: { v0: 0.07, v1: 0.84, u0: -0.08, u1: 1.08 },
  partytcp: { v0: 0.03, v1: 0.88, u0: -0.66, u1: 1.66, wide: true },
};
