import { cryptoRng, shuffle, type Rng } from '../../core/rng';

/**
 * Trump 21 — an original "duel" blackjack: one deck of eleven cards numbered 1–11, the player
 * against the dealer, and trump cards that bend the rules (target, draws, stakes…).
 *
 * HOUSE BALANCE (every table here plays against the house). Win 1:1 (Bounty 2:1; Bullseye 3:1
 * right on the target, 4:1 with Bounty; Guard ½ back, Fortress all back; Stakes Up doubles the
 * bet; Tiebreaker gives the player the ties). Long-run return of the player (seeded simulations
 * in src/games/partytrump/sim.ts, flat bets, trump hands kept between rounds as at the table;
 * tests/trump21.test.ts checks shorter runs):
 *   - the strongest strategy found (partytrump/ai.ts `calculated`, also the light bulb): 98.4%
 *     (3 × 100,000 rounds: 98.3 / 99.1 / 97.8);
 *   - the old odds rule (hit at even odds, target-trump advice only): 54.0%; always hit to 17
 *     with no trumps: 52.9%; play every trump as soon as possible, hit to 17: 60.5%.
 * Trumps carry the game: the strong strategy's edge over plain play is ~45 points.
 *
 * How it got there (it paid 124.4% to the strong strategy before):
 *   - the dealer's hand never clogs: a new trump replaces his oldest when it is full (it used to
 *     fill up with cards he never plays, Reset 21 above all, and then get no new trumps);
 *   - ties go to the dealer (they went to the player; worth ~22 points to a strong player);
 *   - the dealer plays a fitting trump three turns in four (was three in five).
 * Tried and left out: more dealer trumps alone level off near 107%; with ties to the dealer the
 * dealer at full aggression (or two trumps a deal) pushes the best strategy to 82–85%.
 *
 * BONUS TRUMPS. The player's hit may turn up a trump card instead of the card (BONUS_ON_HIT, one
 * hit in five, while the hand has room): it joins the hand, the turn stays the player's and the
 * next hit is a sure card, so the bonus never costs the draw. It replaced the old 30% trump that
 * came along with a hit card: seeing the trump before taking the card is worth more, and the
 * eleven newer trumps (Call 1 / 8, Lighten, Heist, Gift, Overload, Rewind, Barrier, Tiebreaker,
 * Bullseye, Reinforce) add to it; at 30% the strong strategy got 100.6–101.6%, at 25% ~100.2%,
 * at 20% 98.4%. The dealer's hits keep the 30% trump along with the card (TRUMP_ON_HIT).
 */

export type Side = 'player' | 'dealer';

export type TrumpId =
  // draw control
  | 'precision'
  | 'feather'
  | 'call1'
  | 'call2'
  | 'call3'
  | 'call4'
  | 'call5'
  | 'call6'
  | 'call7'
  | 'call8'
  | 'twin'
  | 'redraw'
  | 'recall'
  | 'lighten'
  // information
  | 'glimpse'
  | 'foresight'
  | 'reshuffle'
  // target
  | 'line15'
  | 'line17'
  | 'line18'
  | 'line19'
  | 'line20'
  | 'reset21'
  | 'line22'
  | 'line23'
  | 'line24'
  | 'line25'
  | 'line26'
  | 'line27'
  | 'line30'
  | 'shiftDown'
  | 'shiftUp'
  | 'lineWild'
  // attack
  | 'burn'
  | 'switch'
  | 'force'
  | 'freeze'
  | 'shatter'
  | 'pickpocket'
  | 'blindfold'
  | 'heist'
  | 'gift'
  | 'overload'
  | 'rewind'
  // defence
  | 'barrier'
  // stakes
  | 'guard'
  | 'fortress'
  | 'stakes'
  | 'bounty'
  | 'tiebreak'
  | 'bullseye'
  // supply
  | 'reinforce';

export type Rarity = 'common' | 'uncommon' | 'rare';

export interface TrumpInfo {
  id: TrumpId;
  rarity: Rarity;
  /** Can the dealer receive it? */
  dealer?: boolean;
}

