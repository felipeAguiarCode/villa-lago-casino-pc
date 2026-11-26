import * as THREE from 'three';
import gsap from 'gsap';
import { Sfx } from './audio/sfx';
import { parseCard } from './core/cards';
import { loadSettings, saveSettings, SPEED_SCALE, type Settings } from './core/settings';
import { money, REFILL_BELOW, START_BALANCE, Wallet } from './core/wallet';
import { ICONS } from './ui/icons';
import { BlackjackView } from './games/blackjack/view';
import { ThreeCardView } from './games/threecard/view';
import { CaribbeanView } from './games/caribbean/view';
import { UthView } from './games/uth/view';
import { BaccaratView } from './games/baccarat/view';
import { VideoPokerView } from './games/videopoker/view';
import { WarView } from './games/war/view';
import { LetItRideView } from './games/letitride/view';
import { RedDogView } from './games/reddog/view';
import { PaiGowView } from './games/paigow/view';
import { FourCardView } from './games/fourcard/view';
import { Holdem3View } from './games/holdem3/view';
import { RussianView } from './games/russian/view';
import { DoubleDrawView } from './games/doubledraw/view';
import { AbyssView } from './games/abyss/view';
import { DragonTigerView } from './games/dragontiger/view';
import { ManilhaDrawView } from './games/brazil/view/manilhaDraw';
import { ManilhaHoldemView } from './games/brazil/view/manilhaHoldem';
import { CanastraDrawView, PifeExpressView, VideoPifeView } from './games/brazil/view/drawGames';
import { setFavicon } from './ui/emblem';
import { ShowdownView } from './games/showdown/view';
import { Trump21View } from './games/trump21/view';
import { ThbView } from './games/thb/view';
import { Crazy4View } from './games/crazy4/view';
import { HcfView } from './games/hcf/view';
import { Slot3View } from './games/slot3/view';
import { VideoBlackjackView } from './games/videobj/view';
import { HighLowView } from './games/highlow/view';
import { RouletteView } from './games/roulette/view';
import { PartyBlackjackView } from './games/partybj/view';
import { CoinFlipView } from './games/coinflip/view';
import { HorsesView } from './games/horses/view';
import { HoldemSlotsView } from './games/holdemslots/view';
import { PokerSlotsView } from './games/pokerslots/view';
import { PartyUthView } from './games/partyuth/view';
import { VanunuView } from './games/vanunu/view';
import { CrapsView } from './games/craps/view';
import { PartyTrumpView } from './games/partytrump/view';
import { PartyHorsesView } from './games/partyhorses/view';
import { PartyStudView } from './games/partystud/view';
import { Stud7View } from './games/stud7/view';
import { PokerDiceView } from './games/pokerdice/view';
import { SuitPokerView } from './games/suitpoker/view';
import { PartyThreeCardView } from './games/partytcp/view';
import { RedBlackView } from './games/redblack/view';
import { PickNumberView } from './games/picknum/view';
import { GAMES } from './games/registry';
import type { GameCtx, GameView } from './games/types';
import { collectCards, dealCard, flipCard, wait } from './table/anim';
import { shuffleShow } from './table/shuffle';
import { loadCourtArt } from './table/cardFaces';
import { CardFactory, REST_Y, type Card3D } from './table/cardMesh';
import { ChipPile, ChipSet } from './table/chips';
import { Fx } from './table/fx';
import { Stage } from './table/stage';
import { PRINT_SCALE, PRINT_SCALE_FOR, Table } from './table/table';
import { Decor } from './table/decor';
import { BRAND_TINT, TABLE_DECK, type Brand } from './table/deckBrands';
import { renderPatternBack } from './table/backPatterns';
import { Wind } from './table/wind';
import { DeckScreen } from './ui/deckMenu';
import { Hud } from './ui/hud';
import { GameSelect } from './ui/gameSelect';
import { TitleScreen } from './ui/title';
import { TrophyScreen, TrophyToast } from './ui/trophies';
import { Trophies } from './core/trophies';
import { browserStore } from './core/storage';
import { PC_FRAMING } from './games/pcFraming';
import { creditsHtml, openSettings } from './ui/panels';
import { t } from './core/i18n';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export class App {
  readonly frame = document.getElementById('frame')!;
  readonly settings: Settings = loadSettings();
  readonly wallet = new Wallet();
  sfx!: Sfx;
  stage!: Stage;
  table!: Table;
  cards!: CardFactory;
  chips!: ChipSet;
  fx!: Fx;
  hud!: Hud;
  lobby!: GameSelect;
  trophies!: Trophies;
  decor!: Decor;
  /** Lobby tile id of the table being played ('' in the lobby). */
  currentId = '';
  private brandBacks = new Map<string, HTMLCanvasElement>();

  /**
   * PC: every table plays with its own deck (src/table/deckBrands.ts): the card backs, the box on
   * the felt and the cards spilling out of it. The house deck follows the card-back setting.
   */
  /** The table's deck: its brand's box, and card backs in the player's pattern and colour (Deck screen). */
  private applyDeck(id: string) {
    const deck = TABLE_DECK[id] ?? { brand: 'house' as Brand };
    const tint = this.backTintFor(id);
    const key = `${this.settings.backPattern}|${tint}`;
    let back = this.brandBacks.get(key);
    if (!back) {
      if (this.brandBacks.size >= 6) this.brandBacks.clear();
      back = renderPatternBack(this.settings.backPattern, tint);
      this.brandBacks.set(key, back);
    }
    this.cards.setBackCanvas(back);
    this.table.setDeck(deck.brand, !!deck.open, back);
  }

  /** The card backs' colour at a table: the player's choice, or the table deck's own colour. */
  private backTintFor(id: string) {
    if (this.settings.backTint !== 'table') return this.settings.backTint;
    return BRAND_TINT[(TABLE_DECK[id] ?? { brand: 'house' as Brand }).brand];
  }

  // ------------------------------------------------------------------ bankroll: reset and game over
  /** The smallest bet anywhere in the casino: below it, with nothing on the felt, the game is over. */
  private static readonly MIN_BET = 5;
  private brokeTicks = 0;
  private gameOverOn = false;

  private checkBroke() {
    const g = this.current;
    const broke =
      !!g && !this.gameOverOn && !this.switching && !this.opening && !g.inRound && this.wallet.balance < App.MIN_BET && (g.stakeOnTable?.() ?? 0) <= 0;
    // two checks in a row, so a payout still landing never counts as broke
    this.brokeTicks = broke ? this.brokeTicks + 1 : 0;
    if (this.brokeTicks >= 2) {
      this.brokeTicks = 0;
      void this.gameOver();
    }
  }

  /** Out of chips: back to Game Select, GAME OVER, and a new game with the starting bankroll. */
  private async gameOver() {
    this.gameOverOn = true;
    this.sfx.lose();
    await this.showLobby();
    const el = document.createElement('section');
    el.className = 'gameover live';
    el.innerHTML = `
      <div class="go-box">
        <h1 class="go-title">GAME OVER</h1>
        <p class="go-text">${t('go.text')}</p>
        <button class="go-btn live">${ICONS.redo}<span>${t('go.new', { n: money(START_BALANCE) })}</span></button>
      </div>`;
    el.addEventListener('click', (e) => e.stopPropagation());
    this.frame.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    await new Promise<void>((done) => {
      el.querySelector<HTMLButtonElement>('.go-btn')!.onclick = () => done();
    });
    this.sfx.click();
    this.startOver();
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
    this.gameOverOn = false;
  }

  /** A new game: the starting bankroll and level 1 (trophies are kept). */
  private startOver() {
    this.wallet.reset();
    this.trophies.balance(this.wallet.balance);
    this.lobby.refresh();
    this.sfx.win();
    this.hud.toast(t('go.started', { n: money(START_BALANCE) }), 2600);
  }

  private async confirmReset() {
    const pick = await this.hud.prompt(t('rs.title'), t('rs.text', { n: money(START_BALANCE) }), [
      { id: 'no', label: t('rs.cancel'), color: 'red', icon: 'close' },
      { id: 'yes', label: t('rs.confirm'), color: 'green', icon: 'redo' },
    ]);
    if (pick === 'yes') this.startOver();
  }

  private openDeck() {
    this.sfx.click();
    new DeckScreen(this.frame, this.settings, this.backTintFor(this.currentId || 'lobby'), (s) => this.applySettings(s), () => this.sfx.click()).open();
  }
  ctx!: GameCtx;
  readonly games = new Map<string, GameView>();
  current: GameView | null = null;
  private showcase: Card3D[] = [];
  private switching = false;
  private opening = false;
  private backKey = '';
  private lang = '';

  async boot(progress: (f: number, msg: string) => void) {
    progress(0.05, t('load.fonts'));
    const fonts = [
      '700 40px "Cinzel"',
      '900 40px "Cinzel"',
      '500 40px "Barlow Condensed"',
      '600 40px "Barlow Condensed"',
      '700 40px "Barlow Condensed"',
      'italic 500 40px "Barlow Condensed"',
      'italic 600 40px "Barlow Condensed"',
      'italic 700 40px "Barlow Condensed"',
      'italic 800 40px "Barlow Condensed"',
    ];
    await Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null)));

    progress(0.2, t('load.table'));
    const base = import.meta.env.BASE_URL + 'assets/';
    const [feltImg] = await Promise.all([loadImage(base + 'felt/felt_grey_1k.jpg').catch(() => null), loadCourtArt(base + 'cards/court/')]);

    progress(0.4, t('load.chips'));
    this.stage = new Stage(this.frame);
    this.cards = new CardFactory(this.stage.table, this.stage.renderer, this.settings.back);
    this.table = new Table(this.stage, feltImg, () => this.cards.backTexture);
    this.chips = new ChipSet();
    // PC: decorative 3D pieces beside the play area, a set per table (models load in the background)
    this.decor = new Decor(this.stage, this.chips, () => this.cards.backTexture.image as HTMLCanvasElement);
    void this.decor.load(base + 'models/');
    this.fx = new Fx(this.stage.table);
    this.sfx = new Sfx(base + 'sfx/');
    this.hud = new Hud(this.frame, this.chips, this.sfx);
    ChipPile.landSound = (n) => this.sfx.play('stack', { vol: 0.5 + Math.min(0.3, n * 0.03), rate: 1 + Math.min(0.12, n * 0.012) });
    this.stage.onFrame((dt) => {
      this.cards.update();
      this.fx.update(dt);
    });

    await this.sfx.load((f) => progress(0.45 + f * 0.45, t('load.sound')));

    this.ctx = {
      stage: this.stage,
      table: this.table,
      cards: this.cards,
      chips: this.chips,
      fx: this.fx,
      hud: this.hud,
      sfx: this.sfx,
      wallet: this.wallet,
      settings: this.settings,
      trophy: (e) => {
        if (this.currentId) this.trophies.event(this.currentId, e);
      },
    };
    // PC: trophies (a finished hand comes from the wallet, special results from the tables)
    this.trophies = new Trophies(
      GAMES.map((g) => ({ id: g.id, title: g.title })),
      browserStore(),
    );
    const toast = new TrophyToast(this.frame, (tier) => this.sfx.achievement(tier === 'gold' || tier === 'platinum'));
    this.trophies.onEarn((list) => toast.show(list));
    this.trophies.balance(this.wallet.balance);
    this.wallet.onHand((w, n) => {
      if (this.currentId) this.trophies.hand(this.currentId, w, n, this.wallet.balance, this.wallet.s.level);
    });
    this.games.set('blackjack', new BlackjackView(this.ctx));
    const tcp = new ThreeCardView(this.ctx);
    this.games.set('threecard', tcp);
    this.games.set('tcpfaceup', tcp);
    this.games.set('slot3', new Slot3View(this.ctx));
    this.games.set('thb', new ThbView(this.ctx));
    this.games.set('crazy4', new Crazy4View(this.ctx));
    this.games.set('hcf', new HcfView(this.ctx));
    this.games.set('videobj', new VideoBlackjackView(this.ctx));
    this.games.set('videopoker', new VideoPokerView(this.ctx));
    this.games.set('baccarat', new BaccaratView(this.ctx));
    this.games.set('caribbean', new CaribbeanView(this.ctx));
    this.games.set('uth', new UthView(this.ctx));
    this.games.set('letitride', new LetItRideView(this.ctx));
    this.games.set('war', new WarView(this.ctx));
    this.games.set('reddog', new RedDogView(this.ctx));
    this.games.set('paigow', new PaiGowView(this.ctx));
    this.games.set('fourcard', new FourCardView(this.ctx));
    this.games.set('holdem3', new Holdem3View(this.ctx));
    this.games.set('russian', new RussianView(this.ctx));
    this.games.set('doubledraw', new DoubleDrawView(this.ctx));
    this.games.set('showdown', new ShowdownView(this.ctx));
    this.games.set('abyss', new AbyssView(this.ctx));
    this.games.set('dragontiger', new DragonTigerView(this.ctx));
    this.games.set('manilhadraw', new ManilhaDrawView(this.ctx));
    this.games.set('manilhaholdem', new ManilhaHoldemView(this.ctx));
    this.games.set('pifeexpress', new PifeExpressView(this.ctx));
    this.games.set('videopife', new VideoPifeView(this.ctx));
    this.games.set('canastradraw', new CanastraDrawView(this.ctx));
    this.games.set('trump21', new Trump21View(this.ctx));
    this.games.set('highlow', new HighLowView(this.ctx));
    this.games.set('roulette', new RouletteView(this.ctx));
    this.games.set('partybj', new PartyBlackjackView(this.ctx));
    this.games.set('coinflip', new CoinFlipView(this.ctx));
    this.games.set('horses', new HorsesView(this.ctx));
    this.games.set('holdemslots', new HoldemSlotsView(this.ctx));
    this.games.set('pokerslots', new PokerSlotsView(this.ctx));
    this.games.set('partyuth', new PartyUthView(this.ctx));
    this.games.set('vanunu', new VanunuView(this.ctx));
    this.games.set('craps', new CrapsView(this.ctx));
    this.games.set('partytrump', new PartyTrumpView(this.ctx));
    this.games.set('partyhorses', new PartyHorsesView(this.ctx));
    this.games.set('partystud', new PartyStudView(this.ctx));
    this.games.set('stud7', new Stud7View(this.ctx));
    this.games.set('pokerdice', new PokerDiceView(this.ctx));
    this.games.set('suitpoker', new SuitPokerView(this.ctx));
    this.games.set('partytcp', new PartyThreeCardView(this.ctx));
    this.games.set('redblack', new RedBlackView(this.ctx));
    this.games.set('picknum', new PickNumberView(this.ctx));

    this.lobby = new GameSelect(this.frame, {
      games: GAMES,
      previewUrl: (id) => `${base}previews/${id}.jpg`,
      trophies: this.trophies,
      balance: () => this.wallet.balance,
      level: () => this.wallet.s.level,
      xpFrac: () => this.wallet.xpFrac,
      onPlay: (id) => {
        this.sfx.click();
        void this.openGame(id);
      },
      onTrophies: (game) => this.openTrophies(game),
      onDeck: () => this.openDeck(),
      onReset: () => void this.confirmReset(),
      onSettings: () => this.openSettings(),
      onRefill: () => this.refill(),
      onFullscreen: () => {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void document.documentElement.requestFullscreen?.().catch(() => {});
      },
      click: () => this.sfx.click(),
      tick: () => this.sfx.play('place', { vol: 0.25, rate: 1.4 }),
    });

    this.wallet.onChange((w) => {
      this.hud.setBalance(w.balance);
      this.hud.setXP(w.s.level, w.xpFrac);
      this.current?.onWalletChange?.();
      this.trophies.balance(w.balance);
      if (!this.current) this.lobby.refresh();
    });
    this.hud.setBalance(this.wallet.balance, false);
    this.hud.setXP(this.wallet.s.level, this.wallet.xpFrac);
    this.hud.onPlus = () => this.refill();
    this.hud.onGear = () => this.openSettings();
    this.hud.onMenu = (k) => {
      if (k === 'lobby') {
        if (this.current?.inRound) this.hud.toast(t('toast.finishRound'));
        else if (this.current) this.showLobby();
      } else if (k === 'rules') this.openRules();
      else if (k === 'settings') this.openSettings();
      else this.hud.modal(t('credits.title'), creditsHtml());
    };
    this.applySettings(this.settings);
    // PC: an empty bankroll ends the game (checked between hands)
    window.setInterval(() => this.checkBroke(), 700);
    progress(1, t('load.ready'));
    this.cards.warm([0, 12, 25, 38, 9, 10, 11].map((c) => c));
  }

  /** After the splash: the title screen over the lobby table, then Game Select. */
  async start() {
    setFavicon();
    this.frame.classList.add('in-title');
    const lobby = this.showLobby(false, false, false);
    this.titleDone = lobby.then(() => this.titleShow());
    await new TitleScreen(this.frame).run(() => {
      this.sfx.click();
      this.frame.classList.remove('in-title');
      this.titleOn = false;
      void lobby.then(async () => {
        this.lobby.show(true);
        await this.clearTitleCards();
      });
    });
  }

  private titleOn = false;
  private titleCards: Card3D[] = [];
  private titleWind: Wind | null = null;
  /** Resolves when the title screen's shuffle loop has put its deck away. */
  private titleDone: Promise<void> = Promise.resolve();

  /**
   * The title screen's table: random cards scattered round the felt, turning over now and then,
   * and the deck in the middle running one shuffle routine after another until Enter is pressed.
   */
  private async titleShow() {
    this.titleOn = true;
    const { stage, table, cards } = this;
    // the title's name fills the top of the screen: the cards keep to the lower half
    const c0 = stage.screenToTable(0.5, 0.68);
    const rnd = () => Math.floor(Math.random() * 52);
    const n = 12;
    for (let i = 0; i < n && this.titleOn; i++) {
      const a = -0.45 + (i / (n - 1)) * (Math.PI + 0.9) + (Math.random() - 0.5) * 0.12;
      const pos = new THREE.Vector3(c0.x + Math.cos(a) * (3.1 + Math.random() * 0.4), REST_Y + i * 0.003, c0.z - 0.15 + Math.sin(a) * (0.8 + Math.random() * 0.15));
      const c = cards.create(rnd());
      this.titleCards.push(c);
      void dealCard(c, table.shoeMouth(), table.shoeYaw, { pos, yaw: (Math.random() - 0.5) * 1.4 }, { faceUp: true, onLand: () => this.sfx.play('place', { vol: 0.3 }) });
      await wait(0.09);
    }
    // a breeze: now and then a gust lifts a few cards and blows them across the felt
    const flipping = new Set<Card3D>();
    const deckAt = stage.screenToTable(0.5, 0.66);
    this.titleWind = new Wind({
      stage,
      cards: () => this.titleCards,
      busy: (c) => flipping.has(c),
      spawn: () => {
        if (!this.titleOn || this.titleCards.length >= 15) return null;
        const c = cards.create(rnd());
        this.titleCards.push(c);
        return c;
      },
      onLost: (c) => {
        this.titleCards = this.titleCards.filter((x) => x !== c);
        cards.destroy(c);
      },
      onGust: (s) => this.sfx.whoosh(0.5 + s * 0.6),
      onTouch: (v) => {
        if (v > 0.5) this.sfx.play('slide', { vol: Math.min(0.32, 0.08 + v * 0.06), rate: 0.9 + Math.random() * 0.3 });
      },
      avoid: () => ({ x: deckAt.x, z: deckAt.z, r: 1.7 }),
    });
    this.titleWind.start();
    // the cards "blink": one turns over and comes back up as another card
    void (async () => {
      while (this.titleOn) {
        await wait(0.7 + Math.random() * 0.6);
        const free = this.titleCards.filter((c) => !this.titleWind?.isFlying(c));
        const c = free[Math.floor(Math.random() * free.length)];
        if (!this.titleOn) break;
        if (!c) continue;
        flipping.add(c);
        await flipCard(c, { dur: 0.35, lift: 0.25, onMid: () => c.setCard(rnd()) });
        flipping.delete(c);
      }
    })();
    await wait(0.4);
    // cardistry: every routine in turn, the long showcases included, never the same twice running
    while (this.titleOn) {
      await shuffleShow(this.ctx, { at: [0.5, 0.66], toast: false, quick: true, title: true });
      await wait(0.25);
    }
  }

  private async clearTitleCards() {
    this.titleWind?.stop();
    this.titleWind = null;
    const list = this.titleCards;
    this.titleCards = [];
    if (!list.length) return;
    this.sfx.play('shove', { vol: 0.5 });
    await collectCards(list, this.table.trayTop(), this.table.trayYaw, (c) => this.cards.destroy(c));
  }

  private openTrophies(game?: string) {
    new TrophyScreen(this.frame, this.trophies, GAMES, () => this.sfx.click(), () => this.lobby.refresh()).open(game);
  }

  private refill() {
    // chips already on a table count too (craps takes them from the rack as they are bet)
    const onTable = this.current?.stakeOnTable?.() ?? 0;
    const add = this.wallet.balance + onTable >= REFILL_BELOW ? 0 : this.wallet.refill();
    if (add > 0) {
      this.trophies.refill(this.wallet.balance);
      this.sfx.win();
      this.fx.burst(new THREE.Vector3(-0.8, 0.4, this.stage.screenToTable(0.25, 0.08).z), 80);
      this.hud.toast(t('toast.refill', { n: money(add) }));
    } else this.hud.toast(t('toast.refillNo', { n: money(REFILL_BELOW) }), 2200);
  }

  applySettings(s: Settings) {
    saveSettings(s);
    if (this.lang && s.lang !== this.lang) {
      // rebuilding every printed felt and panel is simplest with a reload (the splash is skipped)
      try {
        sessionStorage.setItem('vlc.skipSplash', '1');
      } catch {
        /* ignore */
      }
      location.reload();
      return;
    }
    this.lang = s.lang;
    this.sfx.setVolume(s.volume, s.muted);
    if (gsap.globalTimeline.timeScale() !== SPEED_SCALE[s.speed]) gsap.globalTimeline.timeScale(SPEED_SCALE[s.speed]);
    this.stage.setQuality(s.quality);
    const backKey = `${s.backPattern}|${s.backTint}`;
    if (backKey !== this.backKey) {
      // the backs of every card on the table change at once
      if (this.backKey) this.applyDeck(this.currentId || 'lobby');
      this.backKey = backKey;
    }
  }

  private openSettings() {
    openSettings(
      this.hud,
      this.settings,
      (s) => this.applySettings(s),
      () => {
        this.wallet.reset();
        this.hud.toast(t('toast.resetDone'));
      },
      () => this.openDeck(),
    );
  }

  private openRules() {
    if (this.current) this.hud.modal(t('rules.title', { game: this.current.title.toUpperCase() }), this.current.rules());
    else this.hud.modal('VILLA LAGO', t('rules.general'));
  }

  /** Royal flush fanned on the lobby felt. */
  private async placeShowcase(animate: boolean) {
    const { stage, table } = this;
    const center = stage.screenToTable(0.5, 0.64);
    const pivot = new THREE.Vector3(0, 0, center.z + 2.2);
    const codes = ['Th', 'Jh', 'Qh', 'Kh', 'Ah'];
    for (let i = 0; i < codes.length; i++) {
      const c = this.cards.create(parseCard(codes[i]));
      const a = (i - 2) * 0.13;
      const pos = new THREE.Vector3(pivot.x + Math.sin(a) * 2.2, REST_Y + i * 0.004, pivot.z - Math.cos(a) * 2.2);
      this.showcase.push(c);
      if (animate) {
        dealCard(c, table.shoeMouth(), table.shoeYaw, { pos, yaw: -a }, { faceUp: true, onLand: () => this.sfx.play('place', { vol: 0.4 }) });
        await wait(0.12);
      } else {
        c.obj.position.copy(pos);
        c.obj.rotation.set(0, -a, 0);
      }
    }
  }

  private async clearShowcase() {
    const list = this.showcase;
    this.showcase = [];
    if (!list.length) return;
    this.sfx.play('shove', { vol: 0.5 });
    await collectCards(list, this.table.trayTop(), this.table.trayYaw, (c) => this.cards.destroy(c));
  }

  async showLobby(first = false, select = true, showcase = true) {
    if (this.switching) return;
    this.switching = true;
    if (this.current) {
      await this.current.exit();
      this.current = null;
    }
    this.currentId = '';
    this.stage.setFraming(null);
    this.decor.setTheme('lobby');
    this.applyDeck('lobby');
    this.table.setFelt('lobby', !first);
    if (select) this.lobby.show(true);
    this.frame.classList.add('in-lobby');
    this.hud.setActions(null);
    this.hud.setBetBar(null);
    this.hud.showHint(false);
    if (showcase) await this.placeShowcase(!first);
    this.switching = false;
  }

  async openGame(id: string) {
    const g = this.games.get(id);
    if (!g || this.opening) return;
    this.opening = true;
    // a tap during the lobby's opening animation is queued, not ignored
    while (this.switching) await new Promise((r) => setTimeout(r, 50));
    await this.titleDone;
    this.opening = false;
    if (this.current) return;
    this.switching = true;
    this.lobby.show(false);
    this.frame.classList.remove('in-lobby');
    await this.clearShowcase();
    // PC: each table is framed at its own size, and has its own decor
    this.currentId = id;
    this.stage.setFraming(PC_FRAMING[id] ?? null);
    this.table.printScale = PRINT_SCALE_FOR[id] ?? PRINT_SCALE;
    this.decor.setTheme(id);
    this.applyDeck(id);
    this.current = g;
    g.preset?.(id);
    await g.enter();
    this.switching = false;
  }
}
