// UI：2Dエディタ・3Dプレビュー・めいろ生成・zip書き出し。
// 試作版 prototype/src/app.js の移植。形の計算は engine に委ねる。
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ManifoldToplevel, Manifold } from 'manifold-3d';
import {
  P, isSeam, tileCenter, outerDoors,
  buildBin, buildGates, buildShade, toSTL, outlines,
  getManifold, getPart, tileParts, edgeParts,
} from '../engine';
import type { Door, Outlines, BinParams, Dir, TileFeature } from '../engine';
import { zip, type ZipFile } from './zip';
// wasm の URL（Vite が dev/build とも正しい URL に解決する）
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url';

type ToolName = string; // パーツの id か 'erase'（レジストリから動的に決まる）
type ModeName = 'shape' | 'inside' | 'doors';
type TileVal = TileFeature;

interface State {
  name: string;
  cells: Set<string>;
  tiles: Map<string, TileVal>;
  walls: Set<string>;
  doorsOff: Set<string>;
  windows: Set<string>;
  stepH: number;
  color: string;
  mode: ModeName;
  tool: ToolName;
  rampDir: Dir;
  seed: number;
  showGates: boolean;
  showLid: boolean;
  shade: boolean;
}

/* ---------- 状態 ---------- */
const N = 15; // タイル数（4マス分）
const K = (a: number, b: number): string => a + ',' + b;
const state: State = {
  name: 'わたしのへや',
  cells: new Set(['0,0', '1,0', '0,1', '1,1']),
  tiles: new Map(),
  walls: new Set(),
  doorsOff: new Set(),
  windows: new Set(),
  stepH: 5,
  color: '#e9893a',
  mode: 'inside',
  tool: 'wall',
  rampDir: 'E',
  seed: 7,
  showGates: true,
  showLid: false,
  shade: false,
};

// はじめの見本：へやわけ＋だん＋さか＋みずば＋いわ
function sample(): void {
  state.tiles.clear(); state.walls.clear(); state.doorsOff.clear(); state.windows.clear();
  for (let ty = 0; ty <= 6; ty++) if (ty !== 1 && ty !== 5) state.walls.add(`v:2,${ty}`);
  for (let tx = 0; tx <= 2; tx++) if (tx !== 1) state.walls.add(`h:${tx},2`);
  state.tiles.set('4,4', { type: 'ramp', dir: 'E' });
  state.tiles.set('5,4', { type: 'step' }); state.tiles.set('6,4', { type: 'step' });
  state.tiles.set('5,5', { type: 'step' }); state.tiles.set('6,5', { type: 'step' });
  state.tiles.set('0,5', { type: 'pond' }); state.tiles.set('1,5', { type: 'pond' });
  state.tiles.set('0,6', { type: 'pond' }); state.tiles.set('1,6', { type: 'pond' });
  state.tiles.set('5,1', { type: 'rock' }); state.tiles.set('4,0', { type: 'rock' });
  state.tiles.set('3,4', { type: 'tunnel', dir: 'E' }); // トンネルの見本
  state.doorsOff.add('0,0,W'); state.doorsOff.add('1,1,E');
  state.windows.add('1,0,S'); // まどの見本
}
sample();

/* ---------- 形の判定 ---------- */
const cellList = (): [number, number][] => [...state.cells].map((s) => s.split(',').map(Number) as [number, number]);
const has = (i: number, j: number): boolean => state.cells.has(K(i, j));
function cellsOf(t: number): number[] { return isSeam(t) ? [(t - 3) / 4, (t + 1) / 4] : [Math.floor(t / 4)]; }
function usable(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= N || ty >= N) return false;
  for (const i of cellsOf(tx)) for (const j of cellsOf(ty)) if (!has(i, j)) return false;
  return true;
}
function edgeOK(e: string): boolean {
  const [o, a, b] = e.split(/[:,]/); const tx = +a, ty = +b;
  return o === 'v' ? usable(tx, ty) && usable(tx + 1, ty) : usable(tx, ty) && usable(tx, ty + 1);
}
function connected(set: Set<string>): boolean {
  const arr = [...set]; if (!arr.length) return false;
  const seen = new Set([arr[0]]); const q = [arr[0]];
  while (q.length) {
    const [i, j] = q.pop()!.split(',').map(Number);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = K(i + di, j + dj);
      if (set.has(k) && !seen.has(k)) { seen.add(k); q.push(k); }
    }
  }
  return seen.size === arr.length;
}
function doorTile(d: Door): [number, number] {
  const bx = 4 * d.i, by = 4 * d.j;
  return { N: [bx + 1, by + 2], S: [bx + 1, by], E: [bx + 2, by + 1], W: [bx, by + 1] }[d.d] as [number, number];
}
const doors = (): Door[] => outerDoors(cellList());
// あいている扉＝ふさいでもなく、まどでもない（ゲートを差す対象）
const openDoors = (): Door[] => doors().filter((d) => !state.doorsOff.has(d.id) && !state.windows.has(d.id));

