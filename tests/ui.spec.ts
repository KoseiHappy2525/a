// UI の E2E（Playwright）。スタート→せつめい→エディタ（①かたち ②なかみ ③データ）の流れと主要操作。
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Win = Window & {
  __state: {
    cells: Set<string>; tiles: Map<string, { type: string; dir?: string }>;
    walls: Set<string>; doorsOff: Set<string>; windows: Set<string>;
    screen: string; step: number; mode: string;
  };
  __mesh: () => { decompose(): unknown[]; status(): string } | null;
};

// スタート→せつめい→エディタ に入り、メッシュができるまで待つ
async function enterEditor(page: Page): Promise<void> {
  await page.goto('/');
  await page.click('#btn-start');   // はじめる → せつめい
  await page.click('#btn-go');      // つくってみる → エディタ
  await page.waitForFunction(() => {
    const w = window as unknown as Win;
    return !!(w.__mesh && w.__mesh());
  }, null, { timeout: 30000 });
  await expect(page.locator('#editor-wrap')).toBeVisible();
}

/** 盤面(2Dキャンバス)の mm 座標をタップする（world→client の対応は app.ts と同じ） */
async function tapCanvas(page: Page, wx: number, wy: number): Promise<void> {
  const box = await page.locator('#editor').boundingBox();
  if (!box) throw new Error('キャンバスが見つからない');
  const x = box.x + (wx + 8) * box.width / 184;
  const y = box.y + (176 - wy) * box.width / 184;
  await page.mouse.click(x, y);
}

test.beforeEach(async ({ page }) => { await enterEditor(page); });

test('スタート→せつめい→エディタ と すすめる', async ({ page }) => {
  // enterEditor まで来ている
  expect(await page.evaluate(() => (window as unknown as Win).__state.screen)).toBe('editor');
  expect(await page.evaluate(() => (window as unknown as Win).__state.step)).toBe(1);
});

test('3Dメッシュが多様体でボディ1つ', async ({ page }) => {
  const info = await page.evaluate(() => {
    const m = (window as unknown as Win).__mesh()!;
    return { status: m.status(), bodies: m.decompose().length };
  });
  expect(info.status).toBe('NoError');
  expect(info.bodies).toBe(1);
});

test('①かたち：マスを ふやせる', async ({ page }) => {
  await page.click('[data-sub="shape"]');
  const before = await page.evaluate(() => (window as unknown as Win).__state.cells.size);
  await tapCanvas(page, 105, 21); // マス(2,0) の中心。(1,0) にとなりあうので つながる
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__state.cells.size)).toBe(before + 1);
});

test('①かたち：とびらを あける→ふさぐ→まど と きりかえ', async ({ page }) => {
  await page.click('[data-sub="doors"]'); // でいりぐち・まど
  const id = '0,1,W'; // マス(0,1)の西（見本では あいている）
  const read = () => page.evaluate((d) => {
    const s = (window as unknown as Win).__state;
    return { off: s.doorsOff.has(d), win: s.windows.has(d) };
  }, id);
  expect(await read()).toEqual({ off: false, win: false });
  await tapCanvas(page, 3, 63);
  await expect.poll(read).toEqual({ off: true, win: false });   // → ふさぐ
  await tapCanvas(page, 3, 63);
  await expect.poll(read).toEqual({ off: false, win: true });   // → まど
  await tapCanvas(page, 3, 63);
  await expect.poll(read).toEqual({ off: false, win: false });  // → あける
});

test('②なかみ：めいろ で しきりが たくさん できる', async ({ page }) => {
  await page.click('[data-step="2"]');
  await page.click('#p-clear');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__state.walls.size)).toBe(0);
  await page.click('#p-maze');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__state.walls.size)).toBeGreaterThan(5);
});

test('②なかみ：トンネルを おける', async ({ page }) => {
  await page.click('[data-step="2"]');
  await page.click('[data-tool="tunnel"]');
  await tapCanvas(page, 73.5, 31.5); // タイル(6,2)
  await expect.poll(() => page.evaluate(() => {
    const t = (window as unknown as Win).__state.tiles.get('6,2');
    return t ? t.type : null;
  })).toBe('tunnel');
});

test('③データ：書き出しの zip に 本体・ゲート・まどの型紙・設計データ が入る', async ({ page }) => {
  await page.click('[data-step="3"]');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export'),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const buf = readFileSync(await download.path());
  const has = (name: string) => buf.includes(Buffer.from(name));
  expect(has('.stl')).toBeTruthy();
  expect(has('gate_x')).toBeTruthy();
  expect(has('window_plate')).toBeTruthy(); // 見本に まど(1,0,S) があるため
  expect(has('_design.json')).toBeTruthy();
  expect(has('_stopper_x')).toBeTruthy();    // ストッパー部品（回転アーム＋ピン）
  expect(has('_lid_template')).toBeTruthy();  // フタの型紙
});
