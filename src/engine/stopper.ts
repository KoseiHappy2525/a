// ストッパー式フタ：配置（軸）・本体に削る形（通り道＋ピン穴）・印刷するストッパー部品。
// 寸法と置き方は STOPPER_LID_SPEC.md / reference/stopper_lid_reference.py が基準。
import type { ManifoldToplevel, Manifold, CrossSection } from 'manifold-3d';
import { P, ST } from './params';
import type { Cell } from './types';

/** ストッパーの軸。a0=開始角（度）、closed=しめた向き（度）。回る範囲は a0〜a0+90。 */
export interface Pivot { x: number; y: number; a0: number; closed: number; }

/**
 * 軸の位置を決める（格子の頂点を見て分類）。
 * 参考実装 pivots() を任意形に一般化：凸の角＝四隅扱い、へこみ＝置かない、
 * まっすぐな辺のセル境界＝辺扱い。長方形では参考実装と完全に一致する。
 */
export function stopperPivots(cells: Cell[]): Pivot[] {
  const S = new Set(cells.map(([i, j]) => i + ',' + j));
  const has = (i: number, j: number): boolean => S.has(i + ',' + j);
  const verts = new Set<string>();
  for (const [i, j] of cells) {
    for (const gi of [i, i + 1]) for (const gj of [j, j + 1]) verts.add(gi + ',' + gj);
  }
  const p = ST.pivotInset;
  const out: Pivot[] = [];
  for (const key of verts) {
    const [gi, gj] = key.split(',').map(Number);
    const A = has(gi - 1, gj - 1), B = has(gi, gj - 1); // 頂点の 南西・南東 のマス
    const C = has(gi - 1, gj), D = has(gi, gj);         // 北西・北東 のマス
    const n = (A ? 1 : 0) + (B ? 1 : 0) + (C ? 1 : 0) + (D ? 1 : 0);
    const vx = P.pitch * gi, vy = P.pitch * gj;
    if (n === 1) { // 凸の角：あるマスの方へ軸をずらし、対角線の内向きでしめる
      if (D) out.push({ x: vx + p, y: vy + p, a0: 0, closed: 45 });
      else if (C) out.push({ x: vx - p, y: vy + p, a0: 90, closed: 135 });
      else if (A) out.push({ x: vx - p, y: vy - p, a0: 180, closed: 225 });
      else out.push({ x: vx + p, y: vy - p, a0: 270, closed: 315 }); // B
    } else if (n === 2) { // まっすぐな辺のセル境界：内向きの法線でしめる
      if (C && D) out.push({ x: vx, y: vy + p, a0: 0, closed: 90 });        // 上にマス＝S辺（+y）
      else if (A && B) out.push({ x: vx, y: vy - p, a0: 270, closed: 270 }); // 下にマス＝N辺（-y）
      else if (B && D) out.push({ x: vx + p, y: vy, a0: 0, closed: 0 });     // 右にマス＝W辺（+x）
      else if (A && C) out.push({ x: vx - p, y: vy, a0: 90, closed: 180 });  // 左にマス＝E辺（-x）
      // ななめ（A&D / B&C）は くびれなので置かない
    }
    // n=0,3,4 は 外・へこみ・内部 なので置かない
  }
  return out;
}

/** 腕1本の 2D 形（軸(0,0)→先端(armL,0) の丸カプセル）。半径 r。 */
function armShape(W: ManifoldToplevel, r: number): CrossSection {
  const { CrossSection } = W;
  const a = CrossSection.circle(r, 48);
  const b = CrossSection.circle(r, 48).translate([ST.armL, 0]);
  return CrossSection.hull([a, b]);
}

/**
 * 本体から削るストッパーの形（通り道＋ピン穴）を軸ごとに作って返す。
 * PZ = フタ受け(19.3) + プラ板厚。通り道は PZ から上、ピン穴は PZ-holeDepth から上。
 */
export function stopperCuts(W: ManifoldToplevel, cells: Cell[], sheetT: number): Manifold[] {
  const { Manifold, CrossSection } = W;
  const PZ = P.ledgeZ + sheetT;
  const R = ST.armR + ST.pocketCl;
  const topCut = P.top + 5;         // 天面より上まで抜く
  const out: Manifold[] = [];
  for (const pv of stopperPivots(cells)) {
    // 通り道：腕の形を a0〜a0+90 まで回した和
    const fan: CrossSection[] = [];
    for (let k = 0; k <= 90; k += ST.sweepStep) {
      const ang = (pv.a0 + k) * Math.PI / 180;
      const tipx = pv.x + ST.armL * Math.cos(ang), tipy = pv.y + ST.armL * Math.sin(ang);
      fan.push(CrossSection.hull([
        CrossSection.circle(R, 48).translate([pv.x, pv.y]),
        CrossSection.circle(R, 48).translate([tipx, tipy]),
      ]));
    }
    out.push(CrossSection.union(fan).extrude(topCut - PZ).translate([0, 0, PZ]));
    // ピン穴
    out.push(Manifold.cylinder(topCut - (PZ - ST.holeDepth), ST.holeD / 2, ST.holeD / 2, 48)
      .translate([pv.x, pv.y, PZ - ST.holeDepth]));
  }
  return out;
}

/**
 * 印刷するストッパー部品を n 個、11×7mm 間隔で並べて返す。
 * 向き：腕の上面が z=0、ピンが上（サポートなしで印刷できる）。
 */
export function buildStoppers(W: ManifoldToplevel, n: number, sheetT: number): Manifold {
  const { Manifold } = W;
  const th = ST.armTopZ - (P.ledgeZ + sheetT); // 腕の厚さ
  const arm = armShape(W, ST.armR).extrude(th);
  const ch = ST.pinChamfer, r = ST.pinD / 2;
  const pin = Manifold.cylinder(ST.pinLen - ch, r, r, 48).translate([0, 0, th])
    .add(Manifold.cylinder(ch, r, r - ch, 48).translate([0, 0, th + ST.pinLen - ch]));
  const one = arm.add(pin);
  const arr: Manifold[] = [];
  for (let j = 0; j < Math.max(n, 1); j++) arr.push(one.translate([11 * (j % 6), 7 * Math.floor(j / 6), 0]));
  return Manifold.union(arr);
}