/** Every trump, in codex order. Rarity sets how often it is dealt. */
export const TRUMPS: TrumpInfo[] = [
  { id: 'precision', rarity: 'common', dealer: true },
  { id: 'feather', rarity: 'common' },
  { id: 'call1', rarity: 'common' },
  { id: 'call2', rarity: 'common' },
  { id: 'call3', rarity: 'common' },
  { id: 'call4', rarity: 'common', dealer: true },
  { id: 'call5', rarity: 'common', dealer: true },
  { id: 'call6', rarity: 'common' },
  { id: 'call7', rarity: 'common' },
  { id: 'call8', rarity: 'uncommon' },
  { id: 'twin', rarity: 'uncommon' },
  { id: 'redraw', rarity: 'uncommon' },
  { id: 'recall', rarity: 'common', dealer: true },
  { id: 'lighten', rarity: 'uncommon', dealer: true },
  { id: 'glimpse', rarity: 'common' },
  { id: 'foresight', rarity: 'common' },
  { id: 'reshuffle', rarity: 'common' },
  // target family: dealt at TARGET_DEAL_SCALE of its rarity weight (see dealWeight)
  { id: 'line15', rarity: 'rare' },
  { id: 'line17', rarity: 'uncommon', dealer: true },
  { id: 'line18', rarity: 'uncommon', dealer: true },
  { id: 'line19', rarity: 'uncommon', dealer: true },
  { id: 'line20', rarity: 'common', dealer: true },
  { id: 'reset21', rarity: 'uncommon', dealer: true },
  { id: 'line22', rarity: 'common', dealer: true },
  { id: 'line23', rarity: 'uncommon', dealer: true },
  { id: 'line24', rarity: 'uncommon', dealer: true },
  { id: 'line25', rarity: 'uncommon', dealer: true },
  { id: 'line26', rarity: 'uncommon', dealer: true },
  { id: 'line27', rarity: 'uncommon', dealer: true },
  { id: 'line30', rarity: 'rare' },
  { id: 'shiftDown', rarity: 'uncommon', dealer: true },
  { id: 'shiftUp', rarity: 'uncommon', dealer: true },
  { id: 'lineWild', rarity: 'uncommon', dealer: true },
  { id: 'burn', rarity: 'uncommon', dealer: true },
  { id: 'switch', rarity: 'uncommon' },
  { id: 'force', rarity: 'uncommon', dealer: true },
  { id: 'freeze', rarity: 'uncommon', dealer: true },
  { id: 'shatter', rarity: 'uncommon', dealer: true },
  { id: 'pickpocket', rarity: 'rare' },
  { id: 'blindfold', rarity: 'rare' },
  { id: 'heist', rarity: 'uncommon', dealer: true },
  { id: 'gift', rarity: 'uncommon' },
  { id: 'overload', rarity: 'rare' },
  { id: 'rewind', rarity: 'uncommon' },
  { id: 'barrier', rarity: 'uncommon', dealer: true },
  { id: 'guard', rarity: 'common' },
  { id: 'fortress', rarity: 'rare' },
  { id: 'stakes', rarity: 'rare' },
  { id: 'bounty', rarity: 'rare' },
  { id: 'tiebreak', rarity: 'rare' },
  { id: 'bullseye', rarity: 'rare' },
  { id: 'reinforce', rarity: 'uncommon' },
];

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 10, uncommon: 5, rare: 2 };
export const rarityOf = (id: TrumpId) => TRUMPS.find((t) => t.id === id)!.rarity;
export const PLAYER_TRUMPS: TrumpId[] = TRUMPS.map((t) => t.id);
export const DEALER_TRUMPS: TrumpId[] = TRUMPS.filter((t) => t.dealer).map((t) => t.id);
export const MAX_TRUMPS = 5;
/** Chance that a card the dealer hits brings a trump along with it. */
export const TRUMP_ON_HIT = 0.3;
/**
 * Chance that the player's hit turns up a bonus trump instead of the card (the next hit is then a
 * sure card). Lower than the dealer's: the player sees the trump before taking the card.
 */
export const BONUS_ON_HIT = 0.2;

/**
 * The house's balance (see the RTP notes at the top of this file). Kept in one place so the
 * simulations can try other values; the game always runs with these.
 */
export const T21 = {
  /** Trumps the dealer is dealt at every round (the player: one). */
  dealerDeal: 1,
  /** Bonus trump chance of a player's hit (instead of the card) / trump chance with each card the dealer hits. */
  playerOnHit: BONUS_ON_HIT,
  dealerOnHit: TRUMP_ON_HIT,
  /** Chance that the dealer plays a trump at a turn where one fits (three turns in four). */
  aggression: 0.75,
  /** Who wins a tie: the dealer (the house's edge). */
  tiesToPlayer: false,
};

const CALLS: Partial<Record<TrumpId, number>> = { call1: 1, call2: 2, call3: 3, call4: 4, call5: 5, call6: 6, call7: 7, call8: 8 };
/** The Call trumps: the card each one calls (Call 1 … Call 8); undefined for any other trump. */
export const callOf = (id: TrumpId): number | undefined => CALLS[id];

/**
 * Trumps aimed at the opponent's hand or trumps. A Barrier blocks the first of them played
 * against its owner in the round (the trump is spent for nothing).
 */
export const ATTACK_TRUMPS: TrumpId[] = ['burn', 'switch', 'force', 'freeze', 'shatter', 'pickpocket', 'blindfold', 'heist', 'gift', 'overload', 'rewind'];
export const isAttackTrump = (id: TrumpId) => ATTACK_TRUMPS.includes(id);
/** Bullseye: a win exactly on the target pays this much more (3 to 1; 4 to 1 with Bounty). */
export const BULLSEYE_EXTRA = 2;

