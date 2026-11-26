import * as THREE from 'three';
import type { Sfx } from '../audio/sfx';
import { t } from '../core/i18n';
import type { Hud } from '../ui/hud';
import { REST_Y, type Card3D, type CardFactory } from './cardMesh';
import {
  all,
  armSpread,
  boomerang,
  charlier,
  dribble,
  fanWheelFan,
  fly,
  fountain,
  G,
  glint,
  hop,
  longSpring,
  messy,
  pirouette,
  rnd,
  show,
  ShowSfx,
  snapFlat,
  squareUp,
  stag,
  STEP,
  sybil,
  tidy,
  tornado,
  turn,
  tw,
  V,
  wait,
  type Ctx,
  type Move,
  type V3,
} from './flourish';
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
  /** The title screen: any routine, including the long showcase combinations. */
  title?: boolean;
}

/** New-deck order: A..K of spades, hearts, diamonds, clubs. */
const NEW_DECK = Array.from({ length: 52 }, (_, i) => {
  const s = Math.floor(i / 13);
  const j = i % 13;
  return s * 13 + (j === 0 ? 12 : j - 1);
});

// ================================================================= table shuffles (each returns the new order)
// The engine, the physics helpers and the bold aerial moves live in ./flourish.ts.

/** Ribbon spread along a smile, a wave turns every card face up, then they are swept back face down. */
async function ribbonWave(order: Card3D[], { C, sfx }: Ctx) {
  const R = 2.25; // radius of the smile
  const A = 0.6; // its half angle
  const T_SPREAD = 0.32;
  const GAP = 0.011; // the spread and the turnover wave, card to card
  const n = order.length;
  // a nudge back before the push (anticipation)
  await all(order.map((c) => tw(c.obj.position, { x: `-=0.035`, duration: 0.06, ease: 'power1.out' })));
  sfx.play('fan');
  await all(
    order.map((c, i) => {
      const th = -A + (2 * A * i) / (n - 1);
      const d = stag(i, GAP);
      return all([
        tw(c.obj.position, { x: C.x + R * Math.sin(th), z: C.z - R * Math.cos(th) + R - 0.05, y: REST_Y + i * 0.0016, duration: T_SPREAD, delay: d, ease: 'power3.out' }),
        tw(c.obj.rotation, { y: -th + rnd(0.03), duration: T_SPREAD, delay: d, ease: 'power2.out' }),
        // the leading edge lifts a little as it slides: a glint runs down the ribbon
        tw(c.obj.rotation, { x: 0.12, duration: T_SPREAD / 2, delay: d, yoyo: true, repeat: 1, ease: 'sine.inOut' }),
      ]);
    }),
  );
  for (let k = 0; k < 6; k++) sfx.play('slide', { vol: 0.25, delay: k * 0.1, rate: 1.2 });
  await all(order.map((c, i) => turn(c, 0, 0.3, stag(i, GAP), 0.22)));
  await glint(order, { tilt: 0.2, dur: 0.16, gap: 0.0025 });
  sfx.play('fan', { vol: 0.7 });
  sfx.play('place', { vol: 0.35, rate: 1.2, delay: (n - 1) * 0.009 + 0.5 });
  await all(
    order.map((c, i) => {
      const d = stag(n - 1 - i, 0.009);
      const y = REST_Y + i * STEP;
      const m = messy();
      return all([
        tw(c.obj.rotation, { z: Math.PI, y: m.yaw, duration: 0.34, delay: d, ease: 'power2.inOut' }),
        tw(c.obj.position, { x: C.x + m.x, z: C.z + m.z, duration: 0.42, delay: d + 0.08, ease: 'power2.inOut' }),
        tw(c.obj.position, { y: y + 0.16, duration: 0.2, delay: d, ease: 'sine.out' }).then(() => tw(c.obj.position, { y, duration: 0.3, ease: 'power2.in' })),
        tw(c.bend, { x: -0.9, duration: 0.17, delay: d, ease: 'sine.out' })
          .then(() => tw(c.bend, { x: -0.15, duration: 0.17, ease: 'sine.in' }))
          .then(() => snapFlat(c)),
      ]);
    }),
  );
  return order;
}

