import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/core/cards';
import { Cat4, eval4, best4 } from '../src/core/eval4';
import { eval3 } from '../src/core/eval3';
import { seededRng } from '../src/core/rng';
import { settleTcp } from '../src/games/threecard/rules';
import { playMultiple, settleFcp } from '../src/games/fourcard/rules';
import { dealerQualifies as h3Qual, pairOrSuited, raiseFirst, raiseSecond, settleH3, straightOrUp } from '../src/games/holdem3/rules';
import { dealerReplace, rusAdvice, settleRus } from '../src/games/russian/rules';
import { ddEval, finalUnits, firstDrawAdvice, secondDrawAdvice, settleDD } from '../src/games/doubledraw/rules';
import { Duel } from '../src/games/trump21/rules';

const C = (s: string) => parseCards(s);
const deal = (rng: (n: number) => number, n: number, extra: number[] = []) => {
  const deck = [...Array.from({ length: 52 }, (_, i) => i), ...extra];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return { hand: deck.slice(deck.length - n), rest: deck.slice(0, deck.length - n) };
};

describe('Three Card Poker Lucky 6', () => {
  it('pays the best five of six cards, even after a fold', () => {
    const r = settleTcp(C('7s 7d 2c'), C('7h 7c 9d'), { ante: 10, pairPlus: 0, lucky6: 5 }, false);
    expect(r.lucky6Mult).toBe(100);
    expect(r.ret.lucky6).toBe(505);
    const f = settleTcp(C('2s 5s 9s'), C('Js Qd 3s'), { ante: 0, pairPlus: 0, lucky6: 5 }, false);
    expect(f.ret.lucky6).toBe(80);
    const n = settleTcp(C('2s 5d 9s'), C('Jc Qd 3s'), { ante: 0, pairPlus: 0, lucky6: 5 }, false);
    expect(n.ret.lucky6).toBe(0);
  });
});

describe('Four Card Poker', () => {
  it('ranks four-card hands', () => {
    expect(eval4(C('9s 9d 9c 9h')).cat).toBe(Cat4.Quads);
    expect(eval4(C('5h 6h 7h 8h')).cat).toBe(Cat4.StraightFlush);
    expect(eval4(C('Ah 2d 3c 4s')).cat).toBe(Cat4.Straight);
    expect(eval4(C('9s 9d 9c 2h')).score).toBeGreaterThan(eval4(C('2h 7h 9h Kh')).score);
    expect(best4(C('As Ad Kc 7h 2s')).cat).toBe(Cat4.Pair);
  });
  it('counts all 270,725 four-card hands exactly', () => {
    const counts = new Array(8).fill(0);
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++) for (let d = c + 1; d < 52; d++) counts[eval4([a, b, c, d]).cat]++;
    expect(counts[Cat4.Quads]).toBe(13);
    expect(counts[Cat4.StraightFlush]).toBe(44);
    expect(counts[Cat4.Trips]).toBe(2496);
    expect(counts[Cat4.Flush]).toBe(2816);
    expect(counts[Cat4.Straight]).toBe(2772);
    expect(counts[Cat4.TwoPair]).toBe(2808);
    expect(counts[Cat4.Pair]).toBe(82368);
  });
  it('player wins ties; ante bonus and Aces Up', () => {
    const r = settleFcp(C('9s 9d 9c 4h 2s'), C('Ks Qd 7c 5h 3d 2c'), { ante: 10, acesUp: 5 }, 30);
    expect(r.win).toBe(true);
    expect(r.ret).toEqual({ ante: 40, play: 60, acesUp: 50 });
    const tie = settleFcp(C('Ks Kd 7c 4h 2s'), C('Kh Kc 7d 4s 3d 2c'), { ante: 10, acesUp: 0 }, 10);
    expect(tie.win).toBe(true);
  });
  it('simple strategy keeps the ante house edge small', () => {
    const rng = seededRng(4);
    let net = 0;
    const N = 80000;
    for (let n = 0; n < N; n++) {
      const { hand } = deal(rng, 11);
      const p = hand.slice(0, 5);
      const d = hand.slice(5);
      const m = playMultiple(p);
      const r = settleFcp(p, d, { ante: 1, acesUp: 0 }, m);
      net += r.ret.ante + r.ret.play - 1 - m;
    }
    const edge = -net / N;
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(0.06);
  });
});

