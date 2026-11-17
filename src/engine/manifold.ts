// manifold-3d(WASM) の読み込み。Node でもブラウザでも使えるようにする。
import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';

let _w: Promise<ManifoldToplevel> | null = null;

export interface ManifoldLoadOptions {
  /** wasm のバイナリを直接渡す */
  wasmBinary?: ArrayBuffer | Uint8Array;
  /** wasm の URL を返す（ブラウザ/Vite 用。`import url from 'manifold-3d/manifold.wasm?url'` を渡す） */
  locateFile?: (path: string, prefix: string) => string;
}

/**
 * manifold をセットアップして返す（1度だけ初期化）。
 * - ブラウザ(Vite)では locateFile に wasm の URL を渡す（dev/build どちらでも正しく読める）。
 * - Node（テスト）では引数なしで、パッケージ同梱の wasm を使う。
 */
export function getManifold(opts?: ManifoldLoadOptions): Promise<ManifoldToplevel> {
  if (!_w) {
    const cfg = opts && (opts.wasmBinary || opts.locateFile) ? opts : undefined;
    _w = (Module as unknown as (c?: unknown) => Promise<ManifoldToplevel>)(cfg).then((w) => {
      w.setup();
      return w;
    });
  }
  return _w;
}

export type { ManifoldToplevel };
