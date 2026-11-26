import gsap from 'gsap';
import * as THREE from 'three';
import type { Sfx } from '../audio/sfx';
import { t } from '../core/i18n';
import type { Hud } from '../ui/hud';
import { REST_Y, type Card3D, type CardFactory } from './cardMesh';
import type { Stage } from './stage';
import type { Table } from './table';

export interface ShuffleCtx {
  stage: Stage;
  table: Table;
  cards: CardFactory;
  sfx: Sfx;
  hud: Hud;
}

export interface ShuffleOpts {
  /** Frame position (u, v) of the shuffle area. */
  at?: [number, number];
  /** Short version (mid-session reshuffle). */
  quick?: boolean;
  /** Where the deck ends up. 'shoe' loads the deck box; a point leaves the deck there (returned). */
  to?: 'shoe' | THREE.Vector3;
  /** Forces one routine by name (testing). */
  routine?: string;
  /** False: no "shuffling · tap to skip" toast and no tap to speed up (the title screen's loop). */
  toast?: boolean;
}

const STEP = 0.0026;
/** New-deck order: A..K of spades, hearts, diamonds, clubs. */
const NEW_DECK = Array.from({ length: 52 }, (_, i) => {
  const s = Math.floor(i / 13);
  const j = i % 13;
  return s * 13 + (j === 0 ? 12 : j - 1);
});

type V3 = THREE.Vector3;
const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
const all = (ps: unknown[]) => Promise.all(ps).then(() => undefined);
const rnd = (a: number) => (Math.random() - 0.5) * a;

/**
 * Every tween of the show goes through here, so the show can run faster than the rest of the game
 * (and speed up on a tap) without touching the global timeline — changing the global time scale
 * mid-game left the next animation scheduled in the future.
 */
const show = { rate: 1, live: new Set<gsap.core.Tween>() };
const tw = (target: object, vars: gsap.TweenVars) => {
  const tween = gsap.to(target, vars);
  tween.timeScale(show.rate);
  show.live.add(tween);
  return tween.then(() => {
    show.live.delete(tween);
  });
};
const wait = (s: number) => tw({ t: 0 }, { t: 1, duration: s, ease: 'none' });

/** Moves a card to (x, z) along a little arc and lands it at height y. */
function hop(c: Card3D, to: V3, y: number, dur: number, delay = 0, h = 0.18, ease = 'power2.inOut') {
  return all([
    tw(c.obj.position, { x: to.x, z: to.z, duration: dur, delay, ease }),
    tw(c.obj.position, { y: y + h, duration: dur / 2, delay, ease: 'sine.out' }).then(() => tw(c.obj.position, { y, duration: dur / 2, ease: 'sine.in' })),
  ]);
}

/** Turns a card over in place (rolls up on its edge, curls a little). */
function turn(c: Card3D, z: number, dur: number, delay = 0, lift = 0.3) {
  return all([
    tw(c.obj.rotation, { z, duration: dur, delay, ease: 'power2.inOut' }),
    tw(c.obj.position, { y: `+=${lift}`, duration: dur / 2, delay, yoyo: true, repeat: 1, ease: 'sine.out' }),
    tw(c.bend, { x: 1.0, duration: dur / 2, delay, yoyo: true, repeat: 1, ease: 'sine.out' }),
  ]);
}

/** Squares a pile at C (bottom to top in `order`). */
function square(order: Card3D[], C: V3, dur = 0.16) {
  return all(order.map((c, i) => all([tw(c.obj.position, { x: C.x, z: C.z, y: REST_Y + i * STEP, duration: dur, ease: 'power2.out' }), tw(c.obj.rotation, { y: 0, duration: dur })])));
}

interface Ctx {
  C: V3;
  sfx: Sfx;
}

// ================================================================= moves (each returns the new order)

