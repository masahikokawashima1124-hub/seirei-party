import Phaser from 'phaser';
import { getCharacter } from '../characters';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CpuController, HumanController, type Controller } from '../battle/controllers';
import { Fighter, NO_INPUT } from '../battle/Fighter';
import { BUMP_HIT, MAX_JUMPS, PILLOW_HIT, RESPAWN_DELAY, STOCKS, isOutOfBounds } from '../battle/rules';
import { MAIN, buildPlatforms, drawBackground, startFireworks } from '../battle/stage';

export interface BattleData {
  p1: string; // キャラクターID
  p2: string;
}

interface Pillow {
  img: Phaser.Physics.Arcade.Image;
  owner: Fighter;
  scale: number;
  bornAt: number;
}

interface Hud {
  pct: Phaser.GameObjects.Text;
  balloons: Phaser.GameObjects.Arc[];
}

const PILLOW_LIFE = 1500;

export class BattleScene extends Phaser.Scene {
  private fighters: Fighter[] = [];
  private controllers: Controller[] = [];
  private pillows: Pillow[] = [];
  private huds: Hud[] = [];
  private started = false;
  private finished = false;
  private paused = false;
  private pauseLayer?: Phaser.GameObjects.Container;
  private data_!: BattleData;

  constructor() {
    super('Battle');
  }

  init(data: BattleData) {
    this.data_ = data;
    this.fighters = [];
    this.controllers = [];
    this.pillows = [];
    this.huds = [];
    this.started = false;
    this.finished = false;
    this.paused = false;
    this.pauseLayer = undefined;
  }

