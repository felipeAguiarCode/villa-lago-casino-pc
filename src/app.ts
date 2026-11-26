import * as THREE from 'three';
import gsap from 'gsap';
import { Sfx } from './audio/sfx';
import { parseCard } from './core/cards';
import { loadSettings, saveSettings, SPEED_SCALE, type Settings } from './core/settings';
import { money, REFILL_BELOW, Wallet } from './core/wallet';
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
import { GAMES } from './games/registry';
import type { GameCtx, GameView } from './games/types';
import { collectCards, dealCard, wait } from './table/anim';
import { loadCourtArt } from './table/cardFaces';
import { CardFactory, REST_Y, type Card3D } from './table/cardMesh';
import { ChipPile, ChipSet } from './table/chips';
import { Fx } from './table/fx';
import { Stage } from './table/stage';
import { Table } from './table/table';
import { Decor } from './table/decor';
import { Hud } from './ui/hud';
import { Lobby } from './ui/lobby';
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
  lobby!: Lobby;
  ctx!: GameCtx;
  readonly games = new Map<string, GameView>();
  current: GameView | null = null;
  private showcase: Card3D[] = [];
  private switching = false;
  private opening = false;
  private backColor = this.settings.back;
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
    // PC: decorative 3D pieces beside the play area (loaded in the background)
    void new Decor(this.stage).load(base + 'models/');
    this.chips = new ChipSet();
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
    };
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

    this.lobby = new Lobby(
      this.frame,
      GAMES,
      (id) => {
        this.sfx.click();
        this.openGame(id);
      },
      (g) => {
        this.sfx.click();
        this.hud.toast(t('lobby.soonToast', { game: g.title }));
      },
    );

    this.wallet.onChange((w) => {
      this.hud.setBalance(w.balance);
      this.hud.setXP(w.s.level, w.xpFrac);
      this.current?.onWalletChange?.();
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
    progress(1, t('load.ready'));
    this.cards.warm([0, 12, 25, 38, 9, 10, 11].map((c) => c));
  }

  /** Shows the lobby once the splash is gone. */
  async start() {
    setFavicon();
    await this.showLobby(false);
  }

  private refill() {
    const add = this.wallet.refill();
    if (add > 0) {
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
    if (s.back !== this.backColor) {
      this.backColor = s.back;
      this.cards.setBack(s.back);
      this.table.refreshBack(this.cards.backTexture);
    }
  }

  private openSettings() {
    openSettings(this.hud, this.settings, (s) => this.applySettings(s), () => {
      this.wallet.reset();
      this.hud.toast(t('toast.resetDone'));
    });
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

  async showLobby(first = false) {
    if (this.switching) return;
    this.switching = true;
    if (this.current) {
      await this.current.exit();
      this.current = null;
    }
    this.table.setFelt('lobby', !first);
    this.lobby.show(true);
    this.frame.classList.add('in-lobby');
    this.hud.setActions(null);
    this.hud.setBetBar(null);
    this.hud.showHint(false);
    await this.placeShowcase(!first);
    this.switching = false;
  }

  async openGame(id: string) {
    const g = this.games.get(id);
    if (!g || this.opening) return;
    this.opening = true;
    // a tap during the lobby's opening animation is queued, not ignored
    while (this.switching) await new Promise((r) => setTimeout(r, 50));
    this.opening = false;
    if (this.current) return;
    this.switching = true;
    this.lobby.show(false);
    this.frame.classList.remove('in-lobby');
    await this.clearShowcase();
    this.current = g;
    g.preset?.(id);
    await g.enter();
    this.switching = false;
  }
}
