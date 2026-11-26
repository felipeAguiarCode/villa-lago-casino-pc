import gsap from 'gsap';
import * as THREE from 'three';
import type { Sfx, SfxName } from '../audio/sfx';
import { CARD_H, CARD_W, REST_Y, type Card3D } from './cardMesh';

/**
 * The cardistry show's engine and its bold aerial flourishes (src/table/shuffle.ts has the table
 * shuffles and the routines). There are no hands: the cards move as if by an expert's telekinesis,
 * but with card physics — arcs under one gravity, spin that slows in the air, flutter, paper that
 * bows and snaps flat on landing, piles that are a little messy until the square-up taps.
 *
 * Every tween goes through `tw` (and every simulation through `drive`, a tween too), so the whole
 * show follows `show.rate` and the tap-to-speed-up. Each move has its tuning constants at its top.
 */

export type V3 = THREE.Vector3;
/** A point on the table: (x, z), at height y. */
export const V = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
export const all = (ps: unknown[]) => Promise.all(ps).then(() => undefined);
export const rnd = (a: number) => (Math.random() - 0.5) * a;
const { clamp, lerp } = THREE.MathUtils;
const TAU = Math.PI * 2;
/** Smoothstep. */
const sm = (k: number) => k * k * (3 - 2 * k);

/** Height of one card in a stack. */
export const STEP = 0.0026;
const W = CARD_W;
const L = CARD_H;
/**
 * The show's gravity, in table units (10 cm) per second². About a sixth of the real one: the arcs
 * read on screen like slow motion, and a card that flutters falls slower still.
 */
export const G = 16;
/** No card flies above this (the HUD, the title's name). */
export const Y_MAX = 2.4;

// ================================================================= timing

/**
 * Every tween of the show goes through here, so the show can run faster than the rest of the game
 * (and speed up on a tap) without touching the global timeline — changing the global time scale
 * mid-game left the next animation scheduled in the future.
 */
export const show = { rate: 1, live: new Set<gsap.core.Tween>() };
export const tw = (target: object, vars: gsap.TweenVars) => {
  const tween = gsap.to(target, vars);
  tween.timeScale(show.rate);
  show.live.add(tween);
  return tween.then(() => {
    show.live.delete(tween);
  });
};
export const wait = (s: number) => tw({ t: 0 }, { t: 1, duration: s, ease: 'none' });
/** A small per-frame simulation: fn(k) with k from 0 to 1 over `dur` seconds of show time. */
export const drive = (dur: number, fn: (k: number) => void, delay = 0) => {
  const st = { k: 0 };
  return tw(st, { k: 1, duration: dur, delay, ease: 'none', onUpdate: () => fn(st.k) }).then(() => fn(1));
};
/** Delay of the i-th card of a ripple, with a little human unevenness. */
export const stag = (i: number, step: number, jit = 0.6) => Math.max(0, (i + rnd(jit)) * step);
/** Where a card lands on a pile that is not squared yet. */
export const messy = (a = 0.014) => ({ x: rnd(a), z: rnd(a), yaw: rnd(a * 2.4) });

// ================================================================= sound

/**
 * The show's sounds: delays follow the show's speed, and at most `SOUNDS_PER_TENTH` sounds start in
 * any tenth of a second. A card tick (the riffle's buzz is a burst of them) only takes a slot while
 * one is left over, so the buzz never drowns a sample.
 *
 * The Kenney clips open with a little silence (`ONSET`, measured): a sound asked for `delay` seconds
 * ahead starts that much earlier, so a landing or a tap is heard on the impact.
 */
const SOUNDS_PER_TENTH = 3;
const ONSET: Partial<Record<SfxName, number>> = { place: 0.2, slide: 0.13, shove: 0.16, fan: 0.16, shuffle: 0.2 };
export class ShowSfx {
  private starts: number[] = [];
  constructor(private sfx: Sfx) {}

  /**
   * The two 'fan' clips alternate, and the second opens with ¾ s of silence: a silent one is
   * played first when it is due, so the show always gets the prompt one.
   */
  private promptFan() {
    const s = this.sfx as unknown as { lastPick?: Map<string, number>; buffers?: Map<string, unknown[]> };
    if (s.buffers?.get('fan')?.length !== 2 || !s.lastPick) return;
    for (let k = 0; k < 2 && s.lastPick.get('fan') !== 1; k++) this.sfx.play('fan', { vol: 0 });
  }

  /** True (and booked) if a sound starting `delay` s from now keeps every 100 ms window under `limit`. */
  private admit(delay: number, limit: number) {
    const now = performance.now() / 1000;
    const at = now + delay;
    this.starts = this.starts.filter((s) => s > now - 0.2);
    const near = this.starts.filter((s) => Math.abs(s - at) < 0.1);
    // every window [w, w + 0.1) that holds `at` starts at `at` - 0.1 or at one of its neighbours
    for (const w of [at - 0.0999, ...near.filter((s) => s <= at)]) {
      let k = 1;
      for (const s of near) if (s >= w && s < w + 0.1) k++;
      if (k > limit) return false;
    }
    this.starts.push(at);
    return true;
  }

  /** Plays `name` so that it is heard `delay` seconds of show time from now (as near as it can). */
  play(name: SfxName, o: { vol?: number; rate?: number; delay?: number } = {}) {
    const delay = Math.max(0, (o.delay ?? 0) / show.rate - (ONSET[name] ?? 0) / (o.rate ?? 1));
    if (!this.admit(delay, SOUNDS_PER_TENTH)) return;
    if (name === 'fan') this.promptFan();
    this.sfx.play(name, { ...o, delay });
  }

  /** One card's click. */
  tick(vol = 0.06, pitch = 1) {
    if (this.admit(0, SOUNDS_PER_TENTH - 1)) this.sfx.tick(vol, pitch);
  }

  whoosh(dur = 0.5) {
    if (this.admit(0, SOUNDS_PER_TENTH)) this.sfx.whoosh(dur / show.rate);
  }
}

export interface Ctx {
  /** The middle of the shuffle area: every move leaves the deck here. */
  C: V3;
  sfx: ShowSfx;
}
/** A move takes the deck (bottom to top) and returns it in its new order, stacked at C. */
export type Move = (order: Card3D[], ctx: Ctx) => Promise<Card3D[]>;

// ================================================================= card physics

/** +1 when the card's face is up, -1 when down: the sign of a bend that lifts its edges. */
const edgesUp = (c: Card3D) => (Math.cos(c.obj.rotation.z) * Math.cos(c.obj.rotation.x) >= 0 ? 1 : -1);

/** The paper springs flat: a quick release, a small flex past flat, then still. */
export async function snapFlat(c: Card3D, delay = 0, flex = 0.22) {
  if (delay > 0) await wait(delay);
  const a = Math.max(Math.abs(c.bend.x), Math.abs(c.bend.y));
  if (a < 0.03) {
    c.bend.set(0, 0);
    return;
  }
  const s = edgesUp(c) * flex;
  await tw(c.bend, { x: s * Math.abs(c.bend.x), y: s * Math.abs(c.bend.y), duration: 0.035, ease: 'power2.in' });
  await tw(c.bend, { x: 0, y: 0, duration: 0.07, ease: 'sine.out' });
}

