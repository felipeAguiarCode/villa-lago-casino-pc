import * as THREE from 'three';
import { Cat3, eval3 } from '../../core/eval3';
import { addStrings, t } from '../../core/i18n';
import { cryptoRng } from '../../core/rng';
import { money } from '../../core/wallet';
import { peekCard, slideCard, slideChips, wait, type Place } from '../../table/anim';
import { CARD_H, REST_Y, type Card3D } from '../../table/cardMesh';
import { ChipPile } from '../../table/chips';
import { FONT, makeCanvas } from '../../table/prints';
import type { Pin } from '../../ui/hud';
import { highlightCards, type SpotDef } from '../kit';
import { drawMindset, newMemory, remember, thinkTime, type AiMemory, type Mindset } from '../partybj/mindset';
import { BOX_PAD, BOX_PPU, boxWidth, glowPlate, PARTY_COLORS as COLORS, partyPlate, partyPrint, seatBox, setPlateName, type Plate } from '../partybj/partyKit';
import { drawRegulars, replacementFor } from '../partybj/roster';
import type { AiProfile } from '../partybj/rules';
import { TableGame } from '../tableGame';
import { ANTE_BONUS, dealerQualifies, PAIR_PLUS, shouldPlay } from '../threecard/rules';
import { hand3Name } from '../threecard/view';
import type { GameCtx } from '../types';
import { cardPlace, dealerX, muckPlace, onTable, PAY_DX, PLAYER_SEAT, RINGS, seatLayout, type RingId, type TcpSeatGeo } from './layout';
import { aiBets, aiPlays, borderline, isBroke, PartyTcpRound, PT, type SeatResult, type TEvent } from './rules';

// pays in the texts come from the Three Card tables, so they always match what is paid
const PP = { sf: PAIR_PLUS[Cat3.StraightFlush], trips: PAIR_PLUS[Cat3.Trips], st: PAIR_PLUS[Cat3.Straight], fl: PAIR_PLUS[Cat3.Flush], pair: PAIR_PLUS[Cat3.Pair] };
const AB = { sf: ANTE_BONUS[Cat3.StraightFlush], trips: ANTE_BONUS[Cat3.Trips], st: ANTE_BONUS[Cat3.Straight] };

