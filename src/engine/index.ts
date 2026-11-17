// エンジンの公開API
export { P, TILES, isSeam, tileCenter, DIRS, outerDoors } from './params';
export type { Door } from './params';
export type { Cell, Dir, TileType, TileFeature, BinParams } from './types';
export { buildBin, buildGates, buildShade } from './geometry';
export { outlines } from './outlines';
export type { Outlines } from './outlines';
export { toSTL, parseBinarySTL, manifoldFromMesh } from './stl';
export type { RawMesh } from './stl';
export { getManifold } from './manifold';
export type { ManifoldToplevel } from './manifold';
export { rrPoints } from './shapes';
export type { Vec3 } from './shapes';
// パーツのレジストリ
export { getPart, allParts, partsOf, tileParts, edgeParts, perimParts } from './registry';
export type {
  PartDef, TilePart, EdgePart, PerimPart, Domain,
  TileDrawCtx, EdgeDrawCtx, PerimDrawCtx, DrawHelpers, ExtraFile,
} from './registry';
