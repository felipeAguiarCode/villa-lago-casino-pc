import * as THREE from 'three';
import { cardLabel, suitOf, SUIT_SYMBOL, type Card } from '../../core/cards';
import { addStrings, t } from '../../core/i18n';
import { cryptoRng } from '../../core/rng';
import { wait } from '../../table/anim';
import { type Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT } from '../../table/prints';
import { drawSuit } from '../../table/suits';
import { Paytable } from '../../ui/paytable';
import { highlightCards, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { backToDeck, DeckStack, feltKey, fitPrint, fitText, goldFrame, liftTurnLand, PPU, unitCanvas, uvAt } from '../highlow/tableKit';
import { drawRb, isRbJoker, RB, RB_SPOTS, rbWinners, settleRb, SUIT_SPOT, type RbSpot } from './rules';

addStrings(
  {
    'rb.red': 'RED',
    'rb.black': 'BLACK',
    'rb.print1': 'RED OR BLACK',
    'rb.print2': 'Colour pays 1 to 1 · Suit pays 3 to 1',
    'rb.pays1': 'PAYS 1 TO 1',
    'rb.pays3': '3 TO 1',
    'rb.foot': 'THE JOKER BEATS EVERY BET',
    'rb.foot2': '54 cards · reshuffled every round',
    'rb.needBet': 'Bet on a colour or a suit',
    'rb.wait': 'The dealer is shuffling…',
    'rb.joker': 'JOKER · HOUSE WINS',
    'rb.big': 'SUIT!',
    'rb.colour': 'Red / Black',
    'rb.suit': 'Suit ♥ ♦ ♣ ♠',
    'rb.jokerRow': 'Joker',
    'rb.jokerPays': 'all bets lose',
    'rb.rules': `
      <p>One card is drawn from a deck of <b>54 cards</b>: the 52 cards plus <b>two Jokers</b>. Bet on its colour, its suit, or both.</p>
      <h4>Payouts</h4>
      <p><b>Red</b> or <b>Black</b>: 1:1 · each suit ♥ ♦ ♣ ♠: <b>3:1</b>.</p>
      <p>A <b>Joker</b> beats every bet.</p>
      <h4>The deck</h4><p>The card goes back and the deck is reshuffled every round, so every round is a fresh 54-card deck.</p>`,
  },
  {
    'rb.red': 'VERMELHO',
    'rb.black': 'PRETO',
    'rb.print1': 'VERMELHO OU PRETO',
    'rb.print2': 'Cor paga 1 para 1 · Naipe paga 3 para 1',
    'rb.pays1': 'PAGA 1 PARA 1',
    'rb.pays3': '3 PARA 1',
    'rb.foot': 'O CORINGA VENCE TODAS AS APOSTAS',
    'rb.foot2': '54 cartas · embaralhadas a cada rodada',
    'rb.needBet': 'Aposte numa cor ou num naipe',
    'rb.wait': 'O dealer está embaralhando…',
    'rb.joker': 'CORINGA · A CASA VENCE',
    'rb.big': 'NAIPE!',
    'rb.colour': 'Vermelho / Preto',
    'rb.suit': 'Naipe ♥ ♦ ♣ ♠',
    'rb.jokerRow': 'Coringa',
    'rb.jokerPays': 'todas perdem',
    'rb.rules': `
      <p>Sai uma carta de um baralho de <b>54 cartas</b>: as 52 cartas e <b>dois coringas</b>. Aposte na cor, no naipe ou nos dois.</p>
      <h4>Pagamentos</h4>
      <p><b>Vermelho</b> ou <b>Preto</b>: 1:1 · cada naipe ♥ ♦ ♣ ♠: <b>3:1</b>.</p>
      <p>O <b>coringa</b> vence todas as apostas.</p>
      <h4>O baralho</h4><p>A carta volta e o baralho é embaralhado a cada rodada: toda rodada é um baralho novo de 54 cartas.</p>`,
  },
);

const V_ROW = 0.47;
const CREAM = '#f6ead0';

interface Lay {
  cz: number;
  deck: THREE.Vector3;
  reveal: THREE.Vector3;
  /** Colour boxes: centre |x|, z, width, height; chips sit pileDz below the centre. */
  bx: number;
  bz: number;
  bw: number;
  bh: number;
  bPile: number;
  /** Suit card shapes: centre x per suit index, z, width, height and chip offset. */
  sx: number[];
  sz: number;
  sw: number;
  sh: number;
  sPile: number;
}

function colourBox(L: Lay, label: string, red: boolean, sub: string): HTMLCanvasElement {
  const { cv, g, W, H } = unitCanvas(L.bw, L.bh);
  const grd = g.createLinearGradient(0, 0, 0, H);
  if (red) {
    grd.addColorStop(0, 'rgba(206,32,44,0.62)');
    grd.addColorStop(1, 'rgba(140,12,22,0.7)');
  } else {
    grd.addColorStop(0, 'rgba(34,34,42,0.72)');
    grd.addColorStop(1, 'rgba(8,8,12,0.8)');
  }
  goldFrame(g, 6, 6, W - 12, H - 12, 0.1 * PPU, grd);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = CREAM;
  fitText(g, label, W / 2, 0.3 * PPU, W - 0.3 * PPU, FONT.title, 0.32 * PPU, 8);
  g.fillStyle = GOLD;
  fitText(g, sub, W / 2, 0.53 * PPU, W - 0.3 * PPU, FONT.title, 0.085 * PPU, 4);
  g.globalAlpha = 0.5;
  g.strokeStyle = GOLD;
  g.lineWidth = 3;
  g.setLineDash([12, 9]);
  g.beginPath();
  g.arc(W / 2, (L.bh / 2 + L.bPile) * PPU, 0.25 * PPU, 0, Math.PI * 2);
  g.stroke();
  return cv;
}

/** A printed card shape with a big suit: red ones for ♥ ♦, dark ones for ♣ ♠. */
function suitCard(L: Lay, suit: number, sub: string): HTMLCanvasElement {
  const { cv, g, W, H } = unitCanvas(L.sw, L.sh);
  const red = suit === 1 || suit === 2;
  const grd = g.createLinearGradient(0, 0, 0, H);
  if (red) {
    grd.addColorStop(0, 'rgba(196,26,38,0.85)');
    grd.addColorStop(1, 'rgba(128,10,20,0.9)');
  } else {
    grd.addColorStop(0, 'rgba(40,40,50,0.88)');
    grd.addColorStop(1, 'rgba(10,10,14,0.92)');
  }
  goldFrame(g, 5, 5, W - 10, H - 10, 0.07 * PPU, grd);
  g.fillStyle = CREAM;
  const size = Math.min(W * 0.5, H * 0.3);
  drawSuit(g, suit, W / 2, H * 0.24, size);
  // small corner pips like a real card
  const pip = Math.min(W, H) * 0.12;
  drawSuit(g, suit, W * 0.17, H * 0.1, pip);
  drawSuit(g, suit, W * 0.83, H * 0.9, pip, true);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = GOLD;
  fitText(g, sub, W / 2, H * 0.455, W * 0.8, FONT.title, Math.min(0.095 * PPU, H * 0.085), 3);
  g.globalAlpha = 0.45;
  g.strokeStyle = GOLD;
  g.lineWidth = 3;
  g.setLineDash([10, 8]);
  g.beginPath();
  g.arc(W / 2, (L.sh / 2 + L.sPile) * PPU, Math.min(0.24 * PPU, W * 0.38), 0, Math.PI * 2);
  g.stroke();
  return cv;
}

/** Thin gold outlines of the deck place and of the card's landing place. */
function placesPrint(L: Lay): HTMLCanvasElement {
  const top = L.deck.z - 0.6;
  const h = L.reveal.z + 0.6 - top;
  const { cv, g } = unitCanvas(1.0, h);
  for (const [z, dashed] of [
    [L.deck.z, true],
    [L.reveal.z, false],
  ] as [number, boolean][]) {
    const cy = (z - top) * PPU;
    g.save();
    g.strokeStyle = GOLD;
    g.globalAlpha = dashed ? 0.5 : 0.75;
    g.lineWidth = dashed ? 3 : 5;
    if (dashed) g.setLineDash([12, 9]);
    g.beginPath();
    g.roundRect(0.5 * PPU - 0.37 * PPU, cy - 0.49 * PPU, 0.74 * PPU, 0.98 * PPU, 0.07 * PPU);
    g.stroke();
    g.restore();
  }
  // four small pips between the two places
  const my = ((L.deck.z + L.reveal.z) / 2 - top) * PPU;
  [1, 3, 2, 0].forEach((s, i) => {
    g.fillStyle = s === 1 || s === 2 ? '#e0414d' : CREAM;
    g.globalAlpha = 0.8;
    drawSuit(g, s, (0.5 + (i - 1.5) * 0.17) * PPU, my, 0.11 * PPU);
  });
  return cv;
}

export class RedBlackView extends TableGame {
  readonly id = 'redblack';
  readonly title = 'Red or Black';
  protected readonly felt = feltKey('redblack', 'blackjack');
  private L!: Lay;
  private stack: DeckStack | null = null;
  private greenBack: THREE.CanvasTexture | null = null;
  /** The card drawn last round, still face up in the centre. */
  private drawn3: Card3D | null = null;
  private ready = false;
  private prep: Promise<void> | null = null;
  private gen = 0;

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('rb.rules');
  }

  private layout(): Lay {
    const { stage } = this.g;
    const A = stage.screenToTable(0.5, V_ROW);
    const edge = stage.screenToTable(0.955, V_ROW).x;
    const inner = 0.62;
    const W = Math.max(0.95, edge - inner - 0.04);
    const x0 = inner + 0.04;
    const sw = Math.min(0.82, Math.max(0.42, (W - 0.16) / 2));
    const sh = Math.min(1.15, sw * 1.4);
    const bh = 1.2;
    // x per suit index (0 ♠, 1 ♥, 2 ♦, 3 ♣): ♥ ♦ | deck | ♣ ♠
    const near = x0 + W * 0.25;
    const far = x0 + W * 0.75;
    this.L = {
      cz: A.z,
      deck: new THREE.Vector3(0, 0, A.z - 0.62),
      reveal: new THREE.Vector3(0, 0.006, A.z + 0.62),
      bx: x0 + W / 2,
      bz: A.z - 0.66,
      bw: W,
      bh,
      bPile: 0.87 - bh / 2,
      sx: [far, -far, -near, near],
      sz: A.z + 0.62,
      sw,
      sh,
      sPile: sh * 0.24,
    };
    return this.L;
  }

  protected spotDefs(): SpotDef[] {
    const L = this.layout();
    const red = uvAt(this.g, -L.bx, L.bz + L.bPile);
    const black = uvAt(this.g, L.bx, L.bz + L.bPile);
    const defs: SpotDef[] = [
      { id: 'red', label: t('rb.red'), u: red.u, v: red.v, ring: false, hitW: L.bw, hitH: L.bh, max: RB.maxBet },
      { id: 'black', label: t('rb.black'), u: black.u, v: black.v, ring: false, hitW: L.bw, hitH: L.bh, max: RB.maxBet },
    ];
    for (const s of [1, 2, 3, 0]) {
      const p = uvAt(this.g, L.sx[s], L.sz + L.sPile);
      defs.push({ id: SUIT_SPOT[s], label: SUIT_SYMBOL[s], u: p.u, v: p.v, ring: false, hitW: L.sw, hitH: L.sh, max: RB.suitMax });
    }
    return defs;
  }

  protected defaultBets() {
    return { red: 25 };
  }

  protected decorate() {
    const { table, stage, hud } = this.g;
    const L = this.L;
    table.addDecalAt(
      fitPrint(
        [
          { text: t('rb.print1'), y: 104, R: 2400, px: 90, font: FONT.title, color: GOLD, spacing: 10 },
          { text: t('rb.print2'), y: 168, R: 2400, px: 42, font: FONT.italic, color: INK_SOFT },
        ],
        196,
      ),
      0,
      L.bz - L.bh / 2 - 0.62,
      3.7,
    );
    table.addDecalAt(colourBox(L, t('rb.red'), true, t('rb.pays1')), -L.bx, L.bz, L.bw);
    table.addDecalAt(colourBox(L, t('rb.black'), false, t('rb.pays1')), L.bx, L.bz, L.bw);
    for (const s of [0, 1, 2, 3]) table.addDecalAt(suitCard(L, s, t('rb.pays3')), L.sx[s], L.sz, L.sw);
    const pp = placesPrint(L);
    table.addDecalAt(pp, 0, L.deck.z - 0.6 + pp.height / PPU / 2, 1.0);
    table.addDecalAt(
      fitPrint(
        [
          { text: t('rb.foot'), y: 62, R: 3000, px: 42, font: FONT.title, color: GOLD, spacing: 6 },
          { text: t('rb.foot2'), y: 124, R: 3000, px: 38, font: FONT.italic, color: INK_SOFT },
        ],
        142,
        [{ y: 82, R: 3000, half: 0.1 }],
      ),
      0,
      L.sz + L.sh / 2 + 0.52,
      3.7,
    );
    this.paytable = new Paytable(hud.root, '', [
      [t('rb.colour'), '1:1'],
      [t('rb.suit'), '3:1'],
      [t('rb.jokerRow'), t('rb.jokerPays')],
    ]);
    // the deck: the table's brand deck (the card factory's back, see TABLE_DECK)
    this.greenBack?.dispose();
    this.greenBack = null;
    const tex = this.g.cards.backTexture;
    this.stack?.dispose();
    this.stack = new DeckStack(stage.table, tex, L.deck);
    this.stack.setCount(54);
    this.stack.group.visible = false;
  }

  protected cleanup() {
    this.gen++;
    this.prep = null;
    this.ready = false;
    if (this.drawn3) this.g.cards.destroy(this.drawn3);
    this.drawn3 = null;
    this.stack?.dispose();
    this.stack = null;
    this.greenBack?.dispose();
    this.greenBack = null;
  }

  protected validate() {
    if (!this.ready) return t('rb.wait');
    if (this.spots.total < RB.minBet) return t('rb.needBet');
    return '';
  }

  protected toBetting() {
    this.ready = false;
    super.toBetting();
    const gen = this.gen;
    this.prep = this.prepare(gen)
      .catch((e) => console.error(e))
      .finally(() => {
        if (gen !== this.gen) return;
        this.prep = null;
        this.ready = true;
        if (this.phase === 'betting') this.refreshBetUi();
      });
  }

  /** The deck comes out (first round); last round's card goes back into it. */
  private async prepare(gen: number) {
    const { table, sfx, cards } = this.g;
    const live = () => gen === this.gen && !!this.stack;
    if (!this.stack) return;
    if (!this.stack.group.visible) {
      sfx.play('shove', { vol: 0.6 });
      await this.stack.arrive(table.shoeMouth(), this.L.deck);
      if (!live()) return;
    }
    if (this.drawn3) {
      const c = this.drawn3;
      sfx.play('slide', { vol: 0.55 });
      await backToDeck(c, this.stack.top(0.002));
      if (!live()) return;
      cards.destroy(c);
      this.drawn3 = null;
      this.stack.setCount(54);
      sfx.play('place', { vol: 0.4 });
    }
  }

  private skin(c: Card3D) {
    if (!this.greenBack) return;
    const m = c.back.material as THREE.MeshStandardMaterial;
    m.map = this.greenBack;
    m.needsUpdate = true;
  }

  private spotCentre(s: RbSpot): THREE.Vector3 {
    const L = this.L;
    if (s === 'red') return new THREE.Vector3(-L.bx, 0, L.bz);
    if (s === 'black') return new THREE.Vector3(L.bx, 0, L.bz);
    return new THREE.Vector3(L.sx[SUIT_SPOT.indexOf(s)], 0, L.sz);
  }

  protected async playRound() {
    if (this.prep) await this.prep;
    const { cards, sfx, fx } = this.g;
    const L = this.L;
    const stack = this.stack!;
    const bets = this.spots.amounts() as Partial<Record<RbSpot, number>>;
    // a fresh 54-card deck every round: a quick riffle, then the top card
    await stack.riffle(() => sfx.play('shuffle', { vol: 0.75 }), 0.75);
    const card: Card = drawRb(cryptoRng);
    const c = cards.create(card);
    this.skin(c);
    const from = stack.top();
    stack.setCount(53);
    sfx.play('slide', { vol: 0.6 });
    await liftTurnLand(c, from, L.reveal.clone(), {
      dur: 1.15,
      lift: 0.75,
      sway: 0.3,
      onTurn: () => sfx.play('fan', { vol: 0.6 }),
      onLand: () => sfx.play('place', { vol: 0.75 }),
    });
    this.drawn3 = c;
    const ret = settleRb(card, bets);
    const tagZ = L.reveal.z - 0.6;
    if (isRbJoker(card)) {
      this.tag(t('rb.joker'), 'lose', 0, tagZ);
      fx.glow(L.reveal.clone(), 1.0, 1.25, 1.8, '#ff9a8f');
    } else {
      const colour = suitOf(card) === 1 || suitOf(card) === 2 ? 'red' : 'black';
      const won = rbWinners(card).some((s) => (ret[s] ?? 0) > 0);
      this.tag(`${cardLabel(card)} · ${t(`rb.${colour}`)}`, won ? 'win' : '', 0, tagZ);
      for (const s of rbWinners(card)) {
        const at = this.spotCentre(s);
        if (s === 'red' || s === 'black') fx.glow(at, L.bw * 1.06, L.bh * 1.1, 1.8);
        else fx.glow(at, L.sw * 1.2, L.sh * 1.12, 1.8);
        if ((ret[s] ?? 0) > 0) fx.burst(at.clone().setY(0.3), s === 'red' || s === 'black' ? 60 : 110);
      }
      if (won) highlightCards(this.g, [c]);
    }
    await wait(0.2);
    const suitWin = RB_SPOTS.some((s) => s !== 'red' && s !== 'black' && ret[s] > 0);
    await this.settle(ret, { big: suitWin ? t('rb.big') : undefined });
  }
}
