import { describe, expect, it } from 'vitest';
import { seededRng } from '../src/core/rng';
import {
  DEALER_TRUMPS,
  Duel,
  TARGET_MAX,
  TARGET_MIN,
  TARGET_TRUMPS,
  TRUMPS,
  WILD_MAX,
  WILD_MIN,
  dealWeight,
  duelOutcome,
  isTargetTrump,
  lineValue,
  rarityOf,
  T21,
  targetAfter,
  wildTarget,
  wildTargets,
  type DuelEvent,
  type TrumpId,
} from '../src/games/trump21/rules';
import { newMemory } from '../src/games/partybj/mindset';
import { duelPick } from '../src/games/partytrump/ai';
import { rtp, simulateSingle } from '../src/games/partytrump/sim';

/** A duel set to an exact spot: the deck holds every card not in a hand; the dealer always plays his trump. */
function spot(player: number[], dealer: number[], target = 21, trumps: { player?: TrumpId[]; dealer?: TrumpId[] } = {}, seed = 1) {
  const d = new Duel(seededRng(seed));
  d.start();
  d.player = player.slice();
  d.dealer = dealer.slice();
  d.deck = Array.from({ length: 11 }, (_, i) => i + 1).filter((v) => !player.includes(v) && !dealer.includes(v));
  d.target = target;
  d.trumps = { player: (trumps.player ?? []).slice(), dealer: (trumps.dealer ?? []).slice() };
  d.aggression = 1;
  return d;
}

const dealerPlays = (d: Duel) => d.dealerTurn().find((e): e is Extract<DuelEvent, { t: 'trump' }> => e.t === 'trump')?.id ?? null;

const NEW_LINES = ['line15', 'line18', 'line19', 'line20', 'line22', 'line23', 'line25', 'line26', 'line30'] as const;

describe('Trump 21 — target family', () => {
  it('lists the sixteen target trumps, each with a rarity', () => {
    expect(TARGET_TRUMPS.length).toBe(16);
    for (const id of [...NEW_LINES, 'line17', 'line24', 'line27', 'reset21', 'lineWild', 'shiftUp', 'shiftDown'] as TrumpId[]) {
      expect(isTargetTrump(id)).toBe(true);
      expect(TRUMPS.find((t) => t.id === id)).toBeTruthy();
    }
    expect(isTargetTrump('precision')).toBe(false);
    // extremes are rare and never reach the dealer
    expect(rarityOf('line15')).toBe('rare');
    expect(rarityOf('line30')).toBe('rare');
    expect(DEALER_TRUMPS).not.toContain('line15');
    expect(DEALER_TRUMPS).not.toContain('line30');
    expect(DEALER_TRUMPS).toContain('lineWild');
  });

  it('each new fixed line sets its target (and is spent when already there)', () => {
    for (const id of NEW_LINES) {
      const n = Number(id.slice(4));
      expect(lineValue(id)).toBe(n);
      const d = spot([3, 9], [5, 8], 21, { player: [id, id] });
      expect(d.canUse('player', id)).toBe(true);
      const ev = d.useTrump('player', id);
      expect(d.target).toBe(n);
      expect(ev).toContainEqual({ t: 'target', n });
      expect(d.canUse('player', id)).toBe(false);
      expect(d.useTrump('player', id)).toEqual([]);
      expect(d.trumps.player).toEqual([id]);
    }
  });

  it('every line is reachable with the 1–11 deck', () => {
    // all eleven cards sum to 66; two to five cards reach anything from 3 to 45
    for (const id of TARGET_TRUMPS) {
      const n = lineValue(id);
      if (n === undefined) continue;
      expect(n).toBeGreaterThanOrEqual(TARGET_MIN);
      expect(n).toBeLessThanOrEqual(TARGET_MAX);
      expect(n).toBeLessThanOrEqual(11 + 10 + 9 + 8 + 7);
    }
  });

  it('Wild Line never repeats the current target and stays in 16–28', () => {
    const seen = new Set<number>();
    for (let s = 0; s < 400; s++) {
      const start = TARGET_MIN + (s % (TARGET_MAX - TARGET_MIN + 1));
      const d = spot([3, 9], [5, 8], start, { player: ['lineWild'] }, s);
      expect(d.canUse('player', 'lineWild')).toBe(true);
      const ev = d.useTrump('player', 'lineWild');
      expect(d.target).not.toBe(start);
      expect(d.target).toBeGreaterThanOrEqual(WILD_MIN);
      expect(d.target).toBeLessThanOrEqual(WILD_MAX);
      expect(ev).toContainEqual({ t: 'target', n: d.target, wild: true });
      seen.add(d.target);
    }
    expect(seen.size).toBe(WILD_MAX - WILD_MIN + 1); // every value comes up
    // the bare draw, with an injected rng
    const rng = seededRng(42);
    for (let i = 0; i < 300; i++) {
      const v = wildTarget(21, rng);
      expect(v).not.toBe(21);
      expect(wildTargets(21)).toContain(v);
    }
    expect(wildTargets(21).length).toBe(12);
    expect(wildTargets(30).length).toBe(13);
  });

  it('Line +2 and Line −2 move the target by 2 and clamp to 15–30', () => {
    const d = spot([3, 9], [5, 8], 21, { player: ['shiftUp', 'shiftDown', 'shiftUp', 'shiftDown'] });
    d.useTrump('player', 'shiftUp');
    expect(d.target).toBe(23);
    d.useTrump('player', 'shiftDown');
    expect(d.target).toBe(21);
    d.target = 29;
    expect(d.useTrump('player', 'shiftUp')).toContainEqual({ t: 'target', n: 30 });
    expect(d.canUse('player', 'shiftDown')).toBe(true);
    d.target = 30;
    d.trumps.player.push('shiftUp');
    expect(d.canUse('player', 'shiftUp')).toBe(false);
    d.target = 16;
    d.useTrump('player', 'shiftDown');
    expect(d.target).toBe(15);
    d.trumps.player.push('shiftDown');
    expect(d.canUse('player', 'shiftDown')).toBe(false);
    expect(targetAfter('shiftUp', 30)).toBe(30);
    expect(targetAfter('shiftDown', 15)).toBe(15);
    expect(targetAfter('line24', 17)).toBe(24);
    expect(targetAfter('lineWild', 21)).toBe(null);
    expect(targetAfter('precision', 21)).toBe(null);
  });
});

