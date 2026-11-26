import gsap from 'gsap';
import { addStrings, locale, t } from '../../core/i18n';
import { cardLabel, freshDeck, type Card } from '../../core/cards';
import { bestOf, Cat5 } from '../../core/eval5';
import { cryptoRng, shuffle } from '../../core/rng';
import { money } from '../../core/wallet';
import { shuffleShow } from '../../table/shuffle';
import type { BtnSpec } from '../../ui/hud';
import { finishXP } from '../kit';
import { openCombos, SlotCabinet } from '../pokerslots/cabinet';
import { Reels } from '../pokerslots/reels';
import type { GameCtx, GameView } from '../types';
import { artCards, bestHand, HS, HS_ROWS, HS_SEVEN, HS_STRIPS, hsRow, playEV, SEVEN_CARD_HANDS, shouldPlay, stopsFor, type HsKey } from './rules';

addStrings(
  {
    'hs.title': "HOLD'EM SLOTS",
    'hs.spin': 'Spin',
    'hs.play': 'Play 4×',
    'hs.coin': 'COIN',
    'hs.ante': 'ANTE',
    'hs.coinBtn': 'Coin {n}',
    'hs.hand': 'Your hand',
    'hs.flop': 'Flop',
    'hs.turn': 'Turn',
    'hs.river': 'River',
    'hs.welcome': "♠ HOLD'EM SLOTS ♥ ROYAL FLUSH PAYS 500× ♦ PRESS SPIN ♣",
    'hs.luck': 'GOOD LUCK!',
    'hs.decide': '{cards} - PLAY 4× OR FOLD?',
    'hs.flopMsg': 'THE FLOP...',
    'hs.turnMsg': 'THE TURN...',
    'hs.riverMsg': 'THE RIVER...',
    'hs.winMsg': '{hand} PAYS {n}',
    'hs.push': 'BET BACK',
    'hs.noWin': '{hand} - NO WIN',
    'hs.folded': 'FOLDED - THE BOARD WOULD HAVE MADE {hand}',
    'hs.foldBanner': 'FOLDED',
    'hs.hintPlay': 'Play: {cards} returns {ev}× the bet on average',
    'hs.hintFold': 'Fold: {cards} returns only {ev}× the bet played',
    'hs.needs': 'A spin needs the ante and the 4× play: {n}',
    'hs.combos': "Hold'em Slots · hands",
    'hs.combosIntro': 'Your two cards and the five of the board make the best five-card hand; your own cards need not play. Pays are multiples of the whole bet (ante + play), stake included.',
    'hs.combosNote': 'Pair or less does not pay: fold the weak hands to keep the 4× play. The chance is per hand played to the river.',
    'hs.d.royal': 'A, K, Q, J and 10 of the same suit.',
    'hs.d.straightFlush': 'Five cards in sequence, all of one suit.',
    'hs.d.quads': 'Four cards of the same rank.',
    'hs.d.fullHouse': 'Three of a kind and a pair.',
    'hs.d.flush': 'Five cards of the same suit.',
    'hs.d.straight': 'Five cards in sequence, A-2-3-4-5 up to 10-J-Q-K-A.',
    'hs.d.trips': 'Three cards of the same rank.',
    'hs.d.twoPair': 'Two pairs: the whole bet comes back.',
    'hs.rules': `
      <p>A seven-reel Texas Hold'em machine dealt from one deck. Choose the coin and the ANTE (1 to 5 coins), then <b>Spin</b> (Space) or pull the lever: the two <b>hand</b> reels show your hole cards.</p>
      <p><b>Play 4×</b> (Space) to spin the board — the flop, the turn and the river — or <b>Fold</b> (F): the ante is lost and the board still runs, to show what would have come. A spin needs the ante and the play in the bankroll.</p>
      <h4>Paytable (× the whole bet, ante + play, stake included)</h4>
      <p>Royal flush 500 · Straight flush 100 · Four of a kind 30 · Full house 7 · Flush 6 · Straight 4 · Three of a kind 2 · Two pair 1 (the bet comes back). The best five of the seven cards count. The <b>?</b> key on the machine shows every hand.</p>
      <h4>Return</h4><p>97.7 % per chip folding as the hint does (the light bulb folds about 3 hands in 10), 97.4 % playing every hand, which loses more chips per spin.</p>`,
  },
  {
    'hs.spin': 'Girar',
    'hs.play': 'Jogar 4×',
    'hs.coin': 'FICHA',
    'hs.ante': 'ANTE',
    'hs.coinBtn': 'Ficha {n}',
    'hs.hand': 'Sua mão',
    'hs.flop': 'Flop',
    'hs.turn': 'Turn',
    'hs.river': 'River',
    'hs.welcome': "♠ HOLD'EM SLOTS ♥ ROYAL FLUSH PAGA 500× ♦ APERTE GIRAR ♣",
    'hs.luck': 'BOA SORTE!',
    'hs.decide': '{cards} - JOGAR 4× OU DESISTIR?',
    'hs.flopMsg': 'O FLOP...',
    'hs.turnMsg': 'O TURN...',
    'hs.riverMsg': 'O RIVER...',
    'hs.winMsg': '{hand} PAGA {n}',
    'hs.push': 'APOSTA DE VOLTA',
    'hs.noWin': '{hand} - SEM PREMIO',
    'hs.folded': 'DESISTIU - A MESA DARIA {hand}',
    'hs.foldBanner': 'DESISTIU',
    'hs.hintPlay': 'Jogue: {cards} devolve em média {ev}× a aposta',
    'hs.hintFold': 'Desista: {cards} devolve só {ev}× a aposta jogada',
    'hs.needs': 'Um giro precisa do ante e da jogada 4×: {n}',
    'hs.combos': "Hold'em Slots · mãos",
    'hs.combosIntro': 'Suas duas cartas e as cinco da mesa formam a melhor mão de cinco cartas; suas cartas não precisam entrar. Os pagamentos são múltiplos da aposta inteira (ante + jogada), aposta incluída.',
    'hs.combosNote': 'Par ou menos não paga: desista das mãos fracas para guardar a jogada 4×. A chance é por mão jogada até o river.',
    'hs.d.royal': 'A, K, Q, J e 10 do mesmo naipe.',
    'hs.d.straightFlush': 'Cinco cartas em sequência, todas do mesmo naipe.',
    'hs.d.quads': 'Quatro cartas do mesmo valor.',
    'hs.d.fullHouse': 'Uma trinca e um par.',
    'hs.d.flush': 'Cinco cartas do mesmo naipe.',
    'hs.d.straight': 'Cinco cartas em sequência, de A-2-3-4-5 a 10-J-Q-K-A.',
    'hs.d.trips': 'Três cartas do mesmo valor.',
    'hs.d.twoPair': 'Dois pares: a aposta inteira volta.',
    'hs.rules': `
      <p>Uma máquina de Texas Hold'em com sete rolos, de um baralho só. Escolha a ficha e o ANTE (1 a 5 fichas), depois <b>Gire</b> (Espaço) ou puxe a alavanca: os dois rolos da <b>mão</b> mostram suas cartas.</p>
      <p><b>Jogar 4×</b> (Espaço) gira a mesa — flop, turn e river — ou <b>Desistir</b> (F): o ante é perdido e a mesa gira mesmo assim, para mostrar o que viria. Um giro precisa do ante e da jogada na banca.</p>
      <h4>Tabela (× a aposta inteira, ante + jogada, aposta incluída)</h4>
      <p>Royal flush 500 · Straight flush 100 · Quadra 30 · Full house 7 · Flush 6 · Sequência 4 · Trinca 2 · Dois pares 1 (a aposta volta). Valem as melhores cinco das sete cartas. A tecla <b>?</b> da máquina mostra todas as mãos.</p>
      <h4>Retorno</h4><p>97,7 % por ficha desistindo como a dica (a lâmpada desiste de cerca de 3 mãos em 10), 97,4 % jogando todas, o que perde mais fichas por giro.</p>`,
  },
);