/* ---------- 乱数とめいろ ---------- */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function allEdges(): string[] {
  const out: string[] = [];
  for (let tx = 0; tx < N; tx++) for (let ty = 0; ty < N; ty++) {
    if (!usable(tx, ty)) continue;
    if (usable(tx + 1, ty)) out.push(`v:${tx},${ty}`);
    if (usable(tx, ty + 1)) out.push(`h:${tx},${ty}`);
  }
  return out;
}
function makeMaze(seed: number, loops = 0.08): void {
  const R = rng(seed * 9973 + 17);
  const cells: [number, number][] = [];
  for (let tx = 0; tx < N; tx++) for (let ty = 0; ty < N; ty++) if (usable(tx, ty)) cells.push([tx, ty]);
  const open = new Set<string>(), seen = new Set<string>();
  const start = cells[Math.floor(R() * cells.length)];
  const stack: [number, number][] = [start]; seen.add(K(start[0], start[1]));
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const nb = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]).map(([dx, dy]) => [x + dx, y + dy] as [number, number])
      .filter(([a, b]) => usable(a, b) && !seen.has(K(a, b)));
    if (!nb.length) { stack.pop(); continue; }
    const [a, b] = nb[Math.floor(R() * nb.length)];
    open.add(a > x ? `v:${x},${y}` : a < x ? `v:${a},${b}` : b > y ? `h:${x},${y}` : `h:${a},${b}`);
    seen.add(K(a, b)); stack.push([a, b]);
  }
  state.walls = new Set(allEdges().filter((e) => !open.has(e) && R() > loops));
}
function makeRooms(): void {
  state.walls.clear();
  for (const [i, j] of cellList()) {
    if (has(i + 1, j)) for (let k = 0; k < 3; k++) if (k !== 1) state.walls.add(`v:${4 * i + 2},${4 * j + k}`);
    if (has(i, j + 1)) for (let k = 0; k < 3; k++) if (k !== 1) state.walls.add(`h:${4 * i + k},${4 * j + 2}`);
  }
}
function scatterRocks(seed: number): void {
  const R = rng(seed * 31 + 5);
  const blocked = new Set(openDoors().map((d) => K(...doorTile(d))));
  for (let tx = 0; tx < N; tx++) for (let ty = 0; ty < N; ty++) {
    if (!usable(tx, ty) || blocked.has(K(tx, ty)) || state.tiles.has(K(tx, ty))) continue;
    if (R() < 0.16) state.tiles.set(K(tx, ty), { type: 'rock' });
  }
}

/* ---------- DOM ---------- */
const $ = <T extends Element = HTMLElement>(s: string): T => document.querySelector(s) as T;
const cv = $<HTMLCanvasElement>('#editor');
const ctx = cv.getContext('2d')!;
const hint = $('#hint');
const toast = $('#toast');
let W: ManifoldToplevel | null = null;
let geo: Outlines | null = null;
let lastMesh: Manifold | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let pending: ReturnType<typeof setTimeout> | undefined;
let lastCellsKey = '';

function css(v: string): string { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function say(msg: string): void {
  toast.textContent = msg; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (toast.hidden = true), 2600);
}

const HINTS = {
  shape: 'マスをタップして、つかう マスを えらぼう。となりあった マスどうしは 1つの へやに なるよ。',
  doors: 'とびらを タップすると、あける→ふさぐ→まど の じゅんに かわるよ。あけた とびらには ゲートを させるよ。',
};
const ERASE_HINT = 'なぞった ところの かべや ものを けすよ。';

/* ---------- 2Dエディタ ---------- */
const VIEW = { pad: 8, size: 168 };
let scale = 1, dpr = 1;
function resize(): void {
  const r = cv.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.width * dpr);
  scale = (r.width * dpr) / (VIEW.size + VIEW.pad * 2);
  draw();
}
const sx = (x: number): number => (x + VIEW.pad) * scale;
const sy = (y: number): number => (VIEW.size + VIEW.pad - y) * scale;
function toWorld(ev: PointerEvent): [number, number] {
  const r = cv.getBoundingClientRect();
  const px = (ev.clientX - r.left) * dpr, py = (ev.clientY - r.top) * dpr;
  return [px / scale - VIEW.pad, VIEW.size + VIEW.pad - py / scale];
}
function polyPath(polys: number[][][]): Path2D {
  const p = new Path2D();
  for (const poly of polys) { poly.forEach(([x, y], k) => (k ? p.lineTo(sx(x), sy(y)) : p.moveTo(sx(x), sy(y)))); p.closePath(); }
  return p;
}
function rr(x0: number, y0: number, x1: number, y1: number, r: number): Path2D {
  const p = new Path2D();
  p.roundRect(sx(x0), sy(y1), (x1 - x0) * scale, (y1 - y0) * scale, r * scale); return p;
}

