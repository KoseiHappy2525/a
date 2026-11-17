// パーツのレジストリ（1パーツ＝1ファイル）の契約。
// パーツは次をまとめる：id・ひらがな名・アイコン・ヒント／置ける場所と置けない条件／足す形と削る形／2Dエディタの描き方。
// engine（solids）と UI（tool・draw2d）の両方がこの契約を使う。draw2d は型だけ DOM を参照し、実行はブラウザのみ。
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Dir } from './types';

export type Domain = 'tile' | 'edge' | 'perimeter';

/** box(x0,y0,z0,x1,y1,z1) で軸平行の箱を作るヘルパ */
export type BoxFn = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => Manifold;

export interface Solids {
  /** 本体に足す形 */
  add?: Manifold[];
  /** 本体から削る形 */
  cut?: Manifold[];
}

export interface PlaceResult {
  ok: boolean;
  /** 置けない理由（やさしいひらがな） */
  reason?: string;
}

/* ---------- solids の文脈（ドメインごと） ---------- */
export interface TileSolidCtx {
  W: ManifoldToplevel;
  box: BoxFn;
  /** タイル中心(mm) */
  x: number; y: number;
  /** タイルの半分 = 5.25mm */
  h: number;
  /** 床のすぐ下 = floorZ - 0.01 */
  z0: number;
  /** だんの高さ(mm) */
  stepH: number;
  /** さか・トンネルの向き */
  dir: Dir;
}
export interface EdgeSolidCtx {
  W: ManifoldToplevel;
  box: BoxFn;
  o: 'v' | 'h';
  /** しきりの中心(mm) */
  x: number; y: number;
  /** タイルの半分 = 5.25mm */
  h: number;
}
export interface PerimSolidCtx {
  W: ManifoldToplevel;
  box: BoxFn;
  i: number; j: number; d: Dir;
  /** マス中心(mm) */
  cx: number; cy: number;
  /** 中心から外面まで = 21 - gap */
  face: number;
}

/* ---------- draw2d の文脈 ---------- */
export interface DrawHelpers {
  c: CanvasRenderingContext2D;
  scale: number; dpr: number;
  sx: (n: number) => number;
  sy: (n: number) => number;
  rr: (x0: number, y0: number, x1: number, y1: number, r: number) => Path2D;
  col: Record<string, string>;
}
export interface TileDrawCtx extends DrawHelpers {
  /** タイル中心(mm) */
  x: number; y: number;
  /** 2Dでのタイル半分 = 5.25 */
  h: number;
  dir: Dir;
}
export interface EdgeDrawCtx extends DrawHelpers {
  o: 'v' | 'h';
  x: number; y: number;
}
export interface PerimDrawCtx extends DrawHelpers {
  i: number; j: number; d: Dir;
  cx: number; cy: number;
}

/** 書き出す追加ファイル（まどの透明板の型紙など） */
export interface ExtraFile {
  name: string;
  /** テキスト（SVGなど） */
  text: string;
}

interface Common {
  id: string;
  /** ひらがなの名前（道具ボタン） */
  name: string;
  /** 道具ボタンのアイコン（inline SVG の中身） */
  icon: string;
  /** ヒント文（やさしいひらがな） */
  hint: string;
  /** タップで向きが変わる（さか・トンネル） */
  rotatable?: boolean;
}

export interface TilePart extends Common {
  domain: 'tile';
  /** 置けない条件（例：みずばは脚の継ぎ目に×）。省略時はいつでも置ける */
  canPlace?(a: { tx: number; ty: number; isSeam: (t: number) => boolean }): PlaceResult;
  solids(ctx: TileSolidCtx): Solids;
  draw2d(ctx: TileDrawCtx): void;
}
export interface EdgePart extends Common {
  domain: 'edge';
  solids(ctx: EdgeSolidCtx): Solids;
  draw2d(ctx: EdgeDrawCtx): void;
}
export interface PerimPart extends Common {
  domain: 'perimeter';
  solids(ctx: PerimSolidCtx): Solids;
  draw2d(ctx: PerimDrawCtx): void;
  /** 透明板などの型紙を出す（1マスの外周パーツぶん） */
  template?(a: { i: number; j: number; d: Dir }): ExtraFile | null;
}

export type PartDef = TilePart | EdgePart | PerimPart;

/* ---------- レジストリ本体 ---------- */
import { PARTS } from '../parts';

const byId = new Map<string, PartDef>(PARTS.map((p) => [p.id, p]));

export function getPart(id: string): PartDef | undefined { return byId.get(id); }
export function allParts(): readonly PartDef[] { return PARTS; }
export function partsOf<T extends Domain>(domain: T): Extract<PartDef, { domain: T }>[] {
  return PARTS.filter((p) => p.domain === domain) as Extract<PartDef, { domain: T }>[];
}
export function tileParts(): TilePart[] { return partsOf('tile'); }
export function edgeParts(): EdgePart[] { return partsOf('edge'); }
export function perimParts(): PerimPart[] { return partsOf('perimeter'); }