const ROW_NAME: Record<HsKey, string> = {
  royal: 'hand.royal',
  straightFlush: 'hand.straightFlush',
  quads: 'hand.quads',
  fullHouse: 'hand.fullHouse',
  flush: 'hand.flush',
  straight: 'hand.straight',
  trips: 'hand.trips',
  twoPair: 'hand.twoPair',
};

const CAT_NAME: Record<Cat5, string> = {
  [Cat5.High]: 'hand.high',
  [Cat5.Pair]: 'hand.pair',
  [Cat5.TwoPair]: 'hand.twoPair',
  [Cat5.Trips]: 'hand.trips',
  [Cat5.Straight]: 'hand.straight',
  [Cat5.Flush]: 'hand.flush',
  [Cat5.FullHouse]: 'hand.fullHouse',
  [Cat5.Quads]: 'hand.quads',
  [Cat5.StraightFlush]: 'hand.straightFlush',
  [Cat5.Royal]: 'hand.royal',
};

const wait = (s: number) => new Promise<void>((r) => gsap.delayedCall(s, r));
const BOARD = [2, 3, 4, 5, 6];

export class HoldemSlotsView implements GameView {
  readonly id = 'holdemslots';
  readonly title = "Hold'em Slots";
  private state: 'idle' | 'shuffling' | 'spinning' | 'hand' | 'board' = 'idle';
  private coinIdx = 1;
  private coins = 1;
  private deal: Card[] = [];
  private stops = shuffle(freshDeck(), cryptoRng)
    .slice(0, 7)
    .map((c, i) => HS_STRIPS[i].indexOf(c));
  private cab: SlotCabinet | null = null;
  private reels: Reels | null = null;
  private labels: HTMLElement | null = null;
  private handLed: HTMLElement | null = null;
  private motor: (() => void) | null = null;
  private off: (() => void)[] = [];
  private clock = 0;
  private river = 6;
  /** Dev and tests: the seven cards of the next spin (hand, flop, turn, river). */
  rig: Card[] | null = null;

