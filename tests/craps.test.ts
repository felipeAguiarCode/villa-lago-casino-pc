import { describe, expect, it } from 'vitest';
import { seededRng } from '../src/core/rng';
import { AXES, CUBE_TURNS, FACE_AXIS, HALF, HZ, mulM, pipTurn, qRot, simulateThrow, topAxis, type Arena } from '../src/games/craps/diceSim';
import { areaOf, crapsLayout, DIM } from '../src/games/craps/layout';
import {
  advise,
  BET_IDS,
  betInfo,
  canAdd,
  canTake,
  contractBets,
  DEFAULT_RULES,
  exactStep,
  fullOdds,
  LAY_MULT,
  maxFor,
  newState,
  ODDS_MULT,
  POINTS,
  removable,
  resolveRoll,
  rollDice,
  totalOn,
  validateRoll,
  type CrapsState,
  type Outcome,
  type Rules,
} from '../src/games/craps/rules';

// ------------------------------------------------------------------------------- exact fractions
interface F {
  n: bigint;
  d: bigint;
}
const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
const fr = (n: bigint | number, d: bigint | number = 1n): F => {
  let N = BigInt(n);
  let D = BigInt(d);
  if (D < 0n) {
    N = -N;
    D = -D;
  }
  const g = gcd(N, D) || 1n;
  return { n: N / g, d: D / g };
};
const add = (a: F, b: F) => fr(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: F, b: F) => fr(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: F, b: F) => fr(a.n * b.n, a.d * b.d);
const div = (a: F, b: F) => fr(a.n * b.d, a.d * b.n);
const eq = (a: F, b: F) => a.n === b.n && a.d === b.d;
const num = (a: F) => Number(a.n) / Number(a.d);

const ret = (o: Outcome, stake: number) => (o.kind === 'win' ? stake + o.win : o.kind === 'push' ? stake : 0);

/**
 * Exact expected return of one bet, from the 36 dice combinations: a Markov chain over (point,
 * where the bet is) solved with rational Gaussian elimination. The bet's first decision (win, lose
 * or push) ends it; a come bet that travels keeps going as its come point.
 */
function exactReturn(point: number, id: string, stake: number, rules: Rules = DEFAULT_RULES): F {
  const keys = new Map<string, number>();
  const states: [number, string][] = [];
  const visit = (p: number, b: string) => {
    const k = `${p}|${b}`;
    if (!keys.has(k)) {
      keys.set(k, states.length);
      states.push([p, b]);
    }
    return keys.get(k)!;
  };
  visit(point, id);
  const rows: Map<number, F>[] = [];
  const rhs: F[] = [];
  const P = fr(1, 36);
  for (let i = 0; i < states.length; i++) {
    const [p, b] = states[i];
    const row = new Map<number, F>([[i, fr(1)]]);
    let r = fr(0);
    for (let d1 = 1; d1 <= 6; d1++)
      for (let d2 = 1; d2 <= 6; d2++) {
        const res = resolveRoll({ point: p, bets: { [b]: stake }, rolls: 0, made: 0 }, d1, d2, rules);
        const o = res.outcomes[b];
        if (!o || o.kind === 'move') {
          const j = visit(res.pointAfter, o ? (o as { to: string }).to : b);
          row.set(j, sub(row.get(j) ?? fr(0), P));
        } else r = add(r, mul(P, fr(ret(o, stake))));
      }
    rows.push(row);
    rhs.push(r);
  }
  // dense Gaussian elimination over the rationals
  const n = states.length;
  const A: F[][] = rows.map((row) => Array.from({ length: n }, (_, j) => row.get(j) ?? fr(0)));
  const B = rhs.slice();
  for (let c = 0; c < n; c++) {
    let piv = c;
    while (A[piv][c].n === 0n) piv++;
    [A[c], A[piv]] = [A[piv], A[c]];
    [B[c], B[piv]] = [B[piv], B[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || A[r][c].n === 0n) continue;
      const k = div(A[r][c], A[c][c]);
      for (let j = c; j < n; j++) A[r][j] = sub(A[r][j], mul(k, A[c][j]));
      B[r] = sub(B[r], mul(k, B[c]));
    }
  }
  return div(B[0], A[0][0]);
}

/** House edge (1 − return / stake) as an exact fraction. */
const edge = (point: number, id: string, stake: number, rules?: Rules) => sub(fr(1), div(exactReturn(point, id, stake, rules), fr(stake)));

const S = (point: number, bets: Record<string, number>): CrapsState => ({ point, bets, rolls: 0, made: 0 });

