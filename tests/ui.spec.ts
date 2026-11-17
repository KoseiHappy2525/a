// UI の E2E（Playwright）。マス追加・めいろ・扉切替・トンネル・まど・書き出しを一通り。
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Win = Window & {
  __state: {
    cells: Set<string>; tiles: Map<string, { type: string; dir?: string }>;
    walls: Set<string>; doorsOff: Set<string>; windows: Set<string>;
  };
  __mesh: () => { decompose(): unknown[]; status(): string } | null;
};

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  // manifold(WASM) が初期化されてメッシュができるまで待つ
  await page.waitForFunction(() => {
    const w = window as unknown as Win;
    return !!(w.__mesh && w.__mesh());
  }, null, { timeout: 30000 });
  await expect(page.locator('#loading')).toBeHidden();
}

/** 盤面(2Dキャンバス)の mm 座標をタップする（world→client の対応は app.ts と同じ） */
async function tapCanvas(page: Page, wx: number, wy: number): Promise<void> {
  const box = await page.locator('#editor').boundingBox();
  if (!box) throw new Error('キャンバスが見つからない');
  const x = box.x + (wx + 8) * box.width / 184;    // sx の逆（dpr は打ち消される）
  const y = box.y + (176 - wy) * box.width / 184;   // sy の逆
  await page.mouse.click(x, y);
}

// 各テストは新しいページ（＝見本の状態）から始める
test.beforeEach(async ({ page }) => { await ready(page); });

test('3Dメッシュが多様体でボディ1つ', async ({ page }) => {
  const info = await page.evaluate(() => {
    const m = (window as unknown as Win).__mesh()!;
    return { status: m.status(), bodies: m.decompose().length };
  });
  expect(info.status).toBe('NoError');
  expect(info.bodies).toBe(1);
});

test('かたちモードで マスを ふやせる', async ({ page }) => {
  await page.click('#m-shape');
  const before = await page.evaluate(() => (window as unknown as Win).__state.cells.size);
  await tapCanvas(page, 105, 21); // マス(2,0) の中心。(1,0) にとなりあうので つながる
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__state.cells.size)).toBe(before + 1);
});

test('めいろ を つくると しきりが たくさん できる', async ({ page }) => {
  await page.click('#m-inside');
  await page.click('#p-clear');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__state.walls.size)).toBe(0);
  await page.click('#p-maze');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__state.walls.size)).toBeGreaterThan(5);
});

test('とびらを あける→ふさぐ→まど と きりかえられる', async ({ page }) => {
  await page.click('#m-doors');
  // マス(0,1) の にし の へん（見本では あいている）
  const id = '0,1,W';
  const read = () => page.evaluate((d) => {
    const s = (window as unknown as Win).__state;
    return { off: s.doorsOff.has(d), win: s.windows.has(d) };
  }, id);
  expect(await read()).toEqual({ off: false, win: false });     // あいている
  await tapCanvas(page, 3, 63);
  await expect.poll(read).toEqual({ off: true, win: false });    // → ふさぐ
  await tapCanvas(page, 3, 63);
  await expect.poll(read).toEqual({ off: false, win: true });    // → まど
  await tapCanvas(page, 3, 63);
  await expect.poll(read).toEqual({ off: false, win: false });   // → あける にもどる
});

test('トンネルを おける（なかみモード）', async ({ page }) => {
  await page.click('#m-inside');
  await page.click('[data-tool="tunnel"]');
  await tapCanvas(page, 73.5, 31.5); // タイル(6,2) の中心
  await expect.poll(() => page.evaluate(() => {
    const t = (window as unknown as Win).__state.tiles.get('6,2');
    return t ? t.type : null;
  })).toBe('tunnel');
});

test('書き出しの zip に 本体・ゲート・まどの型紙・設計データ が入る', async ({ page }) => {
  // 見本には まど(1,0,S) が入っているので window_plate が出る
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export'),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const path = await download.path();
  const buf = readFileSync(path);
  const has = (name: string) => buf.includes(Buffer.from(name));
  expect(has('.stl')).toBeTruthy();            // 本体STL
  expect(has('gate_x')).toBeTruthy();          // ゲートSTL
  expect(has('window_plate')).toBeTruthy();    // まどの透明板の型紙
  expect(has('_design.json')).toBeTruthy();    // 設計データ
});
