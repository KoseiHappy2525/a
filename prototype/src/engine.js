// 観察ビン形状エンジン（manifold-3d）
// 座標: マス(i,j) は x∈[42i,42i+42], y∈[42j,42j+42]。タイル t は中心 10.5+10.5t（各マス中心・境界に乗る格子）
export const P = {
  pitch: 42, gap: 0.25, wall: 6, floorZ: 6.5, footTop: 4.75, top: 21.5,
  doorW: 12, doorTop: 16.5, slotW: 16.4, slotT: 2.6, slotIn: 1.1,
  ledgeZ: 19.3, ledgeIn: 4.4, innerTop: 19.1, tile: 10.5, partT: 1.2,
  pondBottom: 3.5, gateW: 15.4, gateH: 21, gateT: 2,
};
export const TILES = 15; // 4マス分

export const isSeam = (t) => t % 4 === 3;
export const tileCenter = (t) => P.tile + P.tile * t;
const key = (i, j) => i + ',' + j;
export const DIRS = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };

export function outerDoors(cells) {
  const set = new Set(cells.map(([i, j]) => key(i, j)));
  const out = [];
  for (const [i, j] of cells) for (const d of ['N', 'E', 'S', 'W']) {
    const [di, dj] = DIRS[d];
    if (!set.has(key(i + di, j + dj))) out.push({ i, j, d, id: `${i},${j},${d}` });
  }
  return out;
}

function rrPoints(w, h, r, z, cx, cy, seg = 10) {
  const pts = [];
  const hx = w / 2 - r, hy = h / 2 - r;
  const cs = [[hx, hy, 0], [-hx, hy, 90], [-hx, -hy, 180], [hx, -hy, 270]];
  for (const [x, y, a0] of cs) for (let k = 0; k <= seg; k++) {
    const a = (a0 + 90 * k / seg) * Math.PI / 180;
    pts.push([cx + x + r * Math.cos(a), cy + y + r * Math.sin(a), z]);
  }
  return pts;
}

export function buildBin(W, p) {
  const { Manifold, CrossSection } = W;
  const box = (x0, y0, z0, x1, y1, z1) =>
    Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
  const cells = p.cells;
  const sq = CrossSection.union(cells.map(([i, j]) =>
    CrossSection.square([P.pitch, P.pitch]).translate([P.pitch * i, P.pitch * j])));
  const rounded = (inset, r) => sq.offset(-(inset + r), 'Miter').offset(r, 'Round', 2, 40);

  const outline = rounded(P.gap, 3.75);
  const parts = [outline.extrude(P.top - P.footTop).translate([0, 0, P.footTop])];
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

  const interior = rounded(P.gap + P.wall, 0.6);
  const cuts = [
    interior.extrude(P.top + 5 - P.floorZ).translate([0, 0, P.floorZ]),
    rounded(P.gap + P.ledgeIn, 1.0).extrude(P.top + 5 - P.ledgeZ).translate([0, 0, P.ledgeZ]),
  ];

  // 扉と溝
  const closed = new Set(p.closedDoors || []);
  for (const dr of outerDoors(cells)) {
    if (closed.has(dr.id)) continue;
    const { i, j, d } = dr;
    const cx = P.pitch * i + 21, cy = P.pitch * j + 21;
    const face = 21 - P.gap; // 中心から外面まで
    const inW = P.wall + 1, hw = P.doorW / 2, hs = P.slotW / 2;
    const s0 = face - P.slotIn - P.slotT, s1 = face - P.slotIn;
    let door, slot;
    if (d === 'N' || d === 'S') {
      const sg = d === 'N' ? 1 : -1;
      const y = (a, b) => sg > 0 ? [cy + a, cy + b] : [cy - b, cy - a];
      const [dy0, dy1] = y(face - inW, face + 2);
      const [sy0, sy1] = y(s0, s1);
      door = box(cx - hw, dy0, P.floorZ, cx + hw, dy1, P.doorTop);
      slot = box(cx - hs, sy0, P.floorZ, cx + hs, sy1, P.top + 5);
    } else {
      const sg = d === 'E' ? 1 : -1;
      const x = (a, b) => sg > 0 ? [cx + a, cx + b] : [cx - b, cx - a];
      const [dx0, dx1] = x(face - inW, face + 2);
      const [sx0, sx1] = x(s0, s1);
      door = box(dx0, cy - hw, P.floorZ, dx1, cy + hw, P.doorTop);
      slot = box(sx0, cy - hs, P.floorZ, sx1, cy + hs, P.top + 5);
    }
    cuts.push(door, slot);
  }

  // 水場（スポンジのくぼみ）：脚の継ぎ目にかからない範囲に限定
  const ponds = [];
  const tiles = p.tiles || {};
  const T = P.tile, h = T / 2;
  for (const [k, v] of Object.entries(tiles)) {
    if (v.type !== 'pond') continue;
    const [tx, ty] = k.split(',').map(Number);
    if (isSeam(tx) || isSeam(ty)) continue; // 脚の継ぎ目には掘れない
    const x = tileCenter(tx), y = tileCenter(ty);
    ponds.push(box(x - h, y - h, P.pondBottom, x + h, y + h, P.floorZ + 0.01));
  }
  if (ponds.length) {
    const safe = CrossSection.union(cells.map(([i, j]) =>
      CrossSection.square([36, 36], true).translate([P.pitch * i + 21, P.pitch * j + 21])));
    const safeM = safe.offset(0, 'Square').extrude(10).translate([0, 0, 0]);
    cuts.push(Manifold.union(ponds).intersect(safeM).intersect(interior.extrude(10)));
  }
  body = body.subtract(Manifold.union(cuts));

  // 中身（いわ・だん・さか・しきり）
  const add = [];
  const H = p.stepH || 5;
  for (const [k, v] of Object.entries(tiles)) {
    const [tx, ty] = k.split(',').map(Number);
    const x = tileCenter(tx), y = tileCenter(ty), z0 = P.floorZ - 0.01;
    if (v.type === 'rock') add.push(box(x - h, y - h, z0, x + h, y + h, P.innerTop));
    else if (v.type === 'step') add.push(box(x - h, y - h, z0, x + h, y + h, P.floorZ + H));
    else if (v.type === 'ramp') {
      // dir: のぼる方向 N/E/S/W（高い側）
      const lo = [], hi = [];
      const c = [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]];
      const high = { E: [1, 2], W: [3, 0], N: [2, 3], S: [0, 1] }[v.dir || 'E'];
      c.forEach((q, idx) => {
        lo.push([q[0], q[1], z0]);
        if (high.includes(idx)) hi.push([q[0], q[1], P.floorZ + H]);
      });
      add.push(Manifold.hull([...lo, ...hi]));
    }
  }
  const t2 = P.partT / 2;
  for (const w of p.walls || []) {
    const [o, a, b] = w.split(/[:,]/);
    const tx = +a, ty = +b;
    if (o === 'v') { // tx と tx+1 の間
      const x = tileCenter(tx) + h, y = tileCenter(ty);
      add.push(box(x - t2, y - h - t2, P.floorZ - 0.01, x + t2, y + h + t2, P.innerTop));
    } else {
      const x = tileCenter(tx), y = tileCenter(ty) + h;
      add.push(box(x - h - t2, y - t2, P.floorZ - 0.01, x + h + t2, y + t2, P.innerTop));
    }
  }
  if (add.length) {
    const clip = interior.offset(0.3, 'Miter').extrude(P.innerTop + 1);
    body = body.add(Manifold.union(add).intersect(clip));
  }
  return body;
}

