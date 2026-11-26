import type { Rng } from '../../core/rng';

/**
 * Craps against the house: the pure rules engine (no three.js, no DOM).
 *
 * The player is the shooter. Bets live in a `CrapsState` between rolls (a place bet, a come point
 * or a pass line bet with a point can stay on the felt for many rolls); `resolveRoll` takes the
 * state and the two dice and returns what happened to every bet plus the next state. Chips are
 * whole numbers: every bet is an integer and every payout is an integer.
 *
 * Bets (id → what it is):
 * - `pass` / `dpass`: Pass Line / Don't Pass Bar (bar 12), made on the come-out roll.
 * - `passOdds` / `dpassOdds`: free odds behind them once a point is set (taken / laid).
 * - `come` / `dcome`: Come / Don't Come, made while a point is on; they travel to their number.
 * - `c4`…`c10`, `dc4`…`dc10`: come and don't-come bets that travelled to a number (come points);
 *   `co4`…`co10`, `dco4`…`dco10`: the odds on them.
 * - `place4`…`place10`: place bets. `field`. `big6` / `big8`.
 * - `hard4` / `hard6` / `hard8` / `hard10`: the hardways.
 * - One-roll propositions: `any7`, `anyCraps`, `p2`, `p3`, `p11`, `p12`, `horn` (split four ways on
 *   2, 3, 11 and 12) and `ce` (C & E: half on any craps, half on eleven).
 *
 * Payouts ("to 1", stake returned on top) and the exact house edge per bet made (pushes count as
 * bets, as in the usual tables); `tests/craps.test.ts` computes every one of them exactly from the
 * 36 dice combinations with this engine:
 * - Pass / Come 1:1 ............................ 7/495 = 1.414%
 * - Don't Pass / Don't Come 1:1, bar 12 ........ 3/220 = 1.364%
 * - Odds (true odds: 4/10 2:1, 5/9 3:2, 6/8 6:5; laid the other way) .... 0%
 *   Maximum 3-4-5×: take 3× on 4/10, 4× on 5/9, 5× on 6/8 (the win is always 6× the line bet);
 *   lay up to 6× the don't bet on every number. Pass + full 3-4-5× odds: 0.374% on the total.
 * - Place 6/8 7:6 = 1.515% · Place 5/9 7:5 = 4.00% · Place 4/10 9:5 = 6.67%
 * - Field 1:1, 2 pays 2:1, 12 pays 3:1 ......... 1/36 = 2.78%
 * - Big 6 / Big 8 1:1 .......................... 1/11 = 9.09%
 * - Hard 6/8 9:1 = 9.09% · Hard 4/10 7:1 = 11.11%
 * - Any 7 4:1 = 16.67% · Any craps 7:1 = 11.11% · 2 or 12 30:1 = 13.89% · 3 or 11 15:1 = 11.11%
 * - Horn (2/12 net 27:4, 3/11 net 3:1 on the whole bet) = 12.5% · C & E (craps 3:1, eleven 7:1) = 11.11%
 *
 * Working rules (the usual casino defaults):
 * - Place bets and hardways are OFF on the come-out roll (a 7 doesn't take them, a hit doesn't pay)
 *   unless the `Rules` flags say otherwise. Big 6 / Big 8 always work.
 * - Odds on come points are OFF on the come-out roll: if the come point wins or loses on a come-out
 *   roll its odds are returned. Lay odds on don't-come points always work.
 * - Pass Line and come points are contract bets: they can't be taken down once a point is set.
 *   Everything else (don't bets, odds, place, field, props) can be taken down before any roll.
 * - Pass / Don't Pass are made on the come-out roll only; Come / Don't Come only while a point is on.
 * - The shooter must have a Pass or Don't Pass bet to roll the come-out.
 *
 * Rounding: a payout that would include a fraction of a chip is rounded DOWN to the whole chip, as
 * casinos pay "to the dollar". So bet 6/8 place bets in multiples of 6 (30 with 5-chips), 5/9 odds
 * in even amounts (multiples of 10), and lay 4/10 in multiples of 2, 5/9 in multiples of 3 and 6/8
 * in multiples of 6, to be paid in full. Full 3-4-5× odds on a line bet always pay exactly.
 * The Horn must be a multiple of 4 and C & E a multiple of 2 (split evenly), checked before a roll.
 */

