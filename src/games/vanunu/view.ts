import gsap from 'gsap';
import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { cardLabel, rankLabel, type Card } from '../../core/cards';
import { Cat5 } from '../../core/eval5';
import { cryptoRng } from '../../core/rng';
import { collectCards, peekCard, slideChips, squeezeCard, wait, type Place } from '../../table/anim';
import { CARD_H, CARD_W, REST_Y, type Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, makeCanvas, tablePrint } from '../../table/prints';
import type { BtnSpec } from '../../ui/hud';
import { Paytable } from '../../ui/paytable';
import { hand5Name } from '../caribbean/view';
import { CardPicker, highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { partialEval } from '../showdown/hands';
import { lowName, lowRank } from './hands';
import { exactOdds, type Odds } from './odds';
import { settleVanunu, swapFee, VN, type Decl } from './rules';
import { declareFromOdds, raiseAdvice, swapAdvice, type Position } from './strategy';

const pct = (x: number) => Math.round(x * 100);

/** What the face-up cards already show: the HIGH made so far and the LOW ranks so far. */
function upLabel(cards: Card[]): { high: string; low: string } {
  const p = partialEval(cards);
  const high =
    p.cat === Cat5.High && cards.length < 2 ? rankLabel(p.ranks[0]) : hand5Name({ cat: p.cat, ranks: p.ranks, score: 0, cards });
  const lows = [...new Set(cards.map(lowRank))].sort((a, b) => a - b).slice(0, 5).reverse();
  return { high, low: lows.map((r) => (r === 1 ? 'A' : rankLabel(r))).join('-') };
}

addStrings(
  {
    'vn.ante': 'ANTE',
    'vn.play': 'PLAY',
    'vn.swap': 'SWAP',
    'vn.low': 'LOW',
    'vn.high': 'HIGH',
    'vn.both': 'BOTH',
    'vn.lowSub': 'A-5 · lowest wins',
    'vn.highSub': 'best poker hand',
    'vn.bothSub': 'win both sides',
    'vn.print1': 'VANUNU',
    'vn.print2': 'DECLARE HIGH · LOW · BOTH',
    'vn.print3': 'SCOOP PAYS 1 TO 1 · SPLIT POT PUSHES',
    'vn.print4': 'BOTH PAYS 2 TO 1 · ANY LESS LOSES',
    'vn.needAnte': 'Place a bet on ANTE',
    'vn.turn': 'Turn',
    'vn.turnToast': 'Click one of your cards to turn it face up',
    'vn.raiseN': 'Raise {n}×',
    'vn.keep': 'Keep',
    'vn.swapBtn': 'Swap',
    'vn.swapTag': 'SWAP',
    'vn.swapToast': 'One swap: click a card, then Swap (face up {up} · face down {down}) — or Keep',
    'vn.swapPicked': '{card} · fee {fee}',
    'vn.swapPickedDown': 'Face-down card · fee {fee}',
    'vn.declToast': 'Declare: the chips go into the box you choose',
    'vn.up': 'HIGH {h} · LOW {l}',
    'vn.tagHigh': 'HIGH · {h}',
    'vn.tagLow': 'LOW · {l}',
    'vn.noLow': '—',
    'vn.scoop': 'SCOOP',
    'vn.split': 'SPLIT POT',
    'vn.hintTurn': 'Any card: all seven are unknown, so the choice is pure theatre',
    'vn.hintRaise': 'RAISE {n}× — now HIGH {h}% · LOW {l}% · both {b}%',
    'vn.hintCheck': 'CHECK — now HIGH {h}% · LOW {l}% · both {b}%',
    'vn.hintSwap': 'Swap the {card} (fee {fee}): worth {gain} more on average',
    'vn.hintKeep': 'Keep your hand: no swap is worth its fee (a face-down swap never changes your odds)',
    'vn.hintSide': '{side} — {w}% to win it · {s}% to scoop',
    'vn.hintBoth': 'BOTH — {s}% to win both sides',
    'vn.hintFold': 'FOLD — HIGH {h}% · LOW {l}% · both {b}%',
    'vn.ptScoop': 'Scoop · HIGH or LOW',
    'vn.ptSplit': 'Split pot',
    'vn.ptPush': 'push',
    'vn.ptBoth': 'BOTH won',
    'vn.ptSwap': 'Swap ▲ / ▼',
    'vn.ptLow': 'LOW (A-5)',
    'vn.ptBest': 'best',
    'vn.ptPairs': 'Any pair',
    'vn.ptWorst': 'worst',
    'vn.rules': `
      <p>A hi-lo home game against the house. You and the dealer get <b>seven cards face down</b> and nobody looks at them.</p>
      <h4>Reveals</h4>
      <p>Five rounds: you click one of your cards to turn it up, then the dealer turns one of its own. In the end each hand has <b>five cards up and two down</b>; the two down cards stay unknown, even to their owner.</p>
      <h4>Betting</h4>
      <p>Bet the <b>Ante</b>. After the 2nd reveal you may <b>raise ${VN.raiseFirst}×</b> the Ante, after the 4th <b>raise ${VN.raiseSecond}×</b>; if you haven't raised, the declaration costs <b>1×</b> (or you <b>fold</b> and lose the Ante). One raise per hand: early raises cost more, but you still choose your side at the end.</p>
      <h4>Swap</h4>
      <p>Once, before declaring, you may swap one of your cards: <b>${VN.swapUp}× the Ante</b> for a face-up card (the new one comes face up) or <b>${VN.swapDown}×</b> for a face-down card (the new one stays face down). Fees go to the house. A face-down swap can't change your odds — it's for the superstitious.</p>
      <h4>Declaration</h4>
      <p>Choose <b>LOW</b>, <b>HIGH</b> or <b>BOTH</b>; your chips go into that box. HIGH is the best poker hand of your seven cards. LOW is <b>A-5 lowball</b>: the five lowest different ranks, aces low, straights and flushes don't count, the highest card decides first (7-5-4-2-A beats 7-6-3-2-A); any pair is worse than no pair. There is no qualifier.</p>
      <h4>Payouts — the pot is split, as at home</h4>
      <p>The dealer plays both ends. <b>HIGH or LOW</b>: lose your side and you lose. Win it while the dealer wins the other side and the pot is <b>split: push</b>. Win both sides (a <b>scoop</b>) and Ante and Play pay <b>1:1</b>. A tie on your side pushes.</p>
      <p><b>BOTH</b>: win both sides and Ante and Play pay <b>${VN.bothPays}:1</b>. Anything less — even a tie — loses everything.</p>
      <h4>Strategy</h4>
      <p>Declare the side you're surest not to lose; go BOTH when, having won your side, you'd also win the other more often than not. Raise early with a hand that can scoop, swap a face-up card that blocks a scoop, never swap a face-down one. The hint plays the best strategy found, which returns about <b>97%</b>.</p>`,
  },
  {
    'vn.ante': 'ANTE',
    'vn.play': 'PLAY',
    'vn.swap': 'TROCA',
    'vn.low': 'BAIXA',
    'vn.high': 'ALTA',
    'vn.both': 'AMBAS',
    'vn.lowSub': 'A-5 · a menor vence',
    'vn.highSub': 'melhor mão de pôquer',
    'vn.bothSub': 'vença os dois lados',
    'vn.print2': 'DECLARE ALTA · BAIXA · AMBAS',
    'vn.print3': 'SCOOP PAGA 1 PARA 1 · POTE DIVIDIDO DEVOLVE',
    'vn.print4': 'AMBAS PAGA 2 PARA 1 · MENOS QUE ISSO PERDE',
    'vn.needAnte': 'Aposte no ANTE',
    'vn.turn': 'Virar',
    'vn.turnToast': 'Clique numa das suas cartas para virá-la',
    'vn.raiseN': 'Aumentar {n}×',
    'vn.keep': 'Manter',
    'vn.swapBtn': 'Trocar',
    'vn.swapTag': 'TROCA',
    'vn.swapToast': 'Uma troca: clique numa carta e em Trocar (aberta {up} · fechada {down}) — ou Manter',
    'vn.swapPicked': '{card} · taxa {fee}',
    'vn.swapPickedDown': 'Carta fechada · taxa {fee}',
    'vn.declToast': 'Declare: as fichas vão para a caixa escolhida',
    'vn.up': 'ALTA {h} · BAIXA {l}',
    'vn.tagHigh': 'ALTA · {h}',
    'vn.tagLow': 'BAIXA · {l}',
    'vn.split': 'POTE DIVIDIDO',
    'vn.hintTurn': 'Qualquer uma: as sete são desconhecidas, a escolha é puro teatro',
    'vn.hintRaise': 'AUMENTAR {n}× — agora ALTA {h}% · BAIXA {l}% · ambas {b}%',
    'vn.hintCheck': 'PASSAR — agora ALTA {h}% · BAIXA {l}% · ambas {b}%',
    'vn.hintSwap': 'Troque o {card} (taxa {fee}): vale {gain} a mais em média',
    'vn.hintKeep': 'Mantenha a mão: nenhuma troca compensa a taxa (trocar carta fechada nunca muda suas chances)',
    'vn.hintSide': '{side} — {w}% de vencer · {s}% de scoop',
    'vn.hintBoth': 'AMBAS — {s}% de vencer os dois lados',
    'vn.hintFold': 'DESISTIR — ALTA {h}% · BAIXA {l}% · ambas {b}%',
    'vn.ptScoop': 'Scoop · ALTA ou BAIXA',
    'vn.ptSplit': 'Pote dividido',
    'vn.ptPush': 'devolve',
    'vn.ptBoth': 'AMBAS vencidas',
    'vn.ptSwap': 'Troca ▲ / ▼',
    'vn.ptLow': 'BAIXA (A-5)',
    'vn.ptBest': 'melhor',
    'vn.ptPairs': 'Qualquer par',
    'vn.ptWorst': 'pior',
    'vn.rules': `
      <p>Um jogo caseiro de alta e baixa contra a casa. Você e o dealer recebem <b>sete cartas fechadas</b> e ninguém olha.</p>
      <h4>Revelações</h4>
      <p>Cinco rodadas: você clica numa das suas cartas para virá-la, depois o dealer vira uma das dele. No fim cada mão tem <b>cinco cartas abertas e duas fechadas</b>; as duas fechadas continuam desconhecidas, até para o dono.</p>
      <h4>Apostas</h4>
      <p>Aposte o <b>Ante</b>. Depois da 2ª revelação você pode <b>aumentar ${VN.raiseFirst}×</b> o Ante, depois da 4ª <b>aumentar ${VN.raiseSecond}×</b>; se não aumentou, a declaração custa <b>1×</b> (ou você <b>desiste</b> e perde o Ante). Um aumento por mão: aumentar cedo custa mais, mas o lado só é escolhido no fim.</p>
      <h4>Troca</h4>
      <p>Uma vez, antes de declarar, você pode trocar uma carta sua: <b>${VN.swapUp}× o Ante</b> por uma carta aberta (a nova vem aberta) ou <b>${VN.swapDown}×</b> por uma fechada (a nova continua fechada). As taxas ficam com a casa. Trocar carta fechada não muda suas chances — é para os supersticiosos.</p>
      <h4>Declaração</h4>
      <p>Escolha <b>BAIXA</b>, <b>ALTA</b> ou <b>AMBAS</b>; suas fichas vão para essa caixa. ALTA é a melhor mão de pôquer das suas sete cartas. BAIXA é o <b>lowball A-5</b>: os cinco menores valores diferentes, Ás vale 1, sequências e flushes não contam, a carta mais alta decide primeiro (7-5-4-2-A vence 7-6-3-2-A); qualquer par é pior que nenhum par. Não há qualificação.</p>
      <h4>Pagamentos — o pote é dividido, como em casa</h4>
      <p>O dealer joga as duas pontas. <b>ALTA ou BAIXA</b>: perdeu o seu lado, perdeu. Venceu o seu lado e o dealer venceu o outro: <b>pote dividido, devolve</b>. Venceu os dois lados (<b>scoop</b>): Ante e Play pagam <b>1:1</b>. Empate no seu lado devolve.</p>
      <p><b>AMBAS</b>: vença os dois lados e Ante e Play pagam <b>${VN.bothPays}:1</b>. Qualquer coisa menos — até um empate — perde tudo.</p>
      <h4>Estratégia</h4>
      <p>Declare o lado que você tem menos chance de perder; vá de AMBAS quando, vencendo o seu lado, você também venceria o outro na maioria das vezes. Aumente cedo com mão que pode fazer scoop, troque uma carta aberta que atrapalha o scoop e nunca troque carta fechada. A dica joga a melhor estratégia encontrada, que devolve cerca de <b>97%</b>.</p>`,
  },
);

/** Screen rows (v, from the top of the portrait frame). */
const V = { dealer: 0.17, print: 0.345, player: 0.52, boxes: 0.645, spots: 0.76 };
const GAP = 0.67;
const BOX_W = 1.0;
const BOX_COLORS: Record<Decl, string> = { low: '#4f9dff', high: '#ff5050', both: '#e8c25a' };
const BOX_ORDER: Decl[] = ['low', 'both', 'high'];

/** A printed declaration box: rounded frame, faint fill, name and subtitle. */
function boxPrint(label: string, sub: string, color: string): HTMLCanvasElement {
  const { cv, g } = makeCanvas(512, 300);
  const r = 34;
  g.beginPath();
  g.roundRect(10, 10, 492, 280, r);
  g.fillStyle = color + '22';
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = color;
  g.globalAlpha = 0.9;
  g.stroke();
  g.beginPath();
  g.roundRect(26, 26, 460, 248, r - 12);
  g.lineWidth = 3;
  g.strokeStyle = GOLD;
  g.globalAlpha = 0.7;
  g.stroke();
  g.globalAlpha = 0.9;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.font = FONT.title(78);
  g.fillText(label, 256, 120);
  g.fillStyle = INK_SOFT;
  g.font = FONT.italic(40);
  g.fillText(sub, 256, 208);
  return cv;
}

/** Invisible buttons over cards on the felt (turning a card over). */
class CardClicks {
  private hits: HTMLButtonElement[] = [];
  private cards: Card3D[] = [];
  private tmp = new THREE.Vector3();
  constructor(private g: GameCtx) {}

  attach(cards: Card3D[], live: (i: number) => boolean, onClick: (i: number) => void) {
    this.detach();
    this.cards = cards;
    cards.forEach((_, i) => {
      const b = document.createElement('button');
      b.className = 'card-hit live';
      b.setAttribute('aria-label', `Card ${i + 1}`);
      b.style.cursor = 'pointer';
      b.style.display = live(i) ? 'block' : 'none';
      b.onclick = () => {
        if (live(i)) onClick(i);
      };
      // the card lifts a hair under the pointer, like a finger about to turn it
      const obj = cards[i].obj;
      b.onmouseenter = () => gsap.to(obj.position, { y: REST_Y + 0.035, duration: 0.16, ease: 'power2.out' });
      b.onmouseleave = () => gsap.to(obj.position, { y: REST_Y, duration: 0.18, ease: 'power2.inOut' });
      this.g.hud.labels.appendChild(b);
      this.hits.push(b);
    });
  }

  detach() {
    this.hits.forEach((b) => b.remove());
    for (const c of this.cards) {
      gsap.killTweensOf(c.obj.position);
      c.obj.position.y = REST_Y;
    }
    this.hits = [];
    this.cards = [];
  }

  sync() {
    const { stage } = this.g;
    this.cards.forEach((c, i) => {
      const p = c.obj.position;
      const a = stage.toScreen(this.tmp.set(p.x - CARD_W / 2, 0, p.z - CARD_H / 2));
      const z = stage.toScreen(this.tmp.set(p.x + CARD_W / 2, 0, p.z + CARD_H / 2));
      const b = this.hits[i];
      b.style.width = `${Math.max(14, z.x - a.x)}px`;
      b.style.height = `${z.y - a.y}px`;
      b.style.transform = `translate(${a.x}px, ${a.y}px)`;
    });
  }
}

type Stage = 'turn' | 'raise' | 'swap' | 'declare' | null;

export class VanunuView extends TableGame {
  readonly id = 'vanunu';
  readonly title = 'Vanunu';
  /** Own felt once 'vanunu' is in FELTS (until then Texas Hold'em Bonus's teal felt). */
  protected readonly felt = 'vanunu' as const;
  /** Cards dealt first in the next round (testing from the console): p0 d0 p1 d1 … then swaps. */
  rig: Card[] | null = null;
  private clicks: CardClicks;
  private picker: CardPicker;
  private boxes = new Map<Decl, THREE.Mesh>();
  private lit: Decl | null = null;
  private offer = false;
  private t0 = performance.now();
  private stageNow: Stage = null;
  private raiseSize = 0;
  private pCards: Card[] = [];
  private dCards: Card[] = [];
  private p3: Card3D[] = [];
  private d3: Card3D[] = [];
  private pUp: boolean[] = [];
  private dUp: boolean[] = [];
  private pPl: Place[] = [];
  private dPl: Place[] = [];
  private dead: Card[] = [];
  private play = 0;
  private ante = 0;
  private z = { p: 0, d: 0 };
  private declOdds: Odds | null = null;
  private firstTurn = true;
  private picking = false;

  constructor(g: GameCtx) {
    super(g, VN.decks);
    this.clicks = new CardClicks(g);
    this.picker = new CardPicker(g, 1, t('vn.swapTag'), () => this.onPick());
  }

  rules() {
    return t('vn.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'ante', label: t('vn.ante'), u: 0.29, v: V.spots, size: 0.6, max: VN.maxAnte },
      { id: 'play', label: t('vn.play'), sub: `${VN.raiseFirst}× · ${VN.raiseSecond}× · ${VN.play1}×`, u: 0.5, v: V.spots, size: 0.6, auto: true },
      { id: 'swap', label: t('vn.swap'), sub: `${VN.swapUp}× · ${VN.swapDown}×`, u: 0.71, v: V.spots, size: 0.52, auto: true },
      { id: 'low', label: t('vn.low'), u: 0.16, v: V.boxes, ring: false, auto: true },
      { id: 'both', label: t('vn.both'), u: 0.5, v: V.boxes, ring: false, auto: true },
      { id: 'high', label: t('vn.high'), u: 0.84, v: V.boxes, ring: false, auto: true },
    ];
  }

  protected defaultBets() {
    return { ante: 25 };
  }

  protected decorate() {
    const { table, hud } = this.g;
    table.addDecal(
      tablePrint(
        [
          { text: t('vn.print1'), y: 76, R: 1100, font: FONT.title(66), spacing: 10 },
          { text: t('vn.print2'), y: 128, R: 1100, font: FONT.title(30), color: GOLD, spacing: 5 },
          { text: t('vn.print3'), y: 192, R: 1100, font: FONT.bold(30), color: INK_SOFT, spacing: 2 },
          { text: t('vn.print4'), y: 232, R: 1100, font: FONT.bold(30), color: INK_SOFT, spacing: 2 },
        ],
        262,
        [{ y: 150, R: 1100, half: 0.3 }],
      ),
      0.5,
      V.print,
      2.7,
    );
    this.boxes.clear();
    for (const d of BOX_ORDER) {
      const s = this.spots.get(d);
      const m = table.addDecalAt(boxPrint(t(`vn.${d}`), t(`vn.${d}Sub`), BOX_COLORS[d]), s.pos.x, s.pos.z, BOX_W);
      this.boxes.set(d, m);
    }
    this.paytable = new Paytable(
      hud.root,
      '',
      [
        [t('vn.ptScoop'), `${VN.scoopPays}:1`],
        [t('vn.ptSplit'), t('vn.ptPush')],
        [t('vn.ptBoth'), `${VN.bothPays}:1`],
        [t('vn.ptSwap'), `${VN.swapUp}× / ${VN.swapDown}×`],
        [t('vn.ptLow'), ''],
        ['5-4-3-2-A', t('vn.ptBest')],
        ['6-4-3-2-A', '·'],
        ['7-5-4-2-A', '·'],
        ['8-6-5-3-2', '·'],
        [t('vn.ptPairs'), t('vn.ptWorst')],
      ],
      { head: ['VANUNU', ''] },
    );
  }

  protected cleanup() {
    this.clicks.detach();
    this.picker.detach();
    this.boxes.clear();
    this.lit = null;
    this.offer = false;
    this.stageNow = null;
  }

  protected onSync() {
    this.clicks.sync();
    this.picker.sync();
    const pulse = 0.5 + 0.5 * Math.sin((performance.now() - this.t0) / 240);
    for (const [d, m] of this.boxes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      const c = new THREE.Color(BOX_COLORS[d]);
      const k = this.lit === d ? 0.55 + 0.35 * pulse : this.offer ? 0.12 + 0.12 * pulse : 0;
      mat.emissive.setRGB(c.r * k, c.g * k, c.b * k);
    }
  }

  protected validate() {
    const a = this.spots.amounts().ante ?? 0;
    if (a < VN.minAnte) return t('vn.needAnte');
    if (!this.g.wallet.canAfford(a * (1 + VN.raiseFirst))) return t('toast.noFunds');
    return '';
  }

  // ---------------------------------------------------------------- hints
  private position(): Position {
    return {
      pUp: this.pCards.filter((_, i) => this.pUp[i]),
      dUp: this.dCards.filter((_, i) => this.dUp[i]),
      dead: this.dead.slice(),
    };
  }

  protected advice() {
    const s = this.stageNow;
    if (!s) return null;
    if (s === 'turn') return { id: 'turn', msg: t('vn.hintTurn') };
    if (s === 'raise') {
      const r = raiseAdvice(this.position(), this.raiseSize === VN.raiseFirst, cryptoRng, 2500);
      const vals = { n: this.raiseSize, h: pct(r.odds.hw), l: pct(r.odds.lw), b: pct(r.odds.both) };
      return r.raise ? { id: `raise${this.raiseSize}`, msg: t('vn.hintRaise', vals) } : { id: 'check', msg: t('vn.hintCheck', vals) };
    }
    if (s === 'swap') {
      const pos = this.position();
      const a = swapAdvice(pos, this.play / this.ante, cryptoRng, 90);
      if (a.index < 0) {
        this.picker.set([]);
        return { id: 'keep', msg: t('vn.hintKeep') };
      }
      const card = pos.pUp[a.index];
      const slot = this.pCards.indexOf(card);
      this.picker.set([slot]);
      const fee = swapFee(this.ante, true);
      return { id: 'swapgo', msg: t('vn.hintSwap', { card: cardLabel(card), fee: this.moneyStr(fee), gain: this.moneyStr(Math.round((a.options[a.index] - a.keep) * this.ante)) }) };
    }
    const o = this.declOdds ?? (this.declOdds = exactOdds(this.position().pUp, this.position().dUp, this.dead));
    const d = declareFromOdds(o, this.play / this.ante);
    if (d.decl === 'fold') return { id: 'fold', msg: t('vn.hintFold', { h: pct(o.hw), l: pct(o.lw), b: pct(o.both) }) };
    if (d.decl === 'both') return { id: 'both', msg: t('vn.hintBoth', { s: pct(o.both) }) };
    const w = d.decl === 'high' ? o.hw : o.lw;
    return { id: d.decl, msg: t('vn.hintSide', { side: t(`vn.${d.decl}`), w: pct(w), s: pct(o.both) }) };
  }

  // ---------------------------------------------------------------- round
  protected async playRound() {
    const { stage, wallet, sfx } = this.g;
    this.paytable?.show(true);
    const bets = this.spots.amounts();
    this.ante = bets.ante;
    this.play = 0;
    this.dead = [];
    this.declOdds = null;
    this.lit = null;
    const zOf = (v: number) => stage.screenToTable(0.5, v).z;
    this.z = { p: zOf(V.player), d: zOf(V.dealer) };
    this.pPl = row(0, this.z.p, 7, GAP, 0);
    this.dPl = row(0, this.z.d, 7, GAP, 0);
    const rig = this.rig ?? [];
    this.rig = null;
    const draw = () => (rig.length ? rig.shift()! : this.shoe.draw());
    this.pCards = [];
    this.dCards = [];
    this.p3 = [];
    this.d3 = [];
    this.pUp = new Array(7).fill(false);
    this.dUp = new Array(7).fill(false);

    // seven cards face down each; their faces are only set when they turn over
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 7; i++) {
      this.pCards.push(draw());
      this.dCards.push(draw());
      jobs.push(this.cardsT.deal(null, this.pPl[i], false, { dur: 0.42 }).then((c) => (this.p3[i] = c)));
      await wait(0.1);
      jobs.push(this.cardsT.deal(null, this.dPl[i], false, { dur: 0.42 }).then((c) => (this.d3[i] = c)));
      await wait(0.1);
    }
    await Promise.all(jobs);
    await wait(0.25);

    for (let r = 1; r <= VN.reveals; r++) {
      await this.playerTurn();
      await wait(0.25);
      await this.dealerTurn();
      this.showUpTags();
      await wait(0.2);
      if (!this.play && (r === 2 || r === 4)) {
        const size = r === 2 ? VN.raiseFirst : VN.raiseSecond;
        this.stageNow = 'raise';
        this.raiseSize = size;
        const pick = await this.choose([
          { id: 'check', label: t('btn.check'), color: 'blue', icon: 'knock' },
          { id: `raise${size}`, label: t('vn.raiseN', { n: size }), color: 'green', text: `${size}×`, enabled: wallet.canAfford(this.ante * size) },
        ]);
        this.stageNow = null;
        if (pick !== 'check') {
          this.play = this.ante * size;
          await this.place('play', this.play);
        }
      }
    }

    // the swap: once, optional, paid
    await this.swapPhase(draw);

    // the declaration
    const decl = await this.declare();
    const folded = decl === 'fold';
    if (folded) {
      sfx.play('shove', { vol: 0.6 });
      for (let i = 0; i < 7; i++) if (this.pUp[i]) this.cardsT.flip(this.p3[i], 0.4);
      await wait(0.5);
      const res = settleVanunu(this.pCards, this.dCards, 'fold', { ante: this.ante, play: 0, swap: this.spots.get('swap').amount });
      this.clearTags();
      await this.settle({ ante: res.ret.ante, play: 0, swap: 0 }, { folded: true });
      return;
    }

    await this.showdown(decl);
  }

  /** The player turns one of their face-down cards (click on it, or the Turn key for the first one). */
  private async playerTurn() {
    this.stageNow = 'turn';
    if (this.firstTurn) {
      this.firstTurn = false;
      this.g.hud.toast(t('vn.turnToast'), 2200);
    }
    const i = await new Promise<number>((res) => {
      const done = (k: number) => {
        this.clicks.detach();
        this.g.hud.highlight(null);
        this.actions(null);
        res(k);
      };
      this.clicks.attach(this.p3, (k) => !this.pUp[k], (k) => {
        this.g.sfx.click();
        done(k);
      });
      const spec: BtnSpec = {
        id: 'turn',
        label: t('vn.turn'),
        color: 'green',
        icon: 'eye',
        onClick: () => {
          this.g.sfx.click();
          done(this.pUp.findIndex((u) => !u));
        },
      };
      this.actions([spec]);
    });
    this.stageNow = null;
    this.pUp[i] = true;
    this.p3[i].setCard(this.pCards[i]);
    await this.cardsT.flip(this.p3[i], 0.5);
  }

  /** The dealer turns one of its face-down cards, chosen at random. */
  private async dealerTurn() {
    const down = this.dUp.map((u, i) => (u ? -1 : i)).filter((i) => i >= 0);
    const i = down[cryptoRng(down.length)];
    this.dUp[i] = true;
    this.d3[i].setCard(this.dCards[i]);
    await this.cardsT.flip(this.d3[i], 0.5);
  }

  /** "HIGH pair of 7s · LOW 8-5-3-A" for both rows, from the face-up cards only. */
  private showUpTags() {
    this.clearTags();
    const tagFor = (cards: Card[], up: boolean[], z: number, cls: string) => {
      const shown = cards.filter((_, i) => up[i]);
      if (!shown.length) return;
      const u = upLabel(shown);
      this.tag(t('vn.up', { h: u.high, l: u.low || t('vn.noLow') }), cls, 0, z);
    };
    tagFor(this.dCards, this.dUp, this.z.d + 0.58, 'dealer');
    tagFor(this.pCards, this.pUp, this.z.p - 0.6, '');
  }

  private onPick() {
    if (!this.picking) return;
    const b = this.g.hud.root.querySelector<HTMLButtonElement>('.vbtn[data-id="swapgo"]');
    const i = [...this.picker.sel][0];
    if (b) b.disabled = i === undefined || !this.g.wallet.canAfford(swapFee(this.ante, this.pUp[i]));
    if (i !== undefined) {
      const fee = this.moneyStr(swapFee(this.ante, this.pUp[i]));
      this.g.hud.toast(this.pUp[i] ? t('vn.swapPicked', { card: cardLabel(this.pCards[i]), fee }) : t('vn.swapPickedDown', { fee }), 1400);
    }
  }

  private async swapPhase(draw: () => Card) {
    const { hud, sfx, table, cards } = this.g;
    if (!this.g.wallet.canAfford(swapFee(this.ante, true))) return;
    this.stageNow = 'swap';
    hud.toast(t('vn.swapToast', { up: this.moneyStr(swapFee(this.ante, true)), down: this.moneyStr(swapFee(this.ante, false)) }), 2600);
    this.picker.attach(this.p3, 1);
    this.picking = true;
    const go = this.choose([
      { id: 'keep', label: t('vn.keep'), color: 'blue', icon: 'check' },
      { id: 'swapgo', label: t('vn.swapBtn'), color: 'gold', icon: 'swap', enabled: false },
    ]);
    this.onPick();
    const pick = await go;
    const i = [...this.picker.sel][0];
    // the lifted card settles back into the row before it goes (or stays)
    this.picking = false;
    this.picker.set([]);
    this.picker.detach();
    this.stageNow = null;
    if (pick !== 'swapgo' || i === undefined) return;
    const faceUp = this.pUp[i];
    const fee = swapFee(this.ante, faceUp);
    if (!this.g.wallet.canAfford(fee)) return;
    await this.place('swap', fee);
    sfx.play('chip', { vol: 0.6 });
    // the old card goes to the discard tray (a face-up one is seen by everyone)
    const old = this.p3[i];
    const k = this.cardsT.all.indexOf(old);
    if (k >= 0) this.cardsT.all.splice(k, 1);
    if (faceUp) this.dead.push(this.pCards[i]);
    sfx.play('slide', { vol: 0.7 });
    await collectCards([old], table.trayTop(), table.trayYaw, (c) => cards.destroy(c));
    const nc = draw();
    this.pCards[i] = nc;
    this.p3[i] = await this.cardsT.deal(faceUp ? nc : null, this.pPl[i], faceUp, { dur: 0.5 });
    if (faceUp) this.showUpTags();
    await wait(0.2);
  }

  private async declare(): Promise<Decl | 'fold'> {
    const { hud, wallet, sfx } = this.g;
    this.stageNow = 'declare';
    this.offer = true;
    hud.toast(t('vn.declToast'), 1800);
    const raised = this.play > 0;
    const can = raised || wallet.canAfford(this.ante * VN.play1);
    const specs: Omit<BtnSpec, 'onClick'>[] = [];
    if (!raised) specs.push({ id: 'fold', label: t('btn.fold'), color: 'dark', icon: 'fold' });
    specs.push(
      { id: 'low', label: t('vn.low'), color: 'blue', icon: 'hit', enabled: can },
      { id: 'both', label: t('vn.both'), color: 'gold', icon: 'crown', enabled: can },
      { id: 'high', label: t('vn.high'), color: 'red', icon: 'raise', enabled: can },
    );
    const pick = (await this.choose(specs)) as Decl | 'fold';
    this.stageNow = null;
    this.offer = false;
    if (pick === 'fold') return pick;
    if (!raised) {
      this.play = this.ante * VN.play1;
      await this.place('play', this.play);
    }
    // the sealed choice: the stake slides into the box, which lights up
    this.lit = pick;
    sfx.play('chips', { vol: 0.7 });
    const box = this.spots.get(pick);
    const from = ['ante', 'play'].map((id) => this.spots.get(id));
    await Promise.all(
      from.map((s, k) =>
        slideChips(s.pile.group, new THREE.Vector3(box.pos.x + (k ? 0.12 : -0.12), 0, box.pos.z), 0.55, 0.14, 'power2.inOut', k * 0.08),
      ),
    );
    const total = from.reduce((n, s) => n + s.amount, 0);
    for (const s of from) {
      s.pile.clear();
      s.pile.group.position.copy(s.pos);
    }
    box.pile.set(total);
    sfx.play('stack', { vol: 0.8 });
    this.g.fx.glow(new THREE.Vector3(box.pos.x, 0, box.pos.z), BOX_W * 1.2, BOX_W * 0.75, 1.4, BOX_COLORS[pick]);
    return pick;
  }

  private async showdown(decl: Decl) {
    const { sfx, fx } = this.g;
    this.clearTags();
    await wait(0.3);
    // the player's two unknown cards
    for (let i = 0; i < 7; i++) {
      if (this.pUp[i]) continue;
      this.p3[i].setCard(this.pCards[i]);
      await this.cardsT.flip(this.p3[i], 0.5);
      this.pUp[i] = true;
      await wait(0.1);
    }
    await wait(0.35);
    // the dealer's: a peek, then a slow squeeze
    for (let i = 0; i < 7; i++) {
      if (this.dUp[i]) continue;
      const c = this.d3[i];
      await peekCard(c);
      c.setCard(this.dCards[i]);
      sfx.play('fan', { vol: 0.4 });
      await squeezeCard(c, () => sfx.play('place', { vol: 0.6 }));
      this.dUp[i] = true;
      await wait(0.2);
    }
    await wait(0.3);
    const res = settleVanunu(this.pCards, this.dCards, decl, { ante: this.ante, play: this.play, swap: this.spots.get('swap').amount });
    const { sd } = res;
    // both evaluations of both hands
    const cls = (r: number, mine: boolean) => (r === 0 ? '' : (r > 0) === mine ? 'win' : mine ? 'lose' : 'dealer');
    const xH = -1.15;
    const xL = 1.15;
    this.tag(t('vn.tagHigh', { h: hand5Name(sd.ph) }), cls(sd.high, true), xH, this.z.p - 0.6);
    this.tag(t('vn.tagLow', { l: lowName(sd.pl) }), cls(sd.low, true), xL, this.z.p - 0.6);
    this.tag(t('vn.tagHigh', { h: hand5Name(sd.dh) }), cls(sd.high, false) || 'dealer', xH, this.z.d + 0.58);
    this.tag(t('vn.tagLow', { l: lowName(sd.dl) }), cls(sd.low, false) || 'dealer', xL, this.z.d + 0.58);
    // light each winning five: gold for HIGH, blue for LOW
    const five = (row3: Card3D[], cards: Card[], used: Card[]) => row3.filter((_, i) => used.includes(cards[i]));
    if (sd.high !== 0) {
      const mine = sd.high > 0;
      highlightCards(this.g, five(mine ? this.p3 : this.d3, mine ? this.pCards : this.dCards, mine ? sd.ph.cards : sd.dh.cards), '#ffd27a');
    }
    await wait(0.45);
    if (sd.low !== 0) {
      const mine = sd.low > 0;
      highlightCards(this.g, five(mine ? this.p3 : this.d3, mine ? this.pCards : this.dCards, mine ? sd.pl.cards : sd.dl.cards), '#8fc3ff');
    }
    await wait(0.5);
    const ret: Record<string, number> = { [decl]: res.ret.ante + res.ret.play, swap: 0 };
    let big: string | undefined;
    if (res.outcome === 'bothWin') {
      big = t('vn.scoop');
      const at = new THREE.Vector3(0, 0.3, this.z.p);
      fx.burst(at, 220, '#ffd36b', 2.4, 2.2);
      fx.burst(at, 120, '#9fd0ff', 1.8, 1.8);
      fx.glow(new THREE.Vector3(0, 0, this.z.p), 4.8, 1.2, 2.2, '#ffd27a');
      sfx.bell();
    } else if (res.outcome === 'scoop') {
      fx.burst(new THREE.Vector3(0, 0.3, this.z.p), 110);
      sfx.coins(10);
    } else if (res.outcome === 'split' || res.outcome === 'push') {
      this.tag(t('vn.split'), '', 0, (this.z.p + this.z.d) / 2);
    }
    await this.settle(ret, { big });
    this.lit = null;
  }
}