/**
 * Table riffle: the deck is cut in two, the halves are set corner to corner, the thumbs curl their
 * inner edges up and let the cards go in a buzzing interleave, then the halves are pushed together.
 */
async function riffle(stack: Card3D[], { C, sfx }: Ctx) {
  const GAP = 0.36; // half-distance between the halves (their near corners overlap)
  const YAW = 0.22; // the halves angle in
  const CURL = -0.9; // a lifted card's curl (edges up)
  const ROLL = 0.11; // the inner edge lifts
  const DROP = 0.0155; // mean time between two released cards
  const T_PUSH = 0.18;
  const half = Math.floor(stack.length / 2) + Math.round(rnd(4));
  const left = stack.slice(0, half);
  const right = stack.slice(half);
  const L = V(C.x - GAP, C.z + 0.1);
  const Rp = V(C.x + GAP, C.z + 0.1);
  // the cut: the top half is carried off to the right, the paper drags a little (the packets lean)
  sfx.play('slide', { vol: 0.35, rate: 1.15 });
  await all([
    ...left.map((c, i) => all([hop(c, L, REST_Y + i * STEP, 0.28, i * 0.0012, 0.02), tw(c.obj.rotation, { x: 0, y: YAW, duration: 0.28, ease: 'power2.inOut' })])),
    ...right.map((c, i) => all([hop(c, Rp, REST_Y + i * STEP, 0.28, i * 0.0015, 0.07), tw(c.obj.rotation, { x: 0, y: -YAW, duration: 0.28, ease: 'power2.inOut' })])),
  ]);
  // the thumbs curl the inner edges up
  const curl = (list: Card3D[], roll: number) =>
    list.map((c, i) =>
      all([
        tw(c.bend, { x: CURL, duration: 0.12, delay: i * 0.0008, ease: 'power2.out' }),
        tw(c.obj.rotation, { z: Math.PI + roll, duration: 0.12, ease: 'power2.out' }),
        tw(c.obj.position, { y: REST_Y + 0.03 + i * STEP * 1.3, duration: 0.12 }),
      ]),
    );
  sfx.play('shuffle', { vol: 0.55, rate: 1.2, delay: 0.12 });
  await all([...curl(left, ROLL), ...curl(right, -ROLL)]);
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
  // the release: uneven, in bursts — a card or a clump springs off the thumb and slaps flat
  const times: number[] = [];
  let at = 0;
  for (let k = 0; k < order.length; k++) {
    times.push(at);
    at += DROP * (Math.random() < 0.18 ? 0.25 : 0.7 + Math.random() * 0.6);
  }
  await all(
    order.map((c, k) =>
      all([
        tw(c.obj.position, { y: REST_Y + k * STEP, duration: 0.07, delay: times[k], ease: 'power2.in', onStart: () => sfx.tick(0.05 + Math.random() * 0.04, 0.6 + Math.random() * 0.35) }),
        tw(c.obj.rotation, { z: Math.PI, duration: 0.07, delay: times[k], ease: 'power2.in' }),
        tw(c.bend, { x: 0, duration: 0.06, delay: times[k], ease: 'power3.in' })
          .then(() => tw(c.bend, { x: -0.12, duration: 0.03 }))
          .then(() => tw(c.bend, { x: 0, duration: 0.06, ease: 'sine.out' })),
      ]),
    ),
  );
  // the halves are pushed home (not quite square yet)
  sfx.play('slide', { vol: 0.4, rate: 1.05 });
  await all(
    order.map((c, k) => {
      const m = messy(0.012);
      return all([
        tw(c.obj.position, { x: C.x + m.x, z: C.z + m.z, duration: T_PUSH, delay: k * 0.0008, ease: 'power2.inOut' }),
        tw(c.obj.rotation, { y: m.yaw, duration: T_PUSH, delay: k * 0.0008, ease: 'power2.inOut' }),
      ]);
    }),
  );
  return order;
}