interface Pick { cell?: [number, number]; tile?: [number, number]; edge?: string; door?: Door | null; }
let hover: Pick | null = null;

function draw(): void {
  if (!cv.width) return;
  const c = ctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  const col = {
    slot: css('--slot'), body: state.color, floor: css('--floor'), grid: css('--grid'), ink: css('--ink'),
    wall: css('--part'), rock: css('--rock'), step: css('--step'), pond: css('--pond'), gate: css('--gate'),
    hi: css('--accent'), seam: css('--seam'),
  };
  // ベースプレートの16マス
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    c.fillStyle = col.slot; c.fill(rr(42 * i + 1.5, 42 * j + 1.5, 42 * i + 40.5, 42 * j + 40.5, 4));
  }
  if (state.mode === 'shape' && hover && hover.cell) {
    const [i, j] = hover.cell; c.strokeStyle = col.hi; c.lineWidth = 2 * dpr;
    c.stroke(rr(42 * i + 1, 42 * j + 1, 42 * i + 41, 42 * j + 41, 4.5));
  }
  if (!geo) return;
  c.fillStyle = col.body; c.fill(polyPath(geo.outer), 'evenodd');
  const inner = polyPath(geo.inner);
  c.fillStyle = col.floor; c.fill(inner, 'evenodd');

  c.save(); c.clip(inner, 'evenodd');
  // タイルの目
  c.strokeStyle = col.grid; c.lineWidth = 1 * dpr;
  for (let t = 0; t <= N; t++) {
    const v = 5.25 + 10.5 * t;
    c.beginPath(); c.moveTo(sx(v), sy(0)); c.lineTo(sx(v), sy(168)); c.stroke();
    c.beginPath(); c.moveTo(sx(0), sy(v)); c.lineTo(sx(168), sy(v)); c.stroke();
  }
  // 継ぎ目（みずばツールのとき）
  if (state.mode === 'inside' && state.tool === 'pond') {
    c.fillStyle = col.seam;
    for (let tx = 0; tx < N; tx++) for (let ty = 0; ty < N; ty++) {
      if (!usable(tx, ty) || !(isSeam(tx) || isSeam(ty))) continue;
      const x = tileCenter(tx), y = tileCenter(ty);
      c.fillRect(sx(x - 5.25), sy(y + 5.25), 10.5 * scale, 10.5 * scale);
    }
  }
  // タイルの中身（レジストリのパーツが描く）
  for (const [k, v] of state.tiles) {
    const [tx, ty] = k.split(',').map(Number);
    if (!usable(tx, ty)) continue;
    const part = getPart(v.type);
    if (!part || part.domain !== 'tile') continue;
    if (part.canPlace && !part.canPlace({ tx, ty, isSeam }).ok) continue; // 継ぎ目のみずば等は描かない
    const x = tileCenter(tx), y = tileCenter(ty);
    part.draw2d({ c, x, y, h: 5.25, sx, sy, scale, dpr, rr, col, dir: v.dir ?? 'E' });
  }
  // しきり（edge パーツ）
  const wallPart = getPart('wall');
  if (wallPart && wallPart.domain === 'edge') {
    for (const e of state.walls) {
      if (!edgeOK(e)) continue;
      const [o, a, b] = e.split(/[:,]/); const tx = +a, ty = +b;
      const x = o === 'v' ? tileCenter(tx) + 5.25 : tileCenter(tx);
      const y = o === 'v' ? tileCenter(ty) : tileCenter(ty) + 5.25;
      wallPart.draw2d({ c, o: o as 'v' | 'h', x, y, sx, sy, scale, dpr, rr, col });
    }
  }
  if (hover && hover.edge && state.mode === 'inside' && (state.tool === 'wall' || state.tool === 'erase')) {
    const e = hover.edge; const [o, a, b] = e.split(/[:,]/); const tx = +a, ty = +b;
    c.fillStyle = col.hi; c.globalAlpha = 0.6;
    if (o === 'v') { const x = tileCenter(tx) + 5.25, y = tileCenter(ty); c.fillRect(sx(x - 1), sy(y + 5.25), 2 * scale, 10.5 * scale); }
    else { const x = tileCenter(tx), y = tileCenter(ty) + 5.25; c.fillRect(sx(x - 5.25), sy(y + 1), 10.5 * scale, 2 * scale); }
    c.globalAlpha = 1;
  }
  if (hover && hover.tile && state.mode === 'inside' && state.tool !== 'wall') {
    const [tx, ty] = hover.tile; const x = tileCenter(tx), y = tileCenter(ty);
    c.strokeStyle = col.hi; c.lineWidth = 2 * dpr; c.strokeRect(sx(x - 5.25), sy(y + 5.25), 10.5 * scale, 10.5 * scale);
  }
  c.restore();

  // とびら／まど
  const winPart = getPart('window');
  for (const d of doors()) {
    const win = state.windows.has(d.id);
    const off = state.doorsOff.has(d.id);
    const cx = 42 * d.i + 21, cy = 42 * d.j + 21, f = 20.75;
    const vert = d.d === 'N' || d.d === 'S';
    const s = d.d === 'N' || d.d === 'E' ? 1 : -1;
    const along = vert ? cx : cy;
    if (win && winPart && winPart.domain === 'perimeter') {
      winPart.draw2d({ c, i: d.i, j: d.j, d: d.d, cx, cy, sx, sy, scale, dpr, rr, col });
    } else if (!off) {
      // 扉の穴（床色）とゲート溝
      c.fillStyle = col.floor;
      if (vert) c.fillRect(sx(along - 6), sy(cy + s * f + (s > 0 ? 0 : 6)), 12 * scale, 6 * scale);
      else c.fillRect(sx(cx + s * f - (s > 0 ? 6 : 0)), sy(along + 6), 6 * scale, 12 * scale);
      const g0 = f - 1.1 - 2.6;
      c.fillStyle = state.showGates ? col.gate : col.ink; c.globalAlpha = state.showGates ? 1 : 0.35;
      if (vert) c.fillRect(sx(along - 8.2), sy(cy + s * (g0 + (s > 0 ? 2.6 : 0))), 16.4 * scale, 2.6 * scale);
      else c.fillRect(sx(cx + s * (g0 + (s > 0 ? 0 : 2.6))), sy(along + 8.2), 2.6 * scale, 16.4 * scale);
      c.globalAlpha = 1;
    }
    if (state.mode === 'doors') {
      const px = vert ? along : cx + s * (f - 3), py = vert ? cy + s * (f - 3) : along;
      c.beginPath(); c.arc(sx(px), sy(py), 5.2 * scale, 0, 7);
      c.lineWidth = 2 * dpr; c.strokeStyle = col.hi;
      c.setLineDash(off || win ? [3 * dpr, 3 * dpr] : []); c.stroke(); c.setLineDash([]);
      if (off) {
        c.strokeStyle = col.ink; c.lineWidth = 1.6 * dpr; const q = 2.2 * scale;
        c.beginPath(); c.moveTo(sx(px) - q, sy(py) - q); c.lineTo(sx(px) + q, sy(py) + q);
        c.moveTo(sx(px) + q, sy(py) - q); c.lineTo(sx(px) - q, sy(py) + q); c.stroke();
      } else if (win) {
        c.fillStyle = 'rgba(120,185,225,.95)';
        c.fillRect(sx(px) - 2.3 * scale, sy(py) - 2.3 * scale, 4.6 * scale, 4.6 * scale);
      }
    }
  }
}