describe("3 Card Hold'em", () => {
  it('dealer qualifies with a pair of 4s', () => {
    expect(h3Qual(eval3(C('4s 4d 2c')))).toBe(true);
    expect(h3Qual(eval3(C('3s 3d Ac')))).toBe(false);
  });
  it('settles ante and raises', () => {
    const r = settleH3(C('9s 9d'), C('3c 2h'), C('9c Kd 6s'), { ante: 10, pairSuited: 0, straightUp: 0 }, 20, false);
    expect(r.qualifies).toBe(false);
    expect(r.ret).toMatchObject({ ante: 10, raise: 40 });
    const q = settleH3(C('As Ad'), C('5c 5h'), C('Ac 2d 7s'), { ante: 10, pairSuited: 0, straightUp: 0 }, 10, false);
    expect(q.ret).toMatchObject({ ante: 20, raise: 20 });
  });
  it('side bets', () => {
    expect(pairOrSuited(C('As Ks'))).toBe(30);
    expect(pairOrSuited(C('Qs Qd'))).toBe(4);
    expect(pairOrSuited(C('2s 9s'))).toBe(1);
    expect(straightOrUp(C('Ah Kh Qh 4c 4d'))).toBe(100);
    expect(straightOrUp(C('5h 6h 7h 4c 9d'))).toBe(10);
    expect(straightOrUp(C('5h 6d 7c 2c 9d'))).toBe(1);
  });
  it('strategy edge is close to the published ~3%', () => {
    const rng = seededRng(8);
    let net = 0;
    const N = 80000;
    for (let n = 0; n < N; n++) {
      const { hand } = deal(rng, 7);
      const pocket = hand.slice(0, 2);
      const dealer = hand.slice(2, 4);
      const board = hand.slice(4);
      let raise = 0;
      let folded = false;
      if (raiseFirst(pocket, board[0])) {
        raise = 1;
        if (raiseSecond(pocket, board.slice(0, 2))) raise = 2;
      } else folded = true;
      const r = settleH3(pocket, dealer, board, { ante: 1, pairSuited: 0, straightUp: 0 }, raise, folded);
      net += r.ret.ante + r.ret.raise - 1 - raise;
    }
    const edge = -net / N;
    expect(edge).toBeGreaterThan(0.005);
    expect(edge).toBeLessThan(0.07);
  });
});

describe('Russian Poker', () => {
  it('pays like Caribbean when the dealer qualifies; buying keeps the ante unpaid', () => {
    const r = settleRus(C('9s 9d 9c 4h 2s'), C('As Kd 7c 5h 3s'), 10, true, false);
    expect(r.ret).toEqual({ ante: 20, call: 80 });
    const b = settleRus(C('9s 9d 9c 4h 2s Kc'), C('As Kd 7c 5h 3s'), 10, true, true);
    expect(b.ret).toEqual({ ante: 10, call: 80 });
    const nq = settleRus(C('2s 5d 9c Th Js'), C('Qs Jd 7c 5h 3s'), 10, true, false);
    expect(nq.ret).toEqual({ ante: 20, call: 20 });
  });
  it('dealer replaces his highest card when the player buys a game', () => {
    const queue = C('2c');
    const out = dealerReplace(C('Qs Jd 7c 5h 3s'), () => queue.shift()!);
    expect(out).toEqual(C('2c Jd 7c 5h 3s'));
  });
  it('advice', () => {
    expect(rusAdvice(C('9s 9d 4c 7h 2s'), C('Kc')[0]).move).toBe('call');
    expect(rusAdvice(C('2s 7s 9s Js 4d'), C('Kc')[0])).toEqual({ move: 'swap', swap: [4] });
    expect(rusAdvice(C('2s 7d 9c Js 4d'), C('Kc')[0]).move).toBe('fold');
  });
});

