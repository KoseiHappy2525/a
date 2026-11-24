// エンジンが扱うデータの型。UI の状態（Set/Map）とは分け、シリアライズ可能な素の形にする。

export type Cell = [number, number];
export type Dir = 'N' | 'E' | 'S' | 'W';

/**
 * タイル(10.5mm格子)に置く中身の種類。値は登録されたパーツの id（rock / step / ramp / pond / tunnel …）。
 * パーツは registry（src/parts/*）で決まるので、新しいパーツを足しても型を変えなくてよいよう string にしている。
 */
export type TileType = string;

export interface TileFeature {
  type: TileType;
  /** さか・トンネルのとき、のぼる（高い）／通路の向き */
  dir?: Dir;
}

/** buildBin に渡す形状パラメータ */
export interface BinParams {
  cells: Cell[];
  /** キーは "tx,ty"（タイル座標） */
  tiles?: Record<string, TileFeature>;
  /** しきり。"v:tx,ty"（縦） or "h:tx,ty"（横） */
  walls?: string[];
  /** ふさいだ扉の id の配列（"i,j,d"） */
  closedDoors?: string[];
  /** まどを付けた外周の辺（扉 id "i,j,d"）。その辺は扉ではなく まど になる */
  windows?: string[];
  /** だんの高さ(mm)。既定 5 */
  stepH?: number;
  /** フタの とめかた。'stopper'=回転ストッパー式／'none'=のせるだけ。省略時は 'none' */
  lid?: Lid;
}

/** フタの仕様。lock='stopper' のとき本体にピン穴＋通り道が付く */
export interface Lid {
  lock: 'none' | 'stopper';
  /** プラ板の厚さ(mm)。1.0 か 0.3 */
  sheetT: number;
}