/** Ribbon spread along a smile, a wave turns every card face up, then they are swept back face down. */
async function ribbonWave(order: Card3D[], { C, sfx }: Ctx) {
  const R = 2.25;
  const A = 0.6;
  sfx.play('fan');
  await all(
    order.map((c, i) => {
      const th = -A + (2 * A * i) / (order.length - 1);
      return all([
        tw(c.obj.position, { x: C.x + R * Math.sin(th), z: C.z - R * Math.cos(th) + R - 0.05, y: REST_Y + i * 0.0016, duration: 0.34, delay: i * 0.011, ease: 'power2.out' }),
        tw(c.obj.rotation, { y: -th, duration: 0.34, delay: i * 0.011, ease: 'power2.out' }),
      ]);
    }),
  );
  for (let k = 0; k < 6; k++) sfx.play('slide', { vol: 0.25, delay: k * 0.1, rate: 1.2 });
  await all(order.map((c, i) => turn(c, 0, 0.3, i * 0.011, 0.22)));
  await wait(0.3);
  sfx.play('fan', { vol: 0.7 });
  await all(
    order.map((c, i) => {
      const d = (order.length - 1 - i) * 0.009;
      return all([
        tw(c.obj.rotation, { z: Math.PI, y: 0, duration: 0.34, delay: d, ease: 'power2.inOut' }),
        tw(c.obj.position, { x: C.x, z: C.z, duration: 0.42, delay: d + 0.08, ease: 'power2.inOut' }),
        tw(c.obj.position, { y: REST_Y + i * STEP + 0.16, duration: 0.2, delay: d, yoyo: true, repeat: 1, ease: 'sine.out' }),
        tw(c.bend, { x: -0.9, duration: 0.17, delay: d, yoyo: true, repeat: 1 }),
      ]);
    }),
  );
  order.forEach((c, i) => (c.obj.position.y = REST_Y + i * STEP));
  return order;
}

/** Table riffle: split, thumbs lift the inner corners, the halves interleave into the middle. */
async function riffle(stack: Card3D[], { C, sfx }: Ctx) {
  const half = Math.floor(stack.length / 2) + Math.round(rnd(4));
  const left = stack.slice(0, half);
  const right = stack.slice(half);
  const L = V(C.x - 0.5, C.z + 0.1);
  const Rp = V(C.x + 0.5, C.z + 0.1);
  const dur = 0.3;
  await all([
    ...left.map((c, i) => all([hop(c, L, REST_Y + i * STEP, dur, 0, 0.02), tw(c.obj.rotation, { y: 0.24, duration: dur, ease: 'power2.inOut' })])),
    ...right.map((c, i) => all([hop(c, Rp, REST_Y + i * STEP, dur, 0, 0.06), tw(c.obj.rotation, { y: -0.24, duration: dur, ease: 'power2.inOut' })])),
  ]);
  await all([...left.map((c) => tw(c.bend, { x: -0.7, duration: 0.14 })), ...right.map((c) => tw(c.bend, { x: 0.7, duration: 0.14 }))]);
  const order: Card3D[] = [];
  let li = 0;
  let ri = 0;
  let fromLeft = Math.random() < 0.5;
  while (li < left.length || ri < right.length) {
    const n = Math.random() < 0.25 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      if (fromLeft && li < left.length) order.push(left[li++]);
      else if (!fromLeft && ri < right.length) order.push(right[ri++]);
    }
    if (li >= left.length) fromLeft = false;
    else if (ri >= right.length) fromLeft = true;
    else fromLeft = !fromLeft;
  }
  sfx.play('shuffle');
  await all(
    order.map((c, k) => {
      const d = k * 0.019;
      return all([
        tw(c.obj.position, { x: C.x + rnd(0.02), z: C.z + rnd(0.02), y: REST_Y + k * STEP, duration: 0.17, delay: d, ease: 'power2.in' }),
        tw(c.obj.rotation, { y: rnd(0.06), duration: 0.17, delay: d, ease: 'power2.out' }),
        tw(c.bend, { x: 0, duration: 0.12, delay: d + 0.05 }),
      ]);
    }),
  );
  await all(order.map((c) => tw(c.obj.rotation, { y: 0, duration: 0.14 })));
  return order;
}

/** Bridge: arch the deck and let it cascade down. */
async function bridge(order: Card3D[], { sfx }: Ctx) {
  sfx.play('fan', { vol: 0.8 });
  await all(order.map((c, i) => tw(c.obj.position, { y: REST_Y + i * STEP + 0.12, duration: 0.22, ease: 'power2.out' })));
  await all(order.map((c) => tw(c.bend, { y: -1.25, duration: 0.22, ease: 'power2.out' })));
  await all(
    order.map((c, i) =>
      all([
        tw(c.bend, { y: 0, duration: 0.2, delay: i * 0.009, ease: 'power2.in' }),
        tw(c.obj.position, { y: REST_Y + i * STEP, duration: 0.2, delay: i * 0.009, ease: 'bounce.out' }),
      ]),
    ),
  );
  sfx.play('place', { vol: 0.6 });
  await wait(0.12);
  return order;
}

