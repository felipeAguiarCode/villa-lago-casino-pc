import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AXES, DIE, FACE_AXIS, HALF, type Q, type V3 } from './diceSim';

/** Pip positions on a face, in steps of a quarter of the face. */
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, 1], [1, -1]],
  3: [[-1, 1], [0, 0], [1, -1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

/** Face frames (u, v tangents) per body axis. */
function faceFrame(n: V3): [THREE.Vector3, THREE.Vector3] {
  if (n.x !== 0) return [new THREE.Vector3(0, 0, -n.x), new THREE.Vector3(0, 1, 0)];
  if (n.y !== 0) return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -n.y)];
  return [new THREE.Vector3(n.z, 0, 0), new THREE.Vector3(0, 1, 0)];
}

/** White pips of a canonical die (value v on the face of body axis FACE_AXIS[v]), merged in one geometry. */
function pipGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const step = DIE * 0.255;
  const r = DIE * 0.092;
  for (let v = 1; v <= 6; v++) {
    const a = AXES[FACE_AXIS[v]];
    const n = new THREE.Vector3(a.x, a.y, a.z);
    const [u, w] = faceFrame(a);
    const rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    for (const [pu, pv] of PIPS[v]) {
      const disc = new THREE.CircleGeometry(v === 1 ? r * 1.25 : r, 22);
      disc.applyQuaternion(rot);
      const c = n.clone().multiplyScalar(HALF + 0.0007).addScaledVector(u, pu * step).addScaledVector(w, pv * step);
      disc.translate(c.x, c.y, c.z);
      parts.push(disc);
    }
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

export interface DieObj {
  /** The physical body (position and orientation from the simulation). */
  body: THREE.Group;
  /** The cube and its pips, turned inside the body so the drawn number lands on top. */
  inner: THREE.Group;
  shadow: THREE.Mesh;
}

/**
 * The shooter's pair: translucent red casino dice (19 mm, razor edges, clear-coated acetate with
 * white flush pips), each with a soft contact shadow.
 */
export class Dice3D {
  readonly group = new THREE.Group();
  readonly dice: DieObj[] = [];
  private owned: { dispose(): void }[] = [];

  constructor(env: THREE.Texture | null, shadowTex: THREE.Texture) {
    const own = <T extends { dispose(): void }>(x: T) => {
      this.owned.push(x);
      return x;
    };
    const cube = own(new RoundedBoxGeometry(DIE, DIE, DIE, 2, DIE * 0.035));
    const pips = own(pipGeometry());
    const acetate = own(
      new THREE.MeshPhysicalMaterial({
        color: '#e3141f',
        emissive: '#3a0207',
        roughness: 0.07,
        metalness: 0,
        transmission: 0.7,
        thickness: DIE * 0.9,
        ior: 1.49,
        attenuationColor: new THREE.Color('#8e0610'),
        attenuationDistance: DIE * 1.4,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        specularIntensity: 1,
        envMap: env,
        envMapIntensity: 1.6,
      }),
    );
    const paint = own(new THREE.MeshStandardMaterial({ color: '#f8f5ec', roughness: 0.38, metalness: 0, envMap: env, envMapIntensity: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    const shadowGeo = own(new THREE.PlaneGeometry(DIE * 2.1, DIE * 2.1).rotateX(-Math.PI / 2));
    for (let i = 0; i < 2; i++) {
      const body = new THREE.Group();
      const inner = new THREE.Group();
      inner.add(new THREE.Mesh(cube, acetate), new THREE.Mesh(pips, paint));
      body.add(inner);
      const smat = own(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.6 }));
      const shadow = new THREE.Mesh(shadowGeo, smat);
      shadow.renderOrder = 1;
      this.group.add(body, shadow);
      this.dice.push({ body, inner, shadow });
    }
  }

  /** Sets a die's body pose (simulation space = table space). */
  setPose(i: number, p: V3, q: Q) {
    const d = this.dice[i];
    d.body.position.set(p.x, p.y, p.z);
    d.body.quaternion.set(q.x, q.y, q.z, q.w);
    this.syncShadow(i);
  }

  syncShadow(i: number) {
    const d = this.dice[i];
    const p = d.body.position;
    const h = Math.max(0, p.y - HALF);
    d.shadow.position.set(p.x + 0.015 + h * 0.08, 0.002, p.z + 0.02 + h * 0.12);
    d.shadow.scale.setScalar(1 + h * 1.4);
    (d.shadow.material as THREE.MeshBasicMaterial).opacity = 0.62 * Math.max(0.12, 1 - h * 0.9);
  }

  /** Turns the pips inside a die (row-major 3×3 cube rotation, pip-local → body-local). */
  setPipTurn(i: number, m: number[]) {
    const m4 = new THREE.Matrix4().set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
    this.dice[i].inner.quaternion.setFromRotationMatrix(m4);
  }

  bodyQ(i: number): Q {
    const q = this.dice[i].body.quaternion;
    return { x: q.x, y: q.y, z: q.z, w: q.w };
  }

  bodyP(i: number): V3 {
    const p = this.dice[i].body.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  dispose() {
    this.group.removeFromParent();
    for (const o of this.owned) o.dispose();
    this.owned = [];
  }
}