addStrings(
  {
    'pt.print1': 'PARTY THREE CARD',
    'pt.print2': `PAIR PLUS PAYS UP TO ${PP.sf} TO 1`,
    'pt.print3': 'DEALER QUALIFIES WITH QUEEN HIGH',
    'pt.tagline': `Five seats · Pair Plus pays ${PP.sf} to 1`,
    'pt.ante': 'ANTE',
    'pt.pairPlus': 'PAIR PLUS',
    'pt.play': 'PLAY',
    'pt.needAnte': 'Place your ANTE',
    'pt.win': 'Win',
    'pt.lose': 'Lose',
    'pt.push': 'Push',
    'pt.folded': 'Folded',
    'pt.noQualify': 'Does not qualify',
    'pt.busted': 'Busted!',
    'pt.newcomer': 'New player',
    'pt.hintPlay': 'Best play: PLAY (Q-6-4 or better)',
    'pt.hintFold': 'Best play: FOLD (less than Q-6-4)',
    'pt.rules': `
      <p>Three Card Poker at a busy table: you and four regulars each play your own three cards against the same dealer hand.</p>
      <h4>Hand ranks</h4>
      <p>Straight flush · Three of a kind · Straight · Flush · Pair · High card (with three cards a straight beats a flush).</p>
      <h4>Order of play</h4>
      <p>Every seat posts an <b>Ante</b> and may add <b>Pair Plus</b>. One deck, shuffled every hand: three cards to each seat, dealt from the dealer's left (first base, on your right), and three to the dealer. The seats then decide in the same order: <b>Play</b> puts a bet equal to the Ante on PLAY, <b>Fold</b> gives up the Ante (Pair Plus still counts).</p>
      <h4>Showdown</h4>
      <p>The dealer needs <b>Queen high</b> to qualify. If not, the Ante pays 1:1 and the Play bet pushes. Otherwise the better hand wins the Ante and the Play bet 1:1; a tie pushes both.</p>
      <h4>Ante bonus</h4>
      <p>Straight flush ${AB.sf}:1 · Three of a kind ${AB.trips}:1 · Straight ${AB.st}:1, paid whenever you play, even if the dealer wins.</p>
      <h4>Pair Plus</h4>
      <p>Pays on your own hand, even if you fold: Straight flush ${PP.sf}:1 · Three of a kind ${PP.trips}:1 · Straight ${PP.st}:1 · Flush ${PP.fl}:1 · Pair ${PP.pair}:1.</p>
      <h4>The regulars</h4>
      <p>Regulars from the Villa Lago circuit sit in with you, a different crowd at every visit. Each has a temperament of their own, but nobody plays every hand the same way: sometimes they push, sometimes they play it careful, and sometimes they are counting cards, yours included, since you play face up. They look at their own cards and keep them face down until the showdown; a folded hand is mucked unseen, unless its Pair Plus wins. When one goes broke they leave, and someone new pulls up a chair. They ante 10–100 of their own chips; only your bets touch your bankroll.</p>
      <h4>Hint</h4>
      <p>The light bulb shows the optimal play: play Queen-6-4 or better, fold anything less.</p>`,
  },
  {
    'pt.print2': `PAIR PLUS PAGA ATÉ ${PP.sf} PARA 1`,
    'pt.print3': 'DEALER QUALIFICA COM DAMA ALTA',
    'pt.tagline': `Cinco lugares · Pair Plus paga ${PP.sf} para 1`,
    'pt.needAnte': 'Faça seu ANTE',
    'pt.win': 'Ganhou',
    'pt.lose': 'Perdeu',
    'pt.push': 'Empate',
    'pt.folded': 'Desistiu',
    'pt.noQualify': 'Não qualifica',
    'pt.busted': 'Quebrou!',
    'pt.newcomer': 'Chegou',
    'pt.hintPlay': 'Melhor jogada: JOGAR (Q-6-4 ou melhor)',
    'pt.hintFold': 'Melhor jogada: DESISTIR (menos que Q-6-4)',
    'pt.rules': `
      <p>Three Card Poker numa mesa cheia: você e quatro frequentadores jogam cada um as suas três cartas contra a mesma mão do dealer.</p>
      <h4>Mãos</h4>
      <p>Straight flush · Trinca · Sequência · Flush · Par · Carta alta (com três cartas a sequência vale mais que o flush).</p>
      <h4>Ordem do jogo</h4>
      <p>Cada lugar aposta um <b>Ante</b> e pode somar o <b>Pair Plus</b>. Um baralho, embaralhado a cada mão: três cartas para cada lugar, a partir da esquerda do dealer (a primeira base, à sua direita), e três para o dealer. Os lugares decidem na mesma ordem: <b>Jogar</b> põe no PLAY uma aposta igual ao Ante, <b>Desistir</b> entrega o Ante (o Pair Plus continua valendo).</p>
      <h4>Showdown</h4>
      <p>O dealer precisa de <b>Dama alta</b> para qualificar. Se não qualificar, o Ante paga 1:1 e o Play empata. Senão, a melhor mão ganha o Ante e o Play 1:1; empate devolve as duas apostas.</p>
      <h4>Bônus do Ante</h4>
      <p>Straight flush ${AB.sf}:1 · Trinca ${AB.trips}:1 · Sequência ${AB.st}:1, pago sempre que você joga, mesmo se o dealer ganhar.</p>
      <h4>Pair Plus</h4>
      <p>Paga só pela sua mão, mesmo se você desistir: Straight flush ${PP.sf}:1 · Trinca ${PP.trips}:1 · Sequência ${PP.st}:1 · Flush ${PP.fl}:1 · Par ${PP.pair}:1.</p>
      <h4>Os frequentadores</h4>
      <p>Frequentadores do circuito Villa Lago sentam com você, uma turma diferente a cada visita. Cada um tem o seu temperamento, mas ninguém joga todas as mãos do mesmo jeito: às vezes partem para cima, às vezes jogam com cautela e às vezes estão contando cartas, inclusive as suas, que ficam abertas na mesa. Eles olham as próprias cartas e as mantêm fechadas até o showdown; uma mão desistida vai para o descarte sem ser mostrada, a não ser que o Pair Plus dela ganhe. Quem quebra se levanta, e logo outra pessoa puxa a cadeira. Eles apostam de 10 a 100 no Ante com as próprias fichas; só as suas apostas mexem no seu saldo.</p>
      <h4>Dica</h4>
      <p>A lâmpada mostra a jogada ótima: jogue com Dama-6-4 ou melhor e desista com menos.</p>`,
  },
);

