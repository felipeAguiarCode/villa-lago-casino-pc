import * as THREE from 'three';
import gsap from 'gsap';
import { addStrings, locale, t } from '../../core/i18n';
import { arcTo, collectCards, dealCard, wait, type Place } from '../../table/anim';
import { CARD_H, CARD_W, REST_Y, type Card3D } from '../../table/cardMesh';

import type { Pin } from '../../ui/hud';
import { Paytable } from '../../ui/paytable';
import { highlightCards, row, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { feltPrint, SymbolFaces } from './faces';
import { CAT, DECK_SIZE, evalHand, groupText, handKey, holdAdvice, houseHold, PAYS10, raiseAdvice, settleSP, SP, SYMBOL_CHAR, SymbolDeck, type SpHand, type SpResult, type Sym } from './rules';

/** "×1.2" in the player's language. */
const mult = (p10: number, lang: 'en' | 'pt') => `×${String(p10 / 10).replace('.', lang === 'pt' ? ',' : '.')}`;
const paysLine = (lang: 'en' | 'pt', names: string[]) =>
  [1, 2, 3, 4, 5, 6].map((c) => `${names[c]} <b>${mult(PAYS10[c], lang)}</b>`).join(' · ');
const NAMES_EN = ['Nothing', 'One pair', 'Two pair', 'Three of a kind', 'Full house', 'Four of a kind', 'Five of a kind'];
const NAMES_PT = ['Nada', 'Um par', 'Dois pares', 'Trinca', 'Full house', 'Quadra', 'Cinco iguais'];

addStrings(
  {
    'sp.ante': 'ANTE',
    'sp.raise': 'RAISE',
    'sp.print1': 'SUIT POKER',
    'sp.print2': 'Match the symbols · Beat the dealer',
    'sp.print3': 'DEALER NEEDS THREE OF A KIND TO CALL RAISES',
    'sp.needAnte': 'Place a bet on ANTE',
    'sp.held': 'HELD',
    'sp.pick': 'Tap the cards you want to hold · Raise before the draw',
    'sp.raiseBtn': 'Raise to {n}×',
    'sp.raised': 'Raised 5×',
    'sp.hintRaise': 'Strategy: raise to 5× · hold {cards}',
    'sp.hintDraw': 'Strategy: no raise · hold {cards}',
    'sp.hintHold': 'Strategy: hold {cards} and draw',
    'sp.dealerDraws': 'Dealer draws {n}',
    'sp.dealerPat': 'Dealer stands pat',
    'sp.noCall': 'raise returned',
    'sp.ptTitle': 'WIN PAYS × TOTAL BET',
    'sp.order': 'SYMBOLS',
    'sp.big': 'FIVE OF A KIND',
    ...Object.fromEntries(NAMES_EN.map((n, i) => [`sp.h${i}`, n])),
    'sp.rules': `
      <p>Draw poker with picture cards that have no ranks: hands are made of <b>matching symbols</b>, and you play against the dealer. The deck has 48 cards, 8 of each symbol, shuffled for every round.</p>
      <h4>Symbols, high to low</h4>
      <p><b>★ Red Joker</b> › <b>☆ Black Joker</b> › ♠ › ♥ › ♦ › ♣</p>
      <h4>The round</h4>
      <p>Bet the <b>Ante</b> (5 to 200) and deal: five cards for you, face up, and five for the dealer, face down. Before the draw you may <b>Raise</b> 1× the ante per press, up to four times (5× in total). Tap cards to <b>HOLD</b> them and press <b>Draw</b>: the others are replaced once. Then the dealer draws by the house way — it keeps every pair or better and replaces the singles; with no pair it keeps its highest symbol — and both hands are shown.</p>
      <h4>Hands, high to low</h4>
      <p>Five of a kind · Four of a kind · Full house · Three of a kind · Two pair · One pair · Nothing. In the same hand the symbols of the groups decide, the bigger group first (★★♠♠ beats ♠♠♥♥; in a full house the three counts first). Single cards never count: the same groups push, and so does nothing against nothing.</p>
      <h4>Paytable</h4>
      <p>A win returns your whole bet (ante + raises) times: ${paysLine('en', NAMES_EN)}. A loss takes the bet; a push returns it.</p>
      <h4>Raises need the dealer's three of a kind</h4>
      <p>The dealer only calls raises with <b>three of a kind or better</b>. With less, your raise chips come back and only the ante is paid or lost.</p>
      <h4>Strategy</h4>
      <p>Hold every pair or better; with no pair hold your highest symbol. Raise all the way (5×) with three of a kind of ♠ or higher, any full house, four or five of a kind — never otherwise. Played this way the table returns 96.8% of the total bet (87.1% holding the pairs and never raising).</p>`,
  },
  {
    'sp.raise': 'AUMENTO',
    'sp.print1': 'PÔQUER DE NAIPES',
    'sp.print2': 'Junte símbolos iguais · Vença o dealer',
    'sp.print3': 'AUMENTOS SÓ VALEM COM TRINCA DO DEALER',
    'sp.needAnte': 'Aposte no ANTE',
    'sp.held': 'SEGURA',
    'sp.pick': 'Toque nas cartas que quer segurar · Aumente antes da troca',
    'sp.raiseBtn': 'Aumentar a {n}×',
    'sp.raised': 'Aumento 5×',
    'sp.hintRaise': 'Estratégia: aumente a 5× · segure {cards}',
    'sp.hintDraw': 'Estratégia: sem aumento · segure {cards}',
    'sp.hintHold': 'Estratégia: segure {cards} e troque',
    'sp.dealerDraws': 'Dealer troca {n}',
    'sp.dealerPat': 'Dealer não troca',
    'sp.noCall': 'aumento devolvido',
    'sp.ptTitle': 'VITÓRIA PAGA × APOSTA TOTAL',
    'sp.order': 'SÍMBOLOS',
    'sp.big': 'CINCO IGUAIS',
    ...Object.fromEntries(NAMES_PT.map((n, i) => [`sp.h${i}`, n])),
    'sp.rules': `
      <p>Pôquer de troca com cartas de figura sem valores: as mãos são feitas de <b>símbolos iguais</b>, e você joga contra o dealer. O baralho tem 48 cartas, 8 de cada símbolo, embaralhadas a cada rodada.</p>
      <h4>Símbolos, do maior ao menor</h4>
      <p><b>★ Coringa vermelho</b> › <b>☆ Coringa preto</b> › ♠ › ♥ › ♦ › ♣</p>
      <h4>A rodada</h4>
      <p>Aposte o <b>Ante</b> (5 a 200) e dê as cartas: cinco para você, viradas para cima, e cinco para o dealer, viradas para baixo. Antes da troca você pode <b>Aumentar</b> 1× o ante por toque, até quatro vezes (5× no total). Toque nas cartas para <b>SEGURAR</b> e aperte <b>Trocar</b>: as outras são substituídas uma vez. Depois o dealer troca pela regra da casa — fica com todo par ou melhor e troca as avulsas; sem par, fica com o seu símbolo mais alto — e as duas mãos são mostradas.</p>
      <h4>Mãos, da maior à menor</h4>
      <p>Cinco iguais · Quadra · Full house · Trinca · Dois pares · Um par · Nada. Na mesma mão decidem os símbolos dos grupos, o grupo maior primeiro (★★♠♠ vence ♠♠♥♥; no full house a trinca conta primeiro). Cartas avulsas nunca contam: grupos iguais empatam, e nada contra nada também.</p>
      <h4>Tabela</h4>
      <p>A vitória devolve a aposta inteira (ante + aumentos) vezes: ${paysLine('pt', NAMES_PT)}. A derrota leva a aposta; o empate a devolve.</p>
      <h4>Aumentos precisam da trinca do dealer</h4>
      <p>O dealer só cobre aumentos com <b>trinca ou melhor</b>. Com menos, suas fichas de aumento voltam e só o ante ganha ou perde.</p>
      <h4>Estratégia</h4>
      <p>Segure todo par ou melhor; sem par, segure o seu símbolo mais alto. Aumente até o fim (5×) com trinca de ♠ ou maior, qualquer full house, quadra ou cinco iguais — e nunca nos outros casos. Assim a mesa devolve 96,8% da aposta total (87,1% segurando os pares e sem aumentar).</p>`,
  },
);

/** Screen rows (v, from the top of the portrait frame). */
const V = { dealer: 0.155, print: 0.335, player: 0.535, spots: 0.752 };
/** The player's cards are dealt a little larger than the dealer's. */
const P_SCALE = 1.15;
const GAP_P = 0.76;
const GAP_D = 0.68;
const FELT = 'suitpoker' as const;

export class SuitPokerView extends TableGame {
  readonly id = 'suitpoker';
  readonly title = 'Suit Poker';
  protected readonly felt = FELT;
  private deck = new SymbolDeck();
  private faces: SymbolFaces | null = null;
  private state: 'decide' | 'drawing' | null = null;
  private player: Sym[] = [];
  private dealer: Sym[] = [];
  private p3: Card3D[] = [];
  private d3: Card3D[] = [];
  private held = [false, false, false, false, false];
  private raises = 0;
  private ante = 0;
  private pPl: Place[] = [];
  private dPl: Place[] = [];
  private z = { p: 0, d: 0 };
  private heldPins: Pin[] = [];
  private hits: HTMLButtonElement[] = [];
  private firstPick = true;
  /** Cards in the discard tray this round (a fresh deck every round). */
  private trayN = 0;
  private v3 = new THREE.Vector3();

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('sp.rules');
  }

  protected spotDefs(): SpotDef[] {
    return [
      { id: 'ante', label: t('sp.ante'), u: 0.36, v: V.spots, size: 0.66, max: SP.maxAnte },
      { id: 'raise', label: t('sp.raise'), sub: '≤ 4×', u: 0.64, v: V.spots, size: 0.66, auto: true },
    ];
  }

  protected defaultBets() {
    return { ante: 25 };
  }

  protected decorate() {
    const { table, hud, stage } = this.g;
    table.addDecal(feltPrint(t('sp.print1'), t('sp.print2'), t('sp.print3')), 0.5, V.print, 3.25);
    const fmt = (p10: number) => `×${(p10 / 10).toLocaleString(locale())}`;
    this.paytable = new Paytable(
      hud.root,
      t('sp.ptTitle'),
      [6, 5, 4, 3, 2, 1].map((c) => [t(`sp.h${c}`), fmt(PAYS10[c])]),
      { cls: 'sp' },
    );
    // the symbol order as a small print under the table
    const ord = document.createElement('div');
    ord.style.cssText = "margin-top:calc(1 * var(--u));text-align:center;font:700 calc(3 * var(--u))/1.2 'Barlow Condensed';letter-spacing:.12em;color:#e6c27a";
    const sym = (s: Sym) => `<span style="color:${s === 0 || s === 3 || s === 4 ? '#ff6b6b' : '#f4f1e6'};font-size:1.2em">${SYMBOL_CHAR[s]}</span>`;
    ord.innerHTML = `${t('sp.order')} &nbsp;${[0, 1, 2, 3, 4, 5].map(sym).join(' › ')}`;
    this.paytable.el.appendChild(ord);
    if (!this.faces) {
      this.faces = new SymbolFaces(Math.min(8, stage.renderer.capabilities.getMaxAnisotropy()));
      this.faces.warm();
    }
    if (!this.hits.length) {
      for (let i = 0; i < 5; i++) {
        const pin = hud.pin('held-tag');
        pin.set(t('sp.held'));
        this.heldPins.push(pin);
        const b = document.createElement('button');
        b.className = 'card-hit live';
        b.setAttribute('aria-label', `Hold card ${i + 1}`);
        b.onclick = () => this.toggle(i);
        hud.labels.appendChild(b);
        this.hits.push(b);
      }
    }
  }

  protected cleanup() {
    this.heldPins.forEach((p) => p.remove());
    this.hits.forEach((b) => b.remove());
    this.heldPins = [];
    this.hits = [];
    this.faces?.dispose();
    this.faces = null;
    this.state = null;
    this.p3 = [];
    this.d3 = [];
  }

  protected validate() {
    const a = this.spots.amounts().ante ?? 0;
    if (a < SP.minAnte) return t('sp.needAnte');
    return '';
  }

  protected advice() {
    if (this.state !== 'decide' || this.p3.length < 5) return null;
    const hold = holdAdvice(this.player);
    const want = raiseAdvice(this.player);
    const cards = this.player.filter((_, i) => hold[i]).map((s) => SYMBOL_CHAR[s]).join(' ');
    hold.forEach((h, i) => {
      if (h) this.g.fx.glow(this.p3[i].obj.position.clone(), CARD_W * P_SCALE * 1.35, CARD_H * P_SCALE * 1.3, 1.4, '#9fd0ff');
    });
    if (this.raises < want && this.g.wallet.canAfford(this.ante)) return { id: 'raise', msg: t('sp.hintRaise', { cards }) };
    return { id: 'draw', msg: want > 0 ? t('sp.hintHold', { cards }) : t('sp.hintDraw', { cards }) };
  }

  protected onSync() {
    const { stage } = this.g;
    if (this.pPl.length < 5 || !this.hits.length) return;
    const w = (CARD_W * P_SCALE) / 2;
    const h = (CARD_H * P_SCALE) / 2;
    for (let i = 0; i < 5; i++) {
      const p = this.pPl[i].pos;
      const top = stage.toScreen(this.v3.set(p.x, 0, p.z - h - 0.16));
      this.heldPins[i].place(top.x, top.y);
      this.heldPins[i].show(this.state !== null && this.held[i]);
      const a = stage.toScreen(this.v3.set(p.x - w, 0, p.z - h));
      const b = stage.toScreen(this.v3.set(p.x + w, 0, p.z + h));
      const hb = this.hits[i];
      hb.style.width = `${b.x - a.x}px`;
      hb.style.height = `${b.y - a.y}px`;
      hb.style.transform = `translate(${a.x}px, ${a.y}px)`;
      hb.style.display = this.state === 'decide' ? 'block' : 'none';
    }
  }

  // ---------------------------------------------------------------- cards
  private paint(c: Card3D, s: Sym) {
    if (!this.faces) return;
    const mat = c.front.material as THREE.MeshStandardMaterial;
    mat.map = this.faces.get(s);
    mat.needsUpdate = true;
  }

  /** Deals one picture card from the shoe (null: a face-down card whose face is painted later). */
  private async dealSym(s: Sym | null, to: Place, faceUp: boolean, scale: number, dur = 0.45): Promise<Card3D> {
    const { cards, table, sfx } = this.g;
    const c = cards.create(null);
    c.obj.visible = false;
    c.obj.scale.setScalar(scale);
    if (s !== null) this.paint(c, s);
    this.cardsT.all.push(c);
    sfx.play('slide', { vol: 0.8 });
    await dealCard(c, table.shoeMouth(), table.shoeYaw, to, { faceUp, dur, onLand: () => sfx.play('place', { vol: 0.5 }) });
    return c;
  }

  /** Discarded cards are picked up and fly to the discard tray, face down. */
  private async discard(list: Card3D[]) {
    if (!list.length) return;
    const { table, sfx, cards } = this.g;
    sfx.play('shove', { vol: 0.6 });
    // the dealer's hand picks each card up first (the larger player cards settle to normal size)
    await Promise.all(
      list.map((c, k) =>
        gsap.to(c.obj.scale, { x: 1, y: 1, z: 1, duration: 0.14, delay: k * 0.04, ease: 'power2.out', onStart: () => void arcTo(c.obj, c.obj.position.clone().setY(c.obj.position.y + 0.06), 0.14, 0) }),
      ),
    );
    await collectCards(list, table.trayTop(), table.trayYaw, (c) => {
      const i = this.cardsT.all.indexOf(c);
      if (i >= 0) this.cardsT.all.splice(i, 1);
      cards.destroy(c);
      this.toTray();
    });
  }

  private toTray() {
    this.trayN++;
    this.g.table.setTrayFill(Math.min(1, this.trayN / DECK_SIZE));
  }

  private toggle(i: number) {
    if (this.state !== 'decide') return;
    this.held[i] = !this.held[i];
    this.g.sfx.play(this.held[i] ? 'place' : 'slide', { vol: 0.6 });
    this.g.hud.highlight(null);
    const c = this.p3[i];
    if (c) arcTo(c.obj, c.obj.position.clone().setY(this.held[i] ? 0.05 : REST_Y), 0.15, 0, 'power2.out');
    this.heldPins[i].pop();
  }

  // ---------------------------------------------------------------- round
  protected async playRound() {
    const { stage, table, wallet, hud } = this.g;
    this.paytable?.show(true);
    this.paytable?.highlight(null);
    // a fresh 48-card deck every round: the tray is emptied back into it
    this.trayN = 0;
    table.setTrayFill(0);
    this.deck.shuffle();
    this.ante = this.spots.amounts().ante;
    this.raises = 0;
    this.held = [false, false, false, false, false];
    this.z = { p: stage.screenToTable(0.5, V.player).z, d: stage.screenToTable(0.5, V.dealer).z };
    this.pPl = row(0, this.z.p, 5, GAP_P, 0);
    this.dPl = row(0, this.z.d, 5, GAP_D, 0.0015);
    this.player = [];
    this.dealer = [];
    this.p3 = [];
    this.d3 = [];
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 5; i++) {
      const pc = this.deck.draw();
      const dc = this.deck.draw();
      this.player.push(pc);
      this.dealer.push(dc);
      jobs.push(this.dealSym(pc, this.pPl[i], true, P_SCALE).then((c) => (this.p3[i] = c)));
      await wait(0.15);
      jobs.push(this.dealSym(null, this.dPl[i], false, 1).then((c) => (this.d3[i] = c)));
      await wait(0.15);
    }
    await Promise.all(jobs);
    await wait(0.2);
    this.showPlayerTag();
    // raise and hold, then one draw
    this.state = 'decide';
    if (this.firstPick) {
      this.firstPick = false;
      hud.toast(t('sp.pick'), 2600);
    }
    for (;;) {
      const canRaise = this.raises < SP.maxRaises && wallet.canAfford(this.ante);
      const pick = await this.choose([
        {
          id: 'raise',
          label: this.raises < SP.maxRaises ? t('sp.raiseBtn', { n: this.raises + 2 }) : t('sp.raised'),
          color: 'gold',
          icon: 'raise',
          enabled: canRaise,
        },
        { id: 'draw', label: t('btn.draw'), color: 'green', icon: 'deal' },
      ]);
      if (pick === 'draw') break;
      if (this.raises < SP.maxRaises && wallet.canAfford(this.ante)) {
        this.raises++;
        await this.place('raise', this.ante);
      }
    }
    this.state = 'drawing';
    await this.playerDraw();
    await this.dealerDraw();
    await this.reveal();
    const res = settleSP(this.player, this.dealer, { ante: this.ante, raise: this.spots.amounts().raise ?? 0 });
    this.showResult(res);
    this.state = null;
    const big = res.outcome === 'win' && res.player.cat === CAT.five ? t('sp.big') : undefined;
    await this.settle(res.ret, { big });
    // the player's cards settle to the normal size and the dealer gathers the cards (here, so the
    // tray counts this round's deck only); the chips are swept after
    await Promise.all(this.p3.map((c) => gsap.to(c.obj.scale, { x: 1, y: 1, z: 1, duration: 0.3, delay: 0.35, ease: 'power2.inOut' })));
    await wait(0.3);
    await this.cardsT.collect(() => this.toTray());
    this.clearTags();
    this.paytable?.highlight(null);
  }

  private async playerDraw() {
    const out = [0, 1, 2, 3, 4].filter((i) => !this.held[i]);
    await this.discard(out.map((i) => this.p3[i]));
    const jobs: Promise<unknown>[] = [];
    for (const i of out) {
      this.player[i] = this.deck.draw();
      jobs.push(this.dealSym(this.player[i], this.pPl[i], true, P_SCALE, 0.4).then((c) => (this.p3[i] = c)));
      await wait(0.12);
    }
    await Promise.all(jobs);
    // held cards go back down on the felt
    this.p3.forEach((c, i) => {
      if (this.held[i]) arcTo(c.obj, this.pPl[i].pos, 0.18, 0.01, 'power2.out');
    });
    this.held = [false, false, false, false, false];
    this.showPlayerTag();
    await wait(0.35);
  }

  /** The house way, face down: every group stays, the singles are replaced. */
  private async dealerDraw() {
    const keep = houseHold(this.dealer);
    const out = [0, 1, 2, 3, 4].filter((i) => !keep[i]);
    const tag = this.tag(out.length ? t('sp.dealerDraws', { n: out.length }) : t('sp.dealerPat'), 'dealer', 0, this.z.d + CARD_H / 2 + 0.12);
    await wait(0.35);
    // the singles leave face down and are replaced face down
    await this.discard(out.map((i) => this.d3[i]));
    const jobs: Promise<unknown>[] = [];
    for (const i of out) {
      this.dealer[i] = this.deck.draw();
      jobs.push(this.dealSym(null, this.dPl[i], false, 1, 0.38).then((c) => (this.d3[i] = c)));
      await wait(0.12);
    }
    await Promise.all(jobs);
    await wait(0.3);
    tag.remove();
  }

  private async reveal() {
    for (let i = 0; i < 5; i++) {
      this.paint(this.d3[i], this.dealer[i]);
      this.cardsT.flip(this.d3[i], 0.48);
      await wait(0.14);
    }
    await wait(0.6);
  }

  private handName(h: SpHand) {
    const g = groupText(h);
    return g ? `${t(handKey(h))} ${g}` : t(handKey(h));
  }

  private showPlayerTag() {
    this.clearTags();
    const h = evalHand(this.player);
    this.tag(this.handName(h), '', 0, this.z.p + (CARD_H * P_SCALE) / 2 + 0.14);
  }

  private showResult(res: SpResult) {
    this.clearTags();
    const pWin = res.outcome === 'win';
    const dWin = res.outcome === 'lose';
    this.tag(this.handName(res.player), pWin ? 'win' : dWin ? 'lose' : '', 0, this.z.p + (CARD_H * P_SCALE) / 2 + 0.14);
    const dealerText = this.handName(res.dealer) + (this.raises > 0 && !res.qualifies ? ` · ${t('sp.noCall')}` : '');
    this.tag(dealerText, 'dealer', 0, this.z.d + CARD_H / 2 + 0.12);
    if (pWin) {
      const glow = this.p3.filter((_, i) => res.player.mask[i]);
      highlightCards(this.g, glow);
      this.g.fx.burst(new THREE.Vector3(0, 0.3, this.z.p), res.player.cat === CAT.five ? 220 : res.player.cat >= CAT.fullHouse ? 150 : 70);
      this.paytable?.highlight(6 - res.player.cat);
    } else if (dWin) {
      const glow = this.d3.filter((_, i) => res.dealer.mask[i]);
      if (glow.length) highlightCards(this.g, glow, '#9fd0ff');
    }
  }
}