/** Wraps the angles back near zero (spins add whole turns) without changing the pose. */
export function tidy(cards: Card3D[]) {
  const w = (a: number) => a - Math.round(a / TAU) * TAU;
  for (const c of cards) {
    const r = c.obj.rotation;
    r.set(w(r.x), w(r.y), w(r.z - Math.PI) + Math.PI);
  }
}

/** Moves a card to (x, z) along a little arc and lands it at height y (it drops under gravity). */
export function hop(c: Card3D, to: V3, y: number, dur: number, delay = 0, h = 0.18, ease = 'power2.inOut') {
  return all([
    tw(c.obj.position, { x: to.x, z: to.z, duration: dur, delay, ease }),
    tw(c.obj.position, { y: y + h, duration: dur * 0.45, delay, ease: 'sine.out' }).then(() => tw(c.obj.position, { y, duration: dur * 0.55, ease: 'power2.in' })),
  ]);
}

/** Turns a card over in place: it rolls up on its edge, curls and twists a little, slaps down flat. */
export function turn(c: Card3D, z: number, dur: number, delay = 0, lift = 0.3) {
  const d = dur * 0.82;
  return all([
    tw(c.obj.rotation, { z, duration: d, delay, ease: 'power2.inOut' }),
    // the twist as it rolls: the light runs over the card
    tw(c.obj.rotation, { x: 0.12, duration: d / 2, delay, yoyo: true, repeat: 1, ease: 'sine.inOut' }),
    tw(c.obj.position, { y: `+=${lift}`, duration: d * 0.45, delay, ease: 'sine.out' }).then(() => tw(c.obj.position, { y: `-=${lift}`, duration: d * 0.55, ease: 'power2.in' })),
    tw(c.bend, { x: 1.0, duration: d * 0.45, delay, ease: 'sine.out' })
      .then(() => tw(c.bend, { x: 0.25, duration: d * 0.55, ease: 'power1.in' }))
      .then(() => snapFlat(c)),
  ]);
}

/** A ripple of small tilts runs along the cards (in the given order): the light catches each in turn. */
export function glint(cards: Card3D[], o: { tilt?: number; dur?: number; gap?: number; delay?: number } = {}) {
  const tilt = o.tilt ?? 0.22;
  const dur = o.dur ?? 0.18;
  const gap = o.gap ?? 0.005;
  return all(cards.map((c, i) => tw(c.obj.rotation, { x: `+=${tilt}`, duration: dur / 2, delay: (o.delay ?? 0) + i * gap, yoyo: true, repeat: 1, ease: 'sine.inOut' })));
}

export interface FlyOpts {
  /** Landing point (y included). */
  to: V3;
  /** Height of the arc over the straight line between the ends: with gravity it sets the flight time. */
  h?: number;
  /** Flight time (when `h` is not given, the arc follows from gravity). */
  dur?: number;
  /** Let go from rest: a free fall, no upward kick. */
  drop?: boolean;
  /** Gravity scale (a fluttering card falls slower). */
  g?: number;
  delay?: number;
  /** Final angles (default: the current ones). */
  rot?: { x?: number; y?: number; z?: number };
  /** Extra radians on the way: spin about the vertical (slows a little), roll about the long axis, tumble end over end. */
  spin?: number;
  roll?: number;
  tumble?: number;
  /** A tilt that peaks mid-flight, as a sprung card noses over. */
  lean?: number;
  /** Flutter (radians): grows on the way down. */
  flutter?: number;
  /** The paper's bow mid-flight (bend.y); it lands still bowed a little and snaps flat. */
  bow?: number;
  /** Sideways bulge at mid-flight (a spray). */
  drift?: { x?: number; z?: number };
  /** Snap flat on landing (default true). */
  snap?: boolean;
  /** Take-off, with the flight time (show seconds): schedule the landing's sound from here. */
  onStart?: (flight: number) => void;
  onLand?: () => void;
}

/** A card in free flight: a parabola under gravity (exact landing), with spin, flutter and bow. */
export function fly(c: Card3D, o: FlyOpts): Promise<void> {
  const g = G * (o.g ?? 1);
  const pos = c.obj.position;
  const rot = c.obj.rotation;
  let T: number;
  let h: number;
  if (o.drop) {
    const fall = Math.max(0.01, pos.y - o.to.y);
    T = Math.sqrt((2 * fall) / g);
    h = fall / 4;
  } else if (o.h !== undefined) {
    h = o.h;
    T = o.dur ?? Math.sqrt((8 * h) / g);
  } else {
    T = o.dur ?? 0.4;
    h = (g * T * T) / 8;
  }
  const p0 = new THREE.Vector3();
  const r0 = new THREE.Vector3();
  const r1 = new THREE.Vector3();
  const b0 = new THREE.Vector2();
  const fq = [2 + Math.random() * 1.5, 1.4 + Math.random() * 1.2, 2.6 + Math.random() * 1.6];
  const ph = [Math.random() * TAU, Math.random() * TAU, Math.random() * TAU];
  const fl = o.flutter ?? 0;
  const bow = o.bow ?? 0;
  const dx = o.drift?.x ?? 0;
  const dz = o.drift?.z ?? 0;
  const lean = o.lean ?? 0;
  let ready = false;
  const init = () => {
    ready = true;
    p0.copy(pos);
    r0.set(rot.x, rot.y, rot.z);
    b0.copy(c.bend);
    r1.set((o.rot?.x ?? r0.x) + (o.tumble ?? 0), (o.rot?.y ?? r0.y) + (o.spin ?? 0), (o.rot?.z ?? r0.z) + (o.roll ?? 0));
    // keep the top of the arc under the ceiling
    const dy = o.to.y - p0.y;
    for (let i = 0; i < 3 && h > 1e-4; i++) {
      const km = clamp(0.5 + dy / (8 * h), 0, 1);
      const peak = p0.y + dy * km + 4 * h * km * (1 - km);
      if (peak <= Y_MAX) break;
      h = Math.max(0, h - (peak - Y_MAX));
    }
    o.onStart?.(T);
  };
  const st = { k: 0 };
  return tw(st, {
    k: 1,
    duration: T,
    delay: o.delay ?? 0,
    ease: 'none',
    onStart: () => {
      if (!ready) init();
    },
    onUpdate: () => {
      if (!ready) init();
      const k = st.k;
      const t = k * T;
      const env = Math.sin(Math.PI * k);
      const e = sm(k);
      const fe = fl * env * (0.45 + 0.55 * k);
      pos.set(lerp(p0.x, o.to.x, k) + dx * env, lerp(p0.y, o.to.y, k) + 4 * h * k * (1 - k), lerp(p0.z, o.to.z, k) + dz * env);
      rot.set(
        lerp(r0.x, r1.x, e) + lean * env + fe * Math.sin(TAU * fq[0] * t + ph[0]),
        r0.y + (r1.y - r0.y) * k * (1.3 - 0.3 * k) + fe * 0.5 * Math.sin(TAU * fq[1] * t + ph[1]),
        lerp(r0.z, r1.z, e) + fe * 0.7 * Math.sin(TAU * fq[2] * t + ph[2]),
      );
      c.bend.set(b0.x * (1 - e) + fe * 1.2 * Math.sin(TAU * fq[2] * 1.3 * t + ph[0]), b0.y * (1 - e) + bow * Math.sin(Math.PI * 0.85 * k));
    },
  }).then(async () => {
    if (!ready) init();
    pos.copy(o.to);
    rot.set(r1.x, r1.y, r1.z);
    o.onLand?.();
    if (o.snap !== false) await snapFlat(c);
  });
}

