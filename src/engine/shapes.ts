// WASM 不要の純粋な形状ヘルパ（点群）。geometry と parts が共有する。
export type Vec3 = [number, number, number];

/** 角丸長方形の輪郭点（Manifold.hull 用の点群） */
export function rrPoints(w: number, h: number, r: number, z: number, cx: number, cy: number, seg = 10): Vec3[] {
  const pts: Vec3[] = [];
  const hx = w / 2 - r, hy = h / 2 - r;
  const cs: [number, number, number][] = [
    [hx, hy, 0], [-hx, hy, 90], [-hx, -hy, 180], [hx, -hy, 270],
  ];
  for (const [x, y, a0] of cs) {
    for (let k = 0; k <= seg; k++) {
      const a = (a0 + 90 * k / seg) * Math.PI / 180;
      pts.push([cx + x + r * Math.cos(a), cy + y + r * Math.sin(a), z]);
    }
  }
  return pts;
}
