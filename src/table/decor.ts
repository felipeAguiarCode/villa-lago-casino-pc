import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GAMES } from '../games/registry';
import type { ChipSet } from './chips';
import * as kit from './decorKit';
import type { Stage } from './stage';
import { pcLayout } from '../ui/layout';

/** The three CC0 Poly Haven models, loaded in the background (see CREDITS.md). */
type Model = 'watch' | 'goblets' | 'lighter';

/**
 * How a modelled piece is made: its builder, the radius of its soft shadow ([x, z] radii for long
 * pieces) and an extra scale on top of its real size (big pieces are shown a little smaller so they
 * fit the side zones). Tune sizes here.
 */
interface Recipe {
  make: () => THREE.Object3D;
  shadow: number | [number, number];
  scale?: number;
}

const recipes = (chips: ChipSet, back: () => HTMLCanvasElement | null) =>
  ({
    // drinks
    whisky: { make: kit.whisky, shadow: 0.6 },
    oldFashioned: { make: kit.oldFashioned, shadow: 0.62 },
    negroni: { make: kit.negroni, shadow: 0.58 },
    cognac: { make: kit.cognac, shadow: 0.55, scale: 0.9 },
    decanter: { make: () => kit.decanter('whisky'), shadow: 0.46, scale: 0.65 },
    decanterRed: { make: () => kit.decanter('wine'), shadow: 0.46, scale: 0.65 },
    wine: { make: kit.wine, shadow: 0.5, scale: 0.85 },
    champagne: { make: kit.champagne, shadow: 0.42, scale: 0.85 },
    champagne2: { make: kit.champagne, shadow: 0.42, scale: 0.85 },
    champBucket: { make: kit.champagneBucket, shadow: 0.56, scale: 0.47 },
    martini: { make: kit.martini, shadow: 0.5, scale: 0.9 },
    cosmo: { make: kit.cosmopolitan, shadow: 0.5, scale: 0.9 },
    margarita: { make: kit.margarita, shadow: 0.55, scale: 0.8 },
    ginTonic: { make: kit.ginTonic, shadow: 0.46, scale: 0.72 },
    mojito: { make: kit.mojito, shadow: 0.44, scale: 0.8 },
    caipirinha: { make: kit.caipirinha, shadow: 0.58 },
    cafezinho: { make: kit.cafezinho, shadow: 0.68, scale: 0.9 },
    espresso: { make: () => kit.espresso(), shadow: 0.68, scale: 0.9 },
    tea: { make: kit.teaService, shadow: [0.76, 0.5], scale: 0.58 },
    // casino pieces
    chips: { make: () => kit.chipTowers(chips, [[100, 12], [25, 9], [500, 6], [5, 10]]), shadow: 0.75 },
    chipsHigh: { make: () => kit.chipTowers(chips, [[1000, 10], [500, 12], [100, 7]]), shadow: 0.7 },
    chipRack: { make: () => kit.chipRack(chips), shadow: [0.8, 0.34], scale: 0.5 },
    plaques: { make: kit.plaques, shadow: 0.7 },
    button: { make: kit.dealerButton, shadow: 0.42 },
    cardGuard: { make: kit.cardGuard, shadow: 0.4, scale: 1.15 },
    bell: { make: kit.serviceBell, shadow: 0.5, scale: 0.9 },
    lamp: { make: kit.bankersLamp, shadow: [0.62, 0.38], scale: 0.42 },
    humidor: { make: () => kit.humidor(0.5), shadow: [0.75, 0.55], scale: 0.5 },
    cigar: { make: kit.cigarAshtray, shadow: 0.7, scale: 0.72 },
    candle: { make: kit.candle, shadow: 0.34, scale: 0.5 },
    dice: { make: kit.dice, shadow: 0.35 },
    decks: { make: () => kit.decks(back()), shadow: 0.7 },
  }) satisfies Record<string, Recipe>;

type Built = keyof ReturnType<typeof recipes>;
type Kind = Built | Model | 'placard';

/** Where a piece sits: which side zone, how far down the screen (0..1) and how far out (0..1 across the zone). */
interface Spot {
  kind: Kind;
  side: 'left' | 'right';
  sy: number;
  sx: number;
  yaw?: number;
}