  constructor(private g: GameCtx) {}

  get inRound() {
    return this.state === 'spinning' || this.state === 'hand' || this.state === 'board';
  }

  rules() {
    return t('hs.rules');
  }

  private get coin() {
    return HS.coins[this.coinIdx];
  }

  private get ante() {
    return this.coin * this.coins;
  }

  async enter() {
    const { stage, table, hud } = this.g;
    stage.setZoom(1);
    table.setFelt('holdemslots');
    const cab = new SlotCabinet(this.g, {
      title: t('hs.title'),
      cls: 'wide hslots',
      onHelp: () => this.combos(),
      onPull: () => (this.state === 'hand' ? this.play() : this.spin()),
      canPull: () => this.state === 'idle' || this.state === 'hand',
    });
    this.cab = cab;
    cab.showPaytable(
      HS_ROWS.map((r) => ({ name: t(ROW_NAME[r.key]), cards: artCards(r) })),
      'five',
    );
    this.payValues();
    // street captions over the reels, and the made hand under them
    const labels = document.createElement('div');
    labels.className = 'hs-labels';
    labels.innerHTML = [t('hs.hand'), t('hs.flop'), t('hs.turn'), t('hs.river')].map((s) => `<span>${s}</span>`).join('');
    cab.window.appendChild(labels);
    this.labels = labels;
    const led = document.createElement('div');
    led.className = 'hs-made';
    cab.keys.appendChild(led);
    this.handLed = led;
    this.reels = new Reels(
      cab.reelCanvas,
      HS_STRIPS,
      this.stops,
      {
        tick: (i) => {
          if (i === this.river) this.g.sfx.tick(0.05, 1.35);
        },
        stopped: (i) => this.g.sfx.reelStop(i % 4),
      },
      { groups: [2, 3, 1, 1] },
    );
    for (const i of BOARD) this.reels.setDim(i, true, true);
    const ro = new ResizeObserver(() => this.placeLabels());
    ro.observe(cab.reelCanvas);
    this.off.push(() => ro.disconnect());
    this.off.push(
      stage.onFrame((dt) => {
        this.clock += dt;
        this.reels?.frame(dt);
        this.cab?.frame(dt, this.clock);
      }),
    );
    const key = (e: KeyboardEvent) => this.key(e);
    window.addEventListener('keydown', key);
    this.off.push(() => window.removeEventListener('keydown', key));
    hud.onHint = () => this.hint();
    this.state = 'shuffling';
    table.setShoeFill(0);
    table.setTrayFill(0);
    await shuffleShow(this.g, { at: [0.5, 0.5] });
    if (this.state !== 'shuffling') return;
    this.state = 'idle';
    table.setProps(false);
    cab.reveal();
    this.placeLabels();
    cab.message(t('hs.welcome'));
    this.made(null);
    this.idleBar();
  }

