// さか：床から だんの高さへの斜面。dir がのぼる（高い）向き。タップで向きが変わる。
import type { TilePart } from '../engine/registry';
import type { Vec3 } from '../engine/shapes';
import { P } from '../engine/params';

export const rampPart: TilePart = {
  id: 'ramp',
  name: 'さか',
  domain: 'tile',
  rotatable: true,
  hint: 'さかを おこう。おいた さかを もういちど タップすると、のぼる むきが かわるよ。',
  icon: '<svg viewBox="0 0 30 30"><path d="M4 24 L26 24 L26 9 Z" fill="var(--step)"/><path d="M8 20 L20 12" stroke="var(--part)" stroke-width="2"/><path d="M21 9 l1.5 5 -5 -1z" fill="var(--part)"/></svg>',
  solids({ W, x, y, h, z0, stepH, dir }) {
    const lo: Vec3[] = [], hi: Vec3[] = [];
    const c: [number, number][] = [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]];
    const high = ({ E: [1, 2], W: [3, 0], N: [2, 3], S: [0, 1] } as const)[dir || 'E'];
    c.forEach((q, idx) => {
      lo.push([q[0], q[1], z0]);
      if ((high as readonly number[]).includes(idx)) hi.push([q[0], q[1], P.floorZ + stepH]);
    });
    return { add: [W.Manifold.hull([...lo, ...hi])] };
  },
  draw2d({ c, x, y, h, sx, sy, scale, dpr, col, dir }) {
    const d = dir || 'E';
    const g = d === 'E' || d === 'W'
      ? c.createLinearGradient(sx(x - h), 0, sx(x + h), 0)
      : c.createLinearGradient(0, sy(y - h), 0, sy(y + h));
    const lo = col.floor, hi2 = col.step;
    const forward = d === 'E' || d === 'N';
    g.addColorStop(0, forward ? lo : hi2); g.addColorStop(1, forward ? hi2 : lo);
    c.fillStyle = g; c.fillRect(sx(x - h), sy(y + h), 10.5 * scale, 10.5 * scale);
    const ang = { E: 0, N: -Math.PI / 2, W: Math.PI, S: Math.PI / 2 }[d];
    c.save(); c.translate(sx(x), sy(y)); c.rotate(ang);
    c.strokeStyle = col.ink; c.fillStyle = col.ink; c.lineWidth = 1.6 * dpr;
    c.beginPath(); c.moveTo(-3 * scale, 0); c.lineTo(2 * scale, 0); c.stroke();
    c.beginPath(); c.moveTo(3.4 * scale, 0); c.lineTo(1.2 * scale, -1.8 * scale); c.lineTo(1.2 * scale, 1.8 * scale); c.closePath(); c.fill();
    c.restore();
  },
};
