import * as THREE from 'three';
import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import { cryptoRng } from '../../core/rng';
import { wait } from '../../table/anim';
import { DealerCovers } from '../coinflip/cover';
import type { SpotDef } from '../kit';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { HorseKit, ToyHorse } from './horse';
import { BOX_H, BOX_W, drawBox, endPrint, PILE_DX, PILE_Z } from './prints';
import { planRace } from './race';
import { finishOrder, HORSES, HR, multLabel, newRace, pickWinner, raceCover, settleRace, type Race } from './rules';
import { GATE_S, LAP, laneR, surfaceNormal, surfaceY, Track, trackAt, type TrackFrame } from './track';

addStrings(
  {
    'horses.h1': 'Scarlet Comet',
    'horses.h2': 'Blue Thunder',
    'horses.h3': 'Golden Luck',
    'horses.h4': 'Emerald Dash',
    'horses.h5': 'Royal Velvet',
    'horses.bet': 'BET',
    'horses.house': 'HOUSE',
    'horses.title': 'LUCKY HORSES',
    'horses.endLeft': 'VILLA LAGO DERBY',
    'horses.endTop': 'WINNER PAYS THE ODDS',
    'horses.endBottom': 'STAKE INCLUDED',
    'horses.needBet': 'Put chips on a horse',
    'horses.photo': 'PHOTO FINISH',
    'horses.place1': '1st',
    'horses.place2': '2nd',
    'horses.place3': '3rd',
    'horses.place4': '4th',
    'horses.place5': '5th',
    'horses.wins': '{name} WINS',
    'horses.rules': `
      <p>Five toy horses run one lap of the board and you bet against the house's book. Choose a chip, then click the horses' boxes to put it there (right-click takes one off). Back as many horses as you like.</p>
      <h4>Form and odds</h4>
      <p>Before every race each horse shows its <b>form</b> (1 to 5 stars). Better form means a better chance — and shorter odds. The price on each box, like <b>×4.5</b>, is what a winning bet returns, stake included.</p>
      <h4>The house covers you</h4>
      <p>When betting closes the dealer puts its own chips next to each of your stacks: what it pays if that horse wins. The winner's cover is yours; every other stack goes to the house.</p>
      <h4>Return</h4><p>The book keeps a 5% margin: every horse returns about 93–95% of what is bet on it. There is no strategy — favourites win more often, long shots pay more.</p>`,
  },
  {
    'horses.h1': 'Cometa Escarlate',
    'horses.h2': 'Trovão Azul',
    'horses.h3': 'Sorte Dourada',
    'horses.h4': 'Esmeralda Veloz',
    'horses.h5': 'Veludo Real',
    'horses.bet': 'APOSTA',
    'horses.house': 'BANCA',
    'horses.title': 'CAVALOS DA SORTE',
    'horses.endLeft': 'GRANDE PRÊMIO VILLA LAGO',
    'horses.endTop': 'O VENCEDOR PAGA A COTAÇÃO',
    'horses.endBottom': 'APOSTA INCLUÍDA',
    'horses.needBet': 'Coloque fichas num cavalo',
    'horses.photo': 'PHOTO FINISH',
    'horses.place1': '1º',
    'horses.place2': '2º',
    'horses.place3': '3º',
    'horses.place4': '4º',
    'horses.place5': '5º',
    'horses.wins': '{name} VENCE',
    'horses.rules': `
      <p>Cinco cavalinhos dão uma volta no tabuleiro e você aposta contra a banca. Escolha uma ficha e clique nas caixas dos cavalos para colocá-la (botão direito tira uma). Aposte em quantos cavalos quiser.</p>
      <h4>Forma e cotações</h4>
      <p>Antes de cada corrida cada cavalo mostra a sua <b>forma</b> (1 a 5 estrelas). Melhor forma, mais chance — e cotação menor. O preço em cada caixa, como <b>×4.5</b>, é o que uma aposta vencedora devolve, já com a aposta.</p>
      <h4>A banca cobre você</h4>
      <p>Ao fechar as apostas o dealer coloca as próprias fichas ao lado de cada pilha sua: o que ele paga se aquele cavalo ganhar. A cobertura do vencedor é sua; as outras pilhas vão para a banca.</p>
      <h4>Retorno</h4><p>A banca guarda uma margem de 5%: cada cavalo devolve cerca de 93–95% do que se aposta nele. Não há estratégia — os favoritos ganham mais vezes, os azarões pagam mais.</p>`,
  },
);