/** Bridge: a squeeze, the deck bowed into an arch standing on its ends, then released to cascade flat with a purr. */
async function bridge(order: Card3D[], { C, sfx }: Ctx) {
  const ARCH = 1.25; // the arch's bend (along the cards' length)
  const LIFT = 0.12; // the middle rises; the ends stay on the felt
  const GAP = 0.0072; // the cascade, card to card (from the bottom)
  const T_FALL = 0.16;
  // a squeeze the other way first (anticipation)
  await all(order.map((c) => tw(c.bend, { y: -0.18, duration: 0.06, ease: 'power1.out' })));
  sfx.play('fan', { vol: 0.8 });
  await all(
    order.map((c, i) =>
      all([
        tw(c.obj.position, { x: C.x, z: C.z, y: REST_Y + i * STEP + LIFT, duration: 0.2, ease: 'power2.out' }),
        tw(c.obj.rotation, { x: 0, y: 0, duration: 0.2 }),
        // bowed a touch too far and held: the tension
        tw(c.bend, { y: ARCH, duration: 0.2, ease: 'back.out(2.2)' }),
      ]),
    ),
  );
  sfx.play('fan', { vol: 0.5, rate: 1.35 });
  sfx.play('place', { vol: 0.6, delay: (order.length - 1) * GAP + T_FALL });
  await all(
    order.map((c, i) => {
      const d = stag(i, GAP, 0.8);
      const y = REST_Y + i * STEP;
      const m = messy(0.008);
      return all([
        // the bow and the drop go together, so the ends stay on the felt as the middle comes down
        tw(c.bend, { y: 0, duration: T_FALL, delay: d, ease: 'power2.in', onStart: i % 2 ? undefined : () => sfx.tick(0.045, 0.75) }).then(() => snapFlat(c)),
        tw(c.obj.position, { y, x: C.x + m.x, z: C.z + m.z, duration: T_FALL, delay: d, ease: 'power2.in' }),
        tw(c.obj.rotation, { y: m.yaw, duration: T_FALL, delay: d }),
      ]);
    }),
  );
  return order;
}

/** Pressure fan: the deck springs open into a half wheel around a point near the player, face up, and closes. */
async function fan(order: Card3D[], { C, sfx }: Ctx) {
  const n = order.length;
  const R = 0.78; // pivot to card centre
  const A = 1.2; // half-angle of the fan
  const T_OPEN = 0.38;
  const T_CLOSE = 0.34;
  const P = V(C.x, C.z + R); // the pivot: the deck sits at angle 0
  const ang = order.map(() => ({ th: 0 }));
  const place = (i: number) => {
    const p = order[i].obj.position;
    p.x = P.x + R * Math.sin(ang[i].th);
    p.z = P.z - R * Math.cos(ang[i].th);
    order[i].obj.rotation.y = -ang[i].th;
  };
  sfx.play('fan');
  await all(
    order.map((c, i) => {
      const th = -A + (2 * A * i) / (n - 1);
      const d = stag(i, 0.007);
      return all([
        // springs open a touch too far and settles back
        tw(ang[i], { th, duration: T_OPEN, delay: d, ease: 'back.out(1.4)', onUpdate: () => place(i) }),
        tw(c.obj.position, { y: REST_Y + 0.3 + i * 0.002, duration: T_OPEN * 0.45, delay: d, ease: 'sine.out' }).then(() =>
          tw(c.obj.position, { y: REST_Y + 0.02 + i * 0.002, duration: T_OPEN * 0.55, ease: 'power2.in' }),
        ),
        tw(c.obj.rotation, { x: 0, z: 0, duration: T_OPEN, delay: d, ease: 'power2.inOut' }),
        tw(c.bend, { x: 0.8, duration: T_OPEN * 0.45, delay: d, ease: 'sine.out' })
          .then(() => tw(c.bend, { x: 0.2, duration: T_OPEN * 0.3, ease: 'power1.in' }))
          .then(() => snapFlat(c)),
      ]);
    }),
  );
  // a ripple runs through the open fan, the faces catching the light
  await all(
    order.map((c, i) =>
      all([
        tw(c.obj.position, { y: `+=0.07`, duration: 0.09, delay: i * 0.004, yoyo: true, repeat: 1, ease: 'sine.inOut' }),
        tw(c.obj.rotation, { x: 0.22, duration: 0.09, delay: i * 0.004, yoyo: true, repeat: 1, ease: 'sine.inOut' }),
      ]),
    ),
  );
  sfx.play('fan', { vol: 0.7 });
  sfx.play('place', { vol: 0.35, rate: 1.2, delay: (n - 1) * 0.006 + T_CLOSE });
  await all(
    order.map((c, i) => {
      const d = stag(n - 1 - i, 0.006);
      const y = REST_Y + i * STEP;
      const m = messy();
      return all([
        tw(c.obj.position, { x: C.x + m.x, z: C.z + m.z, duration: T_CLOSE, delay: d, ease: 'power2.inOut' }),
        tw(c.obj.position, { y: y + 0.3, duration: T_CLOSE / 2, delay: d, ease: 'sine.out' }).then(() => tw(c.obj.position, { y, duration: T_CLOSE / 2, ease: 'power2.in' })),
        tw(c.obj.rotation, { y: m.yaw, z: Math.PI, duration: T_CLOSE, delay: d, ease: 'power2.inOut' }),
      ]);
    }),
  );
  return order;
}

