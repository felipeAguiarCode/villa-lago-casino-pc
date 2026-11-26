import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHIP_H, CHIP_R, ChipPile, type ChipSet } from './chips';
import { DeckBox } from './deckBox';

/**
 * Casino table pieces for the PC edition's decor, modelled here (no downloads): crystal glasses
 * with drinks and cocktails, coffee and tea, a champagne bucket, a decanter, chip towers and a chip
 * rack, high-value plaques, a dealer button, a card guard, a service bell, a banker's lamp, a
 * humidor, a candle, casino dice, sealed decks and a table placard. One table unit is 10 cm (a card
 * is 6.3 × 8.8 cm); every piece stands at y = 0 with its front toward +z.
 */

const V = (r: number, y: number) => new THREE.Vector2(r, y);

const crystal = () =>
  new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.12, ior: 1.5, specularIntensity: 1, envMapIntensity: 1.4 });

const liquid = (color: string, deep: string, opacity = 0.82) =>
  new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(deep), emissiveIntensity: 0.35, roughness: 0.08, metalness: 0, transparent: true, opacity, depthWrite: false });

const lathe = (pts: [number, number][], mat: THREE.Material, seg = 48) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => V(r, y)), seg), mat);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function ice(size: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.9, size), new THREE.MeshStandardMaterial({ color: '#f4faff', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.55, envMapIntensity: 2 }));
  m.rotation.set(Math.random() * 0.8, Math.random() * Math.PI, Math.random() * 0.6);
  return m;
}

// ------------------------------------------------------------------ helpers for the pieces below

/** Seeded random numbers, so a piece comes out the same every time it is built. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A canvas texture made once and shared by every piece that asks for the same key. */
const texCache = new Map<string, THREE.CanvasTexture>();
function sharedTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = texCache.get(key);
  if (!t) {
    t = canvasTex(w, h, draw);
    texCache.set(key, t);
  }
  return t;
}

/**
 * A drink inside a crystal glass. It is opaque on purpose: three.js draws a transmissive glass from a
 * picture of the opaque scene behind it, so an opaque drink shows through the walls (a transparent
 * one would only show through the rim). The emissive tint gives it the depth of a lit liquid.
 */
const pour = (color: string, deep: string, glow = 0.4, map?: THREE.Texture) =>
  new THREE.MeshPhysicalMaterial({ color, map, emissive: new THREE.Color(deep), emissiveIntensity: glow, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 });

const metal = (color: string, roughness = 0.25) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness });
const BRASS = '#d4ab55';
const SILVER = '#e4e6eb';
const GOLD = '#e2bd68';
const COBALT = '#1d3d8f';

/** Glazed porcelain, plain or painted. */
const porcelain = (map?: THREE.Texture) =>
  new THREE.MeshPhysicalMaterial({ color: '#fbfaf6', map, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });

/** Clear ice: transmissive, so it bends the drink under it. */
const clearIce = () => new THREE.MeshPhysicalMaterial({ color: '#f4f9ff', roughness: 0.1, metalness: 0, transmission: 1, thickness: 0.3, ior: 1.31, specularIntensity: 1 });

/** Where each profile point falls along the profile (0..1 by length). */
function arcV(pts: [number, number][]) {
  const len = [0];
  for (let j = 1; j < pts.length; j++) len.push(len[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
  const total = len[len.length - 1] || 1;
  return len.map((l) => l / total);
}

/** A lathe whose texture v runs by length along the profile, so painted bands land where they are drawn. */
function latheArc(pts: [number, number][], mat: THREE.Material, seg = 64) {
  const geo = new THREE.LatheGeometry(pts.map(([r, y]) => V(r, y)), seg);
  const at = arcV(pts);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i <= seg; i++) for (let j = 0; j < pts.length; j++) uv.setY(i * pts.length + j, at[j]);
  return new THREE.Mesh(geo, mat);
}

/** A thin cylinder from a to b. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, seg = 8, open = false) {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg, 1, open), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A loose spiral rising along +y that narrows toward its end (a citrus twist). */
class Twist extends THREE.Curve<THREE.Vector3> {
  constructor(
    private radius: number,
    private length: number,
    private turns: number,
  ) {
    super();
  }

  getPoint(t: number, out = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    const r = this.radius * (1 - 0.4 * t);
    return out.set(Math.cos(a) * r, t * this.length, Math.sin(a) * r);
  }
}

/** A flat strip `width` wide along a curve (a strip of peel). */
function ribbon(curve: THREE.Curve<THREE.Vector3>, width: number, n: number, mat: THREE.Material) {
  const frames = curve.computeFrenetFrames(n, false);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    curve.getPointAt(i / n, p);
    const b = frames.binormals[i];
    // the strip tapers a little at both ends
    const w = (width / 2) * (1 - 0.45 * Math.abs(i / n - 0.5) * 2);
    pos.push(p.x + b.x * w, p.y + b.y * w, p.z + b.z * w, p.x - b.x * w, p.y - b.y * w, p.z - b.z * w);
    uv.push(i / n, 0, i / n, 1);
    if (i < n) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

const CITRUS = {
  orange: { peel: '#e8731c', pith: '#fbe7c2', flesh: '#f6a033', light: '#ffe2a6', seg: 10 },
  lime: { peel: '#3e8d23', pith: '#eaf3c8', flesh: '#b4d666', light: '#effad0', seg: 9 },
} as const;

/** Orange or lime peel (both sides, for twists and wheels). */
const peel = (kind: 'orange' | 'lime') => new THREE.MeshStandardMaterial({ color: CITRUS[kind].peel, roughness: 0.48, side: THREE.DoubleSide });

/** The cut face of a citrus slice: rind, pith and juicy segments. */
function citrusFace(kind: 'orange' | 'lime') {
  const c = CITRUS[kind];
  return sharedTex(`citrus.${kind}`, 256, 256, (g) => {
    const rnd = seeded(kind === 'orange' ? 5 : 9);
    g.translate(128, 128);
    const disc = (r: number, fill: string | CanvasGradient) => {
      g.fillStyle = fill;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
    };
    disc(128, c.peel);
    disc(117, c.pith);
    const flesh = g.createRadialGradient(0, 0, 6, 0, 0, 108);
    flesh.addColorStop(0, c.light);
    flesh.addColorStop(1, c.flesh);
    for (let k = 0; k < c.seg; k++) {
      const a0 = (k / c.seg) * Math.PI * 2 + 0.05;
      const a1 = ((k + 1) / c.seg) * Math.PI * 2 - 0.05;
      g.fillStyle = flesh;
      g.beginPath();
      g.moveTo(Math.cos((a0 + a1) / 2) * 12, Math.sin((a0 + a1) / 2) * 12);
      g.arc(0, 0, 107, a0, a1);
      g.closePath();
      g.fill();
    }
    // juice cells: short light streaks pointing out from the centre
    g.strokeStyle = 'rgba(255, 255, 240, 0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 150; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 20 + rnd() * 80;
      g.beginPath();
      g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      g.lineTo(Math.cos(a) * (r + 9), Math.sin(a) * (r + 9));
      g.stroke();
    }
    disc(9, c.pith);
  });
}

/** A citrus wheel (or half wheel) of radius r, standing upright with its cut faces toward ±z. */
function citrusWheel(kind: 'orange' | 'lime', r: number, half = false) {
  const face = new THREE.MeshPhysicalMaterial({ map: citrusFace(kind), roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.16, 40, 1, false, 0, half ? Math.PI : Math.PI * 2), [peel(kind), face, face]);
  m.rotation.x = Math.PI / 2;
  return m;
}

/**
 * A citrus wheel slotted onto a glass's rim (rim radius rimR at height rimY), at angle phi around the
 * glass (0 = front, +π/2 = right). The wheel stands in the plane through the glass's axis, so a wheel
 * at the side faces the viewer.
 */
function rimWheel(kind: 'orange' | 'lime', r: number, rimR: number, rimY: number, phi: number) {
  const g = new THREE.Group();
  g.add(citrusWheel(kind, r));
  g.position.set(Math.sin(phi) * rimR, rimY + r * 0.2, Math.cos(phi) * rimR);
  g.rotation.y = phi - Math.PI / 2;
  return g;
}

/** A soft round glow (white, fading out). */
const glowTex = () =>
  sharedTex('glow', 128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.42)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });

/** Warm light thrown on the felt by a lamp or a flame (added light: there is no real lamp in the scene). */
function lightPool(w: number, d: number, color: string, opacity: number) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.position.y = 0.006;
  m.renderOrder = 2;
  return m;
}

/** Paints wood: a base colour with wavy grain streaks along the canvas x. */
function drawGrain(g: CanvasRenderingContext2D, w: number, h: number, base: string, dark: string, light: string, seed: number) {
  const rnd = seeded(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const y = rnd() * h;
    const amp = 2 + rnd() * 6;
    const f = 0.004 + rnd() * 0.01;
    const ph = rnd() * 6;
    g.strokeStyle = rnd() < 0.6 ? dark : light;
    g.globalAlpha = 0.18 + rnd() * 0.3;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = y + Math.sin(x * f + ph) * amp;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** A wood texture (one per key), repeating; `repeat` is how many times it fits in one uv unit. */
function woodTex(key: string, base: string, dark: string, light: string, repeat = 1) {
  const t = sharedTex(`wood.${key}`, 512, 256, (g) => drawGrain(g, 512, 256, base, dark, light, key.length * 31 + 7));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

const lacquer = (map: THREE.Texture, roughness = 0.35) => new THREE.MeshPhysicalMaterial({ map, roughness, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });

/** Text set around a circle, centred at the top (or along the bottom, still upright). */
function ringText(g: CanvasRenderingContext2D, text: string, r: number, step: number, bottom = false) {
  const chars = [...text];
  chars.forEach((ch, i) => {
    const a = (i - (chars.length - 1) / 2) * step;
    g.save();
    g.rotate(bottom ? -a : a);
    g.translate(0, bottom ? r : -r);
    g.fillText(ch, 0, 0);
    g.restore();
  });
}

/** The spade suit, centred on (0, 0), about 2s tall. */
function spadePath(g: CanvasRenderingContext2D, s: number) {
  g.beginPath();
  g.moveTo(0, -s);
  g.bezierCurveTo(s * 0.25, -s * 0.55, s * 0.95, -s * 0.25, s * 0.9, s * 0.2);
  g.bezierCurveTo(s * 0.85, s * 0.6, s * 0.35, s * 0.72, s * 0.08, s * 0.4);
  g.quadraticCurveTo(s * 0.12, s * 0.8, s * 0.42, s * 1.0);
  g.lineTo(-s * 0.42, s * 1.0);
  g.quadraticCurveTo(-s * 0.12, s * 0.8, -s * 0.08, s * 0.4);
  g.bezierCurveTo(-s * 0.35, s * 0.72, -s * 0.85, s * 0.6, -s * 0.9, s * 0.2);
  g.bezierCurveTo(-s * 0.95, -s * 0.25, -s * 0.25, -s * 0.55, 0, -s);
  g.closePath();
}

/** A small engraved metal tag or plate: a border and one or two lines of text. */
function engravedTex(key: string, w: number, h: number, metalColor: string, ink: string, lines: string[]) {
  return sharedTex(key, w, h, (c) => {
    const grad = c.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, metalColor);
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(1, metalColor);
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 0.5;
    c.fillStyle = metalColor;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
    c.strokeStyle = ink;
    c.lineWidth = h * 0.04;
    c.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    lines.forEach((line, i) => {
      const size = i === 0 ? h * 0.42 : h * 0.2;
      c.font = `700 ${size}px Cinzel, serif`;
      const y = lines.length === 1 ? h * 0.54 : i === 0 ? h * 0.44 : h * 0.76;
      c.fillText(line, w / 2, y);
    });
  });
}

/** Rocks glass of whisky on ice. */
export function whisky() {
  const g = new THREE.Group();
  g.add(lathe([[0, 0], [0.4, 0], [0.42, 0.03], [0.43, 0.85], [0.405, 0.85], [0.39, 0.15], [0, 0.15]], crystal()));
  const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.26, 40), liquid('#c9772a', '#8a3d06'));
  drink.position.y = 0.15 + 0.13;
  const a = ice(0.22);
  a.position.set(-0.1, 0.4, 0.05);
  const b = ice(0.2);
  b.position.set(0.12, 0.38, -0.08);
  g.add(drink, a, b);
  return g;
}

