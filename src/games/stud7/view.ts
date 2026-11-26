import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { rankLabel, type Card } from '../../core/cards';
import { bestOf, Cat5, type Hand5 } from '../../core/eval5';
import { slideChips, wait, type Place } from '../../table/anim';
import { REST_Y, type Card3D } from '../../table/cardMesh';
import { ChipPile } from '../../table/chips';
import { FONT, GOLD, INK_SOFT, makeCanvas, tablePrint } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import { hand5Name } from '../caribbean/view';
import { finishXP, highlightCards, resultBanner, type BetSpots, type Spot, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import {
  blindPays,
  bonusPays,
  bookDecision,
  DEAL_STREETS,
  DECISION_AFTER,
  handScore,
  isDown,
  MULT,
  S7,
  scoreCat,
  settleStud,
  StudDeal,
  type DealCard,
  type Move,
  type Street,
} from './rules';

addStrings(
  {
    's7.ante': 'ANTE',
    's7.blind': 'BLIND',
    's7.raise': 'RAISE',
    's7.bonus': 'BONUS',
    's7.print1': 'SEVEN-CARD STUD',
    's7.print2': 'Dealer needs a pair to open',
    's7.print3': 'RAISE 4× · 2× · 2× · 1×',
    's7.hole': 'DOWN',
    's7.needAnte': 'Bet the ANTE (the BLIND matches it)',
    's7.noQualify': 'DEALER DOES NOT OPEN',
    's7.raise4': 'Raise 4×',
    's7.raise2': 'Raise 2×',
    's7.hintRaise': 'Strategy: RAISE {m}',
    's7.hintCheck': 'Strategy: CHECK',
    's7.hintBet': 'Strategy: BET 1×',
    's7.hintFold': 'Strategy: FOLD',
    's7.odds': 'you win {w}%, lose {l}%',
    's7.tagline': 'Stud against the dealer · Raise early, win more',
    's7.rules': `
      <p>Seven-Card Stud against the dealer. Bet the <b>Ante</b> — the <b>Blind</b> matches it automatically — and, if you like, the <b>Stud Bonus</b>. You and the dealer each get seven cards the stud way: two down and one up, three more up, the last one down. You always see your own down cards and the dealer's up cards.</p>
      <h4>One raise per hand</h4>
      <p>After 3rd street (three cards each): check or <b>raise 4×</b> the Ante. After 4th and after 5th street: check or <b>raise 2×</b>. After 7th street: <b>bet 1×</b> or fold. Once you raise, the rest of the cards are dealt and you just watch.</p>
      <h4>Showdown</h4>
      <p>Best five cards of your seven against the dealer's best five. The dealer needs a <b>pair</b> to open: if not, the Ante pushes. A winning hand pays the Raise 1:1, the Ante 1:1 and the Blind by the table (Royal 500 · Straight flush 50 · Quads 10 · Full house 3 · Flush 3:2 · Straight 1; smaller hands push the Blind). A tie pushes. If the dealer wins you lose the Raise and the Blind, and the Ante when the dealer opens. Folding loses the Ante and the Blind.</p>
      <h4>Stud Bonus</h4>
      <p>Pays on your own seven cards, even if you fold: Royal 50 · Straight flush 40 · Quads 30 · Full house 8 · Flush 7 · Straight 4 · Trips 3.</p>
      <h4>Hint</h4>
      <p>The light bulb works out your chances against the cards you can see. It raises 4× when you win at least 13 points more often than you lose, 2× on 5th street at 10 points (4th street needs 45), and at the end it bets whenever betting costs less than folding. Return with this play ≈ 97.5% of the Ante.</p>`,
  },
  {
    's7.raise': 'AUMENTO',
    's7.print1': 'STUD DE SETE CARTAS',
    's7.print2': 'Dealer precisa de um par para abrir',
    's7.print3': 'AUMENTE 4× · 2× · 2× · 1×',
    's7.hole': 'FECHADA',
    's7.needAnte': 'Aposte no ANTE (o BLIND acompanha)',
    's7.noQualify': 'DEALER NÃO ABRE',
    's7.raise4': 'Aumentar 4×',
    's7.raise2': 'Aumentar 2×',
    's7.hintRaise': 'Estratégia: AUMENTAR {m}',
    's7.hintCheck': 'Estratégia: PASSAR',
    's7.hintBet': 'Estratégia: APOSTAR 1×',
    's7.hintFold': 'Estratégia: DESISTIR',
    's7.odds': 'você ganha {w}%, perde {l}%',
    's7.tagline': 'Stud contra o dealer · Aumente cedo, ganhe mais',
    's7.rules': `
      <p>Stud de sete cartas contra o dealer. Aposte no <b>Ante</b> — o <b>Blind</b> acompanha automaticamente — e, se quiser, no <b>Stud Bonus</b>. Você e o dealer recebem sete cartas como no stud: duas fechadas e uma aberta, mais três abertas e a última fechada. Você sempre vê as suas cartas fechadas e as cartas abertas do dealer.</p>
      <h4>Um aumento por mão</h4>
      <p>Depois da 3ª rua (três cartas cada): passe ou <b>aumente 4×</b> o Ante. Depois da 4ª e da 5ª rua: passe ou <b>aumente 2×</b>. Depois da 7ª rua: <b>aposte 1×</b> ou desista. Depois de aumentar, o resto das cartas é distribuído e é só assistir.</p>
      <h4>Showdown</h4>
      <p>Melhores cinco cartas entre as suas sete contra as melhores cinco do dealer. O dealer precisa de um <b>par</b> para abrir: se não abrir, o Ante empata. Mão vencedora paga o Aumento 1:1, o Ante 1:1 e o Blind pela tabela (Royal 500 · Straight flush 50 · Quadra 10 · Full house 3 · Flush 3:2 · Sequência 1; mãos menores empatam o Blind). Empate devolve tudo. Se o dealer vencer, você perde o Aumento e o Blind, e o Ante quando o dealer abre. Desistir perde o Ante e o Blind.</p>
      <h4>Stud Bonus</h4>
      <p>Paga pelas suas sete cartas, mesmo se você desistir: Royal 50 · Straight flush 40 · Quadra 30 · Full house 8 · Flush 7 · Sequência 4 · Trinca 3.</p>
      <h4>Dica</h4>
      <p>A lâmpada calcula as suas chances contra as cartas que você vê. Ela aumenta 4× quando você ganha pelo menos 13 pontos a mais do que perde, 2× na 5ª rua com 10 pontos (a 4ª rua pede 45) e no final aposta sempre que apostar custa menos que desistir. Retorno com esse jogo ≈ 97,5% do Ante.</p>`,
  },
);

/** Vertical anchors in the portrait layout frame. */
const V = { dealer: 0.2, print: 0.365, player: 0.515, rings: 0.79 };
/** Card pitch along a row, and how far the down cards are tucked out of line. */
export const PITCH = 0.67;
export const TUCK = 0.13;
/** Tint of the player's own down cards (face up for them only). */
export const DOWN_TINT = '#d6deee';

/** Name of a hand of any size: a full hand by eval5, fewer than five cards by their pairs. */
export function studHandName(cards: readonly Card[]): string {
  if (cards.length >= 5) return hand5Name(bestOf([...cards]));
  const s = handScore(cards);
  const cat = scoreCat(s);
  const r0 = Math.floor(s / 15 ** 4) % 15;
  const r1 = Math.floor(s / 15 ** 3) % 15;
  if (cat === Cat5.High) return `${rankLabel(r0)}-${rankLabel(r1)} ${t('hand.high').toLowerCase()}`;
  return hand5Name({ cat, ranks: [r0, r1], score: s, cards: [] });
}

/** The hint text of a decision. */
export function adviceText(move: Move, odds: { win: number; lose: number }): string {
  const head =
    move === 'raise4' || move === 'raise2'
      ? t('s7.hintRaise', { m: `${MULT[move]}×` })
      : move === 'bet1'
        ? t('s7.hintBet')
        : move === 'fold'
          ? t('s7.hintFold')
          : t('s7.hintCheck');
  return `${head} — ${t('s7.odds', { w: Math.round(odds.win * 100), l: Math.round(odds.lose * 100) })}`;
}

/** The action buttons of a decision. */
export function studButtons(st: Street, can: (mult: number) => boolean) {
  if (st === 'river')
    return [
      { id: 'fold', label: t('btn.fold'), color: 'red' as const, icon: 'fold' as const },
      { id: 'bet1', label: t('btn.bet1'), color: 'green' as const, text: '1×', enabled: can(1) },
    ];
  const m = st === 'third' ? 4 : 2;
  return [
    { id: 'check', label: t('btn.check'), color: 'blue' as const, icon: 'knock' as const },
    { id: m === 4 ? 'raise4' : 'raise2', label: t(m === 4 ? 's7.raise4' : 's7.raise2'), color: 'green' as const, text: `${m}×`, enabled: can(m) },
  ];
}

/**
 * TableGame.settle with the winnings landing next to each betting circle at `offset` (table units,
 * from the circle's centre) instead of beside it: the stud layouts keep their circles close together.
 */
export async function settleAt(
  g: GameCtx,
  spots: BetSpots,
  ret: Record<string, number>,
  opts: { big?: string; folded?: boolean; credited?: boolean },
  offset: (s: Spot) => THREE.Vector3,
): Promise<number> {
  const jobs: Promise<void>[] = [];
  let wager = 0;
  let back = 0;
  const top = g.stage.screenToTable(0.5, -0.08);
  for (const [id, s] of spots.spots) {
    const stake = s.amount;
    if (!stake) continue;
    wager += stake;
    const r = ret[id] ?? 0;
    back += r;
    if (r > stake) {
      const to = s.pos.clone().add(offset(s));
      const p = new ChipPile(g.chips, g.stage.table, new THREE.Vector3(to.x * 0.6, 0, top.z));
      p.set(r - stake);
      s.payouts.push(p);
      jobs.push(slideChips(p.group, to, 0.55, 0.15, 'power3.out').then(() => g.sfx.play('stack', { vol: 0.7 })));
    } else if (r < stake) jobs.push(spots.lose(id));
  }
  await Promise.all(jobs);
  if (!opts.credited) g.wallet.credit(back);
  const net = back - wager;
  const banner = resultBanner(g, net, wager, opts);
  await finishXP(g, wager, net, banner);
  return net;
}

/** "DOWN" marks printed on the felt under the down places of a row. */
function holePrint(label: string): HTMLCanvasElement {
  const w = 7 * PITCH;
  const ppu = 200;
  const { cv, g } = makeCanvas(Math.round(w * ppu), Math.round(0.24 * ppu));
  g.font = FONT.title(28);
  g.fillStyle = GOLD;
  g.globalAlpha = 0.75;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const i of [0, 1, 6]) g.fillText(label, (i + 0.5) * PITCH * ppu, 0.12 * ppu);
  return cv;
}

