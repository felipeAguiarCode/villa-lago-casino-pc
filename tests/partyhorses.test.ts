import { describe, expect, it } from 'vitest';
import { seededRng, type Rng } from '../src/core/rng';
import { BOX_H, BOX_W, PILE_DX } from '../src/games/horses/prints';
import { bookRace, formChances, HORSES, newRace, pickWinner, settleRace, type Race } from '../src/games/horses/rules';
import { R_OUT, TR } from '../src/games/horses/track';
import { drawMindset, MINDSETS, newMemory, remember, type AiMemory, type Mindset } from '../src/games/partybj/mindset';
import { drawRegulars, replacementFor } from '../src/games/partybj/roster';
import type { AiProfile } from '../src/games/partybj/rules';
import { BOX_DZ, boxX, MINI, PILE_DZ, ROW, rowIndex, SEAT, seatX } from '../src/games/partyhorses/layout';
import { aiPlan, betMap, byValue, favourite, isBroke, isLoneWinner, longShots, midPriced, PH, settleAi, valueRead, type AiBet } from '../src/games/partyhorses/rules';

const mem = (lastNet = 0, streak = 0): AiMemory => ({ ...newMemory(), lastNet, streak });
const RICH = 1_000_000;

/** A race with a clear favourite, two long shots and a mid price. */
const RACE = bookRace([4.8, 3.6, 1.2, 2.9, 1.5]);

function checkStakes(bets: AiBet[], chips: number) {
  expect(bets.length).toBeGreaterThan(0);
  const total = bets.reduce((a, b) => a + b.stake, 0);
  expect(total).toBeLessThanOrEqual(chips);
  for (const b of bets) {
    expect(b.stake % PH.step).toBe(0);
    expect(b.stake).toBeGreaterThanOrEqual(PH.aiMin);
    expect(b.stake).toBeLessThanOrEqual(PH.aiMax);
    expect(b.horse).toBeGreaterThanOrEqual(0);
    expect(b.horse).toBeLessThan(HORSES.length);
  }
  // never twice on the same horse
  expect(new Set(bets.map((b) => b.horse)).size).toBe(bets.length);
}

describe('the board as the regulars read it', () => {
  it('favourite, long shots, mid price and value', () => {
    expect(favourite(RACE)).toBe(0);
    const ls = longShots(RACE);
    expect(ls.length).toBeGreaterThan(0);
    ls.forEach((i) => expect(RACE.mult[i]).toBeGreaterThanOrEqual(6));
    for (let j = 1; j < ls.length; j++) expect(RACE.mult[ls[j - 1]]).toBeGreaterThanOrEqual(RACE.mult[ls[j]]);
    const mid = midPriced(RACE);
    expect(mid).not.toBe(0);
    for (let i = 1; i < 5; i++) expect(Math.abs(RACE.mult[mid] - 4.5)).toBeLessThanOrEqual(Math.abs(RACE.mult[i] - 4.5));
    const est = formChances(RACE.form);
    const v = valueRead(RACE);
    v.forEach((x, i) => expect(x).toBeCloseTo(est[i] * RACE.mult[i], 12));
    const order = byValue(RACE);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
    for (let j = 1; j < 5; j++) expect(v[order[j - 1]]).toBeGreaterThanOrEqual(v[order[j]] - 1e-12);
  });
});