export const POINTS = [4, 5, 6, 8, 9, 10] as const;
export type PointNum = (typeof POINTS)[number];
export const isPoint = (n: number): n is PointNum => (POINTS as readonly number[]).includes(n);

/** A payout ratio [numerator, denominator]: pays num for every den bet. */
export type Ratio = readonly [number, number];

export const TRUE_ODDS: Record<number, Ratio> = { 4: [2, 1], 5: [3, 2], 6: [6, 5], 8: [6, 5], 9: [3, 2], 10: [2, 1] };
export const LAY_ODDS: Record<number, Ratio> = { 4: [1, 2], 5: [2, 3], 6: [5, 6], 8: [5, 6], 9: [2, 3], 10: [1, 2] };
export const PLACE_PAYS: Record<number, Ratio> = { 4: [9, 5], 5: [7, 5], 6: [7, 6], 8: [7, 6], 9: [7, 5], 10: [9, 5] };
/** 3-4-5× odds: the largest odds bet behind a line / come bet, as a multiple of it. */
export const ODDS_MULT: Record<number, number> = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 };
/** Don't bettors may lay up to 6× (their win is then 3×, 4× or 5× the bet, like the pass side's). */
export const LAY_MULT = 6;
export const HARD_PAYS: Record<number, number> = { 4: 7, 6: 9, 8: 9, 10: 7 };
export const PROP_PAYS: Record<string, number> = { any7: 4, anyCraps: 7, p2: 30, p3: 15, p11: 15, p12: 30 };
export const FIELD_PAYS: Record<number, number> = { 2: 2, 3: 1, 4: 1, 9: 1, 10: 1, 11: 1, 12: 3 };
/** Table limits per betting place: 5 minimum; line, place and field bets up to 2,000; centre bets up to 500. */
export const LIMITS = { min: 5, line: 2000, prop: 500 };

/** Integer payout of `amount` at `ratio`, rounded down to the whole chip. */
export const pay = (amount: number, [n, d]: Ratio) => Math.floor((amount * n) / d);

export type BetKind =
  | 'pass'
  | 'dpass'
  | 'passOdds'
  | 'dpassOdds'
  | 'come'
  | 'dcome'
  | 'comePt'
  | 'comeOdds'
  | 'dcPt'
  | 'dcOdds'
  | 'place'
  | 'field'
  | 'big'
  | 'hard'
  | 'prop'
  | 'horn'
  | 'ce';

export interface BetInfo {
  id: string;
  kind: BetKind;
  /** Box number (come points, place, big, hardways, props by total). */
  n: number;
}

export const PROP_IDS = ['any7', 'anyCraps', 'p2', 'p3', 'p11', 'p12'] as const;

export const BET_IDS: string[] = [
  'pass',
  'passOdds',
  'dpass',
  'dpassOdds',
  'come',
  'dcome',
  ...POINTS.flatMap((n) => [`c${n}`, `co${n}`, `dc${n}`, `dco${n}`, `place${n}`]),
  'field',
  'big6',
  'big8',
  'hard4',
  'hard6',
  'hard8',
  'hard10',
  ...PROP_IDS,
  'horn',
  'ce',
];

const INFO = new Map<string, BetInfo>();
for (const id of BET_IDS) {
  const num = Number(id.replace(/\D/g, '')) || 0;
  let kind: BetKind;
  if (id === 'pass' || id === 'dpass' || id === 'passOdds' || id === 'dpassOdds' || id === 'come' || id === 'dcome' || id === 'field' || id === 'horn' || id === 'ce') kind = id;
  else if (id.startsWith('place')) kind = 'place';
  else if (id.startsWith('big')) kind = 'big';
  else if (id.startsWith('hard')) kind = 'hard';
  else if (id.startsWith('dco')) kind = 'dcOdds';
  else if (id.startsWith('dc')) kind = 'dcPt';
  else if (id.startsWith('co')) kind = 'comeOdds';
  else if (/^c\d/.test(id)) kind = 'comePt';
  else kind = 'prop';
  INFO.set(id, { id, kind, n: num });
}

export function betInfo(id: string): BetInfo {
  const b = INFO.get(id);
  if (!b) throw new Error(`unknown craps bet ${id}`);
  return b;
}