/** Triple cut with a twirl: three packets fly apart leaning into the move, spin in place and restack in a new order. */
async function packets(order: Card3D[], { C, sfx }: Ctx) {
  const LAG = 0.0012; // a packet's top cards trail its bottom (the lean of a packet in motion)
  const LEAN = 0.16; // tilt into the flight
  const n = order.length;
  const a = Math.floor(n / 3) + Math.round(rnd(4));
  const b = Math.floor((2 * n) / 3) + Math.round(rnd(4));
  const P = [order.slice(0, a), order.slice(a, b), order.slice(b)];
  const spots = [V(C.x - 0.8, C.z + 0.12), V(C.x, C.z - 0.42), V(C.x + 0.8, C.z + 0.12)];
  const dest = [2, 0, 1].sort(() => Math.random() - 0.5);
  sfx.play('shove', { vol: 0.5 });
  await all(
    P.map((pk, k) => {
      const d0 = (2 - k) * 0.08;
      sfx.play('place', { vol: 0.28, rate: 1.2, delay: d0 + 0.3 });
      return all(
        pk.map((c, i) =>
          all([
            hop(c, spots[dest[k]], REST_Y + i * STEP, 0.3, d0 + i * LAG, 0.16 + k * 0.05),
            tw(c.obj.rotation, { x: LEAN, duration: 0.15, delay: d0, yoyo: true, repeat: 1, ease: 'sine.inOut' }),
          ]),
        ),
      );
    }),
  );
  // each packet lifts and spins half a turn, its top cards lagging (it twists into a little fan and back)
  sfx.play('fan', { vol: 0.5, rate: 1.2 });
  await all(
    P.map((pk, k) => {
      const dir = k % 2 ? 1 : -1;
      return all(
        pk.map((c, i) =>
          all([
            tw(c.obj.rotation, { y: dir * Math.PI, duration: 0.34, delay: k * 0.06 + i * 0.0025, ease: 'power2.inOut' }),
            tw(c.obj.position, { y: REST_Y + i * STEP + 0.14, duration: 0.17, delay: k * 0.06, ease: 'sine.out' }).then(() =>
              tw(c.obj.position, { y: REST_Y + i * STEP, duration: 0.17, ease: 'power2.in' }),
            ),
          ]),
        ),
      );
    }),
  );
  order.forEach((c) => (c.obj.rotation.y = 0));
  // restack: packets come back one on top of the other, each landing with a slap
  const seq = [1, 2, 0].sort(() => Math.random() - 0.5).map((k) => P[k]);
  const out: Card3D[] = [];
  for (const pk of seq) {
    const base = out.length;
    const m = messy(0.016);
    sfx.play('place', { vol: 0.45, delay: 0.2 });
    await all(
      pk.map((c, i) =>
        all([
          hop(c, V(C.x + m.x, C.z + m.z), REST_Y + (base + i) * STEP, 0.2, i * LAG * 0.5, 0.12),
          tw(c.obj.rotation, { y: m.yaw, duration: 0.2 }),
          tw(c.bend, { y: -0.22, duration: 0.1, delay: 0.1, yoyo: true, repeat: 1, ease: 'sine.out' }),
        ]),
      ),
    );
    out.push(...pk);
  }
  return out;
}

