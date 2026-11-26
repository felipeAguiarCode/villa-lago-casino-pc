/**
 * Party Trump 21: how a seat decides (the regulars, the hint, the simulations).
 *
 * `aiTurn` is a pure function. It reads the seat's own hand and target, its trumps, what it can see
 * of the dealer and the cards it has seen, and returns one move: hit, stand or a trump. The caller
 * applies it and asks again, so one turn may play several trumps before its hit or stand.
 *
 * The core is exact enough to be strong: from the cards the seat has not seen it works out the
 * dealer's final total (the house rule draws to the table target − 4) and, by dynamic programming
 * over its own total, the chance to win when standing (S) and when hitting and then playing on
 * well (H). Each trump in hand is valued the same way (the position after it, played on well),
 * minus what keeping it for a later round is worth; the best one is played when it pays for
 * itself. Stake trumps (Guard, Fortress, Stakes Up, Bounty) are weighed just before standing,
 * when the chance to win is known best. Defensive trumps (Recall, the target cards, Guard,
 * Fortress) have a high keep value, so they are saved until they rescue a hand; target cards
 * are valued at the target they set (a Wild Line at the average of its draws), so the line that
 * rescues or protects the total wins. The model also knows that the dealer's trumps save some of
 * its busts (it sees how many it holds), which is what Blindfold, Shatter and Pickpocket are
 * worth. And it keeps its hand flowing: a full hand loses every trump still to come, so with five
 * (or four) cards a harmless trump goes down to make room. In the simulations that hand flow alone
 * is worth about 20 points of return.
 *
 * The mindset (partybj/mindset.ts, drawn every hand and never shown) bends that core:
 *   calculated   — the core as it is;
 *   aggressive   — hits closer to the target, plays attacks on the dealer early, raises with
 *                  Stakes Up and Bounty whenever they are not losing plays, and gambles on a
 *                  Wild Line when it is behind;
 *   conservative — stands earlier, hoards defensive trumps but locks a made hand with a lower
 *                  line or Line −2, never raises with Stakes Up;
 *   hybrid       — the core on clear spots; on borderline ones it presses after wins (hit) and
 *                  tightens after losses (stand);
 *   hunch        — the core, but about one decision in four is another legal move (never a hit
 *                  at or over the target).
 */
import type { Rng } from '../../core/rng';
import { MAX_TRUMPS, T21, type Duel, type TrumpId } from '../trump21/rules';
import { mindsetSideBet, mindsetStake, type AiMemory, type Mindset } from '../partybj/mindset';
import { callValue, isAttack, isTargetTrump, movedTarget, PX, targetMove, wildTargets, type PartyDuel, type SeatResult } from './rules';

/** Highest total tracked (target 27 + two 11s and some). */
const MAXT = 64;

export interface DealerInfo {
  /** Dealer cards the seat can see (the hole card only after Glimpse). */
  visible: number[];
  /** Dealer cards it can't see: 1 (the hole card) or 0. */
  hidden: number;
  /** The dealer's (table) target. */
  target: number;
  /** House rule: the dealer stands at this total or more. */
  standAt: number;
  /** Cards the dealer may still draw on its turn (Freeze: 1; else Infinity). */
  draws: number;
  /** Trumps the dealer holds. */
  trumps: number;
  blinded: boolean;
  /** Chance it plays a fitting trump (default: the party table's). */
  aggression?: number;
}

export interface TableInfo {
  /** Card values the seat has not seen (the shoe and the hidden cards), with repeats. */
  unseen: number[];
  /** The top card of the shoe when the seat knows it (Foresight). */
  next: number | null;
  /** Whether a trump can be played now (the engine's rule, and chips for Stakes Up). */
  canUse: (id: TrumpId) => boolean;
  /** Precision and Feather choose from this many cards at the top (99: the whole deck). */
  peek: number;
  guard: boolean;
  fortress: boolean;
  stakes: 1 | 2;
  winMult: 1 | 2;
  /** The seat's own target (Line card) or null. */
  own: number | null;
  /** Line cards move the dealer's target too (the single Trump 21 table). */
  sharedTarget?: boolean;
  /** Cards a frozen dealer may draw (party: 1; single Trump 21: 0). */
  freezeDraws?: number;
  /** Ties go to the seat (default) or to the dealer. */
  tiesWin?: boolean;
}

