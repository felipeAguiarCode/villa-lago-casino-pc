import { describe, expect, it } from 'vitest';
import { seededRng, type Rng } from '../src/core/rng';
import { dealWeight, duelOutcome, isTargetTrump as t21Target, SINGLE_TRUMPS, TRUMPS, type TrumpId } from '../src/games/trump21/rules';
import { newMemory, type Mindset } from '../src/games/partybj/mindset';
import { drawRegulars, replacementFor, ROSTER } from '../src/games/partybj/roster';
import { aiStake, aiTurn, autoPlay, seatTurnPick, seatView, type AiPick, type DealerInfo, type TableInfo } from '../src/games/partytrump/ai';
import { compare, DEALER, DEALER_POOL, PartyDuel, partyWeight, pickTrump, PX, SEAT_POOL, targetMove, WILD, type PxEvent, type PxSeatIn } from '../src/games/partytrump/rules';
import { rtp, simulateMindsets, simulateParty, simulateSingle } from '../src/games/partytrump/sim';

const seats = (bets = [10, 10, 10, 10, 10]): PxSeatIn[] => bets.map((bet, i) => ({ bet, trumps: [], player: i === 2 }));
/** A round after the deal with chosen hands, shoe and trumps. */
function table(o: { hands?: number[][]; dealer?: number[]; shoe?: number[]; trumps?: TrumpId[][]; dealerTrumps?: TrumpId[]; seed?: number } = {}) {
  const r = new PartyDuel(seats(), o.dealerTrumps ?? [], seededRng(o.seed ?? 1));
  r.deal();
  if (o.hands) o.hands.forEach((h, i) => (r.seats[i].cards = [...h]));
  if (o.dealer) r.dealer.cards = [...o.dealer];
  if (o.shoe) r.shoe = [...o.shoe];
  r.seats.forEach((s, i) => s.trumps.splice(0, s.trumps.length, ...(o.trumps?.[i] ?? [])));
  if (!o.dealerTrumps) r.dealer.trumps.splice(0);
  return r;
}
const standAll = (r: PartyDuel, except: number[] = []) => r.seats.forEach((_, i) => !except.includes(i) && r.live(i) && r.stand(i));

describe('Party Trump 21 — the table', () => {
  it('deals two cards to every seat in order and two to the dealer from a 55-card shoe', () => {
    const r = new PartyDuel(seats(), [], seededRng(3));
    const ev = r.deal();
    const order = ev.filter((e) => e.t === 'card').map((e) => (e.t === 'card' ? `${e.who === DEALER ? 'D' : e.who}${e.hidden ? 'h' : ''}` : ''));
    expect(order).toEqual(['0h', '1h', '2h', '3h', '4h', 'Dh', '0', '1', '2', '3', '4', 'D']);
    expect(r.shoe.length).toBe(55 - 12);
    const all = [...r.shoe, ...r.dealer.cards, ...r.seats.flatMap((s) => s.cards)];
    for (let v = 1; v <= 11; v++) expect(all.filter((x) => x === v).length).toBe(PX.decks);
    // one trump each at the deal, two for the dealer
    expect(r.seats.every((s) => s.trumps.length === 1)).toBe(true);
    expect(r.dealer.trumps.length).toBe(2);
  });

  it('compares like Trump 21 when the targets are the same', () => {
    for (const T of [17, 21, 24, 27])
      for (let p = 5; p <= 35; p++) for (let d = 5; d <= 35; d++) expect(compare(p, T, d, T)).toBe(duelOutcome(p, d, T));
    // own targets: each hand against its own; ties (the same distance) go to the dealer
    expect(compare(24, 24, 20, 21)).toBe(1); // on target vs 1 under
    expect(compare(23, 24, 20, 21)).toBe(-1); // 1 under vs 1 under: a tie
    expect(compare(23, 24, 20, 21, true)).toBe(1); // (were ties the seat's)
    expect(compare(19, 21, 16, 17)).toBe(-1); // 2 under vs 1 under
    expect(compare(25, 24, 23, 21)).toBe(1); // 1 over vs 2 over
    expect(compare(26, 24, 23, 21)).toBe(-1); // both 2 over: a tie
    expect(compare(22, 21, 17, 17)).toBe(-1);
  });

  it('plays the seats in order, then the dealer turns the hole card over', () => {
    const r = table();
    expect(r.live(0) && r.live(4)).toBe(true);
    for (let i = 0; i < 4; i++) r.stand(i);
    expect(r.phase).toBe('seats');
    const ev = r.stand(4);
    expect(ev.some((e) => e.t === 'hole')).toBe(true);
    expect(r.phase).toBe('dealer');
    expect(r.holeUp).toBe(true);
  });

  it('draws for the dealer under target − 3 and stands from there', () => {
    const r = table({ dealer: [5, 6], shoe: [3, 3, 9, 9, 9] });
    standAll(r);
    r.aggression = 0;
    r.dealerStep(); // 11 → 14
    r.dealerStep(); // 14 → 17
    r.dealerStep(); // 17 → 26
    expect(r.total(DEALER)).toBe(26);
    r.dealerStep();
    expect(r.done).toBe(true);
    const s = table({ dealer: [10, 8] });
    standAll(s);
    s.aggression = 0;
    s.dealerStep();
    expect(s.done && s.total(DEALER) === 18).toBe(true);
  });

  it('pays 1:1, Bounty 2:1, Guard half back, Fortress all, Stakes Up doubles the stake', () => {
    const r = table({ hands: [[10, 10], [10, 5], [10, 5], [10, 10], [10, 11]], dealer: [10, 9] });
    standAll(r);
    r.dealer.stood = true;
    r.phase = 'done';
    r.seats[1].guard = true;
    r.seats[2].fortress = true;
    r.seats[3].winMult = 2;
    r.seats[4].stakes = 2;
    const res = r.settle();
    expect(res.map((x) => x.outcome)).toEqual([1, -1, -1, 1, 1]);
    expect(res.map((x) => x.ret)).toEqual([20, 5, 10, 30, 40]);
    expect(res[4].wager).toBe(20);
  });
});

