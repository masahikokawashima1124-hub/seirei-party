import { defineConfig } from 'vite';

export default defineConfig({
  // 相対パスで出力（スマホアプリ化・GitHub Pages などで必要）
  base: './',
  build: {
    // Phaser 本体が約1.4MBあるため警告の基準を上げる
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5174,
    host: true, // 同じWi-Fiのスマホから実機確認できるようにする
  },
});