/** Vertical anchors in the portrait layout frame: the dealer's cards, the felt print, the player's ANTE ring. */
const V = { dealer: 0.1, print: 0.27, seat: 0.652 };
const PRINT_W = 3.9;
/** The dealer's tag, under the cards. */
const DEALER_TAG_DZ = CARD_H / 2 + 0.2;
/** Diameter of the player's betting places (hit areas; the rings are printed in the seat box). */
const SPOT_SIZE = 0.54;
const N = 5;
/** Seat index of the rules (play order, 0 = first base on the player's right) ↔ position on screen. */
const posOf = (seat: number) => N - 1 - seat;
const seatOf = (pos: number) => N - 1 - pos;

interface AiState {
  profile: AiProfile;
  /** Chips in front of the player. */
  chips: number;
  /** This round's bets. */
  ante: number;
  pairPlus: number;
  /** This round's stakes on the felt (Ante, Pair Plus, Play). */
  stake: number;
  /** What the dealer settled (stake + winnings) while it is still on the felt; null before the showdown. */
  owed: number | null;
  /** What the regular remembers of the session (streak, last mindset); their next mindset leans on it. */
  mem: AiMemory;
  /** This hand's hidden mindset, drawn when they bet. Never shown. */
  mind: Mindset | null;
}

/** A regular sitting down: their own bankroll and a fresh memory. */
const seatRegular = (profile: AiProfile): AiState => ({ profile, chips: profile.bank, ante: 0, pairPlus: 0, stake: 0, owed: null, mem: newMemory(), mind: null });

interface SeatV {
  pos: number;
  geo: TcpSeatGeo;
  color: string;
  ai: AiState | null;
  cards: Card3D[];
  /** Cards dealt or in flight. */
  dealt: number;
  /** A regular's chips on its rings (the player's are the table's betting places). */
  piles: Record<RingId, ChipPile> | null;
  payouts: ChipPile[];
  plate: Pin;
  plateText: Plate['plateText'];
  tag: Pin;
  tagOn: boolean;
  active: boolean;
  /** The cards are squared into a face-down muck. */
  mucked: boolean;
}

/**
 * seatBox prints a ring's label on one line, which leaves "PAIR PLUS" tiny in a chip ring: print it
 * on two lines instead, in the same style.
 */
function twoLineLabel(cv: HTMLCanvasElement, geo: TcpSeatGeo, color: string, text: string) {
  const lines = text.split(' ');
  const g = cv.getContext('2d')!;
  const cx = cv.width / 2 + geo.colX * BOX_PPU;
  const cy = (geo.top + BOX_PAD - geo.ring.pairPlus) * BOX_PPU;
  const rr = geo.ringR * BOX_PPU;
  let size = Math.round(rr * 0.36);
  g.font = FONT.title(size);
  while (size > 10 && Math.max(...lines.map((l) => g.measureText(l).width)) > rr * 1.45) g.font = FONT.title(--size);
  g.save();
  g.globalAlpha = 0.85;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * size * 1.08));
  g.restore();
}

export class PartyThreeCardView extends TableGame {
  readonly id = 'partytcp';
  readonly title = 'Party Three Card Poker';
  // its own felt when there is one, else Party Blackjack's deep blue
  protected readonly felt = 'partytcp' as const;
  private rng = cryptoRng;
  /** The four regulars at the table (a new draw from the circuit at every visit). */
  private ai: AiState[] = drawRegulars(4, cryptoRng).map(seatRegular);
  private seats: SeatV[] = [];
  private round: PartyTcpRound | null = null;
  private dealer: Card3D[] = [];
  private dealerN = 0;
  private dealerZ = 0;
  private dealerTag: Pin | null = null;
  private dealerTagOn = false;
  private myTurn = false;
  /** Bumped on exit: a round still running from before goes quiet. */
  private run = 0;
  private aiBetting: Promise<void> = Promise.resolve();
  private aiSweep: Promise<void> = Promise.resolve();
  /** Pulsing glow on the player's selected betting ring while betting. */
  private selGlow: THREE.Mesh | null = null;
  private v3 = new THREE.Vector3();