  create() {
    drawBackground(this);
    startFireworks(this);
    this.makePillowTexture();
    const { solid, oneWay } = buildPlatforms(this);

    const p1 = new Fighter(this, getCharacter(this.data_.p1), MAIN.x + 170, MAIN.y - 80, 1);
    const p2 = new Fighter(this, getCharacter(this.data_.p2), MAIN.x + MAIN.w - 170, MAIN.y - 80, -1);
    this.fighters = [p1, p2];
    const stageArea = { left: MAIN.x, right: MAIN.x + MAIN.w, top: MAIN.y };
    this.controllers = [new HumanController(this), new CpuController(p2, p1, stageArea, 0.45)];

    for (const f of this.fighters) {
      this.physics.add.collider(f.body, solid);
      // すり抜け床：上から落ちてきたときだけ乗れる
      this.physics.add.collider(f.body, oneWay, undefined, (_a, plat) => {
        const b = f.arcade;
        const top = ((plat as Phaser.GameObjects.Zone).body as Phaser.Physics.Arcade.StaticBody).top;
        return b.velocity.y >= 0 && b.prev.y + b.height <= top + 6 && this.time.now >= f.dropUntil;
      });
    }
    // キャラ同士は重なってよい（押し合いはしない）

    this.createHud();
    this.createPauseButton();
    this.countdown();

    const onBlur = () => this.setPaused(true);
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.game.events.on(Phaser.Core.Events.HIDDEN, onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
      this.game.events.off(Phaser.Core.Events.HIDDEN, onBlur);
    });
  }

  update(time: number, delta: number) {
    if (this.paused) return;
    this.fighters.forEach((f, i) => {
      const input = this.started && !this.finished ? this.controllers[i].read(time) : NO_INPUT;
      const { threw } = f.update(input, time, delta);
      if (threw) this.throwPillow(f, time);
    });
    this.fighters.forEach((f) => this.ledgeAssist(f, time));
    this.checkBumps(time);
    this.updatePillows(time);
    if (!this.finished) this.checkOutOfBounds(time);
    this.updateHud();
  }

  // ---- まくら ----

  private makePillowTexture() {
    if (this.textures.exists('pillow')) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff).fillRoundedRect(4, 4, 56, 38, 14);
    g.fillStyle(0xa8d8ff).fillRect(4, 19, 56, 8);
    g.lineStyle(3, 0xd9e6f5).strokeRoundedRect(4, 4, 56, 38, 14);
    g.generateTexture('pillow', 64, 46);
    g.destroy();
  }

  private throwPillow(f: Fighter, now: number) {
    const scale = f.def.pillowSize;
    const img = this.physics.add.image(f.body.x + f.facing * 40, f.body.y - 10, 'pillow').setScale(scale * 0.9).setDepth(5);
    const body = img.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(true);
    body.setGravityY(-1350); // ゆっくり弧をえがく
    body.setVelocity(f.facing * (640 - (scale - 1) * 300), -170);
    body.setAngularVelocity(f.facing * 540);
    this.pillows.push({ img, owner: f, scale, bornAt: now });
  }

  private updatePillows(now: number) {
    for (const p of [...this.pillows]) {
      const img = p.img;
      if (now - p.bornAt > PILLOW_LIFE || isOutOfBounds(img.x, img.y, GAME_WIDTH, GAME_HEIGHT)) {
        this.removePillow(p, false);
        continue;
      }
      // 相手に当たったか
      for (const f of this.fighters) {
        if (f === p.owner || f.out) continue;
        if (Phaser.Geom.Intersects.RectangleToRectangle(img.getBounds(), f.body.getBounds())) {
          const dir: 1 | -1 = (img.body as Phaser.Physics.Arcade.Body).velocity.x >= 0 ? 1 : -1;
          if (f.receiveHit(PILLOW_HIT, dir, now, p.scale)) this.hitEffect(img.x, img.y, 'ぽふっ', f);
          this.removePillow(p, true);
          break;
        }
      }
    }
    // まくら同士がぶつかったら両方はじける
    for (let i = 0; i < this.pillows.length; i++) {
      for (let j = i + 1; j < this.pillows.length; j++) {
        const a = this.pillows[i];
        const b = this.pillows[j];
        if (a.owner === b.owner) continue;
        if (Phaser.Geom.Intersects.RectangleToRectangle(a.img.getBounds(), b.img.getBounds())) {
          this.removePillow(a, true);
          this.removePillow(b, true);
          return;
        }
      }
    }
  }

  private removePillow(p: Pillow, poof: boolean) {
    if (poof) this.feathers(p.img.x, p.img.y);
    p.img.destroy();
    this.pillows = this.pillows.filter((x) => x !== p);
  }

  // ---- ぽよん（体当たり） ----

  private checkBumps(now: number) {
    const [a, b] = this.fighters;
    for (const [atk, def] of [
      [a, b],
      [b, a],
    ] as const) {
      if (!atk.isBumping(now) || atk.bumpHitDone || def.out || atk.out) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(atk.body.getBounds(), def.body.getBounds())) {
        atk.bumpHitDone = true;
        if (def.receiveHit(BUMP_HIT, atk.facing, now)) {
          this.hitEffect((atk.body.x + def.body.x) / 2, def.body.y, 'ぽよん！', def);
          atk.arcade.velocity.x *= -0.3; // はね返る
        }
      }
    }
  }

  // ---- ふちにつかまる ----
  // ステージのふちの少し下まで落ちても、ふっとばされている最中でなければ自動で上がれる。
  // 小学生が「自分から落ちて負ける」のを減らすため。
  private ledgeAssist(f: Fighter, now: number) {
    if (f.out || f.isStunned(now) || f.arcade.velocity.y < 0) return;
    const bottom = f.body.y + f.body.height / 2;
    if (bottom <= MAIN.y + 4 || bottom > MAIN.y + 120) return;
    for (const [edge, outward] of [
      [MAIN.x, -1],
      [MAIN.x + MAIN.w, 1],
    ] as const) {
      const outside = (f.body.x - edge) * outward; // ふちから外側へのはみ出し
      if (outside < -f.body.width / 2 || outside > 80) continue;
      const x = edge - outward * 36;
      const y = MAIN.y - f.body.height / 2 - 2;
      f.arcade.reset(x, y);
      f.arcade.setVelocity(0, -260);
      f.jumpsLeft = MAX_JUMPS - 1;
      const t = this.add
        .text(x, y - 70, 'よいしょ', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff', stroke: '#3a1a5a', strokeThickness: 6 })
        .setOrigin(0.5)
        .setDepth(30);
      this.tweens.add({ targets: t, y: y - 110, alpha: 0, duration: 700, onComplete: () => t.destroy() });
      return;
    }
  }

  // ---- 場外 ----

  private checkOutOfBounds(now: number) {
    for (const f of this.fighters) {
      if (f.out || !isOutOfBounds(f.body.x, f.body.y, GAME_WIDTH, GAME_HEIGHT)) continue;
      this.knockOutEffect(f.body.x, f.body.y);
      f.knockOut();
      if (f.stocks <= 0) {
        this.finish(now);
      } else {
        this.time.delayedCall(RESPAWN_DELAY, () => {
          if (!this.finished) f.respawn(GAME_WIDTH / 2, 120, this.time.now);
        });
      }
    }
  }

  private finish(_now: number) {
    if (this.finished) return;
    this.finished = true;
    const winner = this.fighters.find((f) => f.stocks > 0) ?? this.fighters[0];
    const isP1 = winner === this.fighters[0];
    this.bigText('おしまい！', '#ffffff');
    this.time.delayedCall(1600, () =>
      this.scene.start('Result', { winner: winner.def.id, playerWon: isP1, p1: this.data_.p1, p2: this.data_.p2 }),
    );
  }

  // ---- 演出 ----

  private hitEffect(x: number, y: number, word: string, target: Fighter) {
    this.feathers(x, y);
    const t = this.add
      .text(x, y - 30, word, { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffffff', stroke: '#5a2d82', strokeThickness: 7 })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: t, y: y - 90, alpha: 0, duration: 650, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
    if (target.damage > 80) this.cameras.main.shake(90, 0.004);
  }

  private feathers(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const f = this.add.ellipse(x, y, 10, 18, 0xffffff, 0.95).setDepth(20).setRotation(Math.random() * Math.PI);
      this.tweens.add({
        targets: f,
        x: x + Phaser.Math.Between(-70, 70),
        y: y + Phaser.Math.Between(-60, 50),
        rotation: f.rotation + Phaser.Math.FloatBetween(-3, 3),
        alpha: 0,
        duration: Phaser.Math.Between(500, 900),
        onComplete: () => f.destroy(),
      });
    }
  }

  private knockOutEffect(x: number, y: number) {
    const cx = Phaser.Math.Clamp(x, 40, GAME_WIDTH - 40);
    const cy = Phaser.Math.Clamp(y, 40, GAME_HEIGHT - 40);
    this.cameras.main.shake(260, 0.012);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const star = this.add.star(cx, cy, 5, 8, 18, 0xffe066).setDepth(40);
      this.tweens.add({
        targets: star,
        x: cx + Math.cos(a) * 160,
        y: cy + Math.sin(a) * 160,
        angle: 360,
        alpha: 0,
        duration: 800,
        ease: 'Cubic.easeOut',
        onComplete: () => star.destroy(),
      });
    }
    const t = this.add
      .text(cx, cy, 'ふっとび〜！', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffe066', stroke: '#3a1a5a', strokeThickness: 8 })
      .setOrigin(Phaser.Math.Clamp(cx / GAME_WIDTH, 0.15, 0.85), 0.5)
      .setDepth(41);
    this.tweens.add({ targets: t, scale: 1.3, alpha: 0, duration: 1100, delay: 300, onComplete: () => t.destroy() });
  }

  private bigText(text: string, color: string) {
    const t = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.38, text, {
        fontFamily: FONT,
        fontSize: '96px',
        fontStyle: 'bold',
        color,
        stroke: '#3a1a5a',
        strokeThickness: 12,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' });
    return t;
  }

  private countdown() {
    const words = ['3', '2', '1'];
    words.forEach((w, i) => {
      this.time.delayedCall(i * 650, () => {
        const t = this.bigText(w, '#ffffff');
        this.time.delayedCall(560, () => t.destroy());
      });
    });
    this.time.delayedCall(words.length * 650, () => {
      this.started = true;
      const t = this.bigText('スタート！', '#ffe066');
      this.tweens.add({ targets: t, alpha: 0, delay: 500, duration: 300, onComplete: () => t.destroy() });
    });
  }

  // ---- 画面上の表示 ----

  private createHud() {
    this.fighters.forEach((f, i) => {
      const right = i === 1;
      const x = right ? GAME_WIDTH - 24 : 24;
      const panel = this.add.graphics().setDepth(45);
      const px = right ? GAME_WIDTH - 324 : 24;
      panel.fillStyle(0x000000, 0.35).fillRoundedRect(px, 18, 300, 96, 18);
      panel.fillStyle(f.def.color).fillRoundedRect(px, 18, 12, 96, { tl: 18, bl: 18, tr: 0, br: 0 });
      const face = this.add.image(right ? px + 250 : px + 50, 66, f.def.id).setDepth(46);
      face.setScale(80 / face.height);
      this.add
        .text(right ? x - 90 : x + 96, 26, `${i === 0 ? 'あなた' : 'CPU'}　${f.def.name}`, {
          fontFamily: FONT,
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(right ? 1 : 0, 0)
        .setDepth(46);
      const pct = this.add
        .text(right ? x - 90 : x + 96, 50, '0%', { fontFamily: FONT, fontSize: '46px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 6 })
        .setOrigin(right ? 1 : 0, 0)
        .setDepth(46);
      const balloons: Phaser.GameObjects.Arc[] = [];
      for (let s = 0; s < STOCKS; s++) {
        const bx = right ? x - 290 + s * 26 : x + 210 + s * 26;
        balloons.push(this.add.circle(bx, 92, 10, f.def.color).setStrokeStyle(2, 0xffffff).setDepth(46));
      }
      this.huds.push({ pct, balloons });
    });
  }

  private updateHud() {
    this.fighters.forEach((f, i) => {
      const h = this.huds[i];
      h.pct.setText(`${f.damage}%`);
      // ％が高いほど赤くなる
      const t = Phaser.Math.Clamp(f.damage / 150, 0, 1);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0xffffff),
        Phaser.Display.Color.ValueToColor(0xff3b3b),
        100,
        t * 100,
      );
      h.pct.setColor(Phaser.Display.Color.RGBToString(c.r, c.g, c.b));
      h.balloons.forEach((b, s) => b.setAlpha(s < f.stocks ? 1 : 0.15));
    });
  }

  // ---- 一時停止 ----

  private createPauseButton() {
    const btn = this.add.circle(GAME_WIDTH / 2, 50, 30, 0x000000, 0.35).setDepth(55).setInteractive();
    this.add.text(GAME_WIDTH / 2, 50, 'II', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(56);
    btn.on('pointerdown', () => this.setPaused(true));
    this.input.keyboard?.on('keydown-ESC', () => this.setPaused(!this.paused));
  }

  private setPaused(paused: boolean) {
    if (this.finished || paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      this.physics.pause();
      this.tweens.pauseAll();
      this.time.paused = true;
      const bg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setInteractive();
      const title = this.add.text(GAME_WIDTH / 2, 230, 'ひとやすみ', { fontFamily: FONT, fontSize: '72px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
      const resume = this.menuButton(GAME_WIDTH / 2, 380, 'つづける', () => this.setPaused(false));
      const back = this.menuButton(GAME_WIDTH / 2, 490, 'キャラえらびへ', () => this.scene.start('Select'));
      this.pauseLayer = this.add.container(0, 0, [bg, title, ...resume, ...back]).setDepth(100);
    } else {
      this.physics.resume();
      this.tweens.resumeAll();
      this.time.paused = false;
      this.pauseLayer?.destroy();
      this.pauseLayer = undefined;
    }
  }

  private menuButton(x: number, y: number, label: string, onTap: () => void) {
    const r = this.add.rectangle(x, y, 380, 84, 0xffffff, 0.95).setStrokeStyle(5, 0xffb347).setInteractive();
    const t = this.add.text(x, y, label, { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#3a1a5a' }).setOrigin(0.5);
    r.on('pointerdown', onTap);
    return [r, t];
  }
}