export class Stud7View extends TableGame {
  readonly id = 'stud7';
  readonly title = 'Seven-Card Stud';
  // falls back to a stock felt until the 'stud7' felt exists
  protected readonly felt = 'stud7' as const;
  private street: Street | null = null;
  private own: Card[] = [];
  private up: Card[] = [];

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('s7.rules');
  }

  protected spotDefs(): SpotDef[] {
    // the Ante first: it is the circle the chips go to by default
    return [
      { id: 'ante', label: t('s7.ante'), u: 0.385, v: V.rings, size: 0.6, max: S7.maxBet },
      { id: 'blind', label: t('s7.blind'), u: 0.615, v: V.rings, size: 0.6, mirror: 'ante' },
      { id: 'raise', label: t('s7.raise'), u: 0.845, v: V.rings, size: 0.6, auto: true },
      { id: 'bonus', label: t('s7.bonus'), u: 0.155, v: V.rings, size: 0.56, max: S7.maxBet },
    ];
  }

  protected defaultBets() {
    return { ante: 25, blind: 25 };
  }

  protected decorate() {
    const { table, hud, stage } = this.g;
    table.addDecal(
      tablePrint(
        [
          { text: t('s7.print1'), y: 80, R: 1400, font: FONT.title(56), spacing: 4 },
          { text: t('s7.print2'), y: 140, R: 1400, font: FONT.italic(42), color: INK_SOFT },
          { text: t('s7.print3'), y: 208, R: 1400, font: FONT.title(28), color: GOLD, spacing: 4 },
        ],
        236,
        [{ y: 172, R: 1400, half: 0.3 }],
      ),
      0.5,
      V.print,
      3.3,
    );
    const pz = stage.screenToTable(0.5, V.player).z;
    table.addDecalAt(holePrint(t('s7.hole')), 0, pz + TUCK + 0.6, 7 * PITCH);
    const cats = [Cat5.Royal, Cat5.StraightFlush, Cat5.Quads, Cat5.FullHouse, Cat5.Flush, Cat5.Straight, Cat5.Trips];
    const fmt = (n: number) => (n === 0 ? '—' : n === 1.5 ? '3:2' : `${n}:1`);
    this.paytable = new Paytable(
      hud.root,
      '',
      cats.map((c) => [hand5Name({ cat: c, ranks: [14], score: 0, cards: [] }), fmt(blindPays(c)), fmt(bonusPays(c))]),
      { head: ['', t('s7.blind'), t('s7.bonus')] },
    );
  }

  protected validate() {
    if ((this.spots.amounts().ante ?? 0) < S7.minBet) return t('s7.needAnte');
    return '';
  }

  protected advice() {
    if (!this.street) return null;
    const d = bookDecision(this.street, this.own, this.up);
    return { id: d.move, msg: adviceText(d.move, d.odds) };
  }

  /** Winnings land just above each circle (toward the dealer), clear of the next one. */
  protected settle(ret: Record<string, number>, opts: { big?: string; folded?: boolean; credited?: boolean } = {}) {
    return settleAt(this.g, this.spots, ret, opts, () => new THREE.Vector3(0, 0, -0.5));
  }

  /** Place of card i of a row at depth z; the down cards are tucked out of line. */
  private slot(i: number, z: number, dealer: boolean): Place {
    const tuck = isDown(i) ? (dealer ? -TUCK : TUCK) : 0;
    return {
      pos: new THREE.Vector3((i - 3) * PITCH, REST_Y + i * 0.0035, z + tuck),
      yaw: (((i * 37) % 7) - 3) * 0.004,
    };
  }

  protected async playRound() {
    const { stage, wallet, sfx, fx } = this.g;
    const bets = this.spots.amounts();
    const dz = stage.screenToTable(0.5, V.dealer).z;
    const pz = stage.screenToTable(0.5, V.player).z;
    const deal = new StudDeal(() => this.shoe.draw(), 1);
    const mine: Card3D[] = [];
    const his: Card3D[] = [];
    const ante = bets.ante;
    const can = (k: number) => wallet.canAfford(ante * k);
    let raise = 0;
    let folded = false;

    const showTag = () => {
      this.clearTags();
      this.tag(studHandName(deal.hands[0]), '', 0, pz + TUCK + 0.86);
    };

    for (const s of DEAL_STREETS) {
      await this.dealStreet(deal.street(s), mine, his, dz, pz, s === 'third' ? 0.15 : 0.2);
      showTag();
      const st = DECISION_AFTER[s];
      if (!st || raise) {
        await wait(raise ? 0.2 : 0.1);
        continue;
      }
      this.own = deal.hands[0];
      this.up = deal.dealerUp;
      this.street = st;
      const pick = (await this.choose(studButtons(st, can))) as Move;
      this.street = null;
      if (pick === 'fold') {
        folded = true;
        sfx.play('shove', { vol: 0.6 });
        for (const c of mine) this.cardsT.flip(c, 0.4);
        await wait(0.45);
      } else if (pick !== 'check') {
        raise = ante * MULT[pick];
        await this.place('raise', raise);
      }
    }

    // the dealer turns the down cards over
    await wait(0.25);
    for (const i of [0, 1, 6]) {
      this.cardsT.flip(his[i], 0.45);
      await wait(0.16);
    }
    await wait(0.4);
    const res = settleStud(deal.hands[0], deal.dealer, { ante, blind: bets.blind, bonus: bets.bonus }, raise, folded);
    this.clearTags();
    const won = !folded && res.cmp > 0;
    const lost = !folded && res.cmp < 0;
    this.tag(res.qualifies ? hand5Name(res.dealer) : `${t('s7.noQualify')} · ${hand5Name(res.dealer)}`, lost ? 'dealer win' : 'dealer', 0, dz + TUCK + 0.62);
    this.tag(hand5Name(res.player), won ? 'win' : lost || folded ? 'lose' : '', 0, pz + TUCK + 0.86);
    // the winning five light up (a mucked hand stays down, even when its Bonus pays)
    const tie = !folded && res.cmp === 0;
    this.highlightFive(res.player, res.dealer, mine, his, won || tie || (!folded && res.ret.bonus > 0), lost || tie);
    if (won || res.ret.bonus > 0) fx.burst(new THREE.Vector3(0, 0.3, pz), res.player.cat >= Cat5.Straight ? 150 : 70);
    const big = (won || res.ret.bonus > 0) && res.player.cat >= Cat5.Straight ? hand5Name(res.player).toUpperCase() : undefined;
    await this.settle({ ante: res.ret.ante, blind: res.ret.blind, raise: res.ret.raise, bonus: res.ret.bonus }, { big, folded });
  }

  private highlightFive(player: Hand5, dealer: Hand5, mine: Card3D[], his: Card3D[], me: boolean, house: boolean) {
    if (me) {
      const used = new Set(player.cards);
      highlightCards(this.g, mine.filter((c) => used.has(c.card!)));
    }
    if (house) {
      const used = new Set(dealer.cards);
      highlightCards(this.g, his.filter((c) => used.has(c.card!)), '#9fc4ff');
    }
  }

  /** Deals a street card by card; the player's own down cards are turned up for them and tinted. */
  private async dealStreet(evs: DealCard[], mine: Card3D[], his: Card3D[], dz: number, pz: number, gap: number) {
    const jobs: Promise<unknown>[] = [];
    const peek: number[] = [];
    for (const e of evs) {
      const dealer = e.seat < 0;
      const to = this.slot(e.i, dealer ? dz : pz, dealer);
      jobs.push(
        this.cardsT.deal(e.card, to, e.up, { dur: 0.42 }).then((c) => {
          (dealer ? his : mine)[e.i] = c;
        }),
      );
      if (!dealer && !e.up) peek.push(e.i);
      await wait(gap);
    }
    await Promise.all(jobs);
    for (const i of peek) {
      const c = mine[i];
      (c.front.material as THREE.MeshStandardMaterial).color.set(DOWN_TINT);
      this.cardsT.flip(c, 0.42);
      await wait(0.1);
    }
    if (peek.length) await wait(0.38);
  }
}
