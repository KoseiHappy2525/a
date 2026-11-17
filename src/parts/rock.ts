// いわ：いきものが通れない、床から天井までの塊。
import type { TilePart } from '../engine/registry';
import { P } from '../engine/params';

export const rockPart: TilePart = {
  id: 'rock',
  name: 'いわ',
  domain: 'tile',
  hint: 'いわを おくと、いきものが とおれない ばしょが できるよ。',
  icon: '<svg viewBox="0 0 30 30"><rect x="6" y="6" width="18" height="18" rx="5" fill="var(--rock)"/></svg>',
  solids({ box, x, y, h, z0 }) {
    return { add: [box(x - h, y - h, z0, x + h, y + h, P.innerTop)] };
  },
  draw2d({ c, x, y, h, sx, sy, dpr, rr, col }) {
    c.fillStyle = col.rock; c.fill(rr(x - h + 0.4, y - h + 0.4, x + h - 0.4, y + h - 0.4, 2.2));
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1.2 * dpr;
    c.beginPath(); c.moveTo(sx(x - 2.5), sy(y + 1)); c.lineTo(sx(x + 0.5), sy(y - 1.5)); c.lineTo(sx(x + 2.8), sy(y + 0.5)); c.stroke();
  },
};
