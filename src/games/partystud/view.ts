import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { Cat5 } from '../../core/eval5';
import { cryptoRng } from '../../core/rng';
import { money } from '../../core/wallet';
import { shake, slideCard, slideChips, wait, type Place } from '../../table/anim';
import { CARD_H, REST_Y, type Card3D } from '../../table/cardMesh';
import { CHIP_H, ChipPile } from '../../table/chips';
import type { Pin } from '../../ui/hud';
import { hand5Name } from '../caribbean/view';
import { highlightCards, type Spot, type SpotDef } from '../kit';
import { drawMindset, newMemory, remember, thinkTime, type AiMemory, type Mindset } from '../partybj/mindset';
import { boxWidth, glowPlate, PARTY_COLORS as COLORS, partyPlate, partyPrint, seatBox, setPlateName, type Plate } from '../partybj/partyKit';
import { drawRegulars, replacementFor } from '../partybj/roster';
import type { AiProfile } from '../partybj/rules';
import { bookDecision, MULT, type DealCard, type Move, type Street } from '../stud7/rules';
import { adviceText, DOWN_TINT, settleAt, studButtons, studHandName } from '../stud7/view';
import { cardSpot, dealerSpot, LY, onTable, PLAYER_SEAT, RING_R, RINGS, seatLayout, type RingId, type SeatGeo } from './layout';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { aiBets, aiDecision, busted, PartyStudRound, PS, type SeatResult } from './rules';

