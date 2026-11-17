// みずば：スポンジを入れる床のくぼみ（削る）。脚の継ぎ目（しまのタイル）には掘れない。
// 削る形は engine 側で「床の内側の安全な範囲」に限定される。
import type { TilePart } from '../engine/registry';
import { P } from '../engine/params';

export const pondPart: TilePart = {
  id: 'pond',
  name: 'みずば',
  domain: 'tile',
  hint: 'スポンジを いれる くぼみ。ななめの しまの マスは あしの つなぎめなので ほれないよ。',
  icon: '<svg viewBox="0 0 30 30"><rect x="5" y="7" width="20" height="16" rx="3" fill="var(--pond)"/><circle cx="11" cy="13" r="1.6" fill="#fff" opacity=".7"/><circle cx="18" cy="17" r="1.6" fill="#fff" opacity=".7"/><circle cx="19" cy="11" r="1.2" fill="#fff" opacity=".7"/></svg>',
  canPlace({ tx, ty, isSeam }) {
    if (isSeam(tx) || isSeam(ty)) return { ok: false, reason: 'しまの マスは あしの つなぎめなので、みずばは ほれないよ' };
    return { ok: true };
  },
  solids({ box, x, y, h }) {
    return { cut: [box(x - h, y - h, P.pondBottom, x + h, y + h, P.floorZ + 0.01)] };
  },
  draw2d({ c, x, y, h, sx, sy, scale, rr, col }) {
    c.fillStyle = col.pond; c.fill(rr(x - h + 0.6, y - h + 0.6, x + h - 0.6, y + h - 0.6, 1.5));
    c.fillStyle = 'rgba(255,255,255,.55)';
    for (const [a, b] of [[-2.5, 2], [1.5, 2.8], [2.4, -1.6], [-1.6, -2.4], [0, 0]]) {
      c.beginPath(); c.arc(sx(x + a), sy(y + b), 0.9 * scale, 0, 7); c.fill();
    }
  },
};