// ------------------------------------------------------------------------------- house edges
describe('Craps house edge (exact, from the 36 dice combinations)', () => {
  it('line bets: Pass and Come 1.41% (7/495), Don\'t Pass and Don\'t Come 1.36% (3/220)', () => {
    expect(eq(edge(0, 'pass', 10), fr(7, 495))).toBe(true);
    expect(eq(edge(0, 'dpass', 10), fr(3, 220))).toBe(true);
    for (const p of POINTS) {
      expect(eq(edge(p, 'come', 10), fr(7, 495))).toBe(true);
      expect(eq(edge(p, 'dcome', 10), fr(3, 220))).toBe(true);
    }
    expect(num(edge(0, 'pass', 10)) * 100).toBeCloseTo(1.414, 3);
    expect(num(edge(0, 'dpass', 10)) * 100).toBeCloseTo(1.364, 3);
  });

  it('odds have no house edge, taken or laid, on every number (come odds too)', () => {
    for (const p of POINTS) {
      expect(edge(p, 'passOdds', 30).n, `odds ${p}`).toBe(0n);
      expect(edge(p, 'dpassOdds', 30).n, `lay ${p}`).toBe(0n);
      expect(edge(p === 6 ? 8 : 6, `co${p}`, 30).n, `come odds ${p}`).toBe(0n);
      expect(edge(0, `co${p}`, 30).n, `come odds ${p} from a come-out`).toBe(0n);
      expect(edge(0, `dco${p}`, 30).n, `don't come odds ${p}`).toBe(0n);
    }
  });

  it('place bets: 6/8 1.52%, 5/9 4%, 4/10 6.67% (off on the come-out)', () => {
    expect(eq(edge(0, 'place6', 30), fr(1, 66))).toBe(true);
    expect(eq(edge(0, 'place8', 30), fr(1, 66))).toBe(true);
    expect(eq(edge(0, 'place5', 25), fr(1, 25))).toBe(true);
    expect(eq(edge(4, 'place9', 25), fr(1, 25))).toBe(true);
    expect(eq(edge(0, 'place4', 25), fr(1, 15))).toBe(true);
    expect(eq(edge(9, 'place10', 25), fr(1, 15))).toBe(true);
    expect(num(edge(0, 'place6', 30)) * 100).toBeCloseTo(1.515, 3);
    // working on the come-out changes nothing for the edge per decision
    expect(eq(edge(0, 'place6', 30, { placeOnComeOut: true, hardOnComeOut: false }), fr(1, 66))).toBe(true);
  });

  it('field 2.78% (2 pays double, 12 triple), Big 6/8 9.09%', () => {
    expect(eq(edge(0, 'field', 10), fr(1, 36))).toBe(true);
    expect(eq(edge(6, 'field', 10), fr(1, 36))).toBe(true);
    expect(eq(edge(0, 'big6', 10), fr(1, 11))).toBe(true);
    expect(eq(edge(5, 'big8', 10), fr(1, 11))).toBe(true);
  });

  it('hardways: 6/8 9.09%, 4/10 11.11%', () => {
    expect(eq(edge(0, 'hard6', 10), fr(1, 11))).toBe(true);
    expect(eq(edge(0, 'hard8', 10), fr(1, 11))).toBe(true);
    expect(eq(edge(0, 'hard4', 10), fr(1, 9))).toBe(true);
    expect(eq(edge(5, 'hard10', 10), fr(1, 9))).toBe(true);
  });

  it('one-roll propositions: Any 7 16.67%, Any Craps 11.11%, 2/12 13.89%, 3/11 11.11%, Horn 12.5%, C&E 11.11%', () => {
    expect(eq(edge(0, 'any7', 10), fr(1, 6))).toBe(true);
    expect(eq(edge(0, 'anyCraps', 10), fr(1, 9))).toBe(true);
    expect(eq(edge(0, 'p2', 10), fr(5, 36))).toBe(true);
    expect(eq(edge(0, 'p12', 10), fr(5, 36))).toBe(true);
    expect(eq(edge(0, 'p3', 10), fr(1, 9))).toBe(true);
    expect(eq(edge(8, 'p11', 10), fr(1, 9))).toBe(true);
    expect(eq(edge(0, 'horn', 20), fr(1, 8))).toBe(true);
    expect(eq(edge(0, 'ce', 10), fr(1, 9))).toBe(true);
    expect(num(edge(0, 'any7', 10)) * 100).toBeCloseTo(16.667, 3);
  });

  it('Pass Line with full 3-4-5× odds: 0.374% of everything bet', () => {
    // the expected odds bet behind a 1-unit pass line is Σ P(point) × multiple
    let odds = fr(0);
    for (const p of POINTS) {
      const ways = 6 - Math.abs(7 - p);
      odds = add(odds, mul(fr(ways, 36), fr(ODDS_MULT[p])));
    }
    const combined = div(edge(0, 'pass', 10), add(fr(1), odds));
    expect(eq(odds, fr(25, 9))).toBe(true);
    expect(num(combined) * 100).toBeCloseTo(0.374, 3);
  });
});