export type AiPick = 'hit' | 'stand' | { trump: TrumpId; on: 'self' | 'dealer' };

/** What holding a trump for a later round is worth, in stakes (calculated). */
const KEEP: Partial<Record<TrumpId, number>> = {
  precision: 0.22,
  feather: 0.08,
  call2: 0.08,
  call3: 0.08,
  call4: 0.08,
  call5: 0.08,
  call6: 0.08,
  call7: 0.08,
  twin: 0.1,
  redraw: 0.12,
  recall: 0.3,
  glimpse: 0.04,
  foresight: 0.05,
  reshuffle: 0.02,
  line15: 0.2,
  line17: 0.22,
  line18: 0.2,
  line19: 0.2,
  line20: 0.2,
  reset21: 0.06,
  line22: 0.24,
  line23: 0.25,
  line24: 0.26,
  line25: 0.24,
  line26: 0.22,
  line27: 0.22,
  line30: 0.16,
  shiftUp: 0.2,
  shiftDown: 0.18,
  lineWild: 0.12,
  burn: 0.1,
  switch: 0.12,
  force: 0.12,
  freeze: 0.14,
  shatter: 0.03,
  pickpocket: 0.06,
  blindfold: 0.05,
  guard: 0.18,
  fortress: 0.36,
  stakes: 0.22,
  bounty: 0.22,
};
/** Keep value of any trump: the table above; other target trumps 0.2 (Wild Line 0.12); else 0.1. */
const keepOf = (id: TrumpId) => KEEP[id] ?? (isTargetTrump(id) ? (targetMove(id)!.kind === 'wild' ? 0.12 : 0.2) : 0.1);
/**
 * Tuning (kept for simulations): keep-value scale, keep factor with a full hand, value of the 30%
 * trump chance on a hit, the calculated bends, a free slot's worth, the harm a hand-flow play may
 * cost, hybrid's borderline band, aggressive's hit lean and conservative's stand lean, and the
 * single table dealer's stand line as the model reads it. The keep scale of 2 is the strongest
 * found on both tables (single: 1.5 → 97.0%, 2 → 98.2%, 2.5 → 94.1%; party: 1.5 → 97.0%,
 * 2 → 97.8%; from 2.5 up the hands clog and the return collapses).
 */
export const AI_TUNE = { keepMul: 2, fullMul: 0.5, hitBonus: 0.015, calcHit: 0, calcAttack: 1, calcStake: 1, slot: 0.12, harm: 0.03, lean: 0.12, pushHit: 0.12, safeStand: 0.1, duelGap: 4 };
const DEFENSIVE = (id: TrumpId) => isTargetTrump(id) || id === 'recall' || id === 'guard' || id === 'fortress';

// ---------------------------------------------------------------------------- the model

interface DState {
  key: string;
  start: Float64Array;
  T: number;
  standAt: number;
  draws: number;
  /** Share of the dealer's busts its trumps rescue (Recall, a higher line). */
  rescue: number;
}

/**
 * How often the dealer's trumps save it from a bust, as a seat can judge it: it sees how many
 * trumps the dealer holds (not which). About a quarter of the dealer's pool can rescue a bust and
 * it plays a fitting trump three times in five.
 */
export const rescueOdds = (trumps: number, blinded: boolean, aggression = PX.aggression) => (blinded ? 0 : (1 - Math.pow(0.73, Math.min(5, trumps))) * aggression);

interface Vals {
  S: Float64Array;
  /** Value of hitting once then playing on well (before the known next card is used). */
  H: Float64Array;
  V: Float64Array;
}

class Model {
  readonly f = new Float64Array(12);
  /** Default share of busts the dealer's trumps rescue. */
  rescue = 0;
  /** Ties go to the seat. */
  tieWin = true;
  private finals = new Map<string, Float64Array>();
  private vals = new Map<string, Vals>();

  constructor(unseen: number[]) {
    for (const v of unseen) if (v >= 1 && v <= 11) this.f[v]++;
    const n = unseen.length;
    for (let c = 1; c <= 11; c++) this.f[c] = n ? this.f[c] / n : 1 / 11;
  }