  async exit() {
    const { hud, table, stage } = this.g;
    this.state = 'idle';
    this.motor?.();
    this.motor = null;
    hud.setBetBar(null);
    hud.setActions(null);
    hud.showHint(false);
    hud.onHint = () => {};
    this.off.forEach((f) => f());
    this.off = [];
    this.reels?.dispose();
    this.reels = null;
    this.cab?.dispose();
    this.cab = null;
    this.labels = null;
    this.handLed = null;
    table.clearDecals();
    table.setProps(true);
    stage.setZoom(1);
  }

  onWalletChange() {
    this.cab?.credits();
    if (this.state === 'idle') this.idleBar();
  }

  /** The street captions sit over their reels. */
  private placeLabels() {
    if (!this.labels || !this.reels || !this.cab) return;
    const cols = this.reels.columns();
    if (cols.length < 7) return;
    const off = this.cab.reelCanvas.offsetLeft;
    const spans = [
      [0, 1],
      [2, 4],
      [5, 5],
      [6, 6],
    ];
    this.labels.querySelectorAll<HTMLElement>('span').forEach((s, k) => {
      const [a, b] = spans[k];
      s.style.left = `${off + cols[a].x}px`;
      s.style.width = `${cols[b].x + cols[b].w - cols[a].x}px`;
    });
  }

  private payValues() {
    this.cab?.payValues(HS_ROWS.map((r) => money(r.pays * this.ante * (1 + HS.play))));
  }

  /** The made hand under the reels, live as the streets come. */
  private made(cards: Card[] | null) {
    if (!this.handLed) return;
    if (!cards || cards.length < 2) {
      this.handLed.textContent = '';
      this.handLed.classList.remove('on', 'pays');
      return;
    }
    const h = cards.length >= 5 ? bestOf(cards) : null;
    const pair = cards.length === 2 && cards[0] % 13 === cards[1] % 13;
    const cat = h ? h.cat : pair ? Cat5.Pair : Cat5.High;
    this.handLed.textContent = t(CAT_NAME[cat]);
    this.handLed.classList.add('on');
    this.handLed.classList.toggle('pays', cat >= Cat5.TwoPair);
  }

  private combos() {
    openCombos(
      this.g,
      t('hs.combos'),
      t('hs.combosIntro'),
      HS_ROWS.map((r, i) => ({ name: t(ROW_NAME[r.key]), cards: artCards(r), desc: t(`hs.d.${r.key}`), pays: `${r.pays}×`, p: HS_SEVEN[i] / SEVEN_CARD_HANDS })),
      t('hs.combosNote'),
    );
  }

  // ---------------------------------------------------------------- bet bar
  private idleBar() {
    const { hud, wallet } = this.g;
    const can = wallet.canAfford(this.ante * (1 + HS.play));
    const buttons: BtnSpec[] = [
      { id: 'coin', label: t('hs.coinBtn', { n: this.coin }), color: 'purple', icon: 'chip', onClick: () => this.cycleCoin() },
      { id: 'betone', label: t('btn.betOne'), color: 'blue', icon: 'chip', onClick: () => this.betOne() },
      { id: 'spin', label: t('hs.spin'), color: 'green', icon: 'cycle', enabled: can, onClick: () => this.spin() },
    ];
    hud.setBetBar({
      chips: [],
      onChip: () => {},
      leds: [
        { id: 'coin', label: t('hs.coin'), value: money(this.coin) },
        { id: 'ante', label: t('hs.ante'), value: money(this.ante) },
      ],
      buttons,
    });
    hud.setActions(null);
    this.cab?.setLeverReady(can);
  }

