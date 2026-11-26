import { describe, expect, it } from 'vitest';
import { seededRng } from '../src/core/rng';
import {
  BONUS_ON_HIT,
  BULLSEYE_EXTRA,
  DEALER_TRUMPS,
  Duel,
  isAttackTrump,
  MAX_TRUMPS,
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

describe('Trump 21 — bonus trumps on a hit', () => {
  /** Runs `f` with the bonus chance set to `p` (restored after). */
  const withBonus = <T>(p: number, f: () => T): T => {
    const was = T21.playerOnHit;
    T21.playerOnHit = p;
    try {
      return f();
    } finally {
      T21.playerOnHit = was;
    }
  };

  it('about one hit in five turns up a bonus trump', () => {
    expect(T21.playerOnHit).toBe(BONUS_ON_HIT);
    expect(BONUS_ON_HIT).toBe(0.2);
  });

  it('a bonus comes instead of the card: the turn stays the player\'s and the next hit is a sure card', () => {
    withBonus(1, () => {
      const d = spot([3, 9], [5, 8]);
      const deck = d.deck.slice();
      const ev = d.hit('player');
      expect(ev.length).toBe(1);
      expect(ev[0]).toMatchObject({ t: 'gain', side: 'player', bonus: true });
      expect(d.trumps.player.length).toBe(1);
      expect(d.player).toEqual([3, 9]); // no card yet
      expect(d.deck).toEqual(deck);
      expect(d.lastHitBonus).toBe(true);
      expect(d.sureCard).toBe(true);
      expect(d.stood.player).toBe(false);
      // the next hit is a sure card, even at a 100% bonus chance
      const ev2 = d.hit('player');
      expect(ev2.some((e) => e.t === 'gain')).toBe(false);
      expect(ev2).toContainEqual({ t: 'draw', side: 'player', value: deck[0] });
      expect(d.lastHitBonus).toBe(false);
      expect(d.sureCard).toBe(false);
      // then the bonus can come again
      expect(d.hit('player')[0]).toMatchObject({ t: 'gain', bonus: true });
    });
  });

  it('no bonus with a full trump hand, an empty deck or when frozen', () => {
    withBonus(1, () => {
      const d = spot([3, 9], [5, 8], 21, { player: ['call2', 'call2', 'call2', 'call2', 'call2'] });
      expect(d.hit('player').some((e) => e.t === 'draw')).toBe(true);
      expect(d.trumps.player.length).toBe(MAX_TRUMPS);
      const e = spot([3, 9], [5, 8]);
      e.deck = [];
      expect(e.hit('player').some((x) => x.t === 'gain')).toBe(false);
      const f = spot([3, 9], [5, 8]);
      f.frozen.player = true;
      expect(f.hit('player')).toEqual([{ t: 'stand', side: 'player' }]);
    });
  });

  it("the dealer's hit always draws his card; a trump may come along with it", () => {
    withBonus(1, () => {
      let along = 0;
      for (let s = 0; s < 300; s++) {
        const d = spot([3, 9], [5, 8], 21, {}, s);
        const ev = d.hit('dealer');
        expect(ev[0].t).toBe('draw');
        if (ev.some((e) => e.t === 'gain' && e.bonus)) along++;
      }
      expect(along / 300).toBeGreaterThan(0.2);
      expect(along / 300).toBeLessThan(0.4);
    });
  });

  it('in play, bonuses come with about a fifth of the hits that can bring one', () => {
    let hits = 0;
    let bonus = 0;
    for (let s = 0; s < 3000; s++) {
      const d = new Duel(seededRng(s));
      d.start();
      d.trumps.player = [];
      for (let k = 0; k < 3 && d.deck.length; k++) {
        const sure = d.sureCard;
        d.hit('player');
        if (sure) continue;
        hits++;
        if (d.lastHitBonus) bonus++;
      }
    }
    expect(bonus / hits).toBeGreaterThan(0.17);
    expect(bonus / hits).toBeLessThan(0.23);
  });
});

describe('Trump 21 — the newer trumps', () => {
  it('are in the codex with a rarity, and the dealer gets only Lighten, Heist and Barrier', () => {
    const NEW: TrumpId[] = ['call1', 'call8', 'lighten', 'heist', 'gift', 'overload', 'rewind', 'barrier', 'tiebreak', 'bullseye', 'reinforce'];
    for (const id of NEW) expect(TRUMPS.find((t) => t.id === id)).toBeTruthy();
    expect(TRUMPS.length).toBe(52);
    expect(NEW.filter((id) => DEALER_TRUMPS.includes(id))).toEqual(['lighten', 'heist', 'barrier']);
    for (const id of ['heist', 'gift', 'overload', 'rewind'] as TrumpId[]) expect(isAttackTrump(id)).toBe(true);
  });

  it('Call 1 and Call 8 draw their card', () => {
    const d = spot([3, 9], [5, 2], 21, { player: ['call1', 'call8'] });
    d.useTrump('player', 'call1');
    d.useTrump('player', 'call8');
    expect(d.player).toEqual([3, 9, 1, 8]);
    expect(d.canUse('player', 'call1')).toBe(false);
  });

  it('Lighten returns the highest card, wherever it sits', () => {
    const d = spot([11, 4, 9], [5, 8], 21, { player: ['lighten'] });
    const ev = d.useTrump('player', 'lighten');
    expect(d.player).toEqual([4, 9]);
    expect(d.deck).toContain(11);
    expect(ev).toContainEqual({ t: 'back', side: 'player', value: 11 });
  });

  it("Heist takes the opponent's last card; Gift gives yours", () => {
    const d = spot([3, 9], [5, 8, 2], 21, { player: ['heist', 'gift'] });
    expect(d.useTrump('player', 'heist')).toContainEqual({ t: 'move', from: 'dealer', to: 'player', value: 2 });
    expect(d.player).toEqual([3, 9, 2]);
    expect(d.dealer).toEqual([5, 8]);
    expect(d.useTrump('player', 'gift')).toContainEqual({ t: 'move', from: 'player', to: 'dealer', value: 2 });
    expect(d.player).toEqual([3, 9]);
    expect(d.dealer).toEqual([5, 8, 2]);
  });

  it('Overload deals the dealer two cards; Rewind sends both last cards back', () => {
    const d = spot([3, 9], [5, 8], 21, { player: ['overload', 'rewind'] });
    const top = d.deck.slice(0, 2);
    d.useTrump('player', 'overload');
    expect(d.dealer).toEqual([5, 8, ...top]);
    d.useTrump('player', 'rewind');
    expect(d.player).toEqual([3]);
    expect(d.dealer).toEqual([5, 8, top[0]]);
    expect(d.deck).toContain(9);
    expect(d.deck).toContain(top[1]);
  });

  it("a Barrier blocks the opponent's next attack only (the trump is spent)", () => {
    const d = spot([3, 9, 7], [5, 8], 21, { player: ['barrier'], dealer: ['burn', 'burn'] });
    d.useTrump('player', 'barrier');
    expect(d.barrier.player).toBe(true);
    const ev = d.useTrump('dealer', 'burn');
    expect(ev).toContainEqual({ t: 'blocked', side: 'player', id: 'burn' });
    expect(d.player).toEqual([3, 9, 7]);
    expect(d.trumps.dealer).toEqual(['burn']);
    expect(d.barrier.player).toBe(false);
    d.useTrump('dealer', 'burn');
    expect(d.player).toEqual([3, 9]);
    // it doesn't stop the opponent's own plays
    const e = spot([3, 9], [5, 8], 21, { player: ['barrier'], dealer: ['call4'] });
    e.useTrump('player', 'barrier');
    e.useTrump('dealer', 'call4');
    expect(e.dealer).toEqual([5, 8, 4]);
    expect(e.barrier.player).toBe(true);
  });

  it('Tiebreaker gives the player the ties; Bullseye pays 3 to 1 right on the target (4 to 1 with Bounty)', () => {
    const d = spot([10, 9], [11, 8], 21, { player: ['tiebreak'] });
    expect(d.outcome()).toBe(-1);
    d.useTrump('player', 'tiebreak');
    expect(d.outcome()).toBe(1);
    expect(d.payout(10)).toBe(20);
    const e = spot([10, 11], [9, 8], 21, { player: ['bullseye', 'bounty'] });
    e.useTrump('player', 'bullseye');
    expect(e.payout(10)).toBe(10 * (2 + BULLSEYE_EXTRA));
    e.useTrump('player', 'bounty');
    expect(e.payout(10)).toBe(50);
    // a win off the target pays as usual
    const f = spot([10, 9], [7, 8], 21, { player: ['bullseye'] });
    f.useTrump('player', 'bullseye');
    expect(f.payout(10)).toBe(20);
  });

  it('Reinforce brings two new trumps', () => {
    const d = spot([3, 9], [5, 8], 21, { player: ['reinforce', 'call2'] });
    const ev = d.useTrump('player', 'reinforce');
    expect(d.trumps.player.length).toBe(3);
    expect(ev.filter((e) => e.t === 'gain').length).toBe(2);
  });

  it('the dealer lightens a bust Recall would not save, and heists a card that fits him', () => {
    // 23 with Lighten alone: the 11 goes back
    expect(dealerPlays(spot([2, 7], [11, 3, 9], 21, { dealer: ['lighten'] }))).toBe('lighten');
    // 26: Recall (the 1) would leave 25, Lighten (the 11) leaves 15
    expect(dealerPlays(spot([2, 7], [6, 11, 5, 3, 1], 21, { dealer: ['recall', 'lighten'] }))).toBe('lighten');
    // 23: Recall (the 9) saves him too, and comes first
    expect(dealerPlays(spot([2, 7], [11, 3, 9], 21, { dealer: ['recall', 'lighten'] }))).toBe('recall');
    // at 15 he takes the player's last card, a 4 (19)
    expect(dealerPlays(spot([2, 4], [9, 6], 21, { dealer: ['heist'] }))).toBe('heist');
  });

  it('the light bulb weighs the newer trumps', () => {
    const mem = newMemory();
    // 24 over 21: Lighten (the 11) brings it back to 13 and the hit decision
    const d = spot([11, 6, 7], [9, 8], 21, { player: ['lighten'] });
    expect(duelPick(d, 'calculated', mem, seededRng(1))).toEqual({ trump: 'lighten', on: 'self' });
    // right on the target, holding Bullseye: play it before standing
    const e = spot([10, 11], [3, 8], 21, { player: ['bullseye'] });
    expect(duelPick(e, 'calculated', mem, seededRng(1))).toEqual({ trump: 'bullseye', on: 'self' });
    // Reinforce goes down at once with room in hand
    const f = spot([3, 9], [5, 8], 21, { player: ['reinforce'] });
    expect(duelPick(f, 'calculated', mem, seededRng(1))).toEqual({ trump: 'reinforce', on: 'self' });
  });
});
