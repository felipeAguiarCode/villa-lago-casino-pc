import { describe, expect, it } from 'vitest';
import { freshDeck, parseCard, parseCards, Shoe, type Card } from '../src/core/cards';
import { seededRng, type Rng } from '../src/core/rng';
import { BlackjackRound, bjValue, handValue, type Actions } from '../src/games/blackjack/rules';
import { basicStrategy } from '../src/games/blackjack/strategy';
import { MINDSETS, newMemory, remember, type Mindset } from '../src/games/partybj/mindset';
import { drawRegulars, replacementFor, ROSTER } from '../src/games/partybj/roster';
import {
  aiBet,
  aiMove,
  closeSpot,
  countedMove,
  HiLo,
  hiLoTag,
  isBroke,
  PartyRound,
  playOut,
  settleHand,
  shownCards,
  type AiRead,
  type SeatIn,
} from '../src/games/partybj/rules';

const ALL: Actions = { hit: true, stand: true, double: true, split: true };
const NO_DBL: Actions = { hit: true, stand: true, double: false, split: false };
const c = (s: string) => parseCards(s);
const up = (s: string) => parseCard(s);
/** An rng that always returns the same draw (clamped to the range). */
const fixed = (k: number): Rng => (n) => Math.min(k, n - 1);
/** A read of the table: true count and the regular's streak. */
const at = (tc: number, streak = 0): AiRead => ({ tc, streak });

function rigged(codes: string, seed = 1) {
  const shoe = new Shoe(6, 0.75, seededRng(seed));
  shoe.stack = parseCards(codes);
  return shoe;
}

const UPS = ['2s', '3h', '4d', '5c', '6s', '7h', '8d', '9c', 'Ts', 'Ah'].map(up);
const HANDS = ['Ts 2d', 'Ts 3d', 'Ts 4d', 'Ts 5d', 'Ts 6d', '9s 7d', '5c 6h', '4c 6h', '4c 5h', '3c 5h', 'As 2d', 'As 4d', 'As 6d', 'As 7d', 'As 8d', '8s 8d', '9s 9h', 'Ts Kd', '2s 2h', '6s 6d', '7s 7d', 'As Ad', '4s 4d', '5s 5d', 'Ts 9d', '2c 3h 4d'].map(c);

describe('counting', () => {
  it('Hi-Lo tags: 2–6 count +1, 7–9 count 0, tens and Aces count −1', () => {
    expect(c('2s 3h 4d 5c 6s').map(hiLoTag)).toEqual([1, 1, 1, 1, 1]);
    expect(c('7s 8h 9d').map(hiLoTag)).toEqual([0, 0, 0]);
    expect(c('Ts Jh Qd Kc As').map(hiLoTag)).toEqual([-1, -1, -1, -1, -1]);
    // a balanced count: a whole shoe adds up to zero
    const count = new HiLo(6);
    count.see(freshDeck(6));
    expect(count.running).toBe(0);
    expect(count.seen).toBe(312);
  });

  it('the true count is the running count per deck still unseen', () => {
    const count = new HiLo(6);
    expect(count.trueCount).toBe(0);
    count.see(c('As Kd 5c 2h 3s'));
    expect(count.running).toBe(1);
    expect(count.decksLeft).toBeCloseTo(307 / 52, 12);
    expect(count.trueCount).toBeCloseTo(52 / 307, 12);
    // two decks seen with a running count of +8: four decks left, true count +2
    count.reset();
    const low = freshDeck(2).filter((x) => hiLoTag(x) >= 0);
    const tens = freshDeck(2).filter((x) => hiLoTag(x) < 0);
    count.see([...low, ...tens.slice(0, tens.length - 8)]);
    expect(count.seen).toBe(104 - 8);
    count.see(c('7s 8s 9s 7h 8h 9h 7d 8d'));
    expect(count.seen).toBe(104);
    expect(count.running).toBe(8);
    expect(count.trueCount).toBeCloseTo(2, 12);
    count.reset();
    expect([count.running, count.seen, count.trueCount]).toEqual([0, 0, 0]);
  });

  it('counts the cards that show: seat cards and the up card at the deal, the hole card when flipped', () => {
    const r = new PartyRound(rigged('2s 3s 4s 5s 6s 9h 2d 3d 4d 5d 6d 7h Kc'), [0, 1, 2, 3, 4].map(() => ({ bet: 10, mind: null })));
    const shown = shownCards(r.deal(), r.dealer);
    expect(shown).toEqual(c('2s 3s 4s 5s 6s 9h 2d 3d 4d 5d 6d'));
    for (let s = 0; s < 5; s++) r.act(s, 'stand');
    const dv = r.playDealer();
    // the hole 7h, then the dealer's draw (16 takes the King)
    expect(shownCards(dv, r.dealer)).toEqual(c('7h Kc'));
  });

  it('playOut counts every card of the round as it shows', () => {
    const rng = seededRng(4);
    const shoe = new Shoe(6, 0.8, seededRng(5));
    const count = new HiLo(6);
    let all: Card[] = [];
    for (let i = 0; i < 40; i++) {
      const r = new PartyRound(shoe, MINDSETS.map((mind) => ({ bet: 10, mind })));
      playOut(r, [1e9, 1e9, 1e9, 1e9, 1e9], rng, count);
      all = [...all, ...r.dealer, ...r.seats.flatMap((s) => s.round.hands.flatMap((h) => h.cards))];
      expect(count.seen).toBe(all.length);
      expect(count.running).toBe(all.reduce((a, x) => a + hiLoTag(x), 0));
    }
  });
});

