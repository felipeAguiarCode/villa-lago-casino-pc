import * as THREE from 'three';
import type { Card } from '../core/cards';
import type { BackColor } from '../core/settings';
import { ATLAS_COLS, ATLAS_ROWS, renderAtlas, renderBack, renderFace } from './cardFaces';

export const CARD_W = 0.63;
export const CARD_H = 0.88;
/** Height of a card resting on the felt (keeps it clear of the printed decals). */
export const REST_Y = 0.006;

const BEND_VERT_HEAD = /* glsl */ `
uniform vec2 uBend;
vec3 vlBendPos(vec3 p) {
  if (abs(uBend.x) > 1e-4) {
    float a = p.x * uBend.x; float r = 1.0 / uBend.x;
    p = vec3(sin(a) * r - p.y * sin(a), (1.0 - cos(a)) * r + p.y * cos(a), p.z);
  }
  if (abs(uBend.y) > 1e-4) {
    float b = p.z * uBend.y; float r = 1.0 / uBend.y;
    p = vec3(p.x, (1.0 - cos(b)) * r + p.y * cos(b), sin(b) * r - p.y * sin(b));
  }
  return p;
}
vec3 vlBendNormal(vec3 n, vec3 p) {
  if (abs(uBend.x) > 1e-4) { float a = p.x * uBend.x; n = vec3(n.x * cos(a) - n.y * sin(a), n.x * sin(a) + n.y * cos(a), n.z); }
  if (abs(uBend.y) > 1e-4) { float b = p.z * uBend.y; n = vec3(n.x, n.y * cos(b) + n.z * sin(b), -n.y * sin(b) + n.z * cos(b)); }
  return n;
}
`;

function bendable(mat: THREE.MeshStandardMaterial, u: { uBend: { value: THREE.Vector2 } }) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBend = u.uBend;
    sh.vertexShader = BEND_VERT_HEAD + sh.vertexShader;
    sh.vertexShader = sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = vlBendNormal(objectNormal, position);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = vlBendPos(transformed);');
  };
  mat.customProgramCacheKey = () => 'vl-card-bend';
}

/** Shared geometries. The card lies in the XZ plane; the face points +Y; the top of the card is -Z. */
const GEO_FRONT = new THREE.PlaneGeometry(CARD_W, CARD_H, 12, 16).rotateX(-Math.PI / 2);
const GEO_BACK = new THREE.PlaneGeometry(CARD_W, CARD_H, 12, 16).rotateX(Math.PI / 2).translate(0, -0.0012, 0);
const GEO_SHADOW = new THREE.PlaneGeometry(CARD_W * 1.32, CARD_H * 1.26).rotateX(-Math.PI / 2);

function shadowTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 160;
  const g = cv.getContext('2d')!;
  g.shadowColor = 'rgba(0,0,0,1)';
  g.shadowBlur = 14;
  g.shadowOffsetX = 1000;
  g.fillStyle = '#000';
  const w = 128 / 1.32, h = 160 / 1.26;
  g.beginPath();
  g.roundRect(-1000 + (128 - w) / 2, (160 - h) / 2, w, h, 8);
  g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Card3D {
  readonly obj = new THREE.Group();
  readonly front: THREE.Mesh;
  readonly back: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  readonly u = { uBend: { value: new THREE.Vector2() } };
  card: Card | null = null;
  /** Lightweight card (atlas face, no contact shadow) used by the shuffle show. */
  lite = false;

  constructor(
    private factory: CardFactory,
    frontMat: THREE.MeshStandardMaterial,
    backMat: THREE.MeshStandardMaterial,
    shadowMat: THREE.MeshBasicMaterial,
  ) {
    this.obj.rotation.order = 'YXZ';
    this.front = new THREE.Mesh(GEO_FRONT, frontMat);
    this.back = new THREE.Mesh(GEO_BACK, backMat);
    this.front.renderOrder = 2;
    this.back.renderOrder = 2;
    this.obj.add(this.front, this.back);
    this.shadow = new THREE.Mesh(GEO_SHADOW, shadowMat);
    this.shadow.renderOrder = 1;
  }

  get bend() {
    return this.u.uBend.value;
  }

  setCard(card: Card | null) {
    if (card === this.card || this.lite) return;
    const mat = this.front.material as THREE.MeshStandardMaterial;
    if (this.card !== null) this.factory.releaseFace(this.card);
    this.card = card;
    mat.map = card === null ? this.factory.backTexture : this.factory.face(card);
    mat.needsUpdate = true;
  }

  setFaceUp(up: boolean) {
    this.obj.rotation.z = up ? 0 : Math.PI;
  }

  get faceUp() {
    return Math.cos(this.obj.rotation.z) > 0;
  }

  /** Keeps the fake contact shadow under the card. */
  syncShadow() {
    const p = this.obj.position;
    const lift = Math.max(0, p.y - REST_Y);
    this.shadow.position.set(p.x + lift * 0.28, 0.0025, p.z + lift * 0.16);
    this.shadow.rotation.y = this.obj.rotation.y;
    const s = 1 + lift * 0.55;
    this.shadow.scale.set(s, 1, s);
    const tilt = Math.abs(Math.sin(this.obj.rotation.z)) * 0.55 + Math.abs(Math.sin(this.obj.rotation.x)) * 0.55;
    this.shadow.scale.x *= 1 - Math.min(0.6, tilt);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.5 - lift * 0.55) * this.obj.scale.x;
    this.shadow.visible = this.obj.visible;
  }
}

