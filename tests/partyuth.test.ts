import { describe, expect, it } from 'vitest';
import { parseCards, Shoe, type Card } from '../src/core/cards';
import { seededRng, type Rng } from '../src/core/rng';
import { drawMindset, MINDSETS, newMemory, remember, type AiMemory, type Mindset } from '../src/games/partybj/mindset';
import { drawRegulars, replacementFor, ROSTER } from '../src/games/partybj/roster';
import { BOX, boxRings, holePlace, payoutAt, ringAt, seatGeos } from '../src/games/partyuth/layout';
import {
  aiDecision,
  aiStakes,
  bookMove,
  canStay,
  closeSpot,
  fitLegal,
  flushDraw,
  legalMoves,
  MULT,
  openEnded,
  outsOf,
  PartyUthRound,
  playOut,
  preflopMargin,
  streetMoves,
  type Move,
  type SeatIn,
} from '../src/games/partyuth/rules';
import { flopRaise, hiddenMade, preflopRaise, riverBet, settleUth } from '../src/games/uth/rules';

const c = (s: string) => parseCards(s);
/** An rng that always returns the same draw (clamped to the range). */
const fixed = (k: number): Rng => (n) => Math.min(k, n - 1);
const mem = (streak = 0): AiMemory => ({ ...newMemory(), streak });
const PRE = legalMoves('pre');
const FLOP = legalMoves('flop');
const RIVER = legalMoves('river');
/** One decision with every move affordable and no streak. */
const decide = (m: Mindset, hole: string, board = '', streak = 0, rng: Rng = fixed(1)) => {
  const b = board ? c(board) : [];
  return aiDecision(m, c(hole), b, b.length === 5 ? RIVER : b.length === 3 ? FLOP : PRE, mem(streak), rng);
};

function rigged(codes: string) {
  const shoe = new Shoe(1, 1.01, seededRng(1));
  shoe.stack = parseCards(codes);
  return shoe;
}

/** A random river spot (hole, board) where `want` holds. */
function findRiver(want: (hole: Card[], board: Card[]) => boolean, seed = 1) {
  const shoe = new Shoe(1, 1.01, seededRng(seed));
  for (let i = 0; i < 20000; i++) {
    shoe.shuffle();
    const hole = [shoe.draw(), shoe.draw()];
    const board = Array.from({ length: 5 }, () => shoe.draw());
    if (want(hole, board)) return { hole, board };
  }
  throw new Error('no such river spot');
}

describe('moves', () => {
  it('each street has its own moves; a bet needs the chips to cover it', () => {
    expect(streetMoves('pre')).toEqual(['check', 'bet3', 'bet4']);
    expect(streetMoves('flop')).toEqual(['check', 'bet2']);
    expect(streetMoves('river')).toEqual(['fold', 'bet1']);
    expect(legalMoves('pre', (k) => k <= 3)).toEqual(['check', 'bet3']);
    expect(legalMoves('river', () => false)).toEqual(['fold']);
    expect(fitLegal('bet4', ['check', 'bet3'])).toBe('bet3');
    expect(fitLegal('bet4', ['check'])).toBe('check');
    expect(fitLegal('bet2', ['check'])).toBe('check');
    expect(fitLegal('bet1', ['fold'])).toBe('fold');
  });

  it('the book move is the single table hint strategy (preflopRaise / flopRaise / riverBet)', () => {
    const shoe = new Shoe(1, 1.01, seededRng(4));
    for (let i = 0; i < 600; i++) {
      shoe.shuffle();
      const hole = [shoe.draw(), shoe.draw()];
      const board = Array.from({ length: 5 }, () => shoe.draw());
      expect(bookMove('pre', hole, [])).toBe(preflopRaise(hole) ? 'bet4' : 'check');
      expect(bookMove('flop', hole, board.slice(0, 3))).toBe(flopRaise(hole, board.slice(0, 3)) ? 'bet2' : 'check');
      expect(bookMove('river', hole, board)).toBe(riverBet(hole, board) ? 'bet1' : 'fold');
    }
  });

  it('reads hands: the pre-flop margin, draws, close spots', () => {
    // margin ≥ 0 exactly when the book raises, for every two cards
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) expect(preflopMargin([a, b]) >= 0).toBe(preflopRaise([a, b]));
    expect(preflopMargin(c('3s 3d'))).toBe(0);
    expect(preflopMargin(c('2s 2d'))).toBe(-1);
    expect(preflopMargin(c('Ks 5d'))).toBe(0);
    expect(preflopMargin(c('Ks 4d'))).toBe(-1);
    expect(flushDraw(c('7h 3h'), c('Kh 9h 2c'))).toBe(true);
    expect(flushDraw(c('7s 3h'), c('Kh 9h 2h'))).toBe(true);
    expect(flushDraw(c('7s 3s'), c('Kh 9h 2h'))).toBe(false); // the hearts are all on the board
    expect(openEnded(c('8s 7d'), c('6c 5h Kd'))).toBe(true);
    expect(openEnded(c('9s 7d'), c('6c 5h Kd'))).toBe(false); // gutshot
    expect(openEnded(c('As Kd'), c('Qc Jh 2d'))).toBe(false); // only a ten makes it
    expect(openEnded(c('2s 3d'), c('4c 5h Kd'))).toBe(true); // an Ace or a six
    expect(closeSpot(c('Ks 5d'), [])).toBe(true);
    expect(closeSpot(c('As Kd'), [])).toBe(false);
    expect(closeSpot(c('2s 2d'), c('Kc 9d 5h'))).toBe(true); // pocket deuces
    expect(closeSpot(c('3s 3d'), c('9c 8d 5h'))).toBe(true); // an underpair
    expect(closeSpot(c('Ks 7d'), c('Kd 8c 2h'))).toBe(false); // top pair
  });
});