  private decisionBar() {
    const { hud } = this.g;
    hud.setBetBar(null);
    hud.setActions([
      { id: 'fold', label: t('btn.fold'), color: 'red', icon: 'fold', onClick: () => this.fold() },
      { id: 'play', label: t('hs.play'), color: 'green', icon: 'play', onClick: () => this.play() },
    ]);
    this.cab?.setLeverReady(true);
  }

  private cycleCoin() {
    this.g.sfx.click();
    this.coinIdx = (this.coinIdx + 1) % HS.coins.length;
    this.payValues();
    this.idleBar();
  }

  private betOne() {
    this.g.sfx.play('chip', { vol: 0.7 });
    this.coins = (this.coins % HS.maxCoins) + 1;
    this.payValues();
    this.idleBar();
  }

  private hint() {
    if (this.state !== 'hand') return;
    const [a, b] = this.deal;
    const ev = playEV(a, b).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cards = `${cardLabel(a)} ${cardLabel(b)}`;
    this.g.hud.toast(shouldPlay(a, b) ? t('hs.hintPlay', { cards, ev }) : t('hs.hintFold', { cards, ev }), 2600);
  }

  private key(e: KeyboardEvent) {
    if (!this.cab || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.g.hud.root.querySelector('.modal .panel')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (this.state === 'idle') this.spin();
      else if (this.state === 'hand') this.play();
      else return;
      e.preventDefault();
    } else if ((e.key === 'f' || e.key === 'F') && this.state === 'hand') this.fold();
    else if (e.key === '?' && this.state !== 'shuffling') this.combos();
  }

  // ---------------------------------------------------------------- the hand
  private async spin() {
    const { wallet, hud, sfx } = this.g;
    if (this.state !== 'idle' || !this.reels || !this.cab) return;
    const cab = this.cab;
    if (!wallet.canAfford(this.ante * (1 + HS.play))) return hud.toast(t('hs.needs', { n: money(this.ante * (1 + HS.play)) }));
    this.state = 'spinning';
    wallet.debit(this.ante);
    cab.credits();
    cab.setWon(0, false);
    cab.highlight(null);
    cab.setWinState(null);
    this.reels.showWin(null);
    this.made(null);
    hud.setBetBar(null);
    cab.setLeverReady(false);
    cab.leverAnim();
    cab.message(t('hs.luck'));
    // one deck for the whole hand
    this.deal = this.rig ?? shuffle(freshDeck(), cryptoRng).slice(0, 7);
    this.rig = null;
    this.stops = stopsFor(this.deal);
    for (const i of BOARD) this.reels.setDim(i, true);
    await wait(0.12);
    this.motor = sfx.reelMotor();
    this.reels.spin(0, 0);
    this.reels.spin(1, 0.06);
    await wait(0.85);
    const s0 = this.reels.stop(0, this.stops[0]);
    await wait(0.34);
    await Promise.all([s0, this.reels.stop(1, this.stops[1])]);
    this.motor?.();
    this.motor = null;
    if (!this.cab) return;
    this.state = 'hand';
    this.made(this.deal.slice(0, 2));
    cab.message(t('hs.decide', { cards: `${cardLabel(this.deal[0])} ${cardLabel(this.deal[1])}` }));
    hud.showHint(this.g.settings.hints);
    this.decisionBar();
  }

  private async play() {
    const { wallet, hud } = this.g;
    if (this.state !== 'hand' || !this.cab) return;
    const playBet = this.ante * HS.play;
    if (!wallet.canAfford(playBet)) return hud.toast(t('toast.noFunds'));
    wallet.debit(playBet);
    this.cab.credits();
    this.cab.leverAnim();
    await this.runBoard(true);
  }

  private async fold() {
    if (this.state !== 'hand' || !this.cab) return;
    this.g.sfx.play('shove', { vol: 0.5 });
    await this.runBoard(false);
  }

