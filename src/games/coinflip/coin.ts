import * as THREE from 'three';
import type { CoinFace } from './rules';

/**
 * The gold show coin, modelled here (no downloads): an 11 cm casino coin, 9 mm thick, polished
 * gold PBR with a reeded edge and struck faces (crowned "VL" monogram on heads, a faceted star in a
 * laurel wreath on tails). The relief comes from canvas height maps turned into normal maps, with
 * frosted devices on mirror fields like a proof coin.
 */

export const COIN_R = 0.55;
export const COIN_T = 0.09;
const H2 = COIN_T / 2;
const FIELD_R = 0.462;
const FIELD_Y = 0.034;
const EDGE_H = 0.072;

const GOLD = '#f0c66a';

// ---------------------------------------------------------------- height maps
const SIZE = 512;

/** Letters around a circle: along the top (upright, outward) or the bottom (a smile). `center` turns the run clockwise. */
export function arcText(g: CanvasRenderingContext2D, text: string, r: number, center: number, top: boolean, spacing = 1) {
  const ws = [...text].map((ch) => g.measureText(ch).width * spacing);
  const total = ws.reduce((a, b) => a + b, 0);
  let acc = -total / 2;
  for (let i = 0; i < ws.length; i++) {
    const mid = acc + ws[i] / 2;
    const a = center + (top ? mid / r : -mid / r);
    g.save();
    g.rotate(a);
    g.translate(0, top ? -r : r);
    g.fillText(text[i], 0, 0);
    g.restore();
    acc += ws[i];
  }
}

