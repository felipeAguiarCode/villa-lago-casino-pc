import * as THREE from 'three';
import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import { cryptoRng } from '../../core/rng';
import { money } from '../../core/wallet';
import { wait } from '../../table/anim';
import { CHIP_H } from '../../table/chips';
import { FELTS, type FeltKey } from '../../table/table';
import type { SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { rouletteLayout, type Layout } from './layout';
import { layoutPrint, wheelShadow } from './print';
import { BET_BY_ID, betWins, colorOf, LIMITS, settleRoulette, type BetDef } from './rules';
import { makeDolly, RouletteWheel } from './wheel';

addStrings(
  {
    'roulette.print1': 'EUROPEAN ROULETTE',
    'roulette.print2': 'Single zero  ·  Inside bets up to {a}  ·  Outside bets up to {b}  ·  Zero loses the even-money bets',
    'roulette.doz1': '1st 12',
    'roulette.doz2': '2nd 12',
    'roulette.doz3': '3rd 12',
    'roulette.column': '2 to 1',
    'roulette.low': '1-18',
    'roulette.high': '19-36',
    'roulette.even': 'EVEN',
    'roulette.odd': 'ODD',
    'roulette.red': 'RED',
    'roulette.black': 'BLACK',
    'roulette.green': 'GREEN',
    'roulette.needBet': 'Place a chip on the layout',
    'roulette.spin': 'Spin',
    'roulette.last': 'LAST NUMBERS',
    'roulette.none': 'No spins yet',
    'roulette.big': 'STRAIGHT UP {n}',
    'roulette.k.straight': 'Straight up',
    'roulette.k.split': 'Split',
    'roulette.k.street': 'Street',
    'roulette.k.corner': 'Corner',
    'roulette.k.line': 'Six line',
    'roulette.k.column': 'Column',
    'roulette.k.dozen': 'Dozen',
    'roulette.rules': `
      <p>Classic <b>European roulette</b>: one zero and 37 pockets. Choose a chip, click a place on the layout to bet it (right-click takes a chip back), then <b>Spin</b>. The croupier spins the wheel one way and the ball the other; the pocket where the ball comes to rest is the winning number.</p>
      <h4>Inside bets</h4>
      <p><b>Straight up</b> (one number, click its box) pays <b>35:1</b>. <b>Split</b> (two neighbours, on the line between them) <b>17:1</b>. <b>Street</b> (three numbers of a column, on its bottom edge) <b>11:1</b>. <b>Corner</b> (four numbers, where they meet) <b>8:1</b>. <b>Six line</b> (two streets, on the bottom edge between them) <b>5:1</b>. The zero plays too: splits 0-1, 0-2 and 0-3 pay 17:1, the trios 0-1-2 and 0-2-3 pay 11:1, and the <b>first four</b> 0-1-2-3 (bottom corner of the zero) pays 8:1. Inside bets go up to {a} per place.</p>
      <h4>Outside bets</h4>
      <p><b>Columns</b> ("2 to 1") and <b>dozens</b> (1st, 2nd, 3rd 12) pay <b>2:1</b>. <b>Red / Black</b>, <b>Odd / Even</b> and <b>1-18 / 19-36</b> pay <b>1:1</b>. Outside bets go up to {b} per place.</p>
      <h4>The zero</h4>
      <p>Zero is green: it is neither red nor black, odd nor even, low nor high, and it is in no column or dozen. When the ball lands on 0, <b>every even-money bet loses</b>, along with the columns and dozens.</p>
      <h4>The odds</h4>
      <p>Every bet pays as if the wheel had 36 pockets, so each one returns <b>97.30%</b> on average (house edge 2.70%), whatever you play. No system changes that: enjoy the wheel.</p>`,
  },
  {
    'roulette.print1': 'ROLETA EUROPEIA',
    'roulette.print2': 'Zero único  ·  Apostas internas até {a}  ·  Apostas externas até {b}  ·  O zero perde nas apostas simples',
    'roulette.doz1': '1ª 12',
    'roulette.doz2': '2ª 12',
    'roulette.doz3': '3ª 12',
    'roulette.column': '2 para 1',
    'roulette.even': 'PAR',
    'roulette.odd': 'ÍMPAR',
    'roulette.red': 'VERMELHO',
    'roulette.black': 'PRETO',
    'roulette.green': 'VERDE',
    'roulette.needBet': 'Coloque uma ficha no pano',
    'roulette.spin': 'Girar',
    'roulette.last': 'ÚLTIMOS NÚMEROS',
    'roulette.none': 'Nenhuma rodada ainda',
    'roulette.big': 'PLENO NO {n}',
    'roulette.k.straight': 'Pleno',
    'roulette.k.split': 'Cavalo',
    'roulette.k.street': 'Transversal',
    'roulette.k.corner': 'Quadrado',
    'roulette.k.line': 'Linha',
    'roulette.k.column': 'Coluna',
    'roulette.k.dozen': 'Dúzia',
    'roulette.rules': `
      <p><b>Roleta europeia</b> clássica: um zero e 37 casas. Escolha uma ficha, clique num lugar do pano para apostá-la (o botão direito tira uma ficha) e depois <b>Girar</b>. O croupier gira a roda para um lado e a bola para o outro; a casa onde a bola para é o número vencedor.</p>
      <h4>Apostas internas</h4>
      <p><b>Pleno</b> (um número, clique na casa dele) paga <b>35:1</b>. <b>Cavalo</b> (dois vizinhos, na linha entre eles) <b>17:1</b>. <b>Transversal</b> (os três números de uma coluna, na borda de baixo) <b>11:1</b>. <b>Quadrado</b> (quatro números, onde eles se encontram) <b>8:1</b>. <b>Linha</b> (duas transversais, na borda de baixo entre elas) <b>5:1</b>. O zero também joga: os cavalos 0-1, 0-2 e 0-3 pagam 17:1, os trios 0-1-2 e 0-2-3 pagam 11:1 e o <b>quadrado do zero</b> 0-1-2-3 (canto de baixo do zero) paga 8:1. Apostas internas vão até {a} por lugar.</p>
      <h4>Apostas externas</h4>
      <p><b>Colunas</b> ("2 para 1") e <b>dúzias</b> (1ª, 2ª, 3ª 12) pagam <b>2:1</b>. <b>Vermelho / Preto</b>, <b>Ímpar / Par</b> e <b>1-18 / 19-36</b> pagam <b>1:1</b>. Apostas externas vão até {b} por lugar.</p>
      <h4>O zero</h4>
      <p>O zero é verde: não é vermelho nem preto, ímpar nem par, baixo nem alto, e não está em nenhuma coluna ou dúzia. Quando a bola cai no 0, <b>todas as apostas simples perdem</b>, junto com colunas e dúzias.</p>
      <h4>As chances</h4>
      <p>Toda aposta paga como se a roda tivesse 36 casas, então cada uma devolve <b>97,30%</b> em média (vantagem da casa de 2,70%), seja qual for. Nenhum sistema muda isso: aproveite a roda.</p>`,
  },
);

/** Chips on the layout are a little smaller, so they sit on the cells and on the lines. */
const CHIP_SCALE = 0.8;
/** The roulette felt once it is in FELTS; a classic green until then. */
const FELT = ('roulette' in FELTS ? 'roulette' : 'showdown') as FeltKey;
const OUTSIDE = ['col1', 'col2', 'col3', 'doz1', 'doz2', 'doz3', 'low', 'even', 'red', 'black', 'odd', 'high'];
const BADGE: Record<string, string> = {
  red: 'linear-gradient(#d5202f, #8e0c17)',
  black: 'linear-gradient(#2c2c30, #060607)',
  green: 'linear-gradient(#1ea85a, #0b6431)',
};

export class RouletteView extends TableGame {
  readonly id = 'roulette';
  readonly title = 'Roulette';
  protected readonly felt = FELT;
  protected usesCards = false;
  protected placeOnSpotClick = true;
  private L!: Layout;
  private wheel: RouletteWheel | null = null;
  private offFrame: (() => void) | null = null;
  private board: HTMLElement | null = null;
  private history: number[] = [];
  private dolly: ReturnType<typeof makeDolly> | null = null;
  /** Number the dolly marks once it has landed (it then rides the chips under it). */
  private dollyOn: number | null = null;
  private hl: THREE.Group | null = null;
  private hlMeshes = new Map<string, THREE.Mesh>();
  private hover: string | null = null;
  private winKeys = new Set<string>();
  private tmpV = new THREE.Vector3();
  private clock = 0;

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('roulette.rules').split('{a}').join(money(LIMITS.inside)).split('{b}').join(money(LIMITS.outside));
  }

  protected defaultBets() {
    return { red: 25 };
  }

  // ---------------------------------------------------------------- layout
  /** Frame position (u, v) of a table point: the inverse of stage.screenToTable. */
  private toUV(x: number, z: number) {
    const st = this.g.stage;
    let lo = -2;
    let hi = 3;
    for (let i = 0; i < 48; i++) {
      const m = (lo + hi) / 2;
      if (st.screenToTable(0.5, m, 0, this.tmpV).z < z) lo = m;
      else hi = m;
    }
    const v = (lo + hi) / 2;
    const half = st.screenToTable(1, v, 0, this.tmpV).x;
    return { u: 0.5 + (0.5 * x) / half, v };
  }

  private spotLabel(b: BetDef) {
    if (b.kind === 'straight') return String(b.numbers[0]);
    if (b.kind === 'even') return t(`roulette.${b.id}`);
    if (b.kind === 'column' || b.kind === 'dozen') return `${t(`roulette.k.${b.kind}`)} ${b.id.slice(-1)}`;
    return `${t(`roulette.k.${b.kind}`)} ${b.numbers.join('-')}`;
  }

  protected spotDefs(): SpotDef[] {
    // one anchor, then everything in table units so the wheel and the grid keep their shape
    const a = this.g.stage.screenToTable(0.5, 0.5);
    this.L = rouletteLayout(a.x, a.z);
    return this.L.spots.map((s) => {
      const { u, v } = this.toUV(s.x, s.z);
      return {
        id: s.bet.id,
        label: this.spotLabel(s.bet),
        u,
        v,
        ring: false,
        size: Math.min(s.w, s.h),
        hitW: s.w,
        hitH: s.h,
        max: s.bet.inside ? LIMITS.inside : LIMITS.outside,
      };
    });
  }

  protected decorate() {
    const { table, stage } = this.g;
    const L = this.L;
    const P = L.print;
    table.addDecalAt(
      layoutPrint(L, {
        title: t('roulette.print1'),
        sub: t('roulette.print2', { a: money(LIMITS.inside), b: money(LIMITS.outside) }),
        dozens: [t('roulette.doz1'), t('roulette.doz2'), t('roulette.doz3')],
        column: t('roulette.column'),
        low: t('roulette.low'),
        even: t('roulette.even'),
        odd: t('roulette.odd'),
        high: t('roulette.high'),
      }),
      (P.x0 + P.x1) / 2,
      (P.z0 + P.z1) / 2,
      P.x1 - P.x0,
    );
    table.addDecalAt(wheelShadow(), L.wheel.x + 0.05, L.wheel.z + 0.12, L.wheel.r * 2.42);
    if (!this.wheel) {
      this.wheel = new RouletteWheel(stage.scene.environment);
      this.wheel.group.position.set(L.wheel.x, 0, L.wheel.z);
      stage.table.add(this.wheel.group);
      this.offFrame = stage.onFrame((dt) => this.frame(dt));
    }
    this.buildHighlights();
    for (const s of this.spots.spots.values()) {
      s.pile.group.scale.setScalar(CHIP_SCALE);
      s.label.el.style.fontSize = 'calc(4.2 * var(--u))';
      s.hit.addEventListener('pointerenter', () => (this.hover = s.def.id));
      s.hit.addEventListener('pointerleave', () => {
        if (this.hover === s.def.id) this.hover = null;
      });
      // the layout print draws every place: free the unused ring canvases (157 of them)
      const tex = (s.ring.material as THREE.MeshStandardMaterial).map;
      const cv = tex?.image as HTMLCanvasElement | undefined;
      if (cv && 'width' in cv) cv.width = cv.height = 1;
    }
    this.buildBoard();
  }

  // ---------------------------------------------------------------- highlights (hover and result)
  private buildHighlights() {
    this.disposeHighlights();
    const grp = new THREE.Group();
    const add = (key: string, x: number, z: number, w: number, h: number) => {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffe3a0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), mat);
      m.position.set(x, 0.004, z);
      m.renderOrder = 2;
      m.visible = false;
      grp.add(m);
      this.hlMeshes.set(key, m);
    };
    for (const [n, c] of this.L.cells) add(`n${n}`, c.x, c.z, c.w - 0.05, c.h - 0.05);
    for (const [id, b] of this.L.boxes) add(id, b.x, b.z, b.w - 0.05, b.h - 0.05);
    this.g.stage.table.add(grp);
    this.hl = grp;
  }

  private disposeHighlights() {
    if (!this.hl) return;
    for (const m of this.hl.children as THREE.Mesh[]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.hl.removeFromParent();
    this.hl = null;
    this.hlMeshes.clear();
  }

  private frame(dt: number) {
    this.clock += dt;
    this.wheel?.update(dt);
    if (this.dolly && this.dollyOn !== null) {
      // when the chips under the dolly are paid or swept away, it settles onto the felt
      const o = this.dolly.obj;
      const y = this.stackTop(this.dollyOn);
      o.position.y += (y - o.position.y) * Math.min(1, dt * 16);
    }
    if (!this.hl) return;
    const hov = this.spots?.betting && this.hover ? BET_BY_ID.get(this.hover) : undefined;
    const lit = new Set<string>();
    if (hov) {
      for (const n of hov.numbers) lit.add(`n${n}`);
      if (!hov.inside) lit.add(hov.id);
    }
    const pulse = 0.3 + 0.16 * Math.sin(this.clock * 5.2);
    const k = Math.min(1, dt * 14);
    for (const [key, m] of this.hlMeshes) {
      const mat = m.material as THREE.MeshBasicMaterial;
      const target = this.winKeys.has(key) ? pulse : lit.has(key) ? 0.2 : 0;
      mat.opacity += (target - mat.opacity) * k;
      m.visible = mat.opacity > 0.004;
    }
  }

  // ---------------------------------------------------------------- history board
  private buildBoard() {
    this.board?.remove();
    const el = document.createElement('div');
    el.className = 'roulette-board';
    el.style.cssText = [
      'position:absolute',
      'left:calc(3*var(--u))',
      'top:calc(18.5*var(--u))',
      'z-index:4',
      'pointer-events:none',
      'padding:calc(1.1*var(--u-panel)) calc(1.5*var(--u-panel)) calc(1.4*var(--u-panel))',
      'border-radius:calc(2*var(--u-panel))',
      'background:linear-gradient(180deg,rgba(20,15,10,.9),rgba(6,5,4,.9))',
      'border:calc(.45*var(--u-panel)) solid #c9a35a',
      'box-shadow:0 calc(1*var(--u)) calc(2.4*var(--u)) rgba(0,0,0,.55)',
    ].join(';');
    const title = document.createElement('div');
    title.textContent = t('roulette.last');
    title.style.cssText =
      "font:700 calc(2.5*var(--u-panel))/1 'Cinzel',serif;letter-spacing:.14em;color:#e6c27a;margin-bottom:calc(.9*var(--u-panel));text-align:left";
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:calc(.6*var(--u-panel));min-height:calc(5.4*var(--u-panel))';
    el.append(title, row);
    this.g.hud.root.appendChild(el);
    this.board = el;
    this.renderBoard();
  }

  private renderBoard() {
    const row = this.board?.lastElementChild as HTMLElement | undefined;
    if (!row) return;
    if (!this.history.length) {
      const e = document.createElement('span');
      e.textContent = t('roulette.none');
      e.style.cssText = "font:italic 500 calc(2.6*var(--u-panel))/1 'Barlow Condensed',sans-serif;color:rgba(246,240,220,.55);letter-spacing:.04em";
      row.replaceChildren(e);
      return;
    }
    row.replaceChildren(
      ...this.history.map((n, i) => {
        const b = document.createElement('i');
        const s = i === 0 ? 5.4 : 4.4;
        b.textContent = String(n);
        b.style.cssText = [
          'display:grid',
          'place-items:center',
          'font-style:normal',
          `width:calc(${s}*var(--u-panel))`,
          `height:calc(${s}*var(--u-panel))`,
          'border-radius:50%',
          `font:700 calc(${i === 0 ? 2.9 : 2.4}*var(--u-panel))/1 'Barlow Condensed',sans-serif`,
          'color:#fff',
          `background:${BADGE[colorOf(n)]}`,
          `box-shadow:inset 0 calc(.3*var(--u-panel)) 0 rgba(255,255,255,.18), 0 0 0 calc(${i === 0 ? 0.35 : 0.18}*var(--u-panel)) ${i === 0 ? '#f0cf7a' : 'rgba(201,163,90,.7)'}`,
          `opacity:${1 - i * 0.035}`,
        ].join(';');
        return b;
      }),
    );
  }

  private pushHistory(n: number) {
    this.history.unshift(n);
    this.history.length = Math.min(this.history.length, 12);
    this.renderBoard();
  }

  // ---------------------------------------------------------------- round
  protected validate() {
    return this.spots.total >= LIMITS.min ? '' : t('roulette.needBet');
  }

  protected toBetting() {
    this.winKeys.clear();
    this.liftDolly();
    super.toBetting();
    // the croupier spins rather than deals
    const lbl = this.g.hud.root.querySelector('.vbtn[data-id="deal"] .lbl');
    if (lbl) lbl.textContent = t('roulette.spin');
  }

  protected async playRound() {
    const { sfx, fx } = this.g;
    const bets = this.spots.amounts();
    // the result is drawn first; the wheel then plays it out
    const n = cryptoRng(37);
    const ret = settleRoulette(bets, n);
    this.hover = null;
    await wait(0.2);
    await this.wheel!.spin(n, sfx);
    await wait(0.25);
    await this.dropDolly(n);
    const col = colorOf(n);
    const L = this.L;
    const pin = this.tag(`${n}  ${t(`roulette.${col}`)}`, 'win', L.wheel.x, L.wheel.z + L.wheel.r + 0.3);
    pin.el.style.background = BADGE[col];
    pin.el.style.color = '#fff';
    pin.el.style.borderColor = '#e8c879';
    this.pushHistory(n);
    this.winKeys = new Set([`n${n}`, ...OUTSIDE.filter((id) => betWins(id, n))]);
    const straight = (bets[`n${n}`] ?? 0) > 0;
    if (straight) {
      const c = L.cells.get(n)!;
      fx.burst(new THREE.Vector3(c.x, 0.3, c.z), 110);
    }
    await wait(0.45);
    await this.settle(ret, { big: straight ? t('roulette.big', { n }) : undefined });
  }

  /** The croupier sets the dolly on the winning number (on top of any chips there). */
  private async dropDolly(n: number) {
    this.liftDolly(true);
    const c = this.L.cells.get(n)!;
    const top = this.stackTop(n);
    const d = makeDolly(this.g.stage.scene.environment);
    this.dolly = d;
    const o = d.obj;
    o.position.set(c.x + 0.25, top + 1.1, c.z - 0.6);
    o.rotation.set(0.35, 0, -0.25);
    this.g.stage.table.add(o);
    const tl = gsap.timeline();
    tl.to(o.position, { x: c.x, z: c.z, duration: 0.42, ease: 'power2.out' }, 0)
      .to(o.position, { y: top, duration: 0.42, ease: 'power2.in' }, 0)
      .to(o.rotation, { x: 0, z: 0, y: 1.4, duration: 0.42, ease: 'power1.out' }, 0)
      .call(() => this.g.sfx.play('chip', { vol: 0.75, rate: 0.75 }))
      .to(o.position, { y: top + 0.035, duration: 0.09, ease: 'power2.out' })
      .to(o.position, { y: top, duration: 0.1, ease: 'power2.in' })
      .to(o.rotation, { x: 0.06, duration: 0.07, yoyo: true, repeat: 1, ease: 'sine.inOut' }, '<-0.05');
    await tl.then();
    if (this.dolly === d) this.dollyOn = n;
  }

  /** Height of the chips on a number's straight-up place (0 once they have slid away). */
  private stackTop(n: number) {
    const s = this.spots.spots.get(`n${n}`);
    if (!s || !s.amount) return 0;
    const c = this.L.cells.get(n)!;
    const p = s.pile.group.position;
    if (Math.hypot(p.x - c.x, p.z - c.z) > 0.05) return 0;
    return Math.min(14, s.pile.values.length) * CHIP_H * CHIP_SCALE;
  }

  private liftDolly(now = false) {
    const d = this.dolly;
    if (!d) return;
    this.dolly = null;
    this.dollyOn = null;
    if (now) return d.dispose();
    const o = d.obj;
    gsap
      .timeline({ onComplete: () => d.dispose() })
      .to(o.position, { y: o.position.y + 0.9, z: o.position.z - 0.5, duration: 0.4, ease: 'power2.in' }, 0)
      .to(o.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.25, ease: 'power2.in' }, 0.15);
  }

  // ---------------------------------------------------------------- per frame
  protected onSync() {
    const st = this.g.stage;
    for (const s of this.spots.spots.values()) {
      for (const p of s.payouts) p.group.scale.setScalar(CHIP_SCALE);
      if (s.amount <= 0) continue;
      // the amount sits on top of its stack, so neighbouring bets don't cover each other's
      const gp = s.pile.group.position;
      const h = Math.min(14, s.pile.values.length) * CHIP_H * CHIP_SCALE;
      const p = st.toScreen(this.tmpV.set(gp.x, h + 0.01, gp.z));
      s.label.place(p.x, p.y);
    }
  }

  protected cleanup() {
    this.offFrame?.();
    this.offFrame = null;
    this.wheel?.dispose();
    this.wheel = null;
    this.disposeHighlights();
    this.liftDolly(true);
    this.board?.remove();
    this.board = null;
    this.hover = null;
    this.winKeys.clear();
  }
}
