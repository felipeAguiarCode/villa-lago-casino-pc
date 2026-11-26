import * as THREE from 'three';
import { BOX_D, BOX_T, DeckBox } from './deckBox';
import gsap from 'gsap';
import type { Stage } from './stage';
import { CARD_H, CARD_W } from './cardMesh';
import type { Brand } from './deckBrands';

export const FELTS = {
  lobby: '#14583a',
  blackjack: '#17703d',
  threecard: '#0f5d66',
  baccarat: '#6e1627',
  uth: '#145a36',
  caribbean: '#16467e',
  videopoker: '#0e2150',
  war: '#2d323d',
  letitride: '#4b1d63',
  reddog: '#7a2414',
  paigow: '#6b4c10',
  fourcard: '#1b5b4a',
  holdem3: '#5a1f3e',
  russian: '#7a1e1e',
  doubledraw: '#1f3f78',
  showdown: '#0f5f45',
  abyss: '#231a4e',
  dragontiger: '#5c1d10',
  manilhadraw: '#1b5a3a',
  manilhaholdem: '#1e3f6e',
  pifeexpress: '#6a4a12',
  videopife: '#2a2a6e',
  canastradraw: '#6e1a3a',
  trump21: '#26202e',
  thb: '#0f5a52',
  crazy4: '#7a3a12',
  hcf: '#2a2f6e',
  slot3: '#5e0f2c',
  videobj: '#0c1d46',
  highlow: '#6b1419',
  redblack: '#16613a',
  picknum: '#1d3f9a',
  roulette: '#0f6638',
  partybj: '#143a78',
  coinflip: '#163d5c',
  horses: '#2f6b2c',
  pokerslots: '#3d0d07',
  partyuth: '#0e4a4c',
  vanunu: '#1f4a3f',
  craps: '#0f5b3c',
  partytrump: '#2c1f3a',
  partyhorses: '#245f35',
  partystud: '#3a2466',
  stud7: '#33461f',
  pokerdice: '#11553f',
  suitpoker: '#0c3f52',
  partytcp: '#3a1d6e',
} as const;
export type FeltKey = keyof typeof FELTS;

/** PC: the printed texts of every table are drawn larger than on the phone. */
export const PRINT_SCALE = 1.3;
/** Tables whose prints sit close to their betting circles keep them a little smaller. */
export const PRINT_SCALE_FOR: Record<string, number> = { videopoker: 1.08, slot3: 1.1, videobj: 1.15 };
/** PC: betting rings are larger too (the chips keep their size). */
export const RING_SCALE = 1.15;

/** The felt, the rail, the shoe and the discard tray, plus printed decals. */
export class Table {
  readonly felt: THREE.Mesh;
  private feltMat: THREE.MeshStandardMaterial;
  private decals = new THREE.Group();
  readonly shoe = new THREE.Group();
  readonly tray = new THREE.Group();
  private deckBox!: DeckBox;
  private trayStack!: THREE.Mesh;
  private rail = new THREE.Group();
  private stackMat!: THREE.MeshStandardMaterial[];
  private feltColor = new THREE.Color(FELTS.lobby);
  /** Center of the felt's light pool (follows the play area). */
  private feltCenter = { value: new THREE.Vector2(0, 0.1) };