/**
 * The final square-up: the deck rocks up on an end and taps the table, then on a side, and each tap
 * squares it a little more (the top card catches the light as it rocks). Ends exact at C.
 */
export async function squareUp(order: Card3D[], { C, sfx }: Ctx) {
  const TILT = 0.13; // how far the deck rocks
  const UP = 0.055; // rocking up
  const DOWN = 0.045; // the tap
  const VOL = 0.22; // a soft tap
  const from = order.map((c) => c.obj.position.clone());
  const yaw0 = order.map((c) => c.obj.rotation.y);
  // tap 1: the far end rises, the near end taps: the ends square up
  sfx.play('place', { vol: VOL, rate: 1.55, delay: UP + DOWN });
  await all(
    order.map((c, i) =>
      all([
        tw(c.obj.rotation, { x: TILT, duration: UP, ease: 'power2.out' }),
        tw(c.obj.rotation, { x: 0, duration: DOWN, delay: UP, ease: 'power2.in' }),
        tw(c.obj.position, { y: REST_Y + i * STEP + (L / 2) * Math.sin(TILT), duration: UP, ease: 'power2.out' }),
        tw(c.obj.position, { y: REST_Y + i * STEP, z: C.z, x: lerp(from[i].x, C.x, 0.6), duration: DOWN, delay: UP, ease: 'power2.in' }),
        tw(c.obj.rotation, { y: yaw0[i] * 0.4, duration: UP + DOWN, ease: 'power1.inOut' }),
      ]),
    ),
  );
  // tap 2: on a long side: the sides square up
  sfx.play('place', { vol: VOL * 0.8, rate: 1.7, delay: UP + DOWN });
  await all(
    order.map((c, i) =>
      all([
        tw(c.obj.rotation, { z: Math.PI + TILT * 0.8, duration: UP, ease: 'power2.out' }),
        tw(c.obj.rotation, { z: Math.PI, duration: DOWN, delay: UP, ease: 'power2.in' }),
        tw(c.obj.position, { y: REST_Y + i * STEP + (W / 2) * Math.sin(TILT * 0.8), duration: UP, ease: 'power2.out' }),
        tw(c.obj.position, { y: REST_Y + i * STEP, x: C.x, duration: DOWN, delay: UP, ease: 'power2.in' }),
        tw(c.obj.rotation, { y: 0, duration: UP + DOWN, ease: 'power2.inOut' }),
      ]),
    ),
  );
  order.forEach((c, i) => {
    c.obj.position.set(C.x, REST_Y + i * STEP, C.z);
    c.obj.rotation.set(0, 0, Math.PI);
    c.bend.set(0, 0);
  });
  return order;
}

// ================================================================= rigid packets

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const FACE_DOWN = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI, 'YXZ'));
const tmpV = new THREE.Vector3();

/** A packet moved as one block: a face-down stack around its centre, optionally beveled (`lean`). */
class Rig {
  readonly pos = new THREE.Vector3();
  readonly q = new THREE.Quaternion();
  /** 0..1: how much each card is shifted over the one below it (a packet in motion leans). */
  lean = 0;
  private mid: number;

  constructor(
    readonly cards: Card3D[],
    private bevel = new THREE.Vector3(0.0024, 0, 0.0016),
  ) {
    this.mid = (cards.length - 1) / 2;
  }

  apply() {
    this.cards.forEach((c, i) => {
      const k = i - this.mid;
      tmpV.set(this.bevel.x * k * this.lean, k * STEP, this.bevel.z * k * this.lean).applyQuaternion(this.q).add(this.pos);
      c.obj.position.copy(tmpV);
      c.obj.quaternion.copy(this.q).multiply(FACE_DOWN);
    });
  }

  /** Lays the packet flat and square, its bottom card at height `y`, with exact angles. */
  settle(x: number, z: number, y: number) {
    this.cards.forEach((c, i) => {
      c.obj.position.set(x, y + i * STEP, z);
      c.obj.rotation.set(0, 0, Math.PI);
    });
  }
}

// ================================================================= bold moves

/** Card fountain: the cards squirt up out of a leaning deck one by one, a spray that rains down into a neat pile. */
export async function fountain(order: Card3D[], { C, sfx }: Ctx) {
  const SRC = V(C.x - 0.85, C.z + 0.12); // where the deck shoots from
  const LIFT = 0.3; // height of the shooting deck
  const AIM = 0.4; // the deck leans toward the pile (radians)
  const H = 1.1; // arc height over the line source–pile (with G it sets the flight: ≈0.74 s)
  const H_VAR = 0.25; // per-card variation of that height
  const GAP = 0.026; // time between two cards
  const SPRAY = 0.55; // sideways spread of the stream at its top
  const FLIP = 0.3; // share of the cards that turn a full somersault on the way
  // the deck hops aside and leans toward the pile, squeezed (the anticipation)
  sfx.play('slide', { vol: 0.4 });
  await all(
    order.map((c, i) =>
      all([
        hop(c, SRC, LIFT + i * STEP, 0.26, 0, 0.1),
        tw(c.obj.rotation, { z: Math.PI - AIM, y: 0, duration: 0.26, ease: 'power2.inOut' }),
        tw(c.bend, { y: 0.55, duration: 0.26, ease: 'power2.in' }),
      ]),
    ),
  );
  // the top card leaves first and lands at the bottom of the new pile
  const src = [...order].reverse();
  sfx.whoosh(GAP * order.length + 0.6);
  sfx.play('fan', { vol: 0.55, rate: 0.85 });
  await all(
    src.map((c, j) => {
      const m = messy(0.028);
      return fly(c, {
        to: V(C.x + m.x, C.z + m.z, REST_Y + j * STEP),
        h: H + rnd(H_VAR),
        delay: stag(j, GAP, 0.5),
        rot: { x: 0, y: m.yaw, z: Math.PI },
        roll: Math.random() < FLIP ? (Math.random() < 0.5 ? TAU : -TAU) : 0,
        spin: Math.random() < 0.2 ? (Math.random() < 0.5 ? TAU : -TAU) : 0,
        flutter: 0.2,
        bow: 0.45,
        drift: { z: rnd(SPRAY), x: rnd(0.12) },
        onStart: (flight) => {
          sfx.tick(0.045, 1.15);
          if (j % 6 === 5) sfx.play('place', { vol: 0.22, rate: 1.35, delay: flight });
        },
        onLand: j % 6 === 5 ? undefined : () => sfx.tick(0.04, 0.55),
      });
    }),
  );
  return src;
}

