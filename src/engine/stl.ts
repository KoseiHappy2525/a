// バイナリ STL の書き出しと読み込み。読み込みはテスト（試作STLとの比較）用。
import type { ManifoldToplevel, Manifold } from 'manifold-3d';

/** Manifold をバイナリ STL(ArrayBuffer) にする */
export function toSTL(man: Manifold): ArrayBuffer {
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
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
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

export interface RawMesh {
  numProp: 3;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  /** 三角形数 */
  nt: number;
}

/**
 * バイナリ STL を読み、同一座標の頂点をまとめて（dedup）インデックス付きメッシュにする。
 * dedup により多様体として復元できるので manifold に渡せる。
 */
export function parseBinarySTL(buf: ArrayBuffer): RawMesh {
  const dv = new DataView(buf);
  const nt = dv.getUint32(80, true);
  const vmap = new Map<string, number>();
  const verts: number[] = [];
  const idx: number[] = [];
  let o = 84;
  const q = (v: number): number => Math.round(v * 1e4) / 1e4; // 0.1µm に丸めて同一視
  for (let t = 0; t < nt; t++) {
    o += 12; // 法線は読み飛ばす
    for (let k = 0; k < 3; k++) {
      const x = q(dv.getFloat32(o, true)), y = q(dv.getFloat32(o + 4, true)), z = q(dv.getFloat32(o + 8, true));
      o += 12;
      const key = x + ',' + y + ',' + z;
      let vi = vmap.get(key);
      if (vi === undefined) { vi = verts.length / 3; vmap.set(key, vi); verts.push(x, y, z); }
      idx.push(vi);
    }
    o += 2; // 属性バイト数
  }
  return { numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(idx), nt };
}

/** dedup 済みメッシュから Manifold を作る（比較テスト用） */
export function manifoldFromMesh(W: ManifoldToplevel, m: RawMesh): Manifold {
  const mesh = new W.Mesh({ numProp: 3, vertProperties: m.vertProperties, triVerts: m.triVerts });
  return new W.Manifold(mesh);
}
