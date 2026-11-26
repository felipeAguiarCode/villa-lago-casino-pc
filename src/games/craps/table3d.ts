import * as THREE from 'three';
import gsap from 'gsap';
import { ChipPile, type ChipSet } from '../../table/chips';
import { DIM, type CrapsLayout, type Pt } from './layout';
import { puckFace } from './print';

/** Corner radius of the tub's inner wall. */
const RC = 0.32;
const TUBE_R = 0.2;
const CAP = 0.12;

interface PathPt {
  x: number;
  z: number;
  /** Inward normal (toward the felt). */
  nx: number;
  nz: number;
}

/**
 * The inner boundary of the tub: up the left wall, round the corner, along the back wall, round the
 * other corner and down the right wall (open on the player's side). `out` offsets it outward.
 */
function tubPath(L: CrapsLayout, out: number, step = 0.2, zMax = L.walls.zB): PathPt[] {
  const { xL, xR, zW } = L.walls;
  const pts: PathPt[] = [];
  const line = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let i = 0; i < n; i++) {
      const k = i / n;
      pts.push({ x: x0 + (x1 - x0) * k - nx * out, z: z0 + (z1 - z0) * k - nz * out, nx, nz });
    }
  };
  const arc = (cx: number, cz: number, a0: number, a1: number) => {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const nx = -Math.cos(a);
      const nz = -Math.sin(a);
      pts.push({ x: cx + Math.cos(a) * (RC + out), z: cz + Math.sin(a) * (RC + out), nx, nz });
    }
  };
  line(xL, zMax, xL, zW + RC, 1, 0);
  arc(xL + RC, zW + RC, Math.PI, Math.PI * 1.5);
  line(xL + RC, zW, xR - RC, zW, 0, 1);
  arc(xR - RC, zW + RC, Math.PI * 1.5, Math.PI * 2);
  line(xR, zW + RC, xR, zMax, -1, 0);
  pts.push({ x: xR + out, z: zMax, nx: -1, nz: 0 });
  return pts;
}

