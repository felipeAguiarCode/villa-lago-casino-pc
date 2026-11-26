/**
 * Seeded simulations of Party Trump 21 and of the single Trump 21 table (tests and tuning).
 * Flat bets of 10; trump hands are kept from round to round as at the real tables, so the
 * returns are long-run figures with the trump economy included. RTP = returned / wagered
 * (Stakes Up raises count as wagered).
 */
import { seededRng } from '../../core/rng';
import { Duel, type TrumpId } from '../trump21/rules';
import { drawMindset, MINDSETS, newMemory, remember, type AiMemory, type Mindset } from '../partybj/mindset';
import { ROSTER } from '../partybj/roster';
import { autoPlay, duelPick, seatTurnPick, type AiPick } from './ai';
import { PartyDuel, PX } from './rules';

export interface Tally {
  wager: number;
  ret: number;
  hands: number;
}

const tally = (): Tally => ({ wager: 0, ret: 0, hands: 0 });
export const rtp = (t: Tally) => (t.wager ? t.ret / t.wager : 0);

/**
 * Simpler ways to play: `odds` is Trump 21's old light bulb (hit at even odds or better, plus its
 * target-trump advice; both tables' bulbs now show the calculated move), `hit17` hits below 17
 * and never plays a trump, `dump` plays every trump it can as soon as it can, then hits below 17.
 */
export type Naive = 'odds' | 'hit17' | 'dump';
export type Policy = Mindset | Naive;
const isMind = (p: Policy | 'draw'): p is Mindset => (MINDSETS as string[]).includes(p);

function duelNaive(d: Duel, how: Naive): AiPick {
  if (how === 'odds') {
    const tr = d.trumpAdvice();
    return tr ? { trump: tr, on: 'self' } : d.advice();
  }
  if (how === 'dump') {
    const id = d.trumps.player.find((x) => d.canUse('player', x));
    if (id) return { trump: id, on: 'self' };
  }
  return d.total('player') < 17 ? 'hit' : 'stand';
}

function seatNaive(r: PartyDuel, s: number, how: Naive): AiPick | null {
  if (how === 'odds') {
    // hit while at least half the unseen cards keep the hand under its target; no trumps
    const p = r.total(s);
    const t = r.targetOf(s);
    const unseen = r.unseenFor(s);
    const safe = unseen.filter((v) => p + v <= t).length / Math.max(1, unseen.length);
    return p < t && safe >= 0.5 && r.shoe.length ? 'hit' : 'stand';
  }
  if (how === 'dump') {
    const id = r.seats[s].trumps.find((x) => r.canUse(s, x));
    if (id) return { trump: id, on: 'self' };
  }
  return r.total(s) < 17 && r.shoe.length ? 'hit' : 'stand';
}

/** The single Trump 21 table with one way to play for the player (flat bet 10). */
export function simulateSingle(rounds: number, seed: number, mind: Policy = 'calculated'): Tally {
  const rng = seededRng(seed);
  const d = new Duel(rng);
  const mem = newMemory();
  const out = tally();
  for (let i = 0; i < rounds; i++) {
    d.start();
    let guard = 0;
    while (!d.over && guard++ < 60) {
      const decide = () => (isMind(mind) ? duelPick(d, mind, mem, rng) : duelNaive(d, mind));
      let pick = decide();
      let k = 0;
      while (typeof pick === 'object' && k++ < 12) {
        if (!d.useTrump('player', pick.trump).length) {
          pick = 'stand';
          break;
        }
        pick = decide();
      }
      if (typeof pick === 'object') pick = 'stand';
      d[pick]('player');
      if (d.over) break;
      d.dealerTurn();
    }
    const bet = 10;
    const ret = d.payout(bet) * d.stakes;
    out.wager += bet * d.stakes;
    out.ret += ret;
    out.hands++;
    remember(mem, isMind(mind) ? mind : 'calculated', ret - bet * d.stakes);
  }
  return out;
}

export interface PartySim {
  /** The player's seat (the middle one, seat 2 in play order). */
  player: Tally;
  /** The four regulars together. */
  regulars: Tally;
  /** Every regular hand by the mindset it was played with. */
  byMind: Record<Mindset, Tally>;
}

/**
 * The party table: the player's seat plays `player`; the regulars play `regulars` (a fixed mindset,
 * or 'draw': a new hidden mindset every hand, as at the table). Flat bets of 10 for everyone.
 */
export function simulateParty(rounds: number, seed: number, player: Policy | 'draw' = 'calculated', regulars: Mindset | 'draw' = 'draw'): PartySim {
  const rng = seededRng(seed);
  const trumps: TrumpId[][] = Array.from({ length: PX.seats }, () => []);
  const dealerTrumps: TrumpId[] = [];
  const mems: AiMemory[] = Array.from({ length: PX.seats }, () => newMemory());
  const profiles = [ROSTER[0], ROSTER[1], null, ROSTER[2], ROSTER[3]];
  const out: PartySim = { player: tally(), regulars: tally(), byMind: Object.fromEntries(MINDSETS.map((m) => [m, tally()])) as Record<Mindset, Tally> };
  for (let i = 0; i < rounds; i++) {
    const minds: Mindset[] = profiles.map((p, s) => {
      const how = p === null ? player : regulars;
      return how === 'draw' ? drawMindset(p ?? ROSTER[4], mems[s], (p ?? ROSTER[4]).bank, rng) : isMind(how) ? how : 'calculated';
    });
    const naive = player !== 'draw' && !isMind(player) ? player : null;
    const r = new PartyDuel(
      trumps.map((t, s) => ({ bet: 10, trumps: t, player: s === 2 })),
      dealerTrumps,
      rng,
    );
    const res = autoPlay(r, (s) => (s === 2 && naive ? seatNaive(r, s, naive) : null) ?? seatTurnPick(r, s, minds[s], mems[s], true, rng));
    res.forEach((sr, s) => {
      const net = sr.ret - sr.wager;
      remember(mems[s], minds[s], net);
      const add = (t: Tally) => {
        t.wager += sr.wager;
        t.ret += sr.ret;
        t.hands++;
      };
      if (s === 2) add(out.player);
      else {
        add(out.regulars);
        add(out.byMind[minds[s]]);
      }
    });
  }
  return out;
}

/**
 * Five players with one mindset each at the same table, changing seats every round (so the seat
 * order cancels out) and keeping their own trump hands. They share the dealer's hands, so their
 * returns compare far more tightly than separate runs. Flat bets of 10.
 */
export function simulateMindsets(rounds: number, seed: number, minds: Mindset[] = MINDSETS): Record<Mindset, Tally> {
  const rng = seededRng(seed);
  const players = minds.map((m) => ({ m, trumps: [] as TrumpId[], mem: newMemory(), t: tally() }));
  const dealerTrumps: TrumpId[] = [];
  for (let i = 0; i < rounds; i++) {
    const order = players.map((_, s) => players[(s + i) % players.length]);
    const r = new PartyDuel(
      order.map((p) => ({ bet: 10, trumps: p.trumps })),
      dealerTrumps,
      rng,
    );
    const res = autoPlay(r, (s) => seatTurnPick(r, s, order[s].m, order[s].mem, true, rng));
    res.forEach((sr, s) => {
      const p = order[s];
      p.t.wager += sr.wager;
      p.t.ret += sr.ret;
      p.t.hands++;
      remember(p.mem, p.m, sr.ret - sr.wager);
    });
  }
  return Object.fromEntries(players.map((p) => [p.m, p.t])) as Record<Mindset, Tally>;
}
