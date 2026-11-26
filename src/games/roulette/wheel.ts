import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Sfx } from '../../audio/sfx';
import { colorOf, pocketIndex, wheelOrder } from './rules';
import { BALL_R, DIAMONDS, IDLE_SPEED, planSpin, POCKET, surfaceY, TAU, TRACK, WHEEL, Y_REST, type BallPos, type SpinEvent } from './spinPlan';

/**
 * A procedural European roulette wheel (outer radius 1.36 table units): a polished mahogany bowl
 * with the ball track and eight brass deflectors, and the rotor with its number ring, 37 coloured
 * pockets between brass frets, a veneered cone and the brass turret with its cross handle. The
 * ivory ball follows a spin plan (spinPlan.ts), so the number drawn beforehand is where it rests.
 *
 * Angles: ψ runs from +x towards +z (clockwise seen from above, as the numbers run on a real
 * wheel). Pocket i of `wheelOrder` sits at rotor angle i·POCKET; the rotor's angle is `phi`.
 */

const { wall: R_WALL, diamond: R_DIAMOND, pocket: R_POCKET, ringOut: R_RING_OUT, ringIn: R_RING_IN, cone: R_CONE, floor: Y_FLOOR } = WHEEL;
/** Planar texture radius of the number ring / pockets canvas. */
const RT = 0.88;

// ------------------------------------------------------------------ geometry and textures

const v2 = (p: [number, number][]) => p.map(([r, y]) => new THREE.Vector2(r, y));

/** Lathe from profile parts: smooth inside each part, a hard edge between parts. */
function lathe(parts: [number, number][][], segs = 148): THREE.BufferGeometry {
  const geos = parts.map((p) => new THREE.LatheGeometry(v2(p), segs));
  if (geos.length === 1) return geos[0];
  const merged = mergeGeometries(geos)!;
  geos.forEach((g) => g.dispose());
  return merged;
}

/** Planar (top-down) UVs: the canvas is the disc of radius R seen from above. */
function planarUV(geo: THREE.BufferGeometry, R: number) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = 0.5 + pos.getX(i) / (2 * R);
    uv[i * 2 + 1] = 0.5 - pos.getZ(i) / (2 * R);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function canvas(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return { cv, g: cv.getContext('2d')! };
}