/** Layout: the oval is laid out in table units around one anchor (its centre), so it never stretches. */
const V_CENTER = 0.45;
const BOX_GAP = 0.12;
const boxX = (i: number) => (i - 2) * (BOX_W + BOX_GAP);
/** Walking pace back to the gate. */
const WALK = 0.42;

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

function uAt(g: GameCtx, x: number, v: number): number {
  const a = g.stage.screenToTable(0, v).x;
  const b = g.stage.screenToTable(1, v).x;
  return 0.5 + x / (b - a);
}

interface Runner {
  horse: ToyHorse;
  s: number;
  /** Extra turn (π = facing back up the track). */
  turn: number;
}

export class HorsesView extends TableGame {
  readonly id = 'horses';
  readonly title = 'Lucky Horses';
  protected readonly felt = 'horses' as const;
  protected usesCards = false;
  protected placeOnSpotClick = true;
  private covers: DealerCovers;
  private race: Race | null = null;
  private raceDone = false;
  private track: Track | null = null;
  private kit: HorseKit | null = null;
  private runners: Runner[] = [];
  private boxes: { cv: HTMLCanvasElement; tex: THREE.Texture | null }[] = [];
  private zc = 0;
  private toGate: Promise<void> = Promise.resolve();
  private offTick: (() => void) | null = null;
  private clock = 0;
  private f: TrackFrame = trackAt(0, 1);
  private nrm = new THREE.Vector3();
  private qa = new THREE.Quaternion();
  private qb = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(g: GameCtx) {
    super(g, 1);
    this.covers = new DealerCovers(g, { lift: 0.45 });
  }

  rules() {
    return t('horses.rules');
  }

  private get anchorZ() {
    return this.g.stage.screenToTable(0.5, V_CENTER).z;
  }

  /** Depth of the stacks in the boxes. */
  private get pileZ() {
    return this.anchorZ - BOX_H / 2 + PILE_Z;
  }

  protected spotDefs(): SpotDef[] {
    const g = this.g;
    const v = vAt(g, this.pileZ);
    return HORSES.map((h, i) => ({
      id: h.id,
      label: t(`horses.${h.id}`),
      u: uAt(g, boxX(i), v),
      v,
      ring: false,
      hitW: BOX_W,
      hitH: 1.1,
      max: HR.maxBet,
    }));
  }

  protected defaultBets() {
    const r = this.race;
    if (!r) return { h1: 25 };
    const fav = r.p.indexOf(Math.max(...r.p));
    return { [HORSES[fav].id]: 25 };
  }

  private boxInfo(i: number) {
    const r = this.race!;
    return {
      def: HORSES[i],
      name: t(`horses.${HORSES[i].id}`),
      odds: multLabel(r.mult[i]),
      form: r.form[i],
      bet: t('horses.bet'),
      house: t('horses.house'),
    };
  }

  protected decorate() {
    const { table, stage } = this.g;
    if (!this.race) this.race = newRace(cryptoRng);
    const zc = (this.zc = this.anchorZ);
    this.boxes = HORSES.map((_, i) => {
      const cv = drawBox(null, this.boxInfo(i));
      const mesh = table.addDecalAt(cv, boxX(i), zc, BOX_W);
      return { cv, tex: (mesh.material as THREE.MeshStandardMaterial).map };
    });
    const endW = 1.12;
    table.addDecalAt(endPrint('shoe', t('horses.title'), t('horses.endLeft')), -3.36, zc, endW);
    table.addDecalAt(endPrint('cup', t('horses.endTop'), t('horses.endBottom')), 3.36, zc, endW);
    HORSES.forEach((h, i) => (this.spots.get(h.id).pile.group.position.x = boxX(i) - PILE_DX));
    if (!this.track) {
      this.track = new Track();
      this.kit = new HorseKit();
      stage.table.add(this.track.group);
      this.runners = HORSES.map((h) => {
        const horse = new ToyHorse(h, this.kit!);
        this.track!.group.add(horse.root);
        return { horse, s: GATE_S, turn: 0 };
      });
      this.runners.forEach((_, i) => this.putRunner(i));
      this.offTick = stage.onFrame((dt) => this.tick(dt));
    }
    this.track.group.position.set(0, 0, zc);
  }