/* ---------- ポインター操作 ---------- */
function pick(x: number, y: number): Pick {
  const out: Pick = {};
  if (x >= 0 && y >= 0 && x < 168 && y < 168) out.cell = [Math.floor(x / 42), Math.floor(y / 42)];
  const u = (x - 5.25) / 10.5, v = (y - 5.25) / 10.5;
  const tx = Math.floor(u), ty = Math.floor(v), fx = (u - tx) * 10.5, fy = (v - ty) * 10.5;
  if (usable(tx, ty)) out.tile = [tx, ty];
  const cand: [number, string][] = [[fx, `v:${tx - 1},${ty}`], [10.5 - fx, `v:${tx},${ty}`], [fy, `h:${tx},${ty - 1}`], [10.5 - fy, `h:${tx},${ty}`]];
  cand.sort((a, b) => a[0] - b[0]);
  if (cand[0][0] < 2.8 && edgeOK(cand[0][1])) out.edge = cand[0][1];
  let best: Door | null = null, bd = 9;
  for (const d of doors()) {
    const cx = 42 * d.i + 21, cy = 42 * d.j + 21, f = 18;
    const p = { N: [cx, cy + f], S: [cx, cy - f], E: [cx + f, cy], W: [cx - f, cy] }[d.d];
    const dist = Math.hypot(p[0] - x, p[1] - y);
    if (dist < bd) { bd = dist; best = d; }
  }
  out.door = best;
  return out;
}
interface Drag { add: boolean; rotated?: boolean; }
let drag: Drag | null = null;
function applyAt(h: Pick, first: boolean): boolean {
  const d = drag!;
  if (state.mode === 'inside') {
    const t = state.tool;
    const part = getPart(t);
    if (part && part.domain === 'edge') { // かべ など、境目に置くパーツ
      if (!h.edge) return false;
      if (first) d.add = !state.walls.has(h.edge);
      if (d.add) state.walls.add(h.edge); else state.walls.delete(h.edge);
      return true;
    }
    if (t === 'erase') {
      let ch = false;
      if (h.edge && state.walls.delete(h.edge)) ch = true;
      if (h.tile && state.tiles.delete(K(...h.tile))) ch = true;
      return ch;
    }
    if (!h.tile || !part || part.domain !== 'tile') return false;
    const k = K(...h.tile), cur = state.tiles.get(k);
    if (part.rotatable && first && cur && cur.type === t) { // さか・トンネルは向きを変える
      const order: Dir[] = ['E', 'N', 'W', 'S'];
      cur.dir = order[(order.indexOf(cur.dir || 'E') + 1) % 4]; state.rampDir = cur.dir; d.rotated = true; return true;
    }
    if (d.rotated) return false;
    if (part.canPlace) {
      const res = part.canPlace({ tx: h.tile[0], ty: h.tile[1], isSeam });
      if (!res.ok) { if (first && res.reason) say(res.reason); return false; }
    }
    if (first) d.add = !(cur && cur.type === t);
    if (d.add) state.tiles.set(k, (part.rotatable ? { type: t, dir: state.rampDir } : { type: t }) as TileVal);
    else if (cur && cur.type === t) state.tiles.delete(k);
    return true;
  }
  if (!first) return false;
  if (state.mode === 'shape' && h.cell) {
    const k = K(...h.cell), next = new Set(state.cells);
    if (next.has(k)) next.delete(k); else next.add(k);
    if (!next.size) { say('マスが 1つは ないと つくれないよ'); return false; }
    if (!connected(next)) { say('マスどうしが つながっていないと 1つの パーツに ならないよ'); return false; }
    state.cells = next; return true;
  }
  if (state.mode === 'doors' && h.door) {
    const id = h.door.id;
    // あける → ふさぐ → まど → あける の3状態をまわす
    if (state.windows.has(id)) state.windows.delete(id);
    else if (state.doorsOff.has(id)) { state.doorsOff.delete(id); state.windows.add(id); }
    else state.doorsOff.add(id);
    return true;
  }
  return false;
}
cv.addEventListener('pointerdown', (ev) => {
  cv.setPointerCapture(ev.pointerId);
  drag = { add: true };
  const h = pick(...toWorld(ev)); hover = h;
  if (applyAt(h, true)) changed(); else draw();
});
cv.addEventListener('pointermove', (ev) => {
  const h = pick(...toWorld(ev)); hover = h;
  if (drag && ev.buttons && applyAt(h, false)) changed(); else draw();
});
const endDrag = (): void => { drag = null; };
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('pointerleave', () => { hover = null; draw(); });