/** Pressure fan: the deck opens into a half wheel around a point near the player, face up, and closes. */
async function fan(order: Card3D[], { C, sfx }: Ctx) {
  const n = order.length;
  const P = V(C.x, C.z + 0.7);
  const R = 0.78;
  const A = 1.2;
  sfx.play('fan');
  await all(
    order.map((c, i) => {
      const th = -A + (2 * A * i) / (n - 1);
      const d = i * 0.007;
      return all([
        tw(c.obj.position, { x: P.x + R * Math.sin(th), z: P.z - R * Math.cos(th), duration: 0.38, delay: d, ease: 'power3.out' }),
        tw(c.obj.position, { y: REST_Y + 0.3 + i * 0.002, duration: 0.19, delay: d, ease: 'sine.out' }).then(() => tw(c.obj.position, { y: REST_Y + 0.02 + i * 0.002, duration: 0.19, ease: 'sine.in' })),
        tw(c.obj.rotation, { y: -th, z: 0, duration: 0.38, delay: d, ease: 'power2.inOut' }),
        tw(c.bend, { x: 0.8, duration: 0.19, delay: d, yoyo: true, repeat: 1 }),
      ]);
    }),
  );
  // a ripple runs through the open fan
  await all(order.map((c, i) => tw(c.obj.position, { y: `+=0.07`, duration: 0.1, delay: i * 0.005, yoyo: true, repeat: 1, ease: 'sine.inOut' })));
  await wait(0.12);
  sfx.play('fan', { vol: 0.7 });
  await all(
    order.map((c, i) => {
      const d = (n - 1 - i) * 0.006;
      return all([
        tw(c.obj.position, { x: C.x, z: C.z, duration: 0.34, delay: d, ease: 'power2.inOut' }),
        tw(c.obj.position, { y: REST_Y + i * STEP + 0.3, duration: 0.17, delay: d, ease: 'sine.out' }).then(() => tw(c.obj.position, { y: REST_Y + i * STEP, duration: 0.17, ease: 'sine.in' })),
        tw(c.obj.rotation, { y: 0, z: Math.PI, duration: 0.34, delay: d, ease: 'power2.inOut' }),
      ]);
    }),
  );
  return order;
}

/** Triple cut with a twirl: three packets fly apart, spin in place and restack in a new order. */
async function packets(order: Card3D[], { C, sfx }: Ctx) {
  const n = order.length;
  const a = Math.floor(n / 3) + Math.round(rnd(4));
  const b = Math.floor((2 * n) / 3) + Math.round(rnd(4));
  const P = [order.slice(0, a), order.slice(a, b), order.slice(b)];
  const spots = [V(C.x - 0.8, C.z + 0.12), V(C.x, C.z - 0.42), V(C.x + 0.8, C.z + 0.12)];
  const dest = [2, 0, 1].sort(() => Math.random() - 0.5);
  sfx.play('shove', { vol: 0.5 });
  await all(P.map((pk, k) => all(pk.map((c, i) => hop(c, spots[dest[k]], REST_Y + i * STEP, 0.3, (2 - k) * 0.08, 0.16 + k * 0.05)))));
  // each packet lifts and spins half a turn
  sfx.play('fan', { vol: 0.5, rate: 1.2 });
  await all(
    P.map((pk, k) => {
      const dir = k % 2 ? 1 : -1;
      return all(
        pk.map((c, i) =>
          all([
            tw(c.obj.rotation, { y: dir * Math.PI, duration: 0.36, delay: k * 0.06, ease: 'power2.inOut' }),
            tw(c.obj.position, { y: REST_Y + i * STEP + 0.14, duration: 0.18, delay: k * 0.06, yoyo: true, repeat: 1, ease: 'sine.out' }),
          ]),
        ),
      );
    }),
  );
  order.forEach((c) => (c.obj.rotation.y = 0));
  // restack: packets come back one on top of the other
  const seq = [1, 2, 0].sort(() => Math.random() - 0.5).map((k) => P[k]);
  const out: Card3D[] = [];
  for (const pk of seq) {
    const base = out.length;
    sfx.play('place', { vol: 0.5 });
    await all(pk.map((c, i) => hop(c, C, REST_Y + (base + i) * STEP, 0.22, 0, 0.12)));
    out.push(...pk);
  }
  return out;
}

