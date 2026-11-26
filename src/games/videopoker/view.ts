import * as THREE from 'three';
import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import { cardLabel, Shoe, type Card } from '../../core/cards';
import { eval5, scoringMask } from '../../core/eval5';
import { money } from '../../core/wallet';
import { arcTo, wait, slideChips } from '../../table/anim';
import { CARD_H, type Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT, tablePrint } from '../../table/prints';
import { shuffleShow } from '../../table/shuffle';
import type { BtnSpec, Pin } from '../../ui/hud';
import { Paytable } from '../../ui/paytable';
import { CardTable, finishXP, highlightCards, row } from '../kit';
import { ChipPile } from '../../table/chips';
import { betRing } from '../../table/prints';
import type { GameCtx, GameView } from '../types';
import { holdAdvice, VP, VP_ROWS, vpPays, vpRow } from './rules';

addStrings(
  {
    'vp.print1': 'JACKS OR BETTER',
    'vp.print2': 'Tap the cards you want to hold',
    'vp.held': 'HELD',
    'vp.coin': 'COIN',
    'vp.bet': 'BET',
    'vp.win': 'WIN',
    'vp.coinBtn': 'Coin {n}',
    'vp.hold': 'Hold: {cards}',
    'vp.holdNone': 'Draw five new cards',
    'vp.gameOver': 'GAME OVER',
    'vp.rules': `
      <p>Classic draw poker machine. Choose the coin value and bet 1 to 5 coins, then <b>Deal</b>.</p>
      <h4>Hold and draw</h4>
      <p>Tap the cards you want to keep (they show <b>HELD</b>) and press <b>Draw</b>: the others are replaced once. Your final hand is paid by the table.</p>
      <h4>Paytable (per coin)</h4>
      <p>Royal flush 250 (<b>4000 with 5 coins</b>) · Straight flush 50 · Four of a kind 25 · Full house 9 · Flush 6 · Straight 4 · Three of a kind 3 · Two pair 2 · Jacks or better 1. Payouts include the bet, so a pair of Jacks gives your coins back.</p>
      <h4>Hint</h4><p>The light bulb shows the classic simple-strategy hold.</p>`,
  },
  {
    'vp.print2': 'Toque nas cartas que quer segurar',
    'vp.held': 'SEGURA',
    'vp.coin': 'FICHA',
    'vp.bet': 'APOSTA',
    'vp.win': 'GANHO',
    'vp.coinBtn': 'Ficha {n}',
    'vp.hold': 'Segure: {cards}',
    'vp.holdNone': 'Troque as cinco cartas',
    'vp.gameOver': 'FIM DE JOGO',
    'vp.rules': `
      <p>A clássica máquina de pôquer. Escolha o valor da ficha e aposte de 1 a 5 fichas, depois <b>Deal</b>.</p>
      <h4>Segurar e trocar</h4>
      <p>Toque nas cartas que quer manter (aparece <b>SEGURA</b>) e aperte <b>Trocar</b>: as outras são substituídas uma vez. A mão final paga pela tabela.</p>
      <h4>Tabela (por ficha)</h4>
      <p>Royal flush 250 (<b>4000 com 5 fichas</b>) · Straight flush 50 · Quadra 25 · Full house 9 · Flush 6 · Sequência 4 · Trinca 3 · Dois pares 2 · Valete ou maior 1. O pagamento inclui a aposta: um par de Valetes devolve suas fichas.</p>
      <h4>Dica</h4><p>A lâmpada mostra o que segurar pela estratégia simples clássica.</p>`,
  },
);

const V = { cards: 0.5, print: 0.66 };
const GAP = 0.655;
const ZOOM = 1.06;

export class VideoPokerView implements GameView {
  readonly id = 'videopoker';
  readonly title = 'Video Poker';
  private cardsT: CardTable;
  private shoe = new Shoe(1, 1.01);
  private coinIdx = 1;
  private coins = 5;
  private hand: Card[] = [];
  private c3: Card3D[] = [];
  private held = [false, false, false, false, false];
  private state: 'idle' | 'shuffling' | 'dealing' | 'hold' | 'drawing' = 'idle';
  private paytable: Paytable | null = null;
  private heldPins: Pin[] = [];
  private hits: HTMLButtonElement[] = [];
  private off: (() => void)[] = [];
  private lastWin = 0;
  private tmp = new THREE.Vector3();
  private pile: ChipPile | null = null;
  private coinsIn: Promise<void> = Promise.resolve();
  private pileHome = new THREE.Vector3();

