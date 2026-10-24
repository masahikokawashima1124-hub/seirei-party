import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

// ステージ「なつまつり」。足場の位置と見た目をまとめる。

export interface PlatformDef {
  x: number; // 左端
  y: number; // 上面
  w: number;
  oneWay: boolean; // 下からすり抜けられる足場
}

export const MAIN: PlatformDef = { x: 300, y: 540, w: 680, oneWay: false };
export const FLOATING: PlatformDef[] = [
  { x: 395, y: 410, w: 200, oneWay: true },
  { x: 685, y: 410, w: 200, oneWay: true },
  { x: 540, y: 285, w: 200, oneWay: true },
];

const LANTERN_COLORS = [0xff5a4e, 0xffa53d, 0xffe066, 0xff7aa8];

export function drawBackground(scene: Phaser.Scene) {
  const W = GAME_WIDTH;
  const H = GAME_HEIGHT;
  const g = scene.add.graphics().setDepth(-10);
  // 夜空のグラデーション
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0x140f3a),
      Phaser.Display.Color.ValueToColor(0x7a3f8f),
      steps - 1,
      i,
    );
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b)).fillRect(0, (H / steps) * i, W, H / steps + 1);
  }
  // 星
  const rnd = new Phaser.Math.RandomDataGenerator(['natsu']);
  for (let i = 0; i < 70; i++) {
    g.fillStyle(0xffffff, rnd.realInRange(0.3, 0.9)).fillCircle(rnd.between(0, W), rnd.between(0, H * 0.55), rnd.realInRange(0.8, 2.2));
  }
  // 月
  g.fillStyle(0xfff4c2, 0.18).fillCircle(1080, 110, 70);
  g.fillStyle(0xfff4c2).fillCircle(1080, 110, 46);
  // 遠くの山
  g.fillStyle(0x2a1d52);
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 40) g.lineTo(x, 470 + Math.sin(x / 140) * 40 + Math.sin(x / 57) * 14);
  g.lineTo(W, H);
  g.closePath();
  g.fillPath();

  // ちょうちんの列（2本）
  for (const row of [{ y: 70, sag: 60 }, { y: 150, sag: 40 }]) {
    g.lineStyle(2, 0x3b2a1a, 0.9);
    const pts: Phaser.Math.Vector2[] = [];
    for (let x = -20; x <= W + 20; x += 20) {
      const t = ((x + 20) % 320) / 320;
      pts.push(new Phaser.Math.Vector2(x, row.y + Math.sin(t * Math.PI) * row.sag));
    }
    g.strokePoints(pts);
    pts.forEach((p, i) => {
      if (i % 3 !== 1) return;
      const color = LANTERN_COLORS[(i + row.y) % LANTERN_COLORS.length];
      const glow = scene.add.circle(p.x, p.y + 16, 22, color, 0.18).setDepth(-9);
      scene.tweens.add({ targets: glow, alpha: 0.05, duration: rnd.between(900, 1600), yoyo: true, repeat: -1 });
      g.fillStyle(color).fillEllipse(p.x, p.y + 16, 22, 28);
      g.fillStyle(0x3b2a1a).fillRect(p.x - 6, p.y + 1, 12, 4).fillRect(p.x - 6, p.y + 28, 12, 4);
    });
  }
}

// ときどき花火を上げる
export function startFireworks(scene: Phaser.Scene) {
  const colors = [0xffd166, 0xff6b9a, 0x7cd4ff, 0xb4f08a, 0xffffff];
  const launch = () => {
    const x = Phaser.Math.Between(120, GAME_WIDTH - 120);
    const y = Phaser.Math.Between(70, 240);
    const color = Phaser.Utils.Array.GetRandom(colors);
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const dot = scene.add.circle(x, y, 4, color).setDepth(-8);
      scene.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * 90,
        y: y + Math.sin(a) * 90 + 20,
        alpha: 0,
        scale: 0.3,
        duration: 1100,
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  };
  scene.time.addEvent({ delay: 1600, loop: true, callback: launch });
  launch();
}

// 足場を描いて、当たり判定（静止した物体）を作る
export function buildPlatforms(scene: Phaser.Scene) {
  const solid = scene.physics.add.staticGroup();
  const oneWay = scene.physics.add.staticGroup();
  const g = scene.add.graphics().setDepth(-2);

  // やぐら（メインの足場）
  const m = MAIN;
  g.fillStyle(0x5a3418).fillRect(m.x + 30, m.y + 40, 24, 160).fillRect(m.x + m.w - 54, m.y + 40, 24, 160);
  // 紅白の幕
  const stripe = 34;
  for (let x = m.x + 8, i = 0; x < m.x + m.w - 8; x += stripe, i++) {
    g.fillStyle(i % 2 ? 0xffffff : 0xe63946).fillRect(x, m.y + 26, Math.min(stripe, m.x + m.w - 8 - x), 70);
  }
  g.fillStyle(0x000000, 0.18).fillRect(m.x + 8, m.y + 86, m.w - 16, 10);
  // 床板
  g.fillStyle(0x9b6230).fillRoundedRect(m.x, m.y, m.w, 28, 8);
  g.fillStyle(0xc68642).fillRect(m.x + 6, m.y + 3, m.w - 12, 6);
  solid.add(scene.add.zone(m.x + m.w / 2, m.y + 14, m.w, 28));

  // 浮いている足場（下からすり抜けられる）
  for (const p of FLOATING) {
    g.fillStyle(0x3b2a1a).fillRect(p.x + 20, p.y - 160, 2, 160).fillRect(p.x + p.w - 22, p.y - 160, 2, 160);
    g.fillStyle(0x8a5a2b).fillRoundedRect(p.x, p.y, p.w, 16, 6);
    g.fillStyle(0xc68642).fillRect(p.x + 4, p.y + 2, p.w - 8, 4);
    for (let i = 0; i < 3; i++) {
      const lx = p.x + 40 + i * 60;
      g.fillStyle(LANTERN_COLORS[i]).fillEllipse(lx, p.y + 32, 16, 20);
    }
    oneWay.add(scene.add.zone(p.x + p.w / 2, p.y + 6, p.w, 12));
  }
  return { solid, oneWay };
}
