import * as THREE from 'three';
import gsap from 'gsap';
import { addStrings, t } from '../../core/i18n';
import { cryptoRng, shuffle } from '../../core/rng';
import { money } from '../../core/wallet';
import { arcTo, wait } from '../../table/anim';
import { CHIP_H, ChipPile } from '../../table/chips';
import type { Pin } from '../../ui/hud';
import { DealerCovers } from '../coinflip/cover';
import { HorseKit, ToyHorse } from '../horses/horse';
import { BOX_H, BOX_W, drawBox, endPrint, PILE_DX } from '../horses/prints';
import { planRace } from '../horses/race';
import { finishOrder, HORSES, HR, multLabel, newRace, pickWinner, raceCover, settleRace, type Race } from '../horses/rules';
import { GATE_S, LAP, laneR, surfaceNormal, surfaceY, Track, trackAt, type TrackFrame } from '../horses/track';
// Lucky Horses' strings: the horses' names, the places and the board's words
import '../horses/view';
import type { SpotDef } from '../kit';
import { drawMindset, newMemory, remember, thinkTime, type AiMemory, type Mindset } from '../partybj/mindset';
import { glowPlate, PARTY_COLORS as COLORS, partyPlate, setPlateName, type Plate } from '../partybj/partyKit';
import type { AiProfile } from '../partybj/rules';
import { drawRegulars, replacementFor } from '../partybj/roster';
import { TableGame } from '../tableGame';
import type { GameCtx } from '../types';
import { BOX_DZ, boxX, MINI, N_SEATS, PILE_DZ, PLAYER_SEAT, ROW, rowIndex, SEAT, seatX, V_CENTER } from './layout';
import { crowdRow } from './prints';
import { aiPlan, isBroke, isLoneWinner, settleAi, type AiBet, type AiPlan } from './rules';