  /** The dealer's start (visible sum, hidden cards, forced extra cards) and house rule. */
  dstate(vis: number, hidden: number, T: number, standAt: number, draws: number, extra = 0, rescue = this.rescue): DState {
    let start = new Float64Array(MAXT);
    start[Math.max(0, Math.min(MAXT - 1, vis))] = 1;
    for (let k = 0; k < hidden + extra; k++) start = this.add(start);
    return { key: `${vis}|${hidden}|${T}|${standAt}|${draws}|${extra}|${rescue}`, start, T, standAt, draws, rescue };
  }

  private add(d: Float64Array) {
    const out = new Float64Array(MAXT);
    const f = this.f;
    for (let t = 0; t < MAXT; t++) {
      const m = d[t];
      if (!m) continue;
      for (let c = 1; c <= 11; c++) out[Math.min(MAXT - 1, t + c)] += m * f[c];
    }
    return out;
  }

  /** The dealer's final total: it draws while under `standAt`, at most `draws` cards. */
  final(ds: DState): Float64Array {
    const hit = this.finals.get(ds.key);
    if (hit) return hit;
    const out = new Float64Array(MAXT);
    let cur = ds.start;
    for (let k = 0; k < 40; k++) {
      let more = false;
      const nxt = new Float64Array(MAXT);
      for (let t = 0; t < MAXT; t++) {
        const m = cur[t];
        if (!m) continue;
        if (t >= ds.standAt || k >= ds.draws) out[t] += m;
        else {
          more = true;
          for (let c = 1; c <= 11; c++) nxt[Math.min(MAXT - 1, t + c)] += m * this.f[c];
        }
      }
      if (!more) break;
      cur = nxt;
    }
    if (ds.rescue > 0) {
      // the busts its trumps save end like its other hands
      let bust = 0;
      for (let t = ds.T + 1; t < MAXT; t++) bust += out[t];
      const ok = 1 - bust;
      if (bust > 0 && ok > 0) {
        const k = (ds.rescue * bust) / ok;
        for (let t = 0; t <= ds.T; t++) out[t] *= 1 + k;
        for (let t = ds.T + 1; t < MAXT; t++) out[t] *= 1 - ds.rescue;
      }
    }
    this.finals.set(ds.key, out);
    return out;
  }

  /** S (stand), H (hit once, then play on) and V = max for every own total, against target Ts. */
  values(Ts: number, ds: DState): Vals {
    const key = `${Ts}|${ds.key}`;
    const hit = this.vals.get(key);
    if (hit) return hit;
    const D = this.final(ds);
    const S = new Float64Array(MAXT);
    const T = ds.T;
    for (let p = 0; p < MAXT; p++) {
      const sg = Ts - p;
      let w = 0;
      for (let d = 0; d < MAXT; d++) {
        const m = D[d];
        if (!m) continue;
        const dg = T - d;
        if (sg === dg ? this.tieWin : sg >= 0 ? dg < 0 || sg < dg : dg < 0 && -sg < -dg) w += m;
      }
      S[p] = w;
    }
    const H = new Float64Array(MAXT);
    const V = new Float64Array(MAXT);
    for (let p = MAXT - 1; p >= 0; p--) {
      if (p >= Ts || p + 11 >= MAXT) {
        // at or over the target another card never helps
        H[p] = 0;
        V[p] = S[p];
        continue;
      }
      let h = 0;
      for (let c = 1; c <= 11; c++) h += this.f[c] * V[p + c];
      H[p] = h;
      V[p] = Math.max(S[p], h);
    }
    const out = { S, H, V };
    this.vals.set(key, out);
    return out;
  }
}

// ---------------------------------------------------------------------------- the decision

interface Ctx {
  m: Model;
  p: number;
  Ts: number;
  last: number;
  hand: number[];
  dealer: DealerInfo;
  table: TableInfo;
  ds: DState;
  vals: Vals;
  /** Value now: the better of standing and hitting (with the known next card). */
  base: number;
  S: number;
  H: number;
  /** EV (in stakes) per unit of win chance. */
  k: number;
}

const visSum = (d: DealerInfo) => d.visible.reduce((a, b) => a + b, 0);

