# かんさつパーツ工房（試作版 v0.1）

6〜12歳の子どもが、生き物観察キット用のパーツ（Gridfinity互換）をブラウザで作り、STLとして書き出すツールの試作版。
形の計算は manifold-3d（WASM）、3D表示は three.js。サーバーは使わず、すべてブラウザ内で動く。

## フォルダの中身
```
kansatsu-parts-kobo/
├─ src/
│  ├─ engine.js   形状エンジン（脚・壁・扉・ゲート溝・フタ受け・中身パーツ・STL書き出し）
│  ├─ app.js      UI（2Dエディタ、3Dプレビュー、めいろ生成、zip書き出し）
│  └─ shell.html  画面のHTMLとCSS（__WASM_B64__ と __BUNDLE__ はビルド時に埋め込まれる）
├─ tests/engine.test.mjs  形状エンジンの簡易テスト
├─ build.mjs      1ファイルのHTMLにまとめるビルドスクリプト
├─ dist/
│  ├─ kansatsu-parts_standalone.html  ダブルクリックでそのまま開ける版
│  └─ kansatsu-parts_artifact.html    claude.ai のアーティファクトに載せる版
└─ CLAUDE_CODE_PROMPT.md  Claude Code に続きを作ってもらうためのプロンプト
```

## 使い方
```
npm install
npm test        # 形状エンジンのテスト（tests/out/ にSTLが出る）
npm run build   # dist/ にHTMLを作る
```

## 基準にしている試作STL
1つ上の階層の `ダンゴムシ/` フォルダにある STL（A_home_box_2x1.stl など）が、寸法の基準。
`A_home_box_2x1.stl` とこのエンジンの出力は、脚の断面が完全に一致し、全体の体積の差は約0.6%（33.11 / 32.91 cm³）。

## 既知の制限
- 高さは21.5mmに固定（ゲートの寸法を変えないため）
- 傾斜は1タイル分の「さか」だけ
- 中身パーツの種類は engine.js と app.js に直接書いてある（今後レジストリ方式にする予定）
- claude.ai のアーティファクト上では .stl を直接配れないため、zipで保存している