addStrings(
  {
    'ph.title': 'PARTY LUCKY HORSES',
    'ph.tagline': 'Five punters · one lap',
    'ph.value': 'Value on {n}!',
    'ph.pair': 'On {a} and {b}!',
    'ph.longshot': 'Long shot!',
    'ph.longshots': 'Long shots!',
    'ph.fav': 'The favourite!',
    'ph.on': 'On {n}!',
    'ph.lucky': 'Lucky {n}!',
    'ph.spread': 'On {a}, {b} and {c}!',
    'ph.go': 'Go, {n}!',
    'ph.win': 'WIN {x}',
    'ph.busted': 'Busted!',
    'ph.newcomer': 'New player',
    'ph.lone': 'LONE WINNER',
    'ph.rules': `
      <p>Lucky Horses with a crowd at the board: you and four regulars bet on the same race, each against the house's book. Choose a chip, then click a horse's box to put it on your place there (right-click takes one off). Back as many horses as you like.</p>
      <h4>Form and odds</h4>
      <p>Before every race each horse shows its <b>form</b> (1 to 5 stars) and its price, like <b>×4.5</b>: what a winning bet returns, stake included. Better form means a better chance and a shorter price.</p>
      <h4>The house covers you</h4>
      <p>When betting closes the dealer puts its own chips beside each of your stacks: what it pays if that horse wins. The winner's cover is yours; every other stack goes to the house.</p>
      <h4>The regulars</h4>
      <p>Regulars from the Villa Lago circuit come and go, a different crowd at every visit. Each one has a temperament of their own but changes approach from race to race. Their chips go on the row of places in their colour in front of each box, so you can see who backed whom, and while the horses run, whoever backs the leader cheers it on. A regular who goes broke leaves the table and a new face takes the seat. They bet 10–250 of their own chips a race; only your bets touch your bankroll.</p>
      <h4>Lone winner</h4>
      <p>Win on a horse priced <b>×6 or more</b> that none of the regulars backed.</p>
      <h4>Return</h4><p>The book keeps a 5% margin: every horse returns about 93–95% of what is bet on it, whoever bets. There is no strategy: favourites win more often, long shots pay more.</p>`,
  },
  {
    'ph.title': 'PARTY CAVALOS DA SORTE',
    'ph.tagline': 'Cinco apostadores · uma volta',
    'ph.value': 'Valor no {n}!',
    'ph.pair': 'No {a} e no {b}!',
    'ph.longshot': 'Azarão!',
    'ph.longshots': 'Azarões!',
    'ph.fav': 'No favorito!',
    'ph.on': 'No {n}!',
    'ph.lucky': '{n} da sorte!',
    'ph.spread': 'No {a}, {b} e {c}!',
    'ph.go': 'Vai, {n}!',
    'ph.win': 'GANHOU {x}',
    'ph.busted': 'Quebrou!',
    'ph.newcomer': 'Chegou',
    'ph.lone': 'VENCEDOR SOLITÁRIO',
    'ph.rules': `
      <p>Cavalos da Sorte com a turma no painel: você e quatro frequentadores apostam na mesma corrida, cada um contra a banca. Escolha uma ficha e clique na caixa de um cavalo para colocá-la no seu lugar ali (botão direito tira uma). Aposte em quantos cavalos quiser.</p>
      <h4>Forma e cotações</h4>
      <p>Antes de cada corrida cada cavalo mostra a sua <b>forma</b> (1 a 5 estrelas) e a sua cotação, como <b>×4.5</b>: o que uma aposta vencedora devolve, já com a aposta. Melhor forma, mais chance e cotação menor.</p>
      <h4>A banca cobre você</h4>
      <p>Ao fechar as apostas o dealer coloca as próprias fichas ao lado de cada pilha sua: o que ele paga se aquele cavalo ganhar. A cobertura do vencedor é sua; as outras pilhas vão para a banca.</p>
      <h4>Os frequentadores</h4>
      <p>Frequentadores do circuito Villa Lago vêm e vão, uma turma diferente a cada visita. Cada um tem o seu temperamento, mas muda a forma de apostar de corrida em corrida. As fichas deles vão na fileira de lugares da sua cor na frente de cada caixa, para você ver quem apostou em quem, e durante a corrida quem apostou no cavalo da frente torce por ele. Quem quebra sai da mesa e um rosto novo ocupa o lugar. Eles apostam de 10 a 250 por corrida com as próprias fichas; só as suas apostas mexem no seu saldo.</p>
      <h4>Vencedor solitário</h4>
      <p>Ganhe com um cavalo de cotação <b>×6 ou mais</b> em que nenhum frequentador apostou.</p>
      <h4>Retorno</h4><p>A banca guarda uma margem de 5%: cada cavalo devolve cerca de 93–95% do que se aposta nele, seja quem for. Não há estratégia: os favoritos ganham mais vezes, os azarões pagam mais.</p>`,
  },
);

/** Walking pace back to the gate. */
const WALK = 0.42;

interface AiState {
  profile: AiProfile;
  /** Chips in front of the regular. */
  chips: number;
  /** What the regular remembers between races (streaks), and this race's hidden mindset. */
  mem: AiMemory;
  mind: Mindset | null;
  /** The horse of their last win: a hunch's lucky number. */
  lucky: number | null;
  /** This race's bets on the board. */
  bets: AiBet[];
  stake: number;
  /** What the dealer settled (stakes + winnings) while it is still on the board; null before the finish. */
  owed: number | null;
}

/** A regular's colour marker on top of one of their stacks (moves onto the winnings when they land). */
interface Mark {
  mesh: THREE.Mesh;
  host: ChipPile;
  /** Shown once the stack has landed. */
  on: boolean;
}

interface SeatV {
  pos: number;
  /** x of the seat along the near rail. */
  x: number;
  color: string;
  ai: AiState | null;
  /** A regular's small stacks, one per horse, on its places in the boxes' rows. */
  piles: ChipPile[];
  /** Winnings stacked on top of a winning pile. */
  payouts: ChipPile[];
  /** The seat's colour marker on each of its stacks (one per horse). */
  marks: Mark[];
  plate: Pin;
  plateText: Plate['plateText'];
  tag: Pin;
  tagOn: boolean;
  active: boolean;
}

interface Runner {
  horse: ToyHorse;
  s: number;
  /** Extra turn (π = facing back up the track). */
  turn: number;
}

/**
 * Party Lucky Horses: the Lucky Horses race (its book, race, track, horses and prints) with the
 * player and four regulars betting on the same race. The seats are along the near rail; each box
 * has the player's place (with the house's cover) and a row of places for the regulars' chips.
 */
