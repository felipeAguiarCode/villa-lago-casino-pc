import * as THREE from 'three';
import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import { cryptoRng } from '../../core/rng';
import { slideChips, wait } from '../../table/anim';
import { ChipPile } from '../../table/chips';
import { FONT, GOLD, INK, INK_SOFT, makeCanvas, tablePrint } from '../../table/prints';
import type { Pin } from '../../ui/hud';
import { Paytable } from '../../ui/paytable';
import { finishXP, resultBanner, type SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { Die3D, disposeDiceAssets, FACE_SLOT, orientFor, TEX_UP, yawOf } from './die';
import { DIE, faceFix, FPS, planRoll, type Roll, type Tray } from './physics';
import { CUP_H, DiceCup, DiceTray, FLOOR_Y, preloadPropMaps, RAIL_H } from './props';
import {
  advise,
  CAT,
  CAT_KEYS,
  comboDice,
  comboRanks,
  compareHands,
  dealerHold,
  evaluate,
  FACE_LABEL,
  PD,
  rollDice,
  settlePd,
  type Hand,
} from './rules';

addStrings(
  {
    'pd.ante': 'ANTE',
    'pd.bonus': 'BONUS',
    'pd.print1': 'POKER DICE',
    'pd.print2': 'The dealer rolls last and must beat your hand',
    'pd.print3': 'FIVE OF A KIND PAYS 2 TO 1 · TIES PUSH',
    'pd.heldRow': 'HELD DICE',
    'pd.dealerRow': 'DEALER HOLDS',
    'pd.needBet': 'Place an ANTE bet',
    'pd.roll': 'Roll · {n} left',
    'pd.stand': 'Stand',
    'pd.held': 'HELD',
    'pd.dealer': 'DEALER',
    'pd.dealerRolls': 'DEALER ROLLS…',
    'pd.clickHold': 'Click dice to hold them, then roll the rest',
    'pd.hintStand': 'Best play: stand on this hand',
    'pd.hintHold': 'Best play: hold {dice} and re-roll the rest',
    'pd.hintNone': 'Best play: re-roll all five dice',
    'pd.big': 'FIVE OF A KIND',
    'pd.ptTitle': 'POKER DICE',
    'pd.ptHand': 'HAND',
    'pd.betBack': 'PUSH',
    'pd.h.five': 'FIVE OF A KIND',
    'pd.h.four': 'FOUR OF A KIND',
    'pd.h.full': 'FULL HOUSE',
    'pd.h.straight': 'STRAIGHT',
    'pd.h.three': 'THREE OF A KIND',
    'pd.h.twoPair': 'TWO PAIR',
    'pd.h.pair': 'ONE PAIR',
    'pd.h.bust': 'BUST',
    'pd.rules': `
      <p>Five poker dice — faces <b>9, 10, J, Q, K, A</b> — against the dealer. Bet the <b>ANTE</b> (and, if you like, the <b>BONUS</b>), then roll all five dice from the leather cup.</p>
      <h4>Your three rolls</h4>
      <p>After each roll, click dice to <b>hold</b> them (they move to the HELD row) and press <b>Roll</b> to re-roll the rest — up to two more times — or <b>Stand</b>. Click a held die to put it back.</p>
      <h4>The dealer rolls last</h4>
      <p>The dealer sees your final hand and has three rolls to beat it. It stops as soon as it beats you. Otherwise it follows a fixed house way: it holds the dice that give it the best chance of beating you (a tie counts as half), and of two equally good holds it keeps more dice.</p>
      <h4>Hands, high to low</h4>
      <p>Five of a kind · Four of a kind · Full house · Straight (A-K-Q-J-10 beats K-Q-J-10-9) · Three of a kind · Two pair · One pair · Bust. There are no flushes. Equal hands compare the ranks of the combination (Ace high), then the kickers; the same five faces is a tie.</p>
      <h4>Payouts</h4>
      <p><b>ANTE</b>: a win pays 1:1, a win with Five of a kind pays 2:1; a tie pushes.<br><b>BONUS</b> (paid on your final hand, whatever the dealer rolls): Five of a kind 6:1, Four of a kind 1:1, Full house or Straight: your bet back; anything else loses.</p>
      <h4>Return</h4>
      <p>ANTE: 96.6% with the best holds — the hint button shows them. BONUS: 94.7%, and no way of holding the dice can lift it above 95.7%. Every die is fair: its face is drawn before it leaves the cup.</p>`,
  },
  {
    'pd.ante': 'ANTE',
    'pd.bonus': 'BÔNUS',
    'pd.print1': 'DADOS DE PÔQUER',
    'pd.print2': 'O dealer joga por último e precisa bater a sua mão',
    'pd.print3': 'CINCO IGUAIS PAGAM 2 PARA 1 · EMPATE DEVOLVE',
    'pd.heldRow': 'DADOS GUARDADOS',
    'pd.dealerRow': 'O DEALER GUARDA',
    'pd.needBet': 'Faça uma aposta ANTE',
    'pd.roll': 'Jogar · faltam {n}',
    'pd.stand': 'Parar',
    'pd.held': 'GUARDADO',
    'pd.dealer': 'DEALER',
    'pd.dealerRolls': 'O DEALER JOGA…',
    'pd.clickHold': 'Clique nos dados para guardá-los e jogue o resto',
    'pd.hintStand': 'Melhor jogada: parar com esta mão',
    'pd.hintHold': 'Melhor jogada: guardar {dice} e jogar o resto',
    'pd.hintNone': 'Melhor jogada: jogar os cinco dados de novo',
    'pd.big': 'CINCO IGUAIS',
    'pd.ptTitle': 'DADOS DE PÔQUER',
    'pd.ptHand': 'MÃO',
    'pd.betBack': 'DEVOLVE',
    'pd.h.five': 'CINCO IGUAIS',
    'pd.h.four': 'QUADRA',
    'pd.h.full': 'FULL HOUSE',
    'pd.h.straight': 'SEQUÊNCIA',
    'pd.h.three': 'TRINCA',
    'pd.h.twoPair': 'DOIS PARES',
    'pd.h.pair': 'UM PAR',
    'pd.h.bust': 'NADA',
    'pd.rules': `
      <p>Cinco dados de pôquer — faces <b>9, 10, J, Q, K, A</b> — contra o dealer. Aposte o <b>ANTE</b> (e, se quiser, o <b>BÔNUS</b>) e jogue os cinco dados do copo de couro.</p>
      <h4>Suas três jogadas</h4>
      <p>Depois de cada jogada, clique nos dados para <b>guardá-los</b> (eles vão para a fileira de GUARDADOS) e aperte <b>Jogar</b> para rolar o resto de novo — até mais duas vezes — ou <b>Parar</b>. Clique num dado guardado para devolvê-lo.</p>
      <h4>O dealer joga por último</h4>
      <p>O dealer vê a sua mão final e tem três jogadas para batê-la. Ele para assim que bate você. Senão segue uma regra fixa da casa: guarda os dados que lhe dão a maior chance de bater você (o empate vale meio), e entre duas escolhas igualmente boas guarda mais dados.</p>
      <h4>Mãos, da maior para a menor</h4>
      <p>Cinco iguais · Quadra · Full house · Sequência (A-K-Q-J-10 vence K-Q-J-10-9) · Trinca · Dois pares · Um par · Nada. Não existe flush. Mãos do mesmo tipo comparam as faces da combinação (o Ás é a maior) e depois os dados restantes; as mesmas cinco faces empatam.</p>
      <h4>Pagamentos</h4>
      <p><b>ANTE</b>: a vitória paga 1:1, e vencer com Cinco iguais paga 2:1; o empate devolve a aposta.<br><b>BÔNUS</b> (paga pela sua mão final, seja qual for a do dealer): Cinco iguais 6:1, Quadra 1:1, Full house ou Sequência: a aposta volta; o resto perde.</p>
      <h4>Retorno</h4>
      <p>ANTE: 96,6% com as melhores escolhas — o botão de dica mostra quais. BÔNUS: 94,7%, e nenhuma forma de guardar os dados passa de 95,7%. Todo dado é honesto: a face é sorteada antes de ele sair do copo.</p>`,
  },
);

/**
 * Layout in table units (anchored at the frame's centre, so nothing stretches). From the top:
 * the dealer's held row, the dealer's tray with its cup on the left, the title print, the player's
 * tray and cup, the player's held row, then the ANTE and BONUS circles. The dealer pays down the
 * lane on the right.
 */
const L = {
  trayW: 2.4,
  trayD: 1.02,
  dTrayZ: -2.2,
  pTrayZ: 0.55,
  dRowZ: -3.12,
  pRowZ: 1.55,
  betZ: 2.42,
  titleZ: -0.83,
  cupX: -1.72,
  slot: 0.42,
  anteX: -0.5,
  bonusX: 0.55,
  laneX: 1.72,
  corridorZ: 1.95,
};
/** Playback is a touch slower than real time, so a throw reads well. */
const SLOW = 1.32;

type Side = 'p' | 'd';

interface SideRig {
  cup: DiceCup;
  tray: DiceTray;
  box: Tray;
  dice: Die3D[];
  rowZ: number;
  rest: THREE.Vector3;
  /** Held-row slot of each die (−1 = in the tray). */
  slot: number[];
  /** Last resting place of each die in the tray. */
  trayPos: THREE.Vector3[];
  trayQ: THREE.Quaternion[];
}

/** Frame v whose table point (at u = 0.5) has depth z. */
function vAt(g: GameCtx, z: number): number {
  let lo = -0.8;
  let hi = 1.8;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (g.stage.screenToTable(0.5, mid).z < z) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Frame u of table x along the row at frame height v. */
function uAt(g: GameCtx, x: number, v: number): number {
  const a = g.stage.screenToTable(0, v).x;
  const b = g.stage.screenToTable(1, v).x;
  return 0.5 + x / (b - a);
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** The held-row print: five gold slots and a label. */
const ROW_SLOT_PX = 150;
const ROW_GAP_PX = (1024 - 80 - 5 * ROW_SLOT_PX) / 4;
/** Width of the row print so its slots fall every L.slot units. */
const ROW_W = (L.slot * 1024) / (ROW_SLOT_PX + ROW_GAP_PX);
/** Depth offset of the slots' centres from the print's centre. */
const ROW_DZ = ((109 - 128) / 256) * (ROW_W / 4);

function rowPrint(label: string): HTMLCanvasElement {
  const { cv, g } = makeCanvas(1024, 256);
  const slotW = ROW_SLOT_PX;
  const gap = ROW_GAP_PX;
  g.strokeStyle = GOLD;
  g.globalAlpha = 0.75;
  g.lineWidth = 4;
  for (let k = 0; k < 5; k++) {
    const x = 40 + k * (slotW + gap);
    g.beginPath();
    g.roundRect(x, 34, slotW, slotW, 18);
    g.stroke();
  }
  g.globalAlpha = 0.85;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(40, 214);
  g.lineTo(300, 214);
  g.moveTo(724, 214);
  g.lineTo(984, 214);
  g.stroke();
  g.fillStyle = INK;
  g.globalAlpha = 0.8;
  g.font = FONT.title(34);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 512, 216);
  return cv;
}

export class PokerDiceView extends TableGame {
  readonly id = 'pokerdice';
  readonly title = 'Poker Dice';
  protected readonly felt = 'pokerdice' as const;
  protected usesCards = false;
  private sides: Record<Side, SideRig> | null = null;
  private stakes = { ante: 0, bonus: 0 };
  private rollsLeft = 0;
  private deciding = false;
  private resolveDecision: ((a: 'roll' | 'stand') => void) | null = null;
  private hits: HTMLButtonElement[] = [];
  private heldPins: Pin[] = [];
  private tweens = new Map<Die3D, gsap.core.Tween>();
  private moves = new Set<Promise<void>>();
  private lastSound = 0;
  private v3 = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private dead = false;
  private rounds = 0;

  constructor(g: GameCtx) {
    super(g, 1);
  }

  rules() {
    return t('pd.rules');
  }

  async enter() {
    this.dead = false;
    await preloadPropMaps(3);
    return super.enter();
  }

  protected spotDefs(): SpotDef[] {
    const g = this.g;
    const v = vAt(g, L.betZ);
    return [
      { id: 'ante', label: t('pd.ante'), sub: '1:1', u: uAt(g, L.anteX, v), v, size: 0.66, max: PD.maxAnte },
      { id: 'bonus', label: t('pd.bonus'), sub: `${PD.bonusPays[CAT.five]}:1`, u: uAt(g, L.bonusX, v), v, size: 0.58, max: PD.maxBonus },
    ];
  }

  protected defaultBets() {
    return { ante: 25 };
  }

  protected validate() {
    const a = this.spots.amounts();
    if ((a.ante ?? 0) < PD.minBet) return t('pd.needBet');
    return '';
  }

  // ---------------------------------------------------------------- table set-up
  protected decorate() {
    const { table, hud, stage } = this.g;
    table.addDecalAt(
      tablePrint(
        [
          { text: t('pd.print1'), y: 112, R: 900, font: FONT.title(74), spacing: 6 },
          { text: t('pd.print2'), y: 182, R: 900, font: FONT.italic(44), color: INK_SOFT },
          { text: t('pd.print3'), y: 268, R: 900, font: FONT.title(34), color: GOLD, spacing: 5 },
        ],
        320,
        [
          { y: 222, R: 900, half: 0.42 },
          { y: 284, R: 900, half: 0.42 },
        ],
      ),
      0,
      L.titleZ,
      2.9,
    );
    table.addDecalAt(rowPrint(t('pd.heldRow')), 0, L.pRowZ - ROW_DZ, ROW_W);
    table.addDecalAt(rowPrint(t('pd.dealerRow')), 0, L.dRowZ - ROW_DZ, ROW_W);
    const rows = [7, 6, 5, 4, 3, 2, 1, 0].map((c) => {
      const b = PD.bonusPays[c];
      return [t(`pd.h.${CAT_KEYS[c]}`), `${PD.antePays[c]}:1`, b < 0 ? '—' : b === 0 ? t('pd.betBack') : `${b}:1`];
    });
    this.paytable = new Paytable(hud.root, t('pd.ptTitle'), rows, { head: [t('pd.ptHand'), t('pd.ante'), t('pd.bonus')] });
    if (!this.sides) {
      const parent = stage.table;
      const mk = (side: Side): SideRig => {
        const z = side === 'p' ? L.pTrayZ : L.dTrayZ;
        const box: Tray = { cx: 0, cz: z, w: L.trayW, d: L.trayD, floor: FLOOR_Y };
        const rig: SideRig = {
          cup: new DiceCup(parent),
          tray: new DiceTray(parent, box, side === 'p' ? '#5d1424' : '#4a1220'),
          box,
          dice: Array.from({ length: 5 }, () => new Die3D(parent)),
          rowZ: side === 'p' ? L.pRowZ : L.dRowZ,
          rest: new THREE.Vector3(L.cupX, 0, z),
          slot: [-1, -1, -1, -1, -1],
          trayPos: [],
          trayQ: [],
        };
        rig.cup.group.position.copy(rig.rest);
        rig.cup.group.rotation.set(0, side === 'p' ? 0.4 : -0.4, 0);
        rig.cup.sync();
        // the dice wait in the tray in a loose row
        rig.dice.forEach((d, i) => {
          const p = new THREE.Vector3((i - 2) * DIE * 1.7 + (Math.random() - 0.5) * 0.06, FLOOR_Y + DIE / 2, z + (Math.random() - 0.5) * 0.3);
          d.ground = FLOOR_Y;
          d.show(Math.floor(Math.random() * 6), (Math.random() - 0.5) * 0.7);
          d.place(p);
          rig.trayPos[i] = p.clone();
          rig.trayQ[i] = d.mesh.quaternion.clone();
        });
        return rig;
      };
      this.sides = { p: mk('p'), d: mk('d') };
      this.makeHits();
    }
  }

  private makeHits() {
    const { hud } = this.g;
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('button');
      b.className = 'card-hit live';
      b.setAttribute('aria-label', `Die ${i + 1}`);
      b.style.cursor = 'pointer';
      b.style.display = 'none';
      b.style.borderRadius = '18%';
      b.onmouseenter = () => (b.style.boxShadow = '0 0 0 2px rgba(255,215,120,.75), 0 0 14px rgba(255,200,90,.55)');
      b.onmouseleave = () => (b.style.boxShadow = '');
      b.onclick = () => this.toggleHold(i);
      hud.labels.appendChild(b);
      this.hits.push(b);
      const pin = hud.pin('held-tag');
      pin.set(t('pd.held'));
      this.heldPins.push(pin);
    }
  }

  protected cleanup() {
    this.dead = true;
    for (const tw of this.tweens.values()) tw.kill();
    this.tweens.clear();
    this.moves.clear();
    this.resolveDecision?.('stand');
    this.resolveDecision = null;
    this.deciding = false;
    if (this.sides)
      for (const s of Object.values(this.sides)) {
        gsap.killTweensOf(s.cup.group.position);
        s.dice.forEach((d) => d.dispose());
        s.cup.dispose();
        s.tray.dispose();
      }
    this.sides = null;
    disposeDiceAssets();
    this.hits.forEach((b) => b.remove());
    this.heldPins.forEach((p) => p.remove());
    this.hits = [];
    this.heldPins = [];
  }

  // ---------------------------------------------------------------- per frame
  protected onSync() {
    const s = this.sides?.p;
    if (!s) return;
    const { stage } = this.g;
    s.dice.forEach((d, i) => {
      const b = this.hits[i];
      const pin = this.heldPins[i];
      const live = this.deciding && d.visible;
      if (!live) {
        b.style.display = 'none';
        pin.show(false);
        return;
      }
      const p = d.pos;
      const top = p.y + DIE / 2;
      const a = stage.toScreen(this.v3.set(p.x - DIE * 0.62, top, p.z - DIE * 0.62));
      const z = stage.toScreen(this.v3.set(p.x + DIE * 0.62, top, p.z + DIE * 0.62));
      b.style.display = 'block';
      b.style.width = `${Math.max(16, z.x - a.x)}px`;
      b.style.height = `${Math.max(16, z.y - a.y)}px`;
      b.style.transform = `translate(${a.x}px, ${a.y}px)`;
      const held = s.slot[i] >= 0;
      if (held) {
        const tp = stage.toScreen(this.v3.set(p.x, top, p.z - DIE / 2 - 0.13));
        pin.place(tp.x, tp.y);
      }
      pin.show(held);
    });
  }

  // ---------------------------------------------------------------- helpers
  private rig(side: Side) {
    return this.sides![side];
  }

  private rowPos(side: Side, k: number, out = new THREE.Vector3()) {
    return out.set((k - 2) * L.slot, DIE / 2, this.rig(side).rowZ);
  }

  /** Throttled die clack for impacts (the WebAudio voices would pile up otherwise). */
  private clack(speed: number, kind: 'rail' | 'floor' | 'die') {
    const now = performance.now();
    if (now - this.lastSound < 28) return;
    this.lastSound = now;
    const vol = Math.min(1, (kind === 'die' ? 0.12 : 0.1) * speed + 0.12);
    this.g.sfx.play('dieThrow', { vol: kind === 'floor' ? vol * 0.7 : vol, rate: kind === 'die' ? 1.25 : kind === 'rail' ? 0.95 : 1.05 });
  }

  /** Carries a die along an arc to `to` (its centre) with orientation q; `ground` is where it ends. */
  private moveDie(d: Die3D, to: THREE.Vector3, q: THREE.Quaternion, ground: number, dur = 0.38, lift = 0.24, delay = 0, onLand?: () => void): Promise<void> {
    this.tweens.get(d)?.kill();
    const p0 = d.pos.clone();
    const q0 = d.mesh.quaternion.clone();
    const g0 = d.ground;
    const end = to.clone();
    const qe = q.clone();
    const pos = new THREE.Vector3();
    const qq = new THREE.Quaternion();
    const o = { t: 0 };
    const job = new Promise<void>((res) => {
      const tw = gsap.to(o, {
        t: 1,
        duration: dur,
        delay,
        ease: 'power2.inOut',
        onUpdate: () => {
          const s = o.t;
          pos.lerpVectors(p0, end, s);
          pos.y = lerp(p0.y, end.y, s) + Math.sin(Math.PI * s) * lift;
          d.ground = s < 0.5 ? g0 : ground;
          qq.slerpQuaternions(q0, qe, s);
          d.place(pos, qq);
        },
        onComplete: () => {
          d.ground = ground;
          d.place(end, qe);
          onLand?.();
          res();
        },
        onInterrupt: () => res(),
      });
      this.tweens.set(d, tw);
    });
    this.moves.add(job);
    job.then(() => this.moves.delete(job));
    return job;
  }

  private async movesDone() {
    while (this.moves.size) await Promise.all([...this.moves]);
  }

  /** Moves the cup (base position, tilt toward +x) along an arc. */
  private cupTo(cup: DiceCup, to: THREE.Vector3, tilt: number, dur: number, arc = 0.2, ease = 'power2.inOut', yaw?: number): Promise<void> {
    const g = cup.group;
    const p0 = g.position.clone();
    const r0 = g.rotation.z;
    const y0 = g.rotation.y;
    const y1 = yaw ?? y0;
    const o = { t: 0 };
    return new Promise((res) => {
      gsap.to(o, {
        t: 1,
        duration: dur,
        ease,
        onUpdate: () => {
          g.position.lerpVectors(p0, to, o.t);
          g.position.y += Math.sin(Math.PI * o.t) * arc;
          g.rotation.z = lerp(r0, tilt, o.t);
          g.rotation.y = lerp(y0, y1, o.t);
          cup.sync();
        },
        onComplete: () => res(),
      });
    });
  }

  /** The cup shakes the dice: a quick wobble that grows and dies, with the rattle. */
  private async shake(cup: DiceCup, dur = 0.8) {
    const { sfx } = this.g;
    const b = cup.body;
    const o = { t: 0 };
    sfx.play('diceShake', { vol: 0.85 });
    const second = wait(dur * 0.48).then(() => sfx.play('diceShake', { vol: 0.65, rate: 1.06 }));
    await gsap.to(o, {
      t: 1,
      duration: dur,
      ease: 'none',
      onUpdate: () => {
        const k = Math.sin(Math.PI * o.t);
        const ph = o.t * dur;
        b.rotation.z = 0.3 * k * Math.sin(2 * Math.PI * 6.2 * ph);
        b.rotation.x = 0.18 * k * Math.sin(2 * Math.PI * 4.7 * ph + 1.1);
        b.position.x = 0.06 * k * Math.sin(2 * Math.PI * 6.2 * ph + 0.6);
        b.position.y = 0.05 * k * Math.abs(Math.sin(2 * Math.PI * 6.2 * ph));
        cup.sync();
      },
    });
    b.rotation.set(0, 0, 0);
    b.position.set(0, 0, 0);
    await second;
  }

  /**
   * One throw from a side's cup: the dice `idx` are scooped into the cup, shaken, and tipped out
   * into the tray. The faces `vals` were drawn beforehand; the tumble is simulated, then each die's
   * face mapping is turned so its drawn value ends on top.
   */
  private async throwDice(side: Side, idx: number[], vals: number[]) {
    const { sfx } = this.g;
    const s = this.rig(side);
    const { cup, box } = s;
    await this.movesDone();
    // 1. the cup comes over the tray and the dice hop in
    sfx.play('diceGrab', { vol: 0.9 });
    const scoop = new THREE.Vector3(box.cx - 0.62, RAIL_H + 0.19, box.cz);
    await this.cupTo(cup, scoop, 0, 0.42, 0.3, 'power2.inOut', 0);
    await Promise.all(
      idx.map((i, k) => {
        const d = s.dice[i];
        d.glow(0);
        const mouth = cup.mouth(new THREE.Vector3());
        const q = d.mesh.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3)));
        return this.moveDie(d, mouth.setY(mouth.y + 0.02), q, 0, 0.3, 0.38, k * 0.075, () => {
          d.visible = false;
          sfx.tick(0.1, 0.8 + Math.random() * 0.3);
        });
      }),
    );
    idx.forEach((i) => (s.slot[i] = -1));
    // 2. lifted and shaken
    await this.cupTo(cup, new THREE.Vector3(box.cx - 0.95, 0.5, box.cz), 0, 0.22, 0.05, 'power2.out');
    await this.shake(cup, 0.82);
    // 3. the throw is simulated where the cup will tip, then the faces are fixed to the drawn values
    const jitter = (Math.random() - 0.5) * 0.24;
    const tipBase = new THREE.Vector3(box.cx - box.w / 2 - 0.3, 0.66, box.cz + jitter);
    const TIP = -2.0;
    const mouth = new THREE.Vector3(tipBase.x + CUP_H * Math.sin(-TIP), tipBase.y + CUP_H * Math.cos(-TIP), tipBase.z);
    const roll = planRoll(box, mouth, new THREE.Vector3(1, 0, (Math.random() - 0.5) * 0.25).normalize(), idx.length);
    idx.forEach((i, k) => {
      const d = s.dice[i];
      const f = roll.frames - 1;
      const qEnd = new THREE.Quaternion(roll.quat[k][f * 4], roll.quat[k][f * 4 + 1], roll.quat[k][f * 4 + 2], roll.quat[k][f * 4 + 3]);
      const slot = FACE_SLOT[vals[k]];
      d.fix = faceFix(slot, roll.top[k], qEnd, TEX_UP[slot]);
      d.value = vals[k];
      d.ground = FLOOR_Y;
    });
    // 4. the cup swings over and tips; the dice tumble out while it goes back to its place
    sfx.whoosh(0.35);
    await this.cupTo(cup, tipBase, TIP, 0.2, 0.08, 'power2.in');
    sfx.play('diceThrow', { vol: 0.9 });
    const back = wait(0.42).then(() => this.cupTo(cup, s.rest, 0, 0.6, 0.18, 'power2.inOut', side === 'p' ? 0.4 : -0.4));
    await this.playRoll(s, idx, roll);
    await back;
    idx.forEach((i, k) => {
      const d = s.dice[i];
      d.settle();
      // the drawn value is the result, always (the face fix makes this a no-op)
      if (d.value !== vals[k]) d.show(vals[k], yawOf(d.value, d.mesh.quaternion));
      s.trayPos[i] = d.pos.clone();
      s.trayQ[i] = d.mesh.quaternion.clone();
    });
  }

  /** Plays a simulated throw back (interpolating the recorded frames), with the clacks. */
  private playRoll(s: SideRig, idx: number[], roll: Roll): Promise<void> {
    const dice = idx.map((i) => s.dice[i]);
    const pos = new THREE.Vector3();
    const qa = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    const qr = new THREE.Quaternion();
    let hit = 0;
    const apply = (time: number) => {
      const f = Math.min(roll.frames - 1, time * FPS);
      const i0 = Math.floor(f);
      const i1 = Math.min(roll.frames - 1, i0 + 1);
      const w = f - i0;
      dice.forEach((d, k) => {
        const out = time < roll.at[k];
        if (out === d.visible) d.visible = !out;
        if (out) return;
        const P = roll.pos[k];
        const Q = roll.quat[k];
        pos.set(lerp(P[i0 * 3], P[i1 * 3], w), lerp(P[i0 * 3 + 1], P[i1 * 3 + 1], w), lerp(P[i0 * 3 + 2], P[i1 * 3 + 2], w));
        qa.set(Q[i0 * 4], Q[i0 * 4 + 1], Q[i0 * 4 + 2], Q[i0 * 4 + 3]);
        qb.set(Q[i1 * 4], Q[i1 * 4 + 1], Q[i1 * 4 + 2], Q[i1 * 4 + 3]);
        qr.slerpQuaternions(qa, qb, w);
        d.place(pos, d.renderQ(qr, qr));
      });
      while (hit < roll.hits.length && roll.hits[hit].t <= time) {
        const h = roll.hits[hit++];
        this.clack(h.speed, h.kind);
      }
    };
    dice.forEach((d) => (d.visible = false));
    apply(0);
    const o = { t: 0 };
    return new Promise((res) => {
      gsap.to(o, {
        t: roll.dur,
        duration: Math.max(0.05, roll.dur * SLOW),
        ease: 'none',
        onUpdate: () => apply(o.t),
        onComplete: () => {
          apply(roll.dur);
          dice.forEach((d) => (d.visible = true));
          res();
        },
      });
    });
  }

  private values(side: Side) {
    return this.rig(side).dice.map((d) => d.value);
  }

  private handLabel(h: Hand): string {
    const name = t(`pd.h.${CAT_KEYS[h.cat]}`);
    if (h.cat === CAT.five) return `${name} · ${FACE_LABEL[comboRanks(h)[0]]}!`;
    if (h.cat === CAT.straight) return `${name} · ${h.counts[5] ? 'A-K-Q-J-10' : 'K-Q-J-10-9'}`;
    if (h.cat === CAT.bust) return name;
    return `${name} · ${comboRanks(h)
      .map((r) => FACE_LABEL[r])
      .join('-')}`;
  }

  /** The hand-name tag of a side (one per side, updated in place). */
  private tagFor(side: Side, text: string, cls: string): Pin {
    const old = side === 'p' ? this.pTag : this.dTag;
    if (old) {
      old.set(text, `handtag ${cls}`);
      old.pop();
      return old;
    }
    const z = side === 'p' ? L.pTrayZ - L.trayD / 2 - 0.36 : L.dTrayZ + L.trayD / 2 + 0.36;
    const pin = this.tag(text, cls, 0, z);
    if (side === 'p') this.pTag = pin;
    else this.dTag = pin;
    return pin;
  }
  private pTag: Pin | null = null;
  private dTag: Pin | null = null;

  protected clearTags() {
    super.clearTags();
    this.pTag = null;
    this.dTag = null;
  }

  /** Moves a side's dice to its held row, sorted by the combination (best group first, by rank). */
  private gather(side: Side): Promise<void> {
    const s = this.rig(side);
    const vals = this.values(side);
    const h = evaluate(vals);
    const order = [0, 1, 2, 3, 4].sort((a, b) => h.counts[vals[b]] - h.counts[vals[a]] || vals[b] - vals[a] || a - b);
    this.g.sfx.whoosh(0.3);
    return Promise.all(
      order.map((i, k) => {
        const d = s.dice[i];
        const moved = s.slot[i] !== k;
        s.slot[i] = k;
        if (!moved && Math.abs(yawOf(d.value, d.mesh.quaternion)) < 0.01) return Promise.resolve();
        return this.moveDie(d, this.rowPos(side, k), orientFor(d.value, 0), 0, 0.42, 0.26, k * 0.05, () => this.clack(1.6, 'floor'));
      }),
    ).then(() => undefined);
  }

  /** The dice of a side go back into their tray (start of a round). */
  private toTray(side: Side): Promise<void> {
    const s = this.rig(side);
    const jobs: Promise<void>[] = [];
    s.dice.forEach((d, i) => {
      d.glow(0);
      if (s.slot[i] < 0) return;
      s.slot[i] = -1;
      const p = new THREE.Vector3((i - 2) * DIE * 1.7 + (Math.random() - 0.5) * 0.06, FLOOR_Y + DIE / 2, s.box.cz + (Math.random() - 0.5) * 0.3);
      s.trayPos[i] = p;
      s.trayQ[i] = orientFor(d.value, (Math.random() - 0.5) * 0.7);
      jobs.push(this.moveDie(d, p, s.trayQ[i], FLOOR_Y, 0.4, 0.3, i * 0.04));
    });
    if (jobs.length) this.g.sfx.whoosh(0.3);
    return Promise.all(jobs).then(() => undefined);
  }

  // ---------------------------------------------------------------- holding
  private toggleHold(i: number) {
    if (!this.deciding || this.dead) return;
    const s = this.rig('p');
    const d = s.dice[i];
    const { sfx, hud } = this.g;
    hud.highlight(null);
    if (s.slot[i] < 0) {
      const used = new Set(s.slot);
      let k = 0;
      while (used.has(k)) k++;
      s.slot[i] = k;
      d.glow(1);
      sfx.tick(0.14, 1.25);
      void this.moveDie(d, this.rowPos('p', k), orientFor(d.value, 0), 0, 0.34, 0.22, 0, () => this.clack(1.4, 'floor'));
    } else {
      s.slot[i] = -1;
      d.glow(0);
      sfx.whoosh(0.22);
      void this.moveDie(d, s.trayPos[i], s.trayQ[i], FLOOR_Y, 0.34, 0.22, 0, () => this.clack(1.2, 'floor'));
    }
    this.heldPins[i].pop();
    this.renderActions();
  }

  private renderActions() {
    if (!this.deciding) return;
    const s = this.rig('p');
    const free = s.slot.some((k) => k < 0);
    this.actions([
      { id: 'stand', label: t('pd.stand'), color: 'red', icon: 'stand', onClick: () => this.pick('stand') },
      { id: 'roll', label: t('pd.roll', { n: this.rollsLeft }), color: 'green', icon: 'redo', enabled: free, onClick: () => this.pick('roll') },
    ]);
  }

  private pick(a: 'roll' | 'stand') {
    if (!this.deciding) return;
    this.g.sfx.click();
    this.g.hud.highlight(null);
    this.deciding = false;
    this.actions(null);
    const r = this.resolveDecision;
    this.resolveDecision = null;
    r?.(a);
  }

  private decide(): Promise<'roll' | 'stand'> {
    return new Promise((res) => {
      this.resolveDecision = res;
      this.deciding = true;
      this.renderActions();
    });
  }

  protected advice() {
    if (!this.deciding) return null;
    const s = this.rig('p');
    const vals = this.values('p');
    const a = advise(vals, this.rollsLeft, this.stakes);
    const { fx } = this.g;
    if (a.stand) {
      s.dice.forEach((d) => fx.glow(this.tmp2.copy(d.pos).setY(0), DIE * 2.2, DIE * 2.2, 1.3, '#9fd0ff'));
      return { id: 'stand', msg: t('pd.hintStand') };
    }
    const keep = s.dice.filter((_, i) => a.hold[i]);
    keep.forEach((d) => fx.glow(this.tmp2.copy(d.pos).setY(0), DIE * 2.2, DIE * 2.2, 1.4, '#9fd0ff'));
    if (!keep.length) return { id: 'roll', msg: t('pd.hintNone') };
    const dice = vals
      .filter((_, i) => a.hold[i])
      .sort((x, y) => y - x)
      .map((v) => FACE_LABEL[v])
      .join(' ');
    // the hint is about which dice to hold: it lights the Roll key only when the holds already match
    const match = a.hold.every((h, i) => h === s.slot[i] >= 0);
    return { id: match ? 'roll' : '', msg: t('pd.hintHold', { dice }) };
  }

  // ---------------------------------------------------------------- the round
  protected async playRound() {
    const { sfx, fx, hud } = this.g;
    const bets = this.spots.amounts();
    this.stakes = { ante: bets.ante ?? 0, bonus: bets.bonus ?? 0 };
    this.paytable?.show(true);
    this.paytable?.highlight(null);
    const p = this.rig('p');
    const d = this.rig('d');
    for (const s of [p, d]) s.dice.forEach((x) => x.glow(0));
    await this.toTray('d');
    if (this.dead) return;

    // ---- the player's three rolls
    let pVals = rollDice(5, cryptoRng);
    await this.throwDice('p', [0, 1, 2, 3, 4], pVals);
    for (let roll = 1; roll <= 3; roll++) {
      if (this.dead) return;
      pVals = this.values('p');
      const h = evaluate(pVals);
      this.tagFor('p', this.handLabel(h), h.cat >= CAT.full ? 'win' : '');
      this.paytable?.highlight(7 - h.cat);
      if (h.cat === CAT.five) {
        sfx.bell();
        fx.burst(new THREE.Vector3(0, 0.3, L.pTrayZ), 120);
      }
      if (roll === 3 || h.cat === CAT.five) break;
      this.rollsLeft = 3 - roll;
      if (roll === 1 && this.rounds++ < 3) hud.toast(t('pd.clickHold'), 2400);
      const a = await this.decide();
      if (this.dead) return;
      if (a === 'stand') break;
      const idx = [0, 1, 2, 3, 4].filter((i) => p.slot[i] < 0);
      if (!idx.length) break;
      await this.throwDice('p', idx, rollDice(idx.length, cryptoRng));
    }
    this.deciding = false;
    this.rollsLeft = 0;
    this.actions(null);
    p.dice.forEach((x) => x.glow(0));
    await this.gather('p');
    if (this.dead) return;
    pVals = this.values('p');
    const pHand = evaluate(pVals);
    this.tagFor('p', this.handLabel(pHand), pHand.cat >= CAT.full ? 'win' : '');
    await wait(0.35);

    // ---- the dealer's turn: it knows the hand to beat
    this.tagFor('d', t('pd.dealerRolls'), 'dealer');
    let dVals = rollDice(5, cryptoRng);
    await this.throwDice('d', [0, 1, 2, 3, 4], dVals);
    for (let left = 2; left >= 0; left--) {
      if (this.dead) return;
      dVals = this.values('d');
      const dh = evaluate(dVals);
      const beats = compareHands(dh, pHand) > 0;
      this.tagFor('d', `${t('pd.dealer')} · ${this.handLabel(dh)}`, beats ? 'dealer' : 'lose');
      if (beats || left === 0) break;
      const hold = dealerHold(dVals, left, pVals);
      if (!hold) break;
      await wait(0.45);
      // the dealer sets its kept dice aside in its row and rolls the rest
      const used = new Set(d.slot);
      const jobs: Promise<void>[] = [];
      d.dice.forEach((x, i) => {
        if (hold[i] && d.slot[i] < 0) {
          let k = 0;
          while (used.has(k)) k++;
          used.add(k);
          d.slot[i] = k;
          x.glow(0.6);
          jobs.push(this.moveDie(x, this.rowPos('d', k), orientFor(x.value, 0), 0, 0.36, 0.22, jobs.length * 0.06, () => this.clack(1.3, 'floor')));
        } else if (!hold[i] && d.slot[i] >= 0) {
          d.slot[i] = -1;
          x.glow(0);
        }
      });
      if (jobs.length) sfx.tick(0.12, 1.1);
      await Promise.all(jobs);
      const idx = [0, 1, 2, 3, 4].filter((i) => !hold[i]);
      await this.throwDice('d', idx, rollDice(idx.length, cryptoRng));
    }
    d.dice.forEach((x) => x.glow(0));
    await this.gather('d');
    if (this.dead) return;
    dVals = this.values('d');

    // ---- showdown
    const res = settlePd(pVals, dVals, this.stakes);
    const winSide: Side | null = res.outcome > 0 ? 'p' : res.outcome < 0 ? 'd' : null;
    this.tagFor('p', this.handLabel(res.player), res.outcome > 0 ? 'win' : res.outcome < 0 ? 'lose' : '');
    this.tagFor('d', `${t('pd.dealer')} · ${this.handLabel(res.dealer)}`, res.outcome < 0 ? 'dealer' : 'lose');
    this.paytable?.highlight(7 - res.player.cat);
    if (winSide) {
      const s = this.rig(winSide);
      const mask = comboDice(s.dice.map((x) => x.value));
      s.dice.forEach((x, i) => {
        if (!mask[i]) return;
        x.glow(1);
        void this.moveDie(x, x.pos.clone().setY(DIE / 2 + 0.05), x.mesh.quaternion, 0, 0.3, 0.06);
      });
      fx.glow(new THREE.Vector3(0, 0, s.rowZ), 5 * L.slot + 0.3, 0.7, 1.8);
      if (winSide === 'p') {
        sfx.bell(0.05);
        fx.burst(new THREE.Vector3(0, 0.35, s.rowZ), res.player.cat >= CAT.four ? 160 : 80);
        if (res.player.cat === CAT.five) this.confetti(s.rowZ);
      }
    }
    await wait(0.5);
    if (this.dead) return;
    await this.settle(res.ret, { big: res.player.cat === CAT.five ? t('pd.big') : undefined });
    this.paytable?.highlight(null);
    // the winning dice settle back down
    for (const s of [p, d])
      s.dice.forEach((x, i) => {
        if (x.pos.y > DIE / 2 + 0.01) void this.moveDie(x, this.rowPos(s === p ? 'p' : 'd', s.slot[i]), x.mesh.quaternion, 0, 0.3, 0);
      });
  }

  /** A shower of gold, red and ivory sparks for five of a kind. */
  private confetti(z: number) {
    const { fx } = this.g;
    const colors = ['#ffd36b', '#ff4d5e', '#fff4dc', '#7fe0a8', '#8fb8ff'];
    colors.forEach((c, k) =>
      gsap.delayedCall(k * 0.12, () => {
        fx.burst(new THREE.Vector3((k - 2) * 0.45, 0.4, z), 70, c, 1.2, 2.4);
      }),
    );
  }

  // ---------------------------------------------------------------- payouts: the dealer pays down the side lane
  protected async settle(ret: Record<string, number>, opts: { big?: string; folded?: boolean; credited?: boolean } = {}) {
    const { wallet, sfx } = this.g;
    let wager = 0;
    let back = 0;
    const pays: [string, number][] = [];
    const takes: string[] = [];
    for (const [id, s] of this.spots.spots) {
      const stake = s.amount;
      if (!stake) continue;
      wager += stake;
      const r = ret[id] ?? 0;
      back += r;
      if (r > stake) pays.push([id, r - stake]);
      else if (r < stake) takes.push(id);
    }
    if (pays.length || takes.length) sfx.play('chips', { vol: 0.6 });
    // losing bets leave first (the one nearest the lane first), then the dealer pays down the lane:
    // the stacks never cross in the corridor
    takes.sort((a, b) => this.spots.get(b).pos.x - this.spots.get(a).pos.x);
    await Promise.all(takes.map((id, k) => this.takeAround(id, k * 0.3)));
    pays.sort((a, b) => this.spots.get(a[0]).pos.x - this.spots.get(b[0]).pos.x);
    await Promise.all(pays.map(([id, n], k) => this.payAround(id, n, k * 0.2)));
    if (!opts.credited) wallet.credit(back);
    const net = back - wager;
    const banner = resultBanner(this.g, net, wager, opts);
    await finishXP(this.g, wager, net, banner);
    return net;
  }

  private get rackZ() {
    return this.g.stage.screenToTable(0.5, -0.12).z;
  }

  /** Winnings come from the dealer's rack down the right-hand lane, along the corridor, to the bet. */
  private async payAround(id: string, amount: number, delay: number) {
    const { stage, chips, sfx } = this.g;
    const s = this.spots.get(id);
    const p = new ChipPile(chips, stage.table, new THREE.Vector3(L.laneX, 0, this.rackZ));
    p.set(amount);
    s.payouts.push(p);
    if (delay) await wait(delay);
    sfx.play('chip', { vol: 0.45, rate: 1.1 });
    await slideChips(p.group, new THREE.Vector3(L.laneX, 0, L.corridorZ), 0.62, 0.1, 'power2.in');
    const x = s.pos.x + 0.48;
    await slideChips(p.group, new THREE.Vector3(x, 0, L.corridorZ), 0.36, 0.08, 'power1.inOut');
    await slideChips(p.group, new THREE.Vector3(x, 0, s.pos.z), 0.26, 0.06, 'power3.out');
    sfx.play('stack', { vol: 0.75 });
    sfx.coins(4);
  }

  /** A losing bet goes up the corridor and the lane to the dealer. */
  private async takeAround(id: string, delay: number) {
    const s = this.spots.get(id);
    const home = s.pile.group.position.clone();
    if (delay) await wait(delay);
    this.g.sfx.play('handle', { vol: 0.55 });
    await slideChips(s.pile.group, new THREE.Vector3(home.x, 0, L.corridorZ), 0.24, 0.06, 'power2.inOut');
    await slideChips(s.pile.group, new THREE.Vector3(L.laneX, 0, L.corridorZ), 0.34, 0.06, 'power2.inOut');
    await slideChips(s.pile.group, new THREE.Vector3(L.laneX, 0, this.rackZ), 0.55, 0.1, 'power2.in');
    s.pile.clear();
    s.pile.group.position.copy(home);
  }
}
