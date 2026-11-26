import * as THREE from 'three';
import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import { cryptoRng } from '../../core/rng';
import { slideChips, wait } from '../../table/anim';
import { ChipPile } from '../../table/chips';
import { Paytable } from '../../ui/paytable';
import type { SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { Coin, COIN_R, COIN_T, coinQuat, planFlip } from './coin';
import { DealerCovers } from './cover';
import { boxPrint, landingPrint, titlePrint } from './prints';
import { COIN, coinCover, flip, settleCoin, type CoinFace } from './rules';

addStrings(
  {
    'coinflip.heads': 'HEADS',
    'coinflip.tails': 'TAILS',
    'coinflip.edge': 'EDGE',
    'coinflip.pays': 'PAYS 1 TO 1',
    'coinflip.print1': 'COIN FLIP',
    'coinflip.print2': 'Heads or tails against the house',
    'coinflip.ringTop': 'VILLA LAGO · HEADS OR TAILS',
    'coinflip.ringBottom': 'ON ITS EDGE HEADS AND TAILS LOSE',
    'coinflip.needBet': 'Place a bet on HEADS, TAILS or EDGE',
    'coinflip.isHeads': 'HEADS!',
    'coinflip.isTails': 'TAILS!',
    'coinflip.isEdge': 'ON ITS EDGE!',
    'coinflip.big': 'EDGE!',
    'coinflip.edgeRule': 'ON EDGE: HEADS & TAILS LOSE',
    'coinflip.rules': `
      <p>The dealer flicks a gold coin onto the felt. Bet on <b>HEADS</b> (the crowned VL) or <b>TAILS</b> (the star) — or both. When betting closes the dealer <b>covers your bet</b> with the same amount next to your chips, and the winner takes both stacks: HEADS and TAILS pay <b>1:1</b>.</p>
      <h4>On its edge</h4>
      <p>Once in 40 flips the coin comes to rest <b>standing on its edge</b>. Then every HEADS and TAILS bet loses — that is the house's edge.</p>
      <h4>Edge bet</h4><p>Optional bet that the coin stands on its edge: pays <b>35:1</b>.</p>
      <h4>Return</h4><p>HEADS or TAILS: 97.5% · EDGE: 90%. There is no strategy: every flip is independent.</p>`,
  },
  {
    'coinflip.heads': 'CARA',
    'coinflip.tails': 'COROA',
    'coinflip.edge': 'EM PÉ',
    'coinflip.pays': 'PAGA 1 PARA 1',
    'coinflip.print1': 'CARA OU COROA',
    'coinflip.print2': 'Contra a banca, numa moeda de ouro',
    'coinflip.ringTop': 'VILLA LAGO · CARA OU COROA',
    'coinflip.ringBottom': 'MOEDA EM PÉ: CARA E COROA PERDEM',
    'coinflip.needBet': 'Aposte em CARA, COROA ou EM PÉ',
    'coinflip.isHeads': 'CARA!',
    'coinflip.isTails': 'COROA!',
    'coinflip.isEdge': 'FICOU EM PÉ!',
    'coinflip.big': 'EM PÉ!',
    'coinflip.edgeRule': 'EM PÉ: CARA E COROA PERDEM',
    'coinflip.rules': `
      <p>O dealer joga uma moeda de ouro sobre o feltro. Aposte em <b>CARA</b> (o VL coroado) ou <b>COROA</b> (a estrela) — ou nas duas. Ao fechar as apostas o dealer <b>cobre a sua aposta</b> com o mesmo valor ao lado das suas fichas, e quem ganha leva as duas pilhas: CARA e COROA pagam <b>1:1</b>.</p>
      <h4>Moeda em pé</h4>
      <p>Uma vez em 40 a moeda para <b>em pé, sobre a borda</b>. Aí todas as apostas em CARA e COROA perdem — essa é a vantagem da casa.</p>
      <h4>Aposta EM PÉ</h4><p>Aposta opcional de que a moeda fica em pé: paga <b>35:1</b>.</p>
      <h4>Retorno</h4><p>CARA ou COROA: 97,5% · EM PÉ: 90%. Não há estratégia: cada jogada é independente.</p>`,
  },
);

/**
 * Table layout, in table units from one anchor (the centre of the landing circle) so the round
 * shapes never stretch. Columns: HEADS box · landing circle · TAILS box; the dealer's cradle above,
 * the EDGE circle below.
 */
const L = {
  v: 0.47,
  boxX: 1.38,
  boxW: 0.95,
  boxH: 1.5,
  pileDx: 0.23,
  landing: 1.86,
  cradleDz: -2.4,
  titleDz: -1.4,
  edgeDz: 1.32,
  cradleH: 0.042,
};

/** Frame v whose table point (at u = 0.5) has depth z. */
function vAt(g: GameCtx, z: number): number {
  let lo = -0.6;
  let hi = 1.6;
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

export class CoinFlipView extends TableGame {
  readonly id = 'coinflip';
  readonly title = 'Coin Flip';
  protected readonly felt = 'coinflip' as const;
  protected usesCards = false;
  private covers: DealerCovers;
  private coin: Coin | null = null;
  private cradle: THREE.Group | null = null;
  private cradleMats: { dispose(): void }[] = [];
  private onCradle = true;
  private z0 = 0;

  constructor(g: GameCtx) {
    super(g, 1);
    // the dealer's chips come straight down to each box; the EDGE bet is paid and taken along the
    // side of the table, so no stack ever slides through the coin or its cradle
    this.covers = new DealerCovers(g, { rackK: 1, pay: (id, n) => this.payAround(id, n), take: (id) => this.takeAround(id) });
  }

  rules() {
    return t('coinflip.rules');
  }

  private get anchorZ() {
    return this.g.stage.screenToTable(0.5, L.v).z;
  }

  protected spotDefs(): SpotDef[] {
    const g = this.g;
    const z0 = this.anchorZ;
    return [
      { id: 'heads', label: t('coinflip.heads'), u: uAt(g, -L.boxX, L.v), v: L.v, ring: false, hitW: L.boxW, hitH: L.boxH, max: COIN.maxBet },
      { id: 'tails', label: t('coinflip.tails'), u: uAt(g, L.boxX, L.v), v: L.v, ring: false, hitW: L.boxW, hitH: L.boxH, max: COIN.maxBet },
      { id: 'edge', label: t('coinflip.edge'), sub: `${COIN.edgePays}:1`, u: 0.5, v: vAt(g, z0 + L.edgeDz), size: 0.62, max: COIN.maxEdge },
    ];
  }

  protected defaultBets() {
    return { heads: 25 };
  }

  /** Where the player's stack sits in a box (outer side) and where the dealer's cover goes (inner side). */
  private pileX(id: 'heads' | 'tails', dealer: boolean) {
    const side = id === 'heads' ? -1 : 1;
    return side * (L.boxX + (dealer ? -L.pileDx : L.pileDx));
  }

  private get cradlePos() {
    return new THREE.Vector3(0, L.cradleH, this.z0 + L.cradleDz);
  }

  protected decorate() {
    const { table, hud, stage } = this.g;
    const z0 = (this.z0 = this.anchorZ);
    table.addDecalAt(landingPrint(t('coinflip.ringTop'), t('coinflip.ringBottom')), 0, z0, L.landing);
    table.addDecalAt(boxPrint('heads', t('coinflip.heads'), t('coinflip.pays')), -L.boxX, z0, L.boxW);
    table.addDecalAt(boxPrint('tails', t('coinflip.tails'), t('coinflip.pays')), L.boxX, z0, L.boxW);
    table.addDecalAt(titlePrint(t('coinflip.print1'), t('coinflip.print2')), 0, z0 + L.titleDz, 3.0);
    for (const id of ['heads', 'tails'] as const) this.spots.get(id).pile.group.position.x = this.pileX(id, false);
    this.paytable = new Paytable(hud.root, '', [
      [t('coinflip.heads'), '1:1'],
      [t('coinflip.tails'), '1:1'],
      [t('coinflip.edge'), `${COIN.edgePays}:1`],
      [t('coinflip.edgeRule'), ''],
    ]);
    if (!this.cradle) {
      this.cradle = this.buildCradle();
      stage.table.add(this.cradle);
    }
    this.cradle.position.set(0, 0, z0 + L.cradleDz);
    if (!this.coin) {
      this.coin = new Coin(stage.scene.environment);
      stage.table.add(this.coin.group, this.coin.shadow);
      this.onCradle = true;
    }
    if (this.onCradle) this.coin.place(this.cradlePos.add(new THREE.Vector3(0, COIN_T / 2, 0)), new THREE.Quaternion(), L.cradleH);
  }

  /** The dealer's cradle: a velvet pad in a gold ring, where the coin waits for the flick. */
  private buildCradle(): THREE.Group {
    const grp = new THREE.Group();
    const velvet = new THREE.MeshStandardMaterial({ color: '#4d0b18', roughness: 0.96, metalness: 0 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d9b45c', metalness: 1, roughness: 0.3 });
    const padGeo = new THREE.CylinderGeometry(0.6, 0.63, L.cradleH, 72);
    const pad = new THREE.Mesh(padGeo, velvet);
    pad.position.y = L.cradleH / 2;
    const ringGeo = new THREE.TorusGeometry(0.635, 0.022, 12, 120);
    const ring = new THREE.Mesh(ringGeo, gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = L.cradleH * 0.75;
    grp.add(pad, ring);
    this.cradleMats.push(velvet, gold, padGeo, ringGeo);
    return grp;
  }

  protected validate() {
    if (this.spots.total < COIN.minBet) return t('coinflip.needBet');
    return '';
  }

  protected settle(ret: Record<string, number>, opts: { big?: string; folded?: boolean; credited?: boolean } = {}) {
    return this.covers.settle(this.spots, ret, opts);
  }

  protected cleanup() {
    this.covers.clear();
    this.coin?.dispose();
    this.coin = null;
    this.cradle?.removeFromParent();
    this.cradle = null;
    for (const m of this.cradleMats) m.dispose();
    this.cradleMats = [];
    this.onCradle = true;
  }

  /** x of the lane down the side of the table (outside the boxes). */
  private get sideX() {
    return L.boxX + L.boxW / 2 + 0.42;
  }

  /** EDGE winnings: down the right side of the table, then across to the EDGE circle. */
  private async payAround(id: string, amount: number) {
    const { stage, chips, sfx } = this.g;
    const s = this.spots.get(id);
    const top = this.covers.rack(1);
    const p = new ChipPile(chips, stage.table, new THREE.Vector3(this.sideX, 0, top.z));
    p.set(amount);
    s.payouts.push(p);
    await slideChips(p.group, new THREE.Vector3(this.sideX, 0, s.pos.z), 0.55, 0.1, 'power2.in');
    await slideChips(p.group, new THREE.Vector3(s.pos.x + 0.5, 0, s.pos.z), 0.42, 0.1, 'power3.out');
    sfx.play('stack', { vol: 0.7 });
  }

  /** A losing EDGE bet goes across to the left side and up to the dealer. */
  private async takeAround(id: string) {
    const s = this.spots.get(id);
    const home = s.pile.group.position.clone();
    const top = this.covers.rack(1);
    await slideChips(s.pile.group, new THREE.Vector3(-this.sideX, 0, home.z), 0.42, 0.1, 'power2.inOut');
    await slideChips(s.pile.group, new THREE.Vector3(-this.sideX, 0, top.z), 0.5, 0.1, 'power2.in');
    s.pile.clear();
    s.pile.group.position.copy(home);
  }

  /** The dealer takes the coin back to the cradle and sets it down in the pose of the next flick. */
  private async pickUp(pos: THREE.Vector3, quat: THREE.Quaternion) {
    const coin = this.coin!;
    const p0 = coin.group.position.clone();
    const q0 = coin.group.quaternion.clone();
    const far = p0.distanceTo(pos) > 0.3;
    const lift = far ? 0.45 : 0.08;
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const o = { t: 0 };
    if (far) this.g.sfx.play('chip', { vol: 0.35, rate: 1.3 });
    await gsap.to(o, {
      t: 1,
      duration: far ? 0.62 : 0.3,
      ease: 'power2.inOut',
      onUpdate: () => {
        p.lerpVectors(p0, pos, o.t);
        p.y += Math.sin(Math.PI * o.t) * lift;
        q.slerpQuaternions(q0, quat, Math.min(1, o.t * 1.25));
        coin.place(p, q, o.t > 0.5 ? L.cradleH : 0);
      },
    });
    coin.place(pos, quat, L.cradleH);
    if (far) this.g.sfx.play('place', { vol: 0.3 });
    this.onCradle = true;
  }

  protected async playRound() {
    const { fx, sfx } = this.g;
    const coin = this.coin!;
    const bets = this.spots.amounts();
    const res: CoinFace = flip(cryptoRng);
    const z0 = this.z0;
    // where it comes to rest: near the middle of the landing circle
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * 0.12;
    const target = new THREE.Vector3(Math.cos(ang) * rad, 0, z0 + Math.sin(ang) * rad * 0.8);
    const start = this.cradlePos.add(new THREE.Vector3(0, COIN_T / 2, 0));
    const plan = planFlip(start, target, res);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    plan.pose(0, pos, quat);

    // the dealer covers the HEADS / TAILS bets and takes the coin back to the cradle
    const jobs: Promise<void>[] = [this.pickUp(start, quat)];
    let k = 0;
    for (const id of ['heads', 'tails'] as const)
      if ((bets[id] ?? 0) > 0) jobs.push(this.covers.add(id, coinCover(bets[id]), new THREE.Vector3(this.pileX(id, true), 0, z0), 0.15 + k++ * 0.14));
    await Promise.all(jobs);
    await wait(0.25);

    // the thumb rocks the coin up on its rim, then flicks it
    const COCK = 0.14;
    const cock = coinQuat(-COCK, Math.PI / 2, 0, 'heads').multiply(quat.clone());
    const o = { t: 0 };
    await gsap.to(o, {
      t: 1,
      duration: 0.2,
      ease: 'none',
      onUpdate: () => {
        const k = Math.sin(Math.PI * o.t);
        // pivoting on the rim: the centre rises as the coin tilts
        coin.place(start.clone().setY(start.y + COIN_R * Math.sin(COCK * k) + 0.006 * k), quat.clone().slerp(cock, k), L.cradleH);
      },
    });
    this.onCradle = false;
    sfx.coins(1);
    const scale = gsap.globalTimeline.timeScale() || 1;
    sfx.whoosh(0.9 / scale);
    let stage2 = 0;
    const f = { t: 0 };
    await gsap.to(f, {
      t: plan.dur,
      duration: plan.dur,
      ease: 'none',
      onUpdate: () => {
        plan.pose(f.t, pos, quat);
        coin.place(pos, quat, 0);
        if (stage2 === 0 && f.t >= plan.hits[0]) {
          stage2 = 1;
          sfx.play('chip', { vol: 0.75, rate: 1.25 });
          sfx.coins(2);
        } else if (stage2 === 1 && f.t >= plan.hits[1]) {
          stage2 = 2;
          sfx.play('chip', { vol: 0.4, rate: 1.4 });
        } else if (stage2 === 2 && f.t >= plan.wobbleAt) {
          stage2 = 3;
          sfx.coinSpin(plan.wobbleDur / scale);
        }
      },
    });
    plan.pose(plan.dur, pos, quat);
    coin.place(pos, quat, 0);

    // result
    const ret = settleCoin(bets, res);
    const won = Object.entries(ret).some(([id, r]) => r > (bets[id] ?? 0));
    const label = res === 'heads' ? t('coinflip.isHeads') : res === 'tails' ? t('coinflip.isTails') : t('coinflip.isEdge');
    const playerOn = (bets[res] ?? 0) > 0;
    this.tag(label, playerOn ? 'win' : 'dealer', 0, z0 - 0.82);
    this.paytable?.highlight(res === 'heads' ? 0 : res === 'tails' ? 1 : 2);
    const glowAt = res === 'edge' ? this.spots.get('edge').pos : new THREE.Vector3(res === 'heads' ? -L.boxX : L.boxX, 0, z0);
    if (res === 'edge') fx.glow(glowAt, 0.95, 0.95, 1.8);
    else fx.glow(glowAt, L.boxW * 1.1, L.boxH * 1.05, 1.6);
    fx.burst(new THREE.Vector3(pos.x, 0.2, pos.z), res === 'edge' ? 170 : 70);
    if (won) sfx.bell(0.05);
    await wait(0.55);
    const big = res === 'edge' && (bets.edge ?? 0) > 0 ? t('coinflip.big') : undefined;
    await this.settle(ret, { big });
    this.paytable?.highlight(null);
  }
}
