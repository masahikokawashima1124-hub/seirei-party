import Phaser from 'phaser';
import type { CharacterDef } from '../characters';
import { INVINCIBLE_TIME, MAX_JUMPS, STOCKS, knockback, type HitKind } from './rules';
import type { FighterSnap } from '../net/protocol';

// 1フレーム分の操作。jump / throw / bump は「押した瞬間」だけ true
export interface FighterInput {
  left: boolean;
  right: boolean;
  down: boolean;
  jump: boolean;
  throw: boolean;
  bump: boolean;
}

export const NO_INPUT: FighterInput = { left: false, right: false, down: false, jump: false, throw: false, bump: false };

const BUMP_TIME = 200; // 体当たりで前に出ている時間(ms)
const BUMP_COOLDOWN = 800;
const AIR_ACCEL = 1500; // 空中で向きを変える強さ（小さいほど、ふっとびの勢いが残る）
const MAX_FALL = 1000;

export class Fighter {
  readonly def: CharacterDef;
  readonly body: Phaser.GameObjects.Rectangle; // 当たり判定（見えない）
  readonly visual: Phaser.GameObjects.Image; // 見た目
  damage = 0;
  stocks = STOCKS;
  facing: 1 | -1;
  jumpsLeft = MAX_JUMPS;
  stunUntil = 0;
  invincibleUntil = 0;
  nextThrowAt = 0;
  bumpUntil = 0;
  bumpHitDone = false;
  nextBumpAt = 0;
  dropUntil = 0; // 下を押して、すり抜け床を通り抜けている間
  out = false; // 場外に出て、戻ってくるのを待っている
  private wasGrounded = false;
  private squash = 0; // 見た目の伸び縮み（+でつぶれる、-で伸びる）
  // 2台で遊ぶときの子の画面：自分では動かさず、親から届いた様子を映す
  private remote = false;
  private remoteGrounded = false;
  private target: FighterSnap | null = null;

  constructor(scene: Phaser.Scene, def: CharacterDef, x: number, y: number, facing: 1 | -1) {
    this.def = def;
    this.facing = facing;
    const tex = scene.textures.get(def.id).getSourceImage() as HTMLImageElement;
    const scale = def.height / tex.height;
    const w = tex.width * scale * 0.62;
    const h = def.height * 0.86;

    this.body = scene.add.rectangle(x, y, w, h, 0xff0000, 0);
    scene.physics.add.existing(this.body);
    this.arcade.setMaxVelocity(2400, 2400);

    this.visual = scene.add.image(x, y, def.id).setOrigin(0.5, 1).setScale(scale);
  }

  get arcade(): Phaser.Physics.Arcade.Body {
    return this.body.body as Phaser.Physics.Arcade.Body;
  }

  get grounded(): boolean {
    if (this.remote) return this.remoteGrounded;
    return this.arcade.blocked.down || this.arcade.touching.down;
  }

  isStunned(now: number) {
    return now < this.stunUntil;
  }

  isInvincible(now: number) {
    return now < this.invincibleUntil;
  }

  isBumping(now: number) {
    return now < this.bumpUntil;
  }

  // 毎フレーム呼ぶ。戻り値で「まくらを投げた」かを返す
  update(input: FighterInput, now: number, dt: number): { threw: boolean } {
    const b = this.arcade;
    let threw = false;
    if (this.out) return { threw };

    const grounded = this.grounded;
    if (grounded) {
      this.jumpsLeft = MAX_JUMPS;
      if (!this.wasGrounded) this.squash = 0.25; // 着地でぽよん
    }
    this.wasGrounded = grounded;

    const stunned = this.isStunned(now);
    const bumping = this.isBumping(now);

    if (!stunned && !bumping) {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (dir !== 0) this.facing = dir as 1 | -1;
      const target = dir * this.def.speed;
      if (grounded) {
        b.velocity.x = Phaser.Math.Linear(b.velocity.x, target, 0.35);
      } else {
        const diff = target - b.velocity.x;
        const step = AIR_ACCEL * (dt / 1000);
        if (dir !== 0 || Math.abs(b.velocity.x) < this.def.speed) {
          b.velocity.x += Phaser.Math.Clamp(diff, -step, step);
        }
      }

      if (input.jump && this.jumpsLeft > 0) {
        const first = this.jumpsLeft === MAX_JUMPS && grounded;
        b.velocity.y = -this.def.jump * (first ? 1 : 0.88);
        this.jumpsLeft--;
        this.squash = -0.25;
      }

      if (input.down) {
        if (grounded) this.dropUntil = now + 220;
        else if (b.velocity.y > -100) b.velocity.y = Math.max(b.velocity.y, 750); // 早く落ちる
      }

      if (input.throw && now >= this.nextThrowAt) {
        this.nextThrowAt = now + this.def.throwCooldown;
        threw = true;
        this.squash = 0.15;
      }

      if (input.bump && now >= this.nextBumpAt) {
        this.nextBumpAt = now + BUMP_COOLDOWN;
        this.bumpUntil = now + BUMP_TIME;
        this.bumpHitDone = false;
        b.velocity.x = this.facing * this.def.speed * 2.4;
        if (grounded) b.velocity.y = -120;
        this.squash = -0.3;
      }
    } else if (grounded && stunned) {
      b.velocity.x *= 0.9; // 地面をすべって止まる
    }

    if (b.velocity.y > MAX_FALL && !stunned) b.velocity.y = MAX_FALL;
    this.syncVisual(now);
    return { threw };
  }

