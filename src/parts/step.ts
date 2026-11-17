// だん：床より stepH(mm) 高い台。さかと組み合わせると のぼれる。
import type { TilePart } from '../engine/registry';
import { P } from '../engine/params';

export const stepPart: TilePart = {
  id: 'step',
  name: 'だん',
  domain: 'tile',
  hint: 'だんは ゆかより たかい だいだよ。さかと くみあわせると のぼれるよ。',
  icon: '<svg viewBox="0 0 30 30"><rect x="5" y="8" width="20" height="16" fill="var(--step)"/><path d="M5 8h20" stroke="var(--part)" stroke-width="2"/></svg>',
  solids({ box, x, y, h, z0, stepH }) {
    return { add: [box(x - h, y - h, z0, x + h, y + h, P.floorZ + stepH)] };
  },
  draw2d({ c, x, y, h, sx, sy, scale, dpr, col }) {
    c.fillStyle = col.step; c.fillRect(sx(x - h), sy(y + h), 10.5 * scale, 10.5 * scale);
    c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 1 * dpr;
    for (let s = -h; s < h; s += 2.2) {
      c.beginPath(); c.moveTo(sx(x + s), sy(y - h)); c.lineTo(sx(x + Math.min(h, s + 10.5)), sy(y - h + Math.min(10.5, h - s))); c.stroke();
    }
  },
};