  constructor(private g: GameCtx) {
    this.cardsT = new CardTable(g);
  }

  get inRound() {
    return this.state !== 'idle';
  }

  rules() {
    return t('vp.rules');
  }

  private get coin() {
    return VP.coins[this.coinIdx];
  }

  async enter() {
    const { stage, table, hud } = this.g;
    stage.setZoom(ZOOM);
    table.setFelt('videopoker');
    // the bet circle: coins are placed here on every deal
    this.pileHome = stage.screenToTable(0.5, 0.705);
    table.addDecalAt(betRing(t('vp.bet')), this.pileHome.x, this.pileHome.z, 0.6);
    this.pile = new ChipPile(this.g.chips, stage.table, this.pileHome.clone());
    table.addDecal(
      tablePrint(
        [
          { text: 'VILLA LAGO', y: 60, R: 4000, font: FONT.title(40), color: GOLD, spacing: 12 },
          { text: t('vp.print1'), y: 138, R: 4000, font: FONT.title(74), spacing: 6 },
          { text: t('vp.print2'), y: 196, R: 4000, font: FONT.italic(40), color: INK_SOFT },
        ],
        230,
      ),
      0.5,
      V.print,
      3.25,
    );
    this.paytable = new Paytable(
      hud.root,
      '',
      VP_ROWS.map((r, i) => [t(r.key), ...[1, 2, 3, 4, 5].map((c) => vpPays(i, c))]),
      { head: ['', '1', '2', '3', '4', '5'], cls: 'vp' },
    );
    this.paytable.column(this.coins);
    for (let i = 0; i < 5; i++) {
      const pin = hud.pin('held-tag');
      pin.set(t('vp.held'));
      this.heldPins.push(pin);
      const b = document.createElement('button');
      b.className = 'card-hit live';
      b.setAttribute('aria-label', `Hold card ${i + 1}`);
      b.onclick = () => this.toggle(i);
      hud.labels.appendChild(b);
      this.hits.push(b);
    }
    this.off.push(stage.onFrame(() => this.sync()));
    hud.onHint = () => this.hint();
    this.state = 'shuffling';
    table.setShoeFill(0);
    table.setTrayFill(0);
    await shuffleShow(this.g, { at: [0.5, 0.5] });
    if (this.state !== 'shuffling') return;
    this.state = 'idle';
    // five face-down cards wait on the screen
    const pl = this.places();
    for (let i = 0; i < 5; i++) {
      const c = await this.cardsT.deal(0, pl[i], false, { dur: 0.35 });
      this.c3.push(c);
    }
    this.idleBar();
  }

  async exit() {
    const { hud, table, stage } = this.g;
    this.state = 'idle';
    hud.setBetBar(null);
    hud.setActions(null);
    hud.showHint(false);
    hud.onHint = () => {};
    this.cardsT.destroyAll();
    this.c3 = [];
    this.pile?.dispose();
    this.pile = null;
    this.paytable?.remove();
    this.paytable = null;
    this.heldPins.forEach((p) => p.remove());
    this.hits.forEach((b) => b.remove());
    this.heldPins = [];
    this.hits = [];
    this.off.forEach((f) => f());
    this.off = [];
    table.clearDecals();
    stage.setZoom(1);
  }

  onWalletChange() {
    if (this.state === 'idle') this.idleBar();
  }

  private places() {
    const z = this.g.stage.screenToTable(0.5, V.cards).z;
    return row(0, z, 5, GAP, 0);
  }