// Side-zone spots: sy runs down the screen (0..1); sx runs across the zone, larger = nearer the
// play area. A piece stands with its base at the spot and rises up the screen from it.
// Left zone: the paytables fill its top, so the pieces here stay low.
const L1 = { side: 'left', sy: 0.76, sx: 0.72 } as const; // low, by the play area
const L2 = { side: 'left', sy: 0.6, sx: 0.5 } as const; // middle
const L3 = { side: 'left', sy: 0.79, sx: 0.34 } as const; // low, out by the screen edge
// Right zone: its top holds the placard.
const R0 = { side: 'right', sy: 0.22, sx: 0.62 } as const; // the placard
const R1 = { side: 'right', sy: 0.74, sx: 0.7 } as const; // low, by the play area
const R2 = { side: 'right', sy: 0.5, sx: 0.66 } as const; // middle, by the play area
const R4 = { side: 'right', sy: 0.52, sx: 0.28 } as const; // middle, out by the screen edge
/** The lobby's cigar corner: the ashtray out at the right, the lighter just below it. */
const RC = { side: 'right', sy: 0.42, sx: 0.84 } as const;
const RL = { side: 'right', sy: 0.5, sx: 0.5 } as const;

const set = (...spots: [Kind, { side: 'left' | 'right'; sy: number; sx: number }, number?][]): Spot[] => spots.map(([kind, at, yaw]) => ({ kind, ...at, yaw: yaw ?? 0 }));

/**
 * Each table gets its own set of casino pieces, chosen to suit it, and neighbours in the lobby differ:
 * - poker tables: whisky, Old Fashioned, Negroni or cognac, a decanter, the card guard, the dealer
 *   button, the chip rack, a banker's lamp (Caribbean Stud has a humidor, Pai Gow tea);
 * - baccarat and Coin Flip: champagne and its bucket, plaques, the pocket watch;
 * - Dragon Tiger: porcelain tea and plaques;
 * - blackjack and the video machines: cocktails (Cosmopolitan, Margarita, gin and tonic, martini),
 *   the chip rack and the service bell;
 * - the Brazilian tables: caipirinha and cafezinho;
 * - Trump 21 (gothic): goblets, a candle, the claret decanter and the watch;
 * - High & Low, Red or Black, Pick a Number, War, Red Dog: a mix (War: espresso and a humidor).
 * Every table also has its placard. Nothing random: the same table always looks the same. The busy
 * tables (the wide Party tables, roulette, the horses and craps) have none.
 */