// ------------------------------------------------------------------------------- rolls
describe('Craps rolls', () => {
  it('come-out: 7 wins the front line, don\'t pass loses, the field loses, any 7 pays 4:1', () => {
    const r = resolveRoll(S(0, { pass: 10, dpass: 10, field: 10, any7: 10 }), 3, 4);
    expect(r.event).toBe('natural');
    expect(r.outcomes.pass).toEqual({ kind: 'win', stake: 10, win: 10, stays: true });
    expect(r.outcomes.dpass.kind).toBe('lose');
    expect(r.outcomes.field.kind).toBe('lose');
    expect(r.outcomes.any7).toEqual({ kind: 'win', stake: 10, win: 40, stays: true });
    expect(r.next.bets).toEqual({ pass: 10, any7: 10 });
    expect(r.next.point).toBe(0);
  });

  it('come-out 12: pass loses, don\'t pass is barred (push, stays), field pays 3:1, boxcars 30:1, horn pays', () => {
    const r = resolveRoll(S(0, { pass: 10, dpass: 10, field: 10, p12: 10, horn: 20, ce: 10, anyCraps: 10 }), 6, 6);
    expect(r.event).toBe('craps');
    expect(r.outcomes.pass.kind).toBe('lose');
    expect(r.outcomes.dpass).toEqual({ kind: 'push', stake: 10, stays: true });
    expect(r.outcomes.field).toEqual({ kind: 'win', stake: 10, win: 30, stays: true });
    expect(r.outcomes.p12).toEqual({ kind: 'win', stake: 10, win: 300, stays: true });
    expect(r.outcomes.horn).toEqual({ kind: 'win', stake: 20, win: 135, stays: true });
    expect(r.outcomes.ce).toEqual({ kind: 'win', stake: 10, win: 30, stays: true });
    expect(r.outcomes.anyCraps).toEqual({ kind: 'win', stake: 10, win: 70, stays: true });
    expect(r.next.bets.dpass).toBe(10);
    const two = resolveRoll(S(0, { field: 10, dpass: 10 }), 1, 1);
    expect(two.outcomes.field).toEqual({ kind: 'win', stake: 10, win: 20, stays: true });
    expect(two.outcomes.dpass.kind).toBe('win');
  });

  it('eleven: yo pays the pass line, C&E 7:1, horn 3:1 on the whole', () => {
    const r = resolveRoll(S(0, { pass: 10, ce: 10, horn: 20, p11: 10 }), 5, 6);
    expect(r.outcomes.pass.kind).toBe('win');
    expect(r.outcomes.ce).toEqual({ kind: 'win', stake: 10, win: 70, stays: true });
    expect(r.outcomes.horn).toEqual({ kind: 'win', stake: 20, win: 60, stays: true });
    expect(r.outcomes.p11).toEqual({ kind: 'win', stake: 10, win: 150, stays: true });
  });

  it('a point is set; place bets and hardways are off on the come-out', () => {
    const r = resolveRoll(S(0, { pass: 10, place6: 30, place8: 30, hard6: 10 }), 3, 3);
    expect(r.event).toBe('pointSet');
    expect(r.pointAfter).toBe(6);
    expect(r.outcomes).toEqual({});
    expect(r.next.bets).toEqual({ pass: 10, place6: 30, place8: 30, hard6: 10 });
    const seven = resolveRoll(S(0, { pass: 10, place6: 30, hard8: 10 }), 2, 5);
    expect(seven.outcomes.place6).toBeUndefined();
    expect(seven.outcomes.hard8).toBeUndefined();
    const on = resolveRoll(S(0, { place6: 30 }), 1, 5, { placeOnComeOut: true, hardOnComeOut: false });
    expect(on.outcomes.place6).toEqual({ kind: 'win', stake: 30, win: 35, stays: true });
  });

  it('the point made the hard way: pass, odds 6:5, place 7:6 (stays), hard 6 9:1, big 6', () => {
    const r = resolveRoll(S(6, { pass: 10, passOdds: 50, place6: 30, hard6: 10, big6: 10, dpass: 10, dpassOdds: 60 }), 3, 3);
    expect(r.event).toBe('pointMade');
    expect(r.next.point).toBe(0);
    expect(r.next.made).toBe(1);
    expect(r.outcomes.pass).toEqual({ kind: 'win', stake: 10, win: 10, stays: true });
    expect(r.outcomes.passOdds).toEqual({ kind: 'win', stake: 50, win: 60, stays: false });
    expect(r.outcomes.place6).toEqual({ kind: 'win', stake: 30, win: 35, stays: true });
    expect(r.outcomes.hard6).toEqual({ kind: 'win', stake: 10, win: 90, stays: true });
    expect(r.outcomes.big6).toEqual({ kind: 'win', stake: 10, win: 10, stays: true });
    expect(r.outcomes.dpass.kind).toBe('lose');
    expect(r.outcomes.dpassOdds.kind).toBe('lose');
    expect(r.next.bets).toEqual({ pass: 10, place6: 30, hard6: 10, big6: 10 });
  });

  it('an easy six takes the hard six', () => {
    const r = resolveRoll(S(8, { hard6: 10, place6: 30 }), 2, 4);
    expect(r.outcomes.hard6.kind).toBe('lose');
    expect(r.outcomes.place6.kind).toBe('win');
  });

  it('seven out: line, odds, place, come points lose; the don\'t side wins; the hand is over', () => {
    const st: CrapsState = { point: 9, bets: { pass: 10, passOdds: 40, c5: 10, co5: 40, place8: 30, dpass: 10, dpassOdds: 60, dc4: 10, dco4: 60 }, rolls: 11, made: 2 };
    const r = resolveRoll(st, 5, 2);
    expect(r.event).toBe('sevenOut');
    for (const id of ['pass', 'passOdds', 'c5', 'co5', 'place8']) expect(r.outcomes[id].kind, id).toBe('lose');
    expect(r.outcomes.dpass).toEqual({ kind: 'win', stake: 10, win: 10, stays: true });
    expect(r.outcomes.dpassOdds).toEqual({ kind: 'win', stake: 60, win: 40, stays: false });
    expect(r.outcomes.dc4).toEqual({ kind: 'win', stake: 10, win: 10, stays: false });
    expect(r.outcomes.dco4).toEqual({ kind: 'win', stake: 60, win: 30, stays: false });
    expect(r.handOver).toEqual({ rolls: 12, made: 2 });
    expect(r.next).toEqual({ point: 0, bets: { dpass: 10 }, rolls: 0, made: 0 });
  });

  it('come bets travel to their number; the old come point there is paid as the new one moves in', () => {
    const a = resolveRoll(S(6, { come: 10, dcome: 10 }), 1, 4);
    expect(a.outcomes.come).toEqual({ kind: 'move', stake: 10, to: 'c5' });
    expect(a.outcomes.dcome).toEqual({ kind: 'move', stake: 10, to: 'dc5' });
    expect(a.next.bets).toEqual({ c5: 10, dc5: 10 });
    const b = resolveRoll(S(6, { c5: 10, co5: 40, come: 25 }), 2, 3);
    expect(b.outcomes.c5).toEqual({ kind: 'win', stake: 10, win: 10, stays: false });
    expect(b.outcomes.co5).toEqual({ kind: 'win', stake: 40, win: 60, stays: false });
    expect(b.next.bets).toEqual({ c5: 25 });
    const c = resolveRoll(S(6, { come: 10, dcome: 10 }), 6, 6);
    expect(c.outcomes.come.kind).toBe('lose');
    expect(c.outcomes.dcome).toEqual({ kind: 'push', stake: 10, stays: true });
  });

  it('come odds are off on the come-out (returned); don\'t come lay odds work', () => {
    const seven = resolveRoll(S(0, { pass: 10, c8: 10, co8: 50, dc9: 10, dco9: 60 }), 4, 3);
    expect(seven.outcomes.c8.kind).toBe('lose');
    expect(seven.outcomes.co8).toEqual({ kind: 'push', stake: 50, stays: false });
    expect(seven.outcomes.dc9.kind).toBe('win');
    expect(seven.outcomes.dco9).toEqual({ kind: 'win', stake: 60, win: 40, stays: false });
    const eight = resolveRoll(S(0, { pass: 10, c8: 10, co8: 50 }), 5, 3);
    expect(eight.outcomes.c8).toEqual({ kind: 'win', stake: 10, win: 10, stays: false });
    expect(eight.outcomes.co8).toEqual({ kind: 'push', stake: 50, stays: false });
    expect(eight.credit).toBe(70);
  });

  it('pays whole chips: fractional payouts round down', () => {
    expect(resolveRoll(S(4, { place6: 25 }), 1, 5).outcomes.place6).toMatchObject({ win: 29 });
    expect(resolveRoll(S(5, { passOdds: 25 }), 1, 4).outcomes.passOdds).toMatchObject({ win: 37 });
    expect(resolveRoll(S(8, { dpassOdds: 25 }), 1, 6).outcomes.dpassOdds).toMatchObject({ win: 20 });
    expect(resolveRoll(S(9, { dpassOdds: 25 }), 1, 6).outcomes.dpassOdds).toMatchObject({ win: 16 });
    expect(resolveRoll(S(4, { dpassOdds: 25 }), 1, 6).outcomes.dpassOdds).toMatchObject({ win: 12 });
    expect(resolveRoll(S(4, { place5: 5 }), 1, 4).outcomes.place5).toMatchObject({ win: 7 });
    expect(resolveRoll(S(4, { place10: 5 }), 5, 5).outcomes.place10).toMatchObject({ win: 9 });
    // exact steps with 5-unit chips
    expect(exactStep('place6', 0)).toBe(30);
    expect(exactStep('place5', 0)).toBe(5);
    expect(exactStep('passOdds', 5)).toBe(10);
    expect(exactStep('passOdds', 6)).toBe(5);
    expect(exactStep('dpassOdds', 4)).toBe(10);
    expect(exactStep('dpassOdds', 9)).toBe(15);
    expect(exactStep('dco8', 0)).toBe(30);
    expect(exactStep('horn', 0)).toBe(20);
    expect(exactStep('ce', 0)).toBe(10);
  });
});

