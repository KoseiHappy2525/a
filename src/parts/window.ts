// まど：外周の壁にあける のぞき窓。ただの穴だと脱走路になるので、
// 透明板（子どもがプラ板を切る）を上から差し込む溝にする。外周の辺の中央（扉と同じ位置）に置け、扉とは排他。
import type { Manifold } from 'manifold-3d';
import type { PerimPart } from '../engine/registry';
import { P } from '../engine/params';

const WIN_W = 16;        // あなの幅
const WIN_Z0 = 8;        // あなの下
const WIN_Z1 = 17;       // あなの上
const SLOT_W = 16.6;     // 透明板の溝の幅
const SLOT_T = 1.4;      // 溝の厚み（板1.0mm＋あそび）
const SLOT_IN = 1.1;     // 外面からの奥行き
const PLATE_W = SLOT_W - 0.8;         // 透明板の幅 15.8mm
const PLATE_H = P.top - P.floorZ;     // 透明板の高さ 15mm（溝の底から上まで）

const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

export const windowPart: PerimPart = {
  id: 'window',
  name: 'まど',
  domain: 'perimeter',
  hint: 'まどを つけると なかが みえるよ。とうめいばんを さしこむから、いきものは でられないよ。',
  icon: '<svg viewBox="0 0 30 30"><rect x="6" y="6" width="18" height="18" rx="2" fill="var(--pond)" opacity=".5" stroke="var(--ink)" stroke-width="1.4"/><path d="M15 6v18M6 15h18" stroke="var(--ink)" stroke-width="1.2"/></svg>',
  solids({ box, d, cx, cy, face }) {
    const inW = P.wall + 1;         // 壁を貫通
    const hw = WIN_W / 2, hs = SLOT_W / 2;
    const s0 = face - SLOT_IN - SLOT_T, s1 = face - SLOT_IN;
    const cut: Manifold[] = [];
    if (d === 'N' || d === 'S') {
      const sg = d === 'N' ? 1 : -1;
      const yf = (a: number, b: number): [number, number] => sg > 0 ? [cy + a, cy + b] : [cy - b, cy - a];
      const [oy0, oy1] = yf(face - inW, face + 2);
      const [gy0, gy1] = yf(s0, s1);
      cut.push(box(cx - hw, oy0, WIN_Z0, cx + hw, oy1, WIN_Z1));          // 窓あな（貫通）
      cut.push(box(cx - hs, gy0, P.floorZ, cx + hs, gy1, P.top + 5));     // 透明板の溝（上から差す）
    } else {
      const sg = d === 'E' ? 1 : -1;
      const xf = (a: number, b: number): [number, number] => sg > 0 ? [cx + a, cx + b] : [cx - b, cx - a];
      const [ox0, ox1] = xf(face - inW, face + 2);
      const [gx0, gx1] = xf(s0, s1);
      cut.push(box(ox0, cy - hw, WIN_Z0, ox1, cy + hw, WIN_Z1));
      cut.push(box(gx0, cy - hs, P.floorZ, gx1, cy + hs, P.top + 5));
    }
    return { cut };
  },
  template() {
    const w = PLATE_W, h = PLATE_H;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 20}mm" height="${h + 30}mm" viewBox="-10 -20 ${w + 20} ${h + 30}">
<text x="0" y="-10" font-size="4" font-family="sans-serif">${esc('まど の とうめいばん（原寸・100%で印刷）　線の内側を切る')}</text>
<rect x="0" y="0" width="${w}" height="${h}" rx="1" fill="none" stroke="#000" stroke-width="0.3"/>
<line x1="0" y1="-4" x2="50" y2="-4" stroke="#000" stroke-width="0.4"/><text x="52" y="-2.5" font-size="3.5" font-family="sans-serif">50mm</text>
</svg>`;
    return { name: 'window_plate_template.svg', text: svg };
  },
  draw2d({ c, d, cx, cy, sx, sy, scale, dpr, col }) {
    const f = 20.75, vert = d === 'N' || d === 'S', s = d === 'N' || d === 'E' ? 1 : -1;
    c.fillStyle = 'rgba(120,185,225,.55)';
    c.strokeStyle = col.ink; c.lineWidth = 1.2 * dpr;
    if (vert) {
      const yc = cy + s * (f - 2);
      c.fillRect(sx(cx - 8), sy(yc + 1.8), 16 * scale, 3.6 * scale);
      c.strokeRect(sx(cx - 8), sy(yc + 1.8), 16 * scale, 3.6 * scale);
      c.beginPath(); c.moveTo(sx(cx), sy(yc + 1.8)); c.lineTo(sx(cx), sy(yc - 1.8)); c.stroke();
    } else {
      const xc = cx + s * (f - 2);
      c.fillRect(sx(xc - 1.8), sy(cy + 8), 3.6 * scale, 16 * scale);
      c.strokeRect(sx(xc - 1.8), sy(cy + 8), 3.6 * scale, 16 * scale);
      c.beginPath(); c.moveTo(sx(xc - 1.8), sy(cy)); c.lineTo(sx(xc + 1.8), sy(cy)); c.stroke();
    }
  },
};
