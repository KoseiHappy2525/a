// 観察ビン形状エンジン（manifold-3d）。
// 本体のから（外形・脚・壁・扉・ゲート溝・フタ受け）は geometry が組み、
// 中身・しきり・まど は registry のパーツ（src/parts/*）に委ねる。
// ★ 寸法の値と「脚の作り方のくふう」は試作版からそのまま引き継ぐ。
//    A_home_box_2x1.stl と脚の断面積が一致することを tests/engine.test.ts で検証している。
import type { ManifoldToplevel, Manifold } from 'manifold-3d';
import { P, isSeam, tileCenter, outerDoors } from './params';
import type { BinParams } from './types';
import { rrPoints } from './shapes';
import { getPart } from './registry';
import { stopperCuts } from './stopper';

export function buildBin(W: ManifoldToplevel, p: BinParams): Manifold {
  const { Manifold, CrossSection } = W;
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Manifold =>
    Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
  const cells = p.cells;
  const sq = CrossSection.union(cells.map(([i, j]) =>
    CrossSection.square([P.pitch, P.pitch]).translate([P.pitch * i, P.pitch * j])));
  const rounded = (inset: number, r: number) =>
    sq.offset(-(inset + r), 'Miter').offset(r, 'Round', 2, 40);

  // ---- 外形と脚（Gridfinity 標準プロファイル）----
  const outline = rounded(P.gap, 3.75);
  const parts: Manifold[] = [outline.extrude(P.top - P.footTop).translate([0, 0, P.footTop])];
  for (const [i, j] of cells) {
    const cx = P.pitch * i + 21, cy = P.pitch * j + 21;
    parts.push(Manifold.hull([
      ...rrPoints(35.6, 35.6, 0.8, 0, cx, cy),
      ...rrPoints(37.2, 37.2, 1.6, 0.8, cx, cy),
      ...rrPoints(37.2, 37.2, 1.6, 2.65, cx, cy),
    ]));
    parts.push(Manifold.hull([
      ...rrPoints(37.2, 37.2, 1.6, 2.6, cx, cy),
      ...rrPoints(41.46, 41.46, 3.73, P.footTop, cx, cy),
      ...rrPoints(41.0, 41.0, 3.5, P.footTop + 0.3, cx, cy),
    ]));
  }
  let body = Manifold.union(parts);

  // ---- 中ぐり・フタ受け ----
  const interior = rounded(P.gap + P.wall, 0.6);
  const cuts: Manifold[] = [
    interior.extrude(P.top + 5 - P.floorZ).translate([0, 0, P.floorZ]),
    rounded(P.gap + P.ledgeIn, 1.0).extrude(P.top + 5 - P.ledgeZ).translate([0, 0, P.ledgeZ]),
  ];

  const closed = new Set(p.closedDoors ?? []);
  const windows = new Set(p.windows ?? []);
  const face = 21 - P.gap; // 中心から外面まで

  // ---- 扉とゲート溝（まど・ふさいだ扉のところは作らない）----
  for (const dr of outerDoors(cells)) {
    if (closed.has(dr.id) || windows.has(dr.id)) continue;
    const { i, j, d } = dr;
    const cx = P.pitch * i + 21, cy = P.pitch * j + 21;
    const inW = P.wall + 1, hw = P.doorW / 2, hs = P.slotW / 2;
    const s0 = face - P.slotIn - P.slotT, s1 = face - P.slotIn;
    let door: Manifold, slot: Manifold;
    if (d === 'N' || d === 'S') {
      const sg = d === 'N' ? 1 : -1;
      const y = (a: number, b: number): [number, number] => sg > 0 ? [cy + a, cy + b] : [cy - b, cy - a];
      const [dy0, dy1] = y(face - inW, face + 2);
      const [sy0, sy1] = y(s0, s1);
      door = box(cx - hw, dy0, P.floorZ, cx + hw, dy1, P.doorTop);
      slot = box(cx - hs, sy0, P.floorZ, cx + hs, sy1, P.top + 5);
    } else {
      const sg = d === 'E' ? 1 : -1;
      const x = (a: number, b: number): [number, number] => sg > 0 ? [cx + a, cx + b] : [cx - b, cx - a];
      const [dx0, dx1] = x(face - inW, face + 2);
      const [sx0, sx1] = x(s0, s1);
      door = box(dx0, cy - hw, P.floorZ, dx1, cy + hw, P.doorTop);
      slot = box(sx0, cy - hs, P.floorZ, sx1, cy + hs, P.top + 5);
    }
    cuts.push(door, slot);
  }

  // ---- まど（perimeter パーツ）：外周の辺に穴＋透明板の溝を削る ----
  const winPart = getPart('window');
  if (winPart && winPart.domain === 'perimeter') {
    for (const dr of outerDoors(cells)) {
      if (!windows.has(dr.id)) continue;
      const { i, j, d } = dr;
      const cx = P.pitch * i + 21, cy = P.pitch * j + 21;
      const s = winPart.solids({ W, box, i, j, d, cx, cy, face });
      if (s.cut) cuts.push(...s.cut);
    }
  }

  // ---- 中身パーツ（tile ドメイン）：足す形と削る形を集める ----
  const tiles = p.tiles ?? {};
  const H = p.stepH ?? 5;
  const h = P.tile / 2;
  const tileAdds: Manifold[] = [];
  const tileCuts: Manifold[] = [];
  for (const [k, v] of Object.entries(tiles)) {
    const part = getPart(v.type);
    if (!part || part.domain !== 'tile') continue;
    const [tx, ty] = k.split(',').map(Number);
    if (part.canPlace && !part.canPlace({ tx, ty, isSeam }).ok) continue; // みずばの継ぎ目など
    const x = tileCenter(tx), y = tileCenter(ty), z0 = P.floorZ - 0.01;
    const s = part.solids({ W, box, x, y, h, z0, stepH: H, dir: v.dir ?? 'E' });
    if (s.add) tileAdds.push(...s.add);
    if (s.cut) tileCuts.push(...s.cut);
  }
  // 削る形（みずば等）は床の内側の安全な範囲に限定する
  if (tileCuts.length) {
    const safe = CrossSection.union(cells.map(([i, j]) =>
      CrossSection.square([36, 36], true).translate([P.pitch * i + 21, P.pitch * j + 21])));
    const safeM = safe.offset(0, 'Square').extrude(10);
    cuts.push(Manifold.union(tileCuts).intersect(safeM).intersect(interior.extrude(10)));
  }

  // ---- ストッパー式フタ：フタ受けのふちに「通り道（浅いくぼみ）」と「ピン穴」を削る ----
  if (p.lid?.lock === 'stopper') {
    cuts.push(...stopperCuts(W, cells, p.lid.sheetT));
  }

  body = body.subtract(Manifold.union(cuts));

  // ---- しきり（edge ドメイン）----
  const wallPart = getPart('wall');
  const wallAdds: Manifold[] = [];
  if (wallPart && wallPart.domain === 'edge') {
    for (const w of p.walls ?? []) {
      const [o, a, b] = w.split(/[:,]/);
      if (o !== 'v' && o !== 'h') continue;
      const tx = +a, ty = +b;
      const x = o === 'v' ? tileCenter(tx) + h : tileCenter(tx);
      const y = o === 'v' ? tileCenter(ty) : tileCenter(ty) + h;
      const s = wallPart.solids({ W, box, o, x, y, h });
      if (s.add) wallAdds.push(...s.add);
    }
  }

  // ---- 足す形は中ぐりの内側にクリップしてから足す ----
  const adds = [...tileAdds, ...wallAdds];
  if (adds.length) {
    const clip = interior.offset(0.3, 'Miter').extrude(P.innerTop + 1);
    body = body.add(Manifold.union(adds).intersect(clip));
  }
  return body;
}

/** 開いている扉の数だけゲート板を並べて返す */
export function buildGates(W: ManifoldToplevel, n: number): Manifold {
  const { Manifold } = W;
  const arr: Manifold[] = [];
  for (let k = 0; k < n; k++) {
    const cx = (k % 5) * (P.gateW + 4), cy = Math.floor(k / 5) * (P.gateH + 4);
    arr.push(Manifold.cube([P.gateW, P.gateH, P.gateT]).translate([cx, cy, 0]));
  }
  return Manifold.union(arr);
}

/** かげいた */
export function buildShade(W: ManifoldToplevel): Manifold {
  return W.Manifold.cube([20.5, 41, 1]);
}