export class PartyHorsesView extends TableGame {
  readonly id = 'partyhorses';
  readonly title = 'Party Lucky Horses';
  // the racecourse green (falls back to Lucky Horses' felt until a 'partyhorses' felt exists)
  protected readonly felt = 'partyhorses' as const;
  protected usesCards = false;
  protected placeOnSpotClick = true;
  private covers: DealerCovers;
  private ai: AiState[] = [];
  private seats: SeatV[] = [];
  private race: Race | null = null;
  private raceDone = false;
  private track: Track | null = null;
  private kit: HorseKit | null = null;
  private runners: Runner[] = [];
  private boxes: { cv: HTMLCanvasElement; tex: THREE.Texture | null }[] = [];
  /** The player's colour under their stacks in the boxes. */
  private rings: THREE.Mesh[] = [];
  /** Geometry and materials of the rings and the regulars' markers. */
  private own: { dispose(): void }[] = [];
  private zc = 0;
  private toGate: Promise<void> = Promise.resolve();
  private offTick: (() => void) | null = null;
  private clock = 0;
  private raceTween: gsap.core.Tween | null = null;
  /** Bumped on exit: a round still running from before goes quiet. */
  private run = 0;
  private aiBetting: Promise<void> = Promise.resolve();
  private aiSweep: Promise<void> = Promise.resolve();
  private rng = cryptoRng;
  private f: TrackFrame = trackAt(0, 1);
  private nrm = new THREE.Vector3();
  private qa = new THREE.Quaternion();
  private qb = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private v3 = new THREE.Vector3();

  constructor(g: GameCtx) {
    super(g, 1);
    this.covers = new DealerCovers(g, { lift: 0.45 });
  }

  rules() {
    return t('ph.rules');
  }

  /** Every visit, four regulars from the Villa Lago circuit come to the rail. */
  async enter() {
    this.ai = drawRegulars(4, this.rng).map((p) => this.newcomer(p));
    await super.enter();
  }

  private newcomer(profile: AiProfile): AiState {
    return { profile, chips: profile.bank, mem: newMemory(), mind: null, lucky: null, bets: [], stake: 0, owed: null };
  }

  // ---------------------------------------------------------------- layout
  private get anchorZ() {
    return this.g.stage.screenToTable(0.5, V_CENTER).z;
  }

