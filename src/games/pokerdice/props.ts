import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Tray } from './physics';

/**
 * The dice trays (wooden rails with leather cushions, felt floor) and the leather dice cups.
 * Textures: "Brown Leather" (Rob Tuytel) and "Dark Wood" (Dario Barresi, Dimitrios Savva,
 * Rico Cilliers), Poly Haven, CC0 — public/assets/pokerdice/. The felt is the table's own.
 */

export const RAIL_T = 0.11;
export const RAIL_H = 0.17;
export const FLOOR_Y = 0.022;

export const CUP_H = 0.62;
export const CUP_R = 0.29;

interface Maps {
  leather: THREE.Texture;
  leatherN: THREE.Texture;
  wood: THREE.Texture;
  woodN: THREE.Texture;
  felt: THREE.Texture;
}

let maps: Maps | null = null;
let ready: Promise<void> | null = null;
let users = 0;
/** Clones of each loaded map (own repeat): they are flagged for upload when the image arrives. */
const clones = new Map<THREE.Texture, THREE.Texture[]>();

function load(): Maps {
  if (maps) return maps;
  const base = import.meta.env.BASE_URL + 'assets/';
  const loader = new THREE.TextureLoader();
  const jobs: Promise<void>[] = [];
  const tex = (url: string, color: boolean) => {
    let done = () => {};
    jobs.push(new Promise<void>((r) => (done = r)));
    const t = loader.load(
      base + url,
      () => {
        for (const c of clones.get(t) ?? []) c.needsUpdate = true;
        done();
      },
      undefined,
      () => done(),
    );
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    clones.set(t, []);
    return t;
  };
  maps = {
    leather: tex('pokerdice/brown_leather_albedo_1k.jpg', true),
    leatherN: tex('pokerdice/brown_leather_nor_gl_1k.jpg', false),
    wood: tex('pokerdice/dark_wood_diff_1k.jpg', true),
    woodN: tex('pokerdice/dark_wood_nor_gl_1k.jpg', false),
    felt: tex('felt/felt_grey_1k.jpg', true),
  };
  ready = Promise.all(jobs).then(() => undefined);
  return maps;
}

/** Starts loading the leather, wood and felt maps; resolves when they are in (or after `timeout` s). */
export function preloadPropMaps(timeout = 4): Promise<void> {
  load();
  return Promise.race([ready!, new Promise<void>((r) => setTimeout(r, timeout * 1000))]);
}

function release() {
  if (--users > 0 || !maps) return;
  for (const t of Object.values(maps)) t.dispose();
  for (const list of clones.values()) for (const c of list) c.dispose();
  clones.clear();
  maps = null;
  ready = null;
}

/** A texture clone with its own repeat (shares the image). */
function rep(t: THREE.Texture, x: number, y: number, rot = 0): THREE.Texture {
  const c = t.clone();
  c.repeat.set(x, y);
  c.rotation = rot;
  if (t.image) c.needsUpdate = true;
  clones.get(t)?.push(c);
  return c;
}