describe('Trump 21 — dealer target AI', () => {
  it('over the target: the lowest line that saves him', () => {
    // dealer 24 over 21; the player shows 7 (8–18 in all)
    const d = spot([2, 7], [10, 9, 5], 21, { dealer: ['line27', 'line25', 'shiftUp'] });
    expect(dealerPlays(d)).toBe('line25');
    expect(d.target).toBe(25);
    expect(d.trumps.dealer).toEqual(['line27', 'shiftUp']);
  });

  it('a shift is enough when he is over by one or two', () => {
    const d = spot([2, 7], [10, 8, 4], 21, { dealer: ['line27', 'shiftUp'] });
    expect(dealerPlays(d)).toBe('shiftUp');
    expect(d.target).toBe(23);
  });

  it('still prefers Recall when busted', () => {
    const d = spot([2, 7], [10, 9, 5], 21, { dealer: ['line25', 'recall'] });
    expect(dealerPlays(d)).toBe('recall');
  });

  it('does not save himself into a loss (both bust and he is lower)', () => {
    // dealer 22, player shows 21 (22–32 in all): both bust, the lower total (his) wins already
    const d = spot([1, 10, 11], [9, 8, 5], 21, { dealer: ['line27'] });
    expect(dealerPlays(d)).toBe(null);
    expect(d.target).toBe(21);
  });

  it('at a strong total: pulls the line down when the player is likely over it', () => {
    // dealer 17, the player shows 16 (17–26 in all, mostly over 18)
    const d = spot([3, 11, 5], [9, 8], 21, { dealer: ['line19', 'line18'] });
    expect(dealerPlays(d)).toBe('line18');
    expect(d.target).toBe(18);
  });

  it('Line −2 pulls the line down too', () => {
    // dealer 19, the player shows 19 (20–30 in all)
    const d = spot([1, 11, 8], [10, 9], 21, { dealer: ['shiftDown'] });
    expect(dealerPlays(d)).toBe('shiftDown');
    expect(d.target).toBe(19);
  });

  it('Reset 21 undoes a raised target when the player sits above 21', () => {
    // the player raised the line to 27 and shows 22; the dealer holds 20
    const d = spot([4, 11, 6, 5], [10, 7, 3], 27, { dealer: ['line22', 'reset21'] });
    expect(dealerPlays(d)).toBe('reset21');
    expect(d.target).toBe(21);
  });

  it('keeps his lines when the player is likely under them', () => {
    const d = spot([3, 2], [9, 8], 21, { dealer: ['line18', 'line17', 'lineWild'] });
    expect(dealerPlays(d)).toBe(null);
    expect(d.trumps.dealer).toEqual(expect.arrayContaining(['line18', 'line17', 'lineWild']));
  });

  it('Wild Line only as a gamble: busted with no line to save him', () => {
    // dealer 26 over 21, best line 24: only the wild draw (26–28) can save him
    const d = spot([2, 4], [11, 10, 5], 21, { dealer: ['line24', 'lineWild'] });
    const ev = d.dealerTurn();
    expect(ev.find((e) => e.t === 'trump')).toMatchObject({ id: 'lineWild' });
    expect(ev.find((e) => e.t === 'target')).toMatchObject({ wild: true });
    expect(d.target).toBeGreaterThanOrEqual(WILD_MIN);
    expect(d.target).toBeLessThanOrEqual(WILD_MAX);
    expect(d.target).not.toBe(21);
    // a comfortable dealer never gambles
    const calm = spot([3, 5], [10, 9], 21, { dealer: ['lineWild'] });
    expect(dealerPlays(calm)).toBe(null);
  });

});

