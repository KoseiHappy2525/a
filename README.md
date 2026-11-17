# かんさつパーツ工房（v0.2 / Vite + TypeScript）

6〜12歳の子どもが、生き物観察キット用のパーツ（Gridfinity互換）をブラウザで作り、STLとして書き出すツール。
形の計算は manifold-3d（WASM）、3D表示は three.js。サーバーは使わず、静的サイトとしてビルドでき、GitHub Pages などに置ける。

## 開発

Node.js が必要（このリポジトリは Node 24 で確認）。

```
npm install
npm test        # engine の検証（vitest）。試作STLとの比較を含む
npm run test:ui # UI の E2E（Playwright／chromium）。初回だけ npx playwright install chromium
npm run test:all# vitest ＋ playwright
npm run build   # dist/ に静的サイトを出力（GitHub Pages 向けに base は相対パス）
npm run dev     # 開発サーバ
npm run preview # ビルド結果をローカル確認
```

テストは *.test.ts が engine（vitest, Node）、*.spec.ts が UI（Playwright, ブラウザ）。
UIテストは `tests/ui.spec.ts`：マス追加・めいろ・扉の あける/ふさぐ/まど・トンネル・書き出し(zip) を通す。

## フォルダ構成

```
kansatsu-parts-kobo/
├─ index.html            Vite エントリ
├─ src/
│  ├─ main.ts            アプリのエントリ（CSS読込＋起動）
│  ├─ style.css          画面のCSS（ライト／ダーク対応）
│  ├─ engine/            形状エンジン（UIと独立・Nodeでもブラウザでも動く）
│  │  ├─ params.ts       寸法定数と座標ヘルパ（WASM不要）
│  │  ├─ types.ts        BinParams など
│  │  ├─ shapes.ts       純粋な形状ヘルパ（rrPoints）
│  │  ├─ geometry.ts     本体のから（脚・壁・扉・ゲート溝・フタ受け）＋パーツの組み立て
│  │  ├─ registry.ts     パーツの契約（PartDef）とレジストリ
│  │  ├─ outlines.ts     2Dエディタ・フタ型紙用の輪郭
│  │  ├─ stl.ts          STL 書き出し／読み込み（比較テスト用）
│  │  ├─ manifold.ts     manifold(WASM) の読み込み
│  │  └─ index.ts        公開API
│  ├─ parts/             パーツ（1パーツ＝1ファイル）
│  │  ├─ index.ts        PARTS 一覧（ここに1行たすと反映される）
│  │  ├─ wall.ts  rock.ts  step.ts  ramp.ts  pond.ts
│  │  └─ tunnel.ts  window.ts
│  └─ ui/                UI（engine を呼ぶ）
│     ├─ app.ts          2Dエディタ・3Dプレビュー・めいろ・操作・書き出し
│     └─ zip.ts          依存なしの ZIP 書き出し
├─ tests/engine.test.ts  engine の検証（vitest）
└─ prototype/            試作版 v0.1（参照用。engine.js と寸法の基準）

## パーツの足し方（1パーツ＝1ファイル）

1. `src/parts/<id>.ts` を作り、パーツを1つ `export` する。パーツは次をまとめる：
   - `id` / `name`（ひらがな）/ `icon`（inline SVG）/ `hint`（やさしいひらがな）
   - `domain`：`tile`（タイルに置く）/ `edge`（タイルの境目）/ `perimeter`（外周の辺＝扉の位置）
   - `canPlace?`：置けない条件（例：みずばは脚の継ぎ目に×）。省略するといつでも置ける
   - `solids(ctx)`：足す形 `add` と削る形 `cut` を返す（manifold-3d の Manifold 配列）
   - `draw2d(ctx)`：2Dエディタでの描き方
   - `perimeter` だけ `template?()` で型紙（まどの透明板など）を出せる
2. `src/parts/index.ts` の `PARTS` に import して足す。これだけで **道具ボタン・ヒント・2D描画・3Dの形・書き出し** に反映される。
3. 形は `tests/engine.test.ts` に「watertight でボディ1つ」などの確認を足す。

契約の型は [`src/engine/registry.ts`](src/engine/registry.ts) に、見本は既存の7パーツ（`src/parts/*.ts`）にある。
`tile` の見本は `rock.ts`（足すだけ）/`pond.ts`（削る＋置けない条件）/`ramp.ts`・`tunnel.ts`（向きを変えられる）、
`edge` は `wall.ts`、`perimeter` は `window.ts`（型紙つき）。
```

## 寸法の基準

1つ上の階層の `ダンゴムシ/A_home_box_2x1.stl` などが寸法の基準。
`tests/engine.test.ts` で、2×1 空ビンの外寸(83.5×41.5×21.5mm)と、脚の高さ **z=0.4 / 2.0 / 3.5 / 4.5** の断面積が
この試作STLと一致することを検証している（z=0.4・2.0 はほぼ完全一致、遷移部の z=3.5・4.5 も相対差 0.5%未満）。
寸法の値と脚の作り方は試作版（`prototype/src/engine.js`）からそのまま引き継いでいる。

## デプロイ（GitHub Pages）

`.github/workflows/deploy.yml` を同梱。main に push すると `npm ci && npm run build` が走り、`dist/` が
GitHub Pages に公開される（`base: './'` なので `/<リポジトリ名>/` のサブパスでも動く）。初回だけ次の手順が必要：

```bash
# 1) 自分の git 識別情報（まだなら）
git config --global user.name  "あなたの名前"
git config --global user.email "あなたのメール"

# 2) 最初のコミット（このフォルダで）
git add -A
git commit -m "かんさつパーツ工房 v0.2（Vite+TS 版）"

# 3) GitHub にリポジトリを作って push（<user>/<repo> は自分のもの）
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

4) GitHub の **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする。
   以後、push するたびに `https://<user>.github.io/<repo>/` が自動更新される。

> メモ：engine のテスト（vitest）は1つ上の `ダンゴムシ/A_home_box_2x1.stl` を参照するため、このフォルダだけを
> clone した環境では比較テストが動かない。デプロイの workflow はビルドのみで、テストは走らせていない。

## 進捗（CLAUDE_CODE_PROMPT.md の「進め方」）

- [x] 1. 試作版の動作確認と作り直し計画
- [x] 2. engine を TypeScript 化し、試作STLとの比較テストを通す
- [x] 3. UI（2Dエディタ・3Dプレビュー・めいろ・zip書き出し）を移植
- [x] 4. パーツのレジストリ化＋トンネル・まどを追加（足し方は上記「パーツの足し方」）

## メモ

- manifold(WASM) は `optimizeDeps.exclude: ['manifold-3d']`（vite.config.ts）で事前バンドルを外し、
  ブラウザでは `manifold-3d/manifold.wasm?url` を `locateFile` に渡して読み込む。dev / build どちらでも動く。
- `npm audit` が報告する脆弱性は dev 依存（vitest）のもので、出力される静的サイトには含まれない。vitest のメジャー更新で解消予定。
- 書き出しは `window.claude.use('downloads')` があればそれを使い、無ければ `<a download>` で保存する。