  private redrawBoxes() {
    this.boxes.forEach((b, i) => {
      drawBox(b.cv, this.boxInfo(i));
      if (b.tex) b.tex.needsUpdate = true;
    });
  }

  /** Puts runner i on its lane at its distance, banked with the track and turned to its heading. */
  private putRunner(i: number) {
    const r = this.runners[i];
    if (!r) return;
    const rad = laneR(i);
    const f = trackAt(r.s, rad, this.f);
    const root = r.horse.root;
    root.position.set(f.x, surfaceY(f, rad), f.z);
    const yaw = Math.atan2(-f.dz, f.dx) + r.turn;
    this.qb.setFromAxisAngle(this.up, yaw);
    this.qa.setFromUnitVectors(this.up, surfaceNormal(f, this.nrm));
    root.quaternion.copy(this.qa).multiply(this.qb);
  }

  private tick(dt: number) {
    this.clock += dt;
    this.track?.tick(this.clock);
    for (const r of this.runners) r.horse.animate(dt);
  }

  protected toBetting() {
    super.toBetting();
    if (this.raceDone) {
      this.raceDone = false;
      this.race = newRace(cryptoRng);
      this.redrawBoxes();
      this.toGate = this.returnToGate();
    }
  }

  /** After the race: the horses turn round, walk back to the gate, face the track again; the gate comes down. */
  private async returnToGate() {
    const track = this.track!;
    const scale = () => gsap.globalTimeline.timeScale() || 1;
    const jobs = this.runners.map(async (r, i) => {
      const home = GATE_S;
      // they pulled up just past the line: walk back the way they came
      const from = r.s > LAP / 2 ? r.s - LAP : r.s;
      r.s = from;
      await wait(i * 0.12);
      const o = { k: 0 };
      r.horse.speed = 0.16 * scale();
      await gsap.to(o, {
        k: 1,
        duration: 0.55,
        ease: 'power1.inOut',
        onUpdate: () => {
          r.turn = Math.PI * o.k;
          this.putRunner(i);
        },
      });
      const dist = Math.max(0.01, from - home);
      const w = { s: from };
      r.horse.speed = WALK * scale();
      await gsap.to(w, {
        s: home,
        duration: dist / WALK,
        ease: 'power1.inOut',
        onUpdate: () => {
          r.s = w.s;
          this.putRunner(i);
        },
      });
      r.horse.speed = 0.16 * scale();
      await gsap.to(o, {
        k: 0,
        duration: 0.55,
        ease: 'power1.inOut',
        onUpdate: () => {
          r.turn = Math.PI * o.k;
          this.putRunner(i);
        },
      });
      r.turn = 0;
      r.horse.speed = 0;
      this.putRunner(i);
    });
    await Promise.all(jobs);
    track.setDoors(0);
    const o = { k: 1 };
    await gsap.to(o, { k: 0, duration: 0.6, ease: 'power2.out', onUpdate: () => track.setGateAway(o.k) });
    this.g.sfx.play('place', { vol: 0.35 });
  }

  protected validate() {
    if (this.spots.total < HR.minBet) return t('horses.needBet');
    return '';
  }

  protected async settle(ret: Record<string, number>, opts: { big?: string; folded?: boolean; credited?: boolean } = {}) {
    const net = await this.covers.settle(this.spots, ret, opts);
    await wait(0.45);
    await this.covers.sweepOver(this.spots);
    return net;
  }