describe('Double Draw Poker', () => {
  it('evaluates jokers', () => {
    expect(ddEval([...C('As Ad Ac Ah'), 52]).key).toBe('fiveAces');
    expect(ddEval([...C('Ks Qs Js Ts'), 52]).key).toBe('wildRoyal');
    expect(ddEval(C('As Ks Qs Js Ts')).key).toBe('naturalRoyal');
    expect(ddEval([...C('5h 6h 7h 9h'), 52]).key).toBe('straightFlush');
    expect(ddEval([...C('2h 9d 5c Ks'), 52]).key).toBe('none');
    expect(ddEval([...C('Kh Kd 5c 9s'), 52]).key).toBe('none'); // KK + an ace kicker
    expect(ddEval([...C('Kh Kd 5c 5s'), 52]).key).toBe('twoPair');
    expect(ddEval([...C('Kh Kd Kc 9s'), 52]).key).toBe('trips');
    expect(ddEval([...C('Ah Ad Kc 9s'), 52]).key).toBe('trips');
    expect(ddEval([...C('2h 3d 4c 6s'), 52]).key).toBe('straight');
    expect(ddEval([...C('2h 3h 9h'), 52, 53]).key).toBe('flush');
  });
  it('pays all wagers 1:1 on two pair or better plus the bonus table', () => {
    const r = settleDD(C('9s 9d 9c 4h 2s'), { ante: 10, bonus: 10, draw1: 10, draw2: 10 });
    expect(r.ret).toEqual({ ante: 20, bonus: 20, draw1: 20, draw2: 20 });
    const tp = settleDD(C('9s 9d 4c 4h 2s'), { ante: 10, bonus: 10, draw1: 10, draw2: 10 });
    expect(tp.ret.bonus).toBe(10);
    const l = settleDD(C('9s 9d 5c 4h 2s'), { ante: 10, bonus: 10, draw1: 10, draw2: 10 });
    expect(l.ret).toEqual({ ante: 0, bonus: 0, draw1: 0, draw2: 0 });
    expect(finalUnits(C('9s 9d 5c 4h 2s'))).toBe(-4);
  });
  it('advice', () => {
    expect(firstDrawAdvice(C('9s 9d 5c 4h 2s')).hold.sort()).toEqual([0, 1]);
    expect(firstDrawAdvice(C('2s 7d 9c Jh 4d')).cont).toBe(false);
    const hand = C('9s 9d 4c 4h 2s');
    const rest = Array.from({ length: 52 }, (_, i) => i).filter((c) => !hand.includes(c));
    const a = secondDrawAdvice(hand, [...rest, 52, 53]);
    expect(a.cont).toBe(true);
    expect(a.discard).toBe(4);
  });
  it('a full round with the hints returns a sane amount', () => {
    const rng = seededRng(2);
    let net = 0;
    const N = 3000;
    for (let n = 0; n < N; n++) {
      const { hand, rest } = deal(rng, 5, [52, 53]);
      let cards = hand.slice();
      const f = firstDrawAdvice(cards);
      if (!f.cont) {
        net -= 2;
        continue;
      }
      let k = 0;
      cards = cards.map((c, i) => (f.hold.includes(i) ? c : rest[k++]));
      const unseen = rest.slice(k);
      const s = secondDrawAdvice(cards, unseen);
      if (!s.cont) {
        net -= 3;
        continue;
      }
      if (s.discard !== null) cards[s.discard] = unseen[0];
      net += finalUnits(cards);
    }
    const perHand = net / N;
    expect(perHand).toBeGreaterThan(-2.5);
    expect(perHand).toBeLessThan(0.5);
  });
});

describe('Trump 21', () => {
  it('deals an 11-card deck and finds the closest to the target', () => {
    const d = new Duel(seededRng(1));
    d.start();
    expect(d.player.length).toBe(2);
    expect(d.dealer.length).toBe(2);
    expect(d.deck.length).toBe(7);
    expect(new Set([...d.player, ...d.dealer, ...d.deck]).size).toBe(11);
    d.player = [10, 11];
    d.dealer = [9, 8];
    expect(d.outcome()).toBe(1);
    d.player = [10, 11, 5];
    expect(d.outcome()).toBe(-1);
    d.dealer = [9, 8, 7, 2];
    expect(d.outcome()).toBe(-1); // both bust on 26: ties go to the dealer
    d.dealer = [9, 8, 7, 3];
    expect(d.outcome()).toBe(1); // both bust: the lower total wins
  });
  it('trumps change the rules', () => {
    const d = new Duel(seededRng(3));
    d.start();
    d.trumps.player = ['line24', 'recall', 'burn', 'precision', 'guard'];
    d.useTrump('player', 'line24');
    expect(d.target).toBe(24);
    const before = d.player.length;
    d.useTrump('player', 'precision');
    expect(d.player.length).toBe(before + 1);
    d.useTrump('player', 'recall');
    expect(d.player.length).toBe(before);
    const dl = d.dealer.length;
    d.useTrump('player', 'burn');
    expect(d.dealer.length).toBe(dl - 1);
    d.useTrump('player', 'guard');
    expect(d.guard).toBe(true);
    d.player = [10, 11, 5];
    d.dealer = [9, 3];
    expect(d.outcome()).toBe(-1);
    expect(d.payout(20)).toBe(10);
  });
  it('is against the house: the simple odds rule without trumps loses clearly (−15% to −45%)', () => {
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
      ev += d.outcome();
    }
    // ties go to the dealer, and he plays his trumps; the strong strategy's figures are in tests/trump21.test.ts
    expect(ev / N).toBeLessThan(-0.15);
    expect(ev / N).toBeGreaterThan(-0.45);
  });
  it('dealer AI always finishes the round', () => {
    for (let s = 0; s < 300; s++) {
      const d = new Duel(seededRng(s));
      d.start();
      let guard = 0;
      while (!d.over && guard++ < 40) {
        if (d.advice() === 'hit') d.hit('player');
        else d.stand('player');
        if (!d.over) d.dealerTurn();
      }
      expect(d.over || d.deck.length === 0).toBe(true);
    }
  });
});