describe('mindsets', () => {
  it('calculated is basic strategy plus the index plays (one true count above zero: only 16 v 10 differs)', () => {
    for (const h of HANDS)
      for (const u of UPS)
        for (const can of [ALL, NO_DBL]) {
          const m = aiMove('calculated', h, u, can, at(0.5), fixed(0));
          const v = handValue(h);
          const sixteenVsTen = !v.soft && v.total === 16 && bjValue(u) === 10 && !(can.split && bjValue(h[0]) === 8);
          expect(m).toBe(sixteenVsTen ? 'stand' : basicStrategy(h, u, can.double, can.split));
        }
  });

  it('calculated deviates at the indexes', () => {
    // [hand, up card, true count just short, move there, true count at the index, deviation]
    const cases: [string, string, number, string, number, string][] = [
      ['Ts 6d', 'Kh', -0.5, 'hit', 0, 'stand'],
      ['9s 6d', 'Th', 3.9, 'hit', 4, 'stand'],
      ['Ts 2d', '3h', 1.9, 'hit', 2, 'stand'],
      ['Ts 2d', '2h', 2.9, 'hit', 3, 'stand'],
      ['9s 7d', '9h', 4.9, 'hit', 5, 'stand'],
      ['6s 5d', 'Ah', 0.9, 'hit', 1, 'double'],
      ['6s 4d', 'Th', 3.9, 'hit', 4, 'double'],
      ['6s 4d', 'Ah', 3.9, 'hit', 4, 'double'],
      ['5s 4d', '2h', 0.9, 'hit', 1, 'double'],
      ['5s 4d', '7h', 2.9, 'hit', 3, 'double'],
      ['Ts 3d', '2h', -0.9, 'stand', -1, 'hit'],
      ['Ts 2d', '4h', 0, 'stand', -0.1, 'hit'],
      ['Ts 2d', '5h', -1.9, 'stand', -2, 'hit'],
      ['Ts 2d', '6h', -0.9, 'stand', -1, 'hit'],
      ['Ts 3d', '3h', -1.9, 'stand', -2, 'hit'],
      ['Ts Kd', '5h', 4.9, 'stand', 5, 'split'],
      ['Qs Jd', '6h', 3.9, 'stand', 4, 'split'],
    ];
    for (const [h, u, short, book, idx, dev] of cases) {
      expect(countedMove(c(h), up(u), ALL, short), `${h} v ${u} @${short}`).toBe(book);
      expect(countedMove(c(h), up(u), ALL, idx), `${h} v ${u} @${idx}`).toBe(dev);
      expect(aiMove('calculated', c(h), up(u), ALL, at(idx), fixed(0))).toBe(dev);
    }
    // a double it can't make falls back to the hit; tens it can't split stand
    expect(countedMove(c('6s 5d'), up('Ah'), NO_DBL, 3)).toBe('hit');
    expect(countedMove(c('Ts Kd'), up('5h'), NO_DBL, 6)).toBe('stand');
    // multi-card hands use the hard-total indexes too
    expect(countedMove(c('9s 4d 3c'), up('Th'), NO_DBL, 0.2)).toBe('stand');
    // a pair of 8s still splits against a ten at any count
    for (const tc of [-3, 0, 5]) expect(countedMove(c('8s 8d'), up('Th'), ALL, tc)).toBe('split');
    // soft hands keep the book
    expect(countedMove(c('As 5d'), up('Th'), ALL, 6)).toBe('hit');
  });

  it('aggressive presses: soft doubles, every 9–11, more splits', () => {
    expect(aiMove('aggressive', c('As 2d'), up('2h'), ALL, at(0), fixed(0))).toBe('double'); // soft 13 v 2
    expect(aiMove('aggressive', c('As 7d'), up('2h'), ALL, at(0), fixed(0))).toBe('double'); // soft 18 v 2
    expect(aiMove('aggressive', c('As 7d'), up('7h'), ALL, at(0), fixed(0))).toBe('stand');
    expect(aiMove('aggressive', c('As 7d'), up('2h'), NO_DBL, at(0), fixed(0))).toBe('stand');
    expect(aiMove('aggressive', c('5s 4d'), up('Ah'), ALL, at(0), fixed(0))).toBe('double'); // 9 v A
    expect(aiMove('aggressive', c('5s 5d'), up('Th'), ALL, at(0), fixed(0))).toBe('double'); // 10 v 10
    expect(aiMove('aggressive', c('6s 5d'), up('Ah'), ALL, at(0), fixed(0))).toBe('double'); // 11 v A
    expect(aiMove('aggressive', c('9s 9d'), up('Ah'), ALL, at(0), fixed(0))).toBe('split');
    expect(aiMove('aggressive', c('9s 9d'), up('7h'), ALL, at(0), fixed(0))).toBe('split');
    expect(aiMove('aggressive', c('6s 6d'), up('7h'), ALL, at(0), fixed(0))).toBe('split');
    expect(aiMove('aggressive', c('2s 2d'), up('7h'), ALL, at(0), fixed(0))).toBe('split');
    expect(aiMove('aggressive', c('7s 7d'), up('8h'), ALL, at(0), fixed(0))).toBe('hit');
    expect(aiMove('aggressive', c('Ts Kd'), up('6h'), ALL, at(0), fixed(0))).toBe('stand');
    expect(aiMove('aggressive', c('Ts 2d'), up('3h'), ALL, at(0), fixed(0))).toBe('hit');
    expect(aiMove('aggressive', c('Ts 2d'), up('4h'), ALL, at(0), fixed(0))).toBe('stand');
    expect(aiMove('aggressive', c('Ts 6d'), up('Th'), ALL, at(5), fixed(0))).toBe('hit'); // it doesn't count
  });

  it('conservative avoids variance: few doubles, Aces and 8s only, stands early', () => {
    expect(aiMove('conservative', c('Ts 2d'), up('2h'), ALL, at(0), fixed(0))).toBe('stand');
    expect(aiMove('conservative', c('Ts 6d'), up('9h'), ALL, at(0), fixed(0))).toBe('stand');
    expect(aiMove('conservative', c('9s 6d'), up('Th'), ALL, at(0), fixed(0))).toBe('stand');
    expect(aiMove('conservative', c('Ts 6d'), up('Ah'), ALL, at(0), fixed(0))).toBe('hit');
    expect(aiMove('conservative', c('Ts 3d'), up('7h'), ALL, at(0), fixed(0))).toBe('hit');
    expect(aiMove('conservative', c('As 7d'), up('4h'), ALL, at(0), fixed(0))).toBe('stand'); // no soft double
    expect(aiMove('conservative', c('As 6d'), up('4h'), ALL, at(0), fixed(0))).toBe('hit');
    expect(aiMove('conservative', c('5c 6h'), up('6h'), ALL, at(0), fixed(0))).toBe('double');
    expect(aiMove('conservative', c('5c 6h'), up('Th'), ALL, at(0), fixed(0))).toBe('hit');
    expect(aiMove('conservative', c('5c 4h'), up('4h'), ALL, at(0), fixed(0))).toBe('hit'); // 9: no double
    expect(aiMove('conservative', c('8s 8d'), up('Th'), ALL, at(0), fixed(0))).toBe('split');
    expect(aiMove('conservative', c('As Ad'), up('6h'), ALL, at(0), fixed(0))).toBe('split');
    expect(aiMove('conservative', c('9s 9d'), up('6h'), ALL, at(0), fixed(0))).toBe('stand');
    expect(aiMove('conservative', c('2s 2d'), up('4h'), ALL, at(0), fixed(0))).toBe('hit');
    expect(aiMove('conservative', c('7s 7d'), up('6h'), ALL, at(0), fixed(0))).toBe('stand');
  });

  it('hybrid plays like the counter, but leans with its streak on close spots', () => {
    const rng = seededRng(3);
    for (const h of HANDS)
      for (const u of UPS)
        for (const tc of [-2.5, -1, 0, 0.5, 2, 4.5])
          expect(aiMove('hybrid', h, u, ALL, at(tc, rng(3) - 1), fixed(0))).toBe(countedMove(h, u, ALL, tc));
    // 16 v 10 near its index: presses after wins, plays safe after losses
    expect(aiMove('hybrid', c('9s 7d'), up('Th'), ALL, at(0.5, 2), fixed(0))).toBe('hit');
    expect(aiMove('hybrid', c('9s 7d'), up('Th'), ALL, at(-0.5, -3), fixed(0))).toBe('stand');
    expect(aiMove('hybrid', c('9s 7d'), up('Th'), ALL, at(3, 2), fixed(0))).toBe('stand'); // a clear spot
    // 11 v A near its index
    expect(aiMove('hybrid', c('6s 5d'), up('Ah'), ALL, at(0.2, 2), fixed(0))).toBe('double');
    expect(aiMove('hybrid', c('6s 5d'), up('Ah'), ALL, at(1.5, -2), fixed(0))).toBe('hit');
    // tens against a 6 near its index
    expect(aiMove('hybrid', c('Ts Kd'), up('6h'), ALL, at(3.5, 2), fixed(0))).toBe('split');
    expect(aiMove('hybrid', c('Ts Kd'), up('6h'), ALL, at(4.2, -2), fixed(0))).toBe('stand');
    // soft doubles
    expect(aiMove('hybrid', c('As 7d'), up('4h'), ALL, at(0, -2), fixed(0))).toBe('stand');
    expect(aiMove('hybrid', c('As 6d'), up('4h'), ALL, at(0, -2), fixed(0))).toBe('hit');
    expect(aiMove('hybrid', c('As 7d'), up('4h'), ALL, at(0, 2), fixed(0))).toBe('double');
    // clear spots don't move
    for (const s of [-4, 4]) {
      expect(aiMove('hybrid', c('6s 5d'), up('6h'), ALL, at(0, s), fixed(0))).toBe('double');
      expect(aiMove('hybrid', c('8s 8d'), up('Th'), ALL, at(0, s), fixed(0))).toBe('split');
    }
    expect(closeSpot(c('8s 8d'), up('Th'), ALL, 0)).toBeNull();
    expect(closeSpot(c('9s 7d'), up('Th'), ALL, 0)).toEqual({ press: 'hit', tight: 'stand' });
  });

  it('hunch follows the book three times in four and deviates legally otherwise', () => {
    expect(aiMove('hunch', c('Ts 6d'), up('Th'), ALL, at(0), fixed(1))).toBe('hit');
    expect(aiMove('hunch', c('Ts 6d'), up('Th'), NO_DBL, at(0), fixed(0))).toBe('stand');
    // never hits or doubles a hard 19+
    for (let k = 0; k < 4; k++) expect(aiMove('hunch', c('Ts 9d'), up('6h'), NO_DBL, at(0), fixed(k))).toBe('stand');
    const rng = seededRng(7);
    let off = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (aiMove('hunch', c('Ts 6d'), up('Th'), ALL, at(0), rng) !== 'hit') off++;
    expect(off / n).toBeGreaterThan(0.2);
    expect(off / n).toBeLessThan(0.3);
  });

  it('every mindset always picks a legal move', () => {
    const rng = seededRng(11);
    const shoe = new Shoe(6, 0.75, seededRng(3));
    for (let i = 0; i < 3000; i++) {
      const n = 2 + rng(3);
      const cards: Card[] = Array.from({ length: n }, () => shoe.draw());
      if (handValue(cards).total >= 21) continue;
      const pair = n === 2 && bjValue(cards[0]) === bjValue(cards[1]);
      const can: Actions = { hit: rng(8) !== 0, stand: true, double: n === 2 && rng(2) === 0, split: pair && rng(2) === 0 };
      for (const m of MINDSETS) {
        const move = aiMove(m, cards, shoe.draw(), can, at(rng(13) - 6, rng(9) - 4), rng);
        expect(can[move], `${m} ${move}`).toBe(true);
      }
    }
  });

  it('bets 10 to 200 in steps of 5 by mindset; the counter spreads with the true count', () => {
    const rng = seededRng(5);
    const ranges: Record<Mindset, [number, number]> = { calculated: [10, 120], aggressive: [60, 150], conservative: [10, 30], hybrid: [30, 200], hunch: [10, 120] };
    for (const m of MINDSETS) {
      const [lo, hi] = ranges[m];
      const mem = newMemory();
      for (let i = 0; i < 300; i++) {
        const b = aiBet(m, 10000, mem, rng(11) - 5, rng);
        expect(b % 5).toBe(0);
        expect(b).toBeGreaterThanOrEqual(lo);
        expect(b).toBeLessThanOrEqual(hi);
        remember(mem, m, rng(3) === 0 ? 2 * b : -b);
      }
    }
    const spread = [-2, 0, 0.5, 1, 1.9, 2, 2.9, 3, 6].map((tc) => aiBet('calculated', 10000, newMemory(), tc, rng));
    expect(spread).toEqual([10, 10, 30, 30, 30, 60, 60, 120, 120]);
    // hybrid presses half of a win, back to one unit after a loss
    const mem = newMemory();
    remember(mem, 'hybrid', 100);
    expect(aiBet('hybrid', 10000, mem, 0, rng)).toBe(80);
    remember(mem, 'hybrid', -80);
    expect(aiBet('hybrid', 10000, mem, 0, rng)).toBe(30);
    // never more than it has; nothing under the minimum
    for (const m of MINDSETS) {
      expect(aiBet(m, 45, newMemory(), 5, rng)).toBeLessThanOrEqual(45);
      expect(aiBet(m, 7, newMemory(), 5, rng)).toBe(0);
    }
    expect(isBroke(9)).toBe(true);
    expect(isBroke(10)).toBe(false);
  });
});