// ------------------------------------------------------------------------------- betting rules
describe('Craps betting', () => {
  it('line bets on the come-out, come bets with a point, odds up to 3-4-5× (lay 6×)', () => {
    expect(canAdd(S(0, {}), 'pass', 25)).toBe('');
    expect(canAdd(S(6, {}), 'pass', 25)).toBe('lineComeOut');
    expect(canAdd(S(6, {}), 'dpass', 25)).toBe('lineComeOut');
    expect(canAdd(S(0, {}), 'come', 25)).toBe('comeNeedsPoint');
    expect(canAdd(S(5, {}), 'come', 25)).toBe('');
    expect(canAdd(S(5, {}), 'c5', 25)).toBe('comeMoves');
    expect(canAdd(S(5, {}), 'passOdds', 5)).toBe('noFlat');
    expect(canAdd(S(0, { pass: 10 }), 'passOdds', 5)).toBe('noFlat');
    for (const p of POINTS) {
      const st = S(p, { pass: 10, dpass: 10 });
      expect(maxFor(st, 'passOdds')).toBe(10 * ODDS_MULT[p]);
      expect(canAdd(st, 'passOdds', 10 * ODDS_MULT[p])).toBe('');
      expect(canAdd(st, 'passOdds', 10 * ODDS_MULT[p] + 5)).toBe('max');
      expect(maxFor(st, 'dpassOdds')).toBe(10 * LAY_MULT);
      // full odds always win 6× the line bet; full lays win 3×, 4× or 5× it
      expect(resolveRoll(S(p, { passOdds: 10 * ODDS_MULT[p] }), p - 1 > 6 ? 6 : 1, p - (p - 1 > 6 ? 6 : 1)).outcomes.passOdds).toMatchObject({ win: 60 });
      expect(resolveRoll(S(p, { dpassOdds: 60 }), 3, 4).outcomes.dpassOdds).toMatchObject({ win: 10 * ODDS_MULT[p] });
    }
    expect(maxFor(S(5, { c8: 25 }), 'co8')).toBe(125);
    expect(maxFor(S(5, { dc4: 25 }), 'dco4')).toBe(150);
    expect(canAdd(S(0, {}), 'any7', 500)).toBe('');
    expect(canAdd(S(0, {}), 'any7', 505)).toBe('max');
    expect(canAdd(S(0, {}), 'field', 2000)).toBe('');
    expect(canAdd(S(0, {}), 'field', 2005)).toBe('max');
  });

  it('pass and come points are contract bets; don\'t bets, odds and the rest come down (odds first)', () => {
    expect(canTake(S(0, { pass: 10 }), 'pass')).toBe(true);
    expect(canTake(S(6, { pass: 10 }), 'pass')).toBe(false);
    expect(canTake(S(6, { c8: 10 }), 'c8')).toBe(false);
    expect(canTake(S(6, { dpass: 10 }), 'dpass')).toBe(true);
    expect(canTake(S(6, { dpass: 10, dpassOdds: 60 }), 'dpass')).toBe(false);
    expect(canTake(S(6, { dpass: 10, dpassOdds: 60 }), 'dpassOdds')).toBe(true);
    expect(canTake(S(6, { pass: 10, passOdds: 50 }), 'passOdds')).toBe(true);
    expect(canTake(S(6, { place8: 30 }), 'place8')).toBe(true);
    const st = S(6, { pass: 10, passOdds: 50, c8: 10, co8: 50, dpass: 10, dpassOdds: 60, place5: 25, field: 5 });
    expect(new Set(removable(st))).toEqual(new Set(['passOdds', 'co8', 'dpassOdds', 'dpass', 'place5', 'field']));
    expect(removable(st).indexOf('dpassOdds')).toBeLessThan(removable(st).indexOf('dpass'));
    expect(new Set(contractBets(st))).toEqual(new Set(['pass', 'c8']));
  });

  it('the shooter needs a line bet on the come-out; horn in fours, C&E in twos', () => {
    expect(validateRoll(S(0, {}))).toBe('shooter');
    expect(validateRoll(S(0, { field: 10 }))).toBe('shooter');
    expect(validateRoll(S(0, { dpass: 10 }))).toBe('');
    expect(validateRoll(S(6, {}))).toBe('');
    expect(validateRoll(S(0, { pass: 10, horn: 25 }))).toBe('horn');
    expect(validateRoll(S(0, { pass: 10, horn: 20 }))).toBe('');
    expect(validateRoll(S(0, { pass: 10, ce: 15 }))).toBe('ce');
  });

  it('full odds are exact, fit the bankroll, and cover come points and lays', () => {
    expect(fullOdds(S(5, { pass: 25 }))).toEqual({ passOdds: 100 });
    expect(fullOdds(S(9, { pass: 15 }))).toEqual({ passOdds: 60 });
    expect(fullOdds(S(4, { pass: 25 }))).toEqual({ passOdds: 75 });
    expect(fullOdds(S(6, { pass: 25, passOdds: 25 }))).toEqual({ passOdds: 100 });
    expect(fullOdds(S(6, { dpass: 25 }))).toEqual({ dpassOdds: 150 });
    expect(fullOdds(S(6, { pass: 10, c5: 10, dc9: 10 }))).toEqual({ passOdds: 50, co5: 40, dco9: 60 });
    // a short bankroll: the most that is still paid in full
    expect(fullOdds(S(5, { pass: 25 }), 75)).toEqual({ passOdds: 70 });
    expect(fullOdds(S(0, { pass: 25 }))).toEqual({});
  });

  it('the hint: Pass Line, then full odds, then roll', () => {
    expect(advise(S(0, {}), 1000)).toEqual({ kind: 'pass' });
    expect(advise(S(0, { pass: 25 }), 1000)).toEqual({ kind: 'roll' });
    expect(advise(S(8, { pass: 25 }), 1000)).toEqual({ kind: 'odds', amount: 125 });
    expect(advise(S(8, { pass: 25, passOdds: 125 }), 1000)).toEqual({ kind: 'roll' });
    expect(advise(S(5, { pass: 25 }), 30)).toEqual({ kind: 'odds', amount: 30 });
  });
});