function makeCtx(hand: number[], target: number, dealer: DealerInfo, table: TableInfo): Ctx {
  const m = new Model(table.unseen);
  m.rescue = rescueOdds(dealer.trumps, dealer.blinded, dealer.aggression);
  m.tieWin = table.tiesWin ?? true;
  const p = hand.reduce((a, b) => a + b, 0);
  const ds = m.dstate(visSum(dealer), dealer.hidden, dealer.target, dealer.standAt, dealer.draws);
  const vals = m.values(target, ds);
  const S = vals.S[Math.min(MAXT - 1, p)];
  let H = p < target ? vals.H[p] : 0;
  if (table.next !== null && p < target) H = vals.V[Math.min(MAXT - 1, p + table.next)];
  const refund = table.fortress ? 1 : table.guard ? 0.5 : 0;
  return {
    m,
    p,
    Ts: target,
    last: hand[hand.length - 1] ?? 0,
    hand,
    dealer,
    table,
    ds,
    vals,
    base: Math.max(S, H),
    S,
    H,
    k: table.stakes * (1 + table.winMult - refund),
  };
}

const at = (v: Float64Array, p: number) => v[Math.max(0, Math.min(MAXT - 1, p))];

/** Expected value of a draw from the top `peek` cards: Precision (best fit) or Feather (lowest). */
function pickDraw(c: Ctx, best: boolean): number {
  const { f } = c.m;
  const V = c.vals.V;
  const room = c.Ts - c.p;
  if (c.table.peek >= 11) {
    // the whole deck: a sure pick among the cards not seen
    const left = [...new Set(c.table.unseen)].sort((a, b) => a - b);
    if (!left.length) return c.base;
    const fit = left.filter((v) => v <= room);
    const v = best ? (fit.length ? fit[fit.length - 1] : left[0]) : left[0];
    return at(V, c.p + v);
  }
  const choose = (a: number, b: number, d: number) => {
    if (!best) return Math.min(a, b, d);
    let fit = 0;
    for (const v of [a, b, d]) if (v <= room && v > fit) fit = v;
    return fit || Math.min(a, b, d);
  };
  let ev = 0;
  const first = c.table.next;
  for (let a = 1; a <= 11; a++) {
    const pa = first !== null ? (a === first ? 1 : 0) : f[a];
    if (!pa) continue;
    for (let b = 1; b <= 11; b++) {
      const pb = pa * f[b];
      if (!pb) continue;
      for (let d = 1; d <= 11; d++) ev += pb * f[d] * at(V, c.p + choose(a, b, d));
    }
  }
  return ev;
}