addStrings(
  {
    'ps.print1': 'PARTY 7-CARD STUD',
    'ps.print2': 'DEALER NEEDS A PAIR TO OPEN',
    'ps.print3': 'RAISE 4× · 2× · 2× · 1×',
    'ps.tagline': 'Five seats · Stud against the dealer',
    'ps.ante': 'ANTE',
    'ps.blind': 'BLIND',
    'ps.raise': 'RAISE',
    'ps.bonus': 'BONUS',
    'ps.needAnte': 'Bet the ANTE (the BLIND matches it)',
    'ps.check': 'Check',
    'ps.raiseN': 'Raise {m}',
    'ps.bet': 'Bet 1×',
    'ps.fold': 'Fold',
    'ps.win': 'Win',
    'ps.lose': 'Lose',
    'ps.push': 'Push',
    'ps.noQualify': 'DEALER DOES NOT OPEN',
    'ps.busted': 'Busted!',
    'ps.newPlayer': 'New player',
    'ps.rules': `
      <p>Seven-Card Stud at a full table: you and four regulars each play your own hand against the same dealer, all from one deck. Every seat posts an <b>Ante</b> and a <b>Blind</b> equal to it, and may add the <b>Stud Bonus</b>.</p>
      <h4>The deal</h4>
      <p>Cards go round one at a time from the dealer's left (first base, on your right), the dealer last: two down and one up on 3rd street, then one up on 4th, 5th and 6th, and the last one down on 7th. Every up card on the table is in view, so the cards showing in other seats are <b>dead</b>: they can't come to you or to the dealer.</p>
      <h4>One raise per hand</h4>
      <p>The seats decide in turn from first base. After 3rd street: check or <b>raise 4×</b> the Ante. After 4th and after 5th street: check or <b>raise 2×</b>. After 7th street: <b>bet 1×</b> or fold. Once a seat raises it just watches. The regulars' down cards stay face down until the showdown; a folded hand is mucked face down.</p>
      <h4>Showdown</h4>
      <p>Each seat's best five of seven against the dealer's best five. The dealer needs a <b>pair</b> to open: if not, the Ante pushes. A winning hand pays the Raise 1:1, the Ante 1:1 and the Blind by the table (Royal 500 · Straight flush 50 · Quads 10 · Full house 3 · Flush 3:2 · Straight 1; smaller hands push the Blind). A tie pushes. If the dealer wins the seat loses the Raise and the Blind, and the Ante when the dealer opens. Folding loses the Ante and the Blind.</p>
      <h4>Stud Bonus</h4>
      <p>Pays on the seat's own seven cards, even after a fold: Royal 50 · Straight flush 40 · Quads 30 · Full house 8 · Flush 7 · Straight 4 · Trips 3.</p>
      <h4>The regulars</h4>
      <p>Regulars from the Villa Lago circuit sit in with you — a different crowd at every visit. Each has a temperament of their own, but they change their approach from hand to hand: some hands they play by the book, others they press, sit tight or follow a hunch, and their luck of the night pushes them one way or the other. A regular who goes broke leaves the table and a new face takes the seat. They bet their own chips; only your bets touch your bankroll.</p>
      <h4>Hint</h4>
      <p>The light bulb works out your chances against everything in view, the dead cards included: a flush or straight draw whose cards are showing elsewhere is worth less. Return with this play ≈ 99% of the Ante (the dead cards are worth about 1.5 points over the single table).</p>`,
  },
  {
    'ps.print2': 'DEALER ABRE COM UM PAR',
    'ps.print3': 'AUMENTE 4× · 2× · 2× · 1×',
    'ps.tagline': 'Cinco lugares · Stud contra o dealer',
    'ps.raise': 'AUMENTO',
    'ps.needAnte': 'Aposte no ANTE (o BLIND acompanha)',
    'ps.check': 'Passa',
    'ps.raiseN': 'Aumenta {m}',
    'ps.bet': 'Aposta 1×',
    'ps.fold': 'Desiste',
    'ps.win': 'Ganhou',
    'ps.lose': 'Perdeu',
    'ps.push': 'Empate',
    'ps.noQualify': 'DEALER NÃO ABRE',
    'ps.busted': 'Quebrou!',
    'ps.newPlayer': 'Chegou',
    'ps.rules': `
      <p>Stud de sete cartas numa mesa cheia: você e quatro frequentadores jogam cada um a sua mão contra o mesmo dealer, todos do mesmo baralho. Cada lugar aposta um <b>Ante</b> e um <b>Blind</b> do mesmo valor e pode somar o <b>Stud Bonus</b>.</p>
      <h4>A distribuição</h4>
      <p>As cartas saem uma a uma a partir da esquerda do dealer (a primeira base, à sua direita), o dealer por último: duas fechadas e uma aberta na 3ª rua, depois uma aberta na 4ª, 5ª e 6ª, e a última fechada na 7ª. Toda carta aberta na mesa está à vista, então as cartas abertas dos outros lugares estão <b>mortas</b>: não podem vir para você nem para o dealer.</p>
      <h4>Um aumento por mão</h4>
      <p>Os lugares decidem na vez, a partir da primeira base. Depois da 3ª rua: passe ou <b>aumente 4×</b> o Ante. Depois da 4ª e da 5ª rua: passe ou <b>aumente 2×</b>. Depois da 7ª rua: <b>aposte 1×</b> ou desista. Quem aumentou só assiste. As cartas fechadas dos frequentadores ficam viradas até o showdown; uma mão que desiste é recolhida virada para baixo.</p>
      <h4>Showdown</h4>
      <p>As melhores cinco de sete de cada lugar contra as melhores cinco do dealer. O dealer precisa de um <b>par</b> para abrir: se não abrir, o Ante empata. Mão vencedora paga o Aumento 1:1, o Ante 1:1 e o Blind pela tabela (Royal 500 · Straight flush 50 · Quadra 10 · Full house 3 · Flush 3:2 · Sequência 1; mãos menores empatam o Blind). Empate devolve tudo. Se o dealer vencer, o lugar perde o Aumento e o Blind, e o Ante quando o dealer abre. Desistir perde o Ante e o Blind.</p>
      <h4>Stud Bonus</h4>
      <p>Paga pelas sete cartas do próprio lugar, mesmo depois de desistir: Royal 50 · Straight flush 40 · Quadra 30 · Full house 8 · Flush 7 · Sequência 4 · Trinca 3.</p>
      <h4>Os frequentadores</h4>
      <p>Frequentadores do circuito Villa Lago sentam com você — uma turma diferente a cada visita. Cada um tem o seu temperamento, mas muda de abordagem de mão para mão: em algumas joga pelo livro, em outras pressiona, se fecha ou segue um palpite, e a sorte da noite empurra cada um para um lado. Quem quebra sai da mesa e um rosto novo ocupa o lugar. Eles apostam as próprias fichas; só as suas apostas mexem no seu saldo.</p>
      <h4>Dica</h4>
      <p>A lâmpada calcula as suas chances contra tudo o que está à vista, inclusive as cartas mortas: um projeto de flush ou de sequência cujas cartas aparecem em outros lugares vale menos. Retorno com esse jogo ≈ 99% do Ante (as cartas mortas valem cerca de 1,5 ponto a mais que na mesa individual).</p>`,
  },
);