/** Caipirinha: a tumbler with crushed ice and lime wedges (the Brazilian tables). */
export function caipirinha() {
  const g = new THREE.Group();
  g.add(lathe([[0, 0], [0.34, 0], [0.36, 0.03], [0.4, 0.95], [0.375, 0.95], [0.34, 0.14], [0, 0.14]], crystal()));
  const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.33, 0.5, 40), liquid('#eef6d2', '#7f9f3a', 0.6));
  drink.position.y = 0.14 + 0.25;
  g.add(drink);
  for (let i = 0; i < 9; i++) {
    const c = ice(0.1 + Math.random() * 0.05);
    const a = (i / 9) * Math.PI * 2;
    c.position.set(Math.cos(a) * 0.18 * Math.random(), 0.45 + Math.random() * 0.25, Math.sin(a) * 0.18 * Math.random());
    g.add(c);
  }
  const peel = new THREE.MeshStandardMaterial({ color: '#3f8f1f', roughness: 0.45 });
  const flesh = new THREE.MeshStandardMaterial({ color: '#c8e07a', roughness: 0.6 });
  for (const [x, z, r] of [
    [0.1, 0.06, 0.4],
    [-0.12, -0.04, 2.2],
  ]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 24, 1, false, 0, Math.PI), [peel, flesh, flesh]);
    w.rotation.set(Math.PI / 2, r, 0);
    w.position.set(x, 0.62, z);
    g.add(w);
  }
  return g;
}

/** The cocktail (martini) glass: 12.3 cm tall, 11 cm across the rim. */
const COCKTAIL_GLASS: [number, number][] = [[0, 0], [0.3, 0], [0.31, 0.015], [0.3, 0.03], [0.06, 0.05], [0.035, 0.09], [0.03, 0.72], [0.05, 0.78], [0.56, 1.22], [0.54, 1.23], [0.04, 0.8], [0, 0.8]];

/** Martini glass with an olive. */
export function martini() {
  const g = new THREE.Group();
  g.add(lathe(COCKTAIL_GLASS, crystal()));
  g.add(lathe([[0, 0.82], [0.44, 1.12], [0, 1.12]], liquid('#f4f1dc', '#9c9760', 0.55)));
  const olive = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), new THREE.MeshStandardMaterial({ color: '#5d7a1f', roughness: 0.35 }));
  olive.scale.set(1, 1.25, 1);
  olive.position.set(0.05, 0.93, 0.02);
  const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6), new THREE.MeshStandardMaterial({ color: '#d9b45c', metalness: 1, roughness: 0.3 }));
  pick.position.set(0.12, 1.08, 0.02);
  pick.rotation.z = -0.5;
  g.add(olive, pick);
  return g;
}

/** Champagne flute. */
export function champagne() {
  const g = new THREE.Group();
  g.add(
    lathe(
      [[0, 0], [0.27, 0], [0.28, 0.015], [0.27, 0.03], [0.04, 0.05], [0.03, 0.1], [0.025, 0.75], [0.06, 0.8], [0.2, 1.0], [0.23, 1.4], [0.24, 1.9], [0.22, 1.9], [0.21, 1.4], [0.18, 1.0], [0.05, 0.82], [0, 0.82]],
      crystal(),
    ),
  );
  g.add(lathe([[0, 0.84], [0.17, 1.0], [0.2, 1.4], [0.205, 1.58], [0, 1.58]], liquid('#f6dc8c', '#a87a18', 0.8)));
  return g;
}

/** Glass of red wine. */
export function wine() {
  const g = new THREE.Group();
  g.add(
    lathe(
      [[0, 0], [0.3, 0], [0.31, 0.015], [0.3, 0.03], [0.05, 0.05], [0.03, 0.1], [0.028, 0.7], [0.1, 0.76], [0.32, 0.95], [0.38, 1.2], [0.33, 1.55], [0.31, 1.55], [0.36, 1.2], [0.3, 0.96], [0.08, 0.8], [0, 0.8]],
      crystal(),
    ),
  );
  g.add(lathe([[0, 0.82], [0.28, 0.95], [0.345, 1.12], [0, 1.12]], liquid('#7a0f1f', '#3a0008', 0.92)));
  return g;
}

/** Towers of chips (the house's bank or a player's winnings). */
export function chipTowers(chips: ChipSet, towers: [number, number][]) {
  const g = new THREE.Group();
  towers.forEach(([v, n], i) => {
    const a = (i / towers.length) * Math.PI * 2 + 0.4;
    const r = towers.length > 1 ? 0.26 : 0;
    new ChipPile(chips, g, new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)).tower(v, n);
  });
  return g;
}

/** High-value rectangular plaques, pearly with gold print (baccarat and high-limit tables). */
export function plaques() {
  const g = new THREE.Group();
  const values = ['25,000', '10,000', '5,000'];
  const tint = ['#f3efe6', '#e8eef7', '#f6eadf'];
  values.forEach((v, i) => {
    const top = canvasTex(512, 330, (c) => {
      const grad = c.createLinearGradient(0, 0, 512, 330);
      grad.addColorStop(0, tint[i]);
      grad.addColorStop(0.5, '#ffffff');
      grad.addColorStop(1, tint[i]);
      c.fillStyle = grad;
      c.fillRect(0, 0, 512, 330);
      c.strokeStyle = '#c9a35a';
      c.lineWidth = 14;
      c.strokeRect(18, 18, 476, 294);
      c.lineWidth = 3;
      c.strokeRect(40, 40, 432, 250);
      c.fillStyle = '#9a7426';
      c.font = '700 96px Cinzel, serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(v, 256, 150);
      c.font = '700 40px Cinzel, serif';
      c.fillText('VILLA LAGO', 256, 238);
    });
    const side = new THREE.MeshPhysicalMaterial({ color: '#efe8da', roughness: 0.25, clearcoat: 1, iridescence: 0.6, iridescenceIOR: 1.4 });
    const face = new THREE.MeshPhysicalMaterial({ map: top, roughness: 0.25, clearcoat: 1, iridescence: 0.5 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.055, 0.56), [side, side, face, side, side, side]);
    m.position.set(i * 0.06, 0.03 + i * 0.058, i * -0.04);
    m.rotation.y = (i - 1) * 0.12;
    g.add(m);
  });
  return g;
}

/** The poker dealer button. */
export function dealerButton() {
  const top = canvasTex(256, 256, (c) => {
    c.fillStyle = '#f7f4ec';
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#1b1b1b';
    c.lineWidth = 8;
    c.beginPath();
    c.arc(128, 128, 112, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#111';
    c.font = '700 50px Cinzel, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('DEALER', 128, 132);
  });
  const side = new THREE.MeshStandardMaterial({ color: '#f1eee6', roughness: 0.35 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 48), [side, new THREE.MeshStandardMaterial({ map: top, roughness: 0.35 }), side]);
  m.position.y = 0.035;
  return m;
}

/** A pair of translucent red casino dice. */
export function dice() {
  const pips: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.25, 0.25], [0.75, 0.75]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.25, 0.22], [0.75, 0.22], [0.25, 0.5], [0.75, 0.5], [0.25, 0.78], [0.75, 0.78]],
  };
  const face = (n: number) =>
    new THREE.MeshPhysicalMaterial({
      color: '#d0141e',
      roughness: 0.12,
      transmission: 0.45,
      thickness: 0.2,
      map: canvasTex(128, 128, (c) => {
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, 128, 128);
        c.fillStyle = '#f4f4f4';
        for (const [x, y] of pips[n]) {
          c.beginPath();
          c.arc(x * 128, y * 128, 11, 0, Math.PI * 2);
          c.fillStyle = '#1a0003';
          c.fill();
        }
      }),
    });
  const mats = [1, 6, 2, 5, 3, 4].map(face);
  const g = new THREE.Group();
  for (const [x, z, ry, rx] of [
    [0, 0, 0.3, 0],
    [0.27, 0.08, 1.1, Math.PI / 2],
  ]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.19, 0.19), mats);
    d.position.set(x, 0.095, z);
    d.rotation.set(rx, ry, 0);
    g.add(d);
  }
  return g;
}

/** Two sealed decks of the house's cards. */
export function decks(back: HTMLCanvasElement | null) {
  const g = new THREE.Group();
  const a = new DeckBox(back);
  const b = new DeckBox(back);
  b.group.position.set(0.12, 0.27, 0.05);
  b.group.rotation.y = 0.25;
  g.add(a.group, b.group);
  g.scale.setScalar(0.92);
  return g;
}

