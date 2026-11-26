import * as THREE from 'three';
import { addStrings, t } from '../../core/i18n';
import { cryptoRng } from '../../core/rng';
import { wait } from '../../table/anim';
import { REST_Y, type Card3D } from '../../table/cardMesh';
import { FONT, GOLD, INK_SOFT } from '../../table/prints';
import { Paytable } from '../../ui/paytable';
import { highlightCards, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { feltKey, fitPrint, fitText, goldFrame, PPU, unitCanvas, uvAt } from '../highlow/tableKit';
import { dealPn, PN, settlePn, type PnLayout } from './rules';

addStrings(
  {
    'pn.print1': 'PICK A NUMBER',
    'pn.target': 'TARGET',
    'pn.pick': 'PICK',
    'pn.foot1': 'MATCH THE TARGET · PAYS 4 TO 1',
    'pn.foot2': 'Aces count as 1 · when the house Joker is in, nothing matches',
    'pn.needBet': 'Put chips under a card',
    'pn.wait': 'The dealer is laying out the cards…',
    'pn.win': 'WIN',
    'pn.lose': 'LOSE',
    'pn.joker': 'The house Joker! No card matches',
    'pn.big': 'NUMBER!',
    'pn.match': 'Match',
    'pn.jokerRow': 'Joker in the row',
    'pn.jokerPays': 'all lose',
    'pn.rules': `
      <p>The dealer turns a <b>target card</b> (Ace to 10) face up and lays <b>five cards</b> face down in a row. Exactly one of them has the target's number — unless the house slipped in its <b>Joker</b> (1 round in 20): then the Joker takes that place and no card matches.</p>
      <h4>Betting</h4>
      <p>Put chips under one or more of the five cards. The card with the target's number pays <b>4:1</b>. Aces count as 1; suits don't matter.</p>
      <h4>Odds</h4>
      <p>Every card has the same chance, 19 in 100: the return is 95% wherever you bet.</p>`,
  },
  {
    'pn.print1': 'ESCOLHA UM NÚMERO',
    'pn.target': 'ALVO',
    'pn.pick': 'APOSTA',
    'pn.foot1': 'ACERTE O ALVO · PAGA 4 PARA 1',
    'pn.foot2': 'Ás vale 1 · com o coringa da casa na fila, nenhuma carta acerta',
    'pn.needBet': 'Coloque fichas sob uma carta',
    'pn.wait': 'O dealer está distribuindo as cartas…',
    'pn.win': 'GANHA',
    'pn.lose': 'PERDE',
    'pn.joker': 'O coringa da casa! Nenhuma carta acerta',
    'pn.big': 'NÚMERO!',
    'pn.match': 'Acerto',
    'pn.jokerRow': 'Coringa na fila',
    'pn.jokerPays': 'todas perdem',
    'pn.rules': `
      <p>O dealer vira uma <b>carta alvo</b> (Ás a 10) e coloca <b>cinco cartas</b> viradas para baixo numa fila. Exatamente uma delas tem o número do alvo — a não ser que a casa tenha colocado o seu <b>coringa</b> (1 rodada em 20): aí o coringa ocupa esse lugar e nenhuma carta acerta.</p>
      <h4>Apostas</h4>
      <p>Coloque fichas sob uma ou mais das cinco cartas. A carta com o número do alvo paga <b>4:1</b>. Ás vale 1; naipes não contam.</p>
      <h4>Chances</h4>
      <p>Toda carta tem a mesma chance, 19 em 100: o retorno é de 95% onde quer que você aposte.</p>`,
  },
);

const V_ROW = 0.45;
const DARK_INK = '#2a1c05';

interface Lay {
  target: THREE.Vector3;
  rowZ: number;
  xs: number[];
  ringZ: number;
  bannerZ: number;
  footZ: number;
}

/** A manicule (☞) in gold, centred at (x, y), `h` px tall, pointing right (dir 1) or left (-1). */
function hand(g: CanvasRenderingContext2D, x: number, y: number, h: number, dir: 1 | -1) {
  g.save();
  g.translate(x, y);
  g.scale((dir * h) / 64, h / 64);
  g.translate(-50, -32);
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, '#f8e3a0');
  grd.addColorStop(0.55, '#d8b660');
  grd.addColorStop(1, '#9c7426');
  g.lineJoin = 'round';
  g.lineWidth = 2.6;
  g.strokeStyle = '#5e4410';
  const part = (px: number, py: number, w: number, hh: number, r: number) => {
    g.beginPath();
    g.roundRect(px, py, w, hh, r);
    g.fillStyle = grd;
    g.fill();
    g.stroke();
  };
  // cuff with two stitch lines
  part(0, 8, 17, 48, 4);
  g.beginPath();
  g.moveTo(5, 12);
  g.lineTo(5, 52);
  g.moveTo(11, 12);
  g.lineTo(11, 52);
  g.stroke();
  // back of the hand
  part(14, 12, 42, 44, 14);
  // three curled fingers
  part(44, 44, 18, 11, 5.5);
  part(46, 35, 21, 11, 5.5);
  part(47, 26, 24, 11, 5.5);
  // thumb resting along the curled fingers
  part(26, 20, 30, 11, 5.5);
  // the pointing finger, with its nail
  part(46, 13, 54, 13, 6.5);
  g.beginPath();
  g.moveTo(90, 15.5);
  g.quadraticCurveTo(97, 19.5, 90, 23.5);
  g.stroke();
  g.restore();
}