const THEMES: Record<string, Spot[]> = {
  lobby: set(['champagne', L1, 0.2], ['champagne2', L2, -0.4], ['plaques', R1, 0.3], ['cigar', RC, 0.15], ['lighter', RL, -0.6]),

  // blackjack, Trump 21 and the coin
  blackjack: set(['ginTonic', L1], ['chipRack', R1, -0.15], ['bell', R2, -0.3], ['placard', R0]),
  videobj: set(['cosmo', L1], ['chips', R1], ['bell', R2, -0.3], ['placard', R0]),
  trump21: set(['goblets', L1, 0.35], ['candle', L3], ['decanterRed', R2, -0.3], ['watch', R4, -0.55], ['placard', R0]),
  coinflip: set(['champagne', L1], ['champBucket', R2, 0.4], ['watch', R1, -0.6], ['placard', R0]),
  pokerdice: set(['cognac', R1], ['chips', R2], ['placard', R0]),

  // baccarat family and the simple card games
  baccarat: set(['champagne', L1], ['champBucket', L3, 0.3], ['plaques', R1, 0.3], ['placard', R0]),
  dragontiger: set(['tea', L1, -0.2], ['plaques', R1, 0.3], ['chipsHigh', R2], ['placard', R0]),
  highlow: set(['margarita', L1], ['chips', R1], ['lamp', R2, -0.3], ['placard', R0]),
  redblack: set(['negroni', L1], ['cardGuard', L3], ['chipsHigh', R1], ['placard', R0]),
  picknum: set(['mojito', L1], ['chipRack', R1, -0.15], ['bell', R2, -0.3], ['placard', R0]),
  war: set(['espresso', L1, 0.3], ['chips', R1], ['humidor', R2, -0.25], ['placard', R0]),
  reddog: set(['wine', L1], ['decanterRed', L3], ['chipsHigh', R1], ['placard', R0]),

  // poker
  threecard: set(['negroni', L1], ['chipRack', R1, -0.15], ['lamp', R2, -0.3], ['placard', R0]),
  tcpfaceup: set(['whisky', L1], ['decanter', L3], ['chipsHigh', R1], ['placard', R0]),
  abyss: set(['cognac', L1], ['watch', L2, -0.5], ['cardGuard', R1], ['chipsHigh', R2], ['placard', R0]),
  showdown: set(['oldFashioned', L1], ['button', R1, 0.4], ['chipRack', R2, -0.15], ['placard', R0]),
  thb: set(['negroni', L1], ['cardGuard', R1], ['button', R2, 0.4], ['placard', R0]),
  uth: set(['whisky', L1], ['button', R1, 0.4], ['lamp', R2, -0.3], ['placard', R0]),
  holdem3: set(['cognac', L1], ['cardGuard', R1], ['chipRack', R2, -0.15], ['placard', R0]),
  fourcard: set(['oldFashioned', L1], ['decanter', L3], ['chips', R1], ['placard', R0]),
  crazy4: set(['wine', L1], ['chipsHigh', R1], ['cardGuard', R2], ['placard', R0]),
  caribbean: set(['cognac', L1], ['chips', R1], ['humidor', R2, -0.25], ['placard', R0]),
  stud7: set(['whisky', L1], ['decanter', L3], ['chipRack', R1, -0.15], ['lamp', R2, -0.3], ['placard', R0]),
  vanunu: set(['negroni', R1], ['chips', R2], ['decanter', R4], ['placard', R0]),
  russian: set(['martini', L1], ['chipsHigh', R1], ['cardGuard', R2], ['placard', R0]),
  letitride: set(['oldFashioned', L1], ['chipRack', R1, -0.15], ['lamp', R2, -0.3], ['placard', R0]),
  paigow: set(['tea', L1, -0.2], ['chipsHigh', R1], ['button', R2, 0.4], ['placard', R0]),
  hcf: set(['cognac', L1], ['decanter', L3], ['chipRack', R1, -0.15], ['placard', R0]),
  suitpoker: set(['whisky', L1], ['cardGuard', R1], ['chips', R2], ['placard', R0]),

  // video machines
  videopoker: set(['margarita', L1], ['chipRack', R1, -0.15], ['placard', R0]),
  doubledraw: set(['martini', L1], ['bell', R1, -0.3], ['chipsHigh', R2], ['placard', R0]),
  slot3: set(['cosmo', L1], ['ginTonic', L3], ['chips', R1], ['placard', R0]),

  // the Brazilian tables
  manilhadraw: set(['caipirinha', L1], ['chips', R1], ['cafezinho', R2], ['placard', R0]),
  manilhaholdem: set(['cafezinho', L1], ['button', R1, 0.4], ['chipsHigh', R2], ['placard', R0]),
  pifeexpress: set(['caipirinha', L1], ['chipRack', R1, -0.15], ['cafezinho', R2], ['placard', R0]),
  videopife: set(['cafezinho', L1], ['caipirinha', L3], ['bell', R1, -0.3], ['placard', R0]),
  canastradraw: set(['caipirinha', L1], ['chipsHigh', R1], ['cafezinho', R2], ['placard', R0]),

  // busy tables: no decor
  roulette: [],
  partybj: [],
  horses: [],
  partyuth: [],
  craps: [],
  partytrump: [],
  partyhorses: [],
  partystud: [],
  partytcp: [],
};

/** Soft round shadow so the pieces sit on the felt (the scene has no shadow maps). */
let shadowTex: THREE.Texture | null = null;
function blobShadow(radius: number | [number, number]): THREE.Mesh {
  if (!shadowTex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    shadowTex = new THREE.CanvasTexture(cv);
  }
  const [rx, rz] = typeof radius === 'number' ? [radius, radius] : radius;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.position.y = 0.004;
  m.renderOrder = 1;
  return m;
}

/**
 * PC table decoration beside the play area. Pieces are built when a table first needs them and
 * kept in the side zones whatever the window size, so they never cover cards, chips or the HUD.
 * Three CC0 Poly Haven models (see CREDITS.md) join the pieces from decorKit.ts.
 */
export class Decor {
  private group = new THREE.Group();
  private pieces = new Map<string, THREE.Object3D>();
  private models: Partial<Record<Model, THREE.Object3D>> = {};
  private recipes: Record<Built, Recipe>;
  private theme = 'lobby';
  private shown: { obj: THREE.Object3D; spot: Spot }[] = [];