/** Value (win chance, then playing on well) after a trump; null when it isn't valued this way. */
function afterTrump(c: Ctx, id: TrumpId): number | null {
  const { m, p, Ts, dealer, table } = c;
  const f = m.f;
  const V = c.vals.V;
  const S = c.vals.S;
  const n = callValue(id);
  if (n !== undefined) return at(V, p + n);
  const tm = targetMove(id);
  if (tm) {
    if ((id as string) === 'reset21' && !table.sharedTarget && Ts === 21) {
      // a lock on 21 against the dealer's target cards: worth a little when standing high with the dealer armed
      return p >= 18 && p <= 21 && dealer.trumps > 0 && !dealer.blinded ? c.base + 0.012 * dealer.trumps : c.base;
    }
    const to = movedTarget(tm, Ts);
    const valueAt = (n: number) => {
      const ds = table.sharedTarget ? m.dstate(visSum(dealer), dealer.hidden, n, n - PX.standGap, dealer.draws) : c.ds;
      const v = m.values(n, ds);
      return Math.max(at(v.S, p), p < n ? at(v.H, p) : 0);
    };
    if (to !== null) return valueAt(to);
    const draws = wildTargets(Ts);
    return draws.reduce((a, n) => a + valueAt(n), 0) / draws.length;
  }
  const vis = visSum(dealer);
  const dealerLast = dealer.visible[dealer.visible.length - 1] ?? 0;
  const dealerCards = dealer.visible.length + dealer.hidden;
  switch (id) {
    case 'precision':
      return pickDraw(c, true);
    case 'feather':
      return pickDraw(c, false);
    case 'twin': {
      let ev = 0;
      for (let a = 1; a <= 11; a++) {
        const pa = table.next !== null ? (a === table.next ? 1 : 0) : f[a];
        if (!pa) continue;
        for (let b = 1; b <= 11; b++) ev += pa * f[b] * at(V, p + a + b);
      }
      return ev;
    }
    case 'redraw': {
      if (table.next !== null) return at(V, p - c.last + table.next);
      let ev = 0;
      for (let a = 1; a <= 11; a++) ev += f[a] * at(V, p - c.last + a);
      return ev;
    }
    case 'recall':
      return at(V, p - c.last);
    case 'foresight': {
      if (p >= Ts) return c.base;
      let ev = 0;
      for (let a = 1; a <= 11; a++) ev += f[a] * Math.max(at(S, p), at(V, p + a));
      return ev;
    }
    case 'reshuffle': {
      if (table.next === null || p >= Ts) return c.base;
      return Math.max(at(S, p), at(c.vals.H, p));
    }
    case 'glimpse': {
      if (!dealer.hidden) return c.base;
      let ev = 0;
      for (let h = 1; h <= 11; h++) {
        if (!f[h]) continue;
        const v = m.values(Ts, m.dstate(vis + h, 0, dealer.target, dealer.standAt, dealer.draws));
        const hp = table.next !== null && p < Ts ? at(v.V, p + table.next) : p < Ts ? at(v.H, p) : 0;
        ev += f[h] * Math.max(at(v.S, p), hp);
      }
      return ev;
    }
    case 'burn': {
      if (dealerCards < 2 || !dealer.visible.length) return null;
      const v = m.values(Ts, m.dstate(vis - dealerLast, dealer.hidden, dealer.target, dealer.standAt, dealer.draws));
      return Math.max(at(v.S, p), p < Ts ? at(v.H, p) : 0);
    }
    case 'switch': {
      if (dealerCards < 2 || !dealer.visible.length || c.hand.length < 2) return null;
      const np = p - c.last + dealerLast;
      const v = m.values(Ts, m.dstate(vis - dealerLast + c.last, dealer.hidden, dealer.target, dealer.standAt, dealer.draws));
      return Math.max(at(v.S, np), np < Ts ? at(v.H, np) : 0);
    }
    case 'force': {
      const v = m.values(Ts, m.dstate(vis, dealer.hidden, dealer.target, dealer.standAt, dealer.draws, 1));
      return Math.max(at(v.S, p), p < Ts ? at(v.H, p) : 0);
    }
    case 'freeze': {
      const draws = Math.min(dealer.draws, table.freezeDraws ?? 1);
      const v = m.values(Ts, m.dstate(vis, dealer.hidden, dealer.target, dealer.standAt, draws));
      return Math.max(at(v.S, p), p < Ts ? at(v.H, p) : 0);
    }
    case 'shatter':
    case 'pickpocket':
    case 'blindfold': {
      // fewer dealer trumps: fewer rescued busts (and fewer attacks on the seats, a little extra)
      if (dealer.blinded) return id === 'pickpocket' ? c.base + 0.05 / Math.max(0.5, c.k) : c.base;
      const left = id === 'blindfold' ? 0 : dealer.trumps - 1;
      const r = id === 'blindfold' ? 0 : rescueOdds(left, false, dealer.aggression);
      const v = m.values(Ts, m.dstate(vis, dealer.hidden, dealer.target, dealer.standAt, dealer.draws, 0, r));
      const extra = (0.008 * (dealer.trumps - left) + (id === 'pickpocket' ? 0.05 : 0)) / Math.max(0.5, c.k);
      return Math.max(at(v.S, p), p < Ts ? at(v.H, p) : 0) + extra;
    }
    default:
      return null; // stake trumps: weighed at the stand
  }
}

interface Bend {
  /** Hit when H + hitBias > S. */
  hitBias: number;
  /** Keep value of a trump in this spot (`to`: the target a target trump would set, null for Wild Line). */
  keep: (id: TrumpId, c: Ctx) => number;
  /** Extra appetite for a trump in this spot (stakes). */
  bonus: (id: TrumpId, c: Ctx) => number;
  /** May play Stakes Up at all / on a borderline spot. */
  raise: 'never' | 'clear' | 'borderline';
  bountyMin: number;
}