describe('the regulars bet by their hidden mindset', () => {
  it('every plan is a valid set of stakes, within the chips', () => {
    const rng = seededRng(5);
    for (let k = 0; k < 4000; k++) {
      const race = newRace(rng);
      const m = MINDSETS[k % 5];
      const chips = [10, 15, 35, 80, 400, 5000][rng(6)];
      const plan = aiPlan(m, race, { chips, mem: mem(rng(3) === 0 ? 300 : -40, rng(7) - 3), lucky: rng(2) ? rng(5) : null }, rng);
      checkStakes(plan.bets, chips);
    }
  });

  it('calculated backs the best value, splitting only when the top two are close', () => {
    const rng = seededRng(8);
    let pairs = 0;
    for (let k = 0; k < 2000; k++) {
      const race = newRace(rng);
      const plan = aiPlan('calculated', race, { chips: RICH, mem: mem(), lucky: null }, rng);
      const order = byValue(race);
      const v = valueRead(race);
      expect(plan.bets[0].horse).toBe(order[0]);
      if (plan.bets.length === 2) {
        pairs++;
        expect(plan.call).toBe('pair');
        expect(plan.bets[1].horse).toBe(order[1]);
        expect(v[order[0]] - v[order[1]]).toBeLessThan(PH.closeValue);
        expect(plan.bets[0].stake).toBe(plan.bets[1].stake);
      } else {
        expect(plan.call).toBe('value');
        // steady stakes: one flat unit
        expect(plan.bets[0].stake).toBe(30);
      }
    }
    expect(pairs).toBeGreaterThan(0);
    expect(pairs).toBeLessThan(2000);
  });

  it('aggressive goes for long shots with a big stake, sometimes two', () => {
    const rng = seededRng(9);
    let two = 0;
    for (let k = 0; k < 2000; k++) {
      const race = newRace(rng);
      const plan = aiPlan('aggressive', race, { chips: RICH, mem: mem(), lucky: null }, rng);
      const ls = longShots(race);
      for (const b of plan.bets) {
        if (ls.length) expect(race.mult[b.horse]).toBeGreaterThanOrEqual(6);
        else expect(race.mult[b.horse]).toBe(Math.max(...race.mult));
      }
      if (plan.bets.length === 2) two++;
      else expect(plan.bets[0].stake).toBeGreaterThanOrEqual(60);
    }
    expect(two / 2000).toBeGreaterThan(0.2);
    expect(two / 2000).toBeLessThan(0.4);
  });

  it('conservative backs the favourite with a small stake', () => {
    const rng = seededRng(10);
    for (let k = 0; k < 1000; k++) {
      const race = newRace(rng);
      const plan = aiPlan('conservative', race, { chips: RICH, mem: mem(), lucky: null }, rng);
      expect(plan.bets).toEqual([{ horse: favourite(race), stake: plan.bets[0].stake }]);
      expect(plan.bets[0].stake).toBeLessThanOrEqual(30);
      expect(plan.call).toBe('fav');
    }
  });

  it('hybrid: the favourite after a loss, a mid price after a win, pressing its winnings', () => {
    const rng = seededRng(11);
    const lost = aiPlan('hybrid', RACE, { chips: RICH, mem: mem(-30, -1), lucky: null }, rng);
    expect(lost.bets).toEqual([{ horse: favourite(RACE), stake: 30 }]);
    const won = aiPlan('hybrid', RACE, { chips: RICH, mem: mem(120, 1), lucky: null }, rng);
    expect(won.bets).toEqual([{ horse: midPriced(RACE), stake: 90 }]);
    const fresh = aiPlan('hybrid', RACE, { chips: RICH, mem: mem(), lucky: null }, rng);
    expect(fresh.bets[0].horse).toBe(favourite(RACE));
  });

  it('hunch plays its lucky number, now and then spread over three horses', () => {
    const rng = seededRng(12);
    let spreads = 0;
    for (let k = 0; k < 2000; k++) {
      const plan = aiPlan('hunch', RACE, { chips: RICH, mem: mem(), lucky: 3 }, rng);
      expect(plan.bets[0].horse).toBe(3);
      if (plan.bets.length === 3) {
        spreads++;
        expect(plan.call).toBe('spread');
      } else expect(plan.call).toBe('lucky');
    }
    expect(spreads / 2000).toBeGreaterThan(0.18);
    expect(spreads / 2000).toBeLessThan(0.32);
    // no win yet: any horse
    const seen = new Set<number>();
    for (let k = 0; k < 400; k++) seen.add(aiPlan('hunch', RACE, { chips: RICH, mem: mem(), lucky: null }, rng).bets[0].horse);
    expect(seen.size).toBe(5);
  });

  it('a short stack still bets within its chips; under the minimum it is broke', () => {
    const rng = seededRng(13);
    for (const m of MINDSETS) {
      for (const chips of [10, 15, 20, 25]) {
        const plan = aiPlan(m, RACE, { chips, mem: mem(500, 3), lucky: 1 }, rng);
        checkStakes(plan.bets, chips);
      }
    }
    expect(isBroke(9)).toBe(true);
    expect(isBroke(10)).toBe(false);
  });
});