// ---------------------------------------------------------------- target family

/**
 * Fixed lines. Reach with the 1–11 deck (all eleven cards sum to 66, a hand holds 2–5 cards):
 * 15–20 are met with two or three cards, 22–27 usually take three or four, and 30 needs at
 * least three (11+10+9); with both sides near 30 the deck runs dry, so 30 is a rare extreme,
 * like 15 (most two-card hands already sit at 12–17).
 */
const LINES: Partial<Record<TrumpId, number>> = {
  line15: 15,
  line17: 17,
  line18: 18,
  line19: 19,
  line20: 20,
  reset21: 21,
  line22: 22,
  line23: 23,
  line24: 24,
  line25: 25,
  line26: 26,
  line27: 27,
  line30: 30,
};
/** Line +2 / Line −2 move the current target, clamped to TARGET_MIN..TARGET_MAX. */
const SHIFTS: Partial<Record<TrumpId, number>> = { shiftUp: 2, shiftDown: -2 };
/** Lowest and highest target a shift can reach (every fixed line lies inside it too). */
export const TARGET_MIN = 15;
export const TARGET_MAX = 30;
/** Wild Line draws the new target from this range, never the current one. */
export const WILD_MIN = 16;
export const WILD_MAX = 28;

/** Every trump that changes the target, in codex order. */
export const TARGET_TRUMPS: TrumpId[] = TRUMPS.map((t) => t.id).filter((id) => LINES[id] !== undefined || SHIFTS[id] !== undefined || id === 'lineWild');
export const isTargetTrump = (id: TrumpId) => TARGET_TRUMPS.includes(id);
/** The fixed target a line sets (Line 15…30, Reset 21); undefined for any other trump. */
export const lineValue = (id: TrumpId): number | undefined => LINES[id];
/** How far a shift moves the target (+2 / −2); undefined for any other trump. */
export const shiftValue = (id: TrumpId): number | undefined => SHIFTS[id];

/** The target after a line or a shift is played on `current`; null for Wild Line (drawn) and non-target trumps. */
export function targetAfter(id: TrumpId, current: number): number | null {
  if (LINES[id] !== undefined) return LINES[id]!;
  if (SHIFTS[id] !== undefined) return Math.max(TARGET_MIN, Math.min(TARGET_MAX, current + SHIFTS[id]!));
  return null;
}

/** The targets Wild Line can land on from `current` (never `current` itself). */
export const wildTargets = (current: number): number[] =>
  Array.from({ length: WILD_MAX - WILD_MIN + 1 }, (_, i) => WILD_MIN + i).filter((n) => n !== current);

/** Wild Line's draw: a uniformly random target in WILD_MIN..WILD_MAX other than `current`. */
export function wildTarget(current: number, rng: Rng = cryptoRng): number {
  const opts = wildTargets(current);
  return opts[rng(opts.length)];
}

/**
 * Dealing balance. The target family grew from 4 to 16 cards; dealt at full rarity weight it
 * would take ~32% of the player's trumps (it was ~10%) and crowd out the others. So each target
 * trump is dealt at 3/10 of its rarity weight: rarity still orders the lines among themselves
 * (20 and 22 most often, 15 and 30 seldom), and the family as a whole makes ~10.0% of the
 * player's trumps (the old four lines: 10.3%) and ~24.2% of the dealer's (was 25%), with the
 * eleven newer trumps in the pools.
 */
export const TARGET_DEAL_SCALE = 0.3;
/** Integer dealing weight of a trump: its rarity weight ×10, or ×3 inside the target family. */
export const dealWeight = (id: TrumpId): number => RARITY_WEIGHT[rarityOf(id)] * Math.round((isTargetTrump(id) ? TARGET_DEAL_SCALE : 1) * 10);

/** Who wins a finished duel: 1 player, -1 dealer. Closest to the target wins, over it busts, if both bust the lower total wins; ties go to the dealer (T21.tiesToPlayer). */
export function duelOutcome(player: number, dealer: number, target: number, tiesToPlayer = T21.tiesToPlayer): 1 | -1 {
  const pb = player > target;
  const db = dealer > target;
  if (player === dealer) return tiesToPlayer ? 1 : -1;
  if (pb && db) return player < dealer ? 1 : -1;
  if (pb) return -1;
  if (db) return 1;
  return player > dealer ? 1 : -1;
}