  /** The layout frame's v of a table depth (on the centre line). */
  private vAt(z: number): number {
    let lo = -0.6;
    let hi = 1.6;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (this.g.stage.screenToTable(0.5, mid).z < z) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** The layout frame's u of a table x at row v. */
  private uAt(x: number, v: number): number {
    const a = this.g.stage.screenToTable(0, v).x;
    const b = this.g.stage.screenToTable(1, v).x;
    return 0.5 + x / (b - a);
  }

  /** A regular's place in horse i's row. */
  private rowAt(pos: number, i: number) {
    return new THREE.Vector3(boxX(i) + ROW.dx[rowIndex(pos)], 0, this.zc + ROW.dz);
  }

  /** Where a seat's chips leave from and come back to: just over its plate. */
  private home(sv: SeatV, y: number = SEAT.homeY) {
    return new THREE.Vector3(sv.x, y, this.zc + SEAT.dz);
  }

  protected spotDefs(): SpotDef[] {
    const v = this.vAt(this.anchorZ + PILE_DZ);
    return HORSES.map((h, i) => ({
      id: h.id,
      label: t(`horses.${h.id}`),
      u: this.uAt(boxX(i), v),
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

  protected validate() {
    if (this.spots.total < HR.minBet) return t('horses.needBet');
    return '';
  }

  private boxInfo(i: number) {
    const r = this.race!;
    return {
      def: HORSES[i],
      name: t(`horses.${HORSES[i].id}`),
      odds: multLabel(r.mult[i]),
      form: r.form[i],
      // the player's own place in every box
      bet: t('pb.you').toUpperCase(),
      house: t('horses.house'),
    };
  }

  private miniPile(at: THREE.Vector3) {
    const p = new ChipPile(this.g.chips, this.g.stage.table, at);
    p.group.scale.setScalar(MINI);
    p.group.updateMatrixWorld(true);
    return p;
  }

  protected decorate() {
    const { table, stage, hud } = this.g;
    this.disposeSeats();
    if (!this.race) this.race = newRace(this.rng);
    const zc = (this.zc = this.anchorZ);
    this.boxes = HORSES.map((_, i) => {
      const cv = drawBox(null, this.boxInfo(i));
      const mesh = table.addDecalAt(cv, boxX(i), zc + BOX_DZ, BOX_W);
      return { cv, tex: (mesh.material as THREE.MeshStandardMaterial).map };
    });
    const rowColors = [0, 1, 3, 4].map((p) => COLORS[p]);
    HORSES.forEach((_, i) => table.addDecalAt(crowdRow(rowColors), boxX(i), zc + ROW.dz, ROW.print));
    const endW = 1.12;
    table.addDecalAt(endPrint('shoe', t('ph.title'), t('horses.endLeft')), -3.36, zc, endW);
    table.addDecalAt(endPrint('cup', t('horses.endTop'), t('horses.endBottom')), 3.36, zc, endW);
    HORSES.forEach((h, i) => (this.spots.get(h.id).pile.group.position.x = boxX(i) - PILE_DX));

    // the player's colour glows under their stacks
    const ringGeo = new THREE.RingGeometry(0.228, 0.262, 48).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: COLORS[PLAYER_SEAT], transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    // the regulars' markers: a small button in the seat colour, white rim (in a stack's own units)
    const markGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.024, 28);
    const markSide = new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.4 });
    this.own.push(ringGeo, ringMat, markGeo, markSide);
    this.rings = HORSES.map((_, i) => {
      const m = new THREE.Mesh(ringGeo, ringMat);
      m.position.set(boxX(i) - PILE_DX, 0.004, zc + PILE_DZ);
      m.renderOrder = 2;
      m.visible = false;
      stage.table.add(m);
      return m;
    });

    this.seats = Array.from({ length: N_SEATS }, (_, pos) => {
      const ai = pos === PLAYER_SEAT ? null : this.ai[rowIndex(pos)];
      const sv: SeatV = {
        pos,
        x: seatX(pos),
        color: COLORS[pos],
        ai,
        piles: [],
        payouts: [],
        marks: [],
        ...partyPlate(hud, COLORS[pos], ai ? ai.profile : null),
        tag: hud.pin('handtag'),
        tagOn: false,
        active: false,
      };
      if (ai) {
        sv.piles = HORSES.map((_, i) => this.miniPile(this.rowAt(pos, i)));
        const top = new THREE.MeshStandardMaterial({ color: COLORS[pos], emissive: COLORS[pos], emissiveIntensity: 0.35, roughness: 0.35 });
        this.own.push(top);
        sv.marks = sv.piles.map((host) => {
          const mesh = new THREE.Mesh(markGeo, [markSide, top, top]);
          mesh.visible = false;
          host.group.add(mesh);
          return { mesh, host, on: false };
        });
      }
      return sv;
    });

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

  private disposeSeats() {
    for (const sv of this.seats) {
      for (const p of [...sv.piles, ...sv.payouts]) p.dispose();
      sv.plate.remove();
      sv.tag.remove();
    }
    this.seats = [];
    for (const r of this.rings) r.removeFromParent();
    this.rings = [];
    for (const d of this.own) d.dispose();
    this.own = [];
  }

  protected cleanup() {
    this.run++;
    this.raceTween?.kill();
    this.raceTween = null;
    this.covers.clear();
    // the regulars take back what is theirs on the board: the settled return, or unplayed stakes
    for (const a of this.ai) {
      a.chips += a.owed ?? a.stake;
      a.stake = 0;
      a.owed = null;
      a.bets = [];
      a.mind = null;
    }
    this.disposeSeats();
    this.offTick?.();
    this.offTick = null;
    for (const r of this.runners) r.horse.dispose();
    this.runners = [];
    this.kit?.dispose();
    this.kit = null;
    this.track?.dispose();
    this.track = null;
    this.boxes = [];
    this.race = null;
    this.raceDone = false;
    this.toGate = Promise.resolve();
    this.aiBetting = Promise.resolve();
    this.aiSweep = Promise.resolve();
  }

  /** Suspends a round that outlived its table (the player left mid-race). */
  private async alive(run: number) {
    if (run !== this.run) await new Promise<never>(() => {});
  }

  // ---------------------------------------------------------------- the horses
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

  /** After the race: the horses turn round, walk back to the gate, face the track again; the gate comes down. */
  private async returnToGate(run: number) {
    const track = this.track!;
    const scale = () => gsap.globalTimeline.timeScale() || 1;
    const turn = (r: Runner, i: number, to: number) => {
      const o = { k: 1 - to };
      r.horse.speed = 0.16 * scale();
      return gsap.to(o, {
        k: to,
        duration: 0.55,
        ease: 'power1.inOut',
        onUpdate: () => {
          r.turn = Math.PI * o.k;
          this.putRunner(i);
        },
      });
    };
    const jobs = this.runners.map(async (r, i) => {
      // they pulled up just past the line: walk back the way they came
      const from = r.s > LAP / 2 ? r.s - LAP : r.s;
      r.s = from;
      await wait(i * 0.12);
      await turn(r, i, 1);
      const w = { s: from };
      r.horse.speed = WALK * scale();
      await gsap.to(w, {
        s: GATE_S,
        duration: Math.max(0.01, from - GATE_S) / WALK,
        ease: 'power1.inOut',
        onUpdate: () => {
          r.s = w.s;
          this.putRunner(i);
        },
      });
      await turn(r, i, 0);
      r.turn = 0;
      r.horse.speed = 0;
      this.putRunner(i);
    });
    await Promise.all(jobs);
    if (run !== this.run) return;
    track.setDoors(0);
    const o = { k: 1 };
    await gsap.to(o, { k: 0, duration: 0.6, ease: 'power2.out', onUpdate: () => track.setGateAway(o.k) });
    this.g.sfx.play('place', { vol: 0.35 });
  }

  /** The camera flash of the photo finish. */
  private flash() {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:.8;pointer-events:none;z-index:60;transition:opacity .5s ease-out';
    this.g.hud.root.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = '0')));
    setTimeout(() => el.remove(), 700);
  }

