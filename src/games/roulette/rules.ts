/**
 * European (single zero) roulette against the house.
 *
 * 37 pockets, 0..36. Every bet covering k numbers pays (36 / k − 1) to 1, so its expected return is
 * k/37 × 36/k = 36/37 = 97.30% (house edge 1/37 = 2.70%) for every bet on the table:
 *
 *   straight   1 number    35:1      corner      4 numbers   8:1  (incl. 0-1-2-3 "first four")
 *   split      2 numbers   17:1      six line    6 numbers   5:1
 *   street     3 numbers   11:1      column / dozen  12      2:1
 *   (incl. the 0-1-2 and 0-2-3 trios)  red/black, odd/even, 1-18/19-36: 18 numbers, 1:1
 *
 * Zero is neither red nor black, odd nor even, low nor high: it loses every even-money bet (no
 * la partage / en prison). Chips are integers; `settleRoulette` returns stake + winnings per bet.
 */

/** Pocket order of the European wheel, clockwise seen from above, starting at zero. */
export const wheelOrder: readonly number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const RED_NUMBERS: readonly number[] = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const RED = new Set(RED_NUMBERS);

export type RouletteColor = 'red' | 'black' | 'green';

export function colorOf(n: number): RouletteColor {
  if (n === 0) return 'green';
  return RED.has(n) ? 'red' : 'black';
}

export type BetKind = 'straight' | 'split' | 'street' | 'corner' | 'line' | 'column' | 'dozen' | 'even';

export interface BetDef {
  id: string;
  kind: BetKind;
  /** Numbers covered, ascending. */
  numbers: number[];
  /** Pays this many to 1. */
  pays: number;
  /** Inside bets sit on the number grid (lower table limit). */
  inside: boolean;
}

/** Table limits per betting place. */
export const LIMITS = { inside: 200, outside: 2000, min: 5 };

/** Payout to 1 for a bet covering k numbers (true odds of a 36-pocket wheel). */
export const paysFor = (k: number) => 36 / k - 1;

/** The number in grid column c (0..11, left to right) and row r (0 = top row 3,6,9…, 2 = bottom row 1,4,7…). */
export const cellNumber = (c: number, r: number) => 3 * c + 3 - r;
/** Grid column (0..11) of a number 1..36. */
export const colOf = (n: number) => Math.floor((n - 1) / 3);
/** Grid row (0 top .. 2 bottom) of a number 1..36. */
export const rowOf = (n: number) => 2 - ((n - 1) % 3);

function bet(id: string, kind: BetKind, numbers: number[]): BetDef {
  const nums = [...numbers].sort((a, b) => a - b);
  return { id, kind, numbers: nums, pays: paysFor(nums.length), inside: !['column', 'dozen', 'even'].includes(kind) };
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function buildBets(): BetDef[] {
  const out: BetDef[] = [];
  // straight ups
  for (let n = 0; n <= 36; n++) out.push(bet(`n${n}`, 'straight', [n]));
  // splits: across columns (n, n+3), within a column (n, n+1), and with zero
  for (let n = 1; n <= 33; n++) out.push(bet(`s${n}-${n + 3}`, 'split', [n, n + 3]));
  for (let n = 1; n <= 36; n++) if (n % 3 !== 0) out.push(bet(`s${n}-${n + 1}`, 'split', [n, n + 1]));
  for (const n of [1, 2, 3]) out.push(bet(`s0-${n}`, 'split', [0, n]));
  // streets, and the two zero trios (paid as streets)
  for (let c = 0; c < 12; c++) out.push(bet(`st${3 * c + 1}`, 'street', range(3 * c + 1, 3 * c + 3)));
  out.push(bet('tr0-1-2', 'street', [0, 1, 2]));
  out.push(bet('tr0-2-3', 'street', [0, 2, 3]));
  // corners (a, a+1, a+3, a+4) and the first four 0-1-2-3
  for (let a = 1; a <= 32; a++) if (a % 3 !== 0) out.push(bet(`c${a}-${a + 4}`, 'corner', [a, a + 1, a + 3, a + 4]));
  out.push(bet('c0-3', 'corner', [0, 1, 2, 3]));
  // six lines: two neighbouring streets
  for (let c = 0; c < 11; c++) out.push(bet(`l${3 * c + 1}-${3 * c + 6}`, 'line', range(3 * c + 1, 3 * c + 6)));
  // outside: columns (col1 = 1,4,…,34 on the bottom row; col3 = 3,6,…,36 on top), dozens, even chances
  for (const k of [1, 2, 3]) out.push(bet(`col${k}`, 'column', range(1, 36).filter((n) => (n - k) % 3 === 0)));
  for (const k of [1, 2, 3]) out.push(bet(`doz${k}`, 'dozen', range(12 * k - 11, 12 * k)));
  out.push(bet('low', 'even', range(1, 18)));
  out.push(bet('even', 'even', range(1, 36).filter((n) => n % 2 === 0)));
  out.push(bet('red', 'even', [...RED_NUMBERS]));
  out.push(bet('black', 'even', range(1, 36).filter((n) => !RED.has(n))));
  out.push(bet('odd', 'even', range(1, 36).filter((n) => n % 2 === 1)));
  out.push(bet('high', 'even', range(19, 36)));
  return out;
}

/** Every betting place of the layout (157 of them). */
export const BETS: readonly BetDef[] = buildBets();
export const BET_BY_ID: ReadonlyMap<string, BetDef> = new Map(BETS.map((b) => [b.id, b]));

/** True when the bet `id` wins on number n. */
export const betWins = (id: string, n: number) => !!BET_BY_ID.get(id)?.numbers.includes(n);

/**
 * Settles every bet for the winning number n: id → total returned (stake + winnings, 0 for a loss).
 * Unknown ids are returned as losses.
 */
export function settleRoulette(bets: Record<string, number>, n: number): Record<string, number> {
  const ret: Record<string, number> = {};
  for (const [id, stake] of Object.entries(bets)) {
    if (!stake) continue;
    const b = BET_BY_ID.get(id);
    ret[id] = b && b.numbers.includes(n) ? stake * (1 + b.pays) : 0;
  }
  return ret;
}

/** Index of a number on the wheel (0..36, clockwise from zero). */
export const pocketIndex = (n: number) => wheelOrder.indexOf(n);