  constructor(
    private stage: Stage,
    chips: ChipSet,
    back: () => HTMLCanvasElement | null,
  ) {
    this.recipes = recipes(chips, back);
    stage.scene.add(this.group);
    stage.onView(() => this.place());
  }

  /** Loads the models in the background; the tables work without them. */
  async load(base: string) {
    const loader = new GLTFLoader();
    const get = (name: string) =>
      loader
        .loadAsync(`${base}${name}/${name}_1k.gltf`)
        .then((g) => g.scene)
        .catch((e) => {
          console.warn('decor not loaded:', name, e);
          return null;
        });
    const [watch, goblets, lighter] = await Promise.all([get('vintage_pocket_watch'), get('brass_goblets'), get('vintage_lighter')]);
    if (watch) {
      const s = 9;
      watch.scale.setScalar(s);
      // the model stands on its edge, face toward +z: lay it face up
      watch.rotation.x = -Math.PI / 2;
      watch.position.y = 0.007 * s;
      const holder = new THREE.Group();
      holder.add(watch, blobShadow(0.42));
      this.models.watch = holder;
    }
    if (goblets) {
      goblets.scale.setScalar(3.2);
      const holder = new THREE.Group();
      holder.add(goblets);
      for (const c of goblets.children) {
        const sh = blobShadow(0.34);
        sh.position.set(c.position.x * 3.2, 0.004, c.position.z * 3.2);
        holder.add(sh);
      }
      this.models.goblets = holder;
    }
    if (lighter) {
      // a brass petrol lighter (metres in the file, 10 cm units here), standing by the ashtray
      const s = 10;
      lighter.scale.setScalar(s);
      lighter.position.y = 0.0285 * s;
      const holder = new THREE.Group();
      holder.add(lighter, blobShadow(0.3));
      this.models.lighter = holder;
    }
    this.setTheme(this.theme);
  }

  /** Shows the set of pieces for a table ('lobby' for the lobby). */
  setTheme(id: string) {
    this.theme = id;
    for (const { obj } of this.shown) obj.visible = false;
    this.shown = [];
    for (const spot of THEMES[id] ?? THEMES.lobby) {
      const obj = this.piece(spot.kind, id);
      if (!obj) continue;
      obj.visible = true;
      if (!obj.parent) this.group.add(obj);
      this.shown.push({ obj, spot });
    }
    this.place();
  }

  private piece(kind: Kind, table: string): THREE.Object3D | null {
    if (kind === 'watch' || kind === 'goblets' || kind === 'lighter') return this.models[kind] ?? null;
    const key = kind === 'placard' ? `placard.${table}` : kind;
    let obj = this.pieces.get(key);
    if (!obj) {
      obj = this.build(kind, table);
      this.pieces.set(key, obj);
    }
    return obj;
  }

  private build(kind: Built | 'placard', table: string): THREE.Object3D {
    const r: Recipe =
      kind === 'placard' ? { make: () => kit.placard((GAMES.find((g) => g.id === table)?.title ?? 'Villa Lago').toUpperCase()), shadow: 0.65 } : this.recipes[kind];
    const o = r.make();
    o.scale.multiplyScalar(r.scale ?? 1);
    const holder = new THREE.Group();
    holder.add(o, blobShadow(r.shadow));
    return holder;
  }

  /**
   * Keeps every piece in its side zone whatever the window size, at a steady size on screen: a
   * table framed closer (larger cards) would otherwise blow the pieces up as well.
   */
  private place() {
    const st = this.stage;
    const r = st.play;
    const target = 40 * pcLayout(st.w, st.h).u;
    const one = new THREE.Vector3();
    for (const { obj, spot } of this.shown) {
      const x = spot.side === 'left' ? r.x * spot.sx : st.w - (st.w - r.x - r.w) * spot.sx;
      const p = st.viewToTable(x / st.w, spot.sy);
      obj.position.set(p.x, 0, p.z);
      obj.rotation.y = spot.yaw ?? 0;
      const a = st.toScreen(p);
      const b = st.toScreen(one.copy(p).setX(p.x + 1));
      const ppu = Math.hypot(b.x - a.x, b.y - a.y);
      obj.scale.setScalar(THREE.MathUtils.clamp(target / Math.max(1, ppu), 0.45, 1.1));
    }
  }
}
