// 形状エンジンの検証：試作STL(A_home_box_2x1.stl)との比較ほか。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ManifoldToplevel, Manifold } from 'manifold-3d';
import {
  getManifold, buildBin, buildGates,
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