  // まくらや体当たりが当たった
  receiveHit(kind: HitKind, dirX: 1 | -1, now: number, scale = 1): boolean {
    if (this.out || this.isInvincible(now)) return false;
    this.damage = Math.min(999, this.damage + Math.round(kind.damage * scale));
    const kb = knockback(kind, this.damage, this.def.weight, dirX, scale);
    this.arcade.setVelocity(kb.vx, kb.vy);
    this.stunUntil = now + kb.stun;
    this.bumpUntil = 0;
    this.squash = 0.35;
    this.flash();
    return true;
  }

  // 当たった瞬間に白く光る
  flash() {
    this.visual.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.visual.scene.time.delayedCall(70, () => this.visual.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
  }

  // ---- 2台で遊ぶとき ----

  // 親：いまの様子を送る形にする
  snapshot(now: number): FighterSnap {
    const r = (n: number) => Math.round(n * 10) / 10;
    return {
      x: r(this.body.x),
      y: r(this.body.y),
      f: this.facing,
      d: this.damage,
      s: this.stocks,
      o: this.out,
      st: this.isStunned(now),
      inv: this.isInvincible(now),
      g: this.grounded,
      sq: Math.round(this.squash * 100) / 100,
    };
  }

  // 子：物理の計算をやめて、親から届いた様子を映すだけにする
  makeRemote() {
    this.remote = true;
    this.arcade.enable = false;
  }

  applySnapshot(s: FighterSnap, now: number) {
    // 場外から戻ったときなど、大きく離れたら一気に動かす
    if (!this.target || s.o !== this.out || Math.hypot(s.x - this.body.x, s.y - this.body.y) > 240) this.body.setPosition(s.x, s.y);
    this.target = s;
    this.facing = s.f;
    this.damage = s.d;
    this.stocks = s.s;
    this.out = s.o;
    this.stunUntil = s.st ? now + 1000 : 0;
    this.invincibleUntil = s.inv ? now + 1000 : 0;
    this.remoteGrounded = s.g;
    this.squash = s.sq;
    this.visual.setVisible(!s.o);
  }

  // 子：毎フレーム、届いた位置へなめらかに近づける
  remoteUpdate(now: number) {
    if (!this.target || this.out) return;
    this.body.setPosition(Phaser.Math.Linear(this.body.x, this.target.x, 0.6), Phaser.Math.Linear(this.body.y, this.target.y, 0.6));
    this.syncVisual(now);
  }

  // 場外に出た
  knockOut() {
    this.out = true;
    this.stocks--;
    this.arcade.setVelocity(0, 0);
    this.arcade.enable = false;
    this.visual.setVisible(false);
  }

  respawn(x: number, y: number, now: number) {
    this.out = false;
    this.damage = 0;
    this.body.setPosition(x, y);
    this.arcade.enable = true;
    this.arcade.reset(x, y);
    this.stunUntil = 0;
    this.bumpUntil = 0;
    this.invincibleUntil = now + INVINCIBLE_TIME;
    this.visual.setVisible(true);
    this.syncVisual(now);
  }

  private syncVisual(now: number) {
    const v = this.visual;
    const base = this.def.height / v.frame.realHeight;
    this.squash *= 0.82;
    const sy = 1 - this.squash;
    const sx = 1 + this.squash * 0.8;
    const flip = (this.facing === -1) !== this.def.facesLeft ? -1 : 1;
    v.setScale(base * sx * flip, base * sy);
    v.setPosition(this.body.x, this.body.y + this.body.height / 2 + 4);
    // ふっとび中はくるくる回る
    if (this.isStunned(now) && !this.grounded) v.rotation += 0.25 * -this.facing;
    else v.rotation = Phaser.Math.Angle.RotateTo(v.rotation, 0, 0.3);
    // むてき中はちかちか
    v.setAlpha(this.isInvincible(now) ? (Math.floor(now / 90) % 2 ? 0.35 : 1) : 1);
  }
}
