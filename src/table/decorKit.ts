import * as THREE from 'three';
import { ChipPile, type ChipSet } from './chips';
import { DeckBox } from './deckBox';

/**
 * Casino table pieces for the PC edition's decor, modelled here (no downloads): crystal glasses
 * with drinks, chip towers, high-value plaques, a dealer button, casino dice, sealed decks and a
 * table placard. One table unit is 10 cm (a card is 6.3 × 8.8 cm); every piece stands at y = 0.
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

/** Martini glass with an olive. */
export function martini() {
  const g = new THREE.Group();
  g.add(lathe([[0, 0], [0.3, 0], [0.31, 0.015], [0.3, 0.03], [0.06, 0.05], [0.035, 0.09], [0.03, 0.72], [0.05, 0.78], [0.56, 1.22], [0.54, 1.23], [0.04, 0.8], [0, 0.8]], crystal()));
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
  const leaf = canvasTex(512, 128, (c) => {
    const grd = c.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, '#6b3f1f');
    grd.addColorStop(0.5, '#8a5428');
    grd.addColorStop(1, '#5a3418');
    c.fillStyle = grd;
    c.fillRect(0, 0, 512, 128);
    // the wrapper's spiral seam and fine leaf veins
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
  const wrapper = new THREE.MeshStandardMaterial({ map: leaf, roughness: 0.78, metalness: 0 });
  // body with a rounded head (the cap) at x = 0 and the lit foot at x = L
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L - 0.24, 32, 1, true), wrapper);
  body.rotation.z = Math.PI / 2;
  body.position.x = (L - 0.24) / 2 + 0.06;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), wrapper);
  cap.rotation.z = Math.PI / 2;
  cap.position.x = 0.06;
  cap.scale.set(1, 0.6, 1);
  // the band: red and gold, near the head, with no brand
  const bandTex = canvasTex(512, 64, (c) => {
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
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.2, 32, 1, true),
    new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.35, metalness: 0.45 }),
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