function blobShadow(size: number, alpha = 0.6): THREE.Mesh {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(0,0,0,${alpha})`);
  grd.addColorStop(0.55, `rgba(0,0,0,${alpha * 0.55})`);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.renderOrder = 2;
  return m;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const s = mat as THREE.MeshStandardMaterial;
      // textures from `rep` are released with `release()`; canvas maps (shadows) are disposed here
      if (s.map instanceof THREE.CanvasTexture) s.map.dispose();
      mat.dispose();
    }
  });
}

/** A felt-lined dice tray with padded wooden rails. Its inner box is `tray`. */
export class DiceTray {
  readonly group = new THREE.Group();

  constructor(
    parent: THREE.Object3D,
    readonly tray: Tray,
    felt = '#5d1424',
  ) {
    users++;
    const m = load();
    const { w, d } = tray;
    // leather cushions line the rails: their inner faces are the walls the dice bounce off
    const CT = 0.016;
    const ow = w + 2 * (RAIL_T + CT);
    const od = d + 2 * (RAIL_T + CT);
    const woodMat = (len: number, rot: number) =>
      new THREE.MeshStandardMaterial({ map: rep(m.wood, len * 0.9, 0.35, rot), normalMap: rep(m.woodN, len * 0.9, 0.35, rot), color: '#d9c2b0', roughness: 0.42, metalness: 0 });
    // base board and felt floor
    const base = new THREE.Mesh(new RoundedBoxGeometry(ow, FLOOR_Y, od, 2, 0.008), woodMat(ow, 0));
    base.position.y = FLOOR_Y / 2;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 2 * CT, d + 2 * CT).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: rep(m.felt, w * 1.6, d * 1.6), color: felt, roughness: 0.96, metalness: 0 }),
    );
    floor.position.y = FLOOR_Y + 0.0006;
    this.group.add(base, floor);
    // rails: the long ones run the full length, the short ones fit between them
    const ix = w / 2 + CT;
    const iz = d / 2 + CT;
    const longGeo = new RoundedBoxGeometry(ow, RAIL_H, RAIL_T, 3, 0.03);
    const shortGeo = new RoundedBoxGeometry(RAIL_T, RAIL_H, 2 * iz + 0.002, 3, 0.03);
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(longGeo, woodMat(ow, 0));
      a.position.set(0, RAIL_H / 2, s * (iz + RAIL_T / 2));
      const b = new THREE.Mesh(shortGeo, woodMat(d, Math.PI / 2));
      b.position.set(s * (ix + RAIL_T / 2), RAIL_H / 2, 0);
      this.group.add(a, b);
    }
    const leatherMat = new THREE.MeshStandardMaterial({ map: rep(m.leather, 3, 0.3), normalMap: rep(m.leatherN, 3, 0.3), color: '#6e3324', roughness: 0.62 });
    const CH = RAIL_H * 0.66;
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new RoundedBoxGeometry(2 * ix, CH, CT + 0.004, 2, 0.006), leatherMat);
      a.position.set(0, FLOOR_Y + CH / 2, s * (d / 2 + CT / 2 + 0.002));
      const b = new THREE.Mesh(new RoundedBoxGeometry(CT + 0.004, CH, d, 2, 0.006), leatherMat);
      b.position.set(s * (w / 2 + CT / 2 + 0.002), FLOOR_Y + CH / 2, 0);
      this.group.add(a, b);
    }
    // a gold inlay along the top of the rails
    const gold = new THREE.MeshStandardMaterial({ color: '#d9b45c', metalness: 1, roughness: 0.3 });
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(ow - 0.06, 0.004, 0.012), gold);
      a.position.set(0, RAIL_H + 0.001, s * (iz + RAIL_T / 2));
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, od - 0.06), gold);
      b.position.set(s * (ix + RAIL_T / 2), RAIL_H + 0.001, 0);
      this.group.add(a, b);
    }
    const sh = blobShadow(1, 0.5);
    sh.scale.set(ow * 1.25, 1, od * 1.45);
    sh.position.y = 0.002;
    this.group.add(sh);
    this.group.position.set(tray.cx, 0, tray.cz);
    parent.add(this.group);
  }

  dispose() {
    this.group.removeFromParent();
    disposeTree(this.group);
    release();
  }
}

/**
 * A leather dice cup: slightly flared, a rolled lip with a gold band, stitched bands and a dark
 * suede inside. The group's origin is the centre of its base; its mouth points along local +y.
 */
export class DiceCup {
  readonly group = new THREE.Group();
  readonly body = new THREE.Group();
  readonly shadow: THREE.Mesh;

  constructor(parent: THREE.Object3D) {
    users++;
    const m = load();
    const outer: THREE.Vector2[] = [];
    const N = 18;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      outer.push(new THREE.Vector2(CUP_R * (0.86 + 0.14 * t * t), CUP_H * t));
    }
    const leather = new THREE.MeshStandardMaterial({
      map: rep(m.leather, 2, 1),
      normalMap: rep(m.leatherN, 2, 1),
      normalScale: new THREE.Vector2(1.2, 1.2),
      color: '#9a5a44',
      roughness: 0.55,
      metalness: 0,
    });
    const wall = new THREE.Mesh(new THREE.LatheGeometry(outer, 64), leather);
    const inner = new THREE.Mesh(
      new THREE.LatheGeometry(
        outer.map((p) => new THREE.Vector2(p.x - 0.022, Math.max(0.028, p.y))),
        64,
      ),
      new THREE.MeshStandardMaterial({ color: '#1d0f0a', roughness: 0.95, side: THREE.BackSide }),
    );
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(CUP_R * 0.86, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2a160e', roughness: 0.9 }));
    bottom.position.y = 0.03;
    const sole = new THREE.Mesh(new THREE.CylinderGeometry(CUP_R * 0.86, CUP_R * 0.86, 0.012, 48), leather);
    sole.position.y = 0.006;
    // rolled lip with a gold band, and two stitched bands
    const lip = new THREE.Mesh(new THREE.TorusGeometry(CUP_R - 0.011, 0.016, 12, 72).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: rep(m.leather, 6, 0.2), color: '#6a2f20', roughness: 0.5 }));
    lip.position.y = CUP_H;
    const gold = new THREE.MeshStandardMaterial({ color: '#d9b45c', metalness: 1, roughness: 0.28 });
    const band = (y: number, r: number, thick: number) => {
      const b = new THREE.Mesh(new THREE.TorusGeometry(r, thick, 8, 72).rotateX(Math.PI / 2), gold);
      b.position.y = y;
      return b;
    };
    const rAt = (y: number) => CUP_R * (0.86 + 0.14 * (y / CUP_H) ** 2) + 0.002;
    this.body.add(wall, inner, bottom, sole, lip, band(CUP_H - 0.05, rAt(CUP_H - 0.05), 0.006), band(0.07, rAt(0.07), 0.0055));
    // stitches: little dashes around the bands
    const stitchMat = new THREE.MeshStandardMaterial({ color: '#e8d6a8', roughness: 0.7 });
    const stitchGeo = new THREE.BoxGeometry(0.018, 0.005, 0.004);
    for (const y of [CUP_H - 0.08, 0.1]) {
      const r = rAt(y);
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        const s = new THREE.Mesh(stitchGeo, stitchMat);
        s.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        s.rotation.y = -a + Math.PI / 2;
        this.body.add(s);
      }
    }
    this.group.add(this.body);
    this.shadow = blobShadow(CUP_R * 3.2, 0.62);
    parent.add(this.group, this.shadow);
  }

  /** World position of the centre of the mouth. */
  mouth(out = new THREE.Vector3()): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    return this.body.localToWorld(out.set(0, CUP_H, 0));
  }

  /** Keeps the contact shadow under the cup (call after moving it). */
  sync() {
    const p = this.group.position;
    const c = this.mouth(new THREE.Vector3()).add(p).multiplyScalar(0.5);
    const hgt = Math.max(0, p.y);
    this.shadow.position.set(c.x, 0.003, c.z);
    const s = 1 + hgt * 0.5;
    this.shadow.scale.set(s, 1, s);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 1 - hgt / 1.4);
  }

  dispose() {
    this.group.removeFromParent();
    this.shadow.removeFromParent();
    disposeTree(this.group);
    disposeTree(this.shadow);
    release();
  }
}
