import * as THREE from 'three';
import gsap from 'gsap';
import type { App } from '../app';

/**
 * Dev tools for the Game Select previews and the per-table framing (loaded only by `npm run dev`).
 *
 * - `capture(id)`: renders the table as it is now and posts a 16:10 picture of the play area to the
 *   dev server (vite.config.ts), which saves public/assets/previews/<id>.jpg.
 * - `measure()`: the vertical extent (v, 0 = top of the portrait layout frame) of everything on the
 *   table, used to choose each table's band in src/games/pcFraming.ts.
 */
export function installPreviewTools(app: App) {
  const capture = async (id: string) => {
    const st = app.stage;
    st.renderer.render(st.scene, st.camera);
    const src = st.renderer.domElement;
    const k = src.width / st.w;
    const h = (st.play.y + st.play.h) * k;
    const w = Math.min(src.width, h * 1.6);
    const cx = (st.play.x + st.play.w / 2) * k;
    const out = document.createElement('canvas');
    out.width = 960;
    out.height = 600;
    const g = out.getContext('2d')!;
    g.drawImage(src, cx - w / 2, 0, w, h, 0, 0, 960, 600);
    const fr = st.renderer.domElement.getBoundingClientRect();
    const map = (r: DOMRect) => ({ x: ((r.left - fr.left) * k - (cx - w / 2)) * (960 / w), y: (r.top - fr.top) * k * (600 / h), w: r.width * k * (960 / w), h: r.height * k * (600 / h) });
    // Poker Slots: the cabinet is HTML around canvases (the reels and the displays): the body is
    // painted here and the canvases are copied as they are on screen
    const ps = document.querySelector<HTMLElement>('.pslot');
    if (ps) {
      const c = map(ps.getBoundingClientRect());
      const grad = g.createLinearGradient(0, c.y, 0, c.y + c.h);
      grad.addColorStop(0, '#7c1608');
      grad.addColorStop(0.55, '#4a0b04');
      grad.addColorStop(1, '#260402');
      g.fillStyle = grad;
      g.strokeStyle = '#e3b44c';
      g.lineWidth = 5;
      g.beginPath();
      g.roundRect(c.x, c.y, c.w, c.h, 14);
      g.fill();
      g.stroke();
      const title = ps.querySelector<HTMLElement>('.ps-title');
      if (title) {
        const tr = map(title.getBoundingClientRect());
        g.fillStyle = '#f0c96a';
        g.font = `900 ${Math.round(tr.h * 0.85)}px Cinzel, serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(title.textContent ?? '', tr.x + tr.w / 2, tr.y + tr.h / 2);
      }
      ps.querySelectorAll('canvas').forEach((cv) => {
        const r = map(cv.getBoundingClientRect());
        g.fillStyle = '#050505';
        g.fillRect(r.x, r.y, r.w, r.h);
        g.drawImage(cv, r.x, r.y, r.w, r.h);
      });
      const line = ps.querySelector<HTMLElement>('.ps-line');
      if (line) {
        const lr = map(line.getBoundingClientRect());
        g.fillStyle = '#ff3b30';
        g.fillRect(lr.x, lr.y, lr.w, Math.max(2, lr.h));
      }
      ps.querySelectorAll<HTMLElement>('.ps-hold').forEach((b) => {
        const br = map(b.getBoundingClientRect());
        g.fillStyle = '#4a4d52';
        g.strokeStyle = '#e3b44c';
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(br.x, br.y, br.w, br.h, br.h / 2);
        g.fill();
        g.stroke();
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `italic 800 ${Math.round(br.h * 0.5)}px "Barlow Condensed", sans-serif`;
        g.fillText(b.querySelector('span')?.textContent ?? '', br.x + br.w / 2, br.y + br.h / 2);
      });
    }
    // Three Card Slots: its cabinet is HTML, so it is drawn over the picture by hand
    const cab = document.querySelector<HTMLElement>('.slotcab');
    if (cab) {
      const c = map(cab.getBoundingClientRect());
      const grad = g.createLinearGradient(0, c.y, 0, c.y + c.h);
      grad.addColorStop(0, '#5a1022');
      grad.addColorStop(1, '#160308');
      g.fillStyle = grad;
      g.strokeStyle = '#d6b46a';
      g.lineWidth = 4;
      g.beginPath();
      g.roundRect(c.x, c.y, c.w, c.h, 12);
      g.fill();
      g.stroke();
      const title = cab.querySelector<HTMLElement>('.slot-title');
      if (title) {
        const tr = map(title.getBoundingClientRect());
        g.fillStyle = '#e6c27a';
        g.font = `700 ${Math.round(tr.h * 0.8)}px Cinzel, serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(title.textContent ?? '', tr.x + tr.w / 2, tr.y + tr.h / 2);
      }
      cab.querySelectorAll<HTMLElement>('.slot-reel').forEach((reel) => {
        const rr = reel.getBoundingClientRect();
        const m = map(rr);
        g.fillStyle = '#0b0b0e';
        g.fillRect(m.x, m.y, m.w, m.h);
        const hit = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
        const img = hit instanceof HTMLImageElement ? hit : reel.querySelector('img');
        if (img) {
          const ir = map(img.getBoundingClientRect());
          g.save();
          g.beginPath();
          g.rect(m.x, m.y, m.w, m.h);
          g.clip();
          g.drawImage(img, ir.x, ir.y, ir.w, ir.h);
          g.restore();
        }
      });
    }
    const blob = await new Promise<Blob>((r) => out.toBlob((b) => r(b!), 'image/jpeg', 0.86));
    const res = await fetch(`/__preview?id=${id}`, { method: 'POST', body: blob });
    return res.ok;
  };

  const measure = () => {
    const st = app.stage;
    const cam = (st as unknown as { layoutCam: THREE.PerspectiveCamera }).layoutCam;
    const box = new THREE.Box3();
    let v0 = 1;
    let v1 = 0;
    const p = new THREE.Vector3();
    const visit = (o: THREE.Object3D) => {
      if (!o.visible) return;
      box.setFromObject(o);
      if (box.isEmpty()) return;
      for (const x of [box.min.x, box.max.x])
        for (const z of [box.min.z, box.max.z]) {
          p.set(x / st.stretch, 0, z).project(cam);
          const v = (1 - p.y) / 2;
          v0 = Math.min(v0, v);
          v1 = Math.max(v1, v);
        }
    };
    st.table.children.forEach(visit);
    (app.table as unknown as { decals: THREE.Group }).decals.children.forEach(visit);
    return { v0: +v0.toFixed(3), v1: +v1.toFixed(3) };
  };

  Object.assign(app as unknown as Record<string, unknown>, { capturePreview: capture, measureTable: measure, runQueue });

  // A queued run (see runQueue) goes on by itself after each reload: one table per page load, so
  // every table starts from a clean felt.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const until = async (f: () => unknown) => {
    while (!f()) await sleep(150);
  };
  const raw = sessionStorage.getItem(QUEUE);
  if (!raw) return;
  const q = JSON.parse(raw) as Queue;
  // a queue often runs in a window left in the background, where the browser drops to a frame a
  // second or so: let the animations follow the clock instead of slowing down with the frames
  gsap.ticker.lagSmoothing(0);
  void (async () => {
    await until(() => document.querySelector('.sp-go:not([disabled])'));
    document.querySelector<HTMLButtonElement>('.sp-go')!.click();
    await until(() => document.getElementById('title')?.classList.contains('show'));
    await sleep(500);
    document.getElementById('title')!.click();
    await sleep(1200);
    const id = q.ids.shift();
    if (!id) {
      sessionStorage.removeItem(QUEUE);
      return;
    }
    // tap through the opening cardistry show (it speeds up on every tap)
    const tap = setInterval(() => window.dispatchEvent(new PointerEvent('pointerdown')), 250);
    await app.openGame(id);
    clearInterval(tap);
    await sleep(900);
    document.querySelector<HTMLButtonElement>('.betbar:not(.hidden) .vbtn.green')?.click();
    await sleep(q.wait);
    const res = JSON.parse(localStorage.getItem(RESULTS) ?? '{}') as Record<string, unknown>;
    res[id] = q.mode === 'measure' ? measure() : await capture(id);
    localStorage.setItem(RESULTS, JSON.stringify(res));
    if (q.ids.length) sessionStorage.setItem(QUEUE, JSON.stringify(q));
    else sessionStorage.removeItem(QUEUE);
    sessionStorage.setItem('vlc.skipSplash', '1');
    location.reload();
  })();
}

const QUEUE = 'vlc.dev.queue';
const RESULTS = 'vlc.dev.results';
interface Queue {
  mode: 'measure' | 'capture';
  ids: string[];
  wait: number;
}

/** Measures or captures every listed table, one per page load; results in localStorage 'vlc.dev.results'. */
function runQueue(mode: Queue['mode'], ids: string[], wait = 6500) {
  localStorage.removeItem(RESULTS);
  sessionStorage.setItem(QUEUE, JSON.stringify({ mode, ids, wait }));
  sessionStorage.setItem('vlc.skipSplash', '1');
  location.reload();
}