/* ---------- 3Dプレビュー ---------- */
const host = $('#view3d');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.target.set(84, 84, 8);
camera.position.set(84 - 150, 84 - 230, 210);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a7a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-80, -160, 260); scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.7); fill.position.set(200, 220, 120); scene.add(fill);
const plate = new THREE.Group(); scene.add(plate);
const binMat = new THREE.MeshStandardMaterial({ color: state.color, roughness: 0.55, metalness: 0, flatShading: true });
const binMesh = new THREE.Mesh(new THREE.BufferGeometry(), binMat); scene.add(binMesh);
const gateGroup = new THREE.Group(); scene.add(gateGroup);
const lidMesh = new THREE.Mesh(new THREE.BufferGeometry(),
  new THREE.MeshStandardMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.35, roughness: 0.1 }));
scene.add(lidMesh);
const shadeMesh = new THREE.Mesh(new THREE.BoxGeometry(20.5, 41, 1), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 }));
scene.add(shadeMesh);

function buildPlate(): void {
  plate.clear();
  const m = new THREE.MeshStandardMaterial({ color: css('--plate') || '#bfc4bd', roughness: 0.8 });
  for (let k = 0; k <= 4; k++) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(168, 1.6, 4.6), m); a.position.set(84, 42 * k, 2.3); plate.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 168, 4.6), m); b.position.set(42 * k, 84, 2.3); plate.add(b);
  }
}
function size3d(): void {
  const r = host.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}
(function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();

function meshToGeometry(man: Manifold): THREE.BufferGeometry {
  const m = man.getMesh();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.vertProperties), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(m.triVerts), 1));
  const ng = g.toNonIndexed(); ng.computeVertexNormals(); g.dispose();
  return ng;
}