/** The odds bet that rides on a flat bet (and back). */
export function oddsOf(id: string): string | null {
  const b = betInfo(id);
  if (b.kind === 'pass') return 'passOdds';
  if (b.kind === 'dpass') return 'dpassOdds';
  if (b.kind === 'comePt') return `co${b.n}`;
  if (b.kind === 'dcPt') return `dco${b.n}`;
  return null;
}

export function flatOf(id: string): string | null {
  const b = betInfo(id);
  if (b.kind === 'passOdds') return 'pass';
  if (b.kind === 'dpassOdds') return 'dpass';
  if (b.kind === 'comeOdds') return `c${b.n}`;
  if (b.kind === 'dcOdds') return `dc${b.n}`;
  return null;
}

export const isOdds = (id: string) => flatOf(id) !== null;
/** Bets that are decided on every roll. */
export const isOneRoll = (id: string) => ['field', 'prop', 'horn', 'ce'].includes(betInfo(id).kind);

export interface CrapsState {
  /** The point (4, 5, 6, 8, 9, 10) or 0 when the puck is OFF (come-out roll). */
  point: number;
  /** Chips on every betting place (only places with chips). */
  bets: Record<string, number>;
  /** Rolls of the current shooter's hand. */
  rolls: number;
  /** Points the current shooter has made. */
  made: number;
}

export interface Rules {
  /** Place bets work on the come-out roll ("on"). Default off. */
  placeOnComeOut: boolean;
  /** Hardways work on the come-out roll. Default off. */
  hardOnComeOut: boolean;
}

export const DEFAULT_RULES: Rules = { placeOnComeOut: false, hardOnComeOut: false };

export const newState = (): CrapsState => ({ point: 0, bets: {}, rolls: 0, made: 0 });

export const cloneState = (s: CrapsState): CrapsState => ({ ...s, bets: { ...s.bets } });

export const totalOn = (s: CrapsState) => Object.values(s.bets).reduce((a, b) => a + b, 0);

export type Outcome =
  /** Paid `win` on top of the stake; `stays`: the stake stays up on the felt for the next roll. */
  | { kind: 'win'; stake: number; win: number; stays: boolean }
  | { kind: 'lose'; stake: number }
  /** No decision for the money: returned to the player (`stays` false) or left up (`stays` true). */
  | { kind: 'push'; stake: number; stays: boolean }
  /** A come / don't come bet travels to its number. */
  | { kind: 'move'; stake: number; to: string };

export type RollEvent = 'natural' | 'craps' | 'pointSet' | 'pointMade' | 'sevenOut' | 'roll';

export interface RollResult {
  dice: [number, number];
  sum: number;
  hard: boolean;
  /** The roll was a come-out roll (puck OFF). */
  comeOut: boolean;
  pointBefore: number;
  pointAfter: number;
  event: RollEvent;
  outcomes: Record<string, Outcome>;
  next: CrapsState;
  /** Chips that go back to the player's rack: winnings plus the stakes that are returned. */
  credit: number;
  /** Winnings paid this roll. */
  won: number;
  /** Stakes lost this roll. */
  lost: number;
  /** Stakes that had a decision this roll (won, lost or pushed). */
  wager: number;
  /** The shooter's hand that just ended on a seven-out: its rolls and points made. */
  handOver: { rolls: number; made: number } | null;
}

/**
 * Plays one roll of the dice against every bet on the felt. Pure: `s` is not modified.
 */