describe('Party Trump 21 — trumps at a full table', () => {
  it('draw control and information affect only the seat', () => {
    const r = table({ hands: [[10, 4], [2, 3], [2, 3], [2, 3], [2, 3]], shoe: [9, 6, 2, 8, 8, 7, 5], trumps: [['precision', 'feather', 'call7', 'foresight', 'recall']] });
    const before = r.dealer.cards.join();
    r.useTrump(0, 'precision'); // best of 9, 6, 2 under 7 → 6
    expect(r.seats[0].cards).toEqual([10, 4, 6]);
    r.useTrump(0, 'recall');
    expect(r.seats[0].cards).toEqual([10, 4]);
    expect(r.shoe.length).toBe(7);
    r.shoe = [9, 6, 2, 8];
    r.useTrump(0, 'feather');
    expect(r.seats[0].cards).toEqual([10, 4, 2]);
    r.shoe = [3, 7, 1];
    r.useTrump(0, 'foresight');
    expect(r.nextFor(0)).toBe(3);
    expect(r.nextFor(1)).toBe(null);
    r.useTrump(0, 'call7');
    expect(r.seats[0].cards).toEqual([10, 4, 2, 7]);
    expect(r.nextFor(0)).toBe(3); // the top card didn't move
    expect(r.dealer.cards.join()).toBe(before);
  });

  it('Glimpse is a private peek', () => {
    const r = table({ dealer: [8, 5], trumps: [[], ['glimpse']] });
    const ev = r.useTrump(1, 'glimpse');
    expect(ev.some((e) => e.t === 'glimpse' && e.value === 8)).toBe(true);
    expect(r.seesHole(1)).toBe(true);
    expect(r.seesHole(0)).toBe(false);
    expect(seatView(r, 1, true).dealer.visible).toEqual([8, 5]);
    expect(seatView(r, 0, true).dealer.visible).toEqual([5]);
  });

  it("a seat's target cards change only its own target; the dealer's change the table's", () => {
    const r = table({ trumps: [['line24'], ['reset21'], ['shiftDown']], dealerTrumps: ['line17'] });
    r.useTrump(0, 'line24');
    r.useTrump(1, 'reset21');
    r.useTrump(2, 'shiftDown');
    expect([0, 1, 2, 3].map((i) => r.targetOf(i))).toEqual([24, 21, 19, 21]);
    expect(r.tableTarget).toBe(21);
    // the dealer's line moves the table target, not the seats that hold their own
    standAll(r);
    r.dealer.cards = [9, 6];
    r.seats[3].cards = [7, 12];
    r.seats[4].cards = [7, 13];
    r.aggression = 1;
    const ev = r.dealerStep();
    expect(ev.some((e) => e.t === 'trump' && e.id === 'line17')).toBe(true);
    expect([0, 1, 2, 3, 4].map((i) => r.targetOf(i))).toEqual([24, 21, 19, 17, 17]);
  });

  it('Wild Line draws a new target in range; shifts clamp', () => {
    for (let seed = 0; seed < 60; seed++) {
      const r = table({ seed, trumps: [['lineWild']] });
      r.useTrump(0, 'lineWild');
      const n = r.targetOf(0);
      expect(n).toBeGreaterThanOrEqual(WILD.lo);
      expect(n).toBeLessThanOrEqual(WILD.hi);
      expect(n).not.toBe(21);
    }
    const r = table({ trumps: [['shiftUp', 'shiftUp', 'line30']] });
    r.useTrump(0, 'line30');
    expect(r.canUse(0, 'shiftUp')).toBe(false); // already at the top
    expect(targetMove('shiftDown')).toEqual({ kind: 'shift', d: -2 });
    expect(targetMove('line23')).toEqual({ kind: 'fixed', n: 23 });
    expect(targetMove('burn')).toBe(null);
  });

  it("attacks change the dealer's hand for the whole table", () => {
    const r = table({ dealer: [7, 10], shoe: [4, 6, 8, 2, 3], hands: [[5, 9]], trumps: [['burn', 'force', 'switch', 'freeze', 'blindfold']], dealerTrumps: ['recall'] });
    r.useTrump(0, 'burn');
    expect(r.dealer.cards).toEqual([7]);
    expect(r.canUse(0, 'switch')).toBe(false); // the dealer has one card left
    r.useTrump(0, 'force');
    expect(r.dealer.cards.length).toBe(2);
    const dl = r.dealer.cards[1];
    r.useTrump(0, 'switch');
    expect(r.seats[0].cards).toEqual([5, dl]);
    expect(r.dealer.cards).toEqual([7, 9]);
    r.useTrump(0, 'freeze');
    r.useTrump(0, 'blindfold');
    expect(r.dealer.frozen && r.dealer.blinded).toBe(true);
    // frozen: one card at most on its turn; blindfolded: no trumps
    standAll(r);
    r.shoe = [1, 1, 1, 1];
    r.aggression = 1;
    const steps = [...r.dealerStep(), ...r.dealerStep()];
    expect(r.dealer.cards).toEqual([7, 9, 1]);
    expect(r.done).toBe(true);
    expect(steps.some((e) => e.t === 'trump')).toBe(false);
    expect(r.dealer.trumps).toContain('recall');
  });

  it("a dealer trump that hits a seat's hand hands that seat a reply", () => {
    // seat 0 shows 15 (the dealer reads it as 21): any card busts it
    const r = table({ hands: [[2, 11, 4], [5, 6], [5, 6], [5, 6], [5, 6]], dealer: [8, 10], shoe: [8, 2, 2, 2], dealerTrumps: ['force'] });
    standAll(r);
    r.aggression = 1;
    const ev = r.dealerStep();
    expect(ev.some((e) => e.t === 'trump' && e.id === 'force' && e.on === 0)).toBe(true);
    expect(r.seats[0].cards).toEqual([2, 11, 4, 8]);
    expect(r.reply).toBe(0);
    expect(r.live(0)).toBe(true);
    expect(r.dealerStep()).toEqual([]); // waits for the answer
    r.stand(0);
    expect(r.reply).toBe(null);
    r.dealerStep();
    expect(r.dealer.cards.length).toBe(2); // 18: stands
    expect(r.done).toBe(true);
  });

  it('the dealer rescues a bust with the tightest higher target', () => {
    const r = table({ dealer: [9, 8, 6], dealerTrumps: ['line27', 'line24', 'line23'] });
    // only these three (the deal added two more)
    r.dealer.trumps.splice(3);
    standAll(r);
    r.aggression = 1;
    r.dealerStep();
    expect(r.tableTarget).toBe(23);
  });

  it("the dealer's hand never clogs: a new trump replaces its oldest", () => {
    const r = table({ dealerTrumps: ['reset21', 'reset21', 'reset21', 'reset21', 'reset21'], dealer: [3, 2], shoe: Array(30).fill(1), seed: 9 });
    standAll(r);
    r.aggression = 0;
    for (let i = 0; i < 12 && !r.done; i++) r.dealerStep();
    expect(r.dealer.trumps.length).toBe(5);
    expect(r.dealer.trumps.filter((x) => x === 'reset21').length).toBeLessThan(5);
  });

  it('deals by Trump 21 weights from pools the table knows; the dealer holds no Freeze', () => {
    expect(SEAT_POOL.length).toBe(TRUMPS.length - 5); // every trump but Overload and the four swaps this table doesn't know
    expect(DEALER_POOL).not.toContain('freeze');
    const rng = seededRng(4);
    let target = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (t21Target(pickTrump(SEAT_POOL, rng))) target++;
    const w = SEAT_POOL.reduce((a, id) => a + dealWeight(id), 0);
    const tw = SEAT_POOL.filter(t21Target).reduce((a, id) => a + dealWeight(id), 0);
    expect(target / n).toBeCloseTo(tw / w, 1);
  });
});

