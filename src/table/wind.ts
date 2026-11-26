import * as THREE from 'three';
import gsap from 'gsap';
import { REST_Y, type Card3D } from './cardMesh';
import type { Stage } from './stage';

/**
 * A breeze over the table (the PC title screen). Every few seconds a gust picks up one to three of
 * the cards lying on the felt and carries them off: a small aerodynamic model, not an animation.
 *
 * - The gust has an envelope (a quick rise, a slow fall) plus turbulence.
 * - The air drags the card toward the wind's velocity; a flat card moving fast gets lift, so it
 *   sails, while a card on its edge drops.
 * - The card tumbles and spins, and the paper flutters (the card shader's bend).
 * - On landing it bounces once if it is fast, slides with friction and settles flat, face up or
 *   down depending on how it came down.
 *
 * Cards blown off the visible table are handed back (`onLost`); now and then a gust also blows a
 * new card in from off-screen (`spawn`).
 */
export interface WindOpts {
  stage: Stage;
  /** Cards lying on the felt that a gust may lift. */
  cards: () => Card3D[];
  /** A card busy with something else (turning over…). */
  busy: (c: Card3D) => boolean;
  /** A new card to blow in from off-screen (null: none this time). */
  spawn?: () => Card3D | null;
  /** A card that came to rest on the table (blown in or moved). */
  onSettle?: (c: Card3D, fromOutside: boolean) => void;
  /** A card blown off the visible table (the caller removes it). */
  onLost?: (c: Card3D) => void;
  /** A gust starts (strength 0..1), for the sound. */
  onGust?: (strength: number) => void;
  /** A card touches down (impact speed), for the sound. */
  onTouch?: (speed: number) => void;
  /** Keep landings out of this disc (the shuffle area). */
  avoid?: () => { x: number; z: number; r: number };
}

interface Flyer {
  c: Card3D;
  v: THREE.Vector3;
  /** Angular velocity of the Euler angles (x tilt, y spin, z roll). */
  w: THREE.Vector3;
  t: number;
  phase: number;
  bounces: number;
  fromOutside: boolean;
}

const G = 5.2; // a card is light: a slow, floaty fall in table units (10 cm)
const UP = new THREE.Vector3(0, 1, 0);

export class Wind {
  private flyers = new Map<Card3D, Flyer>();
  private off: (() => void) | null = null;
  private nextGust = 2.2;
  private gust = { dir: new THREE.Vector3(1, 0, 0), strength: 0, t: 0 };
  private clock = 0;
  private n = new THREE.Vector3();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(private o: WindOpts) {}

  start() {
    if (!this.off) this.off = this.o.stage.onFrame((dt) => this.step(Math.min(dt, 1 / 30)));
  }

  /** Stops the wind; cards still in the air drop flat where they are. */
  stop() {
    this.off?.();
    this.off = null;
    for (const f of this.flyers.values()) {
      gsap.killTweensOf(f.c.obj.position);
      gsap.killTweensOf(f.c.obj.rotation);
      f.c.obj.position.y = REST_Y;
      f.c.obj.rotation.x = 0;
      f.c.obj.rotation.z = this.faceUp(f.c) ? 0 : Math.PI;
      f.c.bend.set(0, 0);
    }
    this.flyers.clear();
  }

  isFlying(c: Card3D) {
    return this.flyers.has(c);
  }