/* ---------- 再計算 ---------- */
function params(): BinParams {
  const tiles: Record<string, TileFeature> = {};
  for (const [k, v] of state.tiles) { const [a, b] = k.split(',').map(Number); if (usable(a, b)) tiles[k] = v; }
  const doorIds = new Set(doors().map((d) => d.id));
  return {
    cells: cellList(), tiles, walls: [...state.walls].filter(edgeOK),
    closedDoors: [...state.doorsOff], windows: [...state.windows].filter((id) => doorIds.has(id)),
    stepH: state.stepH,
  };
}
function changed(): void { draw(); updateInfo(); clearTimeout(pending); pending = setTimeout(rebuild, 90); }
function rebuild(): void {
  if (!W) return;
  geo = outlines(W, cellList());
  if (lastMesh) lastMesh.delete();
  lastMesh = buildBin(W, params());
  const old = binMesh.geometry; binMesh.geometry = meshToGeometry(lastMesh); old.dispose();
  binMat.color.set(state.color);
  const bb = bbox(), key2 = [...state.cells].sort().join('|');
  if (key2 !== lastCellsKey) {
    lastCellsKey = key2;
    const tx = 42 * bb.x0 + 21 * bb.nx, ty = 42 * bb.y0 + 21 * bb.ny;
    const dx = tx - controls.target.x, dy = ty - controls.target.y;
    controls.target.set(tx, ty, 8); camera.position.x += dx; camera.position.y += dy;
  }
  // ゲート
  gateGroup.clear();
  if (state.showGates) {
    const gm = new THREE.MeshStandardMaterial({ color: css('--gate'), roughness: 0.5 });
    for (const d of openDoors()) {
      const cx = 42 * d.i + 21, cy = 42 * d.j + 21, off = 20.75 - 1.1 - 1.3;
      const vert = d.d === 'N' || d.d === 'S';
      const g = new THREE.Mesh(new THREE.BoxGeometry(vert ? 15.4 : 2, vert ? 2 : 15.4, 21), gm);
      const s = d.d === 'N' || d.d === 'E' ? 1 : -1;
      g.position.set(vert ? cx : cx + s * off, vert ? cy + s * off : cy, 6.5 + 10.5);
      gateGroup.add(g);
    }
  }
  // フタ
  lidMesh.visible = state.showLid;
  if (state.showLid && geo) {
    const shapes = geo.lid.map((poly) => new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y))));
    const old2 = lidMesh.geometry;
    lidMesh.geometry = new THREE.ExtrudeGeometry(shapes, { depth: 0.5, bevelEnabled: false });
    lidMesh.position.z = P.ledgeZ; old2.dispose();
  }
  // 遮光板：最初のマスの左半分に置く
  shadeMesh.visible = state.shade;
  if (state.shade) {
    const [i, j] = cellList().sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
    shadeMesh.position.set(42 * i + 0.25 + 10.25, 42 * j + 21, P.top + (state.showLid ? 0.6 : 0) + 0.5);
  }
  draw(); updateInfo();
}

/* ---------- 情報 ---------- */
function bbox(): { nx: number; ny: number; x0: number; y0: number } {
  const c = cellList(); const xs = c.map((a) => a[0]), ys = c.map((a) => a[1]);
  return { nx: Math.max(...xs) - Math.min(...xs) + 1, ny: Math.max(...ys) - Math.min(...ys) + 1, x0: Math.min(...xs), y0: Math.min(...ys) };
}
function updateInfo(): void {
  const b = bbox();
  $('#i-size').textContent = `${(42 * b.nx - 0.5).toFixed(1)} × ${(42 * b.ny - 0.5).toFixed(1)} × 21.5`;
  $('#i-cells').textContent = `${state.cells.size}マス`;
  const od = openDoors().length;
  $('#i-doors').textContent = `${od}こ`;
  $('#i-gates').textContent = `${od}まい`;
  $('#i-weight').textContent = lastMesh ? `やく ${Math.round(lastMesh.volume() / 1000 * 1.24)} g` : '…';
  // いわで ふさがった とびら
  const blocked = openDoors().filter((d) => { const t = state.tiles.get(K(...doorTile(d))); return t && t.type === 'rock'; });
  const warn = $('#warn');
  warn.hidden = !blocked.length;
  if (blocked.length) warn.textContent = `いわで ふさがっている とびらが ${blocked.length}こ あるよ。わざとなら そのままで だいじょうぶ。`;
  if (state.mode === 'inside') {
    if (state.tool === 'erase') hint.textContent = ERASE_HINT;
    else if (state.tool === 'step') hint.textContent = `だんは ゆかより ${state.stepH}mm たかい だいだよ。さかと くみあわせると のぼれるよ。`;
    else hint.textContent = getPart(state.tool)?.hint ?? '';
  } else hint.textContent = HINTS[state.mode];
}