/** The felt banner: a ribbon with the name, and a pointing hand at each end. */
function bannerPrint(text: string): HTMLCanvasElement {
  const wU = 4.0;
  const hU = 0.72;
  const { cv, g, W, H } = unitCanvas(wU, hU);
  const x0 = 0.78 * PPU;
  const x1 = W - 0.78 * PPU;
  const y0 = 0.12 * PPU;
  const y1 = H - 0.12 * PPU;
  // ribbon tails, folded behind
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.strokeStyle = GOLD;
  g.lineWidth = 4;
  g.globalAlpha = 0.85;
  for (const side of [-1, 1]) {
    const ex = side < 0 ? x0 : x1;
    const out = ex + side * 0.26 * PPU;
    g.beginPath();
    g.moveTo(ex - side * 0.12 * PPU, y0 + 0.1 * PPU);
    g.lineTo(out, y0 + 0.1 * PPU);
    g.lineTo(out - side * 0.09 * PPU, (y0 + y1) / 2 + 0.05 * PPU);
    g.lineTo(out, y1 + 0.08 * PPU);
    g.lineTo(ex - side * 0.12 * PPU, y1 + 0.08 * PPU);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.restore();
  // the ribbon
  const grd = g.createLinearGradient(0, y0, 0, y1);
  grd.addColorStop(0, 'rgba(10,20,60,0.35)');
  grd.addColorStop(1, 'rgba(4,10,36,0.5)');
  goldFrame(g, x0, y0, x1 - x0, y1 - y0, 0.06 * PPU, grd);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = GOLD;
  fitText(g, text, W / 2, (y0 + y1) / 2 + 4, x1 - x0 - 0.36 * PPU, FONT.title, 0.24 * PPU, 10);
  // the pointing hands
  hand(g, 0.36 * PPU, H / 2, 0.42 * PPU, 1);
  hand(g, W - 0.36 * PPU, H / 2, 0.42 * PPU, -1);
  return cv;
}

/** Gold frame of the target card, with its plaque. */
function targetFrame(label: string): HTMLCanvasElement {
  const wU = 1.3;
  const hU = 1.45;
  const { cv, g, W, H } = unitCanvas(wU, hU);
  const fw = 0.86 * PPU;
  const fh = 1.1 * PPU;
  const fx = (W - fw) / 2;
  const fy = (H - fh) / 2 + 0.02 * PPU;
  const glow = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, fh * 0.6);
  glow.addColorStop(0, 'rgba(255,226,150,0.16)');
  glow.addColorStop(1, 'rgba(255,226,150,0)');
  goldFrame(g, fx, fy, fw, fh, 0.07 * PPU, glow);
  // corner diamonds
  g.fillStyle = GOLD;
  for (const [cx, cy] of [
    [fx, fy],
    [fx + fw, fy],
    [fx, fy + fh],
    [fx + fw, fy + fh],
  ]) {
    g.beginPath();
    g.moveTo(cx, cy - 16);
    g.lineTo(cx + 16, cy);
    g.lineTo(cx, cy + 16);
    g.lineTo(cx - 16, cy);
    g.closePath();
    g.fill();
  }
  // the plaque over the top edge
  const pw = 0.66 * PPU;
  const ph = 0.17 * PPU;
  const pg = g.createLinearGradient(0, fy - ph / 2, 0, fy + ph / 2);
  pg.addColorStop(0, '#f6e1a0');
  pg.addColorStop(1, '#b8913e');
  g.fillStyle = pg;
  g.beginPath();
  g.roundRect(W / 2 - pw / 2, fy - ph / 2, pw, ph, ph / 2);
  g.fill();
  g.strokeStyle = '#6e5016';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = DARK_INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, label, W / 2, fy + 3, pw - 0.1 * PPU, FONT.title, 0.1 * PPU, 4);
  return cv;
}