/** Creates cards, owns the face-texture cache and keeps shadows in sync. */
export class CardFactory {
  private faces = new Map<Card, { tex: THREE.Texture; refs: number; last: number }>();
  private live = new Set<Card3D>();
  backTexture!: THREE.Texture;
  private backMats = new Set<THREE.MeshStandardMaterial>();
  private shadowTex = shadowTexture();
  private atlasTex: THREE.Texture | null = null;
  private liteShadow = new THREE.MeshBasicMaterial({ visible: false });
  private aniso: number;
  private tick = 0;

  constructor(
    private parent: THREE.Object3D,
    renderer: THREE.WebGLRenderer,
    back: BackColor,
  ) {
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.setBack(back);
  }

  private makeTex(cv: HTMLCanvasElement) {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.aniso;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  setBack(color: BackColor) {
    this.setBackCanvas(renderBack(color));
  }

  /** PC: a back painted elsewhere (the decks of the brands, src/table/deckBrands.ts). */
  setBackCanvas(cv: HTMLCanvasElement) {
    const old = this.backTexture;
    this.backTexture = this.makeTex(cv);
    for (const m of this.backMats) {
      m.map = this.backTexture;
      m.needsUpdate = true;
    }
    old?.dispose();
  }

  face(card: Card): THREE.Texture {
    let f = this.faces.get(card);
    if (!f) {
      f = { tex: this.makeTex(renderFace(card)), refs: 0, last: 0 };
      this.faces.set(card, f);
    }
    f.refs++;
    f.last = ++this.tick;
    return f.tex;
  }

  releaseFace(card: Card) {
    const f = this.faces.get(card);
    if (!f) return;
    f.refs = Math.max(0, f.refs - 1);
    // keep a warm cache of unused faces, evict the oldest beyond 28
    const unused = [...this.faces.entries()].filter(([, v]) => v.refs === 0);
    if (unused.length > 28) {
      unused.sort((a, b) => a[1].last - b[1].last);
      for (const [k, v] of unused.slice(0, unused.length - 28)) {
        v.tex.dispose();
        this.faces.delete(k);
      }
    }
  }

  /** Pre-renders face textures (call during idle time). */
  warm(cards: Card[]) {
    for (const c of cards) {
      this.face(c);
      this.releaseFace(c);
    }
  }

  create(card: Card | null): Card3D {
    const front = new THREE.MeshStandardMaterial({ roughness: 0.46, metalness: 0, alphaTest: 0.5, alphaToCoverage: true });
    const back = new THREE.MeshStandardMaterial({ map: this.backTexture, roughness: 0.38, metalness: 0, alphaTest: 0.5, alphaToCoverage: true });
    const shadow = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: 0.5, color: 0x000000 });
    const c = new Card3D(this, front, back, shadow);
    bendable(front, c.u);
    bendable(back, c.u);
    this.backMats.add(back);
    c.setCard(card);
    this.parent.add(c.obj, c.shadow);
    this.live.add(c);
    return c;
  }

  /** Card with a face taken from the shared low-res atlas: cheap enough to show a whole deck. */
  createLite(card: Card): Card3D {
    if (!this.atlasTex) this.atlasTex = this.makeTex(renderAtlas());
    const tex = this.atlasTex.clone();
    tex.repeat.set(1 / ATLAS_COLS, 1 / ATLAS_ROWS);
    tex.offset.set((card % ATLAS_COLS) / ATLAS_COLS, 1 - (Math.floor(card / ATLAS_COLS) + 1) / ATLAS_ROWS);
    const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.46, metalness: 0, alphaTest: 0.5, alphaToCoverage: true });
    const back = new THREE.MeshStandardMaterial({ map: this.backTexture, roughness: 0.38, metalness: 0, alphaTest: 0.5, alphaToCoverage: true });
    const c = new Card3D(this, front, back, this.liteShadow);
    c.lite = true;
    c.card = card;
    bendable(front, c.u);
    bendable(back, c.u);
    this.backMats.add(back);
    this.parent.add(c.obj);
    this.live.add(c);
    return c;
  }

  destroy(c: Card3D) {
    if (!this.live.has(c)) return;
    this.live.delete(c);
    if (c.lite) {
      this.parent.remove(c.obj);
      const fm = c.front.material as THREE.MeshStandardMaterial;
      fm.map?.dispose();
      fm.dispose();
      (c.back.material as THREE.Material).dispose();
      this.backMats.delete(c.back.material as THREE.MeshStandardMaterial);
      return;
    }
    if (c.card !== null) this.releaseFace(c.card);
    this.parent.remove(c.obj, c.shadow);
    (c.front.material as THREE.Material).dispose();
    (c.back.material as THREE.Material).dispose();
    (c.shadow.material as THREE.Material).dispose();
    this.backMats.delete(c.back.material as THREE.MeshStandardMaterial);
  }

  update() {
    for (const c of this.live) if (!c.lite) c.syncShadow();
  }
}