export type DuelEvent =
  | { t: 'draw'; side: Side; value: number }
  | { t: 'back'; side: Side; value: number }
  | { t: 'switch'; a: number; b: number }
  /** The target changed; `wild`: drawn by Wild Line (the view spins it). */
  | { t: 'target'; n: number; wild?: boolean }
  | { t: 'trump'; side: Side; id: TrumpId; ok: boolean }
  /** A new trump; `bonus`: it came out of the deck with a hit (the player's draw is still to come). */
  | { t: 'gain'; side: Side; id: TrumpId; bonus?: boolean }
  /** Heist / Gift: a card goes from one hand to the other. */
  | { t: 'move'; from: Side; to: Side; value: number }
  /** `side`'s Barrier stopped the opponent's attack trump `id`. */
  | { t: 'blocked'; side: Side; id: TrumpId }
  /** A trump leaves a hand: destroyed, stolen, or the dealer's oldest making room for a new one. */
  | { t: 'lose'; side: Side; id: TrumpId; by: 'shatter' | 'pickpocket' | 'discard' }
  | { t: 'foresee'; value: number }
  | { t: 'shuffle' }
  | { t: 'freeze'; side: Side }
  | { t: 'reveal' }
  | { t: 'stand'; side: Side };

export class Duel {
  deck: number[] = [];
  player: number[] = [];
  dealer: number[] = [];
  target = 21;
  guard = false;
  fortress = false;
  stakes = 1;
  /** Extra winnings multiplier (Bounty: a win pays 2:1). */
  winMult = 1;
  glimpsed = false;
  /** The player knows the top card of the deck (Foresight). */
  knownTop = false;
  /** Frozen side must stand on its next turn. */
  frozen: Record<Side, boolean> = { player: false, dealer: false };
  /** The dealer can't play trumps this round (Blindfold). */
  blinded = false;
  /** Chance (0..1) that the dealer plays a trump when he has a good one. */
  aggression = T21.aggression;
  /** Barrier: the opponent's next attack trump this round is blocked. */
  barrier: Record<Side, boolean> = { player: false, dealer: false };
  /** Tiebreaker: ties go to the player this round. */
  tieWin = false;
  /** Bullseye: a win exactly on the target pays BULLSEYE_EXTRA more. */
  bullseye = false;
  /**
   * The player's last hit drew a bonus trump instead of a card: the turn is still the player's,
   * and the next hit is a sure card (`sureCard`).
   */
  lastHitBonus = false;
  private sure = false;
  stood: Record<Side, boolean> = { player: false, dealer: false };
  trumps: Record<Side, TrumpId[]>;
  private evs: DuelEvent[] = [];

  constructor(
    private rng: Rng = cryptoRng,
    trumps?: Record<Side, TrumpId[]>,
  ) {
    this.trumps = trumps ?? { player: [], dealer: [] };
  }

  private emit(e: DuelEvent) {
    this.evs.push(e);
  }

  private flush() {
    const out = this.evs;
    this.evs = [];
    return out;
  }

  total(side: Side) {
    return this[side].reduce((a, b) => a + b, 0);
  }

  /** Total the dealer can see of the player's hand (the first card is hidden from him). */
  visiblePlayerTotal() {
    return this.player.slice(1).reduce((a, b) => a + b, 0);
  }

  get over() {
    return this.stood.player && this.stood.dealer;
  }

  /** Value of the top card when the player has seen it with Foresight. */
  get nextCard(): number | null {
    return this.knownTop && this.deck.length ? this.deck[0] : null;
  }

  private give(side: Side, value?: number): number | null {
    let v: number | undefined;
    if (value !== undefined) {
      const i = this.deck.indexOf(value);
      if (i < 0) return null;
      v = this.deck.splice(i, 1)[0];
      if (i === 0) this.knownTop = false;
    } else {
      v = this.deck.shift();
      this.knownTop = false;
    }
    if (v === undefined) return null;
    this[side].push(v);
    this.emit({ t: 'draw', side, value: v });
    return v;
  }

  /** Puts a card back into the deck and reshuffles it. */
  private giveBack(side: Side) {
    const v = this[side].pop()!;
    this.deck.push(v);
    this.deck = shuffle(this.deck, this.rng);
    this.knownTop = false;
    this.emit({ t: 'back', side, value: v });
  }

  private pickTrump(side: Side): TrumpId {
    const pool = TRUMPS.filter((t) => side === 'player' || t.dealer);
    const total = pool.reduce((a, t) => a + dealWeight(t.id), 0);
    let r = this.rng(total);
    for (const t of pool) {
      r -= dealWeight(t.id);
      if (r < 0) return t.id;
    }
    return pool[0].id;
  }

  /**
   * A new trump. The player's hand holds five at most (a new one is lost when it is full); the
   * dealer's holds five too, but a new one replaces his oldest, so his hand never clogs with
   * cards he can't play.
   */
  private grant(side: Side, chance: number, bonus = false): boolean {
    const list = this.trumps[side];
    if (list.length >= MAX_TRUMPS && side === 'player') return false;
    if (this.rng(1000) >= chance * 1000) return false;
    const id = this.pickTrump(side);
    if (list.length >= MAX_TRUMPS) {
      const [old] = list.splice(0, 1);
      this.emit({ t: 'lose', side, id: old, by: 'discard' });
    }
    list.push(id);
    this.emit(bonus ? { t: 'gain', side, id, bonus } : { t: 'gain', side, id });
    return true;
  }