describe("the regulars' mindsets", () => {
  it('calculated plays the hint strategy', () => {
    const shoe = new Shoe(1, 1.01, seededRng(9));
    for (let i = 0; i < 300; i++) {
      shoe.shuffle();
      const hole = [shoe.draw(), shoe.draw()];
      const board = Array.from({ length: 5 }, () => shoe.draw());
      for (const b of [[], board.slice(0, 3), board]) {
        const legal = b.length === 5 ? RIVER : b.length === 3 ? FLOP : PRE;
        const street = b.length === 5 ? 'river' : b.length === 3 ? 'flop' : 'pre';
        for (const streak of [-3, 0, 3]) expect(aiDecision('calculated', hole, b, legal, mem(streak), fixed(0))).toBe(bookMove(street, hole, b));
      }
    }
  });

  it('aggressive: more 4× hands, 2× with any pair or a strong draw, bets the river unless the board plays into many outs', () => {
    for (const h of ['2s 2d', '9h 8h', 'Th 9h', 'Ac 2d', 'Ks 3s', 'Kd Tc', 'Qh Jc']) expect(decide('aggressive', h)).toBe('bet4');
    expect(preflopRaise(c('2s 2d')) || preflopRaise(c('9h 8h')) || preflopRaise(c('Th 9h'))).toBe(false);
    for (const h of ['Ks 4d', '8h 7h', '7c 2d', 'Js 9d']) expect(decide('aggressive', h)).toBe('check');
    expect(decide('aggressive', 'Qs Jd', '8h 8c 2s')).toBe('bet2'); // the board's pair
    expect(decide('aggressive', '7h 3h', 'Kh 9h 2c')).toBe('bet2'); // four to a flush (the book wants a hidden 10+)
    expect(decide('aggressive', '8s 7d', '6c 5h Kd')).toBe('bet2'); // open-ended
    expect(decide('calculated', '8s 7d', '6c 5h Kd')).toBe('check');
    expect(decide('aggressive', '9s 7d', '6c 5h Kd')).toBe('check'); // gutshot
    expect(decide('aggressive', 'Qs Jd', '8h 4c 2s')).toBe('check');
    // the board plays (A K Q 9 7) and 27 cards beat it: fold; otherwise it bets where the book folds
    expect(outsOf(c('3c 2d'), c('As Kd Qh 9c 7s'))).toBeGreaterThan(25);
    expect(decide('aggressive', '3c 2d', 'As Kd Qh 9c 7s')).toBe('fold');
    expect(decide('aggressive', '7s 2d', 'Ks Qd 9h 5c 3s')).toBe('bet1');
    expect(decide('calculated', '7s 2d', 'Ks Qd 9h 5c 3s')).toBe('fold');
  });

  it('conservative: 4× only with nines+, AK, AQ; 2× only with two pair+ using a hole card; folds the river without a hidden pair or few outs', () => {
    for (const h of ['9s 9d', 'As Ad', 'Ah Kc', 'Ah Qc']) expect(decide('conservative', h)).toBe('bet4');
    for (const h of ['8s 8d', 'Ah Js', 'Ks Qs', '3s 3d']) expect(decide('conservative', h)).toBe('check');
    expect(decide('conservative', 'Ks 7d', 'Kd 7c 2h')).toBe('bet2'); // two pair
    expect(decide('conservative', '9s 9d', '9h 4c 2s')).toBe('bet2'); // a set
    expect(decide('conservative', 'Ks 7d', 'Kd 8c 2h')).toBe('check'); // top pair: the book bets it
    expect(decide('conservative', 'Ah Kc', '8d 8c 8h')).toBe('check'); // the board's trips
    expect(decide('conservative', 'Ks 3d', 'Kd 8c 2h 5s 9c')).toBe('bet1'); // hidden pair
    expect(outsOf(c('Ah Kd'), c('Qs 8d 5c 3h 2s'))).toBeLessThan(16);
    expect(decide('conservative', 'Ah Kd', 'Qs 8d 5c 3h 2s')).toBe('bet1');
    expect(decide('conservative', '7s 2d', 'Ks Qd 9h 5c 3s')).toBe('fold');
    // 16–20 outs, nothing hidden: the book bets, conservative folds
    const s = findRiver((h, b) => !hiddenMade(h, b) && outsOf(h, b) >= 16 && outsOf(h, b) < 21);
    expect(aiDecision('conservative', s.hole, s.board, RIVER, mem(), fixed(1))).toBe('fold');
    expect(aiDecision('calculated', s.hole, s.board, RIVER, mem(), fixed(1))).toBe('bet1');
  });

  it('hybrid: the book on clear spots, leaning with its streak on the close ones, 3× with the weakest raises', () => {
    for (const k of [-3, 0, 3]) {
      expect(decide('hybrid', 'As Kd', '', k)).toBe('bet4');
      expect(decide('hybrid', '7c 2d', '', k)).toBe('check');
      expect(decide('hybrid', 'Ks 7d', 'Kd 8c 2h', k)).toBe('bet2'); // top pair: clear
    }
    // K5o is the weakest raising hand: 3×, 4× after a winning streak, a check after a losing one
    expect(decide('hybrid', 'Kc 5d', '', 0)).toBe('bet3');
    expect(decide('hybrid', 'Kc 5d', '', 2)).toBe('bet4');
    expect(decide('hybrid', 'Kc 5d', '', -2)).toBe('check');
    // K4o is the best checking hand: pressed (3×) only after a winning streak
    expect(decide('hybrid', 'Kc 4d', '', 0)).toBe('check');
    expect(decide('hybrid', 'Kc 4d', '', 2)).toBe('bet3');
    expect(decide('hybrid', 'Kc 4d', '', -2)).toBe('check');
    // flop: pocket deuces (the book checks), an underpair (the book bets)
    expect(decide('hybrid', '2s 2d', 'Kc 9d 5h', 0)).toBe('check');
    expect(decide('hybrid', '2s 2d', 'Kc 9d 5h', 2)).toBe('bet2');
    expect(decide('hybrid', '3s 3d', '9c 8d 5h', 0)).toBe('bet2');
    expect(decide('hybrid', '3s 3d', '9c 8d 5h', -2)).toBe('check');
    // river: 23–24 outs (the book folds) and 19–20 (the book bets); outs come in steps of a rank
    const fold = findRiver((h, b) => !hiddenMade(h, b) && outsOf(h, b) >= 23 && outsOf(h, b) <= 24, 2);
    expect(aiDecision('hybrid', fold.hole, fold.board, RIVER, mem(0), fixed(1))).toBe('fold');
    expect(aiDecision('hybrid', fold.hole, fold.board, RIVER, mem(3), fixed(1))).toBe('bet1');
    const bet = findRiver((h, b) => !hiddenMade(h, b) && outsOf(h, b) >= 19 && outsOf(h, b) <= 20, 3);
    expect(aiDecision('hybrid', bet.hole, bet.board, RIVER, mem(0), fixed(1))).toBe('bet1');
    expect(aiDecision('hybrid', bet.hole, bet.board, RIVER, mem(-3), fixed(1))).toBe('fold');
  });

  it('hunch: the book, but about one decision in four is another legal move, never folding a straight or better', () => {
    expect(decide('hunch', 'As Kd', '', 0, fixed(1))).toBe('bet4');
    expect(['check', 'bet3']).toContain(decide('hunch', 'As Kd', '', 0, fixed(0)));
    expect(decide('hunch', '7s 2d', 'Ks Qd 9h 5c 3s', 0, fixed(0))).toBe('bet1'); // the book folds
    // a made straight: the surprise can't be a fold
    expect(decide('hunch', '9s 8d', '7c 6h 5s Kd 2c', 0, fixed(0))).toBe('bet1');
    const rng = seededRng(7);
    let off = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (aiDecision('hunch', c('As Kd'), [], PRE, mem(), rng) !== 'bet4') off++;
    expect(off / n).toBeGreaterThan(0.2);
    expect(off / n).toBeLessThan(0.3);
  });

  it('every mindset always picks a legal move, also when it cannot cover a bet', () => {
    const rng = seededRng(11);
    const shoe = new Shoe(1, 1.01, seededRng(3));
    const covers = [() => true, (k: number) => k <= 3, (k: number) => k <= 1, () => false];
    for (let i = 0; i < 700; i++) {
      shoe.shuffle();
      const hole = [shoe.draw(), shoe.draw()];
      const board = Array.from({ length: 5 }, () => shoe.draw());
      for (const b of [[], board.slice(0, 3), board]) {
        const street = b.length === 5 ? 'river' : b.length === 3 ? 'flop' : 'pre';
        for (const cover of covers) {
          const legal = legalMoves(street, cover);
          for (const m of MINDSETS) expect(legal).toContain(aiDecision(m, hole, b, legal, mem(rng(7) - 3), rng));
        }
      }
    }
  });

  it('a regular never plays two hands in a row in the same mindset', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 4000; i++) {
      const m = newMemory();
      m.last = MINDSETS[rng(MINDSETS.length)];
      m.streak = rng(9) - 4;
      expect(drawMindset(ROSTER[rng(ROSTER.length)], m, 40 + rng(8000), rng)).not.toBe(m.last);
    }
    // one seat over a long night: a new mindset every hand, all five of them seen
    const seat = newMemory();
    const seen = new Set<Mindset>();
    let prev: Mindset | null = null;
    for (let i = 0; i < 2000; i++) {
      const m = drawMindset(ROSTER[0], seat, 1000 + rng(4000), rng);
      expect(m).not.toBe(prev);
      remember(seat, m, (rng(3) - 1) * 50);
      seen.add(m);
      prev = m;
    }
    expect(seen.size).toBe(MINDSETS.length);
  });

  it('stakes: an Ante of 10–100 in steps of 5 that the chips cover with a 4× Play, Trips of half the Ante', () => {
    const rng = seededRng(5);
    for (const m of MINDSETS)
      for (let i = 0; i < 300; i++) {
        const chips = 60 + rng(5000);
        const b = aiStakes(m, chips, { ...newMemory(), lastNet: rng(400) - 200 }, rng);
        expect(b.ante % 5).toBe(0);
        expect(b.ante).toBeGreaterThanOrEqual(10);
        expect(b.ante).toBeLessThanOrEqual(100);
        expect(6 * b.ante + b.trips).toBeLessThanOrEqual(chips);
        if (b.trips) expect(b.trips).toBe(Math.max(5, Math.floor(b.ante / 10) * 5));
        if (m === 'calculated') expect(b.trips).toBe(0);
      }
    expect(canStay(59)).toBe(false);
    expect(canStay(60)).toBe(true);
    for (const m of MINDSETS) {
      expect(aiStakes(m, 59, newMemory(), rng)).toEqual({ ante: 0, trips: 0 }); // broke: leaves the table
      expect(aiStakes(m, 60, newMemory(), rng).ante).toBe(10);
    }
  });
});