/** Vertical anchors in the portrait layout frame. */
const V = { dealer: 0.185, print: 0.36, seat: 0.79 };
const N = 5;
/** Seat index of the rules (play order, 0 = first base on the player's right) ↔ position on screen. */
const posOf = (seat: number) => N - 1 - seat;
const seatOf = (pos: number) => N - 1 - pos;
const RING_IDS: RingId[] = ['bonus', 'ante', 'blind', 'raise'];

interface AiState {
  profile: AiProfile;
  /** Chips in front of the regular. */
  chips: number;
  /** This hand's stakes on the felt. */
  stake: number;
  /** What the dealer settled (stake + winnings) while it is still on the felt; null before. */
  owed: number | null;
  mem: AiMemory;
  /** This hand's hidden mindset. */
  mindset: Mindset;
  ante: number;
  bonus: number;
}

interface SeatV {
  pos: number;
  geo: SeatGeo;
  color: string;
  ai: AiState | null;
  cards: (Card3D | undefined)[];
  /** The regular's chip piles on its circles (the player's are the betting spots). */
  piles: Record<RingId, ChipPile> | null;
  payouts: ChipPile[];
  plate: Plate;
  tag: Pin;
  tagOn: boolean;
  active: boolean;
  folded: boolean;
}

/** Height of a pile's first stack, to land winnings on top of it. */
const pileTop = (p: ChipPile) => Math.min(p.values.length, 14) * CHIP_H + 0.004;