describe('settling and the lone winner', () => {
  it('a regular is settled with Lucky Horses’ book', () => {
    const bets: AiBet[] = [
      { horse: 1, stake: 30 },
      { horse: 3, stake: 15 },
    ];
    expect(betMap(bets)).toEqual({ h2: 30, h4: 15 });
    for (let w = 0; w < 5; w++) {
      const r = settleAi(bets, RACE, w);
      expect(r.wager).toBe(45);
      const ret = settleRace({ h2: 30, h4: 15 }, RACE, w);
      expect(r.ret).toBe(Object.values(ret).reduce((a, b) => a + b, 0));
    }
    expect(settleAi(bets, RACE, 1).ret).toBe(Math.floor(30 * RACE.mult[1]));
    expect(settleAi(bets, RACE, 0).ret).toBe(0);
  });

  it('lone winner: the player alone on a winner at ×6 or more', () => {
    const ls = longShots(RACE)[0];
    const id = HORSES[ls].id;
    const others: AiBet[][] = [[{ horse: 0, stake: 30 }], [{ horse: 1, stake: 10 }], [{ horse: (ls + 1) % 5, stake: 50 }], [{ horse: 0, stake: 20 }]];
    expect(isLoneWinner({ [id]: 25 }, others, RACE, ls)).toBe(true);
    // a regular on the same horse
    expect(isLoneWinner({ [id]: 25 }, [...others.slice(0, 3), [{ horse: ls, stake: 10 }]], RACE, ls)).toBe(false);
    // the player didn't back the winner
    expect(isLoneWinner({ h1: 25 }, others, RACE, ls)).toBe(false);
    // a short price is not a lone win
    expect(isLoneWinner({ h1: 25 }, [[{ horse: 1, stake: 10 }], [{ horse: 2, stake: 10 }], [{ horse: 3, stake: 10 }], [{ horse: 4, stake: 10 }]], RACE, 0)).toBe(false);
  });
});

describe('layout', () => {
  it('the boxes and the crowd rows stay inside the infield, clear of the winning post', () => {
    const inner = TR.rIn - 0.035;
    expect(BOX_DZ - BOX_H / 2).toBeGreaterThan(-inner);
    expect(BOX_DZ + BOX_H / 2).toBeLessThan(ROW.dz - ROW.h / 2 + 0.01);
    expect(ROW.dz + ROW.h / 2).toBeLessThan(inner);
    const chipR = 0.21 * MINI;
    for (let i = 0; i < 5; i++) {
      // the places are inside their row, and the rows don't touch
      for (const dx of ROW.dx) expect(Math.abs(dx) + ROW.r).toBeLessThan(ROW.w / 2);
      expect(ROW.dx[1] - ROW.dx[0]).toBeGreaterThan(2 * chipR);
      expect(boxX(1) - boxX(0)).toBeGreaterThan(ROW.w);
      // the winning post on the inside rail (x = TR.lineX, z = TR.rIn − 0.07) misses every stack
      for (const dx of ROW.dx) {
        const x = boxX(i) + dx;
        const dz = TR.rIn - 0.07 - ROW.dz;
        expect(Math.hypot(x - TR.lineX, dz)).toBeGreaterThan(chipR + 0.02);
      }
    }
    // the player's stack and the house's cover fit in the box
    expect(PILE_DZ).toBeGreaterThan(BOX_DZ - BOX_H / 2);
    expect(PILE_DX + 0.21).toBeLessThan(BOX_W / 2 + 0.01);
    // seats under the front straight, the player's in the middle
    expect(SEAT.dz + SEAT.tagDz).toBeGreaterThan(R_OUT);
    expect(seatX(2)).toBe(0);
    expect([0, 1, 3, 4].map(rowIndex)).toEqual([0, 1, 2, 3]);
  });
});

// ------------------------------------------------------------------ return to player