const isWild = (id: TrumpId) => targetMove(id)?.kind === 'wild';
/** A target trump that sets a lower target the hand still fits: it locks a made hand. */
const locks = (id: TrumpId, c: Ctx) => {
  const tm = targetMove(id);
  const to = tm ? movedTarget(tm, c.Ts) : null;
  return to !== null && to < c.Ts && c.p <= to;
};

function bendFor(mind: Mindset, mem: AiMemory, trumps: TrumpId[], rng: Rng): Bend {
  // a full hand loses the trumps still to come: a free slot is worth about one new trump
  const full = trumps.length >= MAX_TRUMPS ? AI_TUNE.fullMul : trumps.length >= MAX_TRUMPS - 1 ? (1 + AI_TUNE.fullMul) / 2 : 1;
  const slot = trumps.length >= MAX_TRUMPS ? AI_TUNE.slot : trumps.length >= MAX_TRUMPS - 1 ? AI_TUNE.slot * 0.35 : 0;
  const base = (id: TrumpId) => keepOf(id) * full * AI_TUNE.keepMul;
  const b = bendCore(mind, mem, base, rng);
  return { ...b, keep: (id, c) => b.keep(id, c) - slot };
}

function bendCore(mind: Mindset, mem: AiMemory, base: (id: TrumpId) => number, rng: Rng): Bend {
  const none = () => 0;
  switch (mind) {
    case 'aggressive':
      return {
        hitBias: AI_TUNE.pushHit,
        // attacks on the dealer go early, stake trumps and Wild Line readily
        keep: (id) => (isAttack(id) ? -0.02 : id === 'stakes' || id === 'bounty' || isWild(id) ? base(id) * 0.25 : base(id)),
        // behind, it gambles on a Wild Line
        bonus: (id, c) => (isWild(id) && c.base < 0.45 ? 0.08 : 0),
        raise: mindsetSideBet('aggressive', rng) ? 'borderline' : 'clear',
        bountyMin: 0,
      };
    case 'conservative':
      return {
        hitBias: -AI_TUNE.safeStand,
        // a lower line or Shift Down that locks a made hand goes down readily; other defences are hoarded
        keep: (id, c) => (locks(id, c) ? base(id) * 0.4 : DEFENSIVE(id) ? base(id) * 1.5 : base(id)),
        bonus: (id, c) => (locks(id, c) && c.S >= 0.5 ? 0.03 : 0),
        raise: 'never',
        bountyMin: 0.75,
      };
    case 'hybrid':
      return {
        hitBias: 0,
        keep: (id) => (mem.streak > 0 && (id === 'stakes' || id === 'bounty') ? base(id) * 0.6 : base(id)),
        bonus: none,
        raise: mem.streak > 0 && mindsetSideBet('hybrid', rng) ? 'borderline' : 'clear',
        bountyMin: 0,
      };
    default:
      return {
        hitBias: AI_TUNE.calcHit,
        keep: (id) => base(id) * (isAttack(id) ? AI_TUNE.calcAttack : id === 'stakes' || id === 'bounty' ? AI_TUNE.calcStake : 1),
        bonus: none,
        raise: 'clear',
        bountyMin: 0,
      };
  }
}