describe('Trump 21 — player hint for target trumps', () => {
  it('suggests the lowest saving line when the player is over', () => {
    const d = spot([10, 9, 4], [8, 7], 21, { player: ['line27', 'line24', 'line22'] });
    expect(d.trumpAdvice()).toBe('line24');
  });
  it('suggests nothing when no target trump helps', () => {
    const d = spot([10, 5], [8, 7], 21, { player: ['line27', 'line24'] });
    expect(d.trumpAdvice()).toBe(null);
  });
  it('Wild Line as a long shot when clearly losing with no safe draw', () => {
    // 19 against a dealer known (Glimpse) to hold 20; only a 1 or a 2 is a safe draw
    const d = spot([10, 9], [11, 3, 6], 21, { player: ['lineWild'] });
    d.glimpsed = true;
    expect(d.trumpAdvice()).toBe('lineWild');
    // without seeing the dealer's 11 he probably holds less than 19: no gamble
    d.glimpsed = false;
    expect(d.trumpAdvice()).toBe(null);
  });
});

describe('Trump 21 — dealing balance', () => {
  const share = (dealer: boolean) => {
    const pool = TRUMPS.filter((t) => !dealer || t.dealer);
    const all = pool.reduce((a, t) => a + dealWeight(t.id), 0);
    return pool.filter((t) => isTargetTrump(t.id)).reduce((a, t) => a + dealWeight(t.id), 0) / all;
  };
  it('the target family is dealt about as often as the old four lines (10.3% / 25%)', () => {
    expect(share(false)).toBeGreaterThan(0.1);
    expect(share(false)).toBeLessThan(0.14);
    expect(share(true)).toBeGreaterThan(0.24);
    expect(share(true)).toBeLessThan(0.3);
  });
  it('rarity still orders the lines, and weights are integers', () => {
    for (const t of TRUMPS) expect(Number.isInteger(dealWeight(t.id))).toBe(true);
    expect(dealWeight('line20')).toBeGreaterThan(dealWeight('line24'));
    expect(dealWeight('line24')).toBeGreaterThan(dealWeight('line30'));
    expect(dealWeight('precision')).toBeGreaterThan(dealWeight('line20'));
  });
  it('dealt trumps follow the weights', () => {
    let target = 0;
    let all = 0;
    for (let s = 0; s < 4000; s++) {
      const d = new Duel(seededRng(s));
      d.start();
      for (const id of d.trumps.player) {
        all++;
        if (isTargetTrump(id)) target++;
      }
    }
    expect(target / all).toBeGreaterThan(0.09);
    expect(target / all).toBeLessThan(0.16);
  });
  it('with every new trump in play the dealer still finishes and the simple odds rule loses', () => {
    let ev = 0;
    const N = 4000;
    for (let s = 0; s < N; s++) {
      const d = new Duel(seededRng(s));
      d.start();
      let g = 0;
      while (!d.over && g++ < 40) {
        if (d.advice() === 'hit') d.hit('player');
        else d.stand('player');
        if (!d.over) d.dealerTurn();
      }
      expect(d.over || d.deck.length === 0).toBe(true);
      expect(d.target).toBeGreaterThanOrEqual(TARGET_MIN);
      expect(d.target).toBeLessThanOrEqual(TARGET_MAX);
      ev += d.outcome();
    }
    // ties go to the dealer and he plays his trumps (see 'the house balance' below)
    expect(ev / N).toBeLessThan(-0.15);
    expect(ev / N).toBeGreaterThan(-0.45);
  });
});