describe('Party Trump 21 — the regulars', () => {
  const mem = newMemory();
  const view = (o: Partial<TableInfo> & { hand: number[]; target?: number; dealer?: Partial<DealerInfo>; trumps?: TrumpId[] }) => {
    const shoe = o.unseen ?? Array.from({ length: 40 }, (_, i) => (i % 11) + 1);
    const trumps = o.trumps ?? [];
    const dealer: DealerInfo = { visible: [9], hidden: 1, target: 21, standAt: 17, draws: Infinity, trumps: 0, blinded: false, ...o.dealer };
    const table: TableInfo = {
      unseen: shoe,
      next: null,
      canUse: (id) => trumps.includes(id),
      peek: 3,
      guard: false,
      fortress: false,
      stakes: 1,
      winMult: 1,
      own: null,
      freezeDraws: 1,
      ...o,
    };
    return { hand: o.hand, target: o.target ?? 21, trumps, dealer, table };
  };
  const pick = (m: Mindset, v: ReturnType<typeof view>, rng: Rng = seededRng(1)) => aiTurn(m, v.hand, v.target, v.trumps, v.dealer, v.table, mem, rng);
  const trumpOf = (p: AiPick) => (typeof p === 'object' ? p.trump : p);

  it('calculated hits low totals, stands on high ones, never hits at the target', () => {
    expect(pick('calculated', view({ hand: [3, 5] }))).toBe('hit');
    expect(pick('calculated', view({ hand: [10, 9] }))).toBe('stand');
    expect(pick('calculated', view({ hand: [10, 11] }))).toBe('stand');
  });

  it('calculated rescues a bust with Recall or the line that fits', () => {
    expect(trumpOf(pick('calculated', view({ hand: [10, 6, 9], trumps: ['recall', 'call2'] })))).toBe('recall');
    expect(trumpOf(pick('calculated', view({ hand: [10, 6, 7], trumps: ['line23', 'line27', 'call2'] })))).toBe('line23');
  });

  it('conservative locks a made hand with a lower line or Shift Down', () => {
    expect(trumpOf(pick('conservative', view({ hand: [10, 9], trumps: ['shiftDown'] })))).toBe('shiftDown');
    expect(trumpOf(pick('conservative', view({ hand: [10, 8], trumps: ['line18', 'call3'] })))).toBe('line18');
  });

  it('aggressive gambles on Wild Line when behind', () => {
    const v = view({ hand: [10, 6, 7], trumps: ['lineWild'], dealer: { visible: [10, 9], hidden: 0 } });
    expect(trumpOf(pick('aggressive', v))).toBe('lineWild');
  });

  it('hunch never hits at or over its target', () => {
    const rng = seededRng(2);
    for (let i = 0; i < 300; i++) expect(pick('hunch', view({ hand: [10, 11], trumps: ['call2', 'guard'] }), rng)).not.toBe('hit');
  });

  it('every mindset makes legal moves and finishes rounds', () => {
    const rng = seededRng(6);
    const mems = [0, 1, 2, 3, 4].map(() => newMemory());
    const trumps: TrumpId[][] = [[], [], [], [], []];
    const dt: TrumpId[] = [];
    const minds: Mindset[] = ['calculated', 'aggressive', 'conservative', 'hybrid', 'hunch'];
    for (let k = 0; k < 300; k++) {
      const r = new PartyDuel(
        trumps.map((t, i) => ({ bet: 10, trumps: t, player: i === 2 })),
        dt,
        rng,
      );
      const res = autoPlay(r, (s) => {
        const p = seatTurnPick(r, s, minds[(s + k) % 5], mems[s], true, rng);
        if (typeof p === 'object') expect(r.canUse(s, p.trump)).toBe(true);
        if (p === 'hit') expect(r.shoe.length).toBeGreaterThan(0);
        return p;
      });
      expect(r.done).toBe(true);
      expect(res.length).toBe(5);
      expect(trumps.every((t) => t.length <= PX.maxTrumps)).toBe(true);
    }
  });

  it('stakes 10–200 by mindset, within the chips', () => {
    const rng = seededRng(8);
    for (const m of ['calculated', 'aggressive', 'conservative', 'hybrid', 'hunch'] as Mindset[])
      for (let i = 0; i < 100; i++) {
        const b = aiStake(m, 3000, newMemory(), [], rng);
        expect(b % 5).toBe(0);
        expect(b).toBeGreaterThanOrEqual(PX.aiMin);
        expect(b).toBeLessThanOrEqual(PX.aiMax);
      }
    expect(aiStake('aggressive', 12, newMemory(), [], rng)).toBe(10);
    expect(aiStake('aggressive', 6, newMemory(), [], rng)).toBe(0);
  });

  it('seats four different regulars from the circuit and replaces a broke one with a new face', () => {
    for (let seed = 0; seed < 50; seed++) {
      const four = drawRegulars(4, seededRng(seed));
      expect(new Set(four.map((p) => p.name)).size).toBe(4);
      expect(four.every((p) => ROSTER.includes(p))).toBe(true);
      const seated = four.map((p) => p.name);
      const next = replacementFor(seated, seededRng(seed + 100));
      expect(seated).not.toContain(next.name);
    }
  });
});