  /** New round: fresh 11-card deck, two cards each (dealer's first face down), one trump each. */
  start(): DuelEvent[] {
    this.deck = shuffle(Array.from({ length: 11 }, (_, i) => i + 1), this.rng);
    this.player = [];
    this.dealer = [];
    this.target = 21;
    this.guard = false;
    this.fortress = false;
    this.stakes = 1;
    this.winMult = 1;
    this.glimpsed = false;
    this.knownTop = false;
    this.frozen = { player: false, dealer: false };
    this.blinded = false;
    this.barrier = { player: false, dealer: false };
    this.tieWin = false;
    this.bullseye = false;
    this.lastHitBonus = false;
    this.sure = false;
    this.stood = { player: false, dealer: false };
    this.give('player');
    this.give('dealer');
    this.give('player');
    this.give('dealer');
    this.grant('player', 1);
    for (let k = 0; k < T21.dealerDeal; k++) this.grant('dealer', 1);
    return this.flush();
  }

  /**
   * A hit. The player's hit may turn up a bonus trump instead of the card (T21.playerOnHit, while
   * the trump hand has room): it joins the hand, the turn stays the player's and the next hit is a
   * sure card, so the bonus never costs the draw. The dealer's hit always draws its card and may
   * bring a trump along with it (T21.dealerOnHit).
   */
  hit(side: Side): DuelEvent[] {
    if (side === 'player') this.lastHitBonus = false;
    if (this.frozen[side]) return this.stand(side);
    if (side === 'player' && this.deck.length) {
      if (this.sure) this.sure = false;
      else if (this.grant('player', T21.playerOnHit, true)) {
        this.lastHitBonus = true;
        this.sure = true;
        return this.flush();
      }
    }
    if (this.give(side) !== null) {
      this.stood = { player: false, dealer: false };
      if (side === 'dealer') this.grant('dealer', T21.dealerOnHit, true);
    } else this.stood[side] = true;
    return this.flush();
  }

  /** The player's next hit is a sure card (a bonus trump just came out). */
  get sureCard() {
    return this.sure;
  }

  stand(side: Side): DuelEvent[] {
    this.stood[side] = true;
    this.frozen[side] = false;
    this.emit({ t: 'stand', side });
    return this.flush();
  }

  /** Whether a trump would do anything right now. */
  canUse(side: Side, id: TrumpId): boolean {
    const other: Side = side === 'player' ? 'dealer' : 'player';
    const me = this[side];
    const opp = this[other];
    if (CALLS[id] !== undefined) return this.deck.includes(CALLS[id]!);
    if (LINES[id] !== undefined || SHIFTS[id] !== undefined) return targetAfter(id, this.target) !== this.target;
    switch (id) {
      case 'lighten':
        return me.length >= 2;
      case 'heist':
        return opp.length >= 2;
      case 'gift':
        return me.length >= 2;
      case 'overload':
        return this.deck.length >= 2;
      case 'rewind':
        return me.length >= 2 && opp.length >= 2;
      case 'barrier':
        return !this.barrier[side];
      case 'tiebreak':
        return side === 'player' && !this.tieWin;
      case 'bullseye':
        return side === 'player' && !this.bullseye;
      case 'reinforce':
        return side === 'player';
      case 'lineWild':
        return true;
      case 'precision':
      case 'feather':
        return this.deck.length > 0;
      case 'twin':
        return this.deck.length >= 2;
      case 'redraw':
        return me.length >= 2 && this.deck.length > 0;
      case 'recall':
        return me.length >= 2;
      case 'glimpse':
        return side === 'player' && !this.glimpsed;
      case 'foresight':
        return side === 'player' && !this.knownTop && this.deck.length > 0;
      case 'reshuffle':
        return this.deck.length > 1;
      case 'burn':
        return opp.length >= 2;
      case 'switch':
        return me.length >= 2 && opp.length >= 2;
      case 'force':
        return this.deck.length > 0;
      case 'freeze':
        return !this.frozen[other];
      case 'shatter':
      case 'pickpocket':
        return this.trumps[other].length > 0;
      case 'blindfold':
        return side === 'player' && !this.blinded;
      case 'guard':
        return side === 'player' && !this.guard && !this.fortress;
      case 'fortress':
        return side === 'player' && !this.fortress;
      case 'stakes':
        return side === 'player' && this.stakes === 1;
      case 'bounty':
        return side === 'player' && this.winMult === 1;
      default:
        return false;
    }
  }

