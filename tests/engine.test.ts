// 形状エンジンの検証：試作STL(A_home_box_2x1.stl)との比較ほか。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ManifoldToplevel, Manifold } from 'manifold-3d';
import {
  getManifold, buildBin, buildGates, buildStoppers, stopperPivots,
  parseBinarySTL, manifoldFromMesh, toSTL,
  isSeam,
} from '../src/engine';

// 1つ上の階層の ダンゴムシ/ にある試作STL
const refPath = fileURLToPath(new URL('../../A_home_box_2x1.stl', import.meta.url));

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function extents(m: Manifold): [number, number, number] {
  const b = m.boundingBox();
  return [0, 1, 2].map((k) => +(b.max[k] - b.min[k]).toFixed(2)) as [number, number, number];
}

let W: ManifoldToplevel;
let ref: Manifold;          // 試作STLから復元した Manifold
let bin2x1: Manifold;       // エンジンの 2×1 空ビン

beforeAll(async () => {
  W = await getManifold();
  bin2x1 = buildBin(W, { cells: [[0, 0], [1, 0]] });
  const mesh = parseBinarySTL(toArrayBuffer(readFileSync(refPath)));
  ref = manifoldFromMesh(W, mesh);
});

describe('2×1 空ビンの外寸・体積', () => {
  it('外寸が 83.5 × 41.5 × 21.5 mm', () => {
    expect(extents(bin2x1)).toEqual([83.5, 41.5, 21.5]);
  });

  it('体積が試作A(33.11cm³)に近い（±0.5cm³）', () => {
    const vol = bin2x1.volume() / 1000;
    expect(Math.abs(vol - 33.11)).toBeLessThan(0.5);
  });
});

describe('試作STL A_home_box_2x1.stl との比較', () => {
  it('試作STLが多様体として読み込める', () => {
    expect(ref.status()).toBe('NoError');
    expect(extents(ref)).toEqual([83.5, 41.5, 21.5]);
  });

  // 脚の高さの断面積が一致すること（★ 最重要の検証）
  // z=0.4, 2.0 は純粋な Gridfinity 脚プロファイル部 → ほぼ完全一致
  // z=3.5, 4.5 は脚から本体への遷移部 → 角丸近似のため相対差は小さいが 0 ではない
  const legHeights = [
    { z: 0.4, kind: 'exact' as const },
    { z: 2.0, kind: 'exact' as const },
    { z: 3.5, kind: 'taper' as const },
    { z: 4.5, kind: 'taper' as const },
  ];
  it.each(legHeights)('脚 z=$z の断面積が試作STLと一致', ({ z, kind }) => {
    const engArea = bin2x1.slice(z).area();
    const refArea = ref.slice(z).area();
    const rel = Math.abs(engArea - refArea) / refArea;
    if (kind === 'exact') {
      // 純粋な脚プロファイル部：面積差 0.5mm² 未満（実測 ≈ 0.00）
      expect(Math.abs(engArea - refArea)).toBeLessThan(0.5);
    } else {
      // 遷移部：相対差 0.5% 未満（実測 ≈ 0.08〜0.17%）
      expect(rel).toBeLessThan(0.005);
    }
  });
});

describe('中身パーツ入りの形状', () => {
  it('L字＋いわ・だん・さか・みずば・しきり入りが watertight でボディ1つ', () => {
    const L = buildBin(W, {
      cells: [[0, 0], [1, 0], [0, 1]],
      tiles: {
        '1,1': { type: 'pond' },
        '4,1': { type: 'rock' },
        '5,1': { type: 'ramp', dir: 'E' },
        '6,1': { type: 'step' },
      },
      walls: ['v:0,4', 'h:1,3'],
      closedDoors: ['0,1,N'],
      stepH: 5,
    });
    expect(L.status()).toBe('NoError'); // NoError = watertight な多様体
    expect(L.genus()).toBeGreaterThanOrEqual(0);
    expect(L.decompose().length).toBe(1); // ボディ1つ
  });
});

describe('つなぎめタイルの みずばは無視される', () => {
  it('継ぎ目(seam)タイルに置いた pond は形に影響しない', () => {
    // 継ぎ目タイルを確実に選ぶ
    const seamT = [3, 7, 11].find((t) => isSeam(t));
    expect(seamT).toBeDefined();
    const cells = [[0, 0], [1, 0]] as [number, number][];
    const plain = buildBin(W, { cells });
    const withSeamPond = buildBin(W, { cells, tiles: { [`${seamT},1`]: { type: 'pond' } } });
    expect(withSeamPond.volume()).toBeCloseTo(plain.volume(), 3);
  });
});

describe('トンネル（屋根つき）パーツ', () => {
  it('トンネル入りが watertight でボディ1つ、材料が増える', () => {
    const plain = buildBin(W, { cells: [[0, 0]] });
    const withTunnel = buildBin(W, { cells: [[0, 0]], tiles: { '1,1': { type: 'tunnel', dir: 'E' } } });
    expect(withTunnel.status()).toBe('NoError');
    expect(withTunnel.decompose().length).toBe(1);
    expect(withTunnel.volume()).toBeGreaterThan(plain.volume()); // 屋根と側壁のぶん増える
  });

  it('向きを変えても（N）多様体でボディ1つ', () => {
    const t = buildBin(W, { cells: [[0, 0]], tiles: { '1,1': { type: 'tunnel', dir: 'N' } } });
    expect(t.status()).toBe('NoError');
    expect(t.decompose().length).toBe(1);
  });

  it('同じ向きのトンネルを並べても1つのボディになる（通路がつながる）', () => {
    const t = buildBin(W, { cells: [[0, 0]], tiles: { '0,1': { type: 'tunnel', dir: 'E' }, '1,1': { type: 'tunnel', dir: 'E' } } });
    expect(t.status()).toBe('NoError');
    expect(t.decompose().length).toBe(1);
  });
});