/** Aerial throw spin: the top cards are thrown spinning flat like boomerangs, loop out and come back to the deck. */
export async function boomerang(order: Card3D[], { C, sfx }: Ctx) {
  const THROWS = 3; // cards thrown
  const OUT = 2.1; // how far a card flies out
  const WIDE = 0.9; // width of its loop
  const RISE = 0.55; // height it climbs to at the far end
  const T_FLY = 1.15; // out and back
  const GAP = 0.38; // between two throws (keep (THROWS - 1) * GAP < T_FLY)
  const TURNS = 6; // spins on the way (whole turns: it comes back square)
  const BANK = 0.42; // tilt into the curve
  const COCK = 0.07; // the card slides back before it leaves (anticipation)
  // throw directions (0 = right, π/2 = toward the player), which side the loop opens, and its length
  const DIRS = [
    { a: 0.22, side: 1, out: 1 },
    { a: Math.PI - 0.22, side: -1, out: 1 },
    { a: Math.PI / 2, side: 1, out: 0.62 },
  ];
  const n = order.length;
  const thrown = order.slice(n - THROWS).reverse(); // the top card first
  const keep = order.slice(0, n - THROWS);
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  await all(
    thrown.map(async (c, k) => {
      const dir = DIRS[k % DIRS.length];
      const ca = Math.cos(dir.a);
      const sa = Math.sin(dir.a);
      const out = OUT * dir.out;
      const axis = new THREE.Vector3(ca, 0, sa);
      if (k) await wait(k * GAP);
      sfx.play('slide', { vol: 0.45, rate: 1.35 });
      await tw(c.obj.position, { x: `-=${ca * COCK}`, z: `-=${sa * COCK}`, duration: 0.08, ease: 'power2.out' });
      sfx.whoosh(T_FLY * 0.8);
      sfx.play('place', { vol: 0.5, rate: 1.2, delay: T_FLY });
      const start = c.obj.position.clone();
      const yEnd = REST_Y + (n - THROWS + k) * STEP;
      const y0 = c.obj.rotation.y;
      await drive(T_FLY, (kk) => {
        const s = kk + (0.3 * Math.sin(TAU * kk)) / TAU; // fast out, slow at the far end, fast home
        const u = (out * (1 - Math.cos(TAU * s))) / 2;
        const w = dir.side * (WIDE / 2) * Math.sin(TAU * s);
        const bx = lerp(start.x, C.x, kk);
        const bz = lerp(start.z, C.z, kk);
        c.obj.position.set(bx + u * ca - w * sa, lerp(start.y, yEnd, kk) + RISE * Math.pow(Math.sin(Math.PI * s), 1.3), bz + u * sa + w * ca);
        qa.setFromAxisAngle(axis, dir.side * BANK * Math.sin(Math.PI * s));
        qb.setFromAxisAngle(Y_AXIS, (1 - kk) * y0 + dir.side * TAU * TURNS * kk * (1.3 - 0.3 * kk));
        c.obj.quaternion.copy(qa).multiply(qb).multiply(FACE_DOWN);
        c.bend.x = 0.12 * Math.sin(TAU * 3 * kk);
      });
      c.obj.position.set(C.x, yEnd, C.z);
      c.obj.rotation.set(0, 0, Math.PI);
      c.bend.set(0, 0);
      // caught: the deck gives a little under it
      const deck = keep.concat(thrown.slice(0, k + 1));
      await all(deck.map((d, i) => tw(d.obj.position, { y: `-=${(0.005 * i) / deck.length}`, duration: 0.05, yoyo: true, repeat: 1, ease: 'sine.out' })));
    }),
  );
  return keep.concat(thrown);
}

/** Sybil cut cascade: the deck splits into packets that rise, circle round each other like a carousel and restack in a new order. */
export async function sybil(order: Card3D[], { C, sfx }: Ctx) {
  const K = 5; // packets
  const R = 0.62; // radius of the carousel
  const SQUASH = 0.72; // the carousel is flatter in depth
  const Y = 0.6; // mean height of the packets
  const STAIR = 0.12; // height step from packet to packet
  const BOB = 0.09; // packets bob up and down as they go round
  const TILT = 0.5; // packets lean out like petals (radians)
  const TURN = 2.3; // how far the carousel turns (radians)
  const T_RISE = 0.36; // a packet's rise
  const GAP_UP = 0.05; // between two packets rising
  const T_ORBIT = 0.85; // all of them in the air
  const T_LAND = 0.26; // a packet coming down
  const GAP_DOWN = 0.13; // between two landings
  const n = order.length;
  // cut: K packets of at least six cards
  const sizes = Array.from({ length: K }, () => 6);
  for (let left = n - 6 * K; left > 0; left--) sizes[Math.floor(Math.random() * K)]++;
  const packs: Card3D[][] = [];
  let at = 0;
  for (const s of sizes) {
    packs.push(order.slice(at, at + s));
    at += s;
  }
  const rigs = packs.map((p) => new Rig(p));
  const start: V3[] = [];
  at = 0;
  for (const s of sizes) {
    start.push(V(C.x, C.z, REST_Y + (at + (s - 1) / 2) * STEP));
    at += s;
  }
  // a new order, never the old one
  let perm = [...Array(K).keys()];
  while (perm.every((k, i) => k === i)) perm = perm.sort(() => Math.random() - 0.5);
  const land: V3[] = [];
  const rank: number[] = [];
  at = 0;
  perm.forEach((k, m) => {
    land[k] = V(C.x + rnd(0.02), C.z + rnd(0.02), REST_Y + (at + (sizes[k] - 1) / 2) * STEP);
    rank[k] = m;
    at += sizes[k];
  });
  const tUp = (k: number) => (K - 1 - k) * GAP_UP; // the top packet leaves first
  const tDown = (k: number) => T_RISE + (K - 1) * GAP_UP + T_ORBIT + rank[k] * GAP_DOWN;
  const total = T_RISE + (K - 1) * GAP_UP + T_ORBIT + (K - 1) * GAP_DOWN + T_LAND;
  const th0 = Math.random() * TAU;
  const twirl = packs.map(() => (Math.random() < 0.5 ? -TAU : TAU));
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const qTw = new THREE.Quaternion();
  const fp = new THREE.Vector3();
  const fq = new THREE.Quaternion();
  const ID = new THREE.Quaternion();
  const formation = (k: number, t: number) => {
    const u = clamp(t / (total - T_LAND), 0, 1);
    const th = th0 + (TAU * k) / K + TURN * sm(u);
    fp.set(C.x + R * Math.cos(th), Y + STAIR * (k - (K - 1) / 2) + BOB * Math.sin(TAU * 1.5 * u + k * 1.3), C.z + R * Math.sin(th) * SQUASH);
    euler.set(TILT, Math.PI / 2 - th, 0);
    fq.setFromEuler(euler);
    qTw.setFromAxisAngle(Y_AXIS, twirl[k] * sm(clamp((t - tUp(k)) / (tDown(k) - tUp(k)), 0, 1)));
    fq.multiply(qTw);
  };
  const landed = new Set<number>();
  const falling = new Set<number>();
  sfx.play('shove', { vol: 0.45 });
  sfx.whoosh(total * 0.7);
  await drive(total, (kk) => {
    const t = kk * total;
    rigs.forEach((rig, k) => {
      const a = tUp(k);
      const b = tDown(k);
      if (t <= a) {
        rig.pos.copy(start[k]);
        rig.q.identity();
        rig.lean = 0;
      } else if (t < a + T_RISE) {
        const u = (t - a) / T_RISE;
        const e = 1 - (1 - u) * (1 - u);
        formation(k, t);
        rig.pos.lerpVectors(start[k], fp, e);
        rig.pos.y += 0.1 * Math.sin(Math.PI * u);
        rig.q.slerpQuaternions(ID, fq, e);
        rig.lean = e;
      } else if (t < b) {
        formation(k, t);
        rig.pos.copy(fp);
        rig.q.copy(fq);
        rig.lean = 1;
      } else if (t < b + T_LAND) {
        const u = (t - b) / T_LAND;
        if (!falling.has(k)) {
          falling.add(k);
          sfx.play('place', { vol: 0.42, rate: 1.1 + rank[k] * 0.05, delay: b + T_LAND - t });
        }
        const e = u * u;
        formation(k, t);
        rig.pos.lerpVectors(fp, land[k], e);
        rig.pos.y += 0.08 * Math.sin(Math.PI * u);
        rig.q.slerpQuaternions(fq, ID, sm(u));
        rig.lean = 1 - e;
        for (const c of rig.cards) c.bend.y = -0.25 * Math.sin(Math.PI * u);
      } else {
        if (!landed.has(k)) {
          landed.add(k);
          for (const c of rig.cards) c.bend.set(0, 0);
        }
        rig.pos.copy(land[k]);
        rig.q.identity();
        rig.lean = 0;
      }
      rig.apply();
    });
  });
  rigs.forEach((rig, k) => rig.settle(land[k].x, land[k].z, land[k].y - ((sizes[k] - 1) / 2) * STEP));
  return perm.flatMap((k) => packs[k]);
}