/** A vertical or sloped strip along a path: from (offset a, height ya) to (offset b, height yb). */
function strip(path: PathPt[], a: number, ya: number, b: number, yb: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let run = 0;
  path.forEach((p, i) => {
    if (i > 0) run += Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z);
    pos.push(p.x - p.nx * a, ya, p.z - p.nz * a, p.x - p.nx * b, yb, p.z - p.nz * b);
    uv.push(run * 0.35, 0, run * 0.35, 1);
    if (i > 0) {
      const k = i * 2;
      // the path runs clockwise seen from above, so this winding faces the felt / the sky
      idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** A soft round shadow (for dice and the puck: the stage has no shadow maps). */
export function shadowTexture() {
  return canvasTexture(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,.7)');
    grd.addColorStop(0.5, 'rgba(0,0,0,.32)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  });
}

/** The ON / OFF puck: black side OFF, white side ON. */
export class Puck {
  readonly obj = new THREE.Group();
  private disc = new THREE.Group();
  private shadow: THREE.Mesh;
  private flips = 0;
  on = false;
  constructor(onLabel: string, offLabel: string, shadowTex: THREE.Texture, own: (x: { dispose(): void }) => void) {
    const R = 0.19;
    const H = 0.055;
    const side = new THREE.MeshPhysicalMaterial({ color: '#1a1a1c', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const band = new THREE.MeshStandardMaterial({ color: '#f1ece0', roughness: 0.4 });
    const topTex = new THREE.CanvasTexture(puckFace(true, onLabel));
    topTex.colorSpace = THREE.SRGBColorSpace;
    const botTex = new THREE.CanvasTexture(puckFace(false, offLabel));
    botTex.colorSpace = THREE.SRGBColorSpace;
    const top = new THREE.MeshPhysicalMaterial({ map: topTex, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
    const bot = new THREE.MeshPhysicalMaterial({ map: botTex, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
    const rim = new THREE.CylinderGeometry(R, R, H, 48, 1, true);
    const stripe = new THREE.CylinderGeometry(R * 1.002, R * 1.002, H * 0.28, 48, 1, true);
    const capT = new THREE.CircleGeometry(R, 48).rotateX(-Math.PI / 2).translate(0, H / 2, 0);
    const capB = new THREE.CircleGeometry(R, 48).rotateX(Math.PI / 2).translate(0, -H / 2, 0);
    this.disc.add(new THREE.Mesh(rim, side), new THREE.Mesh(stripe, band), new THREE.Mesh(capT, top), new THREE.Mesh(capB, bot));
    this.disc.position.y = H / 2;
    this.obj.add(this.disc);
    [side, band, top, bot, topTex, botTex, rim, stripe, capT, capB].forEach(own);
    const smat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55 });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2), smat);
    this.shadow.renderOrder = 1;
    own(smat);
    own(this.shadow.geometry);
    this.setOn(false);
  }

  /** Shadow follows the puck on the felt. */
  attachShadow(parent: THREE.Object3D) {
    parent.add(this.shadow);
    this.syncShadow();
  }

  syncShadow() {
    const p = this.obj.position;
    this.shadow.position.set(p.x + 0.02, 0.0025, p.z + 0.03);
    const h = Math.max(0, this.disc.position.y - 0.0275);
    const k = Math.max(0.25, 1 - h * 1.6);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.55 * k;
    this.shadow.scale.setScalar(1 + h * 0.9);
  }

  setOn(on: boolean) {
    this.on = on;
    this.flips = on ? 0 : 1;
    this.disc.rotation.x = this.flips * Math.PI;
  }

  /** Lifts, flips with a spin, glides to `to` and lands with a little bounce. */
  async moveTo(to: Pt, on: boolean, onLand?: () => void, onLift?: () => void) {
    const o = this.obj;
    const d = this.disc;
    const flip = on !== this.on;
    this.on = on;
    if (flip) this.flips++;
    const rx = this.flips * Math.PI;
    const dist = Math.hypot(to.x - o.position.x, to.z - o.position.z);
    const glide = Math.min(0.85, 0.35 + dist * 0.06);
    const y0 = 0.0275;
    const peak = 0.34 + Math.min(0.35, dist * 0.04);
    onLift?.();
    const tl = gsap.timeline({ onUpdate: () => this.syncShadow() });
    tl.to(d.position, { y: peak, duration: 0.22, ease: 'power2.out' }, 0)
      .to(d.rotation, { x: rx, duration: 0.42 + glide * 0.4, ease: 'power2.inOut' }, 0.04)
      .to(d.rotation, { y: d.rotation.y + (Math.random() < 0.5 ? -1 : 1) * 0.6, duration: glide + 0.3, ease: 'sine.inOut' }, 0)
      .to(o.position, { x: to.x, z: to.z, duration: glide, ease: 'power2.inOut' }, 0.08)
      .to(d.position, { y: y0, duration: 0.2, ease: 'power2.in' }, 0.08 + glide - 0.12)
      .call(() => onLand?.())
      .to(d.position, { y: y0 + 0.05, duration: 0.09, ease: 'power2.out' })
      .to(d.position, { y: y0, duration: 0.11, ease: 'power2.in' })
      .to(d.position, { y: y0 + 0.012, duration: 0.05, ease: 'power1.out' })
      .to(d.position, { y: y0, duration: 0.06, ease: 'power1.in' });
    // a coin-like wobble as it settles
    const w = { a: 0.12 };
    tl.to(w, {
      a: 0,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: () => {
        d.rotation.z = w.a * Math.sin(w.a * 120);
      },
    }, '<-0.2');
    await tl.then();
    d.rotation.z = 0;
    this.syncShadow();
  }

  place(p: Pt) {
    this.obj.position.set(p.x, 0, p.z);
    this.syncShadow();
  }
}

/**
 * The tub of the craps table: the padded leather rail with its brass trim round three sides, the
 * inner wall lined with rubber diamond pyramids, the house's chip bank in the back corner, and the
 * ON / OFF puck.
 */
export class CrapsTable3D {
  readonly group = new THREE.Group();
  readonly puck: Puck;
  readonly shadowTex: THREE.Texture;
  private owned: { dispose(): void }[] = [];
  private bankPiles: ChipPile[] = [];

  constructor(
    L: CrapsLayout,
    env: THREE.Texture | null,
    chips: ChipSet,
    labels: { on: string; off: string },
  ) {
    const own = <T extends { dispose(): void }>(x: T) => {
      this.owned.push(x);
      return x;
    };
    const H = DIM.WALL_H;
    // where the side walls stop mattering (just past the player's rail)
    const zEnd = L.main.z1 + 3;
    const inner = tubPath(L, 0, 0.2, zEnd);

    // materials
    const wood = own(
      new THREE.MeshPhysicalMaterial({
        map: own(
          canvasTexture(
            512,
            64,
            (g) => {
              const grd = g.createLinearGradient(0, 0, 512, 0);
              grd.addColorStop(0, '#4a2413');
              grd.addColorStop(0.5, '#5c2e17');
              grd.addColorStop(1, '#45210f');
              g.fillStyle = grd;
              g.fillRect(0, 0, 512, 64);
              for (let i = 0; i < 70; i++) {
                g.strokeStyle = `rgba(${20 + Math.random() * 30},${8 + Math.random() * 10},4,${0.15 + Math.random() * 0.25})`;
                g.lineWidth = 1 + Math.random() * 2;
                const y = Math.random() * 64;
                g.beginPath();
                g.moveTo(0, y);
                g.bezierCurveTo(170, y + (Math.random() - 0.5) * 12, 340, y + (Math.random() - 0.5) * 12, 512, y);
                g.stroke();
              }
            },
            [8, 1],
          ),
        ),
        roughness: 0.38,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMap: env,
        envMapIntensity: 0.9,
        side: THREE.DoubleSide,
      }),
    );
    const leather = own(
      new THREE.MeshPhysicalMaterial({
        color: '#2c160b',
        roughness: 0.5,
        clearcoat: 0.35,
        clearcoatRoughness: 0.4,
        sheen: 0.4,
        sheenColor: new THREE.Color('#6b3a1e'),
        envMap: env,
        envMapIntensity: 0.7,
      }),
    );
    const brass = own(new THREE.MeshStandardMaterial({ color: '#d9b45c', roughness: 0.26, metalness: 1, envMap: env, envMapIntensity: 1.2 }));
    const rubber = own(new THREE.MeshStandardMaterial({ color: '#141816', roughness: 0.78, metalness: 0, envMap: env, envMapIntensity: 0.5, side: THREE.DoubleSide }));
    const pyramidMat = own(new THREE.MeshStandardMaterial({ color: '#1c211e', roughness: 0.55, metalness: 0, flatShading: true, envMap: env, envMapIntensity: 0.8 }));

    // inner wall (wood), rubber backing, the cap and the outer apron
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      own(geo);
      const m = new THREE.Mesh(geo, mat);
      this.group.add(m);
      return m;
    };
    mesh(strip(inner, 0, 0, 0, H), wood);
    mesh(strip(inner, -0.004, 0.025, -0.004, H - 0.04), rubber);
    mesh(strip(inner, 0, H, CAP, H), wood);
    const outerPts = tubPath(L, CAP + TUBE_R * 2 + 0.02, 0.2, zEnd);
    mesh(strip(outerPts, 0, H + 0.02, 0.5, H - 0.04), wood);
    mesh(strip(outerPts, 0.5, H - 0.04, 0.5, 0), wood);

    // padded leather rail
    const railPts = tubPath(L, CAP + TUBE_R - 0.02, 0.35, zEnd).map((p) => new THREE.Vector3(p.x, H + TUBE_R * 0.55, p.z));
    const curve = new THREE.CatmullRomCurve3(railPts, false, 'centripetal');
    mesh(new THREE.TubeGeometry(curve, Math.max(64, railPts.length * 3), TUBE_R, 18, false), leather);
    // brass trim along the inner top edge
    const trimPts = tubPath(L, 0.012, 0.35, zEnd).map((p) => new THREE.Vector3(p.x, H + 0.012, p.z));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trimPts, false, 'centripetal'), trimPts.length * 3, 0.016, 8, false), brass);

    // rubber diamond pyramids (only where the camera can see them)
    const pyr = own(new THREE.ConeGeometry(0.058, DIM.PYR, 4, 1, true));
    const zSee = L.main.z1 + 0.6;
    const along = tubPath(L, -0.006, 0.12, zSee).filter((p) => p.z <= zSee);
    const rows: number[] = [];
    for (let y = 0.07; y < H - 0.06; y += 0.058) rows.push(y);
    const count = along.length * rows.length;
    const inst = new THREE.InstancedMesh(pyr, pyramidMat, count);
    const m4 = new THREE.Matrix4();
    const tmpX = new THREE.Vector3();
    const tmpY = new THREE.Vector3();
    const tmpZ = new THREE.Vector3();
    let k = 0;
    rows.forEach((y, ri) => {
      along.forEach((p, i) => {
        // alternate rows sit half a step over, so the diamonds interlock
        const q = ri % 2 ? along[Math.min(along.length - 1, i + 1)] : p;
        const x = ri % 2 ? (p.x + q.x) / 2 : p.x;
        const z = ri % 2 ? (p.z + q.z) / 2 : p.z;
        tmpY.set(p.nx, 0, p.nz);
        tmpX.set(-p.nz, 0, p.nx);
        tmpZ.crossVectors(tmpX, tmpY);
        m4.makeBasis(tmpX, tmpY, tmpZ);
        m4.setPosition(x + p.nx * (DIM.PYR / 2 - 0.002), y, z + p.nz * (DIM.PYR / 2 - 0.002));
        inst.setMatrixAt(k++, m4);
      });
    });
    inst.count = k;
    inst.instanceMatrix.needsUpdate = true;
    this.group.add(inst);
    this.owned.push({ dispose: () => inst.dispose() });

    // the house's bank: a wooden tray of chip towers in the back corner
    const b = L.bank;
    const tray = mesh(new THREE.BoxGeometry(b.w, 0.06, b.h), wood);
    tray.position.set(b.x, 0.03, b.z);
    const well = mesh(new THREE.BoxGeometry(b.w - 0.08, 0.012, b.h - 0.08), own(new THREE.MeshStandardMaterial({ color: '#0d0c0b', roughness: 0.9 })));
    well.position.set(b.x, 0.062, b.z);
    const denoms = [1000, 500, 100, 100, 25, 25, 5, 5];
    const cols = 6;
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < cols; c++) {
        const v = denoms[(c + r * 3) % denoms.length];
        const p = new ChipPile(chips, this.group, new THREE.Vector3(b.x - b.w / 2 + 0.24 + c * ((b.w - 0.48) / (cols - 1)), 0.068, b.z - 0.13 + r * 0.26));
        p.tower(v, 5 + ((c * 7 + r * 3) % 6));
        p.group.scale.setScalar(0.62);
        this.bankPiles.push(p);
      }

    this.shadowTex = own(shadowTexture());
    this.puck = new Puck(labels.on, labels.off, this.shadowTex, own);
    this.group.add(this.puck.obj);
    this.puck.attachShadow(this.group);
  }

  /** Where the house's payouts come from and lost chips go. */
  static bankPoint(L: CrapsLayout): THREE.Vector3 {
    return new THREE.Vector3(L.bank.x - L.bank.w * 0.25, 0.07, L.bank.z);
  }

  dispose() {
    for (const p of this.bankPiles) p.dispose();
    this.bankPiles = [];
    this.group.removeFromParent();
    for (const o of this.owned) o.dispose();
    this.owned = [];
  }
}