describe('まど（perimeter）パーツ', () => {
  it('まど入りが watertight でボディ1つ、壁に穴があく（材料が減る）', () => {
    // 比較は「扉」ではなく「ふさいだ壁」に対して行う（扉にはゲート溝があるため）
    const closedAll = buildBin(W, { cells: [[0, 0]], closedDoors: ['0,0,N', '0,0,E', '0,0,S', '0,0,W'] });
    const winOnWall = buildBin(W, { cells: [[0, 0]], closedDoors: ['0,0,E', '0,0,S', '0,0,W'], windows: ['0,0,N'] });
    expect(winOnWall.status()).toBe('NoError');
    expect(winOnWall.decompose().length).toBe(1);
    expect(winOnWall.volume()).toBeLessThan(closedAll.volume()); // N の壁に あな＋溝 があく
  });

  it('まどを付けた辺は扉（ゲート穴）を作らない＝扉を閉じたのとは別の形', () => {
    const win = buildBin(W, { cells: [[0, 0]], windows: ['0,0,N'] });
    const doorClosed = buildBin(W, { cells: [[0, 0]], closedDoors: ['0,0,N'] });
    // まどは貫通穴＋溝があるので、同じ辺を単に壁で閉じた形より体積が小さい
    expect(win.volume()).toBeLessThan(doorClosed.volume());
  });
});

describe('ストッパー式フタ（STOPPER_LID_SPEC / reference）', () => {
  const rect = (nx: number, ny: number): [number, number][] => {
    const c: [number, number][] = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) c.push([i, j]);
    return c;
  };
  const refMan = (f: string): Manifold => {
    const buf = readFileSync(fileURLToPath(new URL(`./ref/${f}`, import.meta.url)));
    return manifoldFromMesh(W, parseBinarySTL(toArrayBuffer(buf)));
  };

  it('ストッパーの数が「四隅＋辺のセル境界」に合う（1×1=4, 2×1=6, 3×1=8, 3×3=12）', () => {
    expect(stopperPivots(rect(1, 1)).length).toBe(4);
    expect(stopperPivots(rect(2, 1)).length).toBe(6);
    expect(stopperPivots(rect(3, 1)).length).toBe(8);
    expect(stopperPivots(rect(3, 3)).length).toBe(12);
  });

  it('L字では へこみの角に置かず、凸の角＋辺の境界に置く', () => {
    // L（3マス, 2×2 から (1,1) を抜いた形）。外形は 凸角5・凹角1。
    const L = stopperPivots([[0, 0], [1, 0], [0, 1]]);
    expect(L.length).toBe(7); // 凸角5 + 辺のセル境界2（凹角(1,1)は置かない）
    // へこみの角(42,42)付近には軸が無い
    expect(L.some((p) => Math.abs(p.x - 42) < 4 && Math.abs(p.y - 42) < 4)).toBe(false);
  });

  it.each([
    ['ref_body_1x1_sheet1.0.stl', 1, 1, 1.0],
    ['ref_body_1x1_sheet0.3.stl', 1, 1, 0.3],
    ['ref_body_2x1_sheet1.0.stl', 2, 1, 1.0],
    ['ref_body_3x3_sheet1.0.stl', 3, 3, 1.0],
  ] as const)('本体が参考STL %s と一致（体積差0.5%以内・watertight1体）', (f, nx, ny, st) => {
    const m = buildBin(W, { cells: rect(nx, ny), lid: { lock: 'stopper', sheetT: st } });
    const r = refMan(f);
    expect(m.status()).toBe('NoError');
    expect(m.decompose().length).toBe(1);
    expect(extents(m)).toEqual(extents(r));
    expect(Math.abs(m.volume() - r.volume()) / r.volume()).toBeLessThan(0.005);
  });

  it('ストッパー部品が参考STL（x4・1mm）と一致する', () => {
    const s = buildStoppers(W, 4, 1.0);
    const r = refMan('ref_stopper_x4_1x1_sheet1.0.stl');
    expect(s.status()).toBe('NoError');
    expect(extents(s)).toEqual(extents(r));
    expect(Math.abs(s.volume() - r.volume()) / r.volume()).toBeLessThan(0.005);
  });

  it('lock=none ならストッパーは付かない（フタ受けのまま）', () => {
    const none = buildBin(W, { cells: [[0, 0]], lid: { lock: 'none', sheetT: 1.0 } });
    const stop = buildBin(W, { cells: [[0, 0]], lid: { lock: 'stopper', sheetT: 1.0 } });
    expect(none.volume()).toBeGreaterThan(stop.volume()); // 通り道＋穴のぶん stopper の方が軽い
  });
});

describe('ゲート板', () => {
  it('開いた扉の数だけ・寸法15.4×21×2mmで出る', () => {
    const g = buildGates(W, 6);
    expect(g.status()).toBe('NoError');
    const one = buildGates(W, 1);
    expect(extents(one)).toEqual([15.4, 21, 2]);
    // 書き出しが STL になる
    expect(toSTL(one).byteLength).toBeGreaterThan(84);
  });
});