/**
 * Charlier cut, in the air: the deck turns its end to the viewer, the lower half drops open like a
 * jaw, swings up past the upper half (the X) and the mouth closes with the halves swapped.
 */
export function charlier(reps = 1): Move {
  return async (order, { C, sfx }) => {
    const Y0 = 0.8; // height of the deck while it is cut
    const PITCH = 0.5; // the deck lifts its near end toward the viewer (radians)
    const OPEN = 0.75; // how wide the mouth opens
    const CROSS = 0.8; // the lower jaw swings up past the upper one
    const BDROP = 0.6; // the upper half drops its free side meanwhile
    const T_UP = 0.3;
    const T_OPEN = 0.26;
    const T_CROSS = 0.32;
    const T_CLOSE = 0.24;
    const T_DOWN = 0.3;
    const n = order.length;
    const mid = (n - 1) / 2;
    const D = V(C.x, C.z + 0.1, Y0);
    const flat = V(C.x, C.z, REST_Y + mid * STEP);
    const Dp = new THREE.Vector3();
    // a packet posed in the deck's own plane: centre (cx, cy), roll a; the deck at D, pitched by phi
    const pose = (cards: Card3D[], cx: number, cy: number, a: number, at: V3, phi: number) => {
      const m = cards.length;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      cards.forEach((c, j) => {
        const off = (j - (m - 1) / 2) * STEP;
        const lx = cx - sa * off;
        const ly = cy + ca * off;
        c.obj.position.set(at.x + lx, at.y + ly * cp, at.z + ly * sp);
        c.obj.rotation.set(phi, 0, Math.PI + a);
      });
    };
    // rotate a point (x, y) about (px, py) by angle a
    const rotAbout = (x: number, y: number, px: number, py: number, a: number): [number, number] => [
      px + (x - px) * Math.cos(a) - (y - py) * Math.sin(a),
      py + (x - px) * Math.sin(a) + (y - py) * Math.cos(a),
    ];
    const cy = (from: number, to: number) => ((from + to - 1) / 2 - mid) * STEP; // centre of cards from..to-1
    // up: the deck rises and turns its end to the viewer
    sfx.play('slide', { vol: 0.35, rate: 1.2 });
    await drive(T_UP, (k) => {
      const e = sm(k);
      Dp.lerpVectors(flat, D, e);
      Dp.y += 0.08 * Math.sin(Math.PI * k);
      pose(order, 0, 0, 0, Dp, -PITCH * e);
    });
    let cur = order;
    for (let r = 0; r < reps; r++) {
      const h = Math.floor(n / 2) + Math.round(rnd(14));
      const A = cur.slice(0, h);
      const B = cur.slice(h);
      const phi = -PITCH;
      const cA = cy(0, h);
      const cB = cy(h, n);
      const hx = -W / 2;
      const hy = (h - 0.5 - mid) * STEP; // the hinge, between the halves
      pose(B, 0, cB, 0, D, phi);
      // open: the lower half drops away from the hinge
      sfx.play('slide', { vol: 0.3, rate: 1.4 });
      await drive(T_OPEN, (k) => {
        const a = -OPEN * sm(k);
        const [x, y] = rotAbout(0, cA, hx, hy, a);
        pose(A, x, y, a, D, phi);
      });
      // cross: the lower half pivots on its far edge and swings up past the upper half, which drops its free side
      const [ax1, ay1] = rotAbout(0, cA, hx, hy, -OPEN);
      const [rx, ry] = [ax1 + (W / 2) * Math.cos(-OPEN), ay1 + (W / 2) * Math.sin(-OPEN)];
      sfx.play('fan', { vol: 0.35, rate: 1.5 });
      await drive(T_CROSS, (k) => {
        const e = sm(k);
        const a = -CROSS * e;
        const [x, y] = rotAbout(ax1, ay1, rx, ry, a);
        pose(A, x, y, -OPEN + a, D, phi);
        const b = BDROP * e;
        const [bx, by] = rotAbout(0, cB, W / 2, cB, b);
        pose(B, bx, by, b, D, phi);
      });
      // close: both fall shut, the old lower half now on top
      const [ax2, ay2] = rotAbout(ax1, ay1, rx, ry, -CROSS);
      const [bx2, by2] = rotAbout(0, cB, W / 2, cB, BDROP);
      const nB = n - h;
      const fB = cy(0, nB);
      const fA = cy(nB, n);
      sfx.play('place', { vol: 0.4, rate: 1.3, delay: T_CLOSE });
      await drive(T_CLOSE, (k) => {
        const e = k * k;
        pose(A, lerp(ax2, 0, e), lerp(ay2, fA, e), lerp(-OPEN - CROSS, 0, e), D, phi);
        pose(B, lerp(bx2, 0, e), lerp(by2, fB, e), lerp(BDROP, 0, e), D, phi);
      });
      cur = B.concat(A);
      if (r < reps - 1) await wait(0.06);
    }
    // down: the deck turns flat and lands
    sfx.play('place', { vol: 0.3, rate: 1.1, delay: T_DOWN });
    await drive(T_DOWN, (k) => {
      const e = sm(k);
      Dp.lerpVectors(D, flat, e);
      Dp.y += 0.06 * Math.sin(Math.PI * k);
      pose(cur, 0, 0, 0, Dp, -PITCH * (1 - e));
    });
    cur.forEach((c, i) => {
      c.obj.position.set(C.x, REST_Y + i * STEP, C.z);
      c.obj.rotation.set(0, 0, Math.PI);
    });
    return cur;
  };
}