// ------------------------------------------------------------------------------- money
describe('Craps money', () => {
  it('keeps every chip: random play with a seeded rng balances to the chip', () => {
    const rng = seededRng(20261126);
    let st = { ...newState() };
    let rack = 100_000;
    let net = 0;
    const flats = BET_IDS.filter((id) => !['comePt', 'dcPt'].includes(betInfo(id).kind));
    for (let r = 0; r < 20_000; r++) {
      for (let k = 0; k < 3; k++) {
        const id = flats[rng(flats.length)];
        const amt = 5 * (1 + rng(8));
        if (canAdd(st, id, amt) === '' && rack >= amt) {
          rack -= amt;
          st.bets[id] = (st.bets[id] ?? 0) + amt;
        }
      }
      if (rng(6) === 0)
        for (const id of removable(st))
          if (rng(3) === 0 && canTake(st, id)) {
            rack += st.bets[id];
            delete st.bets[id];
          }
      for (const id of ['horn', 'ce'])
        if (validateRoll(st) === id) {
          rack += st.bets[id];
          delete st.bets[id];
        }
      if (validateRoll(st) === 'shooter') {
        rack -= 5;
        st.bets.pass = 5;
      }
      const before = totalOn(st);
      const [d1, d2] = rollDice(rng);
      const res = resolveRoll(st, d1, d2);
      let returned = 0;
      for (const o of Object.values(res.outcomes)) if ((o.kind === 'win' || o.kind === 'push') && !o.stays) returned += o.stake;
      expect(totalOn(res.next)).toBe(before - returned - res.lost);
      expect(res.credit).toBe(res.won + returned);
      for (const v of [res.credit, res.won, res.lost, ...Object.values(res.next.bets)]) expect(Number.isInteger(v)).toBe(true);
      rack += res.credit;
      net += res.won - res.lost;
      st = res.next;
      expect(rack + totalOn(st)).toBe(100_000 + net);
      // odds never outgrow their line bet
      for (const id of Object.keys(st.bets)) if (betInfo(id).kind.endsWith('Odds')) expect(st.bets[id]).toBeLessThanOrEqual(LAY_MULT * 2000);
    }
  });

  it('seeded simulation agrees with the exact edges (Pass Line, Field)', () => {
    const rng = seededRng(7);
    let st = { ...newState() };
    let passBet = 0;
    let passBack = 0;
    let fieldBet = 0;
    let fieldBack = 0;
    for (let r = 0; r < 400_000; r++) {
      if (st.point === 0 && !st.bets.pass) st.bets.pass = 10;
      st.bets.field = 10;
      const [d1, d2] = rollDice(rng);
      const res = resolveRoll(st, d1, d2);
      const p = res.outcomes.pass;
      if (p && p.kind !== 'move') {
        passBet += 10;
        passBack += ret(p, 10);
      }
      fieldBet += 10;
      fieldBack += ret(res.outcomes.field, 10);
      st = res.next;
    }
    const passEdge = 1 - passBack / passBet;
    const fieldEdge = 1 - fieldBack / fieldBet;
    expect(Math.abs(passEdge - 7 / 495)).toBeLessThan(0.01);
    expect(Math.abs(fieldEdge - 1 / 36)).toBeLessThan(0.006);
  });

  it('every bet id is known to the engine and the layout', () => {
    const L = crapsLayout(0, 0);
    for (const id of BET_IDS) {
      expect(() => betInfo(id)).not.toThrow();
      expect(L.piles.has(id), `pile ${id}`).toBe(true);
      expect(L.areas.has(areaOf(id)), `area ${id}`).toBe(true);
    }
  });
});