export function resolveRoll(s: CrapsState, d1: number, d2: number, rules: Rules = DEFAULT_RULES): RollResult {
  const sum = d1 + d2;
  const hard = d1 === d2;
  const comeOut = s.point === 0;
  const P = s.point;
  const out: Record<string, Outcome> = {};
  const win = (id: string, stake: number, w: number, stays: boolean) => (out[id] = { kind: 'win', stake, win: w, stays });
  const lose = (id: string, stake: number) => (out[id] = { kind: 'lose', stake });
  const push = (id: string, stake: number, stays: boolean) => (out[id] = { kind: 'push', stake, stays });

  for (const [id, a] of Object.entries(s.bets)) {
    if (!(a > 0)) continue;
    const b = betInfo(id);
    const n = b.n;
    switch (b.kind) {
      case 'pass':
        if (comeOut) {
          if (sum === 7 || sum === 11) win(id, a, a, true);
          else if (sum === 2 || sum === 3 || sum === 12) lose(id, a);
        } else if (sum === P) win(id, a, a, true);
        else if (sum === 7) lose(id, a);
        break;
      case 'dpass':
        if (comeOut) {
          if (sum === 2 || sum === 3) win(id, a, a, true);
          else if (sum === 12) push(id, a, true);
          else if (sum === 7 || sum === 11) lose(id, a);
        } else if (sum === 7) win(id, a, a, true);
        else if (sum === P) lose(id, a);
        break;
      case 'passOdds':
        if (comeOut) push(id, a, false);
        else if (sum === P) win(id, a, pay(a, TRUE_ODDS[P]), false);
        else if (sum === 7) lose(id, a);
        break;
      case 'dpassOdds':
        if (comeOut) push(id, a, false);
        else if (sum === 7) win(id, a, pay(a, LAY_ODDS[P]), false);
        else if (sum === P) lose(id, a);
        break;
      case 'come':
        if (sum === 7 || sum === 11) win(id, a, a, true);
        else if (sum === 2 || sum === 3 || sum === 12) lose(id, a);
        else out[id] = { kind: 'move', stake: a, to: `c${sum}` };
        break;
      case 'dcome':
        if (sum === 2 || sum === 3) win(id, a, a, true);
        else if (sum === 12) push(id, a, true);
        else if (sum === 7 || sum === 11) lose(id, a);
        else out[id] = { kind: 'move', stake: a, to: `dc${sum}` };
        break;
      case 'comePt':
        if (sum === n) win(id, a, a, false);
        else if (sum === 7) lose(id, a);
        break;
      case 'comeOdds':
        // off on the come-out roll: returned when its come point is decided
        if (sum === n) {
          if (comeOut) push(id, a, false);
          else win(id, a, pay(a, TRUE_ODDS[n]), false);
        } else if (sum === 7) {
          if (comeOut) push(id, a, false);
          else lose(id, a);
        }
        break;
      case 'dcPt':
        if (sum === 7) win(id, a, a, false);
        else if (sum === n) lose(id, a);
        break;
      case 'dcOdds':
        if (sum === 7) win(id, a, pay(a, LAY_ODDS[n]), false);
        else if (sum === n) lose(id, a);
        break;
      case 'place':
        if (comeOut && !rules.placeOnComeOut) break;
        if (sum === n) win(id, a, pay(a, PLACE_PAYS[n]), true);
        else if (sum === 7) lose(id, a);
        break;
      case 'field':
        if (FIELD_PAYS[sum]) win(id, a, a * FIELD_PAYS[sum], true);
        else lose(id, a);
        break;
      case 'big':
        if (sum === n) win(id, a, a, true);
        else if (sum === 7) lose(id, a);
        break;
      case 'hard':
        if (comeOut && !rules.hardOnComeOut) break;
        if (sum === n && hard) win(id, a, a * HARD_PAYS[n], true);
        else if (sum === 7 || sum === n) lose(id, a);
        break;
      case 'prop': {
        const hit = id === 'any7' ? sum === 7 : id === 'anyCraps' ? sum === 2 || sum === 3 || sum === 12 : sum === n;
        if (hit) win(id, a, a * PROP_PAYS[id], true);
        else lose(id, a);
        break;
      }
      case 'horn':
        // a quarter on each of 2, 3, 11, 12: the hit quarter is paid, the other three lose
        if (sum === 2 || sum === 12) win(id, a, Math.floor((a * 27) / 4), true);
        else if (sum === 3 || sum === 11) win(id, a, Math.floor((a * 12) / 4), true);
        else lose(id, a);
        break;
      case 'ce':
        // half on any craps (7:1), half on eleven (15:1); the other half loses
        if (sum === 2 || sum === 3 || sum === 12) win(id, a, Math.floor((a * 6) / 2), true);
        else if (sum === 11) win(id, a, Math.floor((a * 14) / 2), true);
        else lose(id, a);
        break;
    }
  }

  // next state
  const bets: Record<string, number> = {};
  for (const [id, a] of Object.entries(s.bets)) {
    if (!(a > 0)) continue;
    const o = out[id];
    if (!o || ((o.kind === 'win' || o.kind === 'push') && o.stays)) bets[id] = a;
  }
  for (const o of Object.values(out)) if (o.kind === 'move') bets[o.to] = (bets[o.to] ?? 0) + o.stake;

  let event: RollEvent;
  let point = P;
  if (comeOut) {
    if (sum === 7 || sum === 11) event = 'natural';
    else if (sum === 2 || sum === 3 || sum === 12) event = 'craps';
    else {
      event = 'pointSet';
      point = sum;
    }
  } else if (sum === P) {
    event = 'pointMade';
    point = 0;
  } else if (sum === 7) {
    event = 'sevenOut';
    point = 0;
  } else event = 'roll';

  const rolls = s.rolls + 1;
  const made = s.made + (event === 'pointMade' ? 1 : 0);
  const handOver = event === 'sevenOut' ? { rolls, made } : null;
  const next: CrapsState = { point, bets, rolls: handOver ? 0 : rolls, made: handOver ? 0 : made };

  let credit = 0;
  let won = 0;
  let lost = 0;
  let wager = 0;
  for (const o of Object.values(out)) {
    if (o.kind === 'win') {
      won += o.win;
      credit += o.win + (o.stays ? 0 : o.stake);
      wager += o.stake;
    } else if (o.kind === 'lose') {
      lost += o.stake;
      wager += o.stake;
    } else if (o.kind === 'push') {
      if (!o.stays) credit += o.stake;
      wager += o.stake;
    }
  }
  return { dice: [d1, d2], sum, hard, comeOut, pointBefore: P, pointAfter: point, event, outcomes: out, next, credit, won, lost, wager, handOver };
}