/* ---------- UI ---------- */
function syncUI(): void {
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  document.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === state.tool)));
  document.querySelectorAll<HTMLElement>('[data-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === state.color)));
  $('#tools').hidden = state.mode !== 'inside';
  $('#presets').hidden = state.mode !== 'inside';
  $<HTMLInputElement>('#stepH').value = String(state.stepH); $('#stepHv').textContent = state.stepH + 'mm';
  $<HTMLInputElement>('#showGates').checked = state.showGates; $<HTMLInputElement>('#showLid').checked = state.showLid; $<HTMLInputElement>('#shade').checked = state.shade;
  $<HTMLInputElement>('#name').value = state.name; $('#seed').textContent = String(state.seed);
  updateInfo();
}

/* ---------- 書き出し ---------- */
function lidSVG(): string {
  const b = bbox(); const x0 = 42 * b.x0, y0 = 42 * b.y0, w = 42 * b.nx, h = 42 * b.ny;
  const d = (geo?.lid ?? []).map((poly) => 'M' + poly.map(([x, y]) => `${(x - x0).toFixed(2)},${(h - (y - y0)).toFixed(2)}`).join('L') + 'Z').join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 20}mm" height="${h + 30}mm" viewBox="-10 -20 ${w + 20} ${h + 30}">