  // ---------------------------------------------------------------- HUD pins
  private screen(x: number, z: number) {
    return this.g.stage.toScreen(this.v3.set(x, 0, z));
  }

  protected onSync() {
    const { wallet } = this.g;
    const on = this.phase !== 'idle';
    for (const sv of this.seats) {
      const pp = this.screen(sv.x, this.zc + SEAT.dz);
      sv.plate.place(pp.x, pp.y);
      sv.plate.show(on);
      const tp = this.screen(sv.x, this.zc + SEAT.dz + SEAT.tagDz);
      sv.tag.place(tp.x, tp.y);
      sv.tag.show(on && sv.tagOn);
      const ct = money(sv.ai ? sv.ai.chips : wallet.balance);
      if (sv.plateText.chips.textContent !== ct) sv.plateText.chips.textContent = ct;
      const bet = sv.ai ? sv.ai.stake : this.spots.total;
      const bt = bet > 0 ? t('pb.betOf', { n: money(bet) }) : '';
      if (sv.plateText.bet.textContent !== bt) sv.plateText.bet.textContent = bt;
      glowPlate(sv.plate, sv.color, sv.active);
      for (const m of sv.marks) {
        const n = Math.min(14, m.host.values.length);
        m.mesh.visible = m.on && n > 0;
        m.mesh.position.y = n * CHIP_H + 0.016;
      }
    }
    // the player's colour under their stacks
    this.rings.forEach((r, i) => (r.visible = (this.spots?.spots.get(HORSES[i].id)?.amount ?? 0) > 0));
  }

  /** A seat's tag over its plate: a call, a cheer or the result. */
  private say(sv: SeatV, text: string, cls = '') {
    sv.tag.set(text, `handtag ${cls}`.trim());
    sv.tag.pop();
    sv.tagOn = true;
  }