export const rollDice = (rng: Rng): [number, number] => [1 + rng(6), 1 + rng(6)];

// ---------------------------------------------------------------------------------------- betting

/** Largest amount a betting place can hold now (0: it can't be bet now). */
export function maxFor(s: CrapsState, id: string): number {
  const b = betInfo(id);
  const on = (k: string) => s.bets[k] ?? 0;
  switch (b.kind) {
    case 'pass':
    case 'dpass':
      return s.point === 0 ? LIMITS.line : on(id);
    case 'come':
    case 'dcome':
      return s.point !== 0 ? LIMITS.line : 0;
    case 'passOdds':
      return s.point !== 0 ? on('pass') * ODDS_MULT[s.point] : 0;
    case 'dpassOdds':
      return s.point !== 0 ? on('dpass') * LAY_MULT : 0;
    case 'comeOdds':
      return on(`c${b.n}`) * ODDS_MULT[b.n];
    case 'dcOdds':
      return on(`dc${b.n}`) * LAY_MULT;
    case 'comePt':
    case 'dcPt':
      return on(id);
    case 'place':
    case 'field':
    case 'big':
      return LIMITS.line;
    default:
      return LIMITS.prop;
  }
}

export type BetError = '' | 'lineComeOut' | 'comeNeedsPoint' | 'comeMoves' | 'noFlat' | 'max' | 'min';

/** Whether `add` more chips can go on a betting place now. */
export function canAdd(s: CrapsState, id: string, add: number): BetError {
  const b = betInfo(id);
  const cur = s.bets[id] ?? 0;
  if (b.kind === 'comePt' || b.kind === 'dcPt') return 'comeMoves';
  if ((b.kind === 'pass' || b.kind === 'dpass') && s.point !== 0) return 'lineComeOut';
  if ((b.kind === 'come' || b.kind === 'dcome') && s.point === 0) return 'comeNeedsPoint';
  if (isOdds(id) && !((s.bets[flatOf(id)!] ?? 0) > 0)) return 'noFlat';
  if (isOdds(id) && s.point === 0 && (b.kind === 'passOdds' || b.kind === 'dpassOdds')) return 'noFlat';
  if (cur + add > maxFor(s, id)) return 'max';
  return '';
}

/** Whether chips can be taken off a betting place now (contract bets can't). */
export function canTake(s: CrapsState, id: string): boolean {
  if (!((s.bets[id] ?? 0) > 0)) return false;
  const b = betInfo(id);
  if (b.kind === 'pass') return s.point === 0;
  if (b.kind === 'comePt') return false;
  // a flat bet comes down only after its odds
  const o = oddsOf(id);
  if (o && (s.bets[o] ?? 0) > 0) return false;
  return true;
}

