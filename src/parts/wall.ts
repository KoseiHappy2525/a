// かべ（しきり）：タイルの境目に立てる薄い壁。1タイルぶんの長さ。
// 置ける場所はタイルの境目（edge ドメイン）。
import type { EdgePart } from '../engine/registry';
import { P } from '../engine/params';

export const wallPart: EdgePart = {
  id: 'wall',
  name: 'かべ',
  domain: 'edge',
  hint: 'マスの さかいめを なぞると、うすい かべが できるよ。もういちど なぞると きえるよ。',
  icon: '<svg viewBox="0 0 30 30"><rect x="4" y="4" width="22" height="22" rx="3" fill="var(--floor)" stroke="var(--line)"/><rect x="14" y="5" width="2.4" height="20" fill="var(--part)"/></svg>',
  solids({ box, o, x, y, h }) {
    const t2 = P.partT / 2;
    if (o === 'v') return { add: [box(x - t2, y - h - t2, P.floorZ - 0.01, x + t2, y + h + t2, P.innerTop)] };
    return { add: [box(x - h - t2, y - t2, P.floorZ - 0.01, x + h + t2, y + t2, P.innerTop)] };
  },
  draw2d({ c, o, x, y, sx, sy, scale, col }) {
    c.fillStyle = col.wall;
    const t2 = 0.75;
    if (o === 'v') c.fillRect(sx(x - t2), sy(y + 5.25 + t2), 2 * t2 * scale, (10.5 + 2 * t2) * scale);
    else c.fillRect(sx(x - 5.25 - t2), sy(y + t2), (10.5 + 2 * t2) * scale, 2 * t2 * scale);
  },
};