/** Card spring: the deck squeezed and sprung in an arc from one side to the other and back. */
async function spring(order: Card3D[], { C, sfx }: Ctx) {
  const L = V(C.x - 0.85, C.z);
  const R = V(C.x + 0.85, C.z);
  await all(order.map((c, i) => hop(c, L, REST_Y + i * STEP + 0.25, 0.22, 0, 0.05)));
  let cur = order;
  for (const [from, to] of [
    [L, R],
    [R, L],
  ] as const) {
    sfx.play('fan', { vol: 0.9, rate: 1.15 });
    const next = [...cur].reverse();
    await all(
      next.map((c, i) => {
        const d = i * 0.0085;
        const y = REST_Y + i * STEP + 0.25;
        return all([
          tw(c.obj.position, { x: to.x, z: to.z + rnd(0.02), duration: 0.32, delay: d, ease: 'none' }),
          tw(c.obj.position, { y: y + 0.6, duration: 0.16, delay: d, ease: 'sine.out' }).then(() => tw(c.obj.position, { y, duration: 0.16, ease: 'sine.in' })),
          tw(c.bend, { y: 1.4, duration: 0.16, delay: d, yoyo: true, repeat: 1, ease: 'sine.inOut' }),
          tw(c.obj.rotation, { x: from.x < to.x ? -0.5 : 0.5, duration: 0.16, delay: d, yoyo: true, repeat: 1 }),
        ]);
      }),
    );
    cur = next;
  }
  sfx.play('place', { vol: 0.5 });
  await all(cur.map((c, i) => hop(c, C, REST_Y + i * STEP, 0.24, 0, 0.04)));
  return cur;
}

/** Waterfall: the deck is lifted and the cards rain down one by one onto the table. */
async function waterfall(order: Card3D[], { C, sfx }: Ctx) {
  const H = V(C.x + 0.18, C.z - 0.25);
  await all(
    order.map((c, i) =>
      all([
        tw(c.obj.position, { x: H.x, z: H.z, y: 0.7 + i * STEP, duration: 0.24, ease: 'power2.out' }),
        tw(c.obj.rotation, { x: -0.35, duration: 0.24 }),
        tw(c.bend, { y: 0.9, duration: 0.24 }),
      ]),
    ),
  );
  sfx.play('fan', { vol: 0.8, rate: 0.9 });
  const out = [...order];
  await all(
    out.map((c, i) => {
      const d = i * 0.011;
      return all([
        tw(c.obj.position, { x: C.x + rnd(0.03), z: C.z + rnd(0.03), y: REST_Y + i * STEP, duration: 0.26, delay: d, ease: 'power2.in' }),
        tw(c.obj.rotation, { x: 0, y: rnd(0.12), duration: 0.26, delay: d }),
        tw(c.bend, { y: 0, x: rnd(0.6), duration: 0.13, delay: d }).then(() => tw(c.bend, { x: 0, duration: 0.13 })),
      ]);
    }),
  );
  sfx.play('place', { vol: 0.5 });
  await square(out, C);
  return out;
}