/** Card spring: the deck squeezed and sprung in an arc from one side to the other and back. */
async function spring(order: Card3D[], { C, sfx }: Ctx) {
  const X = 0.85; // the hands are 2X apart
  const Y = 0.25; // height of the hands
  const H = 0.28; // arc height of a sprung card (with G the flight takes ≈0.37 s)
  const GAP = 0.0055; // between two cards
  const SQUEEZE = 1.4; // the bow of the squeezed deck
  const L = V(C.x - X, C.z);
  const R = V(C.x + X, C.z);
  await all(
    order.map((c, i) => all([hop(c, L, Y + i * STEP, 0.2, 0, 0.05), tw(c.obj.rotation, { x: 0, y: 0, duration: 0.2 }), tw(c.bend, { y: SQUEEZE * 0.7, duration: 0.2, ease: 'power2.in' })])),
  );
  let cur = order;
  for (const [from, to] of [
    [L, R],
    [R, L],
  ] as const) {
    // the squeeze tightens just before the cards go
    await all(cur.map((c) => tw(c.bend, { y: SQUEEZE, duration: 0.04, ease: 'power2.in' })));
    sfx.play('fan', { vol: 0.9, rate: 1.15 });
    const next = [...cur].reverse();
    await all(
      next.map((c, i) =>
        fly(c, {
          to: V(to.x + rnd(0.02), to.z + rnd(0.02), Y + i * STEP),
          h: H,
          delay: stag(i, GAP, 0.4),
          lean: from.x < to.x ? -0.5 : 0.5,
          flutter: 0.05,
          bow: 0.3,
          onStart: i % 2 ? undefined : () => sfx.tick(0.045, 0.95),
        }),
      ),
    );
    cur = next;
  }
  sfx.play('place', { vol: 0.5, delay: 0.2 });
  await all(cur.map((c, i) => hop(c, C, REST_Y + i * STEP, 0.2, i * 0.0004, 0.04)));
  return cur;
}

/** Waterfall: the deck is lifted and the cards fall one by one, fluttering, onto the table. */
async function waterfall(order: Card3D[], { C, sfx }: Ctx) {
  const HOLD = V(C.x + 0.18, C.z - 0.25);
  const Y = 0.7; // height of the held deck (with G a card falls in ≈0.3 s)
  const GAP = 0.011;
  await all(
    order.map((c, i) =>
      all([
        tw(c.obj.position, { x: HOLD.x, z: HOLD.z, y: Y + i * STEP, duration: 0.24, ease: 'back.out(1.3)' }),
        tw(c.obj.rotation, { x: -0.35, y: 0, duration: 0.24 }),
        tw(c.bend, { y: 0.9, duration: 0.24 }),
      ]),
    ),
  );
  sfx.play('fan', { vol: 0.8, rate: 0.9 });
  sfx.play('place', { vol: 0.5, delay: (order.length - 1) * GAP + Math.sqrt((2 * Y) / G) });
  await all(
    order.map((c, i) => {
      const m = messy(0.03);
      return fly(c, {
        to: V(C.x + m.x, C.z + m.z, REST_Y + i * STEP),
        drop: true,
        delay: stag(i, GAP),
        rot: { x: 0, y: m.yaw, z: Math.PI },
        flutter: 0.14,
        onLand: i % 3 ? undefined : () => sfx.tick(0.045, 0.6),
      });
    }),
  );
  return order;
}

