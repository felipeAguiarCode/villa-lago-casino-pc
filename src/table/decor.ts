import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GAMES } from '../games/registry';
import type { ChipSet } from './chips';
import { caipirinha, champagne, chipTowers, dealerButton, decks, dice, martini, placard, plaques, whisky, wine } from './decorKit';
import type { Stage } from './stage';
import { pcLayout } from '../ui/layout';

type Kind = 'whisky' | 'martini' | 'champagne' | 'champagne2' | 'wine' | 'caipirinha' | 'chips' | 'chipsHigh' | 'plaques' | 'button' | 'dice' | 'decks' | 'placard' | 'watch' | 'goblets';

/** Where a piece sits: which side zone, how far down the screen (0..1) and how far out (0..1 across the zone). */
interface Spot {
  kind: Kind;
  side: 'left' | 'right';
  sy: number;
  sx: number;
  yaw?: number;
}

// Side-zone spots. The left zone's top holds the paytables, so the left pieces stay low.
const L1 = { side: 'left', sy: 0.76, sx: 0.72 } as const;
const L2 = { side: 'left', sy: 0.6, sx: 0.5 } as const;
const R0 = { side: 'right', sy: 0.22, sx: 0.62 } as const;
const R1 = { side: 'right', sy: 0.74, sx: 0.7 } as const;
const R2 = { side: 'right', sy: 0.5, sx: 0.66 } as const;

const set = (...spots: [Kind, { side: 'left' | 'right'; sy: number; sx: number }, number?][]): Spot[] => spots.map(([kind, at, yaw]) => ({ kind, ...at, yaw: yaw ?? 0 }));

/**
 * Each table gets its own set of casino pieces, chosen to suit it: whisky and the dealer button at
 * the poker tables, champagne and plaques at baccarat, cocktails by the machines, caipirinha at the
 * Brazilian tables, goblets and a pocket watch at the gothic Trump 21. Every table also has its
 * placard. Nothing random: the same table always looks the same.
 */
const THEMES: Record<string, Spot[]> = {
  lobby: set(['champagne', L1, 0.2], ['champagne2', L2, -0.4], ['plaques', R2, 0.3], ['dice', R1, 0.5]),
  blackjack: set(['whisky', L1], ['chips', R1, 0.3], ['placard', R0]),
  videobj: set(['martini', L1], ['chips', R1], ['placard', R0]),
  videopoker: set(['martini', L1], ['chips', R1], ['placard', R0]),
  slot3: set(['martini', L1], ['chips', R1], ['placard', R0]),
  videopife: set(['caipirinha', L1], ['chips', R1], ['placard', R0]),
  trump21: set(['goblets', L1, 0.35], ['watch', R2, -0.55], ['placard', R0]),
  threecard: set(['whisky', L1], ['button', R1, 0.4], ['chips', R2], ['placard', R0]),
  tcpfaceup: set(['whisky', L1], ['button', R1, 0.4], ['chips', R2], ['placard', R0]),
  abyss: set(['whisky', L1], ['watch', L2, -0.5], ['button', R1, 0.4], ['chipsHigh', R2]),
  showdown: set(['whisky', L1], ['button', R1, 0.4], ['chips', R2], ['placard', R0]),
  fourcard: set(['wine', L1], ['chips', R1], ['placard', R0]),
  crazy4: set(['whisky', L1], ['chips', R1], ['placard', R0]),
  holdem3: set(['whisky', L1], ['button', R1, 0.4], ['placard', R0]),
  doubledraw: set(['martini', L1], ['chips', R1], ['placard', R0]),
  hcf: set(['champagne', L1], ['chips', R1], ['placard', R0]),
  baccarat: set(['champagne', L1], ['plaques', R1, 0.3], ['watch', R2, -0.6], ['placard', R0]),
  dragontiger: set(['plaques', L1, -0.3], ['wine', R1], ['chipsHigh', R2], ['placard', R0]),
  caribbean: set(['martini', L1], ['chips', R1], ['placard', R0]),
  russian: set(['champagne', L1], ['chips', R1], ['placard', R0]),
  thb: set(['whisky', L1], ['button', R1, 0.4], ['placard', R0]),
  uth: set(['whisky', L1], ['button', R1, 0.4], ['chips', R2], ['placard', R0]),
  letitride: set(['wine', L1], ['chips', R1], ['placard', R0]),
  paigow: set(['wine', L1], ['chips', R1], ['placard', R0]),
  war: set(['wine', L1], ['chips', R1], ['placard', R0]),
  reddog: set(['wine', L1], ['chips', R1], ['placard', R0]),
  highlow: set(['martini', L1], ['chips', R1], ['placard', R0]),
  redblack: set(['whisky', L1], ['chips', R1], ['placard', R0]),
  picknum: set(['champagne', L1], ['chips', R1], ['placard', R0]),
  roulette: [],
  partybj: [],
  coinflip: set(['champagne', L1], ['plaques', R1, 0.3], ['placard', R0]),
  horses: [],
  manilhadraw: set(['caipirinha', L1], ['chips', R1], ['placard', R0]),
  manilhaholdem: set(['caipirinha', L1], ['chips', R1], ['placard', R0]),
  pifeexpress: set(['caipirinha', L1], ['chips', R1], ['placard', R0]),
  canastradraw: set(['caipirinha', L1], ['chips', R1], ['placard', R0]),
};