  useTrump(side: Side, id: TrumpId): DuelEvent[] {
    const hand = this.trumps[side];
    const i = hand.indexOf(id);
    if (i < 0 || !this.canUse(side, id)) return [];
    hand.splice(i, 1);
    this.emit({ t: 'trump', side, id, ok: true });
    const other: Side = side === 'player' ? 'dealer' : 'player';
    const drew = () => (this.stood = { player: false, dealer: false });
    if (this.barrier[other] && isAttackTrump(id)) {
      // the opponent's Barrier takes the hit: the trump is spent for nothing
      this.barrier[other] = false;
      this.emit({ t: 'blocked', side: other, id });
      return this.flush();
    }
    if (CALLS[id] !== undefined) {
      this.give(side, CALLS[id]);
      drew();
      return this.flush();
    }
    if (isTargetTrump(id)) {
      const wild = id === 'lineWild';
      this.target = wild ? wildTarget(this.target, this.rng) : targetAfter(id, this.target)!;
      this.emit(wild ? { t: 'target', n: this.target, wild } : { t: 'target', n: this.target });
      return this.flush();
    }
    switch (id) {
      case 'precision': {
        const room = this.target - this.total(side);
        const fit = this.deck.filter((v) => v <= room);
        this.give(side, fit.length ? Math.max(...fit) : Math.min(...this.deck));
        drew();
        break;
      }
      case 'feather':
        this.give(side, Math.min(...this.deck));
        drew();
        break;
      case 'twin':
        this.give(side);
        this.give(side);
        drew();
        break;
      case 'redraw': {
        // draw first, then return the old card, so the new one is always different
        const old = this[side].length - 1;
        this.give(side);
        const [v] = this[side].splice(old, 1);
        this.deck.push(v);
        this.deck = shuffle(this.deck, this.rng);
        this.knownTop = false;
        this.emit({ t: 'back', side, value: v });
        drew();
        break;
      }
      case 'recall':
        this.giveBack(side);
        drew();
        break;
      case 'glimpse':
        this.glimpsed = true;
        this.emit({ t: 'reveal' });
        break;
      case 'foresight':
        this.knownTop = true;
        this.emit({ t: 'foresee', value: this.deck[0] });
        break;
      case 'reshuffle':
        this.deck = shuffle(this.deck, this.rng);
        this.knownTop = false;
        this.emit({ t: 'shuffle' });
        break;
      case 'burn':
        this.giveBack(other);
        drew();
        break;
      case 'switch': {
        const a = this[side].pop()!;
        const b = this[other].pop()!;
        this[side].push(b);
        this[other].push(a);
        this.emit({ t: 'switch', a, b });
        drew();
        break;
      }
      case 'force':
        this.give(other);
        drew();
        break;
      case 'freeze':
        this.frozen[other] = true;
        this.emit({ t: 'freeze', side: other });
        break;
      case 'shatter': {
        const list = this.trumps[other];
        const [lost] = list.splice(this.rng(list.length), 1);
        this.emit({ t: 'lose', side: other, id: lost, by: 'shatter' });
        break;
      }
      case 'pickpocket': {
        const list = this.trumps[other];
        const [got] = list.splice(this.rng(list.length), 1);
        this.emit({ t: 'lose', side: other, id: got, by: 'pickpocket' });
        if (this.trumps[side].length < MAX_TRUMPS) {
          this.trumps[side].push(got);
          this.emit({ t: 'gain', side, id: got });
        }
        break;
      }
      case 'blindfold':
        this.blinded = true;
        break;
      case 'guard':
        this.guard = true;
        break;
      case 'fortress':
        this.fortress = true;
        break;
      case 'stakes':
        this.stakes = 2;
        break;
      case 'bounty':
        this.winMult = 2;
        break;
      case 'lighten': {
        // the highest card goes back to the deck
        const h = this[side];
        const k = h.indexOf(Math.max(...h));
        const [v] = h.splice(k, 1);
        this.deck.push(v);
        this.deck = shuffle(this.deck, this.rng);
        this.knownTop = false;
        this.emit({ t: 'back', side, value: v });
        drew();
        break;
      }
      case 'heist': {
        const v = this[other].pop()!;
        this[side].push(v);
        this.emit({ t: 'move', from: other, to: side, value: v });
        drew();
        break;
      }
      case 'gift': {
        const v = this[side].pop()!;
        this[other].push(v);
        this.emit({ t: 'move', from: side, to: other, value: v });
        drew();
        break;
      }
      case 'overload':
        this.give(other);
        this.give(other);
        drew();
        break;
      case 'rewind':
        this.giveBack(side);
        this.giveBack(other);
        drew();
        break;
      case 'barrier':
        this.barrier[side] = true;
        break;
      case 'tiebreak':
        this.tieWin = true;
        break;
      case 'bullseye':
        this.bullseye = true;
        break;
      case 'reinforce':
        this.grant(side, 1);
        this.grant(side, 1);
        break;
    }
    return this.flush();
  }