/** Faro weave: two exact halves pushed corner to corner so they interlace perfectly, then sprung together. */
async function faro(order: Card3D[], { C, sfx }: Ctx) {
  const half = Math.floor(order.length / 2);
  const A = order.slice(0, half);
  const B = order.slice(half);
  const inA = new Set(A);
  sfx.play('place', { vol: 0.25, rate: 1.5, delay: 0.28 });
  await all([
    ...A.map((c, i) => all([hop(c, V(C.x - 0.42, C.z + 0.05), REST_Y + i * STEP, 0.26, i * 0.001, 0.04), tw(c.obj.rotation, { x: 0, y: 0.1, duration: 0.26 })])),
    ...B.map((c, i) => all([hop(c, V(C.x + 0.42, C.z + 0.05), REST_Y + i * STEP, 0.26, i * 0.001, 0.1), tw(c.obj.rotation, { x: 0, y: -0.1, duration: 0.26 })])),
  ]);
  const out: Card3D[] = [];
  for (let i = 0; i < half; i++) out.push(A[i], B[i]);
  for (let i = half; i < B.length; i++) out.push(B[i]);
  sfx.play('shuffle', { rate: 1.25, vol: 0.7 });
  // halves push in: cards weave half way, bowed like a pressed faro (a zip of clicks)
  await all(
    out.map((c, k) =>
      all([
        tw(c.obj.position, {
          x: C.x + (inA.has(c) ? -0.2 : 0.2) + rnd(0.006),
          y: REST_Y + k * STEP,
          duration: 0.3,
          delay: k * 0.004,
          ease: 'power2.out',
          onStart: k % 3 ? undefined : () => sfx.tick(0.04, 1.1),
        }),
        tw(c.bend, { x: inA.has(c) ? -0.5 : 0.5, duration: 0.3, delay: k * 0.004 }),
      ]),
    ),
  );
  // the woven deck is bowed and springs together
  await all(out.map((c, k) => all([tw(c.bend, { x: 0, y: -0.8, duration: 0.15, delay: k * 0.004 }), tw(c.obj.position, { y: `+=0.06`, duration: 0.15, delay: k * 0.004 })])));
  sfx.play('fan', { vol: 0.45, rate: 1.4 });
  sfx.play('place', { vol: 0.5, delay: (out.length - 1) * 0.005 + 0.16 });
  await all(
    out.map((c, k) => {
      const m = messy(0.01);
      return all([
        tw(c.bend, { y: 0, duration: 0.14, delay: k * 0.005, ease: 'power2.in' }).then(() => snapFlat(c)),
        tw(c.obj.position, { x: C.x + m.x, z: C.z + m.z, y: REST_Y + k * STEP, duration: 0.16, delay: k * 0.005, ease: 'power2.in' }),
        tw(c.obj.rotation, { y: m.yaw, duration: 0.16, delay: k * 0.005 }),
      ]);
    }),
  );
  return out;
}