describe('the circuit', () => {
  const names = new Set(ROSTER.map((p) => p.name));

  it('seats four different regulars from the roster', () => {
    expect(names.size).toBe(ROSTER.length);
    for (let s = 0; s < 300; s++) {
      const seated = drawRegulars(4, seededRng(s));
      expect(seated).toHaveLength(4);
      expect(new Set(seated.map((p) => p.name)).size).toBe(4);
      for (const p of seated) {
        expect(names.has(p.name)).toBe(true);
        expect(p.bank).toBeGreaterThan(0);
      }
    }
    // the whole pool, and no more
    expect(new Set(drawRegulars(99, seededRng(1)).map((p) => p.name)).size).toBe(ROSTER.length);
  });

  it('never draws a regular already at the table', () => {
    const rng = seededRng(8);
    for (let i = 0; i < 300; i++) {
      const seated = drawRegulars(4, rng).map((p) => p.name);
      for (const p of drawRegulars(5, rng, seated)) expect(seated).not.toContain(p.name);
      const next = replacementFor(seated, rng);
      expect(seated).not.toContain(next.name);
      expect(names.has(next.name)).toBe(true);
    }
  });

  it('a busted regular leaves and a newcomer takes the seat (always four different faces)', () => {
    const rng = seededRng(12);
    const table = drawRegulars(4, rng);
    for (let i = 0; i < 500; i++) {
      const seat = rng(4);
      const next = replacementFor(table.map((p) => p.name), rng);
      expect(next.name).not.toBe(table[seat].name);
      table[seat] = next;
      expect(new Set(table.map((p) => p.name)).size).toBe(4);
    }
  });
});