/** Arm spread: a long ribbon across the table, a turnover wave runs down it, and a scoop sweeps it up. */
export async function armSpread(order: Card3D[], { C, sfx }: Ctx) {
  const LEN = 4.0; // length of the spread
  const Z = 0.4; // the spread lies this far toward the player (off the title)
  const T_SLIDE = 0.24; // the deck slides to the left end
  const T_SPREAD = 0.42; // the push that spreads it
  const WAVE = 0.0105; // the turnover wave: delay from card to card
  const T_FLIP = 0.3; // one card's turnover
  const T_SCOOP = 0.62; // the scoop runs down the spread
  const T_PICK = 0.2; // a card's jump into the scoop
  const HAND = 0.22; // height of the scooped packet
  const FLOAT = 0.008; // the spread rides a hair above any loose card the title's breeze left on the felt
  const T_HOME = 0.36; // the packet comes back to the middle
  const n = order.length;
  const dx = LEN / (n - 1);
  const x0 = C.x - (LEN + W) / 2;
  const zS = C.z + Z;
  sfx.play('slide', { vol: 0.45 });
  await all(order.map((c, i) => all([hop(c, V(x0, zS), REST_Y + i * STEP, T_SLIDE, 0, 0.04), tw(c.obj.rotation, { x: 0, y: 0, duration: T_SLIDE })])));
  // one push: the top cards travel furthest, friction stops them
  sfx.play('fan', { vol: 0.75, rate: 0.95 });
  await all(
    order.map((c, i) =>
      all([
        tw(c.obj.position, { x: x0 + i * dx, y: REST_Y + FLOAT + i * 0.0016, duration: T_SPREAD, delay: stag(n - 1 - i, 0.0015), ease: 'power3.out' }),
        tw(c.obj.rotation, { y: rnd(0.04), duration: T_SPREAD, ease: 'power2.out' }),
      ]),
    ),
  );
  // the turnover wave: each card rolls over its right edge onto the next (the overlap reverses)
  sfx.play('fan', { vol: 0.5, rate: 1.25 });
  await all(
    order.map((c, i) => {
      const xr = x0 + i * dx + W / 2;
      const y0 = REST_Y + FLOAT + i * 0.0016;
      const y1 = REST_Y + FLOAT + (n - 1 - i) * 0.0016;
      const st = { f: 0 };
      return tw(st, {
        f: Math.PI,
        duration: T_FLIP,
        delay: stag(i, WAVE, 0.5),
        ease: 'power1.inOut',
        onStart: () => sfx.tick(0.05, 0.85),
        onUpdate: () => {
          const f = st.f;
          c.obj.position.x = xr - (W / 2) * Math.cos(f);
          c.obj.position.y = lerp(y0, y1, f / Math.PI) + (W / 2) * Math.sin(f);
          c.obj.rotation.z = Math.PI - f;
          c.bend.x = 0.55 * Math.sin(f);
        },
      }).then(() => snapFlat(c));
    }),
  );
  // the faces catch the light down the line
  await glint(order, { tilt: 0.24, dur: 0.16, gap: 0.003 });
  // the scoop: it runs down the spread, each card flips up into it, face down
  const from = order.map((c) => c.obj.position.clone());
  const xs = x0 + W;
  const xe = x0 + W + LEN;
  const picked = order.map(() => false);
  const total = T_SCOOP + T_PICK;
  sfx.play('shove', { vol: 0.5 });
  sfx.whoosh(total);
  await drive(total, (k) => {
    const t = k * total;
    const hx = lerp(xs, xe, Math.min(1, t / T_SCOOP));
    order.forEach((c, i) => {
      const t0 = (T_SCOOP * i) / (n - 1);
      if (t < t0) return;
      const u = Math.min(1, (t - t0) / T_PICK);
      const e = sm(u);
      c.obj.position.set(lerp(from[i].x, hx - (n - 1 - i) * 0.0012, e), lerp(from[i].y, HAND + i * STEP, e) + 0.12 * Math.sin(Math.PI * u), lerp(from[i].z, zS, e));
      c.obj.rotation.z = -Math.PI * e;
      c.bend.x = -0.5 * Math.sin(Math.PI * u);
      if (!picked[i]) {
        picked[i] = true;
        if (i % 3 === 0) sfx.tick(0.05, 0.7);
      }
    });
  });
  // home: the packet swoops back to the middle
  sfx.whoosh(T_HOME);
  sfx.play('place', { vol: 0.35, rate: 1.2, delay: T_HOME + 0.04 });
  await all(order.map((c, i) => all([hop(c, C, REST_Y + i * STEP, T_HOME, i * 0.0008, 0.22), tw(c.obj.rotation, { y: rnd(0.03), duration: T_HOME })])));
  return order;
}

/** Springs across the table: the deck squeezed in one "hand" shoots a high, fluttering arc into the other. */
export async function longSpring(order: Card3D[], { C, sfx }: Ctx) {
  const X = 1.65; // the two hands are 2X apart
  const Y = 0.32; // height of the hands
  const H = 0.95; // arc height over the line between them (with G: ≈0.69 s of flight)
  const GAP = 0.0095; // between two cards
  const SQUEEZE = 1.3; // bow of the squeezed deck
  const AIM = 0.25; // the shooting hand leans toward the catching one
  const CATCH = 0.3; // the catching hand leans into the stream
  const T_HOME = 0.32;
  const Ls = V(C.x - X, C.z + 0.15);
  const Rs = V(C.x + X, C.z + 0.15);
  // to the left hand, squeezed (anticipation)
  sfx.play('slide', { vol: 0.4 });
  await all(
    order.map((c, i) =>
      all([
        hop(c, Ls, Y + i * STEP, 0.26, 0, 0.12),
        tw(c.bend, { y: SQUEEZE, duration: 0.26, ease: 'power2.in' }),
        tw(c.obj.rotation, { z: Math.PI - AIM, y: 0, duration: 0.26 }),
      ]),
    ),
  );
  sfx.play('fan', { vol: 0.85, rate: 0.95 });
  sfx.whoosh(0.9);
  const next = [...order].reverse();
  await all(
    next.map((c, j) =>
      fly(c, {
        to: V(Rs.x + rnd(0.015), Rs.z + rnd(0.015), Y + j * STEP),
        h: H,
        delay: stag(j, GAP, 0.4),
        rot: { x: 0, y: rnd(0.04), z: Math.PI + CATCH },
        lean: 0.35,
        flutter: 0.16,
        bow: 0.4,
        onStart: j % 2 ? undefined : () => sfx.tick(0.04, 1.0),
        onLand: j % 3 ? undefined : () => sfx.tick(0.04, 0.6),
      }),
    ),
  );
  // the catching hand sets the deck down in the middle
  sfx.play('place', { vol: 0.4, delay: T_HOME });
  await all(next.map((c, i) => all([hop(c, C, REST_Y + i * STEP, T_HOME, i * 0.0008, 0.08), tw(c.obj.rotation, { x: 0, z: Math.PI, duration: T_HOME, ease: 'power2.inOut' })])));
  return next;
}