  private bar(dealLabel: string, onDeal: () => void, betting: boolean) {
    const { hud, wallet } = this.g;
    const buttons: BtnSpec[] = [
      { id: 'coin', label: t('vp.coinBtn', { n: this.coin }), color: 'purple', icon: 'chip', enabled: betting, onClick: () => this.cycleCoin() },
      { id: 'betone', label: t('btn.betOne'), color: 'blue', icon: 'chip', enabled: betting, onClick: () => this.betOne() },
      { id: 'betmax', label: t('btn.betMax'), color: 'gold', icon: 'chips', enabled: betting && wallet.canAfford(this.coin * 5), onClick: () => this.betMax() },
      { id: 'deal', label: dealLabel, color: 'green', icon: 'deal', onClick: onDeal },
    ];
    hud.setBetBar({
      chips: [],
      onChip: () => {},
      leds: [
        { id: 'coin', label: t('vp.coin'), value: money(this.coin) },
        { id: 'bet', label: t('vp.bet'), value: String(this.coins) },
        { id: 'win', label: t('vp.win'), value: money(this.lastWin), cls: 'red' },
      ],
      buttons,
    });
    hud.setBetButton('deal', this.state === 'hold' || wallet.canAfford(this.coin * this.coins));
  }

  private idleBar() {
    this.g.hud.showHint(false);
    this.bar(t('btn.deal'), () => this.deal(), true);
  }

  private cycleCoin() {
    this.g.sfx.click();
    this.coinIdx = (this.coinIdx + 1) % VP.coins.length;
    this.idleBar();
  }

  private betOne() {
    this.g.sfx.play('chip', { vol: 0.7 });
    this.coins = (this.coins % 5) + 1;
    this.paytable?.column(this.coins);
    this.idleBar();
  }

  private betMax() {
    this.g.sfx.play('stack', { vol: 0.7 });
    this.coins = 5;
    this.paytable?.column(this.coins);
    this.idleBar();
    this.deal();
  }

  private toggle(i: number) {
    if (this.state !== 'hold') return;
    this.held[i] = !this.held[i];
    this.g.sfx.play(this.held[i] ? 'place' : 'slide', { vol: 0.6 });
    this.g.hud.highlight(null);
    const c = this.c3[i];
    if (c) arcTo(c.obj, c.obj.position.clone().setY(this.held[i] ? 0.05 : 0.006), 0.15, 0, 'power2.out');
    this.heldPins[i].pop();
  }

  private hint() {
    if (this.state !== 'hold') return;
    const hold = holdAdvice(this.hand);
    hold.forEach((i) => this.g.fx.glow(this.c3[i].obj.position.clone(), 0.8, 1.05, 1.4, '#9fd0ff'));
    this.g.hud.toast(hold.length ? t('vp.hold', { cards: hold.map((i) => cardLabel(this.hand[i])).join(' ') }) : t('vp.holdNone'), 2200);
  }

  private async deal() {
    const { wallet, hud } = this.g;
    if (this.state !== 'idle') return;
    const cost = this.coin * this.coins;
    if (!wallet.canAfford(cost)) return hud.toast(t('toast.noFunds'));
    this.state = 'dealing';
    this.paytable?.highlight(null);
    wallet.debit(cost);
    this.g.sfx.play('handle', { vol: 0.5 });
    this.coinsIn = this.pile!.dropIn(cost, this.g.stage.screenToTable(0.5, 0.97, 1.6), 0.06);
    this.lastWin = 0;
    this.bar(t('btn.draw'), () => this.draw(), false);
    hud.setBetButton('deal', false);
    this.held = [false, false, false, false, false];
    // the previous hand leaves the screen
    this.c3 = [];
    await this.cardsT.collect();
    this.g.table.setTrayFill(0);
    this.shoe.shuffle();
    this.hand = Array.from({ length: 5 }, () => this.shoe.draw());
    const pl = this.places();
    const jobs: Promise<Card3D>[] = [];
    for (let i = 0; i < 5; i++) {
      jobs.push(this.cardsT.deal(this.hand[i], pl[i], false, { dur: 0.4 }));
      await wait(0.1);
    }
    this.c3 = await Promise.all(jobs);
    for (const c of this.c3) {
      this.cardsT.flip(c, 0.4);
      await wait(0.09);
    }
    await wait(0.35);
    // light up the row of what was dealt (a dealt pair of Jacks etc.)
    const r = vpRow(eval5(this.hand));
    this.paytable?.highlight(r >= 0 ? r : null);
    this.state = 'hold';
    hud.setBetButton('deal', true);
    hud.showHint(this.g.settings.hints);
  }