function starPath(g: CanvasRenderingContext2D, R: number, r: number, n = 5, rot = -Math.PI / 2) {
  g.beginPath();
  for (let k = 0; k < n * 2; k++) {
    const a = rot + (k * Math.PI) / n;
    const rr = k % 2 ? r : R;
    if (k) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
}

/** Grey levels on black: white = highest relief. */
function rimAndBeads(g: CanvasRenderingContext2D) {
  g.strokeStyle = 'rgb(205,205,205)';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(0, 0, 243, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgb(180,180,180)';
  for (let k = 0; k < 84; k++) {
    const a = (k / 84) * Math.PI * 2;
    g.beginPath();
    g.arc(Math.cos(a) * 228, Math.sin(a) * 228, 3.6, 0, Math.PI * 2);
    g.fill();
  }
}

function drawCrown(g: CanvasRenderingContext2D, w: number, h: number) {
  const peaks = [-0.5, -0.25, 0, 0.25, 0.5];
  const hs = [0.62, 0.8, 1, 0.8, 0.62];
  g.fillStyle = 'rgb(225,225,225)';
  g.beginPath();
  g.moveTo(-0.5 * w, 0);
  peaks.forEach((p, i) => {
    g.lineTo(p * w, -hs[i] * h);
    if (i < 4) g.lineTo((p + 0.125) * w, -0.34 * h);
  });
  g.lineTo(0.5 * w, 0);
  g.closePath();
  g.fill();
  peaks.forEach((p, i) => {
    g.beginPath();
    g.arc(p * w, -hs[i] * h - 0.05 * w, 0.055 * w, 0, Math.PI * 2);
    g.fill();
  });
  // the band, with its jewels struck a little lower
  g.fillStyle = 'rgb(240,240,240)';
  g.beginPath();
  g.roundRect(-0.55 * w, -0.02 * h, 1.1 * w, 0.3 * h, 0.06 * h);
  g.fill();
  g.fillStyle = 'rgb(150,150,150)';
  for (const x of [-0.36, 0, 0.36]) {
    g.beginPath();
    g.ellipse(x * w, 0.13 * h, 0.05 * w, 0.075 * h, 0, 0, Math.PI * 2);
    g.fill();
  }
  // a cross on the top pearl
  g.fillStyle = 'rgb(225,225,225)';
  g.fillRect(-0.018 * w, -1.27 * h, 0.036 * w, 0.2 * h);
  g.fillRect(-0.07 * w, -1.22 * h, 0.14 * w, 0.035 * w);
}

function headsHeight(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, SIZE, SIZE);
  g.translate(SIZE / 2, SIZE / 2);
  rimAndBeads(g);
  // legend
  g.fillStyle = 'rgb(200,200,200)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 34px "Cinzel", serif';
  arcText(g, 'VILLA LAGO', 196, 0, true, 1.12);
  arcText(g, 'CASINO', 196, 0, false, 1.12);
  for (const a of [Math.PI / 2 + 0.02, -Math.PI / 2 - 0.02]) {
    g.save();
    g.rotate(a);
    g.translate(0, -196);
    starPath(g, 11, 4.5);
    g.fill();
    g.restore();
  }
  g.strokeStyle = 'rgb(170,170,170)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 166, 0, Math.PI * 2);
  g.stroke();
  // crown over the monogram
  g.save();
  g.translate(0, -62);
  drawCrown(g, 132, 58);
  g.restore();
  // interlaced "VL"
  g.font = '700 150px "Cinzel", serif';
  g.textBaseline = 'alphabetic';
  g.fillStyle = 'rgb(255,255,255)';
  g.fillText('V', -36, 96);
  g.fillStyle = 'rgb(235,235,235)';
  g.fillText('L', 40, 96);
  // a small rule under the monogram
  g.fillStyle = 'rgb(190,190,190)';
  g.fillRect(-58, 112, 116, 5);
  return cv;
}

function tailsHeight(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, SIZE, SIZE);
  g.translate(SIZE / 2, SIZE / 2);
  rimAndBeads(g);
  g.fillStyle = 'rgb(200,200,200)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 32px "Cinzel", serif';
  arcText(g, 'FORTUNA', 198, 0, true, 1.18);
  g.font = '700 24px "Cinzel", serif';
  arcText(g, 'MMXXVI', 120, 0, false, 1.15);
  // laurel wreath: two branches rising from a tied ribbon at the bottom
  for (const side of [-1, 1]) {
    g.strokeStyle = 'rgb(160,160,160)';
    g.lineWidth = 4;
    g.beginPath();
    const a0 = Math.PI / 2 + side * 0.16;
    const a1 = Math.PI / 2 + side * 2.3;
    g.arc(0, 0, 162, Math.min(a0, a1), Math.max(a0, a1));
    g.stroke();
    for (let k = 0; k < 11; k++) {
      const a = a0 + ((a1 - a0) * (k + 0.5)) / 11;
      const tilt = side * 0.75;
      for (const [rr, off, shade] of [
        [178, tilt, 230],
        [146, -tilt, 205],
      ] as const) {
        g.save();
        g.rotate(a);
        g.translate(rr, 0);
        g.rotate(Math.PI / 2 + off);
        g.fillStyle = `rgb(${shade},${shade},${shade})`;
        g.beginPath();
        g.ellipse(0, 0, 7, 17 - k * 0.5, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      if (k % 3 === 1) {
        g.fillStyle = 'rgb(240,240,240)';
        g.beginPath();
        g.arc(Math.cos(a) * 162, Math.sin(a) * 162, 4.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // ribbon bow
  g.fillStyle = 'rgb(215,215,215)';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(0, 160);
    g.quadraticCurveTo(side * 26, 140, side * 30, 162);
    g.quadraticCurveTo(side * 26, 182, 0, 166);
    g.fill();
  }
  // faceted five-pointed star: each point has a lit and a shaded facet
  const R = 104;
  const r = 42;
  for (let k = 0; k < 10; k++) {
    const a0 = -Math.PI / 2 + (k * Math.PI) / 5;
    const a1 = -Math.PI / 2 + ((k + 1) * Math.PI) / 5;
    const r0 = k % 2 ? r : R;
    const r1 = k % 2 ? R : r;
    const v = k % 2 ? 215 : 255;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
    g.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
    g.closePath();
    g.fill();
  }
  // two small stars beside it
  g.fillStyle = 'rgb(200,200,200)';
  for (const x of [-92, 92]) {
    g.save();
    g.translate(x, -66);
    starPath(g, 13, 5.5);
    g.fill();
    g.restore();
  }
  return cv;
}

/** Separable box blur on a height field (radius in px), a few passes ≈ gaussian. */
function blur(src: Float32Array, w: number, h: number, rad: number, passes = 2): Float32Array {
  let a = src.slice();
  let b = new Float32Array(a.length);
  const n = rad * 2 + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -rad; x <= rad; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[y * w + x] = acc / n;
        acc += a[y * w + Math.min(w - 1, x + rad + 1)] - a[y * w + Math.max(0, x - rad)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -rad; y <= rad; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / n;
        acc += b[Math.min(h - 1, y + rad + 1) * w + x] - b[Math.max(0, y - rad) * w + x];
      }
    }
  }
  b = a;
  return b;
}

/** Normal map (tangent space, OpenGL convention) and roughness map from a height canvas. */
function reliefMaps(height: HTMLCanvasElement, strength = 2.6): { normal: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const w = height.width;
  const h = height.height;
  const px = height.getContext('2d')!.getImageData(0, 0, w, h).data;
  const raw = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) raw[i] = px[i * 4] / 255;
  // a rounded "pillow" relief: a tight blur for crisp edges plus a soft one for the doming
  const sharp = blur(raw, w, h, 1, 2);
  const soft = blur(raw, w, h, 5, 2);
  const H = new Float32Array(w * h);
  for (let i = 0; i < H.length; i++) H[i] = sharp[i] * 0.72 + soft[i] * 0.28;
  const nc = document.createElement('canvas');
  nc.width = w;
  nc.height = h;
  const rc = document.createElement('canvas');
  rc.width = w;
  rc.height = h;
  const nImg = nc.getContext('2d')!.createImageData(w, h);
  const rImg = rc.getContext('2d')!.createImageData(w, h);
  const at = (x: number, y: number) => H[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // canvas y runs down, texture v runs up: the v-gradient is −dy
      let nx = -dx;
      let ny = dy;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * w + x) * 4;
      nImg.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      nImg.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nImg.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      nImg.data[i + 3] = 255;
      // mirror fields, frosted devices
      const r = 0.16 + 0.3 * Math.min(1, raw[y * w + x] * 1.4);
      const v = Math.round(r * 255);
      rImg.data[i] = v;
      rImg.data[i + 1] = v;
      rImg.data[i + 2] = v;
      rImg.data[i + 3] = 255;
    }
  nc.getContext('2d')!.putImageData(nImg, 0, 0);
  rc.getContext('2d')!.putImageData(rImg, 0, 0);
  const normal = new THREE.CanvasTexture(nc);
  normal.anisotropy = 8;
  const rough = new THREE.CanvasTexture(rc);
  rough.anisotropy = 8;
  return { normal, rough };
}

/** Fine vertical grooves of the reeded edge (one groove, repeated around). */
function reedTexture(): THREE.CanvasTexture {
  const w = 32;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = 4;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(w, 4);
  for (let x = 0; x < w; x++) {
    const s = Math.sin(((x + 0.5) / w) * Math.PI * 2);
    let nx = -0.85 * s;
    let nz = 1;
    const l = Math.hypot(nx, nz);
    nx /= l;
    nz /= l;
    for (let y = 0; y < 4; y++) {
      const i = (y * w + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = 128;
      img.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(170, 1);
  t.magFilter = THREE.LinearFilter;
  return t;
}

function shadowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,.72)');
  grd.addColorStop(0.55, 'rgba(0,0,0,.4)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The coin mesh: a group whose origin is the coin's centre, heads facing +y. */
export class Coin {
  readonly group = new THREE.Group();
  readonly shadow: THREE.Mesh;
  private disposables: { dispose(): void }[] = [];

  constructor(env: THREE.Texture | null) {
    const base = { color: GOLD, metalness: 1, envMap: env, envMapIntensity: 1.25 };
    const polished = new THREE.MeshStandardMaterial({ ...base, roughness: 0.22, side: THREE.DoubleSide });
    const reed = reedTexture();
    const edgeMat = new THREE.MeshStandardMaterial({ ...base, roughness: 0.3, normalMap: reed, normalScale: new THREE.Vector2(1, 1) });
    const heads = reliefMaps(headsHeight());
    const tails = reliefMaps(tailsHeight());
    const headsMat = new THREE.MeshStandardMaterial({ ...base, roughness: 1, normalMap: heads.normal, roughnessMap: heads.rough });
    const tailsMat = new THREE.MeshStandardMaterial({ ...base, roughness: 1, normalMap: tails.normal, roughnessMap: tails.rough });

    const edgeGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, EDGE_H, 180, 1, true);
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    // raised rim: from the field up over the flat rim and down the bevel to the edge
    const prof = (s: number) =>
      [
        [FIELD_R, FIELD_Y],
        [FIELD_R + 0.008, H2 - 0.0015],
        [FIELD_R + 0.016, H2],
        [COIN_R - 0.016, H2],
        [COIN_R - 0.004, H2 - 0.004],
        [COIN_R, EDGE_H / 2],
      ].map(([r, y]) => new THREE.Vector2(r, y * s));
    const rimTopGeo = new THREE.LatheGeometry(prof(1), 180);
    const rimBotGeo = new THREE.LatheGeometry(prof(-1), 180);
    const rimTop = new THREE.Mesh(rimTopGeo, polished);
    const rimBot = new THREE.Mesh(rimBotGeo, polished);
    const faceGeo = new THREE.CircleGeometry(FIELD_R, 128);
    const headsFace = new THREE.Mesh(faceGeo, headsMat);
    headsFace.rotation.x = -Math.PI / 2;
    headsFace.position.y = FIELD_Y;
    // tails reads upright once the coin is turned over about its x axis
    const tailsFace = new THREE.Mesh(faceGeo, tailsMat);
    tailsFace.rotation.x = Math.PI / 2;
    tailsFace.position.y = -FIELD_Y;
    this.group.add(edge, rimTop, rimBot, headsFace, tailsFace);

    const shTex = shadowTexture();
    const shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0.6 });
    const shGeo = new THREE.PlaneGeometry(COIN_R * 2.5, COIN_R * 2.5).rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(shGeo, shMat);
    this.shadow.renderOrder = 2;
    this.disposables.push(polished, edgeMat, headsMat, tailsMat, reed, heads.normal, heads.rough, tails.normal, tails.rough, edgeGeo, rimTopGeo, rimBotGeo, faceGeo, shTex, shMat, shGeo);
  }

  /** Places the coin and its contact shadow (the shadow fades and spreads as the coin rises). */
  place(pos: THREE.Vector3, quat: THREE.Quaternion, ground = 0) {
    this.group.position.copy(pos);
    this.group.quaternion.copy(quat);
    const hgt = Math.max(0, pos.y - ground - H2);
    const m = this.shadow.material as THREE.MeshBasicMaterial;
    this.shadow.position.set(pos.x, ground + 0.002, pos.z);
    // a standing coin throws a narrow shadow
    const n = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
    const flat = Math.abs(n.y);
    const s = 1 + hgt * 0.45;
    // the shadow's local x lies along the coin's axis: a standing coin throws a thin one
    this.shadow.scale.set(s * (0.2 + 0.8 * flat), 1, s);
    this.shadow.rotation.y = Math.atan2(-n.z, n.x);
    m.opacity = 0.62 * Math.max(0.12, 1 - hgt / 2.1);
  }

  dispose() {
    this.group.removeFromParent();
    this.shadow.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

// ---------------------------------------------------------------- motion

/** Height of the centre of a coin resting on its rim with tilt `a` (0 = flat). */
export const clearance = (a: number) => COIN_R * Math.abs(Math.sin(a)) + H2 * Math.abs(Math.cos(a));

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const TAILS_UP = new THREE.Quaternion().setFromAxisAngle(X, Math.PI);
const _qa = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _axis = new THREE.Vector3();

/**
 * Orientation of the coin: turned so `face` is up, spun by `beta` about its own axis, then tilted
 * by `alpha` so its normal leans toward the horizontal direction `phi` (x = cos, z = sin).
 */
export function coinQuat(alpha: number, phi: number, beta: number, face: 'heads' | 'tails', out = new THREE.Quaternion()) {
  _axis.set(Math.sin(phi), 0, -Math.cos(phi));
  _qa.setFromAxisAngle(_axis, alpha);
  _qy.setFromAxisAngle(Y, beta);
  out.copy(_qa).multiply(_qy);
  if (face === 'tails') out.multiply(TAILS_UP);
  return out;
}

export interface FlipPlan {
  /** Total seconds. */
  dur: number;
  /** First touchdown, second touchdown, start of the spin-down. */
  hits: [number, number];
  wobbleAt: number;
  wobbleDur: number;
  pose(t: number, pos: THREE.Vector3, quat: THREE.Quaternion): void;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Plans a physical flip from `from` (the coin's centre on the dealer's cradle) to rest at
 * (`to.x`, `to.z`) with `result` up: flicked up ~1.8 units spinning end over end 6–10 turns, two
 * bounces, then the spin-down of a spun coin (Euler's disk): it rolls on its rim in a tightening
 * spiral while the wobble flattens and speeds up, until it lies still. For an EDGE it rolls up
 * onto its rim instead, rocks and comes to stand facing the player.
 */
export function planFlip(from: THREE.Vector3, to: THREE.Vector3, result: CoinFace, rnd: () => number = Math.random): FlipPlan {
  const face: 'heads' | 'tails' = result === 'tails' ? 'tails' : 'heads';
  const PI = Math.PI;
  // ---------------- spin-down (computed backwards from the resting place)
  const N = 720;
  const D = {
    a: new Float32Array(N + 1),
    phi: new Float32Array(N + 1),
    beta: new Float32Array(N + 1),
    x: new Float32Array(N + 1),
    z: new Float32Array(N + 1),
  };
  let TD: number;
  let a0: number;
  if (result !== 'edge') {
    TD = 2.35 + 0.45 * rnd();
    a0 = 1.05 + 0.25 * rnd();
    const dir = rnd() < 0.5 ? 1 : -1;
    const om0 = 2 * PI * (0.75 + 0.3 * rnd());
    const betaEnd = (rnd() - 0.5) * 0.6;
    const rho0 = 0.1 + 0.08 * rnd();
    const dt = TD / N;
    let phi = PI / 2;
    let B = 0;
    const Bs = new Float32Array(N + 1);
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      // the tilt dies like a spun coin's: slowly at first, then all at once
      const a = a0 * Math.pow(1 - u, 0.42);
      D.a[k] = a;
      D.phi[k] = phi;
      Bs[k] = B;
      const om = om0 * Math.sqrt(a0 / Math.max(a, 0.05));
      phi += dir * om * dt;
      B -= dir * (1 - Math.cos(a)) * om * dt;
    }
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      D.beta[k] = betaEnd + (Bs[k] - Bs[N]);
      const rho = rho0 * Math.pow(1 - u, 1.4);
      D.x[k] = to.x + rho * Math.cos(D.phi[k]);
      D.z[k] = to.z + rho * Math.sin(D.phi[k]);
    }
  } else {
    TD = 2.0 + 0.35 * rnd();
    a0 = 1.08 + 0.2 * rnd();
    const side = rnd() < 0.5 ? 1 : -1;
    const curve = (rnd() < 0.5 ? 1 : -1) * (0.35 + 0.25 * rnd());
    const S = 0.55 + 0.25 * rnd();
    const sOf = (u: number) => S * (1 - (1 - u) * (1 - u));
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      const dev = (PI / 2 - a0) * Math.exp(-3.1 * u) * Math.cos(2 * PI * 1.55 * u) * (1 - smooth(0.78, 1, u));
      D.a[k] = PI / 2 - dev;
      D.phi[k] = PI / 2 + curve * Math.sin(PI * u) * Math.sqrt(1 - u);
      D.beta[k] = -side * (S - sOf(u)) / COIN_R;
    }
    // integrate the rolling path backwards from where it stands
    D.x[N] = to.x;
    D.z[N] = to.z;
    for (let k = N - 1; k >= 0; k--) {
      const ds = sOf((k + 1) / N) - sOf(k / N);
      const ph = D.phi[k];
      D.x[k] = D.x[k + 1] - side * -Math.sin(ph) * ds;
      D.z[k] = D.z[k + 1] - side * Math.cos(ph) * ds;
    }
  }
  const beta0 = D.beta[0];
  // ---------------- toss and bounces
  const TA = 1.02 + 0.16 * rnd();
  const TB = 0.36;
  const TC = 0.18;
  const M = 7 + Math.floor(rnd() * 3);
  const th0 = face === 'tails' ? -PI : 0;
  const thEnd = a0 + 2 * PI * M;
  const dC = 0.32;
  const dB = 2.3;
  const thC0 = thEnd - dC;
  const thB0 = thC0 - dB;
  // the spin builds up over the first few hundredths of a second as the thumb releases the coin
  const TAU = 0.06;
  const spun = (t: number) => t - TAU * (1 - Math.exp(-t / TAU));
  const omA = (thB0 - th0) / spun(TA);
  const pD = new THREE.Vector3(D.x[0], clearance(a0), D.z[0]);
  const pC = new THREE.Vector3(pD.x + (rnd() - 0.5) * 0.06, clearance(thC0), pD.z - 0.11);
  const pB = new THREE.Vector3(pC.x + (rnd() - 0.5) * 0.12, clearance(thB0), pC.z - 0.32);
  const APEX = 1.8;
  const eB = (u: number) => (1 - Math.exp(-2 * u)) / (1 - Math.exp(-2));
  const eC = (u: number) => (1 - Math.exp(-1.5 * u)) / (1 - Math.exp(-1.5));
  const t1 = TA;
  const t2 = TA + TB;
  const t3 = TA + TB + TC;
  const dur = t3 + TD;
  const sample = (arr: Float32Array, u: number) => {
    const f = Math.min(1, Math.max(0, u)) * N;
    const i = Math.min(N - 1, Math.floor(f));
    const w = f - i;
    return arr[i] * (1 - w) + arr[i + 1] * w;
  };
  const pose = (t: number, pos: THREE.Vector3, quat: THREE.Quaternion) => {
    if (t < t1) {
      const s = Math.max(0, t) / TA;
      pos.lerpVectors(from, pB, s);
      pos.y = from.y + (pB.y - from.y) * s + 4 * APEX * s * (1 - s);
      const th = th0 + omA * spun(Math.max(0, t));
      pos.y = Math.max(pos.y, clearance(th));
      coinQuat(th, PI / 2, beta0, face, quat);
    } else if (t < t2) {
      const u = (t - t1) / TB;
      const th = thB0 + dB * eB(u);
      pos.lerpVectors(pB, pC, 1 - Math.pow(1 - u, 1.5));
      pos.y = Math.max(pB.y + (pC.y - pB.y) * u + 4 * 0.24 * u * (1 - u), clearance(th));
      coinQuat(th, PI / 2, beta0, face, quat);
    } else if (t < t3) {
      const u = (t - t2) / TC;
      const th = thC0 + dC * eC(u);
      pos.lerpVectors(pC, pD, 1 - Math.pow(1 - u, 1.5));
      pos.y = Math.max(pC.y + (pD.y - pC.y) * u + 4 * 0.05 * u * (1 - u), clearance(th));
      coinQuat(th, PI / 2, beta0, face, quat);
    } else {
      const u = Math.min(1, (t - t3) / TD);
      const a = sample(D.a, u);
      pos.set(sample(D.x, u), clearance(a), sample(D.z, u));
      coinQuat(a, sample(D.phi, u), sample(D.beta, u), face, quat);
    }
  };
  return { dur, hits: [t1, t2], wobbleAt: t3, wobbleDur: TD, pose };
}