describe('the Villa Lago circuit', () => {
  it('four different regulars sit in, and a newcomer is never someone already seated', () => {
    const names = new Set(ROSTER.map((p) => p.name));
    expect(names.size).toBe(ROSTER.length);
    const rng = seededRng(17);
    const firsts = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const four = drawRegulars(4, rng);
      expect(four).toHaveLength(4);
      expect(new Set(four.map((p) => p.name)).size).toBe(4);
      for (const p of four) expect(names.has(p.name)).toBe(true);
      firsts.add(four[0].name);
      const seated = four.map((p) => p.name);
      const fresh = replacementFor(seated, rng);
      expect(seated).not.toContain(fresh.name);
      expect(fresh.bank).toBeGreaterThan(0);
      // every regular can cover the minimum with their bank
      for (const p of [...four, fresh]) expect(canStay(p.bank)).toBe(true);
    }
    expect(firsts.size).toBeGreaterThan(20); // a different crowd at every visit
    // with all but four excluded, the draw seats exactly those four
    const left = ROSTER.slice(-4).map((p) => p.name);
    const rest = drawRegulars(4, rng, ROSTER.slice(0, -4).map((p) => p.name));
    expect(rest.map((p) => p.name).sort()).toEqual([...left].sort());
  });
});

describe('PartyUthRound', () => {
  const seats = (antes: number[], trips = 0): SeatIn[] => antes.map((ante, i) => ({ ante, trips, mind: i === 2 ? null : 'calculated' }));

  it('deals two cards to each seat from first base and to the dealer, then the board face down', () => {
    const r = new PartyUthRound(rigged('2s 3s 4s 5s 6s 9h 2d 3d 4d 5d 6d 7h Ac Kc Qc Jc Tc'), seats([10, 10, 10, 10, 10]));
    const ev = r.deal();
    const order = ev.map((e) => (e.t === 'hole' ? `s${e.seat}` : e.t === 'dealer' ? 'd' : `b${e.i}`));
    expect(order).toEqual(['s0', 's1', 's2', 's3', 's4', 'd', 's0', 's1', 's2', 's3', 's4', 'd', 'b0', 'b1', 'b2', 'b3', 'b4']);
    expect(r.seats[0].hole).toEqual(c('2s 2d'));
    expect(r.dealer).toEqual(c('9h 7h'));
    expect(r.board).toEqual(c('Ac Kc Qc Jc Tc'));
    expect(r.street).toBe('pre');
    expect(r.shown).toEqual([]);
    expect(r.seats.every((s) => s.blind === s.ante)).toBe(true);
  });

  it('one Play bet per hand: 3×/4× pre-flop, 2× on the flop, 1× or fold on the river', () => {
    const r = new PartyUthRound(new Shoe(1, 1.01, seededRng(2)), seats([10, 20, 25, 10, 10]));
    r.deal();
    expect(r.act(0, 'bet4')).toBe(40);
    expect(r.act(1, 'bet3')).toBe(60);
    expect(r.act(2, 'bet2')).toBe(0); // not a pre-flop move
    expect(r.live(2)).toBe(true);
    r.act(2, 'check');
    r.act(3, 'check');
    r.act(4, 'check');
    expect([0, 1, 2, 3, 4].map((s) => r.live(s))).toEqual([false, false, true, true, true]);
    expect(r.act(0, 'bet4')).toBe(0); // a seat that bet makes no more decisions
    expect(r.next()).toBe('flop');
    expect(r.shown).toEqual(r.board.slice(0, 3));
    expect(r.legal(0)).toEqual([]);
    expect(r.legal(2)).toEqual(['check', 'bet2']);
    expect(r.legal(2, () => false)).toEqual(['check']);
    expect(r.act(2, 'bet2')).toBe(50);
    r.act(3, 'check');
    r.act(4, 'check');
    expect(r.next()).toBe('river');
    expect(r.shown).toEqual(r.board);
    expect(r.legal(3)).toEqual(['fold', 'bet1']);
    expect(r.act(3, 'bet1')).toBe(10);
    expect(r.act(4, 'fold')).toBe(0);
    expect(r.seats[4].folded).toBe(true);
    expect([0, 1, 2, 3, 4].some((s) => r.live(s))).toBe(false);
    expect(r.next()).toBe('show');
    expect(r.seats.map((s) => s.play)).toEqual([40, 60, 50, 10, 0]);
    expect(r.seats.map((s) => s.moves)).toEqual([['bet4'], ['bet3'], ['check', 'bet2'], ['check', 'check', 'bet1'], ['check', 'check', 'fold']]);
  });

  it('settles every seat against the same dealer and board with settleUth', () => {
    // s0 Ah Kh · s1 9c 9d · s2 7s 2d · s3 Qs Js · s4 5c 4c | dealer Kc Kd | board Th 9h 3h 2c Ks
    const r = new PartyUthRound(rigged('Ah 9c 7s Qs 5c Kc Kh 9d 2d Js 4c Kd Th 9h 3h 2c Ks'), seats([10, 10, 10, 10, 10], 5));
    r.deal();
    r.act(0, 'bet4');
    r.act(1, 'check');
    r.act(2, 'check');
    r.act(3, 'bet3');
    r.act(4, 'check');
    r.next();
    r.act(1, 'bet2');
    r.act(2, 'check');
    r.act(4, 'check');
    r.next();
    r.act(2, 'fold');
    r.act(4, 'bet1');
    r.next();
    const res = r.settle();
    r.seats.forEach((s, k) => {
      const want = settleUth(s.hole, r.dealer, r.board, { ante: 10, blind: 10, trips: 5 }, s.play, s.folded);
      expect(res[k].res.ret).toEqual(want.ret);
      expect(res[k].wager).toBe(25 + s.play);
      expect(res[k].ret).toBe(want.ret.ante + want.ret.blind + want.ret.play + want.ret.trips);
      expect(res[k].mainWager).toBe(20 + s.play);
    });
    // s0 flush (ace high, hearts) beats the dealer's trip Kings: Play 40 → 80, Ante 20, Blind 10 × 2.5, Trips 5 × 8
    expect(res[0].res.ret).toEqual({ ante: 20, blind: 25, play: 80, trips: 40 });
    // s1 trip nines lose to trip Kings; Trips still pays 3:1
    expect(res[1].res.ret).toEqual({ ante: 0, blind: 0, play: 0, trips: 20 });
    expect(res[2]).toMatchObject({ folded: true, ret: 0, wager: 25 });
  });

  it('a lone seat gets the single table cards and result (same deal order, same strategy)', () => {
    for (let i = 0; i < 1500; i++) {
      // the single table view: player, dealer, player, dealer, then the board
      const s1 = new Shoe(1, 1.01, seededRng(700 + i));
      const hole = [s1.draw()];
      const dealer = [s1.draw()];
      hole.push(s1.draw());
      dealer.push(s1.draw());
      const board = Array.from({ length: 5 }, () => s1.draw());
      let play = 0;
      let folded = false;
      if (preflopRaise(hole)) play = 40;
      else if (flopRaise(hole, board.slice(0, 3))) play = 20;
      else if (riverBet(hole, board)) play = 10;
      else folded = true;
      const want = settleUth(hole, dealer, board, { ante: 10, blind: 10, trips: 10 }, play, folded);
      const r = new PartyUthRound(new Shoe(1, 1.01, seededRng(700 + i)), [{ ante: 10, trips: 10, mind: null }]);
      const [seat] = playOut(r, seededRng(1));
      expect(r.seats[0].hole).toEqual(hole);
      expect(r.dealer).toEqual(dealer);
      expect(seat.res.ret).toEqual(want.ret);
    }
  });

  it('a full table played out: every seat ends with a bet or a fold, and only bets what it can cover', () => {
    const rng = seededRng(21);
    const minds: (Mindset | null)[] = ['aggressive', 'hunch', null, 'conservative', 'hybrid'];
    const mems = minds.map(() => newMemory());
    for (let i = 0; i < 600; i++) {
      const r = new PartyUthRound(new Shoe(1, 1.01, seededRng(100 + i)), minds.map((mind) => ({ ante: 20, trips: 5, mind })));
      const chips = [100, 60, 1e9, 40, 20]; // behind the bets: up to 4×, 3×, any, 2×, 1×
      const res = playOut(r, rng, chips, mems);
      expect(r.street).toBe('show');
      r.seats.forEach((s, k) => {
        expect(s.folded || s.play > 0).toBe(true);
        expect(chips[k]).toBeGreaterThanOrEqual(0);
        expect(res[k].res.ret).toEqual(settleUth(s.hole, r.dealer, r.board, { ante: 20, blind: 20, trips: 5 }, s.play, s.folded).ret);
        if (minds[k]) remember(mems[k], minds[k]!, res[k].ret - res[k].wager);
      });
      expect(r.seats[4].play).toBeLessThanOrEqual(20);
      // no card twice at the table
      expect(new Set([...r.dealer, ...r.board, ...r.seats.flatMap((s) => s.hole)]).size).toBe(17);
    }
  });
});