/** Table placard on a brass easel: house name, table name and the play-chips line. */
export function placard(title: string) {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: '#d4ab55', metalness: 1, roughness: 0.28 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.06, 0.34), brass);
  base.position.y = 0.03;
  const tex = canvasTex(640, 400, (c) => {
    const grad = c.createLinearGradient(0, 0, 0, 400);
    grad.addColorStop(0, '#0d1830');
    grad.addColorStop(1, '#060b18');
    c.fillStyle = grad;
    c.fillRect(0, 0, 640, 400);
    c.strokeStyle = '#c9a35a';
    c.lineWidth = 10;
    c.strokeRect(14, 14, 612, 372);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#e6c27a';
    c.font = '700 40px Cinzel, serif';
    c.fillText('VILLA LAGO', 320, 90);
    c.fillStyle = '#fbf5e3';
    let size = 64;
    c.font = `700 ${size}px Cinzel, serif`;
    while (c.measureText(title).width > 560 && size > 30) c.font = `700 ${--size}px Cinzel, serif`;
    c.fillText(title, 320, 200);
    c.fillStyle = '#c9a35a';
    c.font = '600 30px "Barlow Condensed", sans-serif';
    c.fillText('PLAY CHIPS ONLY', 320, 310);
  });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1, 0.62, 0.025), [brass, brass, brass, brass, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }), brass]);
  // leaning back on the easel, so it reads from the seated view
  panel.position.set(0, 0.33, 0);
  panel.rotation.x = -0.75;
  g.add(base, panel);
  return g;
}

/** A cigar's tobacco-leaf wrapper: the spiral seam and fine leaf veins (wraps around the cigar). */
function cigarLeafTex() {
  const leaf = sharedTex('cigar.leaf', 512, 128, (c) => {
    const grd = c.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, '#6b3f1f');
    grd.addColorStop(0.5, '#8a5428');
    grd.addColorStop(1, '#5a3418');
    c.fillStyle = grd;
    c.fillRect(0, 0, 512, 128);
    c.strokeStyle = 'rgba(40, 20, 8, 0.45)';
    c.lineWidth = 2;
    for (let x = -128; x < 640; x += 46) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 128, 128);
      c.stroke();
    }
    c.strokeStyle = 'rgba(160, 110, 60, 0.22)';
    c.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const x = (i * 97) % 512;
      const y = (i * 53) % 128;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 14, y + 6, x + 30, y + (i % 2 ? 10 : -6));
      c.stroke();
    }
  });
  leaf.wrapS = THREE.RepeatWrapping;
  return leaf;
}

/** A cigar band: red and gold, with no brand. */
function cigarBandTex() {
  return sharedTex('cigar.band', 512, 64, (c) => {
    c.fillStyle = '#9c1420';
    c.fillRect(0, 0, 512, 64);
    c.fillStyle = '#d8b660';
    c.fillRect(0, 0, 512, 10);
    c.fillRect(0, 54, 512, 10);
    c.fillStyle = 'rgba(216, 182, 96, 0.85)';
    for (let x = 8; x < 512; x += 32) {
      c.beginPath();
      c.moveTo(x, 32);
      c.lineTo(x + 8, 22);
      c.lineTo(x + 16, 32);
      c.lineTo(x + 8, 42);
      c.closePath();
      c.fill();
    }
  });
}

/**
 * A lit cigar resting on a heavy black glazed ashtray with a gold lip (the foot over the well, the head
 * over the table): tobacco-leaf wrapper, a red and gold band with
 * no brand, grey ash at the tip, a glowing ember and a thin thread of smoke rising from it.
 * Ashtray ≈ 15 cm across, cigar ≈ 15 cm long (Robusto-Churchill size).
 */
export function cigarAshtray() {
  const g = new THREE.Group();

  // the ashtray: a heavy black glazed dish with a sunken well and a gold lip
  const tray = lathe(
    [[0, 0], [0.7, 0], [0.74, 0.03], [0.76, 0.2], [0.7, 0.22], [0.56, 0.2], [0.52, 0.09], [0, 0.085]],
    new THREE.MeshPhysicalMaterial({ color: '#141418', roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3 }),
    64,
  );
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(0.73, 0.018, 10, 72),
    new THREE.MeshStandardMaterial({ color: '#d8b660', metalness: 0.9, roughness: 0.25 }),
  );
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.212;
  g.add(tray, lip);
  // a little grey ash in the well
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), new THREE.MeshStandardMaterial({ color: '#8d8882', roughness: 1, transparent: true, opacity: 0.6 }));
  ash.rotation.x = -Math.PI / 2;
  ash.position.set(0.12, 0.092, -0.05);
  g.add(ash);

  // the cigar, built along +x, then laid in a rest of the rim
  const cigar = new THREE.Group();
  const R = 0.1;
  const L = 1.5;
  const wrapper = new THREE.MeshStandardMaterial({ map: cigarLeafTex(), roughness: 0.78, metalness: 0 });
  // body with a rounded head (the cap) at x = 0 and the lit foot at x = L
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L - 0.24, 32, 1, true), wrapper);
  body.rotation.z = Math.PI / 2;
  body.position.x = (L - 0.24) / 2 + 0.06;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), wrapper);
  cap.rotation.z = Math.PI / 2;
  cap.position.x = 0.06;
  cap.scale.set(1, 0.6, 1);
  // the band: red and gold, near the head, with no brand
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.2, 32, 1, true),
    new THREE.MeshStandardMaterial({ map: cigarBandTex(), roughness: 0.35, metalness: 0.45 }),
  );
  band.rotation.z = Math.PI / 2;
  band.position.x = 0.3;
  // the lit foot: a ring of ember, then soft grey ash
  const ember = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.99, R * 0.99, 0.035, 32),
    new THREE.MeshStandardMaterial({ color: '#ff5a1a', emissive: new THREE.Color('#ff3c00'), emissiveIntensity: 2.2, roughness: 0.9 }),
  );
  ember.rotation.z = Math.PI / 2;
  ember.position.x = L - 0.18 + 0.0175;
  const ashTip = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.93, R * 0.98, 0.16, 32),
    new THREE.MeshStandardMaterial({ color: '#a7a39c', roughness: 1, metalness: 0 }),
  );
  ashTip.rotation.z = Math.PI / 2;
  ashTip.position.x = L - 0.08;
  const tipCap = new THREE.Mesh(new THREE.CircleGeometry(R * 0.93, 32), new THREE.MeshStandardMaterial({ color: '#8f8b85', roughness: 1 }));
  tipCap.rotation.y = Math.PI / 2;
  tipCap.position.x = L;
  cigar.add(body, cap, band, ember, ashTip, tipCap);

  // a thin thread of smoke from the foot (soft sprites drifting up and fading, on a loop)
  const puff = canvasTex(64, 64, (c) => {
    const r = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(235, 235, 240, 0.55)');
    r.addColorStop(1, 'rgba(235, 235, 240, 0)');
    c.fillStyle = r;
    c.fillRect(0, 0, 64, 64);
  });
  const smoke = new THREE.Group();
  smoke.position.set(L + 0.02, 0, 0);
  const t0 = performance.now();
  const puffs = Array.from({ length: 9 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0 }));
    smoke.add(s);
    return { s, phase: i / 9 };
  });
  const drift = () => {
    const t = (performance.now() - t0) / 1000;
    for (const p of puffs) {
      const k = (t / 4.2 + p.phase) % 1;
      p.s.position.set(Math.sin(k * 5 + p.phase * 9) * 0.07 * k, 0.04 + k * 1.1, Math.cos(k * 4 + p.phase * 7) * 0.05 * k);
      const size = 0.08 + k * 0.32;
      p.s.scale.set(size, size, size);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.sin(Math.PI * k) * 0.5 * (1 - k * 0.4);
    }
  };
  // the first puff moves them all, each frame it is drawn
  puffs[0].s.onBeforeRender = drift;
  cigar.add(smoke);

  // resting in a notch of the rim, level: the lit foot over the well, the head out over the table
  const yaw = Math.PI + 0.35;
  const dir = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  cigar.position.copy(dir.clone().multiplyScalar(-L * 0.86)).setY(0.2);
  cigar.rotation.y = yaw;
  cigar.rotation.z = -0.035;
  g.add(cigar);
  return g;
}

// =================================================================== drinks

/**
 * Cognac snifter: a short stem under a balloon that narrows to the rim, with a measure of amber
 * cognac resting in the bottom of the bowl. Real size: 12 cm tall, the bowl 9.5 cm across.
 */
export function cognac() {
  const g = new THREE.Group();
  g.add(
    lathe(
      [
        [0, 0], [0.34, 0], [0.35, 0.012], [0.33, 0.026], [0.08, 0.045], [0.045, 0.075], [0.038, 0.15], [0.05, 0.19],
        [0.12, 0.215], [0.24, 0.26], [0.36, 0.34], [0.44, 0.46], [0.475, 0.6], [0.46, 0.76], [0.4, 0.92], [0.32, 1.06], [0.268, 1.16], [0.262, 1.2],
        [0.25, 1.2], [0.256, 1.16], [0.308, 1.06], [0.388, 0.92], [0.447, 0.76], [0.462, 0.6], [0.428, 0.465], [0.35, 0.35], [0.232, 0.274], [0.11, 0.236], [0, 0.228],
      ],
      crystal(),
      64,
    ),
  );
  g.add(lathe([[0, 0.232], [0.11, 0.24], [0.228, 0.278], [0.344, 0.354], [0.394, 0.42], [0, 0.42]], pour('#b4621c', '#5c2205', 0.5), 64));
  return g;
}

/**
 * Old Fashioned: a heavy octagonal rocks glass of bourbon over one big clear cube, an orange-peel
 * twist and a dark cocktail cherry on a gold pick. Real size: 9 cm tall, 9 cm across.
 */
export function oldFashioned() {
  const g = new THREE.Group();
  const facets = 8;
  const glass = crystal();
  glass.flatShading = true;
  g.add(lathe([[0, 0], [0.43, 0], [0.448, 0.02], [0.452, 0.86], [0.444, 0.9], [0.418, 0.9], [0.41, 0.87], [0.405, 0.25], [0.375, 0.21], [0, 0.21]], glass, facets));
  g.add(lathe([[0, 0.212], [0.37, 0.212], [0.39, 0.245], [0.39, 0.5], [0, 0.5]], pour('#b8661d', '#5e2504', 0.45), facets));
  // one big cube of clear ice, floating half out of the drink
  const cube = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.4, 0.4, 2, 0.05), clearIce());
  cube.position.set(-0.02, 0.48, 0.01);
  cube.rotation.set(0.05, 0.55, -0.04);
  g.add(cube);
  // an orange-peel twist rising out of the glass
  const twist = ribbon(new Twist(0.07, 0.55, 1.7), 0.1, 56, peel('orange'));
  twist.position.set(0.2, 0.52, -0.12);
  twist.rotation.z = -0.4;
  g.add(twist);
  // the cherry, skewered on a gold pick that rests across the ice and the rim
  const gold = metal(GOLD, 0.25);
  const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.068, 20, 14), new THREE.MeshPhysicalMaterial({ color: '#5a0610', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04 }));
  fruit.position.set(-0.08, 0.76, 0.1);
  fruit.scale.set(1, 0.92, 1);
  const end = v3(0.27, 0.92, -0.3);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), gold);
  knob.position.copy(end);
  g.add(fruit, rod(v3(-0.26, 0.72, 0.26), end, 0.008, gold, 6), knob);
  return g;
}