  constructor(g: GameCtx) {
    super(g, PT.decks);
  }

  /** A different crowd at every visit: four regulars of the circuit sit in. */
  async enter() {
    this.ai = drawRegulars(4, this.rng).map(seatRegular);
    await super.enter();
  }

  rules() {
    return t('pt.rules');
  }

  // ---------------------------------------------------------------- table
  protected spotDefs(): SpotDef[] {
    // placed on the rings of the player's box in decorate(); ANTE first, so it is the selected one
    const at = { u: 0.5, v: V.seat, size: SPOT_SIZE, ring: false };
    return [
      { id: 'ante', label: t('pt.ante'), ...at, max: PT.maxBet },
      { id: 'pairPlus', label: t('pt.pairPlus'), ...at, max: PT.maxBet },
      { id: 'play', label: t('pt.play'), ...at, auto: true },
    ];
  }

  protected defaultBets() {
    return { ante: 25 };
  }

  protected validate() {
    if ((this.spots.amounts().ante ?? 0) < PT.minBet) return t('pt.needAnte');
    if (!this.g.wallet.canAfford(this.spots.total)) return t('toast.noFunds');
    return '';
  }

  protected decorate() {
    const { stage, table, hud, chips } = this.g;
    this.disposeSeats();
    const anteZ = stage.screenToTable(0.5, V.seat).z;
    this.dealerZ = stage.screenToTable(0.5, V.dealer).z;
    const pr = stage.screenToTable(0.5, V.print);
    table.addDecalAt(partyPrint(t('pt.print1'), t('pt.print2'), t('pt.print3')), 0, pr.z, PRINT_W);
    const labels: Record<RingId, string> = { pairPlus: '', ante: t('pt.ante'), play: t('pt.play') };
    this.seats = seatLayout(anteZ, stage.stretch).map((geo, pos): SeatV => {
      const mid = onTable(geo, 0, (geo.top + geo.bottom) / 2);
      const cv = seatBox(
        geo,
        COLORS[pos],
        RINGS.map((id) => ({ lx: geo.colX, ly: geo.ring[id], r: geo.ringR, label: labels[id] })),
      );
      twoLineLabel(cv, geo, COLORS[pos], t('pt.pairPlus'));
      table.addDecalAt(cv, mid.x, mid.z, boxWidth(geo)).rotation.y = geo.yaw;
      const ai = pos === PLAYER_SEAT ? null : this.ai[pos < PLAYER_SEAT ? pos : pos - 1];
      const piles = ai ? (Object.fromEntries(RINGS.map((id) => [id, new ChipPile(chips, stage.table, this.ringAt(geo, id))])) as Record<RingId, ChipPile>) : null;
      return {
        pos,
        geo,
        color: COLORS[pos],
        ai,
        cards: [],
        dealt: 0,
        piles,
        payouts: [],
        ...partyPlate(hud, COLORS[pos], ai ? ai.profile : null),
        tag: hud.pin('handtag'),
        tagOn: false,
        active: false,
        mucked: false,
      };
    });
    // the player's betting places are the rings of the middle box
    const me = this.seats[PLAYER_SEAT];
    for (const id of RINGS) {
      const s = this.spots.get(id);
      s.pos.copy(this.ringAt(me.geo, id));
      s.pile.group.position.copy(s.pos);
    }
    this.selGlow = this.makeSelGlow(me.geo.ringR, me.color);
    this.dealerTag = hud.pin('handtag dealer');
  }

  /** A soft neon ring, laid on the player's selected betting ring while betting. */
  private makeSelGlow(r: number, color: string) {
    const { cv, g } = makeCanvas(256, 256);
    g.strokeStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 26;
    g.lineWidth = 12;
    g.beginPath();
    g.arc(128, 128, 90, 0, Math.PI * 2);
    g.stroke();
    g.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const size = (r * 256) / 90;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
    m.visible = false;
    this.g.stage.table.add(m);
    return m;
  }