  private async draw() {
    const { hud, sfx, wallet, fx } = this.g;
    if (this.state !== 'hold') return;
    this.state = 'drawing';
    hud.setBetButton('deal', false);
    hud.showHint(false);
    hud.highlight(null);
    sfx.click();
    // discarded cards fly off, replacements are dealt and turned
    const out = this.c3.filter((_, i) => !this.held[i]);
    if (out.length) {
      sfx.play('shove', { vol: 0.6 });
      await Promise.all(
        out.map((c, k) =>
          gsap.to(c.obj.position, { y: 0.6, z: c.obj.position.z - 3.2, duration: 0.35, delay: k * 0.05, ease: 'power2.in' }).then(() => {
            this.g.cards.destroy(c);
            this.cardsT.all.splice(this.cardsT.all.indexOf(c), 1);
          }),
        ),
      );
    }
    const pl = this.places();
    for (let i = 0; i < 5; i++) {
      if (this.held[i]) continue;
      this.hand[i] = this.shoe.draw();
      this.c3[i] = await this.cardsT.deal(this.hand[i], pl[i], false, { dur: 0.32 });
      this.cardsT.flip(this.c3[i], 0.38);
      await wait(0.06);
    }
    await wait(0.45);
    this.held = [false, false, false, false, false];
    this.c3.forEach((c) => arcTo(c.obj, c.obj.position.clone().setY(0.006), 0.15, 0));
    const h = eval5(this.hand);
    const r = vpRow(h);
    const won = vpPays(r, this.coins) * this.coin;
    const cost = this.coin * this.coins;
    this.paytable?.highlight(r >= 0 ? r : null);
    let banner: Promise<void>;
    if (won > 0) {
      wallet.credit(won);
      this.lastWin = won;
      const mask = scoringMask(this.hand, h);
      highlightCards(this.g, this.c3.filter((_, i) => mask[i]));
      fx.burst(new THREE.Vector3(0, 0.3, this.places()[2].pos.z), r <= 3 ? 180 : 80);
      if (r <= 3) sfx.jackpot();
      else sfx.win(r <= 5);
      if (r <= 5) this.g.trophy('big');
      banner = hud.banner(t(VP_ROWS[r].key).toUpperCase(), `+${money(won)}`, r <= 5 ? 'win' : 'win small', r <= 3 ? 1900 : 1300);
    } else {
      this.lastWin = 0;
      sfx.lose();
      banner = hud.banner(t('vp.gameOver'), '', 'lose small', 900);
    }
    await this.coinsIn;
    await this.settlePile(won > 0);
    await finishXP(this.g, cost, won - cost, banner);
    this.state = 'idle';
    this.idleBar();
  }

  /** The bet coins go back to the player (win) or to the house (loss). */
  private async settlePile(won: boolean) {
    const pile = this.pile;
    if (!pile || !pile.amount) return;
    const { stage, sfx } = this.g;
    const to = won ? stage.screenToTable(0.5, 1.2) : stage.screenToTable(0.5, -0.1);
    sfx.play('handle', { vol: 0.5 });
    await slideChips(pile.group, new THREE.Vector3(this.pileHome.x, 0, to.z), 0.5, 0.1, 'power2.in');
    pile.clear();
    pile.group.position.copy(this.pileHome);
  }

  private sync() {
    const { stage } = this.g;
    const pl = this.places();
    for (let i = 0; i < 5; i++) {
      const p = pl[i].pos;
      const top = stage.toScreen(this.tmp.set(p.x, 0, p.z - CARD_H / 2 - 0.16));
      this.heldPins[i].place(top.x, top.y);
      this.heldPins[i].show(this.state !== 'idle' && this.held[i]);
      const a = stage.toScreen(this.tmp.set(p.x - 0.315, 0, p.z - CARD_H / 2));
      const b = stage.toScreen(this.tmp.set(p.x + 0.315, 0, p.z + CARD_H / 2));
      const hb = this.hits[i];
      hb.style.width = `${b.x - a.x}px`;
      hb.style.height = `${b.y - a.y}px`;
      hb.style.transform = `translate(${a.x}px, ${a.y}px)`;
      hb.style.display = this.state === 'hold' ? 'block' : 'none';
    }
  }
}