/** Every bet that could be taken down now (odds first, so they can all come down in this order). */
export function removable(s: CrapsState): string[] {
  const ids = Object.keys(s.bets).filter((id) => (s.bets[id] ?? 0) > 0);
  const odds = ids.filter((id) => isOdds(id));
  const rest = ids.filter((id) => !isOdds(id));
  const out = odds.filter((id) => canTake(s, id));
  const after = cloneState(s);
  for (const id of out) delete after.bets[id];
  for (const id of rest) if (canTake(after, id)) out.push(id);
  return out;
}

/** Contract bets: the ones that stay when the player walks away. */
export const contractBets = (s: CrapsState) => Object.keys(s.bets).filter((id) => (s.bets[id] ?? 0) > 0 && !removable(s).includes(id));

/**
 * Chips that pay a whole number at this place: 5/9 odds pay 3:2 (even amounts), lays need 2, 3 or
 * 6, 6/8 place bets 6. With 5-unit chips the step is the least common multiple with 5.
 */
export function exactStep(id: string, point: number): number {
  const b = betInfo(id);
  const n = b.kind === 'passOdds' || b.kind === 'dpassOdds' ? point : b.n;
  let r: Ratio | null = null;
  if (b.kind === 'passOdds' || b.kind === 'comeOdds') r = TRUE_ODDS[n];
  else if (b.kind === 'dpassOdds' || b.kind === 'dcOdds') r = LAY_ODDS[n];
  else if (b.kind === 'place') r = PLACE_PAYS[n];
  else if (b.kind === 'horn') return lcm(4, LIMITS.min);
  else if (b.kind === 'ce') return lcm(2, LIMITS.min);
  return lcm(r ? r[1] : 1, LIMITS.min);
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number) => (a * b) / gcd(a, b);

/**
 * Full odds for every line and come bet that has room: odds id → chips to add, the largest
 * amount up to the 3-4-5× (or 6× lay) maximum that is paid exactly and fits in `budget`.
 */
export function fullOdds(s: CrapsState, budget = Infinity): Record<string, number> {
  const out: Record<string, number> = {};
  let left = budget;
  const flats = ['pass', ...POINTS.map((n) => `c${n}`), 'dpass', ...POINTS.map((n) => `dc${n}`)];
  for (const f of flats) {
    if (!((s.bets[f] ?? 0) > 0)) continue;
    const o = oddsOf(f)!;
    if (canAdd(s, o, LIMITS.min) !== '') continue;
    const room = maxFor(s, o) - (s.bets[o] ?? 0);
    const step = exactStep(o, s.point);
    const cur = s.bets[o] ?? 0;
    // the total on the odds should end on a multiple of the exact step
    let add = Math.floor((cur + Math.min(room, left)) / step) * step - cur;
    if (add <= 0) add = Math.floor(Math.min(room, left) / LIMITS.min) * LIMITS.min;
    if (add <= 0) continue;
    out[o] = add;
    left -= add;
  }
  return out;
}

export type RollError = '' | 'shooter' | 'horn' | 'ce';

/** Checks before the dice are thrown. */
export function validateRoll(s: CrapsState): RollError {
  if (s.point === 0 && !((s.bets.pass ?? 0) > 0) && !((s.bets.dpass ?? 0) > 0)) return 'shooter';
  if ((s.bets.horn ?? 0) % 4 !== 0) return 'horn';
  if ((s.bets.ce ?? 0) % 2 !== 0) return 'ce';
  return '';
}

export type Advice = { kind: 'pass' } | { kind: 'odds'; amount: number } | { kind: 'roll' };

/** The lowest-edge play: the Pass Line, then full odds behind it, then roll. */
export function advise(s: CrapsState, balance: number): Advice {
  const pass = s.bets.pass ?? 0;
  if (s.point === 0 && pass === 0 && !((s.bets.dpass ?? 0) > 0)) return { kind: 'pass' };
  if (s.point !== 0 && pass > 0) {
    const room = maxFor(s, 'passOdds') - (s.bets.passOdds ?? 0);
    if (room > 0 && balance >= LIMITS.min) {
      const add = fullOdds({ ...s, bets: Object.fromEntries(Object.entries(s.bets).filter(([k]) => k === 'pass' || k === 'passOdds')) }, balance).passOdds ?? 0;
      if (add > 0) return { kind: 'odds', amount: add };
    }
  }
  return { kind: 'roll' };
}