/** Overhand shuffle: small packets slide off the top of the raised, tilted deck and drop onto a new pile. */
async function overhand(order: Card3D[], { C, sfx }: Ctx) {
  const Hd = V(C.x + 0.5, C.z + 0.05);
  const P = V(C.x - 0.4, C.z);
  const LAG = 0.003; // a packet's top cards trail as it slides off
  const BEAT = 0.078; // time between two packets
  await all(
    order.map((c, i) =>
      all([
        tw(c.obj.position, { x: Hd.x, z: Hd.z, y: 0.32 + i * STEP, duration: 0.2, ease: 'back.out(1.2)' }),
        tw(c.obj.rotation, { x: 0, z: Math.PI - 0.35, y: 0.08, duration: 0.2 }),
      ]),
    ),
  );
  const rest = [...order];
  const out: Card3D[] = [];
  const landing: Promise<void>[] = [];
  while (rest.length) {
    const take = Math.min(rest.length, 5 + Math.floor(Math.random() * 5));
    const pk = rest.splice(rest.length - take, take);
    const base = out.length;
    sfx.play('slide', { vol: 0.45, rate: 1.1 + Math.random() * 0.2 });
    // the packet keeps its order and lands on top of the pile, flexing as it comes off
    const m = messy(0.04);
    landing.push(
      all(
        pk.map((c, i) =>
          all([
            hop(c, V(P.x + m.x, P.z + m.z), REST_Y + (base + i) * STEP, 0.22, i * LAG, 0.1, 'power2.out'),
            tw(c.obj.rotation, { z: Math.PI, y: m.yaw, duration: 0.22, delay: i * LAG }),
            tw(c.bend, { y: 0.35, duration: 0.11, delay: i * LAG, yoyo: true, repeat: 1, ease: 'sine.out' }),
          ]),
        ),
      ),
    );
    out.push(...pk);
    if (rest.length) await wait(BEAT);
    else sfx.play('place', { vol: 0.3, rate: 1.3, delay: 0.2 });
  }
  await all(landing);
  await all(
    out.map((c, i) => {
      const m = messy(0.012);
      return all([
        tw(c.obj.position, { x: C.x + m.x, z: C.z + m.z, y: REST_Y + i * STEP, duration: 0.2, delay: 0.03 + i * 0.0003, ease: 'power2.inOut' }),
        tw(c.obj.rotation, { y: m.yaw, duration: 0.2, delay: 0.03 }),
      ]);
    }),
  );
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
      const d = stag(i, 0.008);
      return all([
        tw(c.obj.position, { x: C.x + R * Math.sin(a), z: C.z - R * Math.cos(a) * 0.92, y: REST_Y + i * 0.0012, duration: 0.34, delay: d, ease: 'power3.out' }),
        tw(c.obj.rotation, { x: 0, y: -a + rnd(0.03), duration: 0.34, delay: d, ease: 'power2.out' }),
      ]);
    }),
  );
  for (let k = 0; k < 5; k++) sfx.play('slide', { vol: 0.25, delay: k * 0.1, rate: 1.25 });
  await all(order.map((c, i) => turn(c, 0, 0.28, stag(i, 0.009), 0.25)));
  await glint(order, { tilt: 0.2, dur: 0.14, gap: 0.0015 });
  sfx.play('fan', { vol: 0.8 });
  sfx.play('place', { vol: 0.4, rate: 1.2, delay: (n - 1) * 0.006 + 0.42 });
  await all(
    order.map((c, i) => {
      const d = stag(n - 1 - i, 0.006);
      const y = REST_Y + i * STEP;
      const m = messy();
      return all([
        tw(c.obj.position, { x: C.x + m.x, z: C.z + m.z, duration: 0.42, delay: d, ease: 'power2.in' }),
        tw(c.obj.position, { y: y + 0.2, duration: 0.2, delay: d, ease: 'sine.out' }).then(() => tw(c.obj.position, { y, duration: 0.22, ease: 'power2.in' })),
        tw(c.obj.rotation, { y: '-=1.4', z: Math.PI, duration: 0.42, delay: d, ease: 'power2.inOut' }),
      ]);
    }),
  );
  await all(order.map((c) => tw(c.obj.rotation, { y: rnd(0.03), duration: 0.1, ease: 'power2.out' })));
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
      const d = stag(i, 0.004);
      return all([
        tw(c.obj.position, { x: C.x + Math.cos(p.a) * p.r * 1.25, z: C.z + Math.sin(p.a) * p.r * 0.85, y: REST_Y + i * 0.0012, duration: 0.3, delay: d, ease: 'power3.out' }),
        tw(c.obj.rotation, { x: 0, y: rnd(6), duration: 0.3, delay: d, ease: 'power2.out' }),
      ]);
    }),
  );
  // two swirls, the second one the other way; each card at its own pace
  for (const dir of [1, -1]) {
    sfx.play('slide', { vol: 0.5, rate: 0.9 });
    sfx.play('slide', { vol: 0.4, rate: 1.1, delay: 0.2 });
    await all(
      order.map((c, i) => {
        const p = pol[i];
        const a = p.a + dir * (0.9 + Math.random() * 0.5);
        const r = Math.max(0.2, Math.min(1.2, p.r + rnd(0.4)));
        const dur = 0.44 + Math.random() * 0.08;
        return all([
          tw(p, { a, r, duration: dur, ease: 'sine.inOut', onUpdate: () => place(c, p, i) }),
          tw(c.obj.rotation, { y: `+=${dir * (0.8 + Math.random())}`, duration: dur, ease: 'sine.inOut' }),
        ]);
      }),
    );
  }
  // gather into one pile
  const out = [...order].sort(() => Math.random() - 0.5);
  sfx.play('shove', { vol: 0.6 });
  sfx.play('place', { vol: 0.4, rate: 1.15, delay: 0.36 + 0.18 });
  await all(
    out.map((c, i) => {
      const m = messy(0.016);
      return all([
        tw(c.obj.position, { x: C.x + m.x, z: C.z + m.z, y: REST_Y + i * STEP, duration: 0.36, delay: (i / n) * 0.18, ease: 'power2.inOut' }),
        tw(c.obj.rotation, { y: m.yaw, duration: 0.36, delay: (i / n) * 0.18 }),
      ]);
    }),
  );
  return out;
}

// ================================================================= routines

const charlier1 = charlier(1);
const charlier2 = charlier(2);

