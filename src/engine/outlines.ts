// 2Dエディタ・フタ型紙用の輪郭（ポリゴン配列）
import type { ManifoldToplevel } from 'manifold-3d';
import { P } from './params';
import type { Cell } from './types';

export interface Outlines {
  outer: number[][][];
  inner: number[][][];
  ledge: number[][][];
  lid: number[][][];
}

export function outlines(W: ManifoldToplevel, cells: Cell[]): Outlines {
  const { CrossSection } = W;
  const sq = CrossSection.union(cells.map(([i, j]) =>
    CrossSection.square([P.pitch, P.pitch]).translate([P.pitch * i, P.pitch * j])));
  const rounded = (inset: number, r: number) =>
    sq.offset(-(inset + r), 'Miter').offset(r, 'Round', 2, 40);
  return {
    outer: rounded(P.gap, 3.75).toPolygons() as unknown as number[][][],
    inner: rounded(P.gap + P.wall, 0.6).toPolygons() as unknown as number[][][],
    ledge: rounded(P.gap + P.ledgeIn, 1.0).toPolygons() as unknown as number[][][],
    // フタ: 受けより 0.2mm 小さく
    lid: rounded(P.gap + P.ledgeIn + 0.2, 1.0).toPolygons() as unknown as number[][][],
  };
}