// ------------------------------------------------------------------------------- layout and dice
describe('Craps table and dice', () => {
  const L = crapsLayout(0, 0);
  const arena: Arena = {
    xMin: L.walls.xL + DIM.PYR,
    xMax: L.walls.xR - DIM.PYR,
    zWall: L.walls.zW + DIM.PYR,
    wallH: DIM.WALL_H,
    landing: L.landing,
    xBank: L.bank.x - L.bank.w / 2,
  };

  it('lays out a rigid table: betting areas tile without overlapping; chips sit in their areas', () => {
    const rects = [...L.areas.entries()].flatMap(([id, rs]) => rs.map((r) => ({ id, r })));
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].r;
        const b = rects[j].r;
        const ox = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
        const oz = Math.min(a.z + a.h / 2, b.z + b.h / 2) - Math.max(a.z - a.h / 2, b.z - b.h / 2);
        expect(ox > 1e-6 && oz > 1e-6, `${rects[i].id} / ${rects[j].id}`).toBe(false);
      }
    for (const [id, p] of L.piles) {
      const inside = L.areas.get(areaOf(id))!.some((r) => Math.abs(p.x - r.x) <= r.w / 2 + 1e-9 && Math.abs(p.z - r.z) <= r.h / 2 + 1e-9);
      expect(inside, id).toBe(true);
    }
    expect(L.landing.z1).toBeLessThan(L.main.z0);
    expect(L.landing.z0).toBeGreaterThan(L.walls.zW);
    expect(L.home.z).toBeGreaterThan(L.center.z1);
    expect(L.extent.x1 - L.extent.x0).toBeLessThan(12.1);
    expect(L.extent.z1 - L.extent.z0).toBeLessThan(7.1);
  });

  it('casino dice: opposite faces add to 7 and 1-2-3 run counter-clockwise', () => {
    const v = (n: number) => AXES[FACE_AXIS[n]];
    for (let n = 1; n <= 6; n++) {
      const a = v(n);
      const b = v(7 - n);
      expect(a.x + b.x + a.y + b.y + a.z + b.z).toBe(0);
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)).toBe(2);
    }
    const c = (p: typeof AXES[0], q: typeof AXES[0]) => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x });
    const k = c(v(1), v(2));
    expect(k.x * v(3).x + k.y * v(3).y + k.z * v(3).z).toBe(1);
  });

  it('the 24 cube turns put any number on any face, four ways each', () => {
    expect(CUBE_TURNS.length).toBe(24);
    expect(new Set(CUBE_TURNS.map((m) => m.join(','))).size).toBe(24);
    for (let axis = 0; axis < 6; axis++)
      for (let val = 1; val <= 6; val++) {
        const seen = new Set<string>();
        for (let pick = 0; pick < 4; pick++) {
          const m = pipTurn(axis, val, pick);
          seen.add(m.join(','));
          const top = mulM(m, AXES[FACE_AXIS[val]]);
          expect(top).toEqual(AXES[axis]);
          // the opposite number ends at the bottom
          const bottom = mulM(m, AXES[FACE_AXIS[7 - val]]);
          expect(bottom).toEqual({ x: -AXES[axis].x || 0, y: -AXES[axis].y || 0, z: -AXES[axis].z || 0 });
        }
        expect(seen.size).toBe(4);
      }
  });

  it('simulated throws hit the back wall and come to rest flat, apart, in the landing band', () => {
    const r = seededRng(99);
    const rand = () => r(1_000_000) / 1_000_000;
    let ok = 0;
    for (let i = 0; i < 24; i++) {
      const sim = simulateThrow(arena, { hand: { x: L.home.x - 0.3, y: 0.55, z: L.home.z - 0.35 }, power: rand() }, rand);
      if (!sim.ok) continue;
      ok++;
      expect(sim.duration).toBeGreaterThan(0.7);
      expect(sim.duration).toBeLessThan(4.6);
      expect(sim.wallHits[0]).toBeGreaterThan(0);
      expect(sim.wallHits[1]).toBeGreaterThan(0);
      expect(Math.hypot(sim.rest[0].x - sim.rest[1].x, sim.rest[0].z - sim.rest[1].z)).toBeGreaterThanOrEqual(0.3);
      for (const d of [0, 1]) {
        const f = sim.frames[d];
        const n = f.length / 7;
        expect(n).toBe(Math.round(sim.duration * HZ));
        const last = (n - 1) * 7;
        const q = { x: f[last + 3], y: f[last + 4], z: f[last + 5], w: f[last + 6] };
        expect(f[last + 1]).toBeCloseTo(HALF, 3);
        // exactly flat, and the face read is the one on top
        expect(qRot(q, AXES[topAxis(q)]).y).toBeGreaterThan(0.99999);
        expect(topAxis(q)).toBe(sim.top[d]);
        const p = sim.rest[d];
        expect(p.x).toBeGreaterThanOrEqual(L.landing.x0);
        expect(p.x).toBeLessThanOrEqual(L.landing.x1);
        expect(p.z).toBeGreaterThanOrEqual(L.landing.z0);
        expect(p.z).toBeLessThanOrEqual(L.landing.z1);
      }
      expect(sim.events.some((e) => e.kind === 'wall')).toBe(true);
      expect(sim.events.some((e) => e.kind === 'felt')).toBe(true);
    }
    expect(ok).toBeGreaterThanOrEqual(22);
  });

  it('a flick aimed by the player still lands in the band', () => {
    const r = seededRng(5);
    const rand = () => r(1_000_000) / 1_000_000;
    for (const aimX of [L.landing.x0 + 0.5, 0, L.landing.x1 - 0.4]) {
      const sim = simulateThrow(arena, { hand: { x: 0.5, y: 0.5, z: L.main.z0 + 2.5 }, aim: { x: aimX, z: L.walls.zW + 0.6 }, power: 0.8 }, rand);
      expect(sim.ok).toBe(true);
    }
  });
});