export function buildGates(W, n) {
  const { Manifold } = W;
  const arr = [];
  for (let k = 0; k < n; k++) {
    const cx = (k % 5) * (P.gateW + 4), cy = Math.floor(k / 5) * (P.gateH + 4);
    arr.push(Manifold.cube([P.gateW, P.gateH, P.gateT]).translate([cx, cy, 0]));
  }
  return Manifold.union(arr);
}

export function buildShade(W) {
  return W.Manifold.cube([20.5, 41, 1]);
}

export function toSTL(man) {
  const m = man.getMesh();
  const np = m.numProp, V = m.vertProperties, I = m.triVerts;
  const nt = I.length / 3;
  const buf = new ArrayBuffer(84 + nt * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, nt, true);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    const a = I[3 * t] * np, b = I[3 * t + 1] * np, c = I[3 * t + 2] * np;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2];
    const vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
    o += 12;
    for (const q of [a, b, c]) {
      dv.setFloat32(o, V[q], true); dv.setFloat32(o + 4, V[q + 1], true); dv.setFloat32(o + 8, V[q + 2], true);
      o += 12;
    }
    o += 2;
  }
  return buf;
}

// 2Dエディタ・フタ型紙用の輪郭（ポリゴン配列）
export function outlines(W, cells) {
  const { CrossSection } = W;
  const sq = CrossSection.union(cells.map(([i, j]) =>
    CrossSection.square([P.pitch, P.pitch]).translate([P.pitch * i, P.pitch * j])));
  const rounded = (inset, r) => sq.offset(-(inset + r), 'Miter').offset(r, 'Round', 2, 40);
  return {
    outer: rounded(P.gap, 3.75).toPolygons(),
    inner: rounded(P.gap + P.wall, 0.6).toPolygons(),
    ledge: rounded(P.gap + P.ledgeIn, 1.0).toPolygons(),
    lid: rounded(P.gap + P.ledgeIn + 0.2, 1.0).toPolygons(), // フタ：受けより0.2mm小さく
  };
}