  constructor(
    private stage: Stage,
    feltImage: HTMLImageElement | null,
    backTexture: () => THREE.Texture,
  ) {
    const feltTex = feltImage ? new THREE.Texture(feltImage) : null;
    if (feltTex) {
      feltTex.colorSpace = THREE.SRGBColorSpace;
      feltTex.wrapS = feltTex.wrapT = THREE.MirroredRepeatWrapping;
      feltTex.repeat.set(17, 11);
      feltTex.anisotropy = 8;
      feltTex.needsUpdate = true;
    }
    this.feltMat = new THREE.MeshStandardMaterial({ color: this.feltColor, map: feltTex, roughness: 0.97, metalness: 0 });
    // animate the material's own colour object (the constructor copies values, not the reference)
    this.feltColor = this.feltMat.color;
    this.feltMat.onBeforeCompile = (sh) => {
      sh.uniforms.vlCenter = this.feltCenter;
      sh.vertexShader = 'varying vec3 vlWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvlWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader =
        'varying vec3 vlWPos;\nuniform vec2 vlCenter;\n' +
        sh.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           diffuseColor.rgb *= 2.7;
           float vlR = length((vlWPos.xz - vlCenter) * vec2(0.2, 0.3));
           diffuseColor.rgb *= 1.0 - 0.6 * smoothstep(0.38, 1.25, vlR);`,
        );
    };
    this.felt = new THREE.Mesh(new THREE.PlaneGeometry(56, 36).rotateX(-Math.PI / 2), this.feltMat);
    this.felt.renderOrder = 0;
    stage.scene.add(this.felt);
    stage.scene.add(this.decals);
    this.buildRail();
    this.buildShoe(backTexture);
    this.buildTray(backTexture);
    stage.scene.add(this.rail, this.shoe, this.tray);
    stage.onResize(() => this.placeProps());
    stage.onView(() => this.placeProps());
    this.placeProps();
  }

  setFelt(key: FeltKey, animate = true) {
    const to = new THREE.Color(FELTS[key]);
    if (!animate) {
      this.feltColor.copy(to);
      return;
    }
    const from = this.feltColor.clone();
    const p = { t: 0 };
    gsap.to(p, { t: 1, duration: 0.8, ease: 'power2.inOut', onUpdate: () => this.feltColor.lerpColors(from, to, p.t) });
  }

  /**
   * Adds a printed decal whose center sits at frame position (u, v) and spans `width` table units
   * (times PRINT_SCALE: the PC edition prints its table texts larger).
   */
  /** Print scale of the table being set up (see PRINT_SCALE_FOR). */
  printScale = PRINT_SCALE;

  addDecal(cv: HTMLCanvasElement, u: number, v: number, width: number): THREE.Mesh {
    const m = this.makeDecal(cv, width * this.printScale);
    const p = this.stage.screenToTable(u, v);
    m.position.set(p.x, 0.0015, p.z);
    return m;
  }

  /** Same as addDecal but placed at a world position (betting rings are scaled by RING_SCALE). */
  addDecalAt(cv: HTMLCanvasElement, x: number, z: number, width: number): THREE.Mesh {
    const m = this.makeDecal(cv, cv.dataset.ring ? width * RING_SCALE : width);
    m.position.set(x, 0.0015, z);
    return m;
  }

  private makeDecal(cv: HTMLCanvasElement, width: number): THREE.Mesh {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const h = (width * cv.height) / cv.width;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, metalness: 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, h).rotateX(-Math.PI / 2), mat);
    m.renderOrder = 1;
    this.decals.add(m);
    return m;
  }

  clearDecals() {
    for (const m of [...this.decals.children] as THREE.Mesh[]) {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
      m.geometry.dispose();
      this.decals.remove(m);
    }
  }

  private buildRail() {
    const leather = new THREE.MeshStandardMaterial({ color: '#2a160c', roughness: 0.48, metalness: 0 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d9b45c', roughness: 0.28, metalness: 1 });
    const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 48, 8, 24).rotateZ(Math.PI / 2), leather);
    pad.position.y = 0.2;
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 48, 12).rotateZ(Math.PI / 2), gold);
    trim.position.set(0, 0.03, -0.27);
    this.rail.add(pad, trim);
  }

  private stackMaterials(backTexture: () => THREE.Texture) {
    if (this.stackMat) return this.stackMat;
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#efe8d6';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(120,100,70,.35)';
    for (let y = 0; y < 64; y += 3) g.fillRect(0, y, 64, 1);
    const edge = new THREE.CanvasTexture(cv);
    edge.colorSpace = THREE.SRGBColorSpace;
    edge.wrapS = edge.wrapT = THREE.RepeatWrapping;
    const side = new THREE.MeshStandardMaterial({ map: edge, roughness: 0.8 });
    const top = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.4 });
    this.stackMat = [side, side, top, side, side, side];
    return this.stackMat;
  }

  refreshBack(tex: THREE.Texture) {
    if (!this.stackMat) return;
    this.stackMat[2] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });
    this.trayStack.material = this.stackMat;
    if (tex.image instanceof HTMLCanvasElement) this.deckBox.setBack(tex.image);
  }

  /** The sealed deck box the cards are dealt from. */
  private buildShoe(backTexture: () => THREE.Texture) {
    const img = backTexture().image;
    this.deckBox = new DeckBox(img instanceof HTMLCanvasElement ? img : null);
    this.shoe.add(this.deckBox.group, this.spread);
    this.backTexture = backTexture;
  }

  private backTexture: () => THREE.Texture = () => new THREE.Texture();

  private buildTray(backTexture: () => THREE.Texture) {
    const glass = new THREE.MeshStandardMaterial({ color: '#cfe3ff', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.22 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(CARD_W + 0.1, 0.3, CARD_H + 0.1), glass);
    box.position.y = 0.15;
    this.trayStack = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, 1, CARD_H), this.stackMaterials(backTexture));
    this.tray.add(box, this.trayStack);
    this.setTrayFill(0);
  }

  /** Cards spread out of the box across the felt. */
  private spread = new THREE.Group();

  /**
   * PC: puts the table's deck on the felt: the box of its brand, open or sealed, and a ribbon of
   * cards spilling out of it. Call after the card factory's back was set to the brand's back.
   */
  setDeck(brand: Brand, open: boolean, back: HTMLCanvasElement | null) {
    this.deckBox.setBrand(brand, back);
    const tex = this.backTexture();
    this.deckBox.setOpen(open, tex);
    this.refreshBack(tex);
    this.spread.clear();
    if (!open) return;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });
    const n = 11;
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H).rotateX(-Math.PI / 2), mat);
      // a ribbon running from beside the box down toward the player (the box itself lies turned,
      // so the ribbon's direction is given in its local axes)
      const k = i / (n - 1);
      c.position.set(0.1 + k * 1.05, 0.004 + i * 0.0015, 0.78 + k * 0.92);
      c.rotation.y = -0.85 + k * 0.35;
      this.spread.add(c);
    }
  }

  /** Shows or hides the deck box and the discard tray (tables without cards hide them). */
  setProps(v: boolean) {
    this.shoe.visible = v;
    this.tray.visible = v;
  }

  /** 0..1 of the shoe still loaded (the sealed box doesn't show it). */
  setShoeFill(f: number) {
    this.shoeFill = f;
  }

  shoeFill = 1;

  setTrayFill(f: number) {
    const h = Math.max(0.001, 0.26 * f);
    this.trayStack.scale.y = h;
    this.trayStack.position.y = h / 2 + 0.01;
    this.trayStack.visible = f > 0.002;
  }

  /** World point where cards leave the shoe. */
  shoeMouth(): THREE.Vector3 {
    return this.shoe.localToWorld(new THREE.Vector3(0, BOX_T + 0.02, BOX_D / 2 - 0.3));
  }

  trayTop(): THREE.Vector3 {
    return this.tray.localToWorld(new THREE.Vector3(0, 0.32, 0));
  }

  get shoeYaw() {
    return this.shoe.rotation.y;
  }

  get trayYaw() {
    return this.tray.rotation.y;
  }

  placeProps() {
    const s = this.stage;
    // the deck box and the discard tray sit in the top corners of the play area (wider apart
    // than on the phone, clear of the dealer's cards)
    const r = s.play;
    const shoe = s.viewToTable((r.x + r.w * 0.12) / s.w, (r.y + r.h * 0.1) / s.h);
    this.shoe.position.copy(shoe);
    this.shoe.rotation.y = -0.6;
    const tray = s.viewToTable((r.x + r.w * 0.89) / s.w, (r.y + r.h * 0.08) / s.h);
    this.tray.position.copy(tray);
    this.tray.rotation.y = 0.35;
    // the rail runs along the bottom edge of the widescreen view
    const bottom = s.viewToTable(0.5, 1.0);
    this.rail.position.set(s.playCenter.x, 0, bottom.z + 0.06);
    this.feltCenter.value.set(s.playCenter.x, s.playCenter.z);
    this.felt.position.x = s.playCenter.x;
    this.shoe.updateMatrixWorld(true);
    this.tray.updateMatrixWorld(true);
  }
}
