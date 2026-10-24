// まなびめぐるの「4方向画像」から、ゲーム用のキャラクター画像（背景透明）を切り出す。
// 使い方: node scripts/extract-sprites.mjs
// 元画像は 4 体並び（正面・ななめ・横・後ろ）。横向きのゲームなので 2 番目（ななめ向き）を使う。
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = 'E:/小学生学習アプリ/キャラクター4方向画像';
const OUT_DIR = 'public/assets/chars';
const OUT_HEIGHT = 256;
const VIEW_INDEX = 1; // 0:正面 1:ななめ 2:横 3:後ろ

// ゲームに出すキャラクター（id はゲーム内で使う名前）
export const CHARACTERS = [
  { id: 'hanabi', file: 'No001_n1_はなびのこびと.png' },
  { id: 'natsu-king', file: 'No020_ur2_なつぞらのせいれいおう.png' },
  { id: 'aki-king', file: 'No080_あきぞらのせいれいおう.png' },
  { id: 'fuyu-king', file: 'No120_ふゆぞらのせいれいおう.png' },
  { id: 'haru-king', file: 'No160_はるぞらのせいれいおう.png' },
];

// 背景（灰色のグラデーション）を、画像の外周から塗りつぶすように透明にする
function removeBackground(data, width, height) {
  const idx = (x, y) => (y * width + x) * 4;
  const visited = new Uint8Array(width * height);
  const stack = [];
  const isBg = (i, ref) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const satOk = max - min < 18; // ほぼ無彩色
    const near = Math.abs(r - ref[0]) + Math.abs(g - ref[1]) + Math.abs(b - ref[2]) < 40; // 隣の背景色に近い
    return satOk && near && max > 120;
  };
  const push = (x, y, ref) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    const i = p * 4;
    if (!isBg(i, ref)) return;
    visited[p] = 1;
    stack.push([x, y, [data[i], data[i + 1], data[i + 2]]]);
  };
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) push(x, y, [data[idx(x, y)], data[idx(x, y) + 1], data[idx(x, y) + 2]]);
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) push(x, y, [data[idx(x, y)], data[idx(x, y) + 1], data[idx(x, y) + 2]]);
  }
  while (stack.length) {
    const [x, y, ref] = stack.pop();
    data[idx(x, y) + 3] = 0;
    push(x + 1, y, ref);
    push(x - 1, y, ref);
    push(x, y + 1, ref);
    push(x, y - 1, ref);
  }
  keepCenterBlob(data, width, height);
  // 境目を少しなじませる（背景に接しているピクセルを半透明に）
  const alpha = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) alpha[p] = data[p * 4 + 3];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      if (alpha[p] === 0) continue;
      const n = (alpha[p - 1] === 0) + (alpha[p + 1] === 0) + (alpha[p - width] === 0) + (alpha[p + width] === 0);
      if (n > 0) data[p * 4 + 3] = n >= 2 ? 90 : 170;
    }
  }
}

// 見えている部分のかたまりのうち、一番大きいもの（＝真ん中のキャラ）だけを残す。
// 隣のキャラの端や、ゴミのような点を消すため。
function keepCenterBlob(data, width, height) {
  const label = new Int32Array(width * height);
  const sizes = [0];
  for (let start = 0; start < width * height; start++) {
    if (label[start] || data[start * 4 + 3] === 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % width;
      for (const q of [p - 1, p + 1, p - width, p + width]) {
        if (q < 0 || q >= width * height) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === width - 1)) continue;
        if (label[q] || data[q * 4 + 3] === 0) continue;
        label[q] = id;
        stack.push(q);
      }
    }
    sizes.push(size);
  }
  let best = 1;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  for (let p = 0; p < width * height; p++) if (label[p] !== best) data[p * 4 + 3] = 0;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const c of CHARACTERS) {
  const src = sharp(join(SRC_DIR, c.file));
  const { width, height } = await src.metadata();
  const viewW = Math.floor(width / 4);
  // 4 体の区切りは均等ではないので、少し広めに切る
  const left = Math.max(0, viewW * VIEW_INDEX - Math.floor(viewW * 0.08));
  const cropW = Math.min(width - left, Math.floor(viewW * 1.16));
  const { data, info } = await sharp(join(SRC_DIR, c.file))
    .extract({ left, top: 0, width: cropW, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  removeBackground(data, info.width, info.height);
  // 切り抜き → 余白を詰める → 高さをそろえる
  const trimmed = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
  await sharp(trimmed)
    .trim({ threshold: 1 })
    .resize({ height: OUT_HEIGHT })
    .png()
    .toFile(join(OUT_DIR, `${c.id}.png`));
  console.log('ok', c.id);
}