/** Tornado: the cards are sucked off a deck at the side into a swirling funnel, climb it and spiral down into a pile in the middle. */
export async function tornado(order: Card3D[], { C, sfx }: Ctx) {
  const SRC = V(C.x - 0.95, C.z + 0.3); // the deck the wind takes the cards from
  const R = 0.75; // radius of the funnel
  const SQUASH = 0.8; // the funnel is flatter in depth
  const TOP = 1.5; // the cards climb to about here
  const T_UP = 0.9; // climbing time of one card
  const T_DOWN = 0.52; // its spiral down
  const TURNS = 2; // whole turns from deck to pile (so each card lands square)
  const GAP = 0.02; // between two cards
  const BANK = 0.5; // the cards lean into the swirl
  const FLUTTER = 0.25;
  const n = order.length;
  await all(order.map((c, i) => all([hop(c, SRC, REST_Y + i * STEP, 0.22, 0, 0.06), tw(c.obj.rotation, { y: 0, duration: 0.22 })])));
  const src = [...order].reverse(); // the top card goes first and lands at the bottom of the pile
  const a0 = Math.atan2((SRC.z - C.z) / SQUASH, SRC.x - C.x);
  const r0 = Math.hypot(SRC.x - C.x, (SRC.z - C.z) / SQUASH);
  const total = T_UP + T_DOWN;
  sfx.whoosh(total + n * GAP);
  sfx.play('fan', { vol: 0.5, rate: 0.8 });
  await all(
    src.map((c, j) => {
      const y0 = REST_Y + (n - 1 - j) * STEP;
      const y1 = REST_Y + j * STEP;
      const top = TOP - j * 0.004 + rnd(0.12);
      const ph = Math.random() * TAU;
      const m = messy(0.025);
      let down = false;
      return drive(
        total,
        (k) => {
          const t = k * total;
          // the swirl speeds up as the funnel narrows (angular momentum)
          const th = a0 + TAU * TURNS * ((k + k * k * k) / 2);
          let r: number;
          let y: number;
          let bank: number;
          let fl: number;
          let mx = 0;
          if (t < T_UP) {
            const u = t / T_UP;
            r = R + (r0 - R) * (1 - u) * (1 - u);
            y = y0 + (top - y0) * (1 - (1 - u) * (1 - u));
            bank = BANK * sm(Math.min(1, u * 2));
            fl = 0;
          } else {
            const v = (t - T_UP) / T_DOWN;
            if (!down) {
              down = true;
              if (j % 7 === 6) sfx.play('place', { vol: 0.22, rate: 1.3, delay: total - t });
            }
            r = R * (1 - v * v);
            y = top - (top - y1) * v * v;
            bank = BANK * (1 - v * v);
            fl = FLUTTER * Math.sin(Math.PI * v);
            mx = v * v;
          }
          c.obj.position.set(C.x + r * Math.cos(th) + m.x * mx, y, C.z + r * Math.sin(th) * SQUASH + m.z * mx);
          c.obj.rotation.set(fl * Math.sin(TAU * 2.6 * t + ph), -(th - a0) + m.yaw * mx, Math.PI + bank + fl * 0.6 * Math.sin(TAU * 1.9 * t + ph));
          c.bend.y = 0.35 * Math.sin(Math.PI * k);
        },
        j * GAP,
      ).then(() => {
        c.obj.position.set(C.x + m.x, y1, C.z + m.z);
        c.obj.rotation.set(0, m.yaw, Math.PI);
        if (j % 7 !== 6) sfx.tick(0.04, 0.55);
        return snapFlat(c);
      });
    }),
  );
  return src;
}

/** Dribble from height: the deck rises high and lets its cards go one by one from the bottom; each flutters down onto the pile. */
export async function dribble(order: Card3D[], { C, sfx }: Ctx) {
  const H = 1.35; // height of the deck while it dribbles
  const TRAVEL = 0.6; // the deck drifts across as it lets go
  const TILT = 0.2; // the deck tips toward the light
  const GAP0 = 0.04; // time between drops at first…
  const GAP1 = 0.019; // …and at the end (the dribble quickens)
  const DRAG = 0.6; // a fluttering card falls slower than a stone (gravity scale)
  const FLUTTER = 0.3;
  const DRIFT = 0.1; // sideways wander while falling
  const T_LIFT = 0.32;
  const n = order.length;
  const A = V(C.x - TRAVEL / 2, C.z + 0.08);
  // up it goes: a hair too high, and settles (follow-through)
  sfx.play('slide', { vol: 0.35, rate: 0.9 });
  await all(
    order.map((c, i) =>
      all([
        tw(c.obj.position, { x: A.x, z: A.z, duration: T_LIFT, ease: 'power2.inOut' }),
        tw(c.obj.position, { y: H + i * STEP, duration: T_LIFT, ease: 'back.out(1.4)' }),
        tw(c.obj.rotation, { x: TILT, y: 0, duration: T_LIFT, ease: 'power2.inOut' }),
      ]),
    ),
  );
  const drops: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    drops.push(acc);
    acc += lerp(GAP0, GAP1, i / (n - 1)) * (0.7 + Math.random() * 0.6);
  }
  const T_DRIB = drops[n - 1];
  const g = G * DRAG;
  const Tf = Math.sqrt((2 * (H - REST_Y)) / g);
  const total = T_DRIB + Tf;
  const land = order.map(() => messy(0.03));
  const from = order.map(() => new THREE.Vector3());
  const ph = order.map(() => [Math.random() * TAU, Math.random() * TAU, rnd(2 * DRIFT), rnd(2 * DRIFT), rnd(0.5)]);
  const state = order.map(() => 0); // 0 in the deck, 1 falling, 2 down
  const deckX = (t: number) => lerp(A.x, A.x + TRAVEL, sm(Math.min(1, t / Math.max(0.01, T_DRIB))));
  sfx.play('fan', { vol: 0.35, rate: 0.75 });
  await drive(total, (k) => {
    const t = k * total;
    const hx = deckX(t);
    order.forEach((c, i) => {
      if (t < drops[i]) {
        c.obj.position.x = hx;
        return;
      }
      if (state[i] === 0) {
        state[i] = 1;
        from[i].set(deckX(drops[i]), H + i * STEP, A.z);
        if (i % 2 === 0) sfx.tick(0.035, 1.25);
        if (i % 6 === 5) sfx.play('place', { vol: 0.2, rate: 1.4, delay: Tf });
      }
      const u = Math.min(1, (t - drops[i]) / Tf);
      const tt = u * Tf;
      const p = ph[i];
      const env = Math.sin(Math.PI * u);
      const y1 = REST_Y + i * STEP;
      c.obj.position.set(lerp(from[i].x, C.x + land[i].x, u) + p[2] * env, from[i].y - (from[i].y - y1) * u * u, lerp(from[i].z, C.z + land[i].z, u) + p[3] * env);
      c.obj.rotation.set(
        lerp(TILT, 0, u) + FLUTTER * env * Math.sin(TAU * 2.4 * tt + p[0]),
        lerp(0, land[i].yaw, u) + p[4] * env,
        Math.PI + FLUTTER * 0.7 * env * Math.sin(TAU * 1.8 * tt + p[1]),
      );
      c.bend.y = 0.45 * env * Math.sin(TAU * 3.1 * tt + p[1]);
      if (u >= 1 && state[i] === 1) {
        state[i] = 2;
        if (i % 6 !== 5) sfx.tick(0.035, 0.55);
      }
    });
  });
  order.forEach((c, i) => {
    c.obj.position.set(C.x + land[i].x, REST_Y + i * STEP, C.z + land[i].z);
    c.obj.rotation.set(0, land[i].yaw, Math.PI);
    c.bend.set(0, 0);
  });
  return order;
}

