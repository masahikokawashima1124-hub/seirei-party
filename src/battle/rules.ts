// 対戦ルールの数値（画面表示に依存しない）

export const STOCKS = 3; // ふうせんの数（場外に出ると1つ減る）
export const MAX_JUMPS = 3; // 地上ジャンプ＋空中2回
export const GRAVITY = 1900;
export const RESPAWN_DELAY = 1200; // 場外から戻ってくるまで(ms)
export const INVINCIBLE_TIME = 2000; // 戻ってきた直後のむてき時間(ms)

export interface HitKind {
  damage: number; // 増える％
  base: number; // 0％でも飛ぶ強さ
  growth: number; // ％1あたりに増える強さ
  angle: number; // 飛ぶ角度（度。0=真横、90=真上）
}

export const PILLOW_HIT: HitKind = { damage: 7, base: 260, growth: 7, angle: 38 };
export const BUMP_HIT: HitKind = { damage: 11, base: 320, growth: 9, angle: 45 };

export interface Knockback {
  vx: number;
  vy: number;
  stun: number; // 操作できない時間(ms)
}

// 当たったときに飛ぶ速さ。％が高いほど、体重が軽いほど遠くへ飛ぶ。
// damage は「当たった後」の％を渡す。
export function knockback(kind: HitKind, damageAfter: number, weight: number, dirX: 1 | -1, scale = 1): Knockback {
  const power = ((kind.base + damageAfter * kind.growth) / weight) * scale;
  const rad = (kind.angle * Math.PI) / 180;
  return {
    vx: dirX * power * Math.cos(rad),
    vy: -power * Math.sin(rad) - 120,
    stun: 150 + power * 0.22,
  };
}

// ステージの外（ここを越えたらふっとび）
export function isOutOfBounds(x: number, y: number, width: number, height: number): boolean {
  return x < -260 || x > width + 260 || y > height + 260 || y < -520;
}