/** Faro weave: two exact halves pushed corner to corner so they interlace perfectly. */
async function faro(order: Card3D[], { C, sfx }: Ctx) {
  const half = Math.floor(order.length / 2);
  const A = order.slice(0, half);
  const B = order.slice(half);
  const inA = new Set(A);
  await all([
    ...A.map((c, i) => all([hop(c, V(C.x - 0.42, C.z + 0.05), REST_Y + i * STEP, 0.26, 0, 0.04), tw(c.obj.rotation, { y: 0.1, duration: 0.26 })])),
    ...B.map((c, i) => all([hop(c, V(C.x + 0.42, C.z + 0.05), REST_Y + i * STEP, 0.26, 0, 0.1), tw(c.obj.rotation, { y: -0.1, duration: 0.26 })])),
  ]);
  const out: Card3D[] = [];
  for (let i = 0; i < half; i++) out.push(A[i], B[i]);
  for (let i = half; i < B.length; i++) out.push(B[i]);
  sfx.play('shuffle', { rate: 1.25, vol: 0.8 });
  // halves push in: cards weave half way, bowed like a pressed faro
  await all(
    out.map((c, k) =>
      all([
        tw(c.obj.position, { x: C.x + (inA.has(c) ? -0.2 : 0.2), y: REST_Y + k * STEP, duration: 0.3, delay: k * 0.004, ease: 'power2.out' }),
        tw(c.bend, { x: inA.has(c) ? -0.5 : 0.5, duration: 0.3, delay: k * 0.004 }),
      ]),
    ),
  );
  // the woven deck is bowed and springs together
  await all(out.map((c, k) => all([tw(c.bend, { x: 0, y: -0.8, duration: 0.15, delay: k * 0.004 }), tw(c.obj.position, { y: `+=0.06`, duration: 0.15, delay: k * 0.004 })])));
  sfx.play('place', { vol: 0.6 });
  await all(
    out.map((c, k) =>
      all([
        tw(c.bend, { y: 0, duration: 0.16, delay: k * 0.005, ease: 'power2.in' }),
        tw(c.obj.position, { x: C.x, z: C.z, y: REST_Y + k * STEP, duration: 0.18, delay: k * 0.005, ease: 'power2.in' }),
        tw(c.obj.rotation, { y: 0, duration: 0.18, delay: k * 0.005 }),
      ]),
    ),
  );
  return out;
}

/** Overhand shuffle: small packets slide off the top of the raised deck onto a new pile. */
async function overhand(order: Card3D[], { C, sfx }: Ctx) {
  const Hd = V(C.x + 0.5, C.z + 0.05);
  const P = V(C.x - 0.4, C.z);
  await all(
    order.map((c, i) =>
      all([tw(c.obj.position, { x: Hd.x, z: Hd.z, y: 0.32 + i * STEP, duration: 0.22, ease: 'power2.out' }), tw(c.obj.rotation, { z: Math.PI - 0.35, y: 0.08, duration: 0.22 })]),
    ),
  );
  const rest = [...order];
  const out: Card3D[] = [];
  const landing: Promise<void>[] = [];
  while (rest.length) {
    const take = Math.min(rest.length, 4 + Math.floor(Math.random() * 5));
    const pk = rest.splice(rest.length - take, take);
    const base = out.length;
    sfx.play('slide', { vol: 0.45, rate: 1.1 + Math.random() * 0.2 });
    // the packet keeps its order and lands on top of the pile
    landing.push(
      all(
        pk.map((c, i) =>
          all([hop(c, V(P.x + rnd(0.04), P.z + rnd(0.04)), REST_Y + (base + i) * STEP, 0.22, 0, 0.1, 'power2.out'), tw(c.obj.rotation, { z: Math.PI, y: rnd(0.1), duration: 0.22 })]),
        ),
      ),
    );
    out.push(...pk);
    if (rest.length) await wait(0.085);
  }
  await all(landing);
  await wait(0.12);
  await all(out.map((c, i) => all([tw(c.obj.position, { x: C.x, z: C.z, y: REST_Y + i * STEP, duration: 0.22, ease: 'power2.inOut' }), tw(c.obj.rotation, { y: 0, duration: 0.22 })])));
  return out;
}

