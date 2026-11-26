import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Stage } from './stage';

/** Where a piece sits: which side zone, how far down the screen (0..1) and how far out. */
interface Spot {
  side: 'left' | 'right';
  /** 0..1 down the screen. */
  sy: number;
  /** 0..1 across the side zone, from the screen edge to the play area. */
  sx: number;
  yaw: number;
}

interface Piece {
  obj: THREE.Object3D;
  spot: Spot;
}

/** Soft round shadow so the pieces sit on the felt (the scene has no shadow maps). */
function blobShadow(radius: number): THREE.Mesh {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  m.position.y = 0.004;
  m.renderOrder = 1;
  return m;
}

/**
 * PC table decoration: CC0 models from Poly Haven (see CREDITS.md) set on the felt beside the play
 * area. They keep to the side zones, so they never cover cards, chips or the HUD:
 * an oil lamp whose flame lights the felt, a pocket watch, and three brass goblets.
 * One table unit is 10 cm (a card is 0.63 × 0.88), and the models are in metres.
 */
export class Decor {
  private group = new THREE.Group();
  private pieces: Piece[] = [];

  constructor(private stage: Stage) {
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
    const [lamp, watch, goblets] = await Promise.all([get('vintage_oil_lamp'), get('vintage_pocket_watch'), get('brass_goblets')]);

    if (lamp) {
      const s = 3.3;
      lamp.scale.setScalar(s);
      lamp.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && o.name.includes('flame')) {
          m.emissive = new THREE.Color('#ffb347');
          m.emissiveIntensity = 2.2;
          m.emissiveMap = m.map;
        } else if (m && o.name.includes('glass')) {
          // a clear chimney (the default blend reads as a dark rod from above)
          m.map = null;
          m.normalMap = null;
          m.transparent = true;
          m.opacity = 0.22;
          m.depthWrite = false;
          m.color = new THREE.Color('#fff8ec');
          m.roughness = 0.05;
        }
      });
      const holder = new THREE.Group();
      holder.add(lamp, blobShadow(0.6));
      // the flame lights the felt around the lamp
      const glow = new THREE.PointLight('#ffb35c', 7, 7, 1.6);
      glow.position.set(0, 0.5 * s, 0);
      holder.add(glow);
      this.add(holder, { side: 'right', sy: 0.5, sx: 0.6, yaw: 0.5 });
    }

    if (watch) {
      const s = 9;
      watch.scale.setScalar(s);
      // the model stands on its edge, face toward +z: lay it face up
      watch.rotation.x = -Math.PI / 2;
      watch.position.y = 0.007 * s;
      const holder = new THREE.Group();
      holder.add(watch, blobShadow(0.42));
      this.add(holder, { side: 'left', sy: 0.56, sx: 0.55, yaw: -0.55 });
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
      this.add(holder, { side: 'left', sy: 0.8, sx: 0.66, yaw: 0.35 });
    }
  }

  private add(obj: THREE.Object3D, spot: Spot) {
    this.group.add(obj);
    this.pieces.push({ obj, spot });
    this.place();
  }

  /** Keeps every piece in its side zone whatever the window size. */
  private place() {
    const st = this.stage;
    const r = st.play;
    for (const { obj, spot } of this.pieces) {
      const x = spot.side === 'left' ? r.x * spot.sx : st.w - (st.w - r.x - r.w) * spot.sx;
      const p = st.viewToTable(x / st.w, spot.sy);
      obj.position.set(p.x, 0, p.z);
      obj.rotation.y = spot.yaw;
    }
  }
}