<text x="0" y="-10" font-size="5" font-family="sans-serif">${esc(state.name)} フタの型紙（原寸・100%で印刷）　線の内側を切る</text>
<path d="${d}" fill="none" stroke="#000" stroke-width="0.3"/>
<line x1="0" y1="-4" x2="50" y2="-4" stroke="#000" stroke-width="0.4"/><text x="52" y="-2.5" font-size="3.5" font-family="sans-serif">50mm（印刷後にこの線の長さを確認）</text>
</svg>`;
}
const esc = (s: string): string => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

interface Design {
  v: number; name: string; cells: string[]; tiles: [string, TileVal][]; walls: string[];
  doorsOff: string[]; windows: string[]; stepH: number; color: string; seed: number;
}
function design(): Design {
  return {
    v: 2, name: state.name, cells: [...state.cells], tiles: [...state.tiles], walls: [...state.walls],
    doorsOff: [...state.doorsOff], windows: [...state.windows], stepH: state.stepH, color: state.color, seed: state.seed,
  };
}
function loadDesign(o: Partial<Design>): void {
  state.name = o.name || state.name; state.cells = new Set(o.cells); state.tiles = new Map(o.tiles);
  state.walls = new Set(o.walls); state.doorsOff = new Set(o.doorsOff); state.windows = new Set(o.windows); // v1 は windows なし＝空
  state.stepH = o.stepH || 5;
  state.color = o.color || state.color; state.seed = o.seed || 7; syncUI(); changed();
}
async function exportZip(): Promise<void> {
  if (!W || !lastMesh) return;
  const base = (state.name || 'parts').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  const b = bbox();
  const nOpen = openDoors().length;
  const files: ZipFile[] = [
    { name: `${base}_${b.nx}x${b.ny}.stl`, data: new Uint8Array(toSTL(lastMesh)) },
    { name: `${base}_lid_template.svg`, data: new TextEncoder().encode(lidSVG()) },
    { name: `${base}_design.json`, data: new TextEncoder().encode(JSON.stringify(design())) },
  ];
  if (nOpen) { const g = buildGates(W, nOpen); files.push({ name: `gate_x${nOpen}.stl`, data: new Uint8Array(toSTL(g)) }); g.delete(); }
  // まどの透明板の型紙（まどはどれも同じ大きさなので1枚にまとめ、枚数をファイル名にいれる）
  const nWin = [...state.windows].filter((id) => new Set(doors().map((d) => d.id)).has(id)).length;
  if (nWin) {
    const wp = getPart('window');
    if (wp && wp.domain === 'perimeter' && wp.template) {
      const tpl = wp.template({ i: 0, j: 0, d: 'N' });
      if (tpl) files.push({ name: `window_plate_x${nWin}.svg`, data: new TextEncoder().encode(tpl.text) });
    }
  }
  if (state.shade) { const s = buildShade(W); files.push({ name: 'shade_strip.stl', data: new Uint8Array(toSTL(s)) }); s.delete(); }
  const blob = zip(files);
  const filename = `${base}.zip`;
  const claude = (window as unknown as { claude?: { use?: (k: string) => Promise<{ save: (o: { filename: string; data: Blob }) => Promise<void> }> } }).claude;
  const dl = claude && claude.use ? await claude.use('downloads').catch(() => null) : null;
  if (dl) {
    try { await dl.save({ filename, data: blob }); say('データを ほぞんしたよ'); }
    catch (e) { if (e && (e as { code?: string }).code === 'declined') say('ほぞんを やめたよ'); else say('ここでは ほぞんできなかったよ'); }
  } else {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
}

/* ---------- 道具ボタンをレジストリから作る ---------- */
const ERASE_ICON = '<svg viewBox="0 0 30 30"><rect x="7" y="9" width="16" height="12" rx="2" transform="rotate(-30 15 15)" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.6"/><path d="M9 12 L13 19" stroke="var(--gate)" stroke-width="3"/></svg>';
function buildTools(): void {
  const el = $('#tools'); el.innerHTML = '';
  // 「なかみ」の道具：かべ(edge)＋タイルのパーツ。レジストリの並び順で出る。
  for (const part of [...edgeParts(), ...tileParts()]) {
    const b = document.createElement('button');
    b.dataset.tool = part.id; b.setAttribute('aria-pressed', String(part.id === state.tool));
    b.innerHTML = part.icon + part.name;
    el.appendChild(b);
  }
  const er = document.createElement('button');
  er.id = 't-erase'; er.dataset.tool = 'erase'; er.setAttribute('aria-pressed', 'false');
  er.innerHTML = ERASE_ICON + 'けしゴム';
  el.appendChild(er);
}

/* ---------- 起動 ---------- */
export async function startApp(): Promise<void> {
  buildTools();
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => b.addEventListener('click', () => { state.mode = b.dataset.mode as ModeName; syncUI(); draw(); }));
  document.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => b.addEventListener('click', () => { state.tool = b.dataset.tool as ToolName; syncUI(); draw(); }));
  document.querySelectorAll<HTMLElement>('[data-color]').forEach((b) => b.addEventListener('click', () => { state.color = b.dataset.color!; syncUI(); changed(); }));
  $<HTMLInputElement>('#stepH').addEventListener('input', (e) => { state.stepH = +(e.target as HTMLInputElement).value; syncUI(); changed(); });
  $<HTMLInputElement>('#showGates').addEventListener('change', (e) => { state.showGates = (e.target as HTMLInputElement).checked; changed(); });
  $<HTMLInputElement>('#showLid').addEventListener('change', (e) => { state.showLid = (e.target as HTMLInputElement).checked; changed(); });
  $<HTMLInputElement>('#shade').addEventListener('change', (e) => { state.shade = (e.target as HTMLInputElement).checked; changed(); });
  $<HTMLInputElement>('#name').addEventListener('input', (e) => { state.name = (e.target as HTMLInputElement).value; });
  $('#p-maze').addEventListener('click', () => { makeMaze(state.seed); changed(); say(`めいろ ${state.seed}ばん を つくったよ`); });
  $('#p-next').addEventListener('click', () => { state.seed = (state.seed % 999) + 1; syncUI(); makeMaze(state.seed); changed(); say(`めいろ ${state.seed}ばん を つくったよ`); });
  $('#p-rooms').addEventListener('click', () => { makeRooms(); changed(); });
  $('#p-rocks').addEventListener('click', () => { scatterRocks(Date.now() % 1000); changed(); });
  $('#p-clear').addEventListener('click', () => { state.walls.clear(); state.tiles.clear(); changed(); say('なかみを からっぽに したよ'); });
  $('#p-sample').addEventListener('click', () => { state.cells = new Set(['0,0', '1,0', '0,1', '1,1']); sample(); syncUI(); changed(); });
  $('#export').addEventListener('click', exportZip);
  $<HTMLInputElement>('#open').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0]; if (!f) return;
    try { loadDesign(JSON.parse(await f.text())); say('つづきを ひらいたよ'); } catch { say('このファイルは ひらけなかったよ（_design.json を えらんでね）'); }
    input.value = '';
  });

  window.addEventListener('resize', () => { resize(); size3d(); });
  new ResizeObserver(() => size3d()).observe(host);
  new ResizeObserver(() => resize()).observe(cv);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { buildPlate(); draw(); });
  buildPlate(); syncUI(); resize(); size3d();

  try {
    W = await getManifold({ locateFile: () => manifoldWasmUrl });
    $('#loading').hidden = true;
    rebuild();
  } catch (err) {
    $('#loading').textContent = 'けいさんの じゅんびが できなかったよ。ページを ひらきなおしてね。';
    console.error(err);
  }

  // デバッグ用
  const w = window as unknown as Record<string, unknown>;
  w.__state = state; w.__rebuild = rebuild; w.__mesh = () => lastMesh;
}