/**
 * Negroni: a tapered tumbler of deep red over a clear ice sphere, an orange wheel slotted on the rim.
 * Real size: 8.6 cm tall, 8.2 cm across.
 */
export function negroni() {
  const g = new THREE.Group();
  g.add(lathe([[0, 0], [0.37, 0], [0.388, 0.02], [0.41, 0.84], [0.403, 0.862], [0.388, 0.86], [0.383, 0.84], [0.36, 0.2], [0.33, 0.17], [0, 0.17]], crystal(), 64));
  g.add(lathe([[0, 0.172], [0.325, 0.172], [0.352, 0.2], [0.37, 0.6], [0, 0.6]], pour('#a5121f', '#4c0309', 0.5), 64));
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.26, 40, 28), clearIce());
  sphere.position.set(-0.09, 0.6, 0.03);
  g.add(sphere, rimWheel('orange', 0.27, 0.395, 0.86, Math.PI * 0.55));
  return g;
}

/**
 * Mojito: a tall highball of muddled mint and lime under crushed ice, a mint sprig, a lime wheel on
 * the rim and a black straw. Real size: 15 cm tall, 7 cm across (the straw rises to 20 cm).
 */
export function mojito() {
  const g = new THREE.Group();
  g.add(lathe([[0, 0], [0.32, 0], [0.336, 0.02], [0.345, 1.5], [0.33, 1.5], [0.322, 0.12], [0.3, 0.1], [0, 0.1]], crystal(), 64));
  // the drink: its painted sides show the muddled mint and lime through the glass
  const P: [number, number][] = [[0, 0.105], [0.29, 0.105], [0.305, 0.13], [0.31, 1.3], [0, 1.3]];
  const at = arcV(P);
  const muddle = sharedTex('mojito', 256, 512, (c) => {
    const rnd = seeded(21);
    const y = (v: number) => (1 - v) * 512;
    const top = y(at[3]);
    const bottom = y(at[2]);
    c.fillStyle = '#e4efd0';
    c.fillRect(0, 0, 256, 512);
    const grad = c.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, '#eef5df');
    grad.addColorStop(0.55, '#dcebc0');
    grad.addColorStop(1, '#9cc65e');
    c.fillStyle = grad;
    c.fillRect(0, top, 256, bottom - top);
    // drawn half as wide: the canvas wraps round the glass, which is shorter round than tall
    const leaf = (x: number, yy: number, len: number, a: number, col: string) => {
      c.save();
      c.translate(x, yy);
      c.scale(0.5, 1);
      c.rotate(a);
      c.fillStyle = col;
      c.beginPath();
      c.ellipse(0, 0, len * 0.38, len, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    };
    for (let i = 0; i < 40; i++) leaf(rnd() * 256, top + (bottom - top) * Math.pow(rnd(), 0.6), 7 + rnd() * 12, rnd() * Math.PI, rnd() < 0.5 ? '#2f7a28' : '#43962f');
    for (let i = 0; i < 10; i++) {
      c.save();
      c.translate(rnd() * 256, top + (bottom - top) * (0.5 + rnd() * 0.5));
      c.scale(0.5, 1);
      c.strokeStyle = '#4f9a26';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(0, 0, 10 + rnd() * 6, 0.2, 2.6);
      c.stroke();
      c.strokeStyle = '#d6ea9c';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 6 + rnd() * 4, 0.3, 2.5);
      c.stroke();
      c.restore();
    }
    c.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let i = 0; i < 90; i++) {
      c.beginPath();
      c.arc(rnd() * 256, top + rnd() * (bottom - top), 0.8 + rnd() * 1.8, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 6; i++) leaf(rnd() * 256, rnd() * top, 6 + rnd() * 8, rnd() * Math.PI, '#3a8a2c');
  });
  g.add(latheArc(P, pour('#ffffff', '#5f8a2c', 0.22, muddle), 64));

  const rnd = seeded(3);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  // crushed ice heaped a little over the rim
  const crushed = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 0), clearIce(), 26);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.21;
    p.set(Math.cos(a) * r, 1.22 + rnd() * 0.24 + (0.21 - r) * 0.4, Math.sin(a) * r);
    e.set(rnd() * 3, rnd() * 3, rnd() * 3);
    const k = 0.75 + rnd() * 0.5;
    s.set(k, k * (0.7 + rnd() * 0.4), k);
    crushed.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s));
  }
  g.add(crushed);
  // a sprig of mint: cupped leaves round a short stem
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.075, 0.05, 0.08, 0.2, 0, 0.32);
  shape.bezierCurveTo(-0.08, 0.2, -0.075, 0.05, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(shape, 6);
  const lp = leafGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < lp.count; i++) lp.setZ(i, 0.6 * lp.getY(i) ** 2 - 0.5 * lp.getX(i) ** 2);
  leafGeo.computeVertexNormals();
  const mint = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, side: THREE.DoubleSide }), 8);
  const shades = ['#3c8f2c', '#4ea33a', '#2f7d25'].map((c) => new THREE.Color(c));
  for (let i = 0; i < 8; i++) {
    const crown = i >= 5;
    const yaw = i * 2.4 + rnd() * 0.4;
    p.set(0.05 + (crown ? 0 : Math.cos(yaw) * 0.03), (crown ? 1.72 : 1.55) + i * 0.012, -0.02 + (crown ? 0 : Math.sin(yaw) * 0.03));
    e.set(crown ? 0.25 + rnd() * 0.3 : 0.9 + rnd() * 0.4, yaw, 0, 'YXZ');
    s.setScalar(crown ? 0.7 : 0.85 + rnd() * 0.2);
    mint.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s));
    mint.setColorAt(i, shades[i % 3]);
  }
  g.add(mint, rod(v3(0.05, 1.35, -0.02), v3(0.05, 1.76, -0.02), 0.012, new THREE.MeshStandardMaterial({ color: '#4f7f2a', roughness: 0.6 }), 6));
  g.add(rimWheel('lime', 0.24, 0.338, 1.5, Math.PI / 2));
  g.add(rod(v3(-0.06, 0.3, -0.06), v3(-0.3, 2.05, -0.17), 0.03, new THREE.MeshPhysicalMaterial({ color: '#141416', roughness: 0.25, clearcoat: 1, side: THREE.DoubleSide }), 16, true));
  return g;
}

/**
 * Margarita: the stepped margarita glass with a salted rim (left bare where the lime wheel sits) and a
 * pale lime drink. Real size: 11.5 cm tall, 12.4 cm across the rim.
 */
export function margarita() {
  const g = new THREE.Group();
  g.add(
    lathe(
      [
        [0, 0], [0.32, 0], [0.33, 0.015], [0.31, 0.03], [0.06, 0.05], [0.035, 0.1], [0.03, 0.55],
        [0.06, 0.6], [0.16, 0.68], [0.2, 0.78], [0.2, 0.83], [0.28, 0.88], [0.5, 0.98], [0.6, 1.1], [0.62, 1.14],
        [0.605, 1.14], [0.585, 1.1], [0.49, 0.99], [0.27, 0.895], [0.19, 0.84], [0.188, 0.78], [0.15, 0.69], [0.05, 0.62], [0, 0.615],
      ],
      crystal(),
      72,
    ),
  );
  g.add(lathe([[0, 0.62], [0.05, 0.625], [0.146, 0.692], [0.183, 0.78], [0.185, 0.842], [0.268, 0.9], [0.485, 0.995], [0.545, 1.06], [0, 1.06]], pour('#e6ebb2', '#8c972b', 0.35), 72));
  // the salt crust runs round the rim, with a gap on the right for the lime
  const gap = Math.PI * 0.45;
  const crust = new THREE.Mesh(new THREE.TorusGeometry(0.613, 0.026, 8, 120, Math.PI * 2 - gap), new THREE.MeshStandardMaterial({ map: saltTex(), bumpMap: saltTex(), bumpScale: 2, roughness: 0.85 }));
  crust.rotation.set(-Math.PI / 2, 0, gap / 2);
  crust.position.y = 1.145;
  g.add(crust, rimWheel('lime', 0.26, 0.613, 1.14, Math.PI / 2));
  return g;
}

