// 1ファイルのHTMLにまとめる：node build.mjs
import { build } from 'esbuild';
import fs from 'fs';
await build({ entryPoints: ['src/app.js'], bundle: true, format: 'esm', minify: true, platform: 'browser',
  external: ['module'], target: 'es2020', outfile: 'dist/bundle.js' });
const shell = fs.readFileSync('src/shell.html', 'utf8');
const js = fs.readFileSync('dist/bundle.js', 'utf8').replaceAll('</script', '<\\/script');
const wasm = fs.readFileSync('node_modules/manifold-3d/manifold.wasm').toString('base64');
const page = shell.split('__WASM_B64__').join(wasm).split('__BUNDLE__').join(js);
fs.writeFileSync('dist/kansatsu-parts_artifact.html', page); // claude.ai アーティファクト用（doctypeなし）
fs.writeFileSync('dist/kansatsu-parts_standalone.html',
  '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + page + '</body></html>');
console.log('built dist/');