describe('PartyRound', () => {
  const seats = (bets: number[]): SeatIn[] => bets.map((bet, i) => ({ bet, mind: i === 2 ? null : 'calculated' }));

  it('deals in seat order from first base, up card, second round, hole card', () => {
    const r = new PartyRound(rigged('2s 3s 4s 5s 6s 9h 2d 3d 4d 5d 6d 7h'), seats([10, 10, 10, 10, 10]));
    const ev = r.deal();
    const order = ev.map((e) => (e.t === 'card' ? `s${e.seat}` : e.t === 'dealer' ? (e.faceUp ? 'up' : 'hole') : e.t));
    expect(order).toEqual(['s0', 's1', 's2', 's3', 's4', 'up', 's0', 's1', 's2', 's3', 's4', 'hole']);
    expect(r.hands(0)[0].cards).toEqual(c('2s 2d'));
    expect(r.dealer).toEqual(c('9h 7h'));
    expect(r.phase).toBe('play');
  });

  it('settles every seat against the same dealer', () => {
    // pass 1: s0 Ts, s1 9h, s2 As, s3 8c, s4 5d, up 6h | pass 2: s0 6c, s1 9d, s2 Kd, s3 8s, s4 6s, hole Th
    // then: s0 hit 5c (21) · s1 hit Qs (bust) · s3 split: 3h, double 9c (20), second hand 2d, hit Kc (20)
    // s4 double 8h (19) · dealer 16 draws 3d = 19
    const shoe = rigged('Ts 9h As 8c 5d 6h 6c 9d Kd 8s 6s Th 5c Qs 3h 9c 2d Kc 8h 3d');
    const r = new PartyRound(shoe, seats([100, 50, 25, 40, 20]));
    r.deal();
    expect(r.natural(2)).toBe(true);
    expect(r.live(2)).toBe(false);
    r.act(0, 'hit');
    expect(r.live(0)).toBe(false); // 21 ends the hand
    r.act(1, 'hit');
    expect(r.live(1)).toBe(false);
    const sp = r.act(3, 'split');
    expect(sp.some((e) => e.t === 'split' && e.seat === 3)).toBe(true);
    r.act(3, 'double');
    expect(r.activeHand(3)).toBe(1);
    expect(r.hands(3)[1].cards.length).toBe(2);
    r.act(3, 'hit');
    r.act(3, 'stand');
    expect(r.live(3)).toBe(false);
    r.act(4, 'double');
    const dv = r.playDealer();
    expect(dv[0]).toEqual({ t: 'flipHole' });
    expect(r.dealer).toEqual(c('6h Th 3d'));
    expect(dv.at(-1)).toEqual({ t: 'dealerDone', total: 19, bust: false });
    const res = r.settle();
    expect(res.map((s) => s.hands)).toEqual([
      [{ outcome: 'win', bet: 100, ret: 200 }],
      [{ outcome: 'bust', bet: 50, ret: 0 }],
      [{ outcome: 'blackjack', bet: 25, ret: 62.5 }],
      [
        { outcome: 'win', bet: 80, ret: 160 },
        { outcome: 'win', bet: 40, ret: 80 },
      ],
      [{ outcome: 'push', bet: 40, ret: 40 }],
    ]);
    expect(res[3]).toMatchObject({ wager: 120, ret: 240 });
  });

  it('a dealer blackjack ends the round at once; only a blackjack pushes', () => {
    const r = new PartyRound(rigged('As Ts 9s 8s 7s Ah Kd 9d 2s 3s 4s Kh'), seats([10, 10, 10, 10, 10]));
    const ev = r.deal();
    expect(ev.find((e) => e.t === 'peek')).toEqual({ t: 'peek', dealerBJ: true });
    expect([0, 1, 2, 3, 4].some((s) => r.live(s))).toBe(false);
    expect(r.playDealer()).toEqual([]);
    // the hole card shows at once (and is counted)
    expect(shownCards(ev, r.dealer)).toContain(parseCard('Kh'));
    const res = r.settle();
    expect(res.map((s) => s.hands[0].outcome)).toEqual(['push', 'lose', 'lose', 'lose', 'lose']);
  });

  it('the dealer draws nothing when every hand busted or has a blackjack', () => {
    // s0 natural, everyone else busts; dealer 6+5 = 11 would have to draw otherwise
    const r = new PartyRound(rigged('As Ts Ts Ts Ts 6h Kd 6s 6s 6s 6s 5h Ks Ks Ks Ks'), seats([10, 10, 10, 10, 10]));
    r.deal();
    for (let s = 1; s < 5; s++) r.act(s, 'hit');
    const dv = r.playDealer();
    expect(dv).toEqual([{ t: 'flipHole' }, { t: 'dealerDone', total: 11, bust: false }]);
    expect(r.settle().map((s) => s.hands[0].outcome)).toEqual(['blackjack', 'bust', 'bust', 'bust', 'bust']);
  });

  it('a full table played by the mindsets settles each seat against the dealer', () => {
    const rng = seededRng(21);
    const minds: (Mindset | null)[] = ['aggressive', 'hunch', null, 'conservative', 'hybrid'];
    for (let i = 0; i < 400; i++) {
      const r = new PartyRound(new Shoe(6, 0.75, seededRng(100 + i)), minds.map((mind) => ({ bet: 20, mind, streak: rng(7) - 3 })));
      const res = playOut(r, [500, 500, 500, 500, 500], rng, new HiLo(6));
      const d = handValue(r.dealer).total;
      const dealerBJ = r.dealer.length === 2 && d === 21;
      res.forEach((s, seat) => {
        r.hands(seat).forEach((h, k) => {
          const p = handValue(h.cards).total;
          const nat = !h.fromSplit && h.cards.length === 2 && p === 21;
          const want = p > 21 ? 0 : dealerBJ ? (nat ? h.bet : 0) : nat ? h.bet * 2.5 : d > 21 || p > d ? h.bet * 2 : p === d ? h.bet : 0;
          expect(s.hands[k].ret).toBe(want);
        });
        expect(s.ret).toBe(s.hands.reduce((a, h) => a + h.ret, 0));
      });
      // the dealer only stops short of 17 when nobody was left to beat
      if (d < 17 && !dealerBJ) expect(res.every((s) => s.hands.every((h) => h.outcome === 'bust' || h.outcome === 'blackjack'))).toBe(true);
    }
  });

  it('a lone seat plays exactly like the Blackjack table (same engine, same cards)', () => {
    for (let i = 0; i < 3000; i++) {
      const bj = new BlackjackRound(new Shoe(6, 0.75, seededRng(500 + i)), 10);
      bj.start();
      if (bj.phase === 'insurance') bj.insurance(false);
      while (bj.phase === 'player') {
        const a = bj.actions(1e9);
        const m = basicStrategy(bj.current.cards, bj.dealerUp, a.double, a.split);
        if (m === 'hit') bj.hit();
        else if (m === 'stand') bj.stand();
        else if (m === 'double') bj.double();
        else bj.split();
      }
      const pr = new PartyRound(new Shoe(6, 0.75, seededRng(500 + i)), [{ bet: 10, mind: null }]);
      const [seat] = playOut(pr, [1e9], seededRng(1));
      expect(seat.hands).toEqual(bj.hands.map((h) => ({ outcome: h.outcome, bet: h.bet, ret: h.ret })));
      expect(pr.dealer).toEqual(bj.dealer);
    }
  });

  it('settleHand pays 3:2 for a natural, not for 21 after a split', () => {
    const h = (cards: string, fromSplit = false) => ({ cards: c(cards), bet: 10, doubled: false, done: true, fromSplit, splitAces: false });
    expect(settleHand(h('As Kd'), c('Ts 7d'))).toEqual({ outcome: 'blackjack', ret: 25 });
    expect(settleHand(h('As Kd', true), c('Ts 7d'))).toEqual({ outcome: 'win', ret: 20 });
    expect(settleHand(h('As Kd', true), c('Ts Ad'))).toEqual({ outcome: 'lose', ret: 0 });
    expect(settleHand(h('Ts 5d 6c'), c('Ts 5d 6c'))).toEqual({ outcome: 'push', ret: 10 });
  });
});