  /** 1 player wins, -1 dealer wins. Closest to the target wins; over the target busts; ties go to the dealer (Tiebreaker: to the player). */
  outcome(): 1 | -1 {
    return duelOutcome(this.total('player'), this.total('dealer'), this.target, T21.tiesToPlayer || this.tieWin);
  }

  /** What a win pays (to 1): 1, 2 with Bounty, plus BULLSEYE_EXTRA when Bullseye lands exactly on the target. */
  get winPays() {
    return this.winMult + (this.bullseye && this.total('player') === this.target ? BULLSEYE_EXTRA : 0);
  }

  /** Amount returned on a stake (stake already includes the Stakes Up raise). */
  payout(stake: number): number {
    const o = this.outcome();
    if (o > 0) return stake * (1 + this.winPays);
    if (this.fortress) return stake;
    return this.guard ? stake / 2 : 0;
  }

  // ---------------------------------------------------------------- dealer AI

  /** Probability that one more unknown card keeps `side` at or under the target (dealer's view). */
  private safeOdds(total: number): number {
    // cards unknown to the dealer: the deck plus the player's hidden first card
    const unknown = this.sight('dealer').unknown;
    if (!unknown.length) return 0;
    return unknown.filter((v) => total + v <= this.target).length / unknown.length;
  }

  // ---------------------------------------------------------------- target trumps (dealer AI and player hint)

  /**
   * What `side` knows of its opponent: the face-up total, whether one card is hidden, and the
   * cards it can't see (the deck plus that hidden card). The dealer never sees the player's first
   * card; the player sees the dealer's after Glimpse.
   */
  private sight(side: Side): { seen: number; hidden: boolean; unknown: number[] } {
    const opp = side === 'dealer' ? this.player : this.dealer;
    const hidden = opp.length > 0 && (side === 'dealer' || !this.glimpsed);
    const seen = opp.slice(hidden ? 1 : 0).reduce((a, b) => a + b, 0);
    return { seen, hidden, unknown: hidden ? [...this.deck, opp[0]] : [...this.deck] };
  }

  /** Share of the opponent's possible totals (as `side` sees them) for which `pred` holds. */
  private oddsOver(side: Side, pred: (opp: number) => boolean): number {
    const { seen, hidden, unknown } = this.sight(side);
    if (!hidden) return pred(seen) ? 1 : 0;
    return unknown.filter((h) => pred(seen + h)).length / unknown.length;
  }

  /** `side`'s chance to win if both stood now with the target at `n`. */
  private standWin(side: Side, n: number): number {
    const me = this.total(side);
    return this.oddsOver(side, (o) => (side === 'player' ? duelOutcome(me, o, n) > 0 : duelOutcome(o, me, n) < 0));
  }

  /** Mean of standWin over every target Wild Line may draw. */
  private wildWin(side: Side): number {
    const outs = wildTargets(this.target);
    return outs.reduce((a, n) => a + this.standWin(side, n), 0) / outs.length;
  }

  /** Chance that one more card keeps `side` at or under the target (exact for the player after Foresight). */
  private hitOdds(side: Side): number {
    const me = this.total(side);
    if (!this.deck.length) return 0;
    if (side === 'player' && this.nextCard !== null) return me + this.nextCard <= this.target ? 1 : 0;
    const unknown = this.sight(side).unknown;
    return unknown.filter((v) => me + v <= this.target).length / unknown.length;
  }

  /** Fixed lines and shifts `side` could play now with the target each would set, lowest target first. */
  private targetOptions(side: Side, has: (id: TrumpId) => boolean) {
    const T = this.target;
    return TARGET_TRUMPS.filter((id) => id !== 'lineWild' && has(id))
      .map((id) => ({ id, n: targetAfter(id, T)! }))
      .filter((o) => o.n !== T)
      .sort((a, b) => a.n - b.n || Number(SHIFTS[a.id] !== undefined) - Number(SHIFTS[b.id] !== undefined)); // on a tie, keep the shift (it fits more spots)
  }

  /**
   * Over the target: the lowest line (or shift) that brings `side` back under it, when that
   * really improves its chances; failing that, Wild Line as a gamble.
   */
  private rescueTrump(side: Side, has: (id: TrumpId) => boolean): TrumpId | null {
    const me = this.total(side);
    if (me <= this.target) return null;
    const now = this.standWin(side, this.target);
    const save = this.targetOptions(side, has).find((o) => o.n >= me && this.standWin(side, o.n) > now);
    if (save) return save.id;
    if (has('lineWild') && this.wildWin(side) >= now + 0.1) return 'lineWild';
    return null;
  }