/** Coarse white grains (the margarita's salt, the sugar cube). */
function saltTex() {
  const t = sharedTex('salt', 256, 32, (c) => {
    const rnd = seeded(13);
    c.fillStyle = '#f4f2ec';
    c.fillRect(0, 0, 256, 32);
    for (let i = 0; i < 700; i++) {
      const v = Math.round(200 + rnd() * 55);
      c.fillStyle = `rgb(${v}, ${v}, ${v - 6})`;
      c.fillRect(rnd() * 256, rnd() * 32, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(8, 1);
  return t;
}

/**
 * Cosmopolitan: the cocktail glass filled with pink (vodka, cranberry, lime), an orange twist floating
 * across it. Real size: 12.3 cm tall, 11 cm across.
 */
export function cosmopolitan() {
  const g = new THREE.Group();
  g.add(lathe(COCKTAIL_GLASS, crystal(), 64));
  g.add(lathe([[0, 0.815], [0.025, 0.815], [0.4, 1.12], [0, 1.12]], pour('#e04a72', '#7c0f2c', 0.45), 64));
  const twist = ribbon(new Twist(0.045, 0.46, 2.2), 0.075, 64, peel('orange'));
  twist.rotation.z = -Math.PI / 2;
  twist.position.set(-0.22, 1.13, 0.06);
  g.add(twist);
  return g;
}

/**
 * Gin and tonic in a copa (balloon) glass: big clear cubes, a lime wheel and juniper berries floating
 * on the sparkling tonic. Real size: 20 cm tall, the bowl 10.4 cm across.
 */
export function ginTonic() {
  const g = new THREE.Group();
  g.add(
    lathe(
      [
        [0, 0], [0.4, 0], [0.41, 0.015], [0.39, 0.03], [0.06, 0.05], [0.035, 0.1], [0.03, 0.7], [0.07, 0.76],
        [0.25, 0.82], [0.42, 0.95], [0.52, 1.2], [0.5, 1.5], [0.44, 1.75], [0.41, 1.95], [0.405, 2.0],
        [0.393, 2.0], [0.398, 1.95], [0.428, 1.75], [0.488, 1.5], [0.508, 1.2], [0.408, 0.96], [0.24, 0.84], [0.06, 0.79], [0, 0.785],
      ],
      crystal(),
      72,
    ),
  );
  const tonic = sharedTex('tonic', 128, 256, (c) => {
    const rnd = seeded(17);
    c.fillStyle = '#eaf5f1';
    c.fillRect(0, 0, 128, 256);
    c.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (let i = 0; i < 160; i++) {
      c.beginPath();
      c.arc(rnd() * 128, rnd() * 256, 0.6 + rnd() * 1.4, 0, Math.PI * 2);
      c.fill();
    }
    // faint edges of the cubes under the surface
    c.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    c.lineWidth = 2;
    for (let i = 0; i < 4; i++) c.strokeRect(rnd() * 110, 60 + rnd() * 120, 14, 30);
  });
  g.add(latheArc([[0, 0.792], [0.06, 0.797], [0.235, 0.848], [0.398, 0.968], [0.497, 1.2], [0.482, 1.42], [0, 1.42]], pour('#ffffff', '#6aa8bb', 0.25, tonic), 72));
  const cubeGeo = new RoundedBoxGeometry(0.3, 0.3, 0.3, 2, 0.04);
  const iceMat = clearIce();
  for (const [x, y, z, ry, rx] of [
    [-0.17, 1.47, -0.1, 0.4, 0.1],
    [0.15, 1.45, -0.16, 1.1, -0.08],
    [-0.02, 1.68, -0.08, 0.7, 0.25],
  ]) {
    const cube = new THREE.Mesh(cubeGeo, iceMat);
    cube.position.set(x, y, z);
    cube.rotation.set(rx, ry, 0);
    g.add(cube);
  }
  const lime = new THREE.Group();
  lime.add(citrusWheel('lime', 0.19));
  lime.position.set(0.12, 1.47, 0.2);
  lime.rotation.set(-1.0, 0.3, 0);
  g.add(lime);
  // juniper berries, dark blue with a dusty bloom
  const berries = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.036, 14, 10),
    new THREE.MeshPhysicalMaterial({ color: '#2b2d52', roughness: 0.5, sheen: 1, sheenColor: new THREE.Color('#8f9ad0'), sheenRoughness: 0.5 }),
    5,
  );
  [[-0.3, 0.12], [-0.2, 0.24], [0.36, 0.12], [-0.1, 0.34], [0.38, -0.06]].forEach(([x, z], i) => berries.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 1.43, z)));
  g.add(berries);
  return g;
}

/**
 * An espresso (or a Brazilian cafezinho): a porcelain demitasse with crema on its saucer, a silver
 * spoon, and a square of dark chocolate or a sugar cube. `gilt` adds gold rims to cup and saucer.
 * Real size: cup 6.2 cm across and 5.5 cm tall, saucer 12 cm across.
 */
export function espresso(opts: { gilt?: boolean; side?: 'sugar' | 'chocolate' } = {}) {
  const g = new THREE.Group();
  const china = porcelain();
  // the saucer, with a well for the cup
  g.add(lathe([[0, 0.012], [0.28, 0], [0.31, 0.012], [0.34, 0.05], [0.5, 0.1], [0.58, 0.14], [0.6, 0.152], [0.59, 0.162], [0.56, 0.158], [0.48, 0.118], [0.34, 0.078], [0.22, 0.07], [0, 0.07]], china, 72));
  // the cup and its handle (a loop on the right)
  g.add(lathe([[0, 0.07], [0.16, 0.07], [0.175, 0.085], [0.2, 0.12], [0.26, 0.2], [0.295, 0.33], [0.308, 0.5], [0.312, 0.6], [0.306, 0.614], [0.294, 0.6], [0.29, 0.5], [0.276, 0.33], [0.24, 0.21], [0.18, 0.15], [0, 0.14]], china, 72));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.024, 10, 28, Math.PI * 1.4), china);
  handle.position.set(0.37, 0.4, 0);
  handle.rotation.z = -Math.PI * 0.7;
  g.add(handle);
  // the coffee, under a hazelnut crema with darker flecks
  const crema = sharedTex('crema', 256, 256, (c) => {
    const rnd = seeded(29);
    const r = c.createRadialGradient(128, 128, 10, 128, 128, 128);
    r.addColorStop(0, '#d9a56b');
    r.addColorStop(0.6, '#c48a4e');
    r.addColorStop(0.92, '#9a5f2c');
    r.addColorStop(1, '#5a3417');
    c.fillStyle = r;
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * 118;
      c.fillStyle = rnd() < 0.5 ? 'rgba(110, 60, 25, 0.35)' : 'rgba(240, 200, 150, 0.35)';
      c.beginPath();
      c.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1 + rnd() * 2.5, 0, Math.PI * 2);
      c.fill();
    }
  });
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.284, 48), new THREE.MeshPhysicalMaterial({ map: crema, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.52;
  g.add(coffee);
  // things on the saucer sit on its rising slope: r from the centre, az round from the front (+x is right)
  const surface: [number, number][] = [[0, 0.07], [0.22, 0.07], [0.34, 0.078], [0.48, 0.118], [0.56, 0.158]];
  const seat = (o: THREE.Object3D, r: number, az: number) => {
    let k = 1;
    while (k < surface.length - 1 && surface[k][0] < r) k++;
    const [r0, y0] = surface[k - 1];
    const [r1, y1] = surface[k];
    const slope = (y1 - y0) / (r1 - r0);
    const holder = new THREE.Group();
    holder.position.set(Math.sin(az) * r, y0 + slope * (r - r0), Math.cos(az) * r);
    holder.rotation.set(-Math.atan(slope), az, 0, 'YXZ');
    holder.add(o);
    g.add(holder);
  };
  // a silver demitasse spoon at the right, behind the handle, lying along the rim
  const silver = new THREE.MeshStandardMaterial({ color: SILVER, metalness: 1, roughness: 0.18, side: THREE.DoubleSide });
  const spoon = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), silver);
  bowl.scale.set(1, 0.35, 1.5);
  bowl.position.y = 0.022;
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.36), silver);
  stem.position.set(0, 0.03, -0.25);
  stem.rotation.x = 0.05;
  spoon.add(bowl, stem);
  spoon.rotation.y = Math.PI / 2;
  seat(spoon, 0.44, Math.PI / 2 + 0.45);
  // gold rims on cup and saucer
  if (opts.gilt) {
    const gold = metal(GOLD, 0.2);
    for (const [r, y, t] of [
      [0.307, 0.612, 0.007],
      [0.594, 0.158, 0.008],
    ]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, t, 6, 96), gold);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      g.add(ring);
    }
  }
  // a sugar cube or a square of dark chocolate on the saucer, front left
  if ((opts.side ?? 'chocolate') === 'sugar') {
    const cube = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.15, 0.15, 1, 0.015), new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.95, bumpMap: saltTex(), bumpScale: 3 }));
    cube.position.y = 0.077;
    cube.rotation.y = 0.5;
    seat(cube, 0.42, -0.9);
  } else {
    const choc = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.032, 0.17, 1, 0.008), new THREE.MeshPhysicalMaterial({ color: '#3a1d10', roughness: 0.35, clearcoat: 0.3 }));
    choc.position.y = 0.018;
    choc.rotation.y = 0.4;
    seat(choc, 0.42, -0.9);
  }
  return g;
}

/** A cafezinho: the espresso with gold rims and a sugar cube (the Brazilian tables). */
export const cafezinho = () => espresso({ gilt: true, side: 'sugar' });

/**
 * A silver champagne bucket on ice, the bottle's neck rising out of it: dark green glass, gold foil
 * and a house neck label, ring handles on both sides. Real size: bucket 20 cm tall and 19.4 cm across,
 * the bottle 30.7 cm (its foil top stands about 31 cm above the table).
 */
export function champagneBucket() {
  const g = new THREE.Group();
  const silver = metal(SILVER, 0.14);
  g.add(lathe([[0, 0], [0.74, 0], [0.77, 0.02], [0.77, 0.06], [0.73, 0.09], [0.74, 0.14], [0.92, 1.84], [0.95, 1.88], [0.97, 1.93], [0.955, 1.97], [0.93, 1.965], [0.905, 1.9], [0.71, 0.16], [0, 0.16]], silver, 72));
  // a bead round the body, and ring handles hanging from bosses on both sides
  const bead = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.014, 8, 96), silver);
  bead.rotation.x = Math.PI / 2;
  bead.position.y = 1.62;
  g.add(bead);
  for (const s of [-1, 1]) {
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), silver);
    boss.scale.set(0.6, 1, 1);
    boss.position.set(s * 0.925, 1.7, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.026, 10, 40), silver);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(s * 0.96, 1.52, 0);
    g.add(boss, ring);
  }
  // iced water inside
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.88, 48), new THREE.MeshPhysicalMaterial({ color: '#2d3a44', roughness: 0.05, metalness: 0.3, clearcoat: 1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 1.7;
  g.add(water);

  // the bottle, leaning back and to the left
  const bottle = new THREE.Group();
  const greenGlass = new THREE.MeshPhysicalMaterial({ color: '#0f2d1a', roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 });
  bottle.add(lathe([[0, 0.03], [0.37, 0], [0.43, 0.04], [0.44, 0.12], [0.44, 1.85], [0.43, 2.0], [0.38, 2.15], [0.28, 2.32], [0.2, 2.45], [0.155, 2.6], [0.145, 2.85], [0.16, 2.9], [0.16, 3.0], [0.13, 3.06], [0, 3.07]], greenGlass, 48));
  const crinkle = sharedTex('foil', 128, 128, (c) => {
    const rnd = seeded(37);
    c.fillStyle = '#808080';
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 220; i++) {
      c.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
      c.lineWidth = 1 + rnd() * 2;
      const x = rnd() * 128;
      const y = rnd() * 128;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 8);
      c.stroke();
    }
  });
  bottle.add(lathe([[0.215, 2.42], [0.205, 2.46], [0.162, 2.6], [0.152, 2.85], [0.168, 2.9], [0.168, 3.0], [0.138, 3.068], [0, 3.082]], new THREE.MeshStandardMaterial({ color: '#d8b158', metalness: 0.95, roughness: 0.36, bumpMap: crinkle, bumpScale: 1.5 }), 48));
  const neck = sharedTex('bottle.neck', 512, 96, (c) => {
    c.fillStyle = '#101418';
    c.fillRect(0, 0, 512, 96);
    c.fillStyle = GOLD;
    c.fillRect(0, 6, 512, 5);
    c.fillRect(0, 85, 512, 5);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#e8c878';
    c.font = '700 40px Cinzel, serif';
    c.fillText('VILLA LAGO', 256, 50);
    c.font = '600 18px Cinzel, serif';
    c.fillText('BRUT', 70, 50);
    c.fillText('BRUT', 442, 50);
  });
  // the neck label on the shoulder, its middle turned to the front
  const label = latheArc([[0.393, 2.13], [0.345, 2.22], [0.292, 2.31], [0.237, 2.4]], new THREE.MeshStandardMaterial({ map: neck, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide }), 48);
  label.rotation.y = Math.PI;
  bottle.add(label);
  bottle.position.set(0.2, 0.18, 0.05);
  bottle.rotation.set(-0.1, 0, 0.24);
  g.add(bottle);

  // ice heaped round the bottle (kept clear of it)
  const axis = new THREE.Vector3(0, 1.75, 0).applyEuler(bottle.rotation).add(bottle.position);
  const rnd = seeded(41);
  const cubes = new THREE.InstancedMesh(new RoundedBoxGeometry(0.22, 0.2, 0.22, 2, 0.035), clearIce(), 18);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  let n = 0;
  for (let tries = 0; n < 18 && tries < 300; tries++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.25 + rnd() * 0.45;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x - axis.x, z - axis.z) < 0.58) continue;
    p.set(x, 1.72 + rnd() * 0.17, z);
    e.set(rnd() * 2, rnd() * 3, rnd() * 2);
    cubes.setMatrixAt(n++, m.compose(p, q.setFromEuler(e), one));
  }
  cubes.count = n;
  g.add(cubes);
  return g;
}