  /** What a regular calls out as the chips go down. */
  private callText(p: AiPlan): string {
    const ns = p.bets.map((b) => HORSES[b.horse].n);
    switch (p.call) {
      case 'value':
        return t('ph.value', { n: ns[0] });
      case 'pair':
        return t('ph.pair', { a: Math.min(ns[0], ns[1]), b: Math.max(ns[0], ns[1]) });
      case 'longshot':
        return t('ph.longshot');
      case 'longshots':
        return t('ph.longshots');
      case 'fav':
        return t('ph.fav');
      case 'on':
        return t('ph.on', { n: ns[0] });
      case 'lucky':
        return t('ph.lucky', { n: ns[0] });
      case 'spread': {
        const [a, b, c] = [...ns].sort((x, y) => x - y);
        return t('ph.spread', { a, b, c });
      }
    }
  }

  // ---------------------------------------------------------------- the regulars
  /** The table is open for bets: a new race (after one has run) and the regulars go to the board. */
  protected toBetting() {
    super.toBetting();
    for (const sv of this.seats) {
      sv.tagOn = false;
      sv.active = false;
    }
    if (this.raceDone) {
      this.raceDone = false;
      this.race = newRace(this.rng);
      this.redrawBoxes();
      this.toGate = this.returnToGate(this.run);
    }
    this.aiBetting = this.placeAiBets(this.run);
  }

  /** The regulars size up the board one after another and their chips fly to the horses they back. */
  private async placeAiBets(run: number) {
    await this.aiSweep;
    await this.alive(run);
    const race = this.race!;
    const order = shuffle(
      this.seats.filter((sv) => sv.ai && !sv.ai.stake),
      this.rng,
    );
    const jobs = order.map(async (sv, k) => {
      const ai = sv.ai!;
      await wait(0.2 + k * 0.42 + this.rng(20) / 100);
      await this.alive(run);
      if (isBroke(ai.chips)) await this.bustOut(sv, run);
      // how the regular plays this race stays hidden: only its bets show
      const mind = drawMindset(ai.profile, ai.mem, ai.chips, this.rng);
      const plan = aiPlan(mind, race, { chips: ai.chips, mem: ai.mem, lucky: ai.lucky }, this.rng);
      ai.mind = mind;
      sv.active = true;
      this.say(sv, t('pb.think'), 'dealer');
      await wait(thinkTime(mind, plan.close, this.rng));
      await this.alive(run);
      this.say(sv, this.callText(plan), plan.call === 'longshot' || plan.call === 'longshots' ? 'win' : '');
      const from = this.home(sv);
      await Promise.all(
        plan.bets.map(async (b, j) => {
          await wait(j * 0.22);
          await this.alive(run);
          ai.chips -= b.stake;
          ai.stake += b.stake;
          ai.bets.push(b);
          this.g.sfx.play('handle', { vol: 0.35 });
          const pile = sv.piles[b.horse];
          const mark = sv.marks[b.horse];
          mark.on = false;
          pile.group.updateMatrixWorld(true);
          await pile.dropIn(b.stake, from, 0.06);
          // the regular's marker goes on top: whose stack this is
          mark.on = true;
          gsap.fromTo(mark.mesh.scale, { x: 0.3, y: 0.3, z: 0.3 }, { x: 1, y: 1, z: 1, duration: 0.3, ease: 'back.out(2.2)' });
        }),
      );
      sv.active = false;
    });
    await Promise.all(jobs);
  }

  /** A regular who can't cover the minimum leaves; a new face from the circuit takes the place. */
  private async bustOut(sv: SeatV, run: number) {
    const { sfx } = this.g;
    this.say(sv, t('ph.busted'), 'lose');
    sfx.play('shove', { vol: 0.45 });
    await wait(1.1);
    await this.alive(run);
    const fresh = this.newcomer(replacementFor(this.ai.map((a) => a.profile.name), this.rng));
    // the seat keeps its state object (the seat and the table share it)
    Object.assign(sv.ai!, fresh);
    setPlateName(sv, fresh.profile);
    this.say(sv, t('ph.newcomer'), 'win');
    sfx.coins(5);
    await wait(0.4);
    await this.alive(run);
  }

  /** Every seat backing the horse in front lights up and cheers it on. */
  private cheer(backs: Set<number>[], horse: number) {
    const n = HORSES[horse].n;
    this.seats.forEach((sv, k) => {
      sv.active = backs[k].has(horse);
      if (sv.active) this.say(sv, t('ph.go', { n }), 'win');
      else sv.tagOn = false;
    });
  }

