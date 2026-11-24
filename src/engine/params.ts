// 寸法の定数と、WASM を使わない純粋な座標ヘルパ。
// 座標: マス(i,j) は x∈[42i,42i+42], y∈[42j,42j+42]。
// タイル t は中心 10.5+10.5t（各マス中心・境界に乗る格子）。
// ★ ここの数値と「脚の作り方のくふう」(geometry.ts) は試作版からそのまま引き継ぐ。変えるときは A_home_box_2x1.stl との比較テストで確認すること。

export const P = {
  pitch: 42, gap: 0.25, wall: 6, floorZ: 6.5, footTop: 4.75, top: 21.5,
  doorW: 12, doorTop: 16.5, slotW: 16.4, slotT: 2.6, slotIn: 1.1,
  ledgeZ: 19.3, ledgeIn: 4.4, innerTop: 19.1, tile: 10.5, partT: 1.2,
  pondBottom: 3.5, gateW: 15.4, gateH: 21, gateT: 2,
} as const;

/**
 * ストッパー式フタの寸法（STOPPER_LID_SPEC.md / reference/stopper_lid_reference.py が基準）。
 * フタ受け(z=19.3)の上に、プラ板(厚さ sheetT)をのせ、回転アームで押さえる。
 * 軸から armL 先・幅2*armR の腕が、通り道(浅いくぼみ)を90°回る。ピンØpinD を 穴ØholeD に差す。
 */
export const ST = {
  pivotInset: 3.0,   // 軸の位置：外側の辺（セル境界）から内側へ
  armL: 6.0,         // 軸→先端の中心
  armR: 1.5,         // 腕の半径（幅3.0mm）
  pocketCl: 0.3,     // 回る通り道のすき間
  holeD: 2.7,        // ピン穴の直径
  holeDepth: 3.5,    // ピン穴の深さ（PZ から下へ）
  pinD: 2.5,         // ピンの直径（仕様は2.4だが、印刷すると緩かったため2.5へ。穴Ø2.7とのすき間0.2mm）
  pinLen: 3.2,       // ピンの長さ
  pinChamfer: 0.3,   // ピン先の面取り
  armTopZ: 22.0,     // 取り付けたときの腕の上面（ふちより0.5mm上）
  sweepStep: 5,      // 通り道を作る角度の刻み（度）
  sheetDefault: 1.0, // プラ板の既定の厚さ
} as const;

/** タイル数（4マス分） */
export const TILES = 15;

/** そのタイルが脚の継ぎ目（マス境界）に乗るか */
export const isSeam = (t: number): boolean => t % 4 === 3;

/** タイル t の中心座標(mm) */
export const tileCenter = (t: number): number => P.tile + P.tile * t;

export const DIRS: Record<'N' | 'S' | 'E' | 'W', [number, number]> = {
  N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0],
};

const key = (i: number, j: number): string => i + ',' + j;

export interface Door {
  i: number;
  j: number;
  d: 'N' | 'E' | 'S' | 'W';
  id: string;
}

/** 外周に面した各マスの辺を列挙する（扉の候補） */
export function outerDoors(cells: [number, number][]): Door[] {
  const set = new Set(cells.map(([i, j]) => key(i, j)));
  const out: Door[] = [];
  for (const [i, j] of cells) {
    for (const d of ['N', 'E', 'S', 'W'] as const) {
      const [di, dj] = DIRS[d];
      if (!set.has(key(i + di, j + dj))) out.push({ i, j, d, id: `${i},${j},${d}` });
    }
  }
  return out;
}
