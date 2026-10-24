import { describe, expect, it } from 'vitest';
import { BUMP_HIT, PILLOW_HIT, isOutOfBounds, knockback } from './rules';

describe('rules', () => {
  it('％が高いほど遠くへ飛ぶ', () => {
    const low = knockback(PILLOW_HIT, 10, 1, 1);
    const high = knockback(PILLOW_HIT, 100, 1, 1);
    expect(high.vx).toBeGreaterThan(low.vx);
    expect(high.vy).toBeLessThan(low.vy); // 上向きはマイナス
    expect(high.stun).toBeGreaterThan(low.stun);
  });

  it('重いキャラほど飛ばされにくい', () => {
    const light = knockback(BUMP_HIT, 50, 0.85, 1);
    const heavy = knockback(BUMP_HIT, 50, 1.3, 1);
    expect(Math.abs(light.vx)).toBeGreaterThan(Math.abs(heavy.vx));
  });

  it('当たった向きに飛ぶ', () => {
    expect(knockback(PILLOW_HIT, 30, 1, -1).vx).toBeLessThan(0);
    expect(knockback(PILLOW_HIT, 30, 1, 1).vx).toBeGreaterThan(0);
  });

  it('画面の外に大きく出たら場外', () => {
    expect(isOutOfBounds(640, 360, 1280, 720)).toBe(false);
    expect(isOutOfBounds(-300, 360, 1280, 720)).toBe(true);
    expect(isOutOfBounds(640, 1000, 1280, 720)).toBe(true);
  });
});