/** Circle spread: the deck becomes a wheel, a wave turns it face up and it swirls back to the centre. */
async function wheel(order: Card3D[], { C, sfx }: Ctx) {
  const n = order.length;
  const R = 1.05;
  sfx.play('slide', { vol: 0.6 });
  await all(
    order.map((c, i) => {
      const a = (i / n) * Math.PI * 2;
      return all([
        tw(c.obj.position, { x: C.x + R * Math.sin(a), z: C.z - R * Math.cos(a) * 0.92, y: REST_Y + i * 0.0012, duration: 0.34, delay: i * 0.008, ease: 'power2.out' }),
        tw(c.obj.rotation, { y: -a, duration: 0.34, delay: i * 0.008, ease: 'power2.out' }),
      ]);
    }),
  );
  for (let k = 0; k < 5; k++) sfx.play('slide', { vol: 0.25, delay: k * 0.1, rate: 1.25 });
  await all(order.map((c, i) => turn(c, 0, 0.28, i * 0.009, 0.25)));
  await wait(0.18);
  sfx.play('fan', { vol: 0.8 });
  await all(
    order.map((c, i) => {
      const d = (n - 1 - i) * 0.006;
      return all([
        tw(c.obj.position, { x: C.x, z: C.z, duration: 0.42, delay: d, ease: 'power2.in' }),
        tw(c.obj.position, { y: REST_Y + i * STEP + 0.2, duration: 0.21, delay: d, ease: 'sine.out' }).then(() => tw(c.obj.position, { y: REST_Y + i * STEP, duration: 0.21, ease: 'sine.in' })),
        tw(c.obj.rotation, { y: '-=1.4', z: Math.PI, duration: 0.42, delay: d, ease: 'power2.inOut' }),
      ]);
    }),
  );
  await all(order.map((c) => tw(c.obj.rotation, { y: 0, duration: 0.12 })));
  return order;
}

/** Wash (chemmy): the cards are spread face down and swirled around the table, then gathered. */
async function wash(order: Card3D[], { C, sfx }: Ctx) {
  const n = order.length;
  const pol = order.map(() => ({ a: Math.random() * Math.PI * 2, r: 0.25 + Math.random() * 0.95 }));
  const place = (c: Card3D, p: { a: number; r: number }, i: number) => {
    c.obj.position.set(C.x + Math.cos(p.a) * p.r * 1.25, REST_Y + i * 0.0012, C.z + Math.sin(p.a) * p.r * 0.85);
  };
  sfx.play('shove', { vol: 0.7 });
  await all(
    order.map((c, i) => {
      const p = pol[i];
      return all([
        tw(c.obj.position, { x: C.x + Math.cos(p.a) * p.r * 1.25, z: C.z + Math.sin(p.a) * p.r * 0.85, y: REST_Y + i * 0.0012, duration: 0.3, delay: i * 0.004, ease: 'power2.out' }),
        tw(c.obj.rotation, { y: rnd(6), duration: 0.3, delay: i * 0.004 }),
      ]);
    }),
  );
  // two swirls, the second one the other way
  for (const dir of [1, -1]) {
    sfx.play('slide', { vol: 0.5, rate: 0.9 });
    sfx.play('slide', { vol: 0.4, rate: 1.1, delay: 0.2 });
    await all(
      order.map((c, i) => {
        const p = pol[i];
        const a = p.a + dir * (0.9 + Math.random() * 0.5);
        const r = Math.max(0.2, Math.min(1.2, p.r + rnd(0.4)));
        return all([tw(p, { a, r, duration: 0.5, ease: 'sine.inOut', onUpdate: () => place(c, p, i) }), tw(c.obj.rotation, { y: `+=${dir * (0.8 + Math.random())}`, duration: 0.5, ease: 'sine.inOut' })]);
      }),
    );
  }
  // gather into one pile
  const out = [...order].sort(() => Math.random() - 0.5);
  sfx.play('shove', { vol: 0.6 });
  await all(
    out.map((c, i) =>
      all([
        tw(c.obj.position, { x: C.x, z: C.z, y: REST_Y + i * STEP, duration: 0.36, delay: (i / n) * 0.18, ease: 'power2.inOut' }),
        tw(c.obj.rotation, { y: 0, duration: 0.36, delay: (i / n) * 0.18 }),
      ]),
    ),
  );
  return out;
}

// ================================================================= routines

type Move = (order: Card3D[], ctx: Ctx) => Promise<Card3D[]>;

/** Opening shows, about the same length each (≈ five seconds at the show's 1.4× rate). */
const FULL: Record<string, Move[]> = {
  classic: [ribbonWave, riffle, bridge],
  fan: [fan, packets, riffle, bridge],
  spring: [spring, faro, waterfall, bridge],
  wheel: [wheel, riffle, bridge],
  overhand: [overhand, riffle, packets, bridge],
  wash: [wash, faro, riffle, bridge],
  cascade: [riffle, waterfall, fan, bridge],
};