// ------------------------------------------------------------------------------- build smoke test
describe('Craps table builds (canvas stubbed)', () => {
  it('draws the felt print and builds the tub, the puck and the dice without errors', async () => {
    const calls = new Map<string, number>();
    const ctx: Record<string | symbol, unknown> = {};
    const g = new Proxy(ctx, {
      get: (tg, k) => {
        if (k in tg) return tg[k];
        if (k === 'measureText') return (s: string) => ({ width: String(s).length * 10 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
        return (...args: unknown[]) => {
          calls.set(String(k), (calls.get(String(k)) ?? 0) + 1);
          void args;
        };
      },
      set: (tg, k, v) => {
        tg[k] = v;
        return true;
      },
    });
    const fakeCanvas = () => ({ width: 1, height: 1, style: {}, dataset: {}, getContext: () => g, toDataURL: () => '' });
    const { vi } = await import('vitest');
    vi.stubGlobal('document', { createElement: () => fakeCanvas() });
    try {
      const L = crapsLayout(0, 0);
      const { crapsPrint, puckFace } = await import('../src/games/craps/print');
      const texts = {
        pass: 'PASS LINE',
        dontPass: "DON'T PASS BAR",
        dontCome: ["DON'T", 'COME', 'BAR'],
        come: 'COME',
        field: 'FIELD',
        big: 'BIG',
        place: 'PLACE',
        dcLay: 'LAY',
        pays: (a: number, b: number) => `${a} TO ${b}`,
        payDouble: 'PAYS DOUBLE',
        payTriple: 'PAYS TRIPLE',
        seven: 'SEVEN',
        anyCraps: 'ANY CRAPS',
        horn: 'HORN',
        hornSub: '2 3 11 12',
        ce: 'C & E',
        house: 'VILLA LAGO',
        title: 'CRAPS',
        wall: 'DICE MUST HIT THE BACK WALL',
        shooter: 'SHOOTER',
        numberNames: { 4: '4', 5: '5', 6: 'SIX', 8: '8', 9: 'NINE', 10: '10' },
      };
      const cv = crapsPrint(L, texts) as unknown as { width: number; height: number };
      expect(cv.width).toBe(Math.round((L.print.x1 - L.print.x0) * 200));
      expect(cv.height).toBe(Math.round((L.print.z1 - L.print.z0) * 200));
      expect(calls.get('fillText')).toBeGreaterThan(60);
      expect(calls.get('roundRect')).toBeGreaterThan(20);
      puckFace(true, 'ON');
      const { ChipSet } = await import('../src/table/chips');
      const { CrapsTable3D } = await import('../src/games/craps/table3d');
      const { Dice3D } = await import('../src/games/craps/dice3d');
      const t3 = new CrapsTable3D(L, null, new ChipSet(), { on: 'ON', off: 'OFF' });
      expect(t3.group.children.length).toBeGreaterThan(8);
      t3.puck.place(L.puckOff);
      t3.puck.setOn(true);
      const dice = new Dice3D(null, t3.shadowTex);
      dice.setPipTurn(0, pipTurn(2, 5, 1));
      dice.setPose(0, { x: 0, y: HALF, z: -2 }, { x: 0, y: 0, z: 0, w: 1 });
      expect(dice.bodyP(0)).toEqual({ x: 0, y: HALF, z: -2 });
      // the pips: 21 discs
      const pipMesh = dice.dice[0].inner.children[1] as unknown as { geometry: { attributes: { position: { count: number } } } };
      expect(pipMesh.geometry.attributes.position.count).toBe(21 * 24);
      dice.dispose();
      t3.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