describe('Party Trump 21 — bonus trumps and the newer trumps', () => {
  const withBonus = <T>(chance: number, f: () => T): T => {
    const was = PX.trumpOnHit;
    PX.trumpOnHit = chance;
    try {
      return f();
    } finally {
      PX.trumpOnHit = was;
    }
  };

  it("a seat's hit may turn up a bonus trump: it keeps its turn and its next hit is a sure card", () => {
    expect(PX.trumpOnHit).toBe(0.3);
    withBonus(1, () => {
      const r = table({ hands: [[2, 3]], shoe: [4, 5, 6, 7] });
      const ev = r.hit(0);
      expect(ev.length).toBe(1);
      expect(ev[0]).toMatchObject({ t: 'gain', who: 0, bonus: true });
      expect(r.seats[0].cards).toEqual([2, 3]);
      expect(r.seats[0].trumps.length).toBe(1);
      expect(r.live(0)).toBe(true);
      expect(r.hit(0)).toContainEqual({ t: 'card', who: 0, value: 4, hidden: false });
      expect(r.seats[0].cards).toEqual([2, 3, 4]);
      // a full hand: always the card
      r.seats[1].trumps.push('call2', 'call2', 'call2', 'call2', 'call2');
      expect(r.hit(1).some((e) => e.t === 'card')).toBe(true);
    });
  });

  it('the dealer knows Lighten but holds no Heist, Barrier or Freeze; the seats get every newer trump but Overload', () => {
    expect(DEALER_POOL).toContain('lighten');
    for (const id of ['heist', 'barrier', 'freeze'] as TrumpId[]) expect(DEALER_POOL).not.toContain(id);
    for (const id of ['call1', 'call8', 'lighten', 'heist', 'gift', 'rewind', 'barrier', 'tiebreak', 'bullseye', 'reinforce'] as TrumpId[]) expect(SEAT_POOL).toContain(id);
    expect(SEAT_POOL).not.toContain('overload');
  });

  it('Heist, Gift, Rewind and Lighten at a full table (and Overload, which the engine still knows)', () => {
    const r = table({ dealer: [7, 10], shoe: [4, 6, 8, 2, 3], hands: [[5, 9, 11]], trumps: [['heist', 'gift', 'overload', 'rewind', 'lighten']] });
    expect(r.useTrump(0, 'heist')).toContainEqual({ t: 'move', from: DEALER, to: 0, value: 10 });
    expect(r.seats[0].cards).toEqual([5, 9, 11, 10]);
    expect(r.dealer.cards).toEqual([7]);
    expect(r.canUse(0, 'rewind')).toBe(false); // the dealer has one card left
    r.useTrump(0, 'gift');
    expect(r.dealer.cards).toEqual([7, 10]);
    r.useTrump(0, 'overload');
    expect(r.dealer.cards).toEqual([7, 10, 4, 6]);
    r.useTrump(0, 'rewind');
    expect(r.seats[0].cards).toEqual([5, 9]);
    expect(r.dealer.cards).toEqual([7, 10, 4]);
    expect(r.shoe.length).toBe(5);
    r.useTrump(0, 'lighten');
    expect(r.seats[0].cards).toEqual([5]);
  });

  it("a seat's Barrier blocks the dealer's trump aimed at it, and there is no reply", () => {
    const r = table({ hands: [[2, 11, 4], [5, 6], [5, 6], [5, 6], [5, 6]], dealer: [8, 10], shoe: [8, 2, 2, 2], dealerTrumps: ['force'], trumps: [['barrier']] });
    r.dealer.trumps.splice(1);
    r.useTrump(0, 'barrier');
    standAll(r);
    r.aggression = 1;
    const ev = r.dealerStep();
    expect(ev).toContainEqual({ t: 'blocked', seat: 0, id: 'force' });
    expect(r.seats[0].cards).toEqual([2, 11, 4]);
    expect(r.reply).toBe(null);
    expect(r.seats[0].barrier).toBe(false);
  });

  it('Tiebreaker wins the ties; Bullseye pays 3 to 1 right on the target', () => {
    const r = table({ hands: [[10, 9], [10, 11]], dealer: [11, 8], trumps: [['tiebreak'], ['bullseye']] });
    r.useTrump(0, 'tiebreak');
    r.useTrump(1, 'bullseye');
    standAll(r);
    r.dealer.stood = true;
    r.phase = 'done';
    const res = r.settle();
    expect(res[0].outcome).toBe(1);
    expect(res[0].ret).toBe(20);
    expect(res[1].ret).toBe(40);
  });

  it('the dealer lightens a bust that Recall would not save', () => {
    const r = table({ dealer: [6, 11, 5, 3, 1], dealerTrumps: ['recall', 'lighten'] });
    r.dealer.trumps.splice(2);
    standAll(r);
    r.aggression = 1;
    const ev = r.dealerStep();
    expect(ev.some((e) => e.t === 'trump' && e.id === 'lighten')).toBe(true);
    expect(r.dealer.cards.slice(0, 4)).toEqual([6, 5, 3, 1]);
  });
});