/** Mid-session reshuffles (shorter). */
const QUICK: Record<string, Move[]> = {
  riffle: [riffle, bridge],
  faro: [faro, waterfall],
  spring: [spring, bridge],
  overhand: [overhand, riffle],
  cascade: [riffle, waterfall],
};

const last = { full: '', quick: '' };

function pick(set: Record<string, Move[]>, kind: 'full' | 'quick', forced?: string): Move[] {
  if (forced && set[forced]) return set[forced];
  const names = Object.keys(set).filter((k) => k !== last[kind]);
  const name = names[Math.floor(Math.random() * names.length)];
  last[kind] = name;
  return set[name];
}

/** Names of the routines (testing). */
export const SHUFFLE_ROUTINES = { full: Object.keys(FULL), quick: Object.keys(QUICK) };

/**
 * The opening flourish of every table: the deck arrives, a randomly chosen cardistry routine
 * plays (never the same one twice in a row) and the deck goes into the deck box.
 * Tapping the screen speeds it up.
 */
export async function shuffleShow(ctx: ShuffleCtx, o: ShuffleOpts = {}): Promise<Card3D[] | void> {
  const { stage, table, cards, sfx, hud } = ctx;
  const [u, v] = o.at ?? [0.5, 0.47];
  const C = stage.screenToTable(u, v);
  const deck: Card3D[] = NEW_DECK.map((c) => cards.createLite(c));
  show.rate = o.quick ? 1.15 : 1.4;
  let fast = false;
  const speedUp = () => {
    if (fast) return;
    fast = true;
    show.rate *= 3.5;
    for (const tween of show.live) tween.timeScale(show.rate);
  };
  if (o.toast !== false) {
    window.addEventListener('pointerdown', speedUp);
    hud.toast(`${t('toast.shuffling')} · ${t('toast.skip')}`, o.quick ? 1400 : 2600);
  }

  const stackAt = (list: Card3D[], p: V3, yaw = 0) =>
    list.forEach((c, i) => {
      c.obj.position.set(p.x, REST_Y + i * STEP, p.z);
      c.obj.rotation.set(0, yaw, Math.PI);
      c.bend.set(0, 0);
    });

  try {
    const mctx: Ctx = { C, sfx };
    let order = deck;
    if (!o.quick) {
      // the deck slides in from the dealer
      const top = stage.screenToTable(u, -0.05);
      stackAt(deck, V(C.x, top.z));
      sfx.play('shove', { vol: 0.7 });
      await all(deck.map((c) => tw(c.obj.position, { z: C.z, duration: 0.42, ease: 'power3.out' })));
    } else stackAt(deck, C);

    for (const move of pick(o.quick ? QUICK : FULL, o.quick ? 'quick' : 'full', o.routine)) order = await move(order, mctx);

    // the deck is left at a point, or goes into the deck box
    if (o.to instanceof THREE.Vector3) {
      const dest = o.to;
      await all(order.map((c, i) => tw(c.obj.position, { x: dest.x, z: dest.z, y: REST_Y + i * STEP, duration: 0.45, ease: 'power2.inOut' })));
      return order;
    }
    const mouth = table.shoeMouth();
    const yaw = table.shoeYaw;
    sfx.play('shove');
    const clumps = 4;
    const per = Math.ceil(order.length / clumps);
    await all(
      order.map((c, i) => {
        const k = Math.floor(i / per);
        const d = k * 0.1;
        return all([
          tw(c.obj.position, { x: mouth.x, z: mouth.z, y: mouth.y + (i % per) * STEP, duration: 0.42, delay: d, ease: 'power2.inOut' }),
          tw(c.obj.rotation, { y: yaw, duration: 0.42, delay: d, ease: 'power2.inOut' }),
          tw(c.obj.scale, {
            x: 0.35,
            y: 0.35,
            z: 0.35,
            duration: 0.42,
            delay: d,
            ease: 'power2.in',
            onComplete: () => {
              c.obj.visible = false;
              if (i % per === per - 1 || i === order.length - 1) table.setShoeFill((k + 1) / clumps);
            },
          }),
        ]);
      }),
    );
    table.setShoeFill(1);
  } finally {
    window.removeEventListener('pointerdown', speedUp);
    show.rate = 1;
    if (!(o.to instanceof THREE.Vector3)) for (const c of deck) cards.destroy(c);
  }
}
