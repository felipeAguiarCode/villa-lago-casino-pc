import type { Rng } from '../../core/rng';

/**
 * Coin Flip against the house.
 *
 * The dealer flicks a gold coin. Each flip is one draw from 80 equally likely outcomes:
 * 2 land on the EDGE (1/40), 39 show HEADS and 39 show TAILS (39/80 each).
 *
 * - HEADS / TAILS pay 1:1 (total return 2× the stake). When the coin stands on its edge every
 *   HEADS and TAILS bet loses: that is the house edge. RTP = 39/80 × 2 = 97.5%.
 * - EDGE pays 35:1 (total return 36× the stake). RTP = 1/40 × 36 = 90%.
 *
 * Integer chips in, total returns out (stake + winnings, 0 for a loss).
 */
export const COIN = {
  slots: 80,
  edgeSlots: 2,
  evenPays: 1,
  edgePays: 35,
  minBet: 5,
  maxBet: 2500,
  maxEdge: 250,
} as const;

export type CoinFace = 'heads' | 'tails' | 'edge';

export interface CoinBets {
  heads?: number;
  tails?: number;
  edge?: number;
}

/** Exact probability of each result. */
export const COIN_P: Record<CoinFace, number> = {
  edge: COIN.edgeSlots / COIN.slots,
  heads: (COIN.slots - COIN.edgeSlots) / 2 / COIN.slots,
  tails: (COIN.slots - COIN.edgeSlots) / 2 / COIN.slots,
};

/** One flip: a single uniform draw from the 80 outcomes. */
export function flip(rng: Rng): CoinFace {
  const r = rng(COIN.slots);
  if (r < COIN.edgeSlots) return 'edge';
  return r < COIN.edgeSlots + (COIN.slots - COIN.edgeSlots) / 2 ? 'heads' : 'tails';
}

/** Total returned on each bet for a result. */
export function settleCoin(bets: CoinBets, result: CoinFace): { heads: number; tails: number; edge: number } {
  const heads = bets.heads ?? 0;
  const tails = bets.tails ?? 0;
  const edge = bets.edge ?? 0;
  return {
    heads: result === 'heads' ? heads * (1 + COIN.evenPays) : 0,
    tails: result === 'tails' ? tails * (1 + COIN.evenPays) : 0,
    edge: result === 'edge' ? edge * (1 + COIN.edgePays) : 0,
  };
}

/** The dealer's covering stake laid next to a HEADS / TAILS bet (it pays 1:1). */
export const coinCover = (stake: number) => stake * COIN.evenPays;