describe('Party Trump 21 — the house balance (seeded simulations)', () => {
  // Long-run figures are in PX_RTP (rules.ts): strongest strategy 97.7% here and 98.4% at the
  // single table; these shorter seeded runs keep the balance in check.
  it('ties go to the dealer and the dealer is dealt two trumps a round', () => {
    expect(PX.tiesToSeat).toBe(false);
    const r = new PartyDuel(seats(), [], seededRng(2));
    r.deal();
    expect(r.dealer.trumps.length).toBe(2);
    expect(r.seats.every((s) => s.trumps.length === 1)).toBe(true);
  });

  it('the strongest strategy found (also the light bulb) returns 96–99%, as at the single table', () => {
    const party = rtp(simulateParty(12000, 111, 'calculated', 'draw').player);
    expect(party).toBeGreaterThan(0.955);
    expect(party).toBeLessThan(0.995);
    const single = rtp(simulateSingle(20000, 41));
    expect(Math.abs(party - single)).toBeLessThan(0.03);
  }, 180000);

  it('simpler ways to play stay well under 100%', () => {
    for (const how of ['odds', 'hit17', 'dump'] as const) expect(rtp(simulateParty(4000, 333, how, 'draw').player)).toBeLessThan(0.7);
  }, 180000);

  it('calculated is the best mindset, and every mindset stays under 100%', () => {
    // five players, one mindset each, at one table (seats rotating): they share the dealer's hands;
    // calculated leads aggressive by about a point, so this run is long (3 × 20,000: PX_RTP)
    const r = simulateMindsets(20000, 31);
    const calc = rtp(r.calculated);
    for (const m of ['aggressive', 'conservative', 'hybrid', 'hunch'] as Mindset[]) expect(calc).toBeGreaterThan(rtp(r[m]));
    for (const m of ['calculated', 'aggressive', 'conservative', 'hybrid', 'hunch'] as Mindset[]) expect(rtp(r[m])).toBeLessThan(1);
    // and the regulars as they play, a new mindset every hand
    expect(rtp(simulateParty(6000, 222).regulars)).toBeLessThan(1);
  }, 180000);
});