  /**
   * At a strong total: pull the target down onto it (at most 3 above it) when the opponent is
   * likely to be over the new line; the lowest such line wins.
   */
  private pullTrump(side: Side, has: (id: TrumpId) => boolean): TrumpId | null {
    const T = this.target;
    const me = this.total(side);
    if (me > T) return null;
    const now = this.standWin(side, T);
    const pull = this.targetOptions(side, has).find(
      (o) => o.n < T && o.n >= me && o.n - me <= 3 && this.oddsOver(side, (opp) => opp > o.n) >= 0.5 && this.standWin(side, o.n) > now,
    );
    return pull?.id ?? null;
  }

  /** Clearly losing (under the target, little chance to win as it stands, no safe draw): Wild Line as a gamble. */
  private gambleTrump(side: Side, has: (id: TrumpId) => boolean): TrumpId | null {
    if (!has('lineWild') || this.total(side) > this.target) return null;
    const now = this.standWin(side, this.target);
    if (now >= 0.3 || this.hitOdds(side) >= 0.5) return null;
    return this.wildWin(side) >= now + 0.15 ? 'lineWild' : null;
  }

  /**
   * Hint for the player: the target trump in hand that best rescues or protects the hand right
   * now (same reasoning as the dealer's), or null.
   */
  trumpAdvice(): TrumpId | null {
    const has = (id: TrumpId) => this.trumps.player.includes(id) && this.canUse('player', id);
    return this.rescueTrump('player', has) ?? this.pullTrump('player', has) ?? this.gambleTrump('player', has);
  }

  /** Picks the dealer's trump for this turn (or null). */
  private dealerTrump(): TrumpId | null {
    if (this.blinded) return null;
    const d = this.total('dealer');
    const pv = this.visiblePlayerTotal();
    const est = pv + 6;
    const T = this.target;
    const has = (id: TrumpId) => this.trumps.dealer.includes(id) && this.canUse('dealer', id);
    if (d > T) {
      // Recall (the last card) or Lighten (the highest), the one that brings him back under
      const last = this.dealer[this.dealer.length - 1];
      if (has('recall') && d - last <= T) return 'recall';
      if (has('lighten') && d - Math.max(...this.dealer) <= T) return 'lighten';
      if (has('recall')) return 'recall';
    }
    const rescue = this.rescueTrump('dealer', has);
    if (rescue) return rescue;
    if (this.trumps.player.length >= 3 && has('shatter')) return 'shatter';
    const pull = this.pullTrump('dealer', has);
    if (pull) return pull;
    if (est >= T - 3 && est <= T && has('force')) return 'force';
    if (this.player.length >= 2 && this.player[this.player.length - 1] >= 6 && est >= T - 2 && has('burn')) return 'burn';
    if (est <= T - 7 && has('freeze')) return 'freeze';
    // Heist: the player's last card when it fits his own hand nicely
    const pl = this.player[this.player.length - 1];
    if (this.player.length >= 2 && d + pl <= T && d + pl >= T - 3 && has('heist')) return 'heist';
    if (d <= T - 4 && has('precision')) return 'precision';
    for (const c of ['call5', 'call4'] as const) {
      const n = CALLS[c]!;
      if (d + n <= T && d + n >= T - 3 && has(c)) return c;
    }
    // a Barrier against the player's attacks when the player holds a few trumps
    if (this.trumps.player.length >= 2 && has('barrier')) return 'barrier';
    return this.gambleTrump('dealer', has);
  }

  /** The dealer's turn: maybe one trump, then hit or stand. */
  dealerTurn(): DuelEvent[] {
    const out: DuelEvent[] = [];
    if (this.frozen.dealer) {
      out.push(...this.stand('dealer'));
      return out;
    }
    const trump = this.dealerTrump();
    if (trump && this.rng(1000) < this.aggression * 1000) out.push(...this.useTrump('dealer', trump));
    const now = this.total('dealer');
    const estPlayer = this.visiblePlayerTotal() + 6;
    const odds = this.safeOdds(now);
    const behind = now < Math.min(this.target, estPlayer);
    const hit = this.deck.length > 0 && now < this.target && (now <= this.target - 6 || (behind && odds >= 0.45) || odds >= 0.75);
    out.push(...(hit ? this.hit('dealer') : this.stand('dealer')));
    return out;
  }

  /** Hint for the player: hit when the odds of staying safe are good (exact when the next card is known). */
  advice(): 'hit' | 'stand' {
    const p = this.total('player');
    if (p >= this.target || !this.deck.length || this.frozen.player) return 'stand';
    const next = this.nextCard;
    if (next !== null) return p + next <= this.target ? 'hit' : 'stand';
    const unknown = [...this.deck, ...(this.glimpsed ? [] : [this.dealer[0]])];
    const safe = unknown.filter((v) => p + v <= this.target).length / unknown.length;
    return safe >= 0.5 ? 'hit' : 'stand';
  }
}