describe('layout', () => {
  it('seats spread with the stretch, the player in the middle, boxes clear of each other at 16:9', () => {
    const g = seatGeos(1.5, 1.45);
    expect(g.map((s) => s.x)).toEqual([-2.7, -1.35, 0, 1.35, 2.7].map((x) => x * 1.45));
    expect(g[2]).toMatchObject({ big: true, z: 1.5, yaw: 0 });
    for (let i = 0; i < 4; i++) expect(g[i + 1].x - g[i].x - g[i].halfW - g[i + 1].halfW).toBeGreaterThan(0.3);
    expect(seatGeos(1.5, 1).map((s) => s.x)).toEqual([-2.7, -1.35, 0, 1.35, 2.7]);
  });

  it('four labelled circles and two cards inside each box; payouts land beside the circles', () => {
    for (const b of [BOX.player, BOX.ai]) {
      const rings = boxRings(b, { trips: 'TRIPS', ante: 'ANTE', blind: 'BLIND', play: 'PLAY' });
      expect(rings.map((r) => r.label)).toEqual(['TRIPS', 'ANTE', 'BLIND', 'PLAY']);
      for (const r of rings) {
        expect(Math.abs(r.lx) + b.ringR).toBeLessThanOrEqual(b.halfW);
        expect(r.ly - b.ringR).toBeGreaterThanOrEqual(b.bottom);
      }
      // the second row of circles stays under the cards
      expect(b.row2 + b.ringR).toBeLessThan(b.cardsLy - 0.44);
      for (const i of [0, 1]) {
        const h = holePlace(b, i);
        expect(Math.abs(h.lx) + 0.63 / 2).toBeLessThanOrEqual(b.halfW);
        expect(h.ly + 0.44).toBeLessThanOrEqual(b.top);
      }
      // circles don't touch each other; payouts are beside their own circle
      expect(2 * b.ringX).toBeGreaterThan(2 * b.ringR);
      expect(b.row2).toBeGreaterThan(2 * b.ringR);
      for (const id of ['trips', 'ante', 'blind', 'play'] as const) {
        const r = ringAt(b, id);
        const p = payoutAt(b, id);
        expect(p.ly).toBe(r.ly);
        expect(Math.abs(p.lx)).toBeGreaterThan(Math.abs(r.lx));
      }
    }
  });
});