describe('Party Trump 21 — wild rivals and the table cards', () => {
  const NEW: TrumpId[] = ['wildSwitch', 'wildForce', 'wildLow', 'wildHigh', 'wildHands', 'wildRedeal', 'passAround', 'tablePick', 'rampart', 'crown'];
  const of = <K extends PxEvent['t']>(ev: PxEvent[], t: K) => ev.filter((e): e is Extract<PxEvent, { t: K }> => e.t === t);

  it('are dealt only at this table, at half their weight, and never to the dealer', () => {
    for (const id of NEW) {
      expect(SEAT_POOL).toContain(id);
      expect(DEALER_POOL).not.toContain(id);
      expect(SINGLE_TRUMPS.some((t) => t.id === id)).toBe(false);
      expect(TRUMPS.find((t) => t.id === id)?.party).toBe(true);
      expect(partyWeight(id)).toBe(Math.round(dealWeight(id) * 0.5));
    }
    expect(PX.partyScale).toBe(0.5);
    expect(partyWeight('precision')).toBe(dealWeight('precision'));
  });

  it('a wild card draws its rival among the other seats and the dealer, then acts on that hand', () => {
    const hands = [
      [2, 3],
      [4, 5],
      [6, 7],
      [8, 9],
      [10, 11],
    ];
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const r = table({ hands, dealer: [1, 2], trumps: [[], [], ['wildHands']], seed });
      const ev = r.useTrump(2, 'wildHands');
      const [rv] = of(ev, 'rival');
      expect(rv.pool).toEqual([0, 1, 3, 4, DEALER]);
      seen.add(rv.on);
      expect(r.seats[2].cards).toEqual(rv.on === DEALER ? [1, 2] : hands[rv.on]);
      expect(r.hand(rv.on)).toEqual([6, 7]);
    }
    expect(seen.size).toBe(5);
  });

  it('Wild Switch, Low / High Swap, Force and Redeal act on the rival drawn', () => {
    // only seat 4 has two cards: Wild Switch can draw no one else
    const a = table({ hands: [[5], [6], [3, 10], [7], [8, 9]], dealer: [4], trumps: [[], [], ['wildSwitch']] });
    const ev = a.useTrump(2, 'wildSwitch');
    expect(of(ev, 'rival')[0].on).toBe(4);
    expect(ev).toContainEqual({ t: 'swapCards', a: 2, ai: 1, b: 4, bi: 1 });
    expect(a.seats[2].cards).toEqual([3, 9]);
    expect(a.seats[4].cards).toEqual([8, 10]);
    // only the dealer holds cards: Low Swap, then High Swap (its highest is the hole card)
    const b = table({ hands: [[], [], [3, 10, 6], [], []], dealer: [9, 2], trumps: [[], [], ['wildLow', 'wildHigh', 'wildRedeal']] });
    b.useTrump(2, 'wildLow');
    expect(b.seats[2].cards).toEqual([2, 10, 6]);
    expect(b.dealer.cards).toEqual([9, 3]);
    b.useTrump(2, 'wildHigh');
    expect(b.seats[2].cards).toEqual([2, 9, 6]);
    expect(b.dealer.cards).toEqual([10, 3]);
    expect(b.seesHole(2)).toBe(true); // it put the card there
    const shoe = b.shoe.length;
    const rd = b.useTrump(2, 'wildRedeal');
    expect(rd).toContainEqual({ t: 'redeal', a: 2, b: DEALER });
    expect(of(rd, 'card').map((e) => `${e.who === DEALER ? 'D' : e.who}${e.hidden ? 'h' : ''}`)).toEqual(['2h', 'Dh', '2', 'D', '2']);
    expect(b.seats[2].cards.length).toBe(3);
    expect(b.dealer.cards.length).toBe(2);
    expect(b.shoe.length).toBe(shoe);
    expect(b.seesHole(2)).toBe(false); // a new hole card
    // Wild Force: the rival takes the top card
    const c = table({ hands: [[5, 6], [5, 6], [5, 6], [5, 6], [5, 6]], dealer: [4, 4], shoe: [7, 8, 9], trumps: [[], [], ['wildForce']] });
    const on = of(c.useTrump(2, 'wildForce'), 'rival')[0].on;
    expect(c.hand(on)).toEqual(on === DEALER ? [4, 4, 7] : [5, 6, 7]);
  });

  it('a seat whose hand changes after its turn answers before the next seat plays', () => {
    const r = table({ hands: [[2, 11], [4, 5], [6, 7], [8, 3], [10, 2]], trumps: [[], [], ['tablePick']] });
    r.stand(0);
    r.stand(1);
    // the 11 of first base brings 6 + 7 closest to 21
    r.useTrump(2, 'tablePick');
    expect(r.seats[2].cards).toEqual([6, 11]);
    expect(r.seats[0].cards).toEqual([2, 7]);
    expect(r.reply).toBe(null);
    const ev = r.stand(2);
    expect(ev).toContainEqual({ t: 'reply', seat: 0, by: 2 });
    expect(r.reply).toBe(0);
    expect(r.live(0)).toBe(true);
    expect(r.phase).toBe('seats');
    r.hit(0);
    r.stand(0);
    expect(r.reply).toBe(null);
    r.stand(3);
    expect(r.stand(4).some((e) => e.t === 'hole')).toBe(true);
    expect(r.phase).toBe('dealer');
  });

  it('Pass Around passes every last card to the next seat (seats with two cards or more)', () => {
    const r = table({ hands: [[1, 2], [3, 4], [5, 6], [7], [8, 9]], trumps: [[], [], ['passAround']] });
    expect(r.useTrump(2, 'passAround')).toContainEqual({ t: 'rotate', seats: [0, 1, 2, 4] });
    expect(r.seats.map((s) => s.cards)).toEqual([[1, 9], [3, 2], [5, 4], [7], [8, 6]]);
  });

  it("a Barrier stops another seat's card; Rampart stops the dealer's next aimed trump at any seat", () => {
    const r = table({ hands: [[2, 11], [4, 5], [6, 7], [8, 3], [10, 2]], trumps: [['barrier'], [], ['tablePick']] });
    r.useTrump(0, 'barrier');
    r.stand(0);
    expect(r.useTrump(2, 'tablePick')).toContainEqual({ t: 'blocked', seat: 0, id: 'tablePick', by: 2 });
    expect(r.seats[0].cards).toEqual([2, 11]);
    const q = table({ hands: [[2, 11, 4], [5, 6], [5, 6], [5, 6], [5, 6]], dealer: [8, 10], shoe: [8, 2, 2, 2], dealerTrumps: ['force'], trumps: [[], [], ['rampart']] });
    q.dealer.trumps.splice(1);
    q.useTrump(2, 'rampart');
    expect(q.rampart).toBe(true);
    standAll(q);
    q.aggression = 1;
    expect(q.dealerStep()).toContainEqual({ t: 'blocked', seat: 0, id: 'force', rampart: true });
    expect(q.seats[0].cards).toEqual([2, 11, 4]);
    expect(q.rampart).toBe(false);
    expect(q.reply).toBe(null);
  });

  it('Table Crown pays one more to the hand closest to its target at the whole table', () => {
    const r = table({ hands: [[10, 9], [10, 11], [10, 8], [10, 7], [10, 6]], dealer: [10, 7], trumps: [[], ['crown'], ['crown']] });
    r.useTrump(1, 'crown');
    r.useTrump(2, 'crown');
    standAll(r);
    r.dealer.stood = true;
    r.phase = 'done';
    const res = r.settle();
    expect(res[1].ret).toBe(30); // 21: the closest, 2 to 1
    expect(res[2].ret).toBe(20); // 18 wins, but 21 is closer
  });

  it('the strongest strategy finds them', () => {
    // over at 22: Table Pick brings back the 7 of second base (20)
    const r = table({ hands: [[2, 11], [4, 7], [6, 7, 9], [8, 3], [10, 2]], dealer: [9, 8], trumps: [[], [], ['tablePick']] });
    const v = seatView(r, 2, true);
    expect(aiTurn('calculated', v.hand, v.target, v.trumps, v.dealer, v.table, newMemory(), seededRng(1))).toMatchObject({ trump: 'tablePick' });
  });

  it('they come up in play, and every round still ends', () => {
    const played = new Set<TrumpId>();
    const use = PartyDuel.prototype.useTrump;
    PartyDuel.prototype.useTrump = function (this: PartyDuel, seat: number, id: TrumpId) {
      const ev = use.call(this, seat, id);
      if (ev.length) played.add(id);
      return ev;
    };
    try {
      const rng = seededRng(77);
      const trumps: TrumpId[][] = Array.from({ length: 5 }, () => []);
      const dealer: TrumpId[] = [];
      const mem = Array.from({ length: 5 }, () => newMemory());
      for (let i = 0; i < 3000; i++) {
        const r = new PartyDuel(
          trumps.map((t) => ({ bet: 10, trumps: t })),
          dealer,
          rng,
        );
        autoPlay(r, (s) => seatTurnPick(r, s, 'calculated', mem[s], true, rng));
        expect(r.done).toBe(true);
      }
    } finally {
      PartyDuel.prototype.useTrump = use;
    }
    for (const id of NEW) expect(played.has(id)).toBe(true);
  }, 120000);
});