  /** The visible table on the felt plane (with a margin): beyond it a card is lost. */
  private bounds() {
    const s = this.o.stage;
    const a = s.viewToTable(-0.12, 0.5);
    const b = s.viewToTable(1.12, 0.5);
    const top = s.viewToTable(0.5, -0.15);
    const bottom = s.viewToTable(0.5, 1.12);
    return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(top.z, bottom.z), z1: Math.max(top.z, bottom.z) };
  }

  private faceUp(c: Card3D) {
    this.n.copy(UP).applyQuaternion(c.obj.quaternion);
    return this.n.y >= 0;
  }

  private startGust() {
    const ang = Math.random() * Math.PI * 2;
    // mostly across the screen, a little toward or away from the player
    this.gust.dir.set(Math.cos(ang), 0, Math.sin(ang) * 0.45).normalize();
    this.gust.strength = 0.65 + Math.random() * 0.35;
    this.gust.t = 0;
    this.o.onGust?.(this.gust.strength);
    const pool = this.o.cards().filter((c) => !this.flyers.has(c) && !this.o.busy(c));
    const count = Math.min(pool.length, 1 + Math.floor(Math.random() * 3));
    for (let k = 0; k < count; k++) {
      const c = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      gsap.delayedCall(k * 0.18 + Math.random() * 0.2, () => this.lift(c, false));
    }
    // now and then the gust brings a card in from off-screen, upwind
    if (this.o.spawn && Math.random() < 0.45) {
      const c = this.o.spawn();
      if (c) {
        const b = this.bounds();
        const d = this.gust.dir;
        const cx = (b.x0 + b.x1) / 2;
        const cz = (b.z0 + b.z1) / 2;
        const hx = (b.x1 - b.x0) / 2;
        const hz = (b.z1 - b.z0) / 2;
        c.obj.position.set(cx - d.x * hx * 0.98, 1.1 + Math.random() * 0.6, cz - d.z * hz * 0.6 + (Math.random() - 0.5) * hz * 0.5);
        c.obj.rotation.set(Math.random() * 2, Math.random() * Math.PI * 2, Math.random() * 2);
        gsap.delayedCall(0.25, () => this.lift(c, true));
      }
    }
  }

  private lift(c: Card3D, fromOutside: boolean) {
    if (!this.off || this.flyers.has(c)) return;
    if (!fromOutside && this.o.busy(c)) return;
    const s = this.gust.strength;
    const d = this.gust.dir;
    const speed = (fromOutside ? 3.2 : 2.2) + Math.random() * 1.4;
    const v = new THREE.Vector3(d.x * speed * s, fromOutside ? 0.4 : 1.7 + Math.random() * 1.1 * s, d.z * speed * s);
    // tumble about the axis across the wind, plus a spin about the card's own centre
    const w = new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 7), (Math.random() - 0.5) * 7, (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 6));
    gsap.killTweensOf(c.obj.position);
    gsap.killTweensOf(c.obj.rotation);
    this.flyers.set(c, { c, v, w, t: 0, phase: Math.random() * 10, bounces: 0, fromOutside });
  }

  private step(dt: number) {
    this.clock += dt;
    this.nextGust -= dt;
    if (this.nextGust <= 0) {
      this.startGust();
      this.nextGust = 3.6 + Math.random() * 4.4;
    }
    this.gust.t += dt;
    // envelope: rises in 0.3 s, dies away over ~2 s
    const gt = this.gust.t;
    const env = gt < 0.3 ? gt / 0.3 : Math.exp(-(gt - 0.3) * 1.3);
    const b = this.flyers.size ? this.bounds() : null;
    for (const f of [...this.flyers.values()]) {
      const c = f.c;
      const p = c.obj.position;
      f.t += dt;
      const ph = f.phase;
      // the wind at the card: the gust plus a turbulent swirl
      const W = 3.4 * this.gust.strength * env;
      const tx = Math.sin(this.clock * 3.1 + ph) * 0.7 + Math.sin(this.clock * 7.3 + ph * 2) * 0.25;
      const tz = Math.cos(this.clock * 2.3 + ph) * 0.5;
      const wx = this.gust.dir.x * W + tx * env;
      const wz = this.gust.dir.z * W + tz * env;
      // the card's normal: flat cards catch the air, edge-on cards cut through it
      this.n.copy(UP).applyQuaternion(c.obj.quaternion);
      const flat = Math.abs(this.n.y);
      const drag = 0.9 + flat * 1.5;
      f.v.x += (wx - f.v.x) * drag * dt;
      f.v.z += (wz - f.v.z) * drag * dt;
      const horiz = Math.hypot(f.v.x, f.v.z);
      const lift = Math.min(G * 0.85, flat * horiz * 1.05);
      f.v.y += (-G + lift + Math.sin(f.t * 9 + ph) * 1.4) * dt;
      f.v.y *= 1 - (0.35 + flat * 0.9) * dt;
      p.addScaledVector(f.v, dt);
      // tumbling, slowed by the air
      this.e.set(c.obj.rotation.x + f.w.x * dt, c.obj.rotation.y + f.w.y * dt, c.obj.rotation.z + f.w.z * dt, 'YXZ');
      c.obj.rotation.copy(this.e);
      f.w.multiplyScalar(1 - 0.55 * dt);
      // the paper flutters with the speed of the air over it
      const fl = Math.min(1, (horiz + Math.abs(f.v.y)) / 3);
      c.bend.set(Math.sin(f.t * 15 + ph) * 0.5 * fl, Math.cos(f.t * 11 + ph) * 0.22 * fl);

      if (b && (p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1) && !(f.fromOutside && f.t < 1.6)) {
        this.flyers.delete(c);
        this.o.onLost?.(c);
        continue;
      }
      if (p.y <= REST_Y + 0.004 && f.v.y < 0) {
        const impact = Math.hypot(f.v.x, f.v.y, f.v.z);
        this.o.onTouch?.(impact);
        if (impact > 1.6 && f.bounces < 1) {
          f.bounces++;
          p.y = REST_Y + 0.005;
          f.v.y = -f.v.y * 0.25;
          f.v.x *= 0.55;
          f.v.z *= 0.55;
          f.w.multiplyScalar(0.4);
          continue;
        }
        this.flyers.delete(c);
        this.settle(c, f);
      }
    }
  }

  /** Lands flat: face up or down as it came down, then slides to a stop with friction. */
  private settle(c: Card3D, f: Flyer) {
    const up = this.faceUp(c);
    const r = c.obj.rotation;
    // the shortest way down to flat: angles folded into (-π, π]
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    r.x = wrap(r.x);
    r.z = wrap(r.z);
    const zEnd = up ? 0 : r.z >= 0 ? Math.PI : -Math.PI;
    const yaw = r.y;
    let ex = c.obj.position.x + f.v.x * 0.16;
    let ez = c.obj.position.z + f.v.z * 0.16;
    const keep = this.o.avoid?.();
    if (keep) {
      const dx = ex - keep.x;
      const dz = ez - keep.z;
      const d = Math.hypot(dx, dz);
      if (d < keep.r) {
        const k = d > 1e-3 ? keep.r / d : 1;
        ex = keep.x + (d > 1e-3 ? dx * k : keep.r);
        ez = keep.z + (d > 1e-3 ? dz * k : 0);
      }
    }
    const tl = gsap.timeline({ onComplete: () => this.o.onSettle?.(c, f.fromOutside) });
    tl.to(c.obj.position, { x: ex, z: ez, y: REST_Y, duration: 0.45, ease: 'power2.out' }, 0);
    tl.to(r, { x: 0, z: zEnd, y: yaw + f.w.y * 0.05, duration: 0.22, ease: 'power2.out' }, 0);
    tl.to(c.bend, { x: 0, y: 0, duration: 0.2 }, 0);
  }
}