/** The core decision (calculated, bent by the mindset). */
function decide(c: Ctx, trumps: TrumpId[], bend: Bend, mind: Mindset, mem: AiMemory): AiPick {
  const { table } = c;
  // 1. a trump that pays for itself now
  let best: { id: TrumpId; g: number } | null = null;
  for (const id of new Set(trumps)) {
    if (!table.canUse(id)) continue;
    const v = afterTrump(c, id);
    if (v === null) continue;
    const real = c.k * (v - c.base);
    if (real < -AI_TUNE.harm) continue;
    const g = real - bend.keep(id, c) + bend.bonus(id, c);
    if (g > 0.004 && (!best || g > best.g)) best = { id, g };
  }
  if (best) return { trump: best.id, on: isAttack(best.id) ? 'dealer' : 'self' };
  // 2. hit or stand
  const canHit = c.p < c.Ts && table.unseen.length > 0;
  if (canHit) {
    const close = Math.abs(c.H - c.S) < AI_TUNE.lean;
    if (mind === 'hybrid' && close && mem.streak !== 0) {
      if (mem.streak > 0) return 'hit';
    } else if (c.H + bend.hitBias + (trumps.length < MAX_TRUMPS ? AI_TUNE.hitBonus : 0) > c.S) return 'hit';
  }
  // 3. standing: the stake trumps
  const pw = c.S;
  const refund = table.fortress ? 1 : table.guard ? 0.5 : 0;
  const k = table.stakes;
  const evStake = pw * (1 + table.winMult) + (1 - pw) * refund - 1;
  let stake: { id: TrumpId; g: number } | null = null;
  const consider = (id: TrumpId, gain: number) => {
    if (!trumps.includes(id) || !table.canUse(id) || gain < -AI_TUNE.harm) return;
    const g = gain - bend.keep(id, c);
    if (g > 0.004 && (!stake || g > stake.g)) stake = { id, g };
  };
  if (!table.guard && !table.fortress) consider('guard', k * (1 - pw) * 0.5);
  consider('fortress', k * (1 - pw) * (1 - refund));
  if (pw >= bend.bountyMin) consider('bounty', k * pw);
  if (bend.raise !== 'never') {
    const gain = evStake;
    if (gain > 0 || (bend.raise === 'borderline' && gain > -0.05)) consider('stakes', bend.raise === 'borderline' ? Math.max(gain, 0) + bend.keep('stakes', c) + 0.005 : gain);
  }
  if (stake) return { trump: (stake as { id: TrumpId }).id, on: 'self' };
  return 'stand';
}

/**
 * One move of a seat. `hand` is its own cards (all known to it), `target` its target, `trumps` its
 * trump hand; `dealer` what it sees of the dealer; `table` the cards it hasn't seen and the rules
 * in force; `mem` its memory (streak) and `rng` the table's.
 */
export function aiTurn(
  mind: Mindset,
  hand: number[],
  target: number,
  trumps: TrumpId[],
  dealer: DealerInfo,
  table: TableInfo,
  mem: AiMemory,
  rng: Rng,
): AiPick {
  const c = makeCtx(hand, target, dealer, table);
  const bend = bendFor(mind, mem, trumps, rng);
  const pick = decide(c, trumps, bend, mind === 'hunch' ? 'calculated' : mind, mem);
  if (mind !== 'hunch' || rng(4) !== 0) return pick;
  // a hunch: another legal move (never a hit at or over the target)
  const others: AiPick[] = [];
  const same = (a: AiPick, b: AiPick) => (typeof a === 'string' || typeof b === 'string' ? a === b : a.trump === b.trump);
  if (c.p < c.Ts && table.unseen.length) others.push('hit');
  others.push('stand');
  for (const id of new Set(trumps)) if (table.canUse(id)) others.push({ trump: id, on: isAttack(id) ? 'dealer' : 'self' });
  const alt = others.filter((o) => !same(o, pick));
  return alt.length ? alt[rng(alt.length)] : pick;
}

/** Is this a close call (the hit and stand values within 5 points)? For pacing. */
export function closeCall(hand: number[], target: number, dealer: DealerInfo, table: TableInfo): boolean {
  const c = makeCtx(hand, target, dealer, table);
  return c.p < c.Ts && Math.abs(c.H - c.S) < 0.05;
}

// ---------------------------------------------------------------------------- reading a round

export interface SeatView {
  hand: number[];
  target: number;
  trumps: TrumpId[];
  dealer: DealerInfo;
  table: TableInfo;
}

/** What a seat knows at the party table. `canRaise`: it can cover a Stakes Up raise. */
export function seatView(r: PartyDuel, seat: number, canRaise: boolean): SeatView {
  const s = r.seats[seat];
  const D = r.dealer;
  return {
    hand: s.cards,
    target: r.targetOf(seat),
    trumps: s.trumps,
    dealer: {
      visible: r.seesHole(seat) ? [...D.cards] : D.cards.slice(1),
      hidden: !r.seesHole(seat) && D.cards.length ? 1 : 0,
      target: r.tableTarget,
      standAt: r.tableTarget - PX.standGap,
      draws: r.dealerDraws,
      trumps: D.trumps.length,
      blinded: D.blinded,
    },
    table: {
      unseen: r.unseenFor(seat),
      next: r.nextFor(seat),
      canUse: (id) => r.canUse(seat, id) && (id !== 'stakes' || canRaise),
      peek: PX.peek,
      guard: s.guard,
      fortress: s.fortress,
      stakes: s.stakes,
      winMult: s.winMult,
      own: s.own,
      freezeDraws: 1,
      tiesWin: PX.tiesToSeat,
    },
  };
}