  /**
   * The dealer settles the regulars from its rack: winnings land on top of each winning stack, the
   * losing stacks go to the rack.
   */
  private async settleRegulars(race: Race, winner: number) {
    const jobs: Promise<void>[] = [];
    let k = 0;
    for (const sv of this.seats) {
      const ai = sv.ai;
      if (!ai || !ai.bets.length) continue;
      const res = settleAi(ai.bets, race, winner);
      ai.owed = res.ret;
      if (ai.mind) remember(ai.mem, ai.mind, res.ret - res.wager);
      if (res.ret > 0) ai.lucky = winner;
      sv.piles.forEach((pile, i) => {
        if (!pile.amount) return;
        const d = k++ * 0.1;
        if (i === winner) {
          if (res.ret > pile.amount) jobs.push(this.payMini(sv, i, res.ret - pile.amount, d));
        } else {
          sv.marks[i].on = false;
          jobs.push(wait(0.15 + d).then(() => this.covers.toDealer(pile, false)));
        }
      });
    }
    if (jobs.length) this.g.sfx.play('handle', { vol: 0.45 });
    await Promise.all(jobs);
  }

  /** A regular's winnings fly in from the dealer's rack and land on top of their stack on horse i. */
  private async payMini(sv: SeatV, i: number, win: number, delay: number) {
    const { chips, stage, sfx } = this.g;
    const pile = sv.piles[i];
    const at = pile.group.position.clone();
    const p = new ChipPile(chips, stage.table, this.covers.rack(at.x));
    p.group.scale.setScalar(MINI);
    p.set(win);
    p.group.visible = false;
    sv.payouts.push(p);
    await wait(delay);
    const mark = sv.marks[i];
    // the marker comes off while the winnings come in, then goes on top of them
    mark.on = false;
    p.group.visible = true;
    sfx.play('handle', { vol: 0.4 });
    at.y = pile.values.length * CHIP_H * MINI + 0.002;
    await arcTo(p.group, at, 0.7, 0.45, 'power2.out');
    sfx.play('stack', { vol: 0.55 });
    p.group.add(mark.mesh);
    mark.host = p;
    mark.on = true;
    gsap.fromTo(mark.mesh.scale, { x: 0.3, y: 0.3, z: 0.3 }, { x: 1, y: 1, z: 1, duration: 0.3, ease: 'back.out(2.2)' });
  }

  /** The regulars' stakes and winnings go back over the rail to their places, then join their chips. */
  private async sweepAi(delay: number, run: number) {
    await wait(delay);
    if (run !== this.run) return;
    const jobs: Promise<void>[] = [];
    let any = false;
    for (const sv of this.seats) {
      const ai = sv.ai;
      if (!ai) continue;
      const piles = [...sv.piles, ...sv.payouts].filter((p) => p.amount > 0);
      any ||= piles.length > 0;
      const to = this.home(sv, 0.1);
      jobs.push(
        Promise.all(piles.map((p, j) => arcTo(p.group, to, 0.6, 0.45, 'power2.in', j * 0.04))).then(() => {
          if (run !== this.run) return;
          ai.chips += ai.owed ?? ai.stake;
          ai.owed = null;
          ai.stake = 0;
          ai.bets = [];
          sv.piles.forEach((p, i) => {
            const m = sv.marks[i];
            m.on = false;
            if (m.host !== p) p.group.add(m.mesh);
            m.host = p;
            p.clear();
            p.group.position.copy(this.rowAt(sv.pos, i));
          });
          for (const p of sv.payouts) p.dispose();
          sv.payouts = [];
        }),
      );
    }
    if (any) this.g.sfx.play('handle', { vol: 0.5 });
    await Promise.all(jobs);
  }

  // ---------------------------------------------------------------- the race
  protected async settle(ret: Record<string, number>, opts: { big?: string; folded?: boolean; credited?: boolean } = {}) {
    const net = await this.covers.settle(this.spots, ret, opts);
    await wait(0.45);
    await this.covers.sweepOver(this.spots);
    return net;
  }