/** Long-run return of a regular who always plays mindset `m` (or draws one each race, as at the table). */
function regularReturn(m: Mindset | 'drawn', n: number, rng: Rng) {
  let wager = 0;
  let back = 0;
  let exact = 0;
  const profile: AiProfile = { name: 'Test', style: 'wildcard', bank: 2500 };
  const mm = newMemory();
  let lucky: number | null = null;
  for (let k = 0; k < n; k++) {
    const race = newRace(rng);
    const mind = m === 'drawn' ? drawMindset(profile, mm, profile.bank, rng) : m;
    const plan = aiPlan(mind, race, { chips: RICH, mem: mm, lucky }, rng);
    const w = pickWinner(race, rng);
    const r = settleAi(plan.bets, race, w);
    wager += r.wager;
    back += r.ret;
    exact += plan.bets.reduce((a, b) => a + race.p[b.horse] * Math.floor(b.stake * race.mult[b.horse] + 1e-9), 0);
    remember(mm, mind, r.ret - r.wager);
    if (r.ret > 0) lucky = w;
  }
  return { sim: back / wager, exact: exact / wager };
}

describe('RTP', () => {
  it("the player's return is Lucky Horses' (≈94.9%), whatever the regulars do", () => {
    const rng = seededRng(2024);
    const n = 300000;
    let wager = 0;
    let back = 0;
    let exact = 0;
    let single = 0;
    let singleBack = 0;
    let lone = 0;
    let lonePlays = 0;
    // four regulars at the rail, as at the table
    const seats = drawRegulars(4, rng).map((p) => ({ p, chips: p.bank, mem: newMemory(), lucky: null as number | null }));
    for (let k = 0; k < n; k++) {
      const race: Race = newRace(rng);
      const regs = seats.map((s, j) => {
        if (isBroke(s.chips)) {
          const p = replacementFor(
            seats.map((x) => x.p.name),
            rng,
          );
          seats[j] = s = { p, chips: p.bank, mem: newMemory(), lucky: null };
        }
        const mind = drawMindset(s.p, s.mem, s.chips, rng);
        const plan = aiPlan(mind, race, { chips: s.chips, mem: s.mem, lucky: s.lucky }, rng);
        return { s, mind, bets: plan.bets };
      });
      // a player who spreads 20 on every horse, and one who backs one random horse
      const spread: Record<string, number> = {};
      HORSES.forEach((h) => (spread[h.id] = 20));
      const pick = rng(5);
      const w = pickWinner(race, rng);
      const ret = settleRace(spread, race, w);
      wager += 100;
      back += Object.values(ret).reduce((a, b) => a + b, 0);
      exact += race.p.reduce((a, p, i) => a + p * Math.floor(20 * race.mult[i] + 1e-9), 0);
      single += 20;
      if (pick === w) singleBack += Math.floor(20 * race.mult[pick] + 1e-9);
      if (race.mult[pick] >= 6) lonePlays++;
      if (isLoneWinner({ [HORSES[pick].id]: 20 }, regs.map((r) => r.bets), race, w)) lone++;
      for (const r of regs) {
        const res = settleAi(r.bets, race, w);
        r.s.chips += res.ret - res.wager;
        remember(r.s.mem, r.mind, res.ret - res.wager);
        if (res.ret > 0) r.s.lucky = w;
      }
    }
    const sim = back / wager;
    const ex = exact / wager;
    expect(ex).toBeLessThanOrEqual(0.95);
    expect(ex).toBeGreaterThan(0.945);
    expect(Math.abs(sim - ex)).toBeLessThan(0.005);
    const one = singleBack / single;
    expect(one).toBeGreaterThan(0.93);
    expect(one).toBeLessThan(0.965);
    // a lone winner is rare but real: a few in a thousand races for a random pick
    expect(lone / n).toBeGreaterThan(0.001);
    expect(lone / n).toBeLessThan(0.03);
    expect(lonePlays).toBeGreaterThan(lone);
  });

  it('no mindset beats the book: each returns 93–95% in the long run', () => {
    for (const m of [...MINDSETS, 'drawn' as const]) {
      const r = regularReturn(m, 120000, seededRng(77));
      expect(r.exact).toBeLessThanOrEqual(0.95);
      expect(r.exact).toBeGreaterThan(0.93);
      // the simulation agrees with the exact expectation (long shots are noisy)
      expect(Math.abs(r.sim - r.exact)).toBeLessThan(m === 'aggressive' ? 0.03 : 0.015);
    }
  });
});