export const seatTurnPick = (r: PartyDuel, seat: number, mind: Mindset, mem: AiMemory, canRaise: boolean, rng: Rng): AiPick => {
  const v = seatView(r, seat, canRaise);
  return aiTurn(mind, v.hand, v.target, v.trumps, v.dealer, v.table, mem, rng);
};

/** Applies a pick to the round; an illegal pick stands (so a turn always ends). */
export function applyPick(r: PartyDuel, seat: number, pick: AiPick) {
  if (pick === 'hit') return r.hit(seat);
  if (pick === 'stand') return r.stand(seat);
  const ev = r.useTrump(seat, pick.trump);
  return ev.length ? ev : r.stand(seat);
}

/** Plays a seat's turn (or reply) to the end with a pick function. */
export function playSeat(r: PartyDuel, seat: number, pick: (seat: number) => AiPick) {
  let guard = 0;
  while (r.live(seat) && guard++ < 40) applyPick(r, seat, pick(seat));
  if (r.live(seat)) r.stand(seat);
}

/** Plays a whole round without a view (tests and simulations). */
export function autoPlay(r: PartyDuel, pick: (seat: number) => AiPick): SeatResult[] {
  r.deal();
  for (let s = 0; s < r.seats.length; s++) playSeat(r, s, pick);
  let guard = 0;
  while (!r.done && guard++ < 60) {
    r.dealerStep();
    if (r.reply !== null) playSeat(r, r.reply, pick);
  }
  return r.settle();
}

/** A regular's stake for the next hand by mindset (calculated sizes it by the trumps it holds). */
export function aiStake(mind: Mindset, chips: number, mem: AiMemory, trumps: TrumpId[], rng: Rng): number {
  const strong = trumps.filter((id) => id === 'stakes' || id === 'bounty' || id === 'fortress' || id === 'precision' || id === 'recall').length;
  const edge = (trumps.length >= 4 ? 0.25 : 0) + (strong >= 2 ? 0.25 : 0);
  let bet = mindsetStake(mind, { chips, min: PX.aiMin, max: PX.aiMax, step: 5, cover: 2, mem, edge }, rng);
  if (bet < PX.aiMin) bet = chips >= PX.aiMin ? PX.aiMin : 0;
  return bet;
}

// ---------------------------------------------------------------------------- the single table

/**
 * The same strategy on the single Trump 21 table (for the fairness benchmark): the player's view of
 * a Duel. The Duel's own dealer adapts to the player; the model reads it as drawing to target − 4.
 */
export function duelPick(d: Duel, mind: Mindset, mem: AiMemory, rng: Rng): AiPick {
  const dealer: DealerInfo = {
    visible: d.glimpsed ? [...d.dealer] : d.dealer.slice(1),
    hidden: d.glimpsed ? 0 : 1,
    target: d.target,
    // the single table's dealer adapts to the player; the model reads it as standing 4 under the target
    standAt: d.target - AI_TUNE.duelGap,
    draws: d.frozen.dealer ? 0 : Infinity,
    trumps: d.trumps.dealer.length,
    blinded: d.blinded,
    aggression: d.aggression,
  };
  const table: TableInfo = {
    unseen: [...d.deck, ...(d.glimpsed ? [] : [d.dealer[0]])],
    next: d.nextCard,
    canUse: (id) => d.canUse('player', id) && !(d.frozen.player && callValue(id) !== undefined),
    peek: 99,
    guard: d.guard,
    fortress: d.fortress,
    stakes: d.stakes as 1 | 2,
    winMult: d.winMult as 1 | 2,
    own: null,
    sharedTarget: true,
    freezeDraws: 0,
    tiesWin: T21.tiesToPlayer,
  };
  return aiTurn(mind, d.player, d.target, d.trumps.player, dealer, table, mem, rng);
}