  /** The camera flash of the photo finish. */
  private flash() {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:.8;pointer-events:none;z-index:60;transition:opacity .5s ease-out';
    this.g.hud.root.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = '0')));
    setTimeout(() => el.remove(), 700);
  }

  protected async playRound() {
    const { sfx, fx, hud } = this.g;
    await this.toGate;
    const track = this.track!;
    const race = this.race!;
    const bets = this.spots.amounts();
    const winner = pickWinner(race, cryptoRng);
    const order = finishOrder(race, winner, cryptoRng);
    this.raceDone = true;
    const zc = this.zc;
    const pz = this.pileZ;

    // the book closes: the dealer covers every stack with what it would pay
    const jobs: Promise<void>[] = [];
    let k = 0;
    HORSES.forEach((h, i) => {
      const stake = bets[h.id] ?? 0;
      if (stake > 0) jobs.push(this.covers.add(h.id, raceCover(stake, race.mult[i]), new THREE.Vector3(boxX(i) + PILE_DX, 0, pz), k++ * 0.13));
    });
    await Promise.all(jobs);

    // the call to the post, then the gate springs open
    sfx.fanfare();
    await wait(1.55);
    const scale = gsap.globalTimeline.timeScale() || 1;
    const plan = planRace(order, LAP - GATE_S);
    sfx.play('handle', { vol: 0.9, rate: 0.8 });
    sfx.tick(0.35, 0.45);
    const d = { k: 0 };
    gsap.to(d, { k: 1, duration: 0.22, ease: 'power2.out', onUpdate: () => track.setDoors(d.k) });
    sfx.gallop(Math.max(...plan.T) / scale);
    sfx.whoosh(0.6 / scale);
    let finished = 0;
    let gateGone = false;
    const o = { t: 0 };
    await gsap.to(o, {
      t: plan.dur,
      duration: plan.dur,
      ease: 'none',
      onUpdate: () => {
        const tt = o.t;
        const sc = gsap.globalTimeline.timeScale() || 1;
        this.runners.forEach((r, i) => {
          r.s = GATE_S + plan.s(i, tt);
          r.turn = 0;
          r.horse.speed = plan.v(i, tt) * sc;
          this.putRunner(i);
        });
        if (!gateGone && tt > 0.8) {
          gateGone = true;
          const gk = { k: 0 };
          gsap.to(gk, { k: 1, duration: 1.0, ease: 'power2.in', onUpdate: () => track.setGateAway(gk.k) });
        }
        while (finished < order.length && tt >= plan.T[order[finished]]) {
          if (finished === 0) {
            if (plan.margin < 0.25) {
              this.flash();
              sfx.tick(0.4, 1.6);
              void hud.banner(t('horses.photo'), '', 'small', 1100);
            }
            sfx.play('chips', { vol: 0.5 });
          }
          finished++;
        }
      },
    });
    this.runners.forEach((r) => (r.horse.speed = 0));

    // places, and the winner's box lights up
    order.forEach((i, place) => {
      const p = this.runners[i].horse.root.position;
      this.tag(t(`horses.place${place + 1}`), place === 0 ? 'win' : place < 3 ? '' : 'lose', p.x, zc + p.z - 0.5);
    });
    const wp = this.runners[winner].horse.root.position;
    fx.burst(new THREE.Vector3(wp.x, 0.4, zc + wp.z), 90, HORSES[winner].color, 0.5);
    fx.glow(new THREE.Vector3(boxX(winner), 0, zc), BOX_W * 1.08, BOX_H * 1.04, 1.8);
    const ret = settleRace(bets, race, winner);
    const won = (ret[HORSES[winner].id] ?? 0) > 0;
    if (won) sfx.bell(0.1);
    await wait(0.7);
    const name = t(`horses.${HORSES[winner].id}`).toUpperCase();
    const big = won && race.mult[winner] >= 6 ? name : undefined;
    await this.settle(ret, { big });
  }

  protected cleanup() {
    this.covers.clear();
    this.offTick?.();
    this.offTick = null;
    for (const r of this.runners) r.horse.dispose();
    this.runners = [];
    this.kit?.dispose();
    this.kit = null;
    this.track?.dispose();
    this.track = null;
    this.boxes = [];
    this.raceDone = false;
    this.toGate = Promise.resolve();
  }
}