/**
 * A crystal decanter cut with sixteen flutes, a faceted ball stopper and a silver bottle tag on a
 * chain: whisky (amber, tagged WHISKY) or red wine (tagged CLARET). Real size: 23.7 cm tall with the
 * stopper, 10.4 cm across.
 */
export function decanter(drink: 'whisky' | 'wine' = 'whisky') {
  const g = new THREE.Group();
  const flutes = 16;
  const cut = crystal();
  cut.flatShading = true;
  g.add(
    lathe(
      [
        [0, 0], [0.42, 0], [0.45, 0.03], [0.46, 0.12], [0.5, 0.35], [0.52, 0.6], [0.5, 0.85], [0.42, 1.1], [0.28, 1.32], [0.16, 1.45], [0.12, 1.55], [0.12, 1.78], [0.16, 1.82], [0.17, 1.86],
        [0.1, 1.86], [0.095, 1.78], [0.095, 1.56], [0.13, 1.45], [0.25, 1.32], [0.39, 1.1], [0.475, 0.85], [0.495, 0.6], [0.475, 0.36], [0.43, 0.18], [0, 0.16],
      ],
      cut,
      flutes,
    ),
  );
  const wine = drink === 'wine';
  g.add(lathe([[0, 0.165], [0.415, 0.185], [0.46, 0.36], [0.48, 0.6], [0.47, 0.75], [0, 0.75]], wine ? pour('#6e0c1c', '#2e0007', 0.5) : pour('#b9691f', '#5c2404', 0.45), flutes));
  // the stopper: a plug in the neck, a flange on the lip, a faceted ball
  g.add(lathe([[0, 1.62], [0.085, 1.62], [0.092, 1.86], [0.17, 1.88], [0.17, 1.9], [0.06, 1.92], [0.06, 1.98], [0, 1.98]], crystal(), 32));
  const ballGlass = crystal();
  ballGlass.flatShading = true;
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), ballGlass);
  ball.position.y = 2.15;
  g.add(ball);
  // the silver tag, hung round the neck and lying on the shoulder
  const silver = metal(SILVER, 0.2);
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.007, 6, 48), silver);
  chain.rotation.x = Math.PI / 2 + 0.35;
  chain.position.set(0, 1.5, 0.04);
  const tag = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.33, 0.12),
    new THREE.MeshStandardMaterial({ map: engravedTex(`tag.${drink}`, 256, 96, '#c9ccd2', '#3b3e45', [wine ? 'CLARET' : 'WHISKY']), metalness: 1, roughness: 0.25 }),
  );
  face.position.z = 0.0065;
  tag.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.012), silver), face);
  tag.position.set(0, 1.26, 0.342);
  tag.rotation.x = -0.57;
  g.add(chain, tag);
  for (const s of [-1, 1]) g.add(rod(v3(s * 0.12, 1.315, 0.31), v3(s * 0.05, 1.45, 0.18), 0.005, silver, 5));
  return g;
}

/**
 * Cobalt blue-and-white decoration for a porcelain lathe (canvas x runs round the piece, y along its
 * profile): rim lines, a band of flowers on a scroll and lotus panels near the foot. footV and rimV
 * say where the outer wall starts and ends along the profile (0..1 by length, see arcV).
 */
function blueWhite(key: string, footV: number, rimV: number) {
  return sharedTex(`bw.${key}`, 512, 256, (c) => {
    const y = (v: number) => (1 - v) * 256;
    const span = rimV - footV;
    c.fillStyle = '#f8f8f3';
    c.fillRect(0, 0, 512, 256);
    c.strokeStyle = COBALT;
    c.fillStyle = COBALT;
    const line = (v: number, w: number) => {
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(0, y(v));
      c.lineTo(512, y(v));
      c.stroke();
    };
    line(rimV - span * 0.06, 3);
    line(rimV - span * 0.13, 1.5);
    line(rimV + 0.015, 2);
    line(footV + span * 0.04, 2);
    // the scroll, with a flower in each upper curl and a pair of leaves in each lower one
    const mid = y(footV + span * 0.55);
    const h = Math.max(6, span * 256 * 0.22);
    c.lineWidth = 2;
    c.beginPath();
    for (let x = 0; x <= 512; x += 4) {
      const yy = mid + Math.sin((x / 512) * Math.PI * 10) * h * 0.55;
      if (x === 0) c.moveTo(x, yy);
      else c.lineTo(x, yy);
    }
    c.stroke();
    const pr = Math.min(h * 0.5, 16);
    for (let k = 0; k < 5; k++) {
      const fx = 25.6 + k * 102.4 + 51.2;
      const fy = mid - h * 0.2;
      c.globalAlpha = 0.8;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        c.beginPath();
        c.ellipse(fx + Math.cos(a) * pr * 0.7, fy + Math.sin(a) * pr * 0.7, pr * 0.55, pr * 0.32, a, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
      c.fillStyle = '#f8f8f3';
      c.beginPath();
      c.arc(fx, fy, pr * 0.28, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = COBALT;
      const lx = 25.6 + k * 102.4;
      const ly = mid + h * 0.25;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.ellipse(lx + s * pr * 0.6, ly, pr * 0.55, pr * 0.22, s * 0.5, 0, Math.PI * 2);
        c.fill();
      }
    }
    // lotus panels round the foot
    const p0 = y(footV + span * 0.07);
    const p1 = y(footV + span * 0.24);
    c.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      const x0 = (i / 12) * 512;
      const x1 = ((i + 1) / 12) * 512;
      const xm = (x0 + x1) / 2;
      c.beginPath();
      c.moveTo(x0 + 3, p0);
      c.quadraticCurveTo(x0 + 2, p1 + (p0 - p1) * 0.3, xm, p1);
      c.quadraticCurveTo(x1 - 2, p1 + (p0 - p1) * 0.3, x1 - 3, p0);
      c.globalAlpha = 0.35;
      c.fill();
      c.globalAlpha = 1;
      c.stroke();
    }
  });
}

/** A lathe in painted blue-and-white porcelain; foot and rim are indices of the profile's points. */
function blueWhiteLathe(key: string, pts: [number, number][], foot: number, rim: number, seg = 64) {
  const at = arcV(pts);
  return latheArc(pts, porcelain(blueWhite(key, at[foot], at[rim])), seg);
}

/** A disc of tea, amber at the centre and deeper at the edge, with a few leaves. */
function teaSurface(r: number) {
  const tex = sharedTex('tea', 128, 128, (c) => {
    const grad = c.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, '#d3a446');
    grad.addColorStop(0.8, '#a06c1e');
    grad.addColorStop(1, '#6e4510');
    c.fillStyle = grad;
    c.fillRect(0, 0, 128, 128);
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/**
 * Chinese tea on a rosewood tray (the Dragon Tiger table): a blue-and-white porcelain gaiwan, the lid
 * ajar over the tea, and two small cups of oolong. Real size: tray 21 × 13 cm, gaiwan 8.5 cm tall,
 * cups 5.6 cm across.
 */
export function teaService() {
  const g = new THREE.Group();
  const tray = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.08, 1.3, 2, 0.025), lacquer(woodTex('rosewood', '#3a1810', '#1f0a06', '#5a2a18'), 0.3));
  tray.position.y = 0.04;
  g.add(tray);

  const gaiwan = new THREE.Group();
  gaiwan.add(lathe([[0, 0], [0.28, 0], [0.3, 0.02], [0.48, 0.06], [0.55, 0.085], [0.555, 0.1], [0.54, 0.105], [0.47, 0.08], [0.3, 0.05], [0, 0.05]], porcelain(), 64));
  const saucerLine = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.006, 4, 72), new THREE.MeshStandardMaterial({ color: COBALT, roughness: 0.3 }));
  saucerLine.rotation.x = Math.PI / 2;
  saucerLine.position.y = 0.088;
  gaiwan.add(saucerLine);
  const bowl: [number, number][] = [[0, 0.05], [0.17, 0.05], [0.18, 0.065], [0.19, 0.095], [0.31, 0.2], [0.4, 0.35], [0.44, 0.5], [0.455, 0.54], [0.44, 0.545], [0.42, 0.5], [0.38, 0.36], [0.29, 0.22], [0.17, 0.12], [0, 0.11]];
  gaiwan.add(blueWhiteLathe('gaiwan', bowl, 3, 7));
  const tea = teaSurface(0.392);
  tea.position.y = 0.42;
  gaiwan.add(tea);
  const lidPts: [number, number][] = [[0, 0.075], [0.12, 0.07], [0.28, 0.035], [0.395, 0], [0.415, 0], [0.4, 0.015], [0.28, 0.055], [0.12, 0.09], [0.055, 0.105], [0.075, 0.15], [0.065, 0.17], [0, 0.17]];
  const lid = blueWhiteLathe('lid', lidPts, 5, 8);
  // ajar: one edge down inside the bowl, the other lifted over the rim
  lid.position.set(-0.03, 0.54, 0);
  lid.rotation.z = -0.2;
  gaiwan.add(lid);
  gaiwan.position.set(-0.5, 0.08, 0.02);
  g.add(gaiwan);

  const cupPts: [number, number][] = [[0, 0], [0.11, 0], [0.12, 0.02], [0.13, 0.05], [0.21, 0.15], [0.265, 0.3], [0.28, 0.38], [0.27, 0.385], [0.257, 0.3], [0.2, 0.165], [0.12, 0.09], [0, 0.085]];
  for (const [x, z] of [
    [0.42, -0.25],
    [0.62, 0.3],
  ]) {
    const cup = new THREE.Group();
    cup.add(blueWhiteLathe('cup', cupPts, 3, 6, 48));
    const t = teaSurface(0.25);
    t.position.y = 0.3;
    cup.add(t);
    cup.position.set(x, 0.08, z);
    g.add(cup);
  }
  return g;
}

