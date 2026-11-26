import * as THREE from 'three';
import { bestOf, Cat5 } from '../../core/eval5';
import { addStrings, t } from '../../core/i18n';
import { cryptoRng } from '../../core/rng';
import { money } from '../../core/wallet';
import { slideCard, slideChips, wait, type Place } from '../../table/anim';
import { CARD_W, REST_Y, type Card3D } from '../../table/cardMesh';
import { CHIP_R, ChipPile } from '../../table/chips';
import { RING_SCALE } from '../../table/table';
import type { BtnSpec, Pin } from '../../ui/hud';
import { hand5Name } from '../caribbean/view';
import { highlightCards, type SpotDef } from '../kit';
import { drawMindset, newMemory, remember, thinkTime } from '../partybj/mindset';
import { boxWidth, glowPlate, PARTY_COLORS as COLORS, partyPlate, partyPrint, seatBox, setPlateName, type Plate } from '../partybj/partyKit';
import { drawRegulars, replacementFor } from '../partybj/roster';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { BET_IDS, BOX, boardX, boxOf, boxRings, dealerX, holePlace, MID, N_SEATS as N, onTable, payoutAt, PLAYER_SEAT, ringAt, seatGeos, tagLy, type BetId, type BoxSpec, type SeatGeo } from './layout';
import { aiDecision, aiStakes, bookMove, canStay, closeSpot, fitLegal, MULT, PartyUthRound, PU, streetMoves, type AiMemory, type AiProfile, type DealEvent, type Mindset, type Move, type SeatResult, type Street } from './rules';