export class PickNumberView extends TableGame {
  readonly id = 'picknum';
  readonly title = 'Pick a Number';
  protected readonly felt = feltKey('picknum', 'caribbean');
  private L!: Lay;
  /** The round laid out on the table (dealt while the bets are placed). */
  private round: PnLayout | null = null;
  private target3: Card3D | null = null;
  private row3: Card3D[] = [];
  private ready = false;
  private prep: Promise<void> | null = null;
  private gen = 0;

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('pn.rules');
  }

  private layout(): Lay {
    const { stage } = this.g;
    const A = stage.screenToTable(0.5, V_ROW);
    const edge = stage.screenToTable(0.955, V_ROW).x;
    const dx = Math.min(1.0, Math.max(0.74, (2 * edge - 0.63) / 4));
    const rowZ = A.z + 0.2;
    const ringZ = rowZ + 0.95;
    this.L = {
      target: new THREE.Vector3(0, REST_Y, A.z - 1.2),
      rowZ,
      xs: [-2, -1, 0, 1, 2].map((k) => k * dx),
      ringZ,
      bannerZ: A.z - 2.3,
      footZ: ringZ + 0.84,
    };
    return this.L;
  }

  protected spotDefs(): SpotDef[] {
    const L = this.layout();
    return L.xs.map((x, i) => {
      const p = uvAt(this.g, x, L.ringZ);
      return { id: `p${i}`, label: t('pn.pick'), sub: `${PN.pays}:1`, u: p.u, v: p.v, size: 0.6, max: PN.maxBet };
    });
  }

  protected defaultBets() {
    return { p2: 25 };
  }

  protected decorate() {
    const { table, hud } = this.g;
    const L = this.L;
    table.addDecalAt(bannerPrint(t('pn.print1')), 0, L.bannerZ, 4.0);
    table.addDecalAt(targetFrame(t('pn.target')), L.target.x, L.target.z, 1.3);
    // the row's card places
    const { cv, g, W, H } = unitCanvas(L.xs[4] - L.xs[0] + 0.9, 1.1);
    g.strokeStyle = GOLD;
    g.globalAlpha = 0.5;
    g.lineWidth = 3;
    g.setLineDash([12, 9]);
    for (const x of L.xs) {
      const cx = W / 2 + x * PPU;
      g.beginPath();
      g.roundRect(cx - 0.37 * PPU, H / 2 - 0.49 * PPU, 0.74 * PPU, 0.98 * PPU, 0.07 * PPU);
      g.stroke();
    }
    table.addDecalAt(cv, 0, L.rowZ, L.xs[4] - L.xs[0] + 0.9);
    table.addDecalAt(
      fitPrint(
        [
          { text: t('pn.foot1'), y: 62, R: 3000, px: 42, font: FONT.title, color: GOLD, spacing: 6 },
          { text: t('pn.foot2'), y: 124, R: 3000, px: 36, font: FONT.italic, color: INK_SOFT },
        ],
        142,
        [{ y: 82, R: 3000, half: 0.1 }],
      ),
      0,
      L.footZ,
      3.8,
    );
    this.paytable = new Paytable(hud.root, '', [
      [t('pn.match'), `${PN.pays}:1`],
      [t('pn.jokerRow'), t('pn.jokerPays')],
    ]);
    this.spots.active = 'p2';
  }

  protected cleanup() {
    this.gen++;
    this.prep = null;
    this.ready = false;
    this.round = null;
    this.target3 = null;
    this.row3 = [];
  }

  protected validate() {
    if (!this.ready) return t('pn.wait');
    if (this.spots.total < PN.minBet) return t('pn.needBet');
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

  /** Lays out the next round: the target is dealt and turned up, then five cards face down. */
  private async prepare(gen: number) {
    const live = () => gen === this.gen;
    const L = this.L;
    const lay = dealPn(cryptoRng);
    this.round = lay;
    this.row3 = [];
    await wait(0.15);
    if (!live()) return;
    const t3 = await this.cardsT.deal(lay.target, { pos: L.target.clone(), yaw: 0 }, false, { dur: 0.5 });
    this.target3 = t3;
    if (!live()) return;
    await wait(0.12);
    if (!live()) return;
    await this.cardsT.flip(t3, 0.6);
    if (!live()) return;
    this.g.fx.glow(new THREE.Vector3(L.target.x, 0, L.target.z), 0.95, 1.2, 1.2);
    await wait(0.2);
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < PN.slots; i++) {
      if (!live()) return;
      const pos = new THREE.Vector3(L.xs[i], REST_Y + i * 0.0005, L.rowZ);
      jobs.push(this.cardsT.deal(lay.row[i], { pos, yaw: (((i * 37) % 7) - 3) * 0.004 }, false, { dur: 0.45 }).then((c) => void (this.row3[i] = c)));
      await wait(0.13);
    }
    await Promise.all(jobs);
  }

  protected async playRound() {
    if (this.prep) await this.prep;
    const { fx, sfx, hud } = this.g;
    const L = this.L;
    const lay = this.round!;
    const a = this.spots.amounts();
    const bets = L.xs.map((_, i) => a[`p${i}`] ?? 0);
    // the five cards are turned over, left to right
    const flips: Promise<void>[] = [];
    for (let i = 0; i < PN.slots; i++) {
      flips.push(this.cardsT.flip(this.row3[i], 0.5));
      await wait(0.26);
    }
    await Promise.all(flips);
    const ret = settlePn(lay, bets);
    const pinZ = L.rowZ - 0.6;
    L.xs.forEach((x, i) => {
      const hit = i === lay.match;
      this.tag(t(hit ? 'pn.win' : 'pn.lose'), hit ? 'win' : 'lose', x, pinZ);
    });
    if (lay.joker) {
      sfx.play('fan', { vol: 0.5 });
      hud.toast(t('pn.joker'), 1800);
      const j = L.xs[lay.row.findIndex((c) => c >= 52)];
      fx.glow(new THREE.Vector3(j, 0, L.rowZ), 0.95, 1.2, 1.8, '#ff9a8f');
    } else {
      const m = this.row3[lay.match];
      highlightCards(this.g, [m, this.target3!].filter(Boolean));
      if (ret[lay.match] > 0) fx.burst(new THREE.Vector3(L.xs[lay.match], 0.3, L.rowZ), 120);
    }
    const out: Record<string, number> = {};
    ret.forEach((r, i) => (out[`p${i}`] = r));
    await this.settle(out, { big: ret.some((r) => r > 0) ? t('pn.big') : undefined });
  }
}