import { TRUMPS, type TrumpId } from '../src/games/trump21/rules';

describe('Trump 21 — trump variations', () => {
  const fresh = (seed: number, trumps: TrumpId[]) => {
    const d = new Duel(seededRng(seed));
    d.start();
    d.trumps.player = trumps.slice();
    d.trumps.dealer = [];
    return d;
  };
  it('has 57 trumps with unique ids', () => {
    expect(TRUMPS.length).toBe(57);
    expect(new Set(TRUMPS.map((t) => t.id)).size).toBe(57);
  });
  it('draw control: feather, calls, twin, redraw', () => {
    const d = fresh(5, ['feather', 'twin', 'redraw']);
    const low = Math.min(...d.deck);
    d.useTrump('player', 'feather');
    expect(d.player[d.player.length - 1]).toBe(low);
    const n = d.player.length;
    d.useTrump('player', 'twin');
    expect(d.player.length).toBe(n + 2);
    const last = d.player[d.player.length - 1];
    d.useTrump('player', 'redraw');
    expect(d.player.length).toBe(n + 2);
    expect(d.player[d.player.length - 1]).not.toBe(last);
    expect(d.deck).toContain(last);
    const c = fresh(6, ['call2', 'call4', 'call6']);
    for (const id of ['call2', 'call4', 'call6'] as const) {
      const v = Number(id.slice(4));
      if (c.deck.includes(v)) {
        c.useTrump('player', id);
        expect(c.player).toContain(v);
      } else expect(c.canUse('player', id)).toBe(false);
    }
  });
  it('information: foresight shows the top card, reshuffle hides it again', () => {
    const d = fresh(7, ['foresight', 'reshuffle']);
    const ev = d.useTrump('player', 'foresight');
    expect(ev.some((e) => e.t === 'foresee' && e.value === d.deck[0])).toBe(true);
    expect(d.nextCard).toBe(d.deck[0]);
    const p = d.total('player');
    expect(d.advice()).toBe(p + d.deck[0] <= d.target ? 'hit' : 'stand');
    d.useTrump('player', 'reshuffle');
    expect(d.nextCard).toBe(null);
  });
  it('targets: line 27 and reset 21', () => {
    const d = fresh(8, ['line27', 'reset21']);
    d.useTrump('player', 'line27');
    expect(d.target).toBe(27);
    d.useTrump('player', 'reset21');
    expect(d.target).toBe(21);
  });
  it('attacks: force, freeze, shatter, pickpocket, blindfold', () => {
    const d = fresh(9, ['force', 'freeze', 'shatter', 'pickpocket', 'blindfold']);
    d.trumps.dealer = ['line17', 'burn', 'precision'];
    const dn = d.dealer.length;
    d.useTrump('player', 'force');
    expect(d.dealer.length).toBe(dn + 1);
    d.useTrump('player', 'freeze');
    const ev = d.dealerTurn();
    expect(ev.some((e) => e.t === 'stand' && e.side === 'dealer')).toBe(true);
    expect(d.dealer.length).toBe(dn + 1);
    d.useTrump('player', 'shatter');
    expect(d.trumps.dealer.length).toBe(2);
    d.useTrump('player', 'pickpocket');
    expect(d.trumps.dealer.length).toBe(1);
    expect(d.trumps.player.length).toBe(2); // blindfold + the stolen trump
    d.useTrump('player', 'blindfold');
    d.trumps.dealer = ['recall'];
    d.dealer.push(11, 11);
    d.dealerTurn();
    expect(d.trumps.dealer).toEqual(['recall']); // blindfolded: can't play it
  });
  it('stakes: fortress refunds a loss, bounty pays 2:1', () => {
    const d = fresh(10, ['fortress', 'bounty']);
    d.useTrump('player', 'fortress');
    d.player = [10, 11, 5];
    d.dealer = [9, 8];
    expect(d.payout(20)).toBe(20);
    d.useTrump('player', 'bounty');
    d.player = [10, 11];
    expect(d.payout(20)).toBe(60);
  });
  it('a frozen player can only stand', () => {
    const d = fresh(11, []);
    d.frozen.player = true;
    const n = d.player.length;
    d.hit('player');
    expect(d.player.length).toBe(n);
    expect(d.frozen.player).toBe(false);
  });
  it('rare trumps are dealt less often than common ones', () => {
    const counts: Record<string, number> = {};
    for (let s = 0; s < 3000; s++) {
      const d = new Duel(seededRng(s));
      d.start();
      for (const id of d.trumps.player) counts[id] = (counts[id] ?? 0) + 1;
    }
    expect((counts.call5 ?? 0)).toBeGreaterThan((counts.bounty ?? 0) * 2.5);
  });
});