/** Pirouette: the deck is tossed with a double turnover, lands up on a corner, spins on it like a top and falls flat. */
export async function pirouette(order: Card3D[], { C, sfx }: Ctx) {
  const T_TOSS = 0.55; // the toss (with G its arc is ≈0.6 high)
  const TILT = 1.0; // the deck stands on its corner at this angle (radians from flat)
  const TURNS = 2; // pirouettes on the corner (whole turns: it lands square)
  const T_SPIN = 1.05;
  const NOD = 0.07; // the wobble of a spinning top
  const n = order.length;
  const mid = ((n - 1) / 2) * STEP;
  const rig = new Rig(order);
  const centre0 = V(C.x, C.z, REST_Y + mid);
  // it spins on its near left corner (the deck sweeps toward the player, clear of the title)
  const d = new THREE.Vector3(W / 2, mid, -L / 2); // pivot corner → centre, in the deck's frame
  const axis = new THREE.Vector3(L / 2, 0, W / 2).normalize(); // tilting about it lifts the centre off the corner
  const pivot = V(C.x - W / 2, C.z + L / 2, REST_Y); // the corner on the felt (after whole turns the deck lands square at C)
  const qT = new THREE.Quaternion();
  const qS = new THREE.Quaternion();
  const qR = new THREE.Quaternion();
  const pose = (psi: number, tau: number) => {
    qT.setFromAxisAngle(axis, tau);
    qS.setFromAxisAngle(Y_AXIS, psi);
    rig.q.copy(qS).multiply(qT);
    rig.pos.copy(d).applyQuaternion(rig.q).add(pivot);
  };
  pose(0, TILT);
  const q2 = rig.q.clone();
  const p2 = rig.pos.clone();
  const h = (G * T_TOSS * T_TOSS) / 8;
  const ID = new THREE.Quaternion();
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  // the toss: up, turning over twice about its length, down onto a corner
  sfx.play('fan', { vol: 0.45, rate: 1.3 });
  sfx.whoosh(T_TOSS);
  sfx.play('place', { vol: 0.32, rate: 1.6, delay: T_TOSS });
  await drive(T_TOSS, (k) => {
    const e = sm(k);
    rig.pos.lerpVectors(centre0, p2, k);
    rig.pos.y += 4 * h * k * (1 - k);
    qR.setFromAxisAngle(Z_AXIS, TAU * e);
    rig.q.slerpQuaternions(ID, q2, e).multiply(qR);
    rig.lean = 0.6 * Math.sin(Math.PI * k);
    rig.apply();
  });
  sfx.play('place', { vol: 0.5, rate: 1.05, delay: T_SPIN });
  // the pirouette: the spin slows, the deck leans over further and falls flat
  let quarter = 0;
  await drive(T_SPIN, (k) => {
    const psi = TAU * TURNS * (1 - Math.pow(1 - k, 1.6));
    const tau = TILT * (1 - Math.pow(k, 2.5)) + NOD * Math.sin(TAU * 3 * k) * (1 - k);
    pose(psi, Math.max(0, tau));
    rig.lean = 0;
    rig.apply();
    // the corner scrapes the felt every quarter turn
    const q = Math.floor(psi / (Math.PI / 2));
    if (q > quarter && k < 0.97) {
      quarter = q;
      sfx.tick(0.05 + 0.03 * k, 0.5 + 0.3 * k);
    }
  });
  rig.settle(C.x, C.z, REST_Y);
  await all(order.map((c, i) => tw(c.bend, { y: -0.18 * (i / n), duration: 0.05, yoyo: true, repeat: 1, ease: 'sine.out' })));
  return order;
}

/** Fan to wheel to fan: a face-up fan opens all the way round into a wheel, spins, folds back into a fan and closes. */
export async function fanWheelFan(order: Card3D[], { C, sfx }: Ctx) {
  const R = 0.7; // pivot to card centre
  const FAN = 1.1; // half-angle of the fans (radians)
  const T_OPEN = 0.4;
  const T_WHEEL = 0.5; // the fan opens into a wheel
  const T_TURN = 1.0; // the wheel spins on and its lead cards sweep round to fold it into a fan again
  const T_CLOSE = 0.36;
  const n = order.length;
  const P = V(C.x, C.z + R); // the pivot: the deck sits at angle 0
  const ang = order.map(() => ({ th: 0 }));
  const place = (i: number) => {
    const th = ang[i].th;
    const p = order[i].obj.position;
    p.x = P.x + R * Math.sin(th);
    p.z = P.z - R * Math.cos(th);
    order[i].obj.rotation.y = -th;
  };
  const fan1 = (i: number) => -FAN + (2 * FAN * i) / (n - 1);
  const wheel = (i: number) => -Math.PI + (TAU * (i + 0.5)) / n;
  const fan2 = (i: number) => TAU - FAN + (2 * FAN * i) / (n - 1); // a whole turn on from the first fan
  // the fan springs open, turning face up
  sfx.play('fan');
  await all(
    order.map((c, i) => {
      const d = stag(i, 0.0045);
      return all([
        tw(ang[i], { th: fan1(i), duration: T_OPEN, delay: d, ease: 'back.out(1.3)', onUpdate: () => place(i) }),
        tw(c.obj.position, { y: REST_Y + 0.28 + i * 0.0018, duration: T_OPEN * 0.45, delay: d, ease: 'sine.out' }).then(() =>
          tw(c.obj.position, { y: REST_Y + 0.02 + i * 0.0018, duration: T_OPEN * 0.55, ease: 'power2.in' }),
        ),
        tw(c.obj.rotation, { z: 0, x: 0, duration: T_OPEN, delay: d, ease: 'power2.inOut' }),
        tw(c.bend, { x: 0.7, duration: T_OPEN * 0.45, delay: d, ease: 'sine.out' }).then(() => tw(c.bend, { x: 0, duration: T_OPEN * 0.55, ease: 'power2.in' })),
      ]);
    }),
  );
  // all the way round into a wheel
  sfx.play('slide', { vol: 0.5, rate: 1.1 });
  await all(order.map((_, i) => tw(ang[i], { th: wheel(i), duration: T_WHEEL, ease: 'power2.inOut', onUpdate: () => place(i) })));
  // the wheel spins, the lead cards sweep round and fold it into a fan again; the light runs round it
  sfx.play('fan', { vol: 0.6, rate: 1.1 });
  sfx.whoosh(T_TURN);
  await all([
    ...order.map((_, i) => tw(ang[i], { th: fan2(i), duration: T_TURN, ease: 'sine.inOut', onUpdate: () => place(i) })),
    glint(order, { tilt: 0.2, dur: 0.2, gap: 0.012, delay: 0.1 }),
  ]);
  // it closes into the deck, face down again
  sfx.play('fan', { vol: 0.7 });
  sfx.play('place', { vol: 0.35, rate: 1.2, delay: T_CLOSE + (n - 1) * 0.005 });
  await all(
    order.map((c, i) => {
      const d = stag(n - 1 - i, 0.005);
      return all([
        tw(ang[i], { th: TAU, duration: T_CLOSE, delay: d, ease: 'power2.in', onUpdate: () => place(i) }),
        tw(c.obj.position, { y: REST_Y + i * STEP + 0.2, duration: T_CLOSE / 2, delay: d, ease: 'sine.out' }).then(() =>
          tw(c.obj.position, { y: REST_Y + i * STEP, duration: T_CLOSE / 2, ease: 'power2.in' }),
        ),
        tw(c.obj.rotation, { z: Math.PI, duration: T_CLOSE, delay: d, ease: 'power2.inOut' }),
      ]);
    }),
  );
  return order;
}