// =================================================================== casino pieces

/**
 * A banker's lamp, lit: a brass base and stem under a green cased-glass shade that glows green outside
 * and warm white inside, tilted toward the table, with a brass pull chain. It throws a soft pool of
 * light on the felt (painted on: there is no real lamp). Real size: 35 cm tall, the shade 26 cm long.
 */
export function bankersLamp() {
  const g = new THREE.Group();
  const brass = metal(BRASS, 0.22);
  g.add(lathe([[0, 0], [0.6, 0], [0.62, 0.02], [0.62, 0.07], [0.58, 0.1], [0.5, 0.12], [0.42, 0.17], [0.3, 0.21], [0.17, 0.24], [0.11, 0.3], [0.085, 0.38], [0, 0.38]], brass, 64));
  g.add(rod(v3(0, 0.36, 0), v3(0, 3.05, 0), 0.05, brass, 16));
  const knop = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), brass);
  knop.position.y = 1.1;
  knop.scale.set(1, 0.7, 1);
  g.add(knop);

  // the shade: half a cylinder lying along x, open underneath, with rounded ends
  const R = 0.5;
  const L = 2.0;
  const drop = 0.18; // how far the glass comes down past the half
  const body = new THREE.CylinderGeometry(R, R, L, 48, 1, true, -drop, Math.PI + drop * 2).rotateZ(Math.PI / 2);
  const endR = new THREE.SphereGeometry(R, 24, 12, Math.PI / 2, Math.PI, 0, Math.PI / 2 + drop).scale(0.55, 1, 1).translate(L / 2, 0, 0);
  const endL = new THREE.SphereGeometry(R, 24, 12, -Math.PI / 2, Math.PI, 0, Math.PI / 2 + drop).scale(0.55, 1, 1).translate(-L / 2, 0, 0);
  const shadeGeo = mergeGeometries([body, endR, endL]);
  const outer = new THREE.MeshPhysicalMaterial({ color: '#0e5a35', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, emissive: new THREE.Color('#0b4a28'), emissiveIntensity: 0.55 });
  const inner = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.32, 0.95), side: THREE.BackSide });
  const shade = new THREE.Group();
  shade.add(new THREE.Mesh(shadeGeo, outer), new THREE.Mesh(shadeGeo, inner));
  // brass trim along the lower edges and a cap where the stem holds it
  const edgeY = -Math.sin(drop) * R;
  const edgeZ = Math.cos(drop) * R;
  for (const z of [edgeZ, -edgeZ]) shade.add(rod(v3(-L / 2, edgeY, z), v3(L / 2, edgeY, z), 0.014, brass, 8));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.07, 20), brass);
  cap.position.y = R + 0.02;
  shade.add(cap);
  shade.position.set(0, 3.0, 0.14);
  shade.rotation.x = 0.3;
  g.add(shade);

  // the pull chain under the shade's front edge, right side
  const top = v3(0.6, edgeY, edgeZ - 0.02).applyEuler(shade.rotation).add(shade.position);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), brass);
  bead.position.set(top.x, top.y - 0.4, top.z);
  g.add(rod(top, v3(top.x, top.y - 0.37, top.z), 0.008, brass, 6), bead);

  // the light it throws on the felt in front
  const pool = lightPool(2.8, 1.9, '#ffdc96', 0.32);
  pool.position.z = 0.75;
  g.add(pool);
  return g;
}

/**
 * A brass service (hotel) bell on a black lacquered base with a gold pinstripe. Real size: 9 cm across,
 * 7.4 cm tall.
 */
export function serviceBell() {
  const g = new THREE.Group();
  const brass = metal('#d9b25e', 0.14);
  g.add(lathe([[0, 0], [0.43, 0], [0.45, 0.015], [0.455, 0.09], [0.44, 0.115], [0, 0.115]], new THREE.MeshPhysicalMaterial({ color: '#111114', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }), 64));
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.455, 0.006, 6, 96), metal(GOLD, 0.2));
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = 0.058;
  g.add(stripe);
  // the dome, a rolled lip at its foot, the plunger and its knob
  g.add(lathe([[0.395, 0.11], [0.405, 0.13], [0.4, 0.2], [0.375, 0.3], [0.33, 0.4], [0.26, 0.48], [0.17, 0.535], [0.08, 0.56], [0, 0.565]], brass, 64));
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.402, 0.014, 8, 72), brass);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.125;
  const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.11, 16), brass);
  plunger.position.y = 0.61;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.065, 24, 16), brass);
  knob.scale.set(1, 0.62, 1);
  knob.position.y = 0.68;
  g.add(lip, plunger, knob);
  return g;
}

/**
 * A poker card guard: a weighted silver disc with a knurled edge, an engraved ring of lettering and a
 * gold inlay with a black enamel spade. Real size: 5.4 cm across, 1 cm thick.
 */
export function cardGuard() {
  const top = sharedTex('guard.top', 512, 512, (c) => {
    c.translate(256, 256);
    const ring = (r: number) => {
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.stroke();
    };
    // turned silver: a soft gradient with fine lathe rings
    const base = c.createRadialGradient(-60, -80, 20, 0, 0, 256);
    base.addColorStop(0, '#f4f5f8');
    base.addColorStop(1, '#a9adb6');
    c.fillStyle = base;
    c.fillRect(-256, -256, 512, 512);
    c.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    c.lineWidth = 1;
    for (let r = 8; r < 256; r += 3) ring(r);
    // the engraved border: two rings and a band of knurled ticks
    c.strokeStyle = '#3a3d44';
    c.lineWidth = 4;
    ring(244);
    ring(214);
    c.lineWidth = 3;
    for (let k = 0; k < 120; k++) {
      const a = (k / 120) * Math.PI * 2;
      c.beginPath();
      c.moveTo(Math.cos(a) * 218, Math.sin(a) * 218);
      c.lineTo(Math.cos(a) * 240, Math.sin(a) * 240);
      c.stroke();
    }
    c.fillStyle = '#34373e';
    c.font = '700 34px Cinzel, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    ringText(c, 'VILLA LAGO', 183, 0.2);
    ringText(c, 'HIGH LIMIT', 183, 0.2, true);
    for (const a of [Math.PI / 2, -Math.PI / 2]) {
      c.beginPath();
      c.arc(Math.cos(a) * 183, Math.sin(a) * 183, 6, 0, Math.PI * 2);
      c.fill();
    }
    // the gold inlay and the enamel spade
    const gold = c.createRadialGradient(-30, -40, 10, 0, 0, 150);
    gold.addColorStop(0, '#fbe7a8');
    gold.addColorStop(0.6, '#e0b85a');
    gold.addColorStop(1, '#a87a26');
    c.fillStyle = gold;
    c.beginPath();
    c.arc(0, 0, 148, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 5;
    ring(150);
    c.fillStyle = '#121216';
    spadePath(c, 95);
    c.fill();
    c.strokeStyle = 'rgba(232, 200, 120, 0.8)';
    c.lineWidth = 3;
    spadePath(c, 80);
    c.stroke();
  });
  const edge = sharedTex('guard.edge', 512, 16, (c) => {
    c.fillStyle = '#c3c6cc';
    c.fillRect(0, 0, 512, 16);
    c.fillStyle = '#6d7078';
    for (let x = 0; x < 512; x += 4) c.fillRect(x, 0, 2, 16);
  });
  const side = new THREE.MeshStandardMaterial({ map: edge, bumpMap: edge, metalness: 1, roughness: 0.3 });
  const face = new THREE.MeshStandardMaterial({ map: top, bumpMap: top, bumpScale: 1.2, metalness: 1, roughness: 0.26 });
  const R = 0.27;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.96, R, 0.1, 72), [side, face, side]);
  m.position.y = 0.05;
  // the cap's texture runs up toward +x: turn it so the spade stands upright to the player
  m.rotation.y = Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/**
 * A dealer's chip rack in lacquered walnut: five rounded channels with chips standing on edge, some
 * rows full and some part used. Each row is [chip value, how many] (up to 21 fit). The chips are the
 * table's own (ChipSet), drawn as one instanced mesh per value. Real size: 26 × 8.4 cm, 3 cm tall
 * (the chips stand 5 cm).
 */
export function chipRack(
  chips: ChipSet,
  rows: [number, number][] = [
    [25, 20],
    [25, 13],
    [100, 20],
    [100, 16],
    [500, 10],
  ],
) {
  const g = new THREE.Group();
  const pitch = 0.49; // channel spacing
  const rc = 0.222; // channel radius (a chip is 0.21)
  const H = 0.3; // height of the rack; the chips' axis lies along its top
  const D = 0.84; // length of a channel: 21 chips on edge
  const W = rows.length * pitch + 0.12;
  // the cross-section (x across, y up) with a half-round channel per row, run along z
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0);
  s.lineTo(W / 2, 0);
  s.lineTo(W / 2, H);
  for (let i = rows.length - 1; i >= 0; i--) {
    const cx = (i - (rows.length - 1) / 2) * pitch;
    s.lineTo(cx + rc, H);
    s.absarc(cx, H, rc, 0, Math.PI, true);
  }
  s.lineTo(-W / 2, H);
  s.closePath();
  const body = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false, curveSegments: 20 }).translate(0, 0, -D / 2);
  g.add(new THREE.Mesh(body, lacquer(woodTex('walnut', '#4a2a17', '#2a160b', '#6e4428', 0.4), 0.4)));

  // the chips, packed from the back of each channel
  const rnd = seeded(23);
  const byValue = new Map<number, THREE.Matrix4[]>();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const fit = Math.floor((D - 0.04) / CHIP_H);
  rows.forEach(([v, n], i) => {
    const x = (i - (rows.length - 1) / 2) * pitch;
    const list = byValue.get(v) ?? [];
    for (let k = 0; k < Math.min(n, fit); k++) {
      p.set(x + (rnd() - 0.5) * 0.006, H - rc + CHIP_R + 0.002, -D / 2 + 0.03 + CHIP_H * (k + 0.5));
      // spun about its own axis at random, then stood on edge (axis along z)
      e.set(Math.PI / 2 + (rnd() - 0.5) * 0.03, rnd() * Math.PI * 2, 0);
      list.push(new THREE.Matrix4().compose(p, q.setFromEuler(e), one));
    }
    byValue.set(v, list);
  });
  for (const [v, list] of byValue) {
    const im = new THREE.InstancedMesh(chips.geo, chips.mesh(v).material, list.length);
    list.forEach((mat, k) => im.setMatrixAt(k, mat));
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
  }
  return g;
}