addStrings(
  {
    'pu.print1': "PARTY HOLD'EM",
    'pu.print2': 'BLIND PAYS UP TO 500 TO 1',
    'pu.print3': 'DEALER QUALIFIES WITH A PAIR',
    'pu.tagline': 'Five seats · Raise up to 4×',
    'pu.ante': 'ANTE',
    'pu.blind': 'BLIND',
    'pu.trips': 'TRIPS',
    'pu.play': 'PLAY',
    'pu.needAnte': 'Bet the ANTE (the BLIND matches it)',
    'pu.noOpen': "doesn't open",
    'pu.busted': 'Busted!',
    'pu.newcomer': 'New player',
    'pu.hintBet': 'Strategy: BET',
    'pu.hintCheck': 'Strategy: CHECK',
    'pu.hintFold': 'Strategy: FOLD',
    'pu.rules': `
      <p>Ultimate Texas Hold'em at a busy table: you and four regulars each play your own two cards against the same dealer hand and the same five-card board. Bet the <b>Ante</b> (the <b>Blind</b> matches it automatically) and, if you like, <b>Trips</b>.</p>
      <h4>The deal</h4>
      <p>One deck, shuffled every hand. Two cards to each seat, starting from the dealer's left (first base, on your right), and two to the dealer; then the five board cards go face down in the middle. The flop is turned after the first betting round, the turn and the river after the second.</p>
      <h4>One raise per hand</h4>
      <p>The seats act in turn from first base. Before the flop: check, or bet <b>3×</b> or <b>4×</b> the Ante on Play. On the flop, those who checked may bet <b>2×</b>. On the river, those who still checked bet <b>1×</b> or fold. Once a seat has bet, it just watches.</p>
      <h4>Showdown</h4>
      <p>Best five cards out of your two and the five on the board. The dealer needs a <b>pair</b> to open: if not, the Ante pushes. A winning hand pays Play 1:1, Ante 1:1 and the Blind by the table (Royal 500 · Straight flush 50 · Quads 10 · Full house 3 · Flush 3:2 · Straight 1; smaller hands push the Blind). A tie pushes; a losing or folded hand loses Ante, Blind and Play.</p>
      <h4>Trips</h4>
      <p>Pays on your final hand alone, whatever the dealer has: Royal 50 · Straight flush 40 · Quads 30 · Full house 8 · Flush 7 · Straight 4 · Trips 3.</p>
      <h4>The regulars</h4>
      <p>Regulars from the Villa Lago circuit sit in with you, a different crowd at every visit. Each one has a temperament of their own, but changes their approach from hand to hand: sometimes aggressive, sometimes careful, sometimes calculating. They come and go: a regular who goes broke leaves the table and a new face takes the seat. Their cards stay face down until the showdown. They ante 10–100 of their own chips; only your bets touch your bankroll.</p>
      <h4>Hint</h4>
      <p>The light bulb shows the hint strategy: 4× with good starting cards, 2× on a strong flop, and on the river a bet with a hidden pair or better (or a hand few cards can beat).</p>`,
  },
  {
    'pu.print2': 'BLIND PAGA ATÉ 500 PARA 1',
    'pu.print3': 'DEALER SE QUALIFICA COM UM PAR',
    'pu.tagline': 'Cinco lugares · Aumente até 4×',
    'pu.needAnte': 'Aposte no ANTE (o BLIND acompanha)',
    'pu.noOpen': 'não abre',
    'pu.busted': 'Quebrou!',
    'pu.newcomer': 'Chegou',
    'pu.hintBet': 'Estratégia: APOSTAR',
    'pu.hintCheck': 'Estratégia: PASSAR',
    'pu.hintFold': 'Estratégia: DESISTIR',
    'pu.rules': `
      <p>Ultimate Texas Hold'em numa mesa cheia: você e quatro frequentadores jogam cada um as suas duas cartas contra a mesma mão do dealer e as mesmas cinco cartas da mesa. Aposte no <b>Ante</b> (o <b>Blind</b> acompanha automaticamente) e, se quiser, no <b>Trips</b>.</p>
      <h4>A distribuição</h4>
      <p>Um baralho, embaralhado a cada mão. Duas cartas para cada lugar, a partir da esquerda do dealer (a primeira base, à sua direita), e duas para o dealer; depois as cinco cartas da mesa ficam fechadas no meio. O flop é virado depois da primeira rodada de apostas; o turn e o river, depois da segunda.</p>
      <h4>Uma aposta por mão</h4>
      <p>Os lugares jogam na vez, a partir da primeira base. Antes do flop: passe ou aposte <b>3×</b> ou <b>4×</b> o Ante no Play. No flop, quem passou pode apostar <b>2×</b>. No river, quem ainda passou aposta <b>1×</b> ou desiste. Depois de apostar, o lugar só assiste.</p>
      <h4>Showdown</h4>
      <p>Melhores cinco cartas entre as suas duas e as cinco da mesa. O dealer precisa de um <b>par</b> para abrir: se não abrir, o Ante empata. Mão vencedora paga Play 1:1, Ante 1:1 e o Blind pela tabela (Royal 500 · Straight flush 50 · Quadra 10 · Full house 3 · Flush 3:2 · Sequência 1; mãos menores empatam o Blind). Empate devolve as apostas; mão perdedora ou desistida perde Ante, Blind e Play.</p>
      <h4>Trips</h4>
      <p>Paga só pela sua mão final, seja qual for a do dealer: Royal 50 · Straight flush 40 · Quadra 30 · Full house 8 · Flush 7 · Sequência 4 · Trinca 3.</p>
      <h4>Os frequentadores</h4>
      <p>Frequentadores do circuito Villa Lago sentam com você, uma turma diferente a cada visita. Cada um tem o seu temperamento, mas muda a forma de jogar de mão em mão: às vezes agressivo, às vezes cuidadoso, às vezes calculista. Eles vêm e vão: quem quebra sai da mesa e um rosto novo ocupa o lugar. As cartas deles ficam fechadas até o showdown. Eles apostam de 10 a 100 no Ante com as próprias fichas; só as suas apostas mexem no seu saldo.</p>
      <h4>Dica</h4>
      <p>A lâmpada mostra a estratégia da dica: 4× com boas cartas iniciais, 2× num flop forte e, no river, aposta com um par escondido ou melhor (ou uma mão que poucas cartas vencem).</p>`,
  },
);

/** Vertical anchor of the player's ANTE row in the portrait layout frame; the rest is laid out from it in table units. */
const V_SEAT = 0.72;
/** Seat index of the rules (play order, 0 = first base on the player's right) ↔ position on screen. */
const posOf = (seat: number) => N - 1 - seat;
const seatOf = (pos: number) => N - 1 - pos;

interface AiState {
  profile: AiProfile;
  /** Chips in front of the player. */
  chips: number;
  /** What the regular remembers between hands (streaks), and this hand's hidden mindset. */
  mem: AiMemory;
  mind: Mindset | null;
  /** This hand's Ante (= Blind) and Trips. */
  ante: number;
  trips: number;
  /** Everything of this hand on the felt: Ante, Blind, Trips and Play. */
  stake: number;
  /** What the dealer settled (stake + winnings) while it is still on the felt; null before the showdown. */
  owed: number | null;
}