  private ringAt(geo: TcpSeatGeo, id: RingId) {
    const p = onTable(geo, geo.colX, geo.ring[id]);
    return new THREE.Vector3(p.x, 0, p.z);
  }

  private disposeSeats() {
    for (const sv of this.seats) {
      if (sv.piles) for (const id of RINGS) sv.piles[id].dispose();
      for (const p of sv.payouts) p.dispose();
      sv.plate.remove();
      sv.tag.remove();
    }
    this.seats = [];
    this.dealerTag?.remove();
    this.dealerTag = null;
    if (this.selGlow) {
      const mat = this.selGlow.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      this.selGlow.geometry.dispose();
      this.selGlow.removeFromParent();
      this.selGlow = null;
    }
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
      const tg = onTable(sv.geo, 0, sv.geo.tag);
      const tp = this.screen(tg.x, tg.z);
      sv.tag.place(tp.x, tp.y);
      sv.tag.show(sv.tagOn);
      const pl = onTable(sv.geo, 0, sv.geo.plate);
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
    if (this.dealerTag) {
      const p = this.screen(0, this.dealerZ + DEALER_TAG_DZ);
      this.dealerTag.place(p.x, p.y);
      this.dealerTag.show(this.dealerTagOn);
    }
    if (this.selGlow) {
      const on = this.phase === 'betting' && this.spots.betting;
      if (on) {
        const s = this.spots.get(this.spots.active);
        this.selGlow.position.set(s.pos.x, 0.0025, s.pos.z);
        (this.selGlow.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.3 * Math.sin(performance.now() / 260);
      }
      this.selGlow.visible = on;
    }
  }

  /** A seat's tag over its cards: thinking, its move, busted or new, then the hand and the result. */
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
    const p = onTable(sv.geo, 0, sv.geo.home);
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
      sv.cards = [];
      sv.dealt = 0;
      sv.tagOn = false;
      sv.active = false;
      sv.mucked = false;
    }
    this.dealer = [];
    this.dealerN = 0;
    this.dealerTagOn = false;
    this.round = null;
    this.myTurn = false;
  }

  private async placeAiBets(run: number) {
    await this.aiSweep;
    await this.alive(run);
    const { sfx } = this.g;
    const order = [0, 1, 3, 4].map((p) => this.seats[p]).filter((sv) => sv?.ai && sv.piles && !sv.piles.ante.amount);
    const jobs = order.map(async (sv, k) => {
      const ai = sv.ai!;
      const piles = sv.piles!;
      await wait(0.15 + k * 0.28 + Math.random() * 0.12);
      await this.alive(run);
      if (isBroke(ai.chips)) await this.replaceRegular(sv, run);
      // the hand's hidden mindset, then the bets it calls for (a regular always plays)
      ai.mind = drawMindset(ai.profile, ai.mem, ai.chips, this.rng);
      const b = aiBets(ai.mind, ai.chips, ai.mem, this.rng);
      ai.ante = b.ante;
      ai.pairPlus = b.pairPlus;
      ai.chips -= b.ante + b.pairPlus;
      ai.stake = b.ante + b.pairPlus;
      sfx.play('handle', { vol: 0.35 });
      const drops = [piles.ante.dropIn(b.ante, this.home(sv), 0.06)];
      if (b.pairPlus) drops.push(wait(0.16).then(() => piles.pairPlus.dropIn(b.pairPlus, this.home(sv), 0.06)));
      await Promise.all(drops);
    });
    await Promise.all(jobs);
  }

  /** A regular who can't cover the Ante and the Play bet leaves; a newcomer from the circuit takes the seat. */
  private async replaceRegular(sv: SeatV, run: number) {
    const { sfx } = this.g;
    this.say(sv, t('pt.busted'), 'lose');
    sfx.play('shove', { vol: 0.4 });
    await wait(1.1);
    await this.alive(run);
    const next = replacementFor(this.ai.map((a) => a.profile.name), this.rng);
    Object.assign(sv.ai!, seatRegular(next));
    setPlateName(sv, next);
    this.say(sv, t('pt.newcomer'), 'win');
    sfx.coins(4);
    await wait(0.6);
    await this.alive(run);
  }

  /** The regulars' stakes and winnings slide back to their places, then join their chips. */
  private async sweepAi(delay: number) {
    await wait(delay);
    const { sfx } = this.g;
    const jobs: Promise<void>[] = [];
    for (const sv of this.seats) {
      const ai = sv.ai;
      const piles = sv.piles;
      if (!ai || !piles) continue;
      const on = [...RINGS.map((id) => piles[id]), ...sv.payouts].filter((p) => p.amount > 0);
      const to = this.home(sv, 0);
      jobs.push(
        Promise.all(on.map((p) => slideChips(p.group, to, 0.5, 0.08, 'power2.in'))).then(() => {
          ai.chips += ai.owed ?? ai.stake;
          ai.owed = null;
          ai.stake = 0;
          for (const p of sv.payouts) p.dispose();
          sv.payouts = [];
          for (const id of RINGS) {
            piles[id].clear();
            piles[id].group.position.copy(this.ringAt(sv.geo, id));
          }
        }),
      );
    }
    if (jobs.length) sfx.play('handle', { vol: 0.5 });
    await Promise.all(jobs);
  }

  // ---------------------------------------------------------------- cards
  /** Card i of a seat: its place in the hand, or in the muck. */
  private placeOf(sv: SeatV, i: number, muck = false): Place {
    const f = muck ? muckPlace(sv.geo, i) : cardPlace(sv.geo, i);
    const p = onTable(sv.geo, f.lx, f.ly);
    const jit = muck ? 0 : (((i * 37 + sv.pos * 11) % 7) - 3) * 0.006;
    return { pos: new THREE.Vector3(p.x, REST_Y + f.lift, p.z), yaw: sv.geo.yaw + f.yaw + jit };
  }

  private dealerPlace(i: number): Place {
    return { pos: new THREE.Vector3(dealerX(i), REST_Y + i * 0.0035, this.dealerZ), yaw: (((i * 37) % 7) - 3) * 0.004 };
  }

  /** The deal, card by card, from first base to third base and the dealer last, three times. */
  private async dealAll(evs: TEvent[], run: number) {
    const jobs: Promise<unknown>[] = [];
    for (const e of evs) {
      await this.alive(run);
      if (e.t === 'card') {
        const sv = this.seats[posOf(e.seat)];
        const i = sv.dealt++;
        jobs.push(this.cardsT.deal(e.card, this.placeOf(sv, i), false).then((c) => (sv.cards[i] = c)));
      } else {
        const i = this.dealerN++;
        jobs.push(this.cardsT.deal(e.card, this.dealerPlace(i), false).then((c) => (this.dealer[i] = c)));
      }
      await wait(0.15);
    }
    await Promise.all(jobs);
    await this.alive(run);
  }

  /** A regular lifts the near edges of the three cards to look at them. */
  private async peek(sv: SeatV) {
    this.g.sfx.play('slide', { vol: 0.25, rate: 1.4 });
    await Promise.all(sv.cards.map((c, i) => wait(i * 0.09).then(() => peekCard(c))));
  }

  /** A folded hand: face down, squared into one pile and pushed a little toward the dealer. */
  private async muck(sv: SeatV) {
    const up = sv.cards.filter((c) => c.faceUp);
    await Promise.all(up.map((c, i) => wait(i * 0.06).then(() => this.cardsT.flip(c, 0.4))));
    this.g.sfx.play('shove', { vol: 0.5 });
    await Promise.all(sv.cards.map((c, i) => slideCard(c, this.placeOf(sv, i, true), 0.36, 0.04)));
    sv.mucked = true;
  }

  /** The dealer spreads a seat's cards (out of the muck if needed) and turns them over. */
  private async reveal(sv: SeatV) {
    if (sv.mucked) {
      await Promise.all(sv.cards.map((c, i) => slideCard(c, this.placeOf(sv, i), 0.32)));
      sv.mucked = false;
    }
    const down = sv.cards.filter((c) => !c.faceUp);
    for (const c of down) {
      this.cardsT.flip(c, 0.45);
      await wait(0.1);
    }
    if (down.length) await wait(0.42);
  }

  // ---------------------------------------------------------------- the round
  protected advice() {
    const r = this.round;
    if (!r || !this.myTurn) return null;
    return shouldPlay(eval3(r.seats[seatOf(PLAYER_SEAT)].cards)) ? { id: 'play', msg: t('pt.hintPlay') } : { id: 'fold', msg: t('pt.hintFold') };
  }

  protected async playRound() {
    const run = this.run;
    await this.aiBetting;
    await this.alive(run);
    // the seats in play order (first base first) with this round's bets
    const bets = this.spots.amounts();
    const r = new PartyTcpRound(
      this.shoe,
      Array.from({ length: N }, (_, s) => {
        const ai = this.seats[posOf(s)].ai;
        return ai ? { ante: ai.ante, pairPlus: ai.pairPlus, mind: ai.mind, streak: ai.mem.streak } : { ante: bets.ante ?? 0, pairPlus: bets.pairPlus ?? 0, mind: null };
      }),
    );
    this.round = r;
    for (const sv of this.seats) sv.tagOn = false;
    await this.dealAll(r.deal(), run);

    // everyone looks at their cards: you turn yours over, the regulars peek at theirs
    const me = this.seats[PLAYER_SEAT];
    const looks = this.seats.filter((sv) => sv.ai).map((sv, k) => wait(0.2 + k * 0.16 + Math.random() * 0.1).then(() => this.peek(sv)));
    for (const c of me.cards) {
      this.cardsT.flip(c, 0.5);
      await wait(0.12);
    }
    await Promise.all(looks);
    await wait(0.3);
    await this.alive(run);
    this.say(me, hand3Name(eval3(r.seats[seatOf(PLAYER_SEAT)].cards)));

    // play or fold, from first base (your right) to third base
    for (let s = 0; s < N; s++) {
      if (this.seats[posOf(s)].ai) await this.aiTurn(s, run);
      else await this.playerTurn(s, run);
    }
    await wait(0.35);
    await this.alive(run);
    await this.showdown(r.settle(), run);
  }

  private async aiTurn(s: number, run: number) {
    const { sfx } = this.g;
    const r = this.round!;
    const sv = this.seats[posOf(s)];
    const ai = sv.ai!;
    const st = r.seats[s];
    const mind = ai.mind ?? 'calculated';
    sv.active = true;
    this.say(sv, t('pb.think'), 'dealer');
    await wait(thinkTime(mind, borderline(eval3(st.cards)), this.rng));
    await this.alive(run);
    // the player's cards are face up on the table: a counting regular takes them as dead cards
    const play = ai.chips >= st.ante && aiPlays(mind, st.cards, { dead: r.faceUp, streak: ai.mem.streak }, this.rng);
    r.decide(s, play);
    if (play) {
      this.say(sv, t('btn.play'));
      ai.chips -= st.ante;
      ai.stake += st.ante;
      sfx.play('handle', { vol: 0.45 });
      await sv.piles!.play.dropIn(st.ante, this.home(sv), 0.06);
    } else {
      this.say(sv, t('btn.fold'), 'lose');
      await this.muck(sv);
    }
    await wait(0.2);
    await this.alive(run);
    sv.active = false;
  }

  private async playerTurn(s: number, run: number) {
    const r = this.round!;
    const sv = this.seats[posOf(s)];
    const st = r.seats[s];
    sv.active = true;
    this.myTurn = true;
    const pick = await this.choose([
      { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold' },
      { id: 'play', label: t('btn.play'), color: 'green', icon: 'play', enabled: this.g.wallet.canAfford(st.ante) },
    ]);
    this.myTurn = false;
    await this.alive(run);
    const play = pick === 'play';
    r.decide(s, play);
    if (play) await this.place('play', st.ante);
    else {
      this.say(sv, t('pt.folded'), 'lose');
      await this.muck(sv);
    }
    sv.active = false;
  }

  /** The dealer shows down, then settles every seat from third base (your left) to first base. */
  private async showdown(res: SeatResult[], run: number) {
    const { sfx } = this.g;
    const r = this.round!;
    for (const c of this.dealer) {
      this.cardsT.flip(c, 0.5);
      await wait(0.16);
    }
    await wait(0.45);
    await this.alive(run);
    const dh = eval3(r.dealer);
    if (dealerQualifies(dh)) this.sayDealer(hand3Name(dh));
    else {
      this.sayDealer(t('pt.noQualify'), 'lose');
      sfx.play('chips', { vol: 0.45 });
    }
    await wait(0.6);
    await this.alive(run);
    // each regular remembers how the hand went (their next mindset leans on it)
    for (const sr of res) {
      const ai = this.seats[posOf(sr.seat)].ai;
      if (ai?.mind) remember(ai.mem, ai.mind, sr.total - sr.wager);
    }
    const jobs = res.map((sr) => {
      const sv = this.seats[posOf(sr.seat)];
      const delay = sv.pos * 0.45;
      return sv.ai ? this.settleAi(sv, sr, delay, run) : this.settlePlayer(sv, sr, delay, run);
    });
    await Promise.all(jobs);
    await this.alive(run);
    this.aiSweep = this.sweepAi(0.9);
  }

  /** The seat's tag: its hand and how it did (or just "Folded"); winners glow. */
  private markResult(sv: SeatV, sr: SeatResult) {
    const { fx } = this.g;
    const net = sr.total - sr.wager;
    const shown = sr.played || sr.ret.pairPlus > 0;
    const word = t(net > 0 ? 'pt.win' : net < 0 ? 'pt.lose' : 'pt.push');
    this.say(sv, shown ? `${hand3Name(sr.tcp.player)} · ${word}` : t('pt.folded'), net > 0 ? 'win' : net < 0 ? 'lose' : '');
    if (net > 0) {
      const c = onTable(sv.geo, 0, sv.geo.cards);
      const at = new THREE.Vector3(c.x, 0, c.z);
      fx.glow(at, 1.35, 1.3);
      if (sr.tcp.player.cat >= Cat3.Straight) fx.burst(at.setY(0.3), sv.ai ? 50 : 120);
    }
  }

  private async settlePlayer(sv: SeatV, sr: SeatResult, delay: number, run: number) {
    await wait(delay);
    await this.alive(run);
    // a folded hand whose Pair Plus wins is turned back over to be paid
    if (!sr.played && sr.ret.pairPlus > 0) await this.reveal(sv);
    await this.alive(run);
    this.markResult(sv, sr);
    const h = sr.tcp.player;
    if (sr.total > sr.wager) highlightCards(this.g, sv.cards);
    const big = h.cat >= Cat3.Straight && (sr.ret.pairPlus > 0 || sr.tcp.anteBonus > 0) ? hand3Name(h).toUpperCase() : undefined;
    await this.settle({ ante: sr.ret.ante, play: sr.ret.play, pairPlus: sr.ret.pairPlus }, { big, folded: !sr.played && !sr.bets.pairPlus });
  }

  /** The dealer pays a regular's winning bets from the rack and takes the losing ones. */
  private async settleAi(sv: SeatV, sr: SeatResult, delay: number, run: number) {
    const { stage, chips, sfx } = this.g;
    await wait(delay);
    await this.alive(run);
    if (sr.played || sr.ret.pairPlus > 0) await this.reveal(sv);
    await this.alive(run);
    this.markResult(sv, sr);
    const ai = sv.ai!;
    const piles = sv.piles!;
    const top = stage.screenToTable(0.5, -0.08);
    const jobs: Promise<void>[] = [];
    RINGS.forEach((id, k) => {
      const bet = sr.bets[id];
      const ret = sr.ret[id];
      const pile = piles[id];
      if (!bet) return;
      if (ret > bet) {
        const at = onTable(sv.geo, sv.geo.colX + PAY_DX, sv.geo.ring[id]);
        const p = new ChipPile(chips, stage.table, new THREE.Vector3(at.x * 0.6, 0, top.z));
        p.set(ret - bet);
        sv.payouts.push(p);
        jobs.push(slideChips(p.group, new THREE.Vector3(at.x, 0, at.z), 0.55, 0.15, 'power3.out', k * 0.12).then(() => sfx.play('stack', { vol: 0.5 })));
      } else if (ret < bet && pile.amount) {
        const home = pile.group.position.clone();
        jobs.push(
          slideChips(pile.group, new THREE.Vector3(home.x * 0.3, 0, top.z), 0.6, 0.12, 'power2.in', k * 0.1).then(() => {
            pile.clear();
            pile.group.position.copy(home);
          }),
        );
      }
    });
    if (jobs.length) sfx.play('handle', { vol: 0.4 });
    ai.owed = sr.total;
    await Promise.all(jobs);
  }
}