export class PartyStudView extends TableGame {
  readonly id = 'partystud';
  readonly title = 'Party Seven-Card Stud';
  // falls back to a stock purple felt until the 'partystud' felt exists
  protected readonly felt = 'partystud' as const;
  private rng = cryptoRng;
  private ai: AiState[] = [];
  private seats: SeatV[] = [];
  private round: PartyStudRound | null = null;
  private dealer: (Card3D | undefined)[] = [];
  private dealerZ = 0;
  private dealerTag: Pin | null = null;
  private dealerTagOn = false;
  /** The player's decision being asked. */
  private myTurn: Street | null = null;
  /** Bumped on exit: a round still running from before goes quiet. */
  private run = 0;
  private aiBetting: Promise<void> = Promise.resolve();
  private aiSweep: Promise<void> = Promise.resolve();
  private v3 = new THREE.Vector3();

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('ps.rules');
  }

  /** A new crowd of regulars every time the player sits down. */
  async enter() {
    this.ai = drawRegulars(4, this.rng).map((profile) => this.newAi(profile));
    await super.enter();
  }

  private newAi(profile: AiProfile): AiState {
    return { profile, chips: profile.bank, stake: 0, owed: null, mem: newMemory(), mindset: 'calculated', ante: 0, bonus: 0 };
  }

  // ---------------------------------------------------------------- table
  protected spotDefs(): SpotDef[] {
    const at = { u: 0.5, v: V.seat, size: 0.4, ring: false };
    // the Ante first: it is the circle the chips go to by default
    return [
      { id: 'ante', label: t('ps.ante'), ...at, max: PS.maxBet },
      { id: 'blind', label: t('ps.blind'), ...at, mirror: 'ante' },
      { id: 'raise', label: t('ps.raise'), ...at, auto: true },
      { id: 'bonus', label: t('ps.bonus'), ...at, max: PS.maxBet },
    ];
  }

  protected defaultBets() {
    return { ante: 25, blind: 25 };
  }

  protected validate() {
    return (this.spots.amounts().ante ?? 0) < PS.minBet ? t('ps.needAnte') : '';
  }

  protected decorate() {
    const { stage, table } = this.g;
    this.disposeSeats();
    const playerZ = stage.screenToTable(0.5, V.seat).z;
    this.dealerZ = stage.screenToTable(0.5, V.dealer).z;
    const pr = stage.screenToTable(0.5, V.print);
    table.addDecalAt(partyPrint(t('ps.print1'), t('ps.print2'), t('ps.print3')), 0, pr.z, 4.1);
    const geos = seatLayout(playerZ, stage.stretch);
    this.seats = geos.map((geo, pos) => {
      const mid = onTable(geo, 0, (geo.top + geo.bottom) / 2);
      const rings = RING_IDS.map((id) => ({ lx: RINGS[id], ly: 0, r: RING_R, label: t(`ps.${id}`) }));
      table.addDecalAt(seatBox(geo, COLORS[pos], rings), mid.x, mid.z, boxWidth(geo)).rotation.y = geo.yaw;
      const ai = pos === PLAYER_SEAT ? null : this.ai[pos < PLAYER_SEAT ? pos : pos - 1];
      const ringAt = (id: RingId) => {
        const p = onTable(geo, RINGS[id], 0);
        return new THREE.Vector3(p.x, 0, p.z);
      };
      const piles = ai ? (Object.fromEntries(RING_IDS.map((id) => [id, new ChipPile(this.g.chips, stage.table, ringAt(id))])) as Record<RingId, ChipPile>) : null;
      if (!ai)
        for (const id of RING_IDS) {
          const s = this.spots.get(id);
          s.pos.copy(ringAt(id));
          s.pile.group.position.copy(ringAt(id));
        }
      return {
        pos,
        geo,
        color: COLORS[pos],
        ai,
        cards: [],
        piles,
        payouts: [],
        plate: partyPlate(this.g.hud, COLORS[pos], ai ? ai.profile : null),
        tag: this.g.hud.pin('handtag'),
        tagOn: false,
        active: false,
        folded: false,
      };
    });
    this.dealerTag = this.g.hud.pin('handtag dealer');
  }

  private disposeSeats() {
    for (const sv of this.seats) {
      if (sv.piles) for (const p of Object.values(sv.piles)) p.dispose();
      for (const p of sv.payouts) p.dispose();
      sv.plate.plate.remove();
      sv.tag.remove();
    }
    this.seats = [];
    this.dealerTag?.remove();
    this.dealerTag = null;
  }

  protected cleanup() {
    this.run++;
    this.myTurn = null;
    this.round = null;
    this.dealer = [];
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
      const tg = onTable(sv.geo, 0, LY.tag);
      const tp = this.screen(tg.x, tg.z);
      sv.tag.place(tp.x, tp.y);
      sv.tag.show(sv.tagOn);
      const pl = onTable(sv.geo, 0, sv.ai ? LY.plateAi : LY.platePlayer);
      const pp = this.screen(pl.x, pl.z);
      sv.plate.plate.place(pp.x, pp.y);
      sv.plate.plate.show(this.phase !== 'idle');
      const chips = sv.ai ? sv.ai.chips : wallet.balance;
      const bet = sv.ai ? sv.ai.stake : this.spots.total;
      const ct = money(chips);
      const txt = sv.plate.plateText;
      if (txt.chips.textContent !== ct) txt.chips.textContent = ct;
      const bt = bet > 0 ? t('pb.betOf', { n: money(bet) }) : '';
      if (txt.bet.textContent !== bt) txt.bet.textContent = bt;
      glowPlate(sv.plate.plate, sv.color, sv.active);
    }
    if (this.dealerTag) {
      const p = this.screen(0, this.dealerZ + CARD_H / 2 + 0.2);
      this.dealerTag.place(p.x, p.y);
      this.dealerTag.show(this.dealerTagOn);
    }
  }

  /** A seat's tag over its cards: an action, the hand or the result. */
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
    const p = onTable(sv.geo, 0, LY.home);
    return new THREE.Vector3(p.x, y, p.z);
  }

  /** The table is open for bets: clear the last hand's seats and let the regulars bet. */
  protected toBetting() {
    super.toBetting();
    this.resetSeats();
    this.aiBetting = this.placeAiBets(this.run);
  }

  private resetSeats() {
    for (const sv of this.seats) {
      sv.cards = [];
      sv.tagOn = false;
      sv.active = false;
      sv.folded = false;
    }
    this.dealer = [];
    this.dealerTagOn = false;
    this.round = null;
  }

  /** A regular out of chips leaves; a newcomer from the circuit takes the seat. */
  private async replace(sv: SeatV, run: number) {
    const { sfx } = this.g;
    const old = sv.ai!;
    this.say(sv, t('ps.busted'), 'lose');
    sfx.play('shove', { vol: 0.4 });
    await wait(1.1);
    await this.alive(run);
    const seated = this.ai.map((a) => a.profile.name);
    const fresh = this.newAi(replacementFor(seated, this.rng));
    this.ai[this.ai.indexOf(old)] = fresh;
    sv.ai = fresh;
    setPlateName(sv.plate, fresh.profile);
    this.say(sv, t('ps.newPlayer'), 'win');
    sfx.coins(5);
    await wait(0.6);
  }

  private async placeAiBets(run: number) {
    await this.aiSweep;
    await this.alive(run);
    const { sfx } = this.g;
    const order = [0, 1, 3, 4].map((p) => this.seats[p]).filter((sv) => sv?.ai && sv.piles && !sv.ai.stake);
    const jobs = order.map(async (sv, k) => {
      await wait(0.15 + k * 0.28 + Math.random() * 0.12);
      await this.alive(run);
      if (busted(sv.ai!.chips)) await this.replace(sv, run);
      const ai = sv.ai!;
      ai.mindset = drawMindset(ai.profile, ai.mem, ai.chips, this.rng);
      let bets = aiBets(ai.mindset, ai.chips, ai.mem, this.rng);
      if (!bets.ante) {
        await this.replace(sv, run);
        const nu = sv.ai!;
        nu.mindset = drawMindset(nu.profile, nu.mem, nu.chips, this.rng);
        bets = aiBets(nu.mindset, nu.chips, nu.mem, this.rng);
      }
      const a = sv.ai!;
      a.ante = bets.ante;
      a.bonus = bets.bonus;
      a.chips -= 2 * bets.ante + bets.bonus;
      a.stake = 2 * bets.ante + bets.bonus;
      sfx.play('handle', { vol: 0.35 });
      const p = sv.piles!;
      await Promise.all([
        p.ante.dropIn(bets.ante, this.home(sv), 0.06),
        wait(0.08).then(() => p.blind.dropIn(bets.ante, this.home(sv), 0.06)),
        bets.bonus ? wait(0.16).then(() => p.bonus.dropIn(bets.bonus, this.home(sv), 0.06)) : Promise.resolve(),
      ]);
    });
    await Promise.all(jobs);
  }

  /** The regulars' stakes and winnings slide back to their places, then join their chips. */
  private async sweepAi(delay: number) {
    await wait(delay);
    const { sfx } = this.g;
    const jobs: Promise<void>[] = [];
    for (const sv of this.seats) {
      const ai = sv.ai;
      if (!ai || !sv.piles) continue;
      const all = [...Object.values(sv.piles), ...sv.payouts].filter((p) => p.amount > 0);
      const to = this.home(sv, 0);
      jobs.push(
        Promise.all(all.map((p) => slideChips(p.group, to, 0.5, 0.08, 'power2.in'))).then(() => {
          ai.chips += ai.owed ?? ai.stake;
          ai.owed = null;
          ai.stake = 0;
          for (const p of sv.payouts) p.dispose();
          sv.payouts = [];
          for (const id of RING_IDS) {
            const p = sv.piles![id];
            p.clear();
            const at = onTable(sv.geo, RINGS[id], 0);
            p.group.position.set(at.x, 0, at.z);
          }
        }),
      );
    }
    if (jobs.length) sfx.play('handle', { vol: 0.5 });
    await Promise.all(jobs);
  }

  // ---------------------------------------------------------------- cards
  private seatPlace(sv: SeatV, i: number): Place {
    const f = cardSpot(i);
    const p = onTable(sv.geo, f.lx, f.ly);
    const jit = (((i * 37 + sv.pos * 11) % 7) - 3) * 0.005;
    return { pos: new THREE.Vector3(p.x, REST_Y + f.lift, p.z), yaw: sv.geo.yaw + jit };
  }

  private dealerPlace(i: number): Place {
    const d = dealerSpot(i);
    return { pos: new THREE.Vector3(d.x, REST_Y + i * 0.0035, this.dealerZ + d.dz), yaw: (((i * 37) % 7) - 3) * 0.004 };
  }

  /** Deals a street card by card; the player's own down cards are turned up for them and tinted. */
  private async dealCards(evs: DealCard[], run: number, gap: number) {
    const jobs: Promise<unknown>[] = [];
    const peek: number[] = [];
    const me = this.seats[PLAYER_SEAT];
    for (const e of evs) {
      await this.alive(run);
      if (e.seat < 0) {
        jobs.push(this.cardsT.deal(e.card, this.dealerPlace(e.i), e.up, { dur: 0.4 }).then((c) => (this.dealer[e.i] = c)));
      } else {
        const sv = this.seats[posOf(e.seat)];
        jobs.push(this.cardsT.deal(e.card, this.seatPlace(sv, e.i), e.up, { dur: 0.4 }).then((c) => (sv.cards[e.i] = c)));
        if (sv === me && !e.up) peek.push(e.i);
      }
      await wait(gap);
    }
    await Promise.all(jobs);
    for (const i of peek) {
      const c = me.cards[i];
      if (!c) continue;
      (c.front.material as THREE.MeshStandardMaterial).color.set(DOWN_TINT);
      this.cardsT.flip(c, 0.4);
      await wait(0.08);
    }
    if (peek.length) await wait(0.35);
  }

  /** A folded hand is mucked: turned face down and pushed together. */
  private async muck(sv: SeatV) {
    this.g.sfx.play('shove', { vol: 0.55 });
    const c = onTable(sv.geo, 0, LY.down);
    const jobs = sv.cards.map((card, i) => {
      if (!card) return Promise.resolve();
      if (card.faceUp) this.cardsT.flip(card, 0.35);
      const to = { pos: new THREE.Vector3(c.x + (i - 3) * 0.012, REST_Y + i * 0.004, c.z), yaw: sv.geo.yaw + (i - 3) * 0.03 };
      return wait(0.36).then(() => slideCard(card, to, 0.3));
    });
    await Promise.all(jobs);
  }

  // ---------------------------------------------------------------- the round
  protected advice() {
    const r = this.round;
    if (!r || !this.myTurn) return null;
    const s = seatOf(PLAYER_SEAT);
    const d = bookDecision(this.myTurn, r.cards(s), r.dealerUp, r.dead(s));
    return { id: d.move, msg: adviceText(d.move, d.odds) };
  }

  protected async playRound() {
    const run = this.run;
    await this.aiBetting;
    await this.alive(run);
    const bets = this.spots.amounts();
    const seatsIn = Array.from({ length: N }, (_, s) => {
      const sv = this.seats[posOf(s)];
      return sv.ai ? { ante: sv.ai.ante, bonus: sv.ai.bonus, mindset: sv.ai.mindset } : { ante: bets.ante, bonus: bets.bonus ?? 0, mindset: null };
    });
    const r = new PartyStudRound(() => this.shoe.draw(), seatsIn);
    this.round = r;
    const me = this.seats[PLAYER_SEAT];

    while (r.dealt !== 'seventh') {
      const evs = r.next();
      await this.dealCards(evs, run, r.dealt === 'third' ? 0.085 : 0.11);
      this.say(me, studHandName(r.cards(seatOf(PLAYER_SEAT))));
      const st = r.decision;
      if (!st) continue;
      for (let s = 0; s < N; s++) {
        if (!r.live(s)) continue;
        const sv = this.seats[posOf(s)];
        if (sv.ai) await this.aiTurn(s, st, run);
        else await this.playerTurn(s, st, run);
      }
      await wait(0.2);
      await this.alive(run);
    }
    await this.showdown(r, run);
  }

  private moveText(m: Move): string {
    if (m === 'raise4' || m === 'raise2') return t('ps.raiseN', { m: `${MULT[m]}×` });
    return m === 'bet1' ? t('ps.bet') : m === 'fold' ? t('ps.fold') : t('ps.check');
  }

  private async aiTurn(s: number, st: Street, run: number) {
    const { sfx } = this.g;
    const r = this.round!;
    const sv = this.seats[posOf(s)];
    const ai = sv.ai!;
    sv.active = true;
    this.say(sv, t('pb.think'), 'dealer');
    const ch = aiDecision(ai.mindset, r.cards(s), r.dealerUp, r.dead(s), st, ai.mem, this.rng, r.legal(s, ai.chips));
    // a little brisker than the mindset's own pace: four decision rounds per hand
    await wait(thinkTime(ai.mindset, ch.close, this.rng) * 0.8);
    await this.alive(run);
    const add = r.act(s, ch.move);
    this.say(sv, this.moveText(ch.move), add > 0 ? 'win' : ch.move === 'fold' ? 'lose' : '');
    if (add > 0) {
      ai.chips -= add;
      ai.stake += add;
      sfx.play('handle', { vol: 0.5 });
      await sv.piles!.raise.dropIn(add, this.home(sv), 0.06);
    } else if (ch.move === 'fold') {
      sv.folded = true;
      await this.muck(sv);
    } else {
      sfx.tick(0.16, 1.4);
      await wait(0.15);
    }
    sv.active = false;
  }

  private async playerTurn(s: number, st: Street, run: number) {
    const { wallet } = this.g;
    const r = this.round!;
    const sv = this.seats[posOf(s)];
    const ante = r.seats[s].ante;
    sv.active = true;
    this.myTurn = st;
    const pick = (await this.choose(studButtons(st, (k) => wallet.canAfford(ante * k)))) as Move;
    this.myTurn = null;
    await this.alive(run);
    const add = r.act(s, pick);
    if (add > 0) await this.place('raise', add);
    else if (pick === 'fold') {
      sv.folded = true;
      await this.muck(sv);
    }
    sv.active = false;
  }

  /** Down cards turn over, every seat against the dealer from third base (your left) to first base. */
  private async showdown(r: PartyStudRound, run: number) {
    await wait(0.3);
    for (const i of [0, 1, 6]) {
      const c = this.dealer[i];
      if (c) this.cardsT.flip(c, 0.42);
      await wait(0.14);
    }
    await wait(0.3);
    for (let s = 0; s < N; s++) {
      const sv = this.seats[posOf(s)];
      if (!sv.ai || sv.folded) continue;
      for (const i of [0, 1, 6]) {
        const c = sv.cards[i];
        if (c && !c.faceUp) this.cardsT.flip(c, 0.38);
        await wait(0.06);
      }
    }
    await wait(0.45);
    await this.alive(run);
    const res = r.settle();
    const d = res[0].res;
    this.sayDealer(d.qualifies ? hand5Name(d.dealer) : `${t('ps.noQualify')} · ${hand5Name(d.dealer)}`);
    const jobs = res.map((sr, s) => {
      const sv = this.seats[posOf(s)];
      const delay = sv.pos * 0.2;
      return sv.ai ? this.settleAi(sv, sr, delay) : this.settlePlayer(sv, sr, delay);
    });
    if (res.some((sr) => !sr.folded && sr.res.cmp < 0)) {
      const used = new Set(d.dealer.cards);
      highlightCards(this.g, this.dealer.filter((c): c is Card3D => !!c && used.has(c.card!)), '#9fc4ff');
    }
    await Promise.all(jobs);
    await this.alive(run);
    this.aiSweep = this.sweepAi(0.9);
  }

  private markResult(sv: SeatV, sr: SeatResult) {
    const net = sr.ret - sr.wager;
    const name = hand5Name(sr.res.player);
    const cls = sr.folded ? 'lose' : sr.res.cmp > 0 ? 'win' : sr.res.cmp < 0 ? 'lose' : '';
    this.say(sv, sr.folded ? `${t('ps.fold')} · ${name}` : name, net > 0 ? 'win' : cls);
    if (!sr.folded && sr.res.cmp > 0) {
      const used = new Set(sr.res.player.cards);
      const cards = sv.cards.filter((c): c is Card3D => !!c && used.has(c.card!));
      if (sv.ai) for (const c of cards) this.g.fx.glow(new THREE.Vector3(c.obj.position.x, 0, c.obj.position.z), 0.8, 1.05, 1.4, sv.color);
      else highlightCards(this.g, cards);
    }
  }

  private async settlePlayer(sv: SeatV, sr: SeatResult, delay: number) {
    await wait(delay);
    this.markResult(sv, sr);
    const r = sr.res;
    const won = !sr.folded && r.cmp > 0;
    if (won || r.ret.bonus > 0) this.g.fx.burst(new THREE.Vector3(sv.geo.x, 0.3, sv.geo.z - 1.2), r.player.cat >= Cat5.Straight ? 150 : 70);
    const big = (won || r.ret.bonus > 0) && r.player.cat >= Cat5.Straight ? hand5Name(r.player).toUpperCase() : undefined;
    await this.settle({ ante: r.ret.ante, blind: r.ret.blind, raise: r.ret.raise, bonus: r.ret.bonus }, { big, folded: sr.folded });
  }

  /** The player's winnings land on top of each stake: the seat's circles sit close together. */
  protected settle(ret: Record<string, number>, opts: { big?: string; folded?: boolean; credited?: boolean } = {}) {
    return settleAt(this.g, this.spots, ret, opts, (s: Spot) => new THREE.Vector3(0, pileTop(s.pile), 0));
  }

  /** The dealer pays a regular's winners onto their stakes and takes the losers. */
  private async settleAi(sv: SeatV, sr: SeatResult, delay: number) {
    const { stage, chips, sfx } = this.g;
    await wait(delay);
    this.markResult(sv, sr);
    const ai = sv.ai!;
    const top = stage.screenToTable(0.5, -0.08);
    const s = this.round!.seats[sr.seat];
    const stakes: Record<RingId, number> = { ante: s.ante, blind: s.blind, raise: s.raise, bonus: s.bonus };
    const rets: Record<RingId, number> = sr.res.ret;
    const jobs: Promise<void>[] = [];
    for (const id of RING_IDS) {
      const pile = sv.piles![id];
      const stake = stakes[id];
      if (!stake) continue;
      if (rets[id] > stake) {
        const at = pile.group.position;
        const p = new ChipPile(chips, stage.table, new THREE.Vector3(at.x * 0.6, 0, top.z));
        p.set(rets[id] - stake);
        sv.payouts.push(p);
        jobs.push(slideChips(p.group, new THREE.Vector3(at.x, pileTop(pile), at.z), 0.55, 0.15, 'power3.out').then(() => sfx.play('stack', { vol: 0.5 })));
      } else if (rets[id] < stake && pile.amount) {
        const home = pile.group.position.clone();
        sfx.play('handle', { vol: 0.4 });
        jobs.push(
          slideChips(pile.group, new THREE.Vector3(home.x * 0.3, 0, top.z), 0.6, 0.12, 'power2.in').then(() => {
            pile.clear();
            pile.group.position.copy(home);
          }),
        );
      }
    }
    ai.owed = sr.ret;
    remember(ai.mem, ai.mindset, sr.ret - sr.wager);
    if (sr.ret < sr.wager && !sr.folded && sv.cards.length) await shake(sv.cards.filter((c): c is Card3D => !!c).map((c) => c.obj), 0.02);
    await Promise.all(jobs);
  }
}
