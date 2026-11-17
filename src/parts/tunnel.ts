// トンネル（屋根つき）：1タイルぶんの屋根つき通路。dir が通路の向き。タップで向きが変わる。
// 3D印刷でブリッジ（橋渡し）になるため、屋根の下角を面取り（下広がりの台形）にしてスパンを抑える。
import type { TilePart } from '../engine/registry';
import { P } from '../engine/params';

const WALL_T = 1.0;   // 側壁の厚み
const CHAMFER = 2.0;  // 屋根の面取り（水平方向の入り）
const ROOF_UNDER = P.floorZ + 9;    // 天井の下面 15.5mm（内側の有効高さの範囲に収める）
const ROOF_TOP = P.floorZ + 10.5;   // 屋根の上面 17mm（フタ受け 19.3 より下）

export const tunnelPart: TilePart = {
  id: 'tunnel',
  name: 'トンネル',
  domain: 'tile',
  rotatable: true,
  hint: 'やねの ある とおりみち。タップで むきが かわるよ。いきものが したを とおれるよ。',
  icon: '<svg viewBox="0 0 30 30"><path d="M4 25 V14 a11 11 0 0 1 22 0 V25" fill="var(--rock)"/><path d="M10 25 V15 a5 5 0 0 1 10 0 V25" fill="var(--floor)"/></svg>',
  solids({ W, box, x, y, h, z0, dir }) {
    const inner = h - WALL_T;                 // 半通路幅 4.25mm
    const block = box(x - h, y - h, z0, x + h, y + h, ROOF_TOP);
    const alongY = dir === 'N' || dir === 'S';
    // 通路（削る）：下広がりの台形プリズム。下は広く(inner)、上は狭く(inner-CHAMFER)。
    let lowWide, topNarrow;
    if (alongY) {
      lowWide = box(x - inner, y - (h + 1), z0, x + inner, y + (h + 1), z0 + 0.5);
      topNarrow = box(x - (inner - CHAMFER), y - (h + 1), ROOF_UNDER - 0.5, x + (inner - CHAMFER), y + (h + 1), ROOF_UNDER);
    } else {
      lowWide = box(x - (h + 1), y - inner, z0, x + (h + 1), y + inner, z0 + 0.5);
      topNarrow = box(x - (h + 1), y - (inner - CHAMFER), ROOF_UNDER - 0.5, x + (h + 1), y + (inner - CHAMFER), ROOF_UNDER);
    }
    const passage = W.Manifold.hull([lowWide, topNarrow]);
    return { add: [block.subtract(passage)] };
  },
  draw2d({ c, x, y, h, sx, sy, scale, dpr, col, dir }) {
    const inner = 4.25;
    const alongY = dir === 'N' || dir === 'S';
    // 側壁（屋根の見え）
    c.fillStyle = col.rock; c.fillRect(sx(x - h), sy(y + h), 10.5 * scale, 10.5 * scale);
    // 通路（床色）
    c.fillStyle = col.floor;
    if (alongY) c.fillRect(sx(x - inner), sy(y + h), 2 * inner * scale, 10.5 * scale);
    else c.fillRect(sx(x - h), sy(y + inner), 10.5 * scale, 2 * inner * scale);
    // 屋根のリッジ（中央の線）と向きの矢印
    c.strokeStyle = col.ink; c.fillStyle = col.ink; c.lineWidth = 1.4 * dpr;
    c.save(); c.translate(sx(x), sy(y)); c.rotate(alongY ? -Math.PI / 2 : 0);
    // 入口のアーチ（両はし）
    for (const sgn of [-1, 1]) {
      c.beginPath();
      c.arc(sgn * (h - 0.6) * scale, 0, inner * scale, sgn > 0 ? -Math.PI / 2 : Math.PI / 2, sgn > 0 ? Math.PI / 2 : (3 * Math.PI) / 2, sgn < 0);
      c.stroke();
    }
    c.restore();
  },
};