function texture(cv: HTMLCanvasElement, wrap = false) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (wrap) tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Turned-wood grain: wavy rings around the lathe (u runs around the wheel, v along the profile). */
function woodCanvas(base: string, dark: string, light: string) {
  const { cv, g } = canvas(1024, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 320; i++) {
    const y = Math.random() * 256;
    const amp = 1 + Math.random() * 5;
    const k = 1 + Math.floor(Math.random() * 5);
    const ph = Math.random() * TAU;
    g.strokeStyle = Math.random() < 0.55 ? dark : light;
    g.globalAlpha = 0.04 + Math.random() * 0.12;
    g.lineWidth = 0.6 + Math.random() * 2.4;
    g.beginPath();
    for (let x = 0; x <= 1024; x += 16) {
      const yy = y + amp * Math.sin((x * k * TAU) / 1024 + ph);
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  return cv;
}

const POCKET_FILL: Record<string, [string, string]> = {
  red: ['#c4141f', '#8a0b14'],
  black: ['#1b1b1e', '#0b0b0c'],
  green: ['#13994a', '#0a6630'],
};

/** Number ring and pocket floors, drawn as the rotor seen from above. */
function ringCanvas() {
  const S = 2048;
  const C = S / 2;
  const k = C / RT;
  const { cv, g } = canvas(S, S);
  g.fillStyle = '#2a0e06';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 37; i++) {
    const col = POCKET_FILL[colorOf(wheelOrder[i])];
    const a = i * POCKET;
    const a0 = a - POCKET / 2;
    const a1 = a + POCKET / 2;
    // number ring segment
    const rg = g.createRadialGradient(C, C, R_RING_IN * k, C, C, R_RING_OUT * k);
    rg.addColorStop(0, col[1]);
    rg.addColorStop(0.5, col[0]);
    rg.addColorStop(1, col[1]);
    g.fillStyle = rg;
    g.beginPath();
    g.arc(C, C, (RT - 0.002) * k, a0, a1);
    g.arc(C, C, R_RING_IN * k, a1, a0, true);
    g.closePath();
    g.fill();
    // pocket floor (and its walls)
    const pg = g.createRadialGradient(C, C, (R_CONE - 0.01) * k, C, C, R_RING_IN * k);
    pg.addColorStop(0, col[1]);
    pg.addColorStop(0.55, col[0]);
    pg.addColorStop(1, col[1]);
    g.fillStyle = pg;
    g.beginPath();
    g.arc(C, C, (R_RING_IN + 0.004) * k, a0, a1);
    g.arc(C, C, (R_CONE - 0.02) * k, a1, a0, true);
    g.closePath();
    g.fill();
  }
  // gold separators and rims of the number ring
  g.strokeStyle = '#e2bd66';
  g.lineWidth = 4;
  for (let i = 0; i < 37; i++) {
    const a = (i + 0.5) * POCKET;
    g.beginPath();
    g.moveTo(C + Math.cos(a) * R_RING_IN * k, C + Math.sin(a) * R_RING_IN * k);
    g.lineTo(C + Math.cos(a) * R_RING_OUT * k, C + Math.sin(a) * R_RING_OUT * k);
    g.stroke();
  }
  for (const [r, w] of [
    [R_RING_OUT - 0.003, 7],
    [R_RING_IN + 0.004, 5],
  ]) {
    g.lineWidth = w;
    g.beginPath();
    g.arc(C, C, r * k, 0, TAU);
    g.stroke();
  }
  // numbers, upright when read from outside the wheel
  g.fillStyle = '#fbf7ea';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(0.084 * k)}px "Barlow Condensed", sans-serif`;
  g.shadowColor = 'rgba(0,0,0,.6)';
  g.shadowBlur = 4;
  const rn = (R_RING_IN + R_RING_OUT) / 2 + 0.002;
  for (let i = 0; i < 37; i++) {
    const a = i * POCKET;
    g.save();
    g.translate(C + Math.cos(a) * rn * k, C + Math.sin(a) * rn * k);
    g.rotate(a + Math.PI / 2);
    g.fillText(String(wheelOrder[i]), 0, 2);
    g.restore();
  }
  return cv;
}

/** Rotor cone: book-matched veneer sectors with gold stringing. */
function coneCanvas() {
  const S = 1024;
  const C = S / 2;
  const k = C / 0.6;
  const { cv, g } = canvas(S, S);
  g.fillStyle = '#3b1408';
  g.fillRect(0, 0, S, S);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU;
    const a1 = ((i + 1) / n) * TAU;
    const grad = g.createRadialGradient(C, C, 0.18 * k, C, C, R_CONE * k);
    const light = i % 2 === 0;
    grad.addColorStop(0, light ? '#8a3a17' : '#5c210c');
    grad.addColorStop(1, light ? '#6a2a10' : '#3e1507');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(C, C);
    g.arc(C, C, R_CONE * k + 4, a0, a1);
    g.closePath();
    g.fill();
    // radial figure in the veneer
    g.save();
    g.globalAlpha = 0.1;
    for (let s = 0; s < 26; s++) {
      const a = a0 + ((s + Math.random()) / 26) * (a1 - a0);
      g.strokeStyle = Math.random() < 0.5 ? '#1a0602' : '#b0602c';
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      g.moveTo(C + Math.cos(a) * 0.2 * k, C + Math.sin(a) * 0.2 * k);
      g.lineTo(C + Math.cos(a) * R_CONE * k, C + Math.sin(a) * R_CONE * k);
      g.stroke();
    }
    g.restore();
  }
  g.strokeStyle = '#e2bd66';
  g.lineWidth = 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    g.beginPath();
    g.moveTo(C + Math.cos(a) * 0.2 * k, C + Math.sin(a) * 0.2 * k);
    g.lineTo(C + Math.cos(a) * R_CONE * k, C + Math.sin(a) * R_CONE * k);
    g.stroke();
  }
  for (const r of [0.3, 0.47]) {
    g.beginPath();
    g.arc(C, C, r * k, 0, TAU);
    g.stroke();
  }
  return cv;
}

// ------------------------------------------------------------------ the wheel

export class RouletteWheel {
  readonly group = new THREE.Group();
  private rotor = new THREE.Group();
  private ball: THREE.Mesh;
  private ghosts: THREE.Mesh[] = [];
  private phi = Math.random() * TAU;
  private omega = IDLE_SPEED;
  private ballIdx = Math.floor(Math.random() * 37);
  private spinning = false;
  private tween: gsap.core.Tween | null = null;
  private owned: { dispose(): void }[] = [];
  private bp: BallPos = { r: 0, y: 0, th: 0 };

  constructor(env: THREE.Texture | null) {
    const own = <T extends { dispose(): void }>(x: T) => {
      this.owned.push(x);
      return x;
    };
    const woodTex = own(texture(woodCanvas('#5c1e0c', '#260a03', '#93401a'), true));
    const statorTex = own(texture(woodCanvas('#3c150a', '#160501', '#6a2a12'), true));
    const ringTex = own(texture(ringCanvas()));
    const coneTex = own(texture(coneCanvas()));
    const wood = own(new THREE.MeshPhysicalMaterial({ map: woodTex, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide }));
    const stator = own(new THREE.MeshPhysicalMaterial({ map: statorTex, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide }));
    const cone = own(new THREE.MeshPhysicalMaterial({ map: coneTex, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide }));
    const ring = own(new THREE.MeshPhysicalMaterial({ map: ringTex, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.12, side: THREE.DoubleSide }));
    const brass = own(new THREE.MeshStandardMaterial({ color: '#dcb25c', metalness: 1, roughness: 0.2 }));
    const ivory = own(new THREE.MeshPhysicalMaterial({ color: '#f6f1e4', roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.03 }));
    const dark = own(new THREE.MeshStandardMaterial({ color: '#0c0503', roughness: 0.9 }));
    if (env) {
      // the polished pieces reflect the room more than the felt does
      for (const [m, k] of [
        [wood, 0.55],
        [stator, 0.55],
        [cone, 0.55],
        [ring, 0.45],
        [brass, 1.15],
        [ivory, 0.7],
      ] as [THREE.MeshStandardMaterial, number][]) {
        m.envMap = env;
        m.envMapIntensity = k;
      }
    }
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = this.group) => {
      own(geo);
      const m = new THREE.Mesh(geo, mat);
      parent.add(m);
      return m;
    };

    // ---- bowl: outer wall, rim, ball track (wood), then the lower track / stator
    mesh(
      lathe([
        [
          [1.3, 0],
          [1.355, 0.004],
          [1.372, 0.02],
          [1.375, 0.045],
          [1.36, 0.065],
          [1.348, 0.09],
          [1.346, 0.23],
          [1.352, 0.262],
          [1.36, 0.29],
          [1.356, 0.315],
          [1.34, 0.332],
          [1.315, 0.34],
          [1.262, 0.34],
          [1.24, 0.334],
          [1.228, 0.318],
          [R_WALL, 0.296],
          ...TRACK.slice(0, 5),
        ],
      ]),
      wood,
    );
    mesh(lathe([[...TRACK.slice(4), [0.884, 0.08]]]), stator);
    const trackRing = mesh(new THREE.TorusGeometry(1.05, 0.006, 8, 160), brass);
    trackRing.rotation.x = Math.PI / 2;
    trackRing.position.y = surfaceY(1.05) + 0.001;
    const pit = mesh(new THREE.RingGeometry(0.4, 0.9, 96), dark);
    pit.rotation.x = -Math.PI / 2;
    pit.position.y = 0.045;

    // ---- the eight deflectors, alternately along and across the track
    const diaGeo = own(new THREE.OctahedronGeometry(1, 0));
    const slope = Math.atan2(surfaceY(1.0) - surfaceY(0.95), 0.05);
    DIAMONDS.forEach((a, j) => {
      const d = new THREE.Mesh(diaGeo, brass);
      const along = j % 2 === 0;
      d.scale.set(along ? 0.044 : 0.02, 0.016, along ? 0.02 : 0.044);
      const holder = new THREE.Group();
      holder.position.set(Math.cos(a) * R_DIAMOND, surfaceY(R_DIAMOND) + 0.006, Math.sin(a) * R_DIAMOND);
      holder.rotation.set(0, -a, slope);
      holder.add(d);
      this.group.add(holder);
    });

    // ---- rotor
    this.group.add(this.rotor);
    mesh(
      lathe([
        [
          [R_RING_OUT + 0.006, 0.04],
          [R_RING_OUT + 0.006, 0.12],
          [R_RING_OUT + 0.004, 0.126],
          [R_RING_OUT, 0.128],
        ],
      ]),
      stator,
      this.rotor,
    );
    mesh(
      planarUV(
        lathe([
          [
            [R_RING_OUT, 0.128],
            [R_RING_IN, 0.112],
          ],
        ]),
        RT,
      ),
      ring,
      this.rotor,
    );
    mesh(
      planarUV(
        lathe([
          [
            [R_RING_IN, 0.112],
            [R_RING_IN, Y_FLOOR],
          ],
          [
            [R_RING_IN, Y_FLOOR],
            [R_CONE, Y_FLOOR + 0.002],
          ],
          [
            [R_CONE, Y_FLOOR + 0.002],
            [R_CONE, 0.118],
          ],
        ]),
        RT,
      ),
      ring,
      this.rotor,
    );
    mesh(
      planarUV(
        lathe([
          [
            [R_CONE, 0.118],
            [0.565, 0.125],
            [0.5, 0.14],
            [0.4, 0.162],
            [0.3, 0.183],
            [0.22, 0.2],
            [0.19, 0.206],
          ],
        ]),
        0.6,
      ),
      cone,
      this.rotor,
    );
    for (const [r, y, tube] of [
      [R_CONE, 0.118, 0.006],
      [R_RING_IN, 0.112, 0.005],
    ]) {
      const tr = mesh(new THREE.TorusGeometry(r, tube, 8, 160), brass, this.rotor);
      tr.rotation.x = Math.PI / 2;
      tr.position.y = y;
    }
    // frets between the pockets
    const fretGeo = own(new THREE.BoxGeometry(R_RING_IN - R_CONE + 0.004, 0.05, 0.009));
    const frets = own(new THREE.InstancedMesh(fretGeo, brass, 37));
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const rm = (R_RING_IN + R_CONE) / 2;
    for (let i = 0; i < 37; i++) {
      const a = (i + 0.5) * POCKET;
      q.setFromAxisAngle(up, -a);
      mtx.compose(new THREE.Vector3(Math.cos(a) * rm, Y_FLOOR + 0.024, Math.sin(a) * rm), q, one);
      frets.setMatrixAt(i, mtx);
    }
    this.rotor.add(frets);
    // turret with the cross handle
    mesh(
      lathe(
        [
          [
            [0.19, 0.206],
            [0.186, 0.222],
            [0.165, 0.236],
            [0.13, 0.248],
            [0.09, 0.258],
            [0.062, 0.272],
            [0.05, 0.29],
            [0.044, 0.31],
            [0.042, 0.35],
            [0.056, 0.356],
            [0.058, 0.374],
            [0.046, 0.382],
            [0.032, 0.392],
            [0.026, 0.41],
            [0.0, 0.414],
          ],
        ],
        64,
      ),
      brass,
      this.rotor,
    );
    const finial = mesh(new THREE.SphereGeometry(0.03, 24, 16), brass, this.rotor);
    finial.position.y = 0.428;
    const armGeo = own(new THREE.CylinderGeometry(0.011, 0.014, 0.19, 16).rotateZ(-Math.PI / 2));
    const knobGeo = own(new THREE.SphereGeometry(0.025, 20, 14));
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group();
      arm.rotation.y = (k * Math.PI) / 2 + Math.PI / 4;
      arm.position.y = 0.366;
      const bar = new THREE.Mesh(armGeo, brass);
      bar.position.x = 0.115;
      const knob = new THREE.Mesh(knobGeo, brass);
      knob.position.x = 0.215;
      arm.add(bar, knob);
      this.rotor.add(arm);
    }

    // ---- the ball and its motion trail
    const ballGeo = own(new THREE.SphereGeometry(BALL_R, 28, 18));
    this.ball = new THREE.Mesh(ballGeo, ivory);
    this.group.add(this.ball);
    for (let i = 0; i < 6; i++) {
      const mat = own(new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0, depthWrite: false }));
      const gh = new THREE.Mesh(ballGeo, mat);
      gh.renderOrder = 3;
      gh.visible = false;
      this.ghosts.push(gh);
      this.group.add(gh);
    }
    this.applyRotor();
    this.restBall();
  }

  /** Free running between spins: the rotor coasts back to its idle speed, the ball in its pocket. */
  update(dt: number) {
    if (this.spinning) return;
    this.omega += (IDLE_SPEED - this.omega) * (1 - Math.exp(-dt / 5));
    this.phi += this.omega * dt;
    this.applyRotor();
    this.restBall();
  }

  private applyRotor() {
    this.rotor.rotation.y = -this.phi;
  }

  private restBall() {
    const a = this.phi + this.ballIdx * POCKET;
    this.ball.position.set(Math.cos(a) * R_POCKET, Y_REST, Math.sin(a) * R_POCKET);
  }

  /**
   * Spins the wheel and lands the ball in the pocket of `n` (drawn beforehand). The croupier spins
   * the rotor and flicks the ball the other way round the ball track; the ball slows, leaves the
   * wall, spirals down the stator, clips a deflector, drops onto the rotor, rattles over two or
   * three frets and settles, riding with the rotor. About 7.5 s.
   */
  spin(n: number, sfx: Sfx): Promise<void> {
    if (this.spinning) return Promise.resolve();
    const plan = planSpin({ phi: this.phi, omega: this.omega, ballIdx: this.ballIdx, n });
    // sounds that run on their own clock follow the animation speed setting
    const ts = Math.max(0.25, gsap.globalTimeline.timeScale());
    const sound = (e: SpinEvent) => {
      if (e.kind === 'launch') {
        sfx.whoosh(0.7 / ts);
        sfx.ballRoll((plan.tRotor - plan.tLaunch) / ts);
      } else if (e.kind === 'diamond') sfx.tick(0.32, 0.55);
      else if (e.kind === 'rotor') sfx.tick(0.26, 0.8);
      else if (e.kind === 'land') sfx.tick(0.22 * 0.75 ** e.j, 1 + 0.12 * e.j);
      else sfx.tick(0.05, 1.35);
    };
    const place = (o: BallPos, m: THREE.Object3D) => m.position.set(Math.cos(o.th) * o.r, o.y, Math.sin(o.th) * o.r);
    const trail: BallPos = { r: 0, y: 0, th: 0 };
    const apply = (t: number) => {
      this.phi = plan.rotorAt(t);
      this.applyRotor();
      place(plan.ballAt(t, this.bp), this.ball);
      // motion trail: the ball a few milliseconds earlier, fading, only while it runs fast
      plan.ballAt(Math.max(0, t - 0.012), trail);
      const speed = Math.hypot(Math.cos(trail.th) * trail.r - this.ball.position.x, Math.sin(trail.th) * trail.r - this.ball.position.z) / 0.012;
      const f = t > plan.tLaunch ? Math.min(1, Math.max(0, (speed - 2.5) / 9)) : 0;
      this.ghosts.forEach((gh, i) => {
        gh.visible = f > 0.01;
        if (!gh.visible) return;
        place(plan.ballAt(Math.max(0, t - (i + 1) * 0.0055), trail), gh);
        (gh.material as THREE.MeshBasicMaterial).opacity = f * 0.36 * (1 - i / this.ghosts.length);
      });
    };

    this.spinning = true;
    return new Promise((res) => {
      const st = { t: 0 };
      let ev = 0;
      this.tween = gsap.to(st, {
        t: plan.tEnd,
        duration: plan.tEnd,
        ease: 'none',
        onUpdate: () => {
          apply(st.t);
          while (ev < plan.events.length && plan.events[ev].t <= st.t) sound(plan.events[ev++]);
        },
        onComplete: () => {
          this.ghosts.forEach((gh) => (gh.visible = false));
          this.phi = plan.rotorAt(plan.tEnd);
          this.omega = plan.rotorSpeed(plan.tEnd);
          this.ballIdx = pocketIndex(n);
          this.spinning = false;
          this.tween = null;
          this.applyRotor();
          this.restBall();
          res();
        },
      });
    });
  }

  dispose() {
    this.tween?.kill();
    this.tween = null;
    this.group.removeFromParent();
    for (const o of this.owned) o.dispose();
    this.owned = [];
  }
}

/** The dolly: a gold marker with a crystal top that the croupier sets on the winning number. */
export function makeDolly(env: THREE.Texture | null): { obj: THREE.Group; dispose(): void } {
  const gold = new THREE.MeshStandardMaterial({ color: '#e3bb62', metalness: 1, roughness: 0.18 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#fff3cf',
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    transparent: true,
    opacity: 0.85,
    emissive: new THREE.Color('#7a5a14'),
    emissiveIntensity: 0.35,
  });
  if (env) {
    gold.envMap = env;
    gold.envMapIntensity = 1.2;
    glass.envMap = env;
    glass.envMapIntensity = 1.4;
  }
  const body = new THREE.LatheGeometry(
    v2([
      [0, 0],
      [0.1, 0],
      [0.106, 0.008],
      [0.104, 0.02],
      [0.088, 0.03],
      [0.05, 0.044],
      [0.036, 0.07],
      [0.032, 0.13],
      [0.05, 0.142],
      [0.052, 0.156],
      [0.03, 0.166],
    ]),
    48,
  );
  const top = new THREE.IcosahedronGeometry(0.06, 1);
  const obj = new THREE.Group();
  const b = new THREE.Mesh(body, gold);
  const tp = new THREE.Mesh(top, glass);
  tp.position.y = 0.212;
  obj.add(b, tp);
  return {
    obj,
    dispose() {
      obj.removeFromParent();
      body.dispose();
      top.dispose();
      gold.dispose();
      glass.dispose();
    },
  };
}
