import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { cryptoRng } from '../../core/rng';
import { money } from '../../core/wallet';
import { peekCard, shake, slideCard, slideChips, wait, type Place } from '../../table/anim';
import { CARD_H, REST_Y, type Card3D } from '../../table/cardMesh';
import { ChipPile } from '../../table/chips';
import { FELTS, type FeltKey } from '../../table/table';
import type { Pin } from '../../ui/hud';
import { handValue, totalLabel } from '../blackjack/rules';
import { basicStrategy, type Move } from '../blackjack/strategy';
import type { SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { dealerX, fanPlace, handLx, LY, onTable, PLAYER_SEAT, seatLayout, type SeatGeo } from './layout';
import { drawMindset, newMemory, remember, thinkTime, type AiMemory, type Mindset } from './mindset';
import { boxWidth, glowPlate, PARTY_COLORS as COLORS, partyPlate, partyPrint, seatBox, setPlateName, type Plate } from './partyKit';
import { drawRegulars, replacementFor } from './roster';
import { aiBet, aiMove, closeSpot, HiLo, isBroke, PartyRound, PB, shownCards, type AiProfile, type PEvent, type SeatResult } from './rules';

addStrings(
  {
    'pb.print1': 'PARTY BLACKJACK',
    'pb.print2': 'BLACKJACK PAYS 3 TO 2',
    'pb.print3': 'DEALER MUST STAND ON SOFT 17',
    'pb.tagline': 'Five seats · Pays 3 to 2',
    'pb.bet': 'BET',
    'pb.needBet': 'Place your BET',
    'pb.bust': 'Bust!',
    'pb.bj': 'Blackjack!',
    'pb.win': 'Win',
    'pb.lose': 'Lose',
    'pb.push': 'Push',
    'pb.busted': 'Busted!',
    'pb.newcomer': 'New player',
    'pb.rules': `
      <p>Blackjack at a busy table: you and four regulars each play your own hand against the same dealer. Get closer to 21 than the dealer without going over. Face cards count 10 and Aces 1 or 11.</p>
      <h4>Table</h4>
      <p>6 decks · Blackjack pays <b>3 to 2</b> · Dealer must stand on soft 17 · The dealer peeks for blackjack with an Ace or ten up. To keep the party moving there is <b>no insurance</b>.</p>
      <h4>Order of play</h4>
      <p>Cards are dealt from the dealer's left (first base, on your right): one to each seat, the dealer's up card, a second round, then the hole card. The seats then play in the same order, and the dealer draws last.</p>
      <h4>Moves</h4>
      <p><b>Hit</b>: take a card. <b>Stand</b>: keep your hand. <b>Double</b>: double the bet and take exactly one more card (any first two cards, also after splitting). <b>Split</b>: split a pair into two hands (up to 4 hands; split Aces get one card each).</p>
      <h4>The regulars</h4>
      <p>Regulars from the Villa Lago circuit sit in with you, a different crowd at every visit. Each has a temperament of their own, but nobody plays every hand the same way: sometimes they press, sometimes they play it careful, and sometimes they are quietly counting cards. Watch their bets and their moves; what they are thinking, they keep to themselves. When one goes broke they leave, and someone new pulls up a chair. They bet 10–200 of their own chips; only your bets touch your bankroll.</p>
      <h4>Hint</h4>
      <p>The light bulb shows the basic-strategy play for these rules.</p>`,
  },
  {
    'pb.print2': 'BLACKJACK PAGA 3 PARA 2',
    'pb.print3': 'DEALER DEVE PARAR NO SOFT 17',
    'pb.tagline': 'Cinco lugares · Paga 3 para 2',
    'pb.bet': 'APOSTA',
    'pb.needBet': 'Faça sua APOSTA',
    'pb.bust': 'Estourou!',
    'pb.win': 'Ganhou',
    'pb.lose': 'Perdeu',
    'pb.push': 'Empate',
    'pb.busted': 'Quebrou!',
    'pb.newcomer': 'Chegou',
    'pb.rules': `
      <p>Blackjack numa mesa cheia: você e quatro frequentadores jogam cada um a sua mão contra o mesmo dealer. Chegue mais perto de 21 que o dealer sem passar. Figuras valem 10 e o Ás vale 1 ou 11.</p>
      <h4>Mesa</h4>
      <p>6 baralhos · Blackjack paga <b>3 para 2</b> · O dealer para no soft 17 · O dealer espia o blackjack com Ás ou 10 aberto. Para a festa andar rápido, <b>não há seguro</b>.</p>
      <h4>Ordem do jogo</h4>
      <p>As cartas saem a partir da esquerda do dealer (a primeira base, à sua direita): uma para cada lugar, a carta aberta do dealer, uma segunda rodada e a carta fechada. Os lugares jogam na mesma ordem e o dealer compra por último.</p>
      <h4>Jogadas</h4>
      <p><b>Pedir</b>: receber uma carta. <b>Parar</b>: ficar com a mão. <b>Dobrar</b>: dobrar a aposta e receber exatamente mais uma carta (com as duas primeiras cartas, também depois de dividir). <b>Dividir</b>: separar um par em duas mãos (até 4 mãos; Ases divididos recebem uma carta cada).</p>
      <h4>Os frequentadores</h4>
      <p>Frequentadores do circuito Villa Lago sentam com você, uma turma diferente a cada visita. Cada um tem o seu temperamento, mas ninguém joga todas as mãos do mesmo jeito: às vezes partem para cima, às vezes jogam com cautela e às vezes estão contando cartas em silêncio. Repare nas apostas e nas jogadas; o que estão pensando, eles guardam para si. Quem quebra se levanta, e logo outra pessoa puxa a cadeira. Eles apostam de 10 a 200 com as próprias fichas; só as suas apostas mexem no seu saldo.</p>
      <h4>Dica</h4>
      <p>A lâmpada mostra a jogada da estratégia básica para estas regras.</p>`,
  },
);

/** Vertical anchors in the portrait layout frame. */
const V = { dealer: 0.205, print: 0.352, seat: 0.72 };
/** Betting places of the player's hands (the first is the one bet on; splits use the others). */
const PSPOTS = ['bet', 'h2', 'h3', 'h4'];
const N = 5;
/** Seat index of the rules (play order, 0 = first base on the player's right) ↔ position on screen. */
const posOf = (seat: number) => N - 1 - seat;
const seatOf = (pos: number) => N - 1 - pos;

interface AiState {
  profile: AiProfile;
  /** Chips in front of the player. */
  chips: number;
  /** This round's stakes on the felt (bet, doubles, splits). */
  stake: number;
  /** What the dealer settled (stake + winnings) while it is still on the felt; null before the showdown. */
  owed: number | null;
  /** What the regular remembers of the session (streak, last mindset); their next mindset leans on it. */
  mem: AiMemory;
  /** This hand's hidden mindset, drawn when they bet. Never shown. */
  mind: Mindset | null;
}

/** A regular sitting down: their own bankroll and a fresh memory. */
const seatRegular = (profile: AiProfile): AiState => ({ profile, chips: profile.bank, stake: 0, owed: null, mem: newMemory(), mind: null });

interface HandV {
  cards: (Card3D | undefined)[];
  /** Cards dealt or in flight. */
  n: number;
  pile: ChipPile;
  /** The player's betting place that holds this hand's chips. */
  spot?: string;
  bubble: Pin;
  doubled: boolean;
  /** The hand being played, when the seat has split. */
  active: boolean;
}

interface SeatV {
  pos: number;
  geo: SeatGeo;
  color: string;
  ai: AiState | null;
  hands: HandV[];
  /** AI: the pile of the first hand (always there, it takes the bet). */
  betPile: ChipPile | null;
  extraPiles: ChipPile[];
  payouts: ChipPile[];
  plate: Pin;
  plateText: Plate['plateText'];
  tag: Pin;
  tagOn: boolean;
  active: boolean;
}

export class PartyBlackjackView extends TableGame {
  readonly id = 'partybj';
  readonly title = 'Party Blackjack';
  // deep blue felt (falls back to a stock blue until the 'partybj' felt exists)
  protected readonly felt = ('partybj' in FELTS ? 'partybj' : 'doubledraw') as FeltKey;
  private rng = cryptoRng;
  /** The four regulars at the table (a new draw from the circuit at every visit). */
  private ai: AiState[] = drawRegulars(4, cryptoRng).map(seatRegular);
  /** The regulars' Hi-Lo count of the shoe: they all watch the same cards. */
  private count = new HiLo(PB.decks);
  /** Cards left in the shoe when the count last looked: more now means it was reshuffled. */
  private shoeLeft = 0;
  private seats: SeatV[] = [];
  private round: PartyRound | null = null;
  private dealer: (Card3D | undefined)[] = [];
  private dealerN = 0;
  private dealerZ = 0;
  private dealerBubble: Pin | null = null;
  private dealerTag: Pin | null = null;
  private dealerTagOn = false;
  private myTurn = false;
  /** The dealer is drawing (slower pace than the deal). */
  private drawing = false;
  /** Bumped on exit: a round still running from before goes quiet. */
  private run = 0;
  private aiBetting: Promise<void> = Promise.resolve();
  private aiSweep: Promise<void> = Promise.resolve();
  private v3 = new THREE.Vector3();

  constructor(g: GameCtx) {
    super(g, PB.decks);
  }

  /** A different crowd at every visit: four regulars of the circuit sit in, at a freshly shuffled shoe. */
  async enter() {
    this.ai = drawRegulars(4, this.rng).map(seatRegular);
    this.count.reset();
    this.shoeLeft = 0;
    await super.enter();
  }

  rules() {
    return t('pb.rules');
  }

  // ---------------------------------------------------------------- table
  protected spotDefs(): SpotDef[] {
    return PSPOTS.map((id, i) => ({
      id,
      label: t('pb.bet'),
      u: 0.5,
      v: V.seat,
      size: 0.9,
      ring: false,
      ...(i === 0 ? { max: PB.maxBet } : { auto: true }),
    }));
  }

  protected defaultBets() {
    return { bet: 25 };
  }

  protected validate() {
    return (this.spots.amounts().bet ?? 0) < PB.minBet ? t('pb.needBet') : '';
  }

  protected decorate() {
    const { stage, table } = this.g;
    this.disposeSeats();
    const playerZ = stage.screenToTable(0.5, V.seat).z;
    this.dealerZ = stage.screenToTable(0.5, V.dealer).z;
    const pr = stage.screenToTable(0.5, V.print);
    table.addDecalAt(partyPrint(t('pb.print1'), t('pb.print2'), t('pb.print3')), 0, pr.z, 4.1);
    const geos = seatLayout(playerZ, stage.stretch);
    this.seats = geos.map((geo, pos) => {
      const mid = onTable(geo, 0, (geo.top + geo.bottom) / 2);
      table.addDecalAt(seatBox(geo, COLORS[pos]), mid.x, mid.z, boxWidth(geo)).rotation.y = geo.yaw;
      const ai = pos === PLAYER_SEAT ? null : this.ai[pos < PLAYER_SEAT ? pos : pos - 1];
      const at = onTable(geo, 0, 0);
      const sv: SeatV = {
        pos,
        geo,
        color: COLORS[pos],
        ai,
        hands: [],
        betPile: ai ? new ChipPile(this.g.chips, stage.table, new THREE.Vector3(at.x, 0, at.z)) : null,
        extraPiles: [],
        payouts: [],
        ...partyPlate(this.g.hud, COLORS[pos], ai ? ai.profile : null),
        tag: this.g.hud.pin('handtag'),
        tagOn: false,
        active: false,
      };
      return sv;
    });
    this.dealerBubble = this.g.hud.pin('bubble');
    this.dealerTag = this.g.hud.pin('handtag dealer');
  }

  private disposeSeats() {
    for (const sv of this.seats) {
      for (const hv of sv.hands) hv.bubble.remove();
      sv.betPile?.dispose();
      for (const p of [...sv.extraPiles, ...sv.payouts]) p.dispose();
      sv.plate.remove();
      sv.tag.remove();
    }
    this.seats = [];
    this.dealerBubble?.remove();
    this.dealerTag?.remove();
    this.dealerBubble = null;
    this.dealerTag = null;
  }

  protected cleanup() {
    this.run++;
    this.myTurn = false;
    this.round = null;
    this.dealer = [];
    this.dealerN = 0;
    // the regulars take back what is theirs on the felt: the settled return, or an unplayed stake
    for (const a of this.ai) {
      a.chips += a.owed ?? a.stake;
      a.stake = 0;
      a.owed = null;
    }
    this.disposeSeats();
  }

  /** Suspends a round that outlived its table (the player left mid-hand). */
  private async alive(run: number) {
    if (run !== this.run) await new Promise<never>(() => {});
  }

  // ---------------------------------------------------------------- HUD pins
  private screen(x: number, z: number) {
    return this.g.stage.toScreen(this.v3.set(x, 0, z));
  }

  protected onSync() {
    const { wallet } = this.g;
    for (const sv of this.seats) {
      const nh = sv.hands.length;
      sv.hands.forEach((hv, j) => {
        const b = onTable(sv.geo, handLx(nh, j), LY.bubble);
        const p = this.screen(b.x, b.z);
        hv.bubble.place(p.x, p.y);
        hv.bubble.show(hv.cards.some((c) => c));
      });
      const tg = onTable(sv.geo, 0, LY.tag);
      const tp = this.screen(tg.x, tg.z);
      sv.tag.place(tp.x, tp.y);
      sv.tag.show(sv.tagOn);
      const pl = onTable(sv.geo, 0, sv.ai ? LY.plateAi : LY.platePlayer);
      const pp = this.screen(pl.x, pl.z);
      sv.plate.place(pp.x, pp.y);
      sv.plate.show(this.phase !== 'idle');
      const chips = sv.ai ? sv.ai.chips : wallet.balance;
      const bet = sv.ai ? sv.ai.stake : this.spots.total;
      const ct = money(chips);
      if (sv.plateText.chips.textContent !== ct) sv.plateText.chips.textContent = ct;
      const bt = bet > 0 ? t('pb.betOf', { n: money(bet) }) : '';
      if (sv.plateText.bet.textContent !== bt) sv.plateText.bet.textContent = bt;
      glowPlate(sv.plate, sv.color, sv.active);
    }
    if (this.dealerBubble) {
      const any = this.dealer.some((c) => c?.faceUp);
      const p = this.screen(0, this.dealerZ - CARD_H / 2 - 0.27);
      this.dealerBubble.place(p.x, p.y);
      this.dealerBubble.show(any);
    }
    if (this.dealerTag) {
      const p = this.screen(0, this.dealerZ + CARD_H / 2 + 0.2);
      this.dealerTag.place(p.x, p.y);
      this.dealerTag.show(this.dealerTagOn);
    }
  }

  /** A seat's tag over its cards: an action, "Bust!", "Blackjack!" or the result. */
  private say(sv: SeatV, text: string, cls = '') {
    sv.tag.set(text, `handtag ${cls}`.trim());
    sv.tag.pop();
    sv.tagOn = true;
  }

  private sayDealer(text: string, cls = 'dealer') {
    this.dealerTag?.set(text, `handtag ${cls}`);
    this.dealerTag?.pop();
    this.dealerTagOn = true;
  }

  private setBubble(hv: HandV, pop = false) {
    const cards = hv.cards.filter((c): c is Card3D => !!c).map((c) => c.card!);
    if (!cards.length) return;
    const v = handValue(cards);
    let cls = 'bubble up';
    if (v.total > 21) cls += ' bust';
    else if (v.total === 21) cls += ' bj';
    if (hv.active) cls += ' active';
    hv.bubble.set(v.total > 21 ? String(v.total) : totalLabel(cards), cls);
    if (pop) hv.bubble.pop();
  }

  private updateDealerBubble(pop = false) {
    const b = this.dealerBubble;
    if (!b) return;
    const shown = this.dealer.filter((c): c is Card3D => !!c && c.faceUp).map((c) => c.card!);
    if (!shown.length) return;
    const v = handValue(shown);
    const all = shown.length === this.dealerN;
    const cls = v.total > 21 ? 'bubble down bust' : all && v.total === 21 && shown.length === 2 ? 'bubble down bj' : 'bubble down';
    b.set(totalLabel(shown), cls);
    if (pop) b.pop();
  }

  // ---------------------------------------------------------------- the regulars' chips
  private home(sv: SeatV, y = 0.9) {
    const p = onTable(sv.geo, 0, LY.home);
    return new THREE.Vector3(p.x, y, p.z);
  }

  /** The table is open for bets: clear the last round's seats and let the regulars bet. */
  protected toBetting() {
    super.toBetting();
    this.resetSeats();
    this.aiBetting = this.placeAiBets(this.run);
  }

  private resetSeats() {
    for (const sv of this.seats) {
      for (const hv of sv.hands) hv.bubble.remove();
      sv.hands = [];
      sv.tagOn = false;
      sv.active = false;
    }
    this.dealer = [];
    this.dealerN = 0;
    this.dealerTagOn = false;
    this.round = null;
    // the player's chips go back to the middle of the box (splits moved them)
    const me = this.seats[PLAYER_SEAT];
    if (me && this.spots) {
      const at = onTable(me.geo, 0, 0);
      for (const id of PSPOTS) {
        const s = this.spots.get(id);
        s.pos.set(at.x, 0, at.z);
        s.pile.group.position.set(at.x, 0, at.z);
      }
    }
  }

  private async placeAiBets(run: number) {
    await this.aiSweep;
    await this.alive(run);
    const { sfx } = this.g;
    const order = [0, 1, 3, 4].map((p) => this.seats[p]).filter((sv) => sv?.ai && sv.betPile && !sv.betPile.amount);
    const tc = this.betCount();
    const jobs = order.map(async (sv, k) => {
      const ai = sv.ai!;
      await wait(0.15 + k * 0.28 + Math.random() * 0.12);
      await this.alive(run);
      if (isBroke(ai.chips)) await this.replaceRegular(sv, run);
      // the hand's hidden mindset, then the bet it calls for (a regular always plays)
      ai.mind = drawMindset(ai.profile, ai.mem, ai.chips, this.rng);
      const bet = aiBet(ai.mind, ai.chips, ai.mem, tc, this.rng);
      ai.chips -= bet;
      ai.stake = bet;
      sfx.play('handle', { vol: 0.35 });
      await sv.betPile!.dropIn(bet, this.home(sv), 0.06);
    });
    await Promise.all(jobs);
  }

  /** A regular who can't cover the minimum leaves; a newcomer from the circuit takes the seat. */
  private async replaceRegular(sv: SeatV, run: number) {
    const { sfx } = this.g;
    this.say(sv, t('pb.busted'), 'lose');
    sfx.play('shove', { vol: 0.4 });
    await wait(1.1);
    await this.alive(run);
    const next = replacementFor(this.ai.map((a) => a.profile.name), this.rng);
    Object.assign(sv.ai!, seatRegular(next));
    setPlateName(sv, next);
    this.say(sv, t('pb.newcomer'), 'win');
    sfx.coins(4);
    await wait(0.6);
    await this.alive(run);
  }

  // ---------------------------------------------------------------- the count
  /** Starts a fresh count when the shoe was reshuffled since the count last looked. */
  private syncCount() {
    if (this.shoe.remaining > this.shoeLeft) this.count.reset();
    this.shoeLeft = this.shoe.remaining;
  }

  /** The true count the regulars bet on: a fresh shoe's once the cut card is out. */
  private betCount() {
    this.syncCount();
    return this.shoe.needsShuffle ? 0 : this.count.trueCount;
  }

  /** The regulars' stakes and winnings slide back to their places, then join their chips. */
  private async sweepAi(delay: number) {
    await wait(delay);
    const { sfx } = this.g;
    const jobs: Promise<void>[] = [];
    for (const sv of this.seats) {
      const ai = sv.ai;
      if (!ai || !sv.betPile) continue;
      const piles = [sv.betPile, ...sv.extraPiles, ...sv.payouts].filter((p) => p.amount > 0);
      const to = this.home(sv, 0);
      jobs.push(
        Promise.all(piles.map((p) => slideChips(p.group, to, 0.5, 0.08, 'power2.in'))).then(() => {
          ai.chips += ai.owed ?? ai.stake;
          ai.owed = null;
          ai.stake = 0;
          for (const p of [...sv.extraPiles, ...sv.payouts]) p.dispose();
          sv.extraPiles = [];
          sv.payouts = [];
          sv.betPile!.clear();
          const at = onTable(sv.geo, 0, 0);
          sv.betPile!.group.position.set(at.x, 0, at.z);
        }),
      );
    }
    if (jobs.length) sfx.play('handle', { vol: 0.5 });
    await Promise.all(jobs);
  }

  // ---------------------------------------------------------------- hands
  private newHand(pile: ChipPile, spot?: string): HandV {
    return { cards: [], n: 0, pile, spot, bubble: this.g.hud.pin('bubble'), doubled: false, active: false };
  }

  /** Card places of hand j of a seat holding `n` cards. */
  private places(sv: SeatV, j: number, n: number): Place[] {
    const hv = sv.hands[j];
    const lx = handLx(sv.hands.length, j);
    return Array.from({ length: n }, (_, i) => {
      const f = fanPlace(n, i, hv.doubled);
      const p = onTable(sv.geo, lx + f.lx, LY.cards + f.ly);
      const jit = (((i * 37 + sv.pos * 11) % 7) - 3) * 0.006;
      return { pos: new THREE.Vector3(p.x, REST_Y + f.lift, p.z), yaw: sv.geo.yaw + f.yaw + jit };
    });
  }

  private relayoutHand(sv: SeatV, j: number, dur = 0.26) {
    const hv = sv.hands[j];
    const pl = this.places(sv, j, hv.n);
    return Promise.all(hv.cards.map((c, i) => (c ? slideCard(c, pl[i], dur) : Promise.resolve())));
  }

  private dealerPlaces(n: number): Place[] {
    return Array.from({ length: n }, (_, i) => ({ pos: new THREE.Vector3(dealerX(n, i), REST_Y + i * 0.0035, this.dealerZ), yaw: (((i * 37) % 7) - 3) * 0.004 }));
  }

  private async dealSeatCard(e: Extract<PEvent, { t: 'card' }>) {
    const sv = this.seats[posOf(e.seat)];
    const hv = sv.hands[e.hand];
    const i = hv.n++;
    const pl = this.places(sv, e.hand, hv.n);
    hv.cards.forEach((c, k) => c && slideCard(c, pl[k], 0.24));
    hv.cards[i] = await this.cardsT.deal(e.card, pl[i], true);
    this.setBubble(hv, true);
  }

  private async dealDealerCard(e: Extract<PEvent, { t: 'dealer' }>) {
    const i = this.dealerN++;
    const pl = this.dealerPlaces(this.dealerN);
    this.dealer.forEach((c, k) => c && slideCard(c, pl[k], 0.24));
    const c3 = await this.cardsT.deal(e.card, pl[i], e.faceUp);
    this.dealer[i] = c3;
    if (e.faceUp) this.updateDealerBubble(true);
  }

  // ---------------------------------------------------------------- event playback
  private async play(evs: PEvent[], run: number) {
    // every card that shows goes into the regulars' count
    if (this.round) this.count.see(shownCards(evs, this.round.dealer));
    let pending: Promise<unknown>[] = [];
    for (const e of evs) {
      await this.alive(run);
      if (e.t === 'card' || e.t === 'dealer') {
        pending.push(e.t === 'card' ? this.dealSeatCard(e) : this.dealDealerCard(e));
        await wait(e.t === 'dealer' && this.drawing ? 0.62 : 0.24);
        continue;
      }
      await Promise.all(pending);
      pending = [];
      await this.apply(e);
    }
    await Promise.all(pending);
    await this.alive(run);
  }

  private async apply(e: PEvent) {
    const { sfx, hud } = this.g;
    switch (e.t) {
      case 'peek': {
        const hole = this.dealer[1];
        if (hole) await peekCard(hole);
        if (!e.dealerBJ) hud.toast(t('bj.noBJ'), 1100);
        break;
      }
      case 'flipHole': {
        const hole = this.dealer[1];
        if (hole) await this.cardsT.flip(hole, 0.5);
        this.updateDealerBubble(true);
        if (this.round?.dealerBJ) {
          this.sayDealer(t('pb.bj'), 'win');
          sfx.play('chips', { vol: 0.5 });
        }
        await wait(0.25);
        break;
      }
      case 'dealerDone': {
        this.updateDealerBubble();
        if (e.bust) {
          this.sayDealer(t('pb.bust'), 'lose');
          sfx.play('shove', { vol: 0.6 });
          await shake(this.dealer.filter((c): c is Card3D => !!c).map((c) => c.obj), 0.04);
        }
        break;
      }
      case 'split':
        await this.split(e);
        break;
      case 'double':
        await this.double(e);
        break;
      case 'active': {
        const sv = this.seats[posOf(e.seat)];
        sv.hands.forEach((hv, j) => {
          hv.active = sv.hands.length > 1 && j === e.hand;
          this.setBubble(hv);
        });
        break;
      }
      case 'handDone': {
        const sv = this.seats[posOf(e.seat)];
        const hv = sv.hands[e.hand];
        hv.active = false;
        this.setBubble(hv);
        if (e.reason === 'bust') {
          this.say(sv, t('pb.bust'), 'lose');
          sfx.play('shove', { vol: 0.6 });
          await shake(hv.cards.filter((c): c is Card3D => !!c).map((c) => c.obj));
          hv.bubble.pop();
        }
        break;
      }
      default:
        break;
    }
  }

  private async double(e: Extract<PEvent, { t: 'double' }>) {
    const sv = this.seats[posOf(e.seat)];
    const hv = sv.hands[e.hand];
    hv.doubled = true;
    if (hv.spot) {
      await this.place(hv.spot, e.added);
      return;
    }
    const ai = sv.ai!;
    ai.chips -= e.added;
    ai.stake += e.added;
    this.g.sfx.play('handle', { vol: 0.5 });
    await hv.pile.dropIn(e.added, this.home(sv), 0.06);
    await wait(0.12);
  }

  private async split(e: Extract<PEvent, { t: 'split' }>) {
    const { sfx, stage, chips } = this.g;
    const sv = this.seats[posOf(e.seat)];
    const from = sv.hands[e.from];
    const moved = from.cards.pop();
    from.n--;
    let pile: ChipPile;
    let spot: string | undefined;
    if (sv.ai) {
      pile = new ChipPile(chips, stage.table, from.pile.group.position.clone());
      sv.extraPiles.push(pile);
    } else {
      spot = PSPOTS.find((id) => !sv.hands.some((h) => h.spot === id))!;
      pile = this.spots.get(spot).pile;
    }
    const nh = this.newHand(pile, spot);
    nh.cards.push(moved);
    nh.n = 1;
    sv.hands.splice(e.to, 0, nh);
    sfx.play('shove', { vol: 0.7 });
    const n = sv.hands.length;
    const jobs: Promise<unknown>[] = [];
    sv.hands.forEach((hv, j) => {
      const at = onTable(sv.geo, handLx(n, j), 0);
      const to = new THREE.Vector3(at.x, 0, at.z);
      if (hv.spot) this.spots.get(hv.spot).pos.copy(to);
      if (hv === nh) hv.pile.group.position.copy(to);
      else jobs.push(slideChips(hv.pile.group, to, 0.38, 0.05));
      jobs.push(this.relayoutHand(sv, j, 0.38));
    });
    await Promise.all(jobs);
    if (spot) await this.place(spot, e.bet);
    else {
      const ai = sv.ai!;
      ai.chips -= e.bet;
      ai.stake += e.bet;
      await nh.pile.dropIn(e.bet, this.home(sv), 0.06);
    }
    sv.hands.forEach((hv) => this.setBubble(hv));
  }

  // ---------------------------------------------------------------- the round
  protected advice() {
    const r = this.round;
    if (!r || !this.myTurn) return null;
    const s = seatOf(PLAYER_SEAT);
    if (!r.live(s)) return null;
    const a = r.actions(s, this.g.wallet.balance);
    const m = basicStrategy(r.hands(s)[r.activeHand(s)].cards, r.dealerUp, a.double, a.split);
    return { id: m, msg: t('bj.strategy', { move: t(`btn.${m}`).toUpperCase() }) };
  }

  protected async playRound() {
    const run = this.run;
    await this.aiBetting;
    await this.alive(run);
    this.syncCount();
    // the seats in play order (first base first) with this round's bets
    const seatsIn = Array.from({ length: N }, (_, s) => {
      const ai = this.seats[posOf(s)].ai;
      return ai ? { bet: ai.stake, mind: ai.mind, streak: ai.mem.streak } : { bet: this.spots.get('bet').amount, mind: null };
    });
    const r = new PartyRound(this.shoe, seatsIn);
    this.round = r;
    for (const sv of this.seats) {
      sv.tagOn = false;
      sv.hands = [sv.ai ? this.newHand(sv.betPile!) : this.newHand(this.spots.get('bet').pile, 'bet')];
    }
    await this.play(r.deal(), run);

    if (!r.dealerBJ) {
      for (let s = 0; s < N; s++) {
        const sv = this.seats[posOf(s)];
        if (r.natural(s)) await this.natural(sv);
        else if (sv.ai) await this.aiTurn(s, run);
        else await this.playerTurn(s, run);
      }
      await wait(0.3);
      await this.alive(run);
      this.drawing = true;
      await this.play(r.playDealer(), run);
      this.drawing = false;
    }
    await wait(0.35);
    await this.alive(run);
    await this.showdown(r.settle(), run);
  }

  private async natural(sv: SeatV) {
    const { fx, sfx } = this.g;
    sv.active = true;
    this.setBubble(sv.hands[0], true);
    this.say(sv, t('pb.bj'), 'win');
    const c = onTable(sv.geo, 0, LY.cards);
    fx.burst(new THREE.Vector3(c.x, 0.3, c.z), sv.ai ? 60 : 110);
    sfx.coins(sv.ai ? 5 : 9);
    await wait(0.75);
    sv.active = false;
  }

  private async aiTurn(s: number, run: number) {
    const { sfx } = this.g;
    const r = this.round!;
    const sv = this.seats[posOf(s)];
    const ai = sv.ai!;
    const mind = ai.mind ?? 'calculated';
    sv.active = true;
    while (r.live(s)) {
      const k = r.activeHand(s);
      const h = r.hands(s)[k];
      const can = r.actions(s, ai.chips);
      const tc = this.count.trueCount;
      this.say(sv, t('pb.think'), 'dealer');
      await wait(thinkTime(mind, closeSpot(h.cards, r.dealerUp, can, tc) !== null, this.rng));
      await this.alive(run);
      const m = aiMove(mind, h.cards, r.dealerUp, can, { tc, streak: ai.mem.streak }, this.rng);
      this.say(sv, t(`btn.${m}`), m === 'double' || m === 'split' ? 'win' : '');
      if (m === 'hit') sfx.tick(0.16, 1.5);
      else if (m === 'stand') sfx.play('slide', { vol: 0.3, rate: 1.3 });
      await wait(0.25);
      await this.play(r.act(s, m), run);
    }
    await wait(0.35);
    sv.active = false;
  }

  private async playerTurn(s: number, run: number) {
    const { wallet } = this.g;
    const r = this.round!;
    const sv = this.seats[posOf(s)];
    sv.active = true;
    this.myTurn = true;
    while (r.live(s)) {
      const a = r.actions(s, wallet.balance);
      const pick = (await this.choose([
        { id: 'stand', label: t('btn.stand'), color: 'red', icon: 'stand' },
        ...(a.split ? [{ id: 'split', label: t('btn.split'), color: 'gold' as const, icon: 'split' as const }] : []),
        { id: 'double', label: t('btn.double'), color: 'blue', icon: 'double', enabled: a.double },
        { id: 'hit', label: t('btn.hit'), color: 'green', icon: 'hit', enabled: a.hit },
      ])) as Move;
      await this.alive(run);
      await this.play(r.act(s, pick), run);
    }
    this.myTurn = false;
    sv.active = false;
  }

  /** Every seat against the dealer, from third base (your left) to first base. */
  private async showdown(res: SeatResult[], run: number) {
    // each regular remembers how the hand went (their next mindset leans on it)
    for (const sr of res) {
      const ai = this.seats[posOf(sr.seat)].ai;
      if (ai?.mind) remember(ai.mem, ai.mind, sr.ret - sr.wager);
    }
    const jobs = res.map((sr, s) => {
      const sv = this.seats[posOf(s)];
      const delay = sv.pos * 0.22;
      return sv.ai ? this.settleAi(sv, sr, delay) : this.settlePlayer(sv, sr, delay);
    });
    await Promise.all(jobs);
    await this.alive(run);
    this.aiSweep = this.sweepAi(0.9);
  }

  private markResult(sv: SeatV, sr: SeatResult) {
    const { fx } = this.g;
    const net = sr.ret - sr.wager;
    this.say(sv, t(net > 0 ? 'pb.win' : net < 0 ? 'pb.lose' : 'pb.push'), net > 0 ? 'win' : net < 0 ? 'lose' : '');
    sr.hands.forEach((h, j) => {
      const hv = sv.hands[j];
      const text = hv.bubble.el.textContent ?? '';
      if (h.outcome === 'win' || h.outcome === 'blackjack') {
        hv.bubble.set(text, h.outcome === 'blackjack' ? 'bubble up bj win' : 'bubble up win');
        const c = onTable(sv.geo, handLx(sv.hands.length, j), LY.cards);
        fx.glow(new THREE.Vector3(c.x, 0, c.z), 1.2, 1.3);
      } else if (h.outcome === 'push') hv.bubble.set(text, 'bubble up');
      else hv.bubble.set(text, h.outcome === 'bust' ? 'bubble up bust lose' : 'bubble up lose');
    });
  }

  private async settlePlayer(sv: SeatV, sr: SeatResult, delay: number) {
    await wait(delay);
    this.markResult(sv, sr);
    const ret: Record<string, number> = {};
    sr.hands.forEach((h, j) => {
      const id = sv.hands[j].spot;
      if (id) ret[id] = h.ret;
    });
    const natural = sr.hands.length === 1 && sr.hands[0].outcome === 'blackjack';
    await this.settle(ret, { big: natural ? 'BLACKJACK!' : undefined });
  }

  /** The dealer pays a regular's winners from the rack and takes the losers. */
  private async settleAi(sv: SeatV, sr: SeatResult, delay: number) {
    const { stage, chips, sfx } = this.g;
    await wait(delay);
    this.markResult(sv, sr);
    const ai = sv.ai!;
    const top = stage.screenToTable(0.5, -0.08);
    const jobs: Promise<void>[] = [];
    sr.hands.forEach((h, j) => {
      const hv = sv.hands[j];
      if (h.ret > h.bet) {
        const at = onTable(sv.geo, handLx(sv.hands.length, j) + 0.44, 0);
        const p = new ChipPile(chips, stage.table, new THREE.Vector3(at.x * 0.6, 0, top.z));
        p.set(h.ret - h.bet);
        sv.payouts.push(p);
        jobs.push(slideChips(p.group, new THREE.Vector3(at.x, 0, at.z), 0.55, 0.15, 'power3.out').then(() => sfx.play('stack', { vol: 0.5 })));
      } else if (h.ret < h.bet && hv.pile.amount) {
        const home = hv.pile.group.position.clone();
        sfx.play('handle', { vol: 0.4 });
        jobs.push(
          slideChips(hv.pile.group, new THREE.Vector3(hv.pile.group.position.x * 0.3, 0, top.z), 0.6, 0.12, 'power2.in').then(() => {
            hv.pile.clear();
            hv.pile.group.position.copy(home);
          }),
        );
      }
    });
    ai.owed = sr.ret;
    await Promise.all(jobs);
  }
}