/** Soft round shadow so the pieces sit on the felt (the scene has no shadow maps). */
function blobShadow(radius: number): THREE.Mesh {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }),
  );
  m.position.y = 0.004;
  m.renderOrder = 1;
  return m;
}

/**
 * PC table decoration beside the play area. Pieces are built when a table first needs them and
 * kept in the side zones whatever the window size, so they never cover cards, chips or the HUD.
 * Two CC0 Poly Haven models (see CREDITS.md) join the pieces from decorKit.ts.
 */
export class Decor {
  private group = new THREE.Group();
  private pieces = new Map<string, THREE.Object3D>();
  private models: Partial<Record<'watch' | 'goblets', THREE.Object3D>> = {};
  private theme = 'lobby';
  private shown: { obj: THREE.Object3D; spot: Spot }[] = [];

  constructor(
    private stage: Stage,
    private chips: ChipSet,
    private back: () => HTMLCanvasElement | null,
  ) {
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
    const [watch, goblets] = await Promise.all([get('vintage_pocket_watch'), get('brass_goblets')]);
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
    if (kind === 'watch' || kind === 'goblets') return this.models[kind] ?? null;
    const key = kind === 'placard' ? `placard.${table}` : kind;
    let obj = this.pieces.get(key);
    if (!obj) {
      obj = this.build(kind, table);
      this.pieces.set(key, obj);
    }
    return obj;
  }

  private build(kind: Exclude<Kind, 'watch' | 'goblets'>, table: string): THREE.Object3D {
    const holder = new THREE.Group();
    const add = (o: THREE.Object3D, shadow: number, scale = 1) => {
      o.scale.multiplyScalar(scale);
      holder.add(o, blobShadow(shadow));
    };
    switch (kind) {
      case 'whisky':
        add(whisky(), 0.6);
        break;
      case 'caipirinha':
        add(caipirinha(), 0.58);
        break;
      case 'martini':
        add(martini(), 0.5, 0.9);
        break;
      case 'champagne':
      case 'champagne2':
        add(champagne(), 0.42, 0.85);
        break;
      case 'wine':
        add(wine(), 0.5, 0.85);
        break;
      case 'chips':
        add(chipTowers(this.chips, [[100, 12], [25, 9], [500, 6], [5, 10]]), 0.75);
        break;
      case 'chipsHigh':
        add(chipTowers(this.chips, [[1000, 10], [500, 12], [100, 7]]), 0.7);
        break;
      case 'plaques':
        add(plaques(), 0.7);
        break;
      case 'button':
        add(dealerButton(), 0.42);
        break;
      case 'dice':
        add(dice(), 0.35);
        break;
      case 'decks':
        add(decks(this.back()), 0.7);
        break;
      case 'placard':
        add(placard((GAMES.find((g) => g.id === table)?.title ?? 'Villa Lago').toUpperCase()), 0.65);
        break;
    }
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