interface SeatV {
  pos: number;
  geo: SeatGeo;
  box: BoxSpec;
  color: string;
  ai: AiState | null;
  /** A regular's chips on its four circles (the player's are the betting spots' piles). */
  piles: Partial<Record<BetId, ChipPile>>;
  payouts: ChipPile[];
  cards: (Card3D | undefined)[];
  mucked: boolean;
  plate: Pin;
  plateText: Plate['plateText'];
  tag: Pin;
  tagOn: boolean;
  active: boolean;
}

/** The action buttons, in the single table's colours and wording. */
const BTN: Record<Move, Omit<BtnSpec, 'onClick'>> = {
  check: { id: 'check', color: 'blue', icon: 'knock' },
  fold: { id: 'fold', color: 'red', icon: 'fold' },
  bet1: { id: 'bet1', color: 'green', text: '1×' },
  bet2: { id: 'bet2', color: 'green', text: '2×' },
  bet3: { id: 'bet3', color: 'gold', text: '3×' },
  bet4: { id: 'bet4', color: 'green', text: '4×' },
};

export class PartyUthView extends TableGame {
  readonly id = 'partyuth';
  readonly title = "Party Ultimate Texas Hold'em";
  // deep teal felt (falls back to a stock teal until the 'partyuth' felt exists)
  protected readonly felt = 'partyuth' as const;
  private ai: AiState[] = [];
  private seats: SeatV[] = [];
  private round: PartyUthRound | null = null;
  private dealer: (Card3D | undefined)[] = [];
  private board: (Card3D | undefined)[] = [];
  /** Table z of the player's ANTE row: the middle of the table is laid out from it. */
  private baseZ = 0;
  private dealerTag: Pin | null = null;
  private dealerTagOn = false;
  /** Glow under the player's betting circle that takes the chips. */
  private glowRing: THREE.Mesh | null = null;
  private myTurn = false;
  /** Bumped on exit: a round still running from before goes quiet. */
  private run = 0;
  private aiBetting: Promise<void> = Promise.resolve();
  private aiSweep: Promise<void> = Promise.resolve();
  private v3 = new THREE.Vector3();
  private rng = cryptoRng;

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('pu.rules');
  }

  /** Every visit, four regulars from the Villa Lago circuit sit in. */
  async enter() {
    this.ai = drawRegulars(4, this.rng).map((p) => this.newcomer(p));
    await super.enter();
  }

  private newcomer(profile: AiProfile): AiState {
    return { profile, chips: profile.bank, mem: newMemory(), mind: null, ante: 0, trips: 0, stake: 0, owed: null };
  }

  // ---------------------------------------------------------------- table
  protected spotDefs(): SpotDef[] {
    // the circles are printed in the player's seat box; decorate() moves the spots onto them
    const at = { u: 0.5, v: V_SEAT, size: (BOX.player.ringR * 2) / RING_SCALE, ring: false };
    return [
      { id: 'ante', label: t('pu.ante'), ...at, max: PU.maxBet },
      { id: 'trips', label: t('pu.trips'), ...at, max: PU.maxBet },
      { id: 'blind', label: t('pu.blind'), ...at, mirror: 'ante' },
      { id: 'play', label: t('pu.play'), ...at, auto: true },
    ];
  }

  protected defaultBets() {
    return { ante: 25, blind: 25 };
  }

  protected validate() {
    return (this.spots.amounts().ante ?? 0) < PU.minBet ? t('pu.needAnte') : '';
  }

  protected decorate() {
    const { stage, table, hud, chips } = this.g;
    this.disposeSeats();
    const Z = stage.screenToTable(0.5, V_SEAT).z;
    this.baseZ = Z;
    table.addDecalAt(partyPrint(t('pu.print1'), t('pu.print2'), t('pu.print3')), 0, Z + MID.print, MID.printW);
    const labels: Record<BetId, string> = { trips: t('pu.trips'), ante: t('pu.ante'), blind: t('pu.blind'), play: t('pu.play') };
    this.seats = seatGeos(Z, stage.stretch).map((geo, pos) => {
      const box = boxOf(geo.big);
      const mid = onTable(geo, 0, (geo.top + geo.bottom) / 2);
      table.addDecalAt(seatBox(geo, COLORS[pos], boxRings(box, labels)), mid.x, mid.z, boxWidth(geo)).rotation.y = geo.yaw;
      const ai = pos === PLAYER_SEAT ? null : this.ai[pos < PLAYER_SEAT ? pos : pos - 1];
      const piles: Partial<Record<BetId, ChipPile>> = {};
      if (ai) for (const id of BET_IDS) piles[id] = new ChipPile(chips, stage.table, this.at(geo, ringAt(box, id)));
      const sv: SeatV = {
        pos,
        geo,
        box,
        color: COLORS[pos],
        ai,
        piles,
        payouts: [],
        cards: [],
        mucked: false,
        ...partyPlate(hud, COLORS[pos], ai ? ai.profile : null),
        tag: hud.pin('handtag'),
        tagOn: false,
        active: false,
      };
      return sv;
    });
    this.dealerTag = hud.pin('handtag dealer');
    const r = BOX.player.ringR;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.025, r + 0.035, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.renderOrder = 1;
    ring.visible = false;
    stage.table.add(ring);
    this.glowRing = ring;
    this.placeSpots();
  }

  /** A point of a seat's frame on the table, as a vector. */
  private at(geo: SeatGeo, p: { lx: number; ly: number }, y = 0) {
    const q = onTable(geo, p.lx, p.ly);
    return new THREE.Vector3(q.x, y, q.z);
  }

  /**
   * Puts the player's betting spots on the circles of the player's box. While settling, `pos` is
   * aimed so that BetSpots.payout (which lands a win 0.46 beside `pos`) puts each payout beside its
   * circle, on the outer side of the column; the amounts stay under the chips (see onSync).
   */
  private placeSpots(forPayout = false) {
    const me = this.seats[PLAYER_SEAT];
    if (!me || !this.spots) return;
    for (const id of BET_IDS) {
      const s = this.spots.get(id);
      const p = this.at(me.geo, ringAt(me.box, id));
      s.pile.group.position.copy(p);
      if (!forPayout) {
        s.pos.copy(p);
        continue;
      }
      const q = this.at(me.geo, payoutAt(me.box, id));
      s.pos.set(q.x - 0.46 <= 0.9 ? q.x - 0.46 : q.x + 0.46, 0, q.z);
    }
  }

  private disposeSeats() {
    for (const sv of this.seats) {
      for (const p of [...Object.values(sv.piles), ...sv.payouts]) p?.dispose();
      sv.plate.remove();
      sv.tag.remove();
    }
    this.seats = [];
    this.dealerTag?.remove();
    this.dealerTag = null;
    if (this.glowRing) {
      this.glowRing.removeFromParent();
      this.glowRing.geometry.dispose();
      (this.glowRing.material as THREE.Material).dispose();
      this.glowRing = null;
    }
  }

  protected cleanup() {
    this.run++;
    this.myTurn = false;
    this.round = null;
    this.dealer = [];
    this.board = [];
    // the regulars take back what is theirs on the felt: the settled return, or an unplayed stake
    for (const a of this.ai) {
      a.chips += a.owed ?? a.stake;
      a.stake = 0;
      a.owed = null;
      a.ante = 0;
      a.trips = 0;
      a.mind = null;
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
      const tg = onTable(sv.geo, 0, tagLy(sv.geo));
      const tp = this.screen(tg.x, tg.z);
      sv.tag.place(tp.x, tp.y);
      sv.tag.show(sv.tagOn);
      const pl = onTable(sv.geo, 0, sv.box.plateLy);
      const pp = this.screen(pl.x, pl.z);
      sv.plate.place(pp.x, pp.y);
      sv.plate.show(this.phase !== 'idle');
      const ct = money(sv.ai ? sv.ai.chips : wallet.balance);
      if (sv.plateText.chips.textContent !== ct) sv.plateText.chips.textContent = ct;
      const bet = sv.ai ? sv.ai.stake : this.spots.total;
      const bt = bet > 0 ? t('pb.betOf', { n: money(bet) }) : '';
      if (sv.plateText.bet.textContent !== bt) sv.plateText.bet.textContent = bt;
      glowPlate(sv.plate, sv.color, sv.active);
    }
    if (this.spots) {
      // the player's amounts under their own chips (BetSpots puts them under `pos`, which settling aims elsewhere)
      for (const s of this.spots.spots.values()) {
        if (s.amount <= 0) continue;
        const p = s.pile.group.position;
        const lp = this.screen(p.x, p.z + CHIP_R + 0.12);
        s.label.place(lp.x, lp.y);
      }
    }
    if (this.dealerTag) {
      // beside the dealer's cards, on the right (the board is right under them)
      const p = this.screen(dealerX(1) + CARD_W / 2 + 0.12, this.baseZ + MID.dealer);
      this.dealerTag.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(0, -50%)`;
      this.dealerTag.show(this.dealerTagOn);
    }
    if (this.glowRing) {
      const on = this.phase === 'betting' && !!this.spots && this.spots.spots.size > 0;
      this.glowRing.visible = on;
      if (on) {
        const s = this.spots.get(this.spots.active);
        this.glowRing.position.set(s.pos.x, 0.004, s.pos.z);
        (this.glowRing.material as THREE.MeshBasicMaterial).opacity = 0.42 + 0.22 * Math.sin(performance.now() / 260);
      }
    }
  }

  /** A seat's tag over its cards: an action, its hand, or "Rebuy". */
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

  // ---------------------------------------------------------------- the regulars' chips
  private home(sv: SeatV, y = 0.9) {
    return this.at(sv.geo, { lx: 0, ly: -1.5 }, y);
  }

  /** The table is open for bets: clear the last round's seats and let the regulars bet. */
  protected toBetting() {
    super.toBetting();
    this.resetSeats();
    this.aiBetting = this.placeAiBets(this.run);
  }

  private resetSeats() {
    for (const sv of this.seats) {
      sv.cards = [];
      sv.mucked = false;
      sv.tagOn = false;
      sv.active = false;
    }
    this.dealer = [];
    this.board = [];
    this.dealerTagOn = false;
    this.round = null;
    this.placeSpots();
  }

  private async placeAiBets(run: number) {
    await this.aiSweep;
    await this.alive(run);
    const { sfx } = this.g;
    const order = [0, 1, 3, 4].map((p) => this.seats[p]).filter((sv) => sv?.ai && !sv.ai.stake);
    const jobs = order.map(async (sv, k) => {
      const ai = sv.ai!;
      await wait(0.15 + k * 0.28 + Math.random() * 0.12);
      await this.alive(run);
      if (!canStay(ai.chips)) await this.bustOut(sv, run);
      // how the regular plays this hand stays hidden: only its bets and decisions show
      const mind = drawMindset(ai.profile, ai.mem, ai.chips, this.rng);
      const bets = aiStakes(mind, ai.chips, ai.mem, this.rng);
      ai.mind = mind;
      ai.ante = bets.ante;
      ai.trips = bets.trips;
      ai.stake = bets.ante * 2 + bets.trips;
      ai.chips -= ai.stake;
      sfx.play('handle', { vol: 0.35 });
      const from = this.home(sv);
      await Promise.all([
        sv.piles.ante!.dropIn(bets.ante, from, 0.06),
        wait(0.14).then(() => sv.piles.blind!.dropIn(bets.ante, from, 0.06)),
        bets.trips ? wait(0.28).then(() => sv.piles.trips!.dropIn(bets.trips, from, 0.06)) : Promise.resolve(),
      ]);
    });
    await Promise.all(jobs);
  }

  /** A regular who can't cover the minimum leaves; a new face from the circuit takes the seat. */
  private async bustOut(sv: SeatV, run: number) {
    const { sfx } = this.g;
    this.say(sv, t('pu.busted'), 'lose');
    sfx.play('shove', { vol: 0.45 });
    await wait(1.1);
    await this.alive(run);
    const fresh = this.newcomer(replacementFor(this.ai.map((a) => a.profile.name), this.rng));
    // the seat keeps its state object (the seat and the table share it)
    Object.assign(sv.ai!, fresh);
    setPlateName(sv, fresh.profile);
    this.say(sv, t('pu.newcomer'), 'win');
    this.g.sfx.coins(5);
    await wait(0.4);
    await this.alive(run);
  }

  /** The regulars' stakes and winnings slide back to their places, then join their chips. */
  private async sweepAi(delay: number, run: number) {
    await wait(delay);
    if (run !== this.run) return;
    const { sfx } = this.g;
    const jobs: Promise<void>[] = [];
    for (const sv of this.seats) {
      const ai = sv.ai;
      if (!ai) continue;
      const piles = [...Object.values(sv.piles), ...sv.payouts].filter((p): p is ChipPile => !!p && p.amount > 0);
      const to = this.home(sv, 0);
      jobs.push(
        Promise.all(piles.map((p) => slideChips(p.group, to, 0.5, 0.08, 'power2.in'))).then(() => {
          ai.chips += ai.owed ?? ai.stake;
          ai.owed = null;
          ai.stake = 0;
          ai.ante = 0;
          ai.trips = 0;
          for (const p of sv.payouts) p.dispose();
          sv.payouts = [];
          for (const id of BET_IDS) {
            const p = sv.piles[id]!;
            p.clear();
            p.group.position.copy(this.at(sv.geo, ringAt(sv.box, id)));
          }
        }),
      );
    }
    if (jobs.length) sfx.play('handle', { vol: 0.5 });
    await Promise.all(jobs);
  }

  // ---------------------------------------------------------------- cards
  /** Hole card i of a seat (or its place in the mucked pile). */
  private holeAt(sv: SeatV, i: number, mucked = false): Place {
    const h = holePlace(sv.box, i, mucked);
    const p = onTable(sv.geo, h.lx, h.ly);
    return { pos: new THREE.Vector3(p.x, REST_Y + h.lift, p.z), yaw: sv.geo.yaw + h.yaw };
  }

  /** A card of the board (dz = MID.board) or of the dealer (MID.dealer). */
  private midAt(x: number, dz: number, i: number): Place {
    return { pos: new THREE.Vector3(x, REST_Y, this.baseZ + dz), yaw: (((i * 37) % 7) - 3) * 0.004 };
  }

  /** The deal: every card face down, one after the other from the shoe. */
  private async dealAll(evs: DealEvent[], run: number) {
    const jobs: Promise<unknown>[] = [];
    for (const e of evs) {
      await this.alive(run);
      if (e.t === 'hole') {
        const sv = this.seats[posOf(e.seat)];
        const i = sv.cards.length;
        sv.cards.push(undefined);
        jobs.push(this.cardsT.deal(e.card, this.holeAt(sv, i), false).then((c) => (sv.cards[i] = c)));
      } else if (e.t === 'dealer') {
        const i = this.dealer.length;
        this.dealer.push(undefined);
        jobs.push(this.cardsT.deal(e.card, this.midAt(dealerX(i), MID.dealer, i), false).then((c) => (this.dealer[i] = c)));
      } else {
        this.board.push(undefined);
        jobs.push(this.cardsT.deal(e.card, this.midAt(boardX(e.i), MID.board, e.i), false).then((c) => (this.board[e.i] = c)));
      }
      await wait(e.t === 'board' ? 0.16 : 0.2);
    }
    await Promise.all(jobs);
    await this.alive(run);
  }

  /** Turns board cards [from, to) over: the flop, then the turn and the river. */
  private async turnBoard(from: number, to: number, run: number) {
    await wait(0.3);
    await this.alive(run);
    for (let i = from; i < to; i++) {
      const c = this.board[i];
      if (c) void this.cardsT.flip(c, 0.5);
      await wait(0.17);
    }
    await wait(0.5);
    await this.alive(run);
  }

  /** A folded hand: the cards go face down into one squared pile. */
  private async muck(sv: SeatV) {
    sv.mucked = true;
    const cards = sv.cards.filter((c): c is Card3D => !!c);
    await Promise.all(cards.map((c) => (c.faceUp ? this.cardsT.flip(c, 0.4) : Promise.resolve())));
    await Promise.all(cards.map((c, i) => slideCard(c, this.holeAt(sv, i, true), 0.36)));
  }

  /** The player's best hand so far, over their cards. */
  private showMyHand() {
    const r = this.round;
    const sv = this.seats[PLAYER_SEAT];
    if (!r || !sv) return;
    const s = r.seats[seatOf(PLAYER_SEAT)];
    if (s.folded || r.shown.length < 3) return;
    this.say(sv, hand5Name(bestOf([...s.hole, ...r.shown])));
  }

  // ---------------------------------------------------------------- the round
  protected advice() {
    const r = this.round;
    if (!r || !this.myTurn) return null;
    const s = seatOf(PLAYER_SEAT);
    if (!r.live(s)) return null;
    const st = r.seats[s];
    const legal = r.legal(s, (k) => this.g.wallet.canAfford(st.ante * k));
    const m = fitLegal(bookMove(r.street as Street, st.hole, r.shown), legal);
    const msg = MULT[m] ? `${t('pu.hintBet')} ${MULT[m]}×` : t(m === 'fold' ? 'pu.hintFold' : 'pu.hintCheck');
    return { id: m, msg };
  }

  protected async playRound() {
    const run = this.run;
    await this.aiBetting;
    await this.alive(run);
    const bets = this.spots.amounts();
    // the seats in play order (first base first) with this hand's bets
    const r = new PartyUthRound(
      this.shoe,
      Array.from({ length: N }, (_, s) => {
        const sv = this.seats[posOf(s)];
        return sv.ai ? { ante: sv.ai.ante, trips: sv.ai.trips, mind: sv.ai.mind } : { ante: bets.ante ?? 0, trips: bets.trips ?? 0, mind: null };
      }),
    );
    this.round = r;
    for (const sv of this.seats) {
      sv.cards = [];
      sv.mucked = false;
      sv.tagOn = false;
    }
    await this.dealAll(r.deal(), run);
    // the player looks at their cards
    for (const c of this.seats[PLAYER_SEAT].cards) {
      if (c) void this.cardsT.flip(c, 0.5);
      await wait(0.12);
    }
    await wait(0.5);
    await this.alive(run);

    for (;;) {
      for (let s = 0; s < N; s++) {
        if (!r.live(s)) continue;
        if (this.seats[posOf(s)].ai) await this.aiTurn(s, run);
        else await this.playerTurn(s, run);
      }
      const next = r.next();
      if (next === 'show') break;
      await this.turnBoard(next === 'flop' ? 0 : 3, next === 'flop' ? 3 : 5, run);
      this.showMyHand();
    }
    await this.showdown(r, run);
  }

  /** A seat's decision on its tag, with the sound of it (bets clink as their chips land). */
  private sayMove(sv: SeatV, m: Move) {
    this.say(sv, t(`btn.${m}`), MULT[m] ? 'win' : m === 'fold' ? 'lose' : '');
    const { sfx } = this.g;
    if (m === 'check') {
      // two knocks on the felt
      sfx.tick(0.24, 0.62);
      void wait(0.11).then(() => sfx.tick(0.2, 0.58));
    } else if (m === 'fold') sfx.play('shove', { vol: 0.55 });
  }

  private async aiTurn(s: number, run: number) {
    const { sfx } = this.g;
    const r = this.round!;
    const sv = this.seats[posOf(s)];
    const ai = sv.ai!;
    const st = r.seats[s];
    sv.active = true;
    const mind = ai.mind ?? 'calculated';
    this.say(sv, t('pb.think'), 'dealer');
    // quick on clear spots, a little longer on the close ones
    await wait(thinkTime(mind, closeSpot(st.hole, r.shown), this.rng));
    await this.alive(run);
    const m = aiDecision(mind, st.hole, r.shown, r.legal(s, (k) => ai.chips >= st.ante * k), ai.mem, this.rng);
    this.sayMove(sv, m);
    const add = r.act(s, m);
    if (add) {
      ai.chips -= add;
      ai.stake += add;
      sfx.play('handle', { vol: 0.45 });
      await sv.piles.play!.dropIn(add, this.home(sv), 0.06);
    } else if (m === 'fold') await this.muck(sv);
    await wait(0.3);
    await this.alive(run);
    sv.active = false;
  }

  private async playerTurn(s: number, run: number) {
    const { wallet } = this.g;
    const r = this.round!;
    const sv = this.seats[PLAYER_SEAT];
    const st = r.seats[s];
    const can = (k: number) => wallet.canAfford(st.ante * k);
    sv.active = true;
    this.myTurn = true;
    const pick = (await this.choose(streetMoves(r.street as Street).map((m) => ({ ...BTN[m], label: t(`btn.${m}`), enabled: MULT[m] === 0 || can(MULT[m]) })))) as Move;
    await this.alive(run);
    this.myTurn = false;
    this.sayMove(sv, pick);
    const add = r.act(s, pick);
    if (add) await this.place('play', add);
    else if (pick === 'fold') await this.muck(sv);
    await wait(0.25);
    await this.alive(run);
    sv.active = false;
  }

  /** The dealer turns over and qualifies; the regulars show; every seat is settled from third base (your left) to first base. */
  private async showdown(r: PartyUthRound, run: number) {
    await wait(0.35);
    await this.alive(run);
    for (const c of this.dealer) if (c) await this.cardsT.flip(c, 0.45);
    const res = r.settle();
    const d = res[0].res;
    this.sayDealer(d.qualifies ? hand5Name(d.dealer) : `${hand5Name(d.dealer)} · ${t('pu.noOpen')}`);
    if (d.qualifies) this.g.sfx.play('chips', { vol: 0.35 });
    await wait(0.5);
    await this.alive(run);
    for (const sv of this.seats) {
      if (!sv.ai || sv.mucked) continue;
      for (const c of sv.cards) if (c) void this.cardsT.flip(c, 0.42);
      await wait(0.2);
    }
    await wait(0.45);
    await this.alive(run);
    const jobs = this.seats.map((sv) => {
      const sr = res[seatOf(sv.pos)];
      const delay = sv.pos * 0.3;
      return sv.ai ? this.settleAi(sv, sr, r, delay, run) : this.settlePlayer(sv, sr, delay, run);
    });
    await Promise.all(jobs);
    await this.alive(run);
    this.aiSweep = this.sweepAi(0.9, run);
  }

  private markResult(sv: SeatV, sr: SeatResult) {
    const net = sr.ret - sr.wager;
    const text = sr.folded && !sr.res.ret.trips ? t('btn.fold') : hand5Name(sr.res.player);
    this.say(sv, text, net > 0 ? 'win' : net < 0 ? 'lose' : '');
    if (net > 0 && !sr.folded) this.g.fx.glow(this.at(sv.geo, { lx: 0, ly: sv.box.cardsLy }), 1.5, 1.2);
  }

  private async settlePlayer(sv: SeatV, sr: SeatResult, delay: number, run: number) {
    await wait(delay);
    await this.alive(run);
    this.markResult(sv, sr);
    const res = sr.res;
    if (!sr.folded && (res.cmp > 0 || res.ret.trips > 0)) {
      const used = new Set(res.player.cards);
      highlightCards(
        this.g,
        [...sv.cards, ...this.board].filter((c): c is Card3D => !!c && used.has(c.card!)),
      );
      this.g.fx.burst(this.at(sv.geo, { lx: 0, ly: sv.box.cardsLy }, 0.3), res.player.cat >= Cat5.Straight ? 150 : 70);
    }
    const big = !sr.folded && res.cmp > 0 && res.player.cat >= Cat5.Straight ? hand5Name(res.player).toUpperCase() : undefined;
    this.placeSpots(true);
    await this.settle({ ante: res.ret.ante, blind: res.ret.blind, play: res.ret.play, trips: res.ret.trips }, { big, folded: sr.folded });
  }

  /** The dealer pays a regular's winning bets from the rack, beside each circle, and takes the losers. */
  private async settleAi(sv: SeatV, sr: SeatResult, r: PartyUthRound, delay: number, run: number) {
    const { stage, chips, sfx } = this.g;
    await wait(delay);
    await this.alive(run);
    this.markResult(sv, sr);
    const ai = sv.ai!;
    const st = r.seats[sr.seat];
    const stake: Record<BetId, number> = { ante: st.ante, blind: st.blind, trips: st.trips, play: st.play };
    const top = stage.screenToTable(0.5, -0.08);
    const jobs: Promise<void>[] = [];
    let lost = false;
    for (const id of BET_IDS) {
      const pile = sv.piles[id]!;
      const ret = sr.res.ret[id];
      if (!stake[id]) continue;
      if (ret > stake[id]) {
        const at = this.at(sv.geo, payoutAt(sv.box, id));
        const p = new ChipPile(chips, stage.table, new THREE.Vector3(at.x * 0.6, 0, top.z));
        p.set(ret - stake[id]);
        sv.payouts.push(p);
        jobs.push(slideChips(p.group, at, 0.55, 0.15, 'power3.out').then(() => sfx.play('stack', { vol: 0.5 })));
      } else if (ret < stake[id] && pile.amount) {
        lost = true;
        const home = pile.group.position.clone();
        jobs.push(
          slideChips(pile.group, new THREE.Vector3(home.x * 0.3, 0, top.z), 0.6, 0.12, 'power2.in').then(() => {
            pile.clear();
            pile.group.position.copy(home);
          }),
        );
      }
    }
    if (lost) sfx.play('handle', { vol: 0.4 });
    ai.owed = sr.ret;
    if (ai.mind) remember(ai.mem, ai.mind, sr.ret - sr.wager);
    await Promise.all(jobs);
  }
}
