// パーツの一覧。ここに1行たせば、engine（形）と UI（道具・描画・書き出し）に反映される。
// 新しいパーツは src/parts/<id>.ts を作って、ここに import して PARTS に足すだけ。
import type { PartDef } from '../engine/registry';
import { wallPart } from './wall';
import { rockPart } from './rock';
import { stepPart } from './step';
import { rampPart } from './ramp';
import { pondPart } from './pond';
import { tunnelPart } from './tunnel';
import { windowPart } from './window';

// 並び順＝UIの道具の並び（wall は edge だが「なかみ」の道具に出す）
export const PARTS: readonly PartDef[] = [
  wallPart,
  rockPart,
  stepPart,
  rampPart,
  pondPart,
  tunnelPart,
  windowPart,
];
