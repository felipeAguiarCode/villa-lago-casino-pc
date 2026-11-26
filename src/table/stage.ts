import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Quality } from '../core/settings';
import { pcLayout, type Rect } from '../ui/layout';

export const BASE_VIEW_WIDTH = 3.3;
/** Visible table height at the reference 9:19.5 frame. */
export const REF_HEIGHT = BASE_VIEW_WIDTH / (9 / 19.5);
const REF_ASPECT = 9 / 19.5;


/**
 * Renderer and cameras for the widescreen edition.
 *
 * Every table is laid out in the phone version's portrait frame: a virtual camera (`layoutCam`)
 * keeps the phone's 9:19.5 view, and `screenToTable(u, v)` maps that frame onto the table, so all
 * the games place their cards, chips and prints exactly as before. The camera that renders
 * (`camera`) is a widescreen one, tilted a little more for a seated view, and fitted so that the
 * play band fills the middle of the screen between the side panels. The felt and the rail extend
 * to the screen edges.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** The camera that renders the scene. */
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 160);
  /** The phone version's portrait camera, used only for layout. */
  private layoutCam = new THREE.PerspectiveCamera(30, REF_ASPECT, 0.1, 80);
  /** Tilt of the widescreen camera from vertical (the layout camera keeps the phone's 12°). */
  viewTilt = THREE.MathUtils.degToRad(30);
  /**
   * Part of the portrait layout frame that holds the game. On phones the rest is covered by the
   * HUD; here the HUD moves to the sides, so the camera frames just this band.
   */
  readonly layoutBand = { u0: 0.04, u1: 0.96, v0: 0.06, v1: 0.87 };
  /** Play area on screen, in CSS px. */
  play: Rect = { x: 0, y: 0, w: 1, h: 1 };
  /** Everything that belongs to the table (cards, chips, prints). */
  readonly table = new THREE.Group();
  w = 1;
  h = 1;
  private zoom = 1;
  private targetZoom = 1;
  private tilt = THREE.MathUtils.degToRad(12);
  private centerZ = 0;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private frameCbs = new Set<(dt: number) => void>();
  private resizeCbs = new Set<() => void>();
  private viewCbs = new Set<() => void>();
  private last = 0;
  private quality: Quality = 'high';

  constructor(private host: HTMLElement) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.domElement.id = 'gl';
    host.prepend(r.domElement);
    this.renderer = r;

    this.scene.background = new THREE.Color('#03100a');
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pm.dispose();

    const hemi = new THREE.HemisphereLight(0xfff4e2, 0x1b2a20, 0.55);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff3df, 1.05);
    key.position.set(-2.5, 9, 4);
    this.scene.add(key);
    const pool = new THREE.SpotLight(0xffe9c4, 62, 0, 0.62, 0.95, 1.6);
    pool.position.set(0, 9, 0.6);
    pool.target.position.set(0, 0, 0.2);
    this.scene.add(pool, pool.target);

    this.scene.add(this.table);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    r.setAnimationLoop((t) => this.tick(t));
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.resize();
  }

  resize() {
    const rect = this.host.getBoundingClientRect();
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    const dpr = this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1.25);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.play = pcLayout(this.w, this.h).play;
    this.updateCamera();
    for (const cb of this.resizeCbs) cb();
  }

  private updateCamera() {
    // the phone's camera at the reference aspect: the layout every game was designed on
    const lc = this.layoutCam;
    const vf = THREE.MathUtils.degToRad(lc.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * lc.aspect);
    const d = this.viewWidth / 2 / Math.tan(hf / 2);
    lc.position.set(0, d * Math.cos(this.tilt), this.centerZ + d * Math.sin(this.tilt));
    lc.lookAt(0, 0, this.centerZ);
    lc.updateProjectionMatrix();
    lc.updateMatrixWorld();
    this.fitView();
  }

  private band: THREE.Vector3[] = [0, 1, 2, 3].map(() => new THREE.Vector3());
  private fitTarget = new THREE.Vector3();

  /** Points the widescreen camera so the play band fills the play rectangle, centered. */
  private fitView() {
    const pts = this.band;
    let i = 0;
    const b = this.layoutBand;
    for (const v of [b.v0, b.v1]) for (const u of [b.u0, b.u1]) this.screenToTable(u, v, 0, pts[i++]);
    const cam = this.camera;
    const dir = new THREE.Vector3(0, Math.cos(this.viewTilt), Math.sin(this.viewTilt));
    const target = this.fitTarget.set(0, 0, 0);
    for (const p of pts) target.add(p);
    target.multiplyScalar(1 / pts.length);
    const r = this.play;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    let d = 12;
    const q = new THREE.Vector3();
    for (let it = 0; it < 14; it++) {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of pts) {
        q.copy(p).project(cam);
        const x = (q.x * 0.5 + 0.5) * this.w;
        const y = (-q.y * 0.5 + 0.5) * this.h;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      const wpp = (2 * d * tanHalf) / this.h;
      target.x += ((x0 + x1) / 2 - cx) * wpp;
      target.z += (((y0 + y1) / 2 - cy) * wpp) / Math.cos(this.viewTilt);
      d *= Math.max((x1 - x0) / r.w, (y1 - y0) / r.h);
    }
    cam.position.copy(target).addScaledVector(dir, d);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    for (const cb of this.viewCbs) cb();
  }

  /** Called whenever the widescreen camera is refitted (resize or zoom). */
  onView(cb: () => void) {
    this.viewCbs.add(cb);
    return () => this.viewCbs.delete(cb);
  }

  /** Width of table visible across the (virtual, portrait) layout frame. */
  get viewWidth() {
    return BASE_VIEW_WIDTH * this.zoom;
  }

  /** Smoothly zooms the camera out (>1) or back (1), e.g. when blackjack hands are split. */
  setZoom(z: number) {
    this.targetZoom = z;
  }

  onFrame(cb: (dt: number) => void) {
    this.frameCbs.add(cb);
    return () => this.frameCbs.delete(cb);
  }

  onResize(cb: () => void) {
    this.resizeCbs.add(cb);
    return () => this.resizeCbs.delete(cb);
  }

  /**
   * Point on the table plane (height y) under the position (u, v) of the portrait layout frame,
   * in 0..1 with v from the top. This is how every game places things on the table.
   */
  screenToTable(u: number, v: number, y = 0, out = new THREE.Vector3()): THREE.Vector3 {
    this.ray.setFromCamera(new THREE.Vector2(u * 2 - 1, -(v * 2 - 1)), this.layoutCam);
    this.plane.constant = -y;
    this.ray.ray.intersectPlane(this.plane, out);
    return out;
  }

  /** Point on the table plane (height y) under the real screen position (u, v), 0..1 of the frame. */
  viewToTable(u: number, v: number, y = 0, out = new THREE.Vector3()): THREE.Vector3 {
    this.ray.setFromCamera(new THREE.Vector2(u * 2 - 1, -(v * 2 - 1)), this.camera);
    this.plane.constant = -y;
    this.ray.ray.intersectPlane(this.plane, out);
    return out;
  }

  /** Center of the play band on the table. */
  get playCenter(): THREE.Vector3 {
    return this.fitTarget;
  }

  /** CSS pixel position (relative to the frame) of a world point. */
  toScreen(p: THREE.Vector3): { x: number; y: number } {
    const v = p.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  private tick(t: number) {
    const dt = Math.min(0.05, this.last ? (t - this.last) / 1000 : 0.016);
    this.last = t;
    if (Math.abs(this.targetZoom - this.zoom) > 1e-4) {
      this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 4);
      this.updateCamera();
    }
    for (const cb of this.frameCbs) cb(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