  /** The board: flop, turn and river reels stop street by street (quicker after a fold). */
  private async runBoard(played: boolean) {
    const { wallet, hud, sfx, fx, stage } = this.g;
    const reels = this.reels!;
    const cab = this.cab!;
    this.state = 'board';
    hud.setActions(null);
    hud.showHint(false);
    cab.setLeverReady(false);
    // the board always shows; after a fold the hand dims instead
    for (const i of BOARD) reels.setDim(i, false);
    if (!played) for (const i of [0, 1]) reels.setDim(i, true);
    this.motor = sfx.reelMotor();
    BOARD.forEach((i, k) => reels.spin(i, k * 0.05));
    const pace = played ? 1 : 0.45;
    // the flop
    if (played) cab.message(t('hs.flopMsg'));
    await wait(0.9 * pace);
    const flop = [2, 3, 4].map((i, k) => wait(k * 0.22 * pace).then(() => reels.stop(i, this.stops[i])));
    await Promise.all(flop);
    if (played) this.made(this.deal.slice(0, 5));
    // the turn
    if (played) cab.message(t('hs.turnMsg'));
    await wait(0.55 * pace);
    await reels.stop(5, this.stops[5]);
    if (played) this.made(this.deal.slice(0, 6));
    // the river: it keeps spinning when a big hand is one card away
    if (played) {
      cab.message(t('hs.riverMsg'));
      if (this.anticipate()) {
        reels.setGlow(6, true);
        sfx.anticipation(1.5);
        await wait(1.5);
      } else await wait(0.55);
    } else await wait(0.2);
    await reels.stop(6, this.stops[6]);
    reels.setGlow(6, false);
    this.motor?.();
    this.motor = null;
    if (!this.cab) return;

    const best = bestHand(this.deal);
    const row = hsRow(best);
    const name = t(CAT_NAME[best.cat]);
    const ante = this.ante;
    let banner: Promise<void>;
    let wager = ante;
    let won = 0;
    if (!played) {
      cab.message(t('hs.folded', { hand: name }));
      sfx.lose();
      banner = hud.banner(t('hs.foldBanner'), `-${money(ante)}`, 'lose small', 900);
    } else {
      wager = ante * (1 + HS.play);
      this.made(this.deal);
      if (row >= 0) {
        won = HS_ROWS[row].pays * wager;
        const big = row <= 2;
        wallet.credit(won);
        cab.highlight(row);
        reels.showWin(this.deal.map((c) => best.cards.includes(c)));
        cab.setWinState(big ? 'bigwin' : 'win');
        cab.setWon(won, true, ante);
        cab.credits();
        cab.message(t('hs.winMsg', { hand: name, n: money(won) }), big ? 3 : 0);
        if (won > wager) fx.burst(stage.screenToTable(0.5, 0.5, 0.3), big ? 200 : row <= 4 ? 90 : 40);
        if (big) {
          sfx.jackpot();
          this.g.trophy('big');
        } else if (won > wager) {
          sfx.win(row <= 4);
          sfx.coins(Math.min(30, 4 + HS_ROWS[row].pays * 2), 0.2);
        } else sfx.push();
        banner = hud.banner(name.toUpperCase(), won > wager ? `+${money(won)}` : t('hs.push'), row <= 4 ? 'win' : 'win small', big ? 2000 : 1200);
      } else {
        cab.message(t('hs.noWin', { hand: name }));
        sfx.lose();
        banner = Promise.resolve();
      }
    }
    await finishXP(this.g, wager, won - wager, banner);
    if (!this.cab) return;
    for (const i of [0, 1]) this.reels?.setDim(i, false);
    this.state = 'idle';
    this.idleBar();
  }

  /** True when the river card could still make four of a kind or better. */
  private anticipate() {
    const known = this.deal.slice(0, 6);
    const dead = new Set(known);
    for (let c = 0; c < 52; c++) {
      if (dead.has(c)) continue;
      if (bestOf([...known, c]).cat >= Cat5.Quads) return true;
    }
    return false;
  }
}