/**
 * A cigar humidor in lacquered mahogany, the lid ajar (`open` radians, hinged at the back): a cedar
 * lining, six cigars with red and gold bands, a brass escutcheon and hinges, an engraved brass plate
 * on the lid. Real size: 24 × 17 cm, 7 cm tall closed.
 */
export function humidor(open = 0.5) {
  const g = new THREE.Group();
  const W = 2.4;
  const D = 1.7;
  const H = 0.72;
  const t = 0.07; // wall thickness
  const LT = 0.16; // lid thickness
  const mahogany = lacquer(woodTex('mahogany', '#5a1d10', '#33100a', '#7a3220', 0.4), 0.3);
  const cedar = new THREE.MeshStandardMaterial({ map: woodTex('cedar', '#c48a5c', '#9a6440', '#dcae84', 0.6), roughness: 0.8 });
  const brass = metal(BRASS, 0.25);
  // walls: a rectangular frame extruded upward
  const frame = (w: number, d: number, wall: number, h: number) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -d / 2);
    s.lineTo(w / 2, -d / 2);
    s.lineTo(w / 2, d / 2);
    s.lineTo(-w / 2, d / 2);
    s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-w / 2 + wall, -d / 2 + wall);
    hole.lineTo(-w / 2 + wall, d / 2 - wall);
    hole.lineTo(w / 2 - wall, d / 2 - wall);
    hole.lineTo(w / 2 - wall, -d / 2 + wall);
    hole.closePath();
    s.holes.push(hole);
    return new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2);
  };
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(W, 0.07, D), mahogany);
  bottom.position.y = 0.035;
  // the cedar lining stands a little proud of the walls
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * t - 0.05, 0.02, D - 2 * t - 0.05), cedar);
  floor.position.y = 0.08;
  g.add(new THREE.Mesh(frame(W, D, t, H), mahogany), new THREE.Mesh(frame(W - 2 * t, D - 2 * t, 0.025, H + 0.03), cedar), bottom, floor);

  // six cigars side by side, bands near the head
  const n = 6;
  const cigars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 20).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ map: cigarLeafTex(), roughness: 0.75 }), n);
  const bands = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.104, 0.104, 0.16, 20, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ map: cigarBandTex(), roughness: 0.35, metalness: 0.45 }), n);
  const rnd = seeded(31);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * 0.215;
    const x = (rnd() - 0.5) * 0.12;
    const roll = rnd() * Math.PI * 2;
    cigars.setMatrixAt(i, m.makeRotationX(roll).setPosition(x, 0.19, z));
    bands.setMatrixAt(i, m.makeRotationX(roll).setPosition(x - 0.45, 0.19, z));
  }
  g.add(cigars, bands);

  // brass: the keyhole escutcheon at the front, two hinges at the back
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.014), brass);
  plate.position.set(0, H - 0.17, D / 2 + 0.007);
  const keyhole = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.07, 0.016), new THREE.MeshBasicMaterial({ color: '#0b0705' }));
  keyhole.position.set(0, H - 0.17, D / 2 + 0.008);
  g.add(plate, keyhole);
  for (const x of [-0.75, 0.75]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12).rotateZ(Math.PI / 2), brass);
    hinge.position.set(x, H, -D / 2 - 0.01);
    g.add(hinge);
  }

  // the lid: inlaid with a boxwood line, an engraved brass plate in the middle, cedar inside
  const lidTop = sharedTex('humidor.lid', 512, 384, (c) => {
    drawGrain(c, 512, 384, '#5a1d10', '#33100a', '#7a3220', 77);
    c.strokeStyle = '#d8b98a';
    c.lineWidth = 4;
    c.strokeRect(22, 22, 468, 340);
    c.lineWidth = 2;
    c.strokeRect(34, 34, 444, 316);
  });
  // (a plain box with its top, underside and plate laid on as planes: fewer draw calls)
  const lid = new THREE.Group();
  const flat = (w: number, d: number, mat: THREE.Material, y: number, up: boolean) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2;
    m.position.y = y;
    return m;
  };
  const engraved = new THREE.MeshStandardMaterial({ map: engravedTex('humidor.plate', 384, 128, '#c9a24e', '#3a2a10', ['VILLA LAGO', 'RESERVA']), metalness: 1, roughness: 0.3 });
  lid.add(
    new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, LT, D + 0.04), mahogany),
    flat(W + 0.04, D + 0.04, lacquer(lidTop, 0.3), LT / 2 + 0.002, true),
    flat(W - 2 * t, D - 2 * t, cedar, -LT / 2 - 0.002, false),
    flat(0.72, 0.24, engraved, LT / 2 + 0.005, true),
  );
  lid.position.set(0, LT / 2, (D + 0.04) / 2);
  const hinge = new THREE.Group();
  hinge.position.set(0, H, -D / 2 - 0.02);
  hinge.rotation.x = -open;
  hinge.add(lid);
  g.add(hinge);
  return g;
}

/**
 * A lit taper in a brass candlestick (the gothic Trump 21 table): ivory wax with drips, warm where the
 * flame lights it, a flickering flame with a blue root and a glow, and a pool of candlelight on the
 * felt. Real size: 27 cm to the wick (candlestick 13 cm, candle 14 cm), base 10 cm across.
 */
export function candle() {
  const g = new THREE.Group();
  const brass = metal(BRASS, 0.22);
  g.add(
    lathe(
      [
        [0, 0], [0.5, 0], [0.52, 0.02], [0.5, 0.05], [0.4, 0.07], [0.2, 0.1], [0.13, 0.16], [0.1, 0.24], [0.15, 0.3], [0.1, 0.36], [0.065, 0.45], [0.058, 0.85],
        [0.1, 0.92], [0.07, 0.98], [0.06, 1.04], [0.14, 1.08], [0.22, 1.1], [0.225, 1.125], [0.15, 1.13], [0.125, 1.17], [0.125, 1.3], [0, 1.3],
      ],
      brass,
      64,
    ),
  );
  // the taper: the top of the wax glows in the flame's light
  const glowMap = sharedTex('wax.glow', 16, 256, (c) => {
    const grad = c.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.12, '#8a6038');
    grad.addColorStop(0.35, '#000000');
    c.fillStyle = grad;
    c.fillRect(0, 0, 16, 256);
  });
  const wax = new THREE.MeshPhysicalMaterial({ color: '#f2e8d2', roughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color('#fff4dc'), emissive: new THREE.Color('#ff9a40'), emissiveIntensity: 0.9, emissiveMap: glowMap });
  g.add(latheArc([[0, 1.2], [0.11, 1.2], [0.106, 2.5], [0.1, 2.6], [0.075, 2.64], [0.035, 2.62], [0, 2.62]], wax, 48));
  // drips down the side and two pooled on the drip pan
  const drips = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.022, 0.2, 4, 8), new THREE.MeshPhysicalMaterial({ color: '#f4ebd6', roughness: 0.45, sheen: 0.4 }), 7);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  [
    [0.3, 0.42],
    [1.7, 0.26],
    [2.6, 0.6],
    [3.5, 0.18],
    [4.6, 0.34],
  ].forEach(([a, len], i) => {
    p.set(Math.sin(a) * 0.108, 2.6 - len / 2, Math.cos(a) * 0.108);
    s.set(1, len / 0.244, 0.75);
    drips.setMatrixAt(i, m.compose(p, q.identity(), s));
  });
  [
    [2.6, 0.17],
    [0.5, 0.16],
  ].forEach(([a, r], i) => {
    p.set(Math.sin(a) * r, 1.135, Math.cos(a) * r);
    e.set(Math.PI / 2, 0, a);
    s.set(1.6, 0.35, 1.3);
    drips.setMatrixAt(5 + i, m.compose(p, q.setFromEuler(e), s));
  });
  g.add(drips, rod(v3(0, 2.6, 0), v3(0.01, 2.71, 0), 0.008, new THREE.MeshStandardMaterial({ color: '#1a120c', roughness: 0.9 }), 6));

  // the flame: an outer teardrop, a bright core and a blue root, all added light
  const add = (color: THREE.ColorRepresentation, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = lathe([[0, 0], [0.032, 0.025], [0.046, 0.075], [0.04, 0.14], [0.022, 0.21], [0, 0.27]], add(new THREE.Color(2.2, 1.35, 0.5), 0.9), 24);
  flame.position.set(0.008, 2.68, 0);
  const core = lathe([[0, 0], [0.016, 0.02], [0.022, 0.06], [0.014, 0.11], [0, 0.14]], add(new THREE.Color(2.6, 2.3, 1.7), 0.9), 16);
  core.position.y = 0.01;
  const root = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), add('#3a6cff', 0.45));
  root.position.y = 0.012;
  root.scale.set(1, 0.7, 1);
  flame.add(core, root);
  const glowMat = new THREE.SpriteMaterial({ map: glowTex(), color: '#ffb35a', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(0.9);
  glow.position.set(0, 2.78, 0);
  g.add(flame, glow, lightPool(2.4, 2.4, '#ffb35c', 0.22));
  // a gentle flicker, each frame the flame is drawn
  const t0 = performance.now();
  flame.onBeforeRender = () => {
    const t = (performance.now() - t0) / 1000;
    const f = 1 + 0.08 * Math.sin(t * 11.3) + 0.05 * Math.sin(t * 23.7 + 1.3) + 0.03 * Math.sin(t * 41 + 0.4);
    const w = 1 / Math.sqrt(f);
    flame.scale.set(w, f, w);
    flame.rotation.z = 0.06 * Math.sin(t * 3.1) + 0.03 * Math.sin(t * 8.7);
    glowMat.opacity = 0.42 + (f - 1) * 0.6;
  };
  return g;
}