/** Opening shows, about the same length each (≈ five seconds at the show's 1.4× rate). */
const FULL: Record<string, Move[]> = {
  classic: [ribbonWave, riffle, bridge],
  fan: [fan, packets, riffle, bridge],
  spring: [spring, faro, waterfall, bridge],
  wheel: [wheel, riffle, bridge],
  overhand: [overhand, riffle, packets, bridge],
  wash: [wash, faro, riffle, bridge],
  cascade: [riffle, waterfall, fan, bridge],
  // with a bold flourish
  fountain: [riffle, fountain, bridge],
  charlier: [charlier1, riffle, packets, bridge],
  dribble: [faro, dribble, riffle, bridge],
  pirouette: [riffle, pirouette, fan, bridge],
  sybil: [riffle, sybil, faro, bridge],
  longSpring: [longSpring, riffle, waterfall, bridge],
};

/** Mid-session reshuffles (shorter). */
const QUICK: Record<string, Move[]> = {
  riffle: [riffle, bridge],
  faro: [faro, waterfall],
  spring: [spring, bridge],
  overhand: [overhand, riffle],
  cascade: [riffle, waterfall],
};

/** Title-screen showcases: longer combinations of every flourish, on top of the routines above. */
const SHOWCASE: Record<string, Move[]> = {
  grand: [ribbonWave, fan, wheel, riffle, bridge],
  springs: [spring, waterfall, spring, bridge],
  weave: [faro, faro, waterfall, fan, bridge],
  washFan: [wash, fan, riffle, bridge],
  packetWheel: [packets, wheel, spring, bridge],
  overCascade: [overhand, waterfall, riffle, bridge],
  ribbonSpring: [ribbonWave, spring, faro, bridge],
  fanFaro: [fan, faro, overhand, riffle, bridge],
  wheelWash: [wheel, wash, waterfall, bridge],
  // the bold ones
  fountainSybil: [riffle, fountain, sybil, bridge],
  boomerangs: [fan, boomerang, longSpring, riffle, bridge],
  twister: [fanWheelFan, tornado, faro, bridge],
  charlierCuts: [charlier2, sybil, dribble, bridge],
  armSpread: [armSpread, pirouette, riffle, bridge],
  aerials: [fountain, tornado, boomerang, pirouette, bridge],
  longSprings: [longSpring, dribble, fanWheelFan, riffle, bridge],
  showtime: [riffle, charlier1, boomerang, armSpread, bridge],
};
const TITLE: Record<string, Move[]> = { ...FULL, ...QUICK, ...SHOWCASE };

const last = { full: '', quick: '', title: '' };

function pick(set: Record<string, Move[]>, kind: 'full' | 'quick' | 'title', forced?: string): Move[] {
  if (forced && set[forced]) return set[forced];
  const names = Object.keys(set).filter((k) => k !== last[kind]);
  const name = names[Math.floor(Math.random() * names.length)];
  last[kind] = name;
  return set[name];
}

/** Names of the routines (testing). */
export const SHUFFLE_ROUTINES = { full: Object.keys(FULL), quick: Object.keys(QUICK), title: Object.keys(TITLE) };

/**
 * The opening flourish of every table: the deck arrives, a randomly chosen cardistry routine
 * plays (never the same one twice in a row), the deck squares itself with a couple of taps and
 * goes into the deck box. Tapping the screen speeds it up.
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
    const mctx: Ctx = { C, sfx: new ShowSfx(sfx) };
    let order = deck;
    if (!o.quick) {
      // the deck slides in from the dealer
      const top = stage.screenToTable(u, -0.05);
      stackAt(deck, V(C.x, top.z));
      sfx.play('shove', { vol: 0.7 });
      await all(deck.map((c) => tw(c.obj.position, { z: C.z, duration: 0.42, ease: 'power3.out' })));
    } else stackAt(deck, C);

    const routine = o.title ? pick(TITLE, 'title', o.routine) : pick(o.quick ? QUICK : FULL, o.quick ? 'quick' : 'full', o.routine);
    for (const move of routine) {
      order = await move(order, mctx);
      tidy(order);
    }
    // the square-up taps: the deck ends exactly squared at C
    order = await squareUp(order, mctx);

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