  protected async playRound() {
    const run = this.run;
    const { sfx, fx, hud } = this.g;
    await Promise.all([this.toGate, this.aiBetting]);
    await this.alive(run);
    const track = this.track!;
    const race = this.race!;
    const bets = this.spots.amounts();
    const winner = pickWinner(race, this.rng);
    const order = finishOrder(race, winner, this.rng);
    this.raceDone = true;
    const zc = this.zc;
    // who backs whom: each seat cheers its horses on
    const backs = this.seats.map((sv) => new Set(sv.ai ? sv.ai.bets.map((b) => b.horse) : HORSES.flatMap((h, i) => ((bets[h.id] ?? 0) > 0 ? [i] : []))));
    for (const sv of this.seats) {
      sv.tagOn = false;
      sv.active = false;
    }

    // the book closes: the dealer covers every one of the player's stacks with what it would pay
    const jobs: Promise<void>[] = [];
    let k = 0;
    HORSES.forEach((h, i) => {
      const stake = bets[h.id] ?? 0;
      if (stake > 0) jobs.push(this.covers.add(h.id, raceCover(stake, race.mult[i]), new THREE.Vector3(boxX(i) + PILE_DX, 0, zc + PILE_DZ), k++ * 0.13));
    });
    await Promise.all(jobs);
    await this.alive(run);

    // the call to the post, then the gate springs open
    sfx.fanfare();
    await wait(1.4);
    await this.alive(run);
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
    /** The horse in front (shown once it has led for a moment, so a nose-to-nose duel doesn't flicker). */
    let shown = -1;
    let cand = -1;
    let since = 0;
    const o = { t: 0 };
    const tw = gsap.to(o, {
      t: plan.dur,
      duration: plan.dur,
      ease: 'none',
      onUpdate: () => {
        if (run !== this.run) return;
        const tt = o.t;
        const sc = gsap.globalTimeline.timeScale() || 1;
        let lead = 0;
        let best = -Infinity;
        this.runners.forEach((r, i) => {
          const s = plan.s(i, tt);
          if (s > best) {
            best = s;
            lead = i;
          }
          r.s = GATE_S + s;
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
        // the crowd: whoever backs the horse in front cheers it on
        if (finished > 0) lead = winner;
        if (lead !== cand) {
          cand = lead;
          since = tt;
        }
        if (tt > 1.2 && cand !== shown && (finished > 0 || tt - since > 0.35)) {
          shown = cand;
          this.cheer(backs, shown);
        }
      },
    });
    this.raceTween = tw;
    await tw;
    this.raceTween = null;
    await this.alive(run);
    this.runners.forEach((r) => (r.horse.speed = 0));

    // places, and the winner's box lights up
    order.forEach((i, place) => {
      const p = this.runners[i].horse.root.position;
      this.tag(t(`horses.place${place + 1}`), place === 0 ? 'win' : place < 3 ? '' : 'lose', p.x, zc + p.z - 0.5);
    });
    const wp = this.runners[winner].horse.root.position;
    fx.burst(new THREE.Vector3(wp.x, 0.4, zc + wp.z), 90, HORSES[winner].color, 0.5);
    fx.glow(new THREE.Vector3(boxX(winner), 0, zc + BOX_DZ), BOX_W * 1.08, BOX_H * 1.04, 1.8);
    const ret = settleRace(bets, race, winner);
    if ((ret[HORSES[winner].id] ?? 0) > 0) sfx.bell(0.1);
    // the seats that backed the winner light up with the price they won at
    const won = t('ph.win', { x: multLabel(race.mult[winner]) });
    this.seats.forEach((sv, j) => {
      sv.active = backs[j].has(winner);
      if (sv.active) this.say(sv, won, 'win');
      else sv.tagOn = false;
    });
    const lone = isLoneWinner(
      bets,
      this.seats.flatMap((sv) => (sv.ai ? [sv.ai.bets] : [])),
      race,
      winner,
    );
    await wait(0.7);
    await this.alive(run);
    const regulars = this.settleRegulars(race, winner);
    await this.settle(ret, { big: lone ? t('ph.lone') : undefined });
    await regulars;
    await this.alive(run);
    this.aiSweep = this.sweepAi(0.5, run);
  }
}