describe('RTP (seeded simulation)', () => {
  it('basic strategy returns about 99.5%; the loose mindsets give more to the house', () => {
    const rng = seededRng(2024);
    const shoe = new Shoe(6, 0.8, seededRng(99));
    const minds: (Mindset | null)[] = ['aggressive', 'hunch', null, 'conservative', 'calculated'];
    const wager = [0, 0, 0, 0, 0];
    const back = [0, 0, 0, 0, 0];
    const N = 120000;
    for (let i = 0; i < N; i++) {
      if (shoe.needsShuffle) shoe.shuffle();
      const r = new PartyRound(shoe, minds.map((mind) => ({ bet: 10, mind })));
      const res = playOut(r, [1e9, 1e9, 1e9, 1e9, 1e9], rng);
      res.forEach((s, k) => {
        wager[k] += s.wager;
        back[k] += s.ret;
      });
    }
    const rtp = back.map((b, k) => b / wager[k]);
    // the player's seat plays the book
    expect(rtp[2]).toBeGreaterThan(0.985);
    expect(rtp[2]).toBeLessThan(1.01);
    // calculated without a count (true count 0) is the book plus standing on 16 v 10
    expect(rtp[4]).toBeGreaterThan(0.985);
    expect(rtp[4]).toBeLessThan(1.01);
    // the hunch's surprises cost a lot
    expect(rtp[1]).toBeLessThan(rtp[2] - 0.02);
    console.log('RTP by seat (aggressive, hunch, player, conservative, calculated without a count):', rtp.map((x) => (x * 100).toFixed(2)).join(' / '));
  });

  it('the counting calculated regular is the best mindset and beats flat basic strategy', () => {
    // one seat per mindset and a flat basic-strategy seat, every bet sized by the mindset
    const rng = seededRng(77);
    const shoe = new Shoe(6, 0.8, seededRng(78));
    const count = new HiLo(6);
    const minds: (Mindset | null)[] = [...MINDSETS, null];
    const mems = minds.map(() => newMemory());
    const wager = minds.map(() => 0);
    const back = minds.map(() => 0);
    const N = 300000;
    for (let i = 0; i < N; i++) {
      if (shoe.needsShuffle) {
        shoe.shuffle();
        count.reset();
      }
      const tc = count.trueCount;
      const seatsIn = minds.map((mind, k) => ({ bet: mind ? aiBet(mind, 1e9, mems[k], tc, rng) : 10, mind, streak: mems[k].streak }));
      const res = playOut(new PartyRound(shoe, seatsIn), minds.map(() => 1e9), rng, count);
      res.forEach((s, k) => {
        wager[k] += s.wager;
        back[k] += s.ret;
        const mind = minds[k];
        if (mind) remember(mems[k], mind, s.ret - s.wager);
      });
    }
    const ret = back.map((b, k) => b / wager[k] - 1);
    console.log(`Return per unit bet: ${minds.map((m, k) => `${m ?? 'flat basic'} ${(ret[k] * 100).toFixed(2)}%`).join(' · ')}`);
    const [calculated, aggressive, conservative, hybrid, hunch, flat] = ret;
    for (const other of [aggressive, conservative, hybrid, hunch, flat]) expect(calculated).toBeGreaterThan(other);
    // counting with a bet spread turns the edge around
    expect(calculated).toBeGreaterThan(0);
    expect(calculated - flat).toBeGreaterThan(0.005);
    expect(flat).toBeGreaterThan(-0.015);
    expect(flat).toBeLessThan(0.01);
    expect(hunch).toBeLessThan(flat - 0.03);
  });
});