describe('RTP (seeded simulation)', () => {
  it("the player's seat returns what the single table does, whatever the regulars play", () => {
    const rng = seededRng(2024);
    const shoe = new Shoe(1, 1.01, seededRng(99));
    const regulars = drawRegulars(4, seededRng(5));
    const mems = regulars.map(() => newMemory());
    let pw = 0;
    let pb = 0;
    // 30,000 hands: about ±0.7% of noise (one hand swings ~5 Antes, the Blind pays up to 500:1).
    // 2 × 1,000,000 rounds of this table: player 99.37% ± 0.08%, single table 99.41%.
    const N = 30000;
    for (let i = 0; i < N; i++) {
      shoe.shuffle();
      const minds = regulars.map((p, k) => drawMindset(p, mems[k], p.bank, rng));
      // play order: first base, ..., the player in the middle seat, ...
      const seatsIn: SeatIn[] = [0, 1, -1, 2, 3].map((k) => ({ ante: 10, trips: 10, mind: k < 0 ? null : minds[k] }));
      const res = playOut(new PartyUthRound(shoe, seatsIn), rng, [], [0, 1, -1, 2, 3].map((k) => (k < 0 ? newMemory() : mems[k])));
      pw += res[2].mainWager;
      pb += res[2].mainRet;
      [0, 1, 3, 4].forEach((s, k) => remember(mems[k], minds[k], res[s].ret - res[s].wager));
    }
    const solo = new Shoe(1, 1.01, seededRng(98));
    let sw = 0;
    let sb = 0;
    for (let i = 0; i < N; i++) {
      solo.shuffle();
      const [seat] = playOut(new PartyUthRound(solo, [{ ante: 10, trips: 0, mind: null }]), rng);
      sw += seat.mainWager;
      sb += seat.mainRet;
    }
    const player = pb / pw;
    const single = sb / sw;
    console.log(`Ante+Blind+Play RTP: player at the full table ${(player * 100).toFixed(2)}% | single table ${(single * 100).toFixed(2)}%`);
    // published: house edge ≈ 2.2% of the Ante with perfect play, about 0.5% of the total bet
    for (const x of [player, single]) {
      expect(x).toBeGreaterThan(0.975);
      expect(x).toBeLessThan(1.015);
    }
    expect(Math.abs(player - single)).toBeLessThan(0.025);
  }, 180_000);

  it('every mindset over the same hands: calculated stays the best', () => {
    // each mindset plays every seat's cards of the same deals (with its own streaks), so only the play differs
    const rng = seededRng(77);
    const shoe = new Shoe(1, 1.01, seededRng(78));
    const mems = MINDSETS.map(() => Array.from({ length: 5 }, () => newMemory()));
    const wager: Record<string, number> = {};
    const back: Record<string, number> = {};
    for (const m of MINDSETS) wager[m] = back[m] = 0;
    const N = 6000;
    for (let i = 0; i < N; i++) {
      shoe.shuffle();
      const holes = Array.from({ length: 5 }, () => [shoe.draw(), shoe.draw()]);
      const dealer = [shoe.draw(), shoe.draw()];
      const board = Array.from({ length: 5 }, () => shoe.draw());
      holes.forEach((hole, s) =>
        MINDSETS.forEach((m, k) => {
          const me = mems[k][s];
          let play = 0;
          let folded = false;
          const pre = aiDecision(m, hole, [], PRE, me, rng);
          const flop = MULT[pre] ? pre : aiDecision(m, hole, board.slice(0, 3), FLOP, me, rng);
          const river: Move = MULT[flop] ? flop : aiDecision(m, hole, board, RIVER, me, rng);
          if (river === 'fold') folded = true;
          else play = MULT[river] * 10;
          const r = settleUth(hole, dealer, board, { ante: 10, blind: 10, trips: 0 }, play, folded);
          const ret = r.ret.ante + r.ret.blind + r.ret.play;
          wager[m] += 20 + play;
          back[m] += ret;
          remember(me, m, ret - 20 - play);
        }),
      );
    }
    const rtp = Object.fromEntries(MINDSETS.map((m) => [m, back[m] / wager[m]]));
    const perAnte = Object.fromEntries(MINDSETS.map((m) => [m, (back[m] - wager[m]) / (10 * 5 * N)]));
    console.log('Mindsets, Ante+Blind+Play RTP:', MINDSETS.map((m) => `${m} ${(rtp[m] * 100).toFixed(2)}%`).join(' / '));
    for (const m of MINDSETS) if (m !== 'calculated') expect(perAnte.calculated).toBeGreaterThan(perAnte[m]);
    // the far-off mindsets lose several percent of the Ante more per hand
    for (const m of ['aggressive', 'conservative', 'hunch']) expect(perAnte.calculated - perAnte[m]).toBeGreaterThan(0.03);
  }, 180_000);
});
