import { defineConfig } from 'vitest/config';

// GitHub Pages などのサブパスでも動くよう base は相対パスにする。
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  // manifold-3d(emscripten) を事前バンドルさせない。
  // 事前バンドルすると wasm の URL が .vite/deps に書き換わり、dev で読めなくなるため。
  optimizeDeps: { exclude: ['manifold-3d'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