describe('Trump 21 — the house balance', () => {
  it('ties go to the dealer', () => {
    expect(T21.tiesToPlayer).toBe(false);
    expect(duelOutcome(20, 20, 21)).toBe(-1);
    expect(duelOutcome(24, 24, 21)).toBe(-1); // both bust on the same total
    expect(duelOutcome(23, 24, 21)).toBe(1); // both bust: the lower total still wins
    expect(duelOutcome(20, 19, 21)).toBe(1);
    expect(duelOutcome(20, 20, 21, true)).toBe(1);
  });

  it("the dealer's full hand makes room: a new trump replaces his oldest; the player's does not", () => {
    const d = new Duel(seededRng(2));
    d.trumps.dealer = ['reset21', 'call4', 'call4', 'call4', 'call4'];
    d.trumps.player = ['call2', 'call2', 'call2', 'call2', 'call2'];
    const ev = d.start();
    expect(d.trumps.dealer.length).toBe(5);
    expect(d.trumps.dealer.slice(0, 4)).toEqual(['call4', 'call4', 'call4', 'call4']);
    expect(ev).toContainEqual({ t: 'lose', side: 'dealer', id: 'reset21', by: 'discard' });
    expect(d.trumps.player).toEqual(['call2', 'call2', 'call2', 'call2', 'call2']);
  });

  it('the dealer keeps playing trumps round after round, target cards included', () => {
    const rng = seededRng(5);
    const d = new Duel(rng);
    const mem = newMemory();
    const plays: TrumpId[] = [];
    const N = 1500;
    for (let i = 0; i < N; i++) {
      d.start();
      let g = 0;
      while (!d.over && g++ < 60) {
        let p = duelPick(d, 'calculated', mem, rng);
        let k = 0;
        while (typeof p === 'object' && k++ < 12) {
          if (!d.useTrump('player', p.trump).length) break;
          p = duelPick(d, 'calculated', mem, rng);
        }
        d[typeof p === 'object' ? 'stand' : p]('player');
        if (d.over) break;
        for (const e of d.dealerTurn()) if (e.t === 'trump' && e.side === 'dealer') plays.push(e.id);
      }
    }
    // late rounds too: the hand never clogs
    expect(plays.length / N).toBeGreaterThan(0.6);
    const targets = new Set(plays.filter(isTargetTrump));
    expect(targets.size).toBeGreaterThanOrEqual(8);
    expect(plays.filter(isTargetTrump).length / plays.length).toBeGreaterThan(0.1);
  });

  // Long-run figures (3 × 100,000 rounds): the strongest strategy 98.2%, odds rule 53.9%, hit to
  // 17 53.0%, every trump at once 59.3% (trump21/rules.ts). These runs are shorter.
  it('the strongest strategy found (also the light bulb) returns 96–99%', () => {
    const r = rtp(simulateSingle(40000, 101));
    expect(r).toBeGreaterThan(0.955);
    expect(r).toBeLessThan(0.995);
  }, 180000);

  it('simpler ways to play stay well under 100%', () => {
    for (const how of ['odds', 'hit17', 'dump'] as const) expect(rtp(simulateSingle(12000, 404, how))).toBeLessThan(0.7);
    for (const m of ['aggressive', 'conservative', 'hybrid', 'hunch'] as const) expect(rtp(simulateSingle(12000, 505, m))).toBeLessThan(0.99);
  }, 180000);
});
