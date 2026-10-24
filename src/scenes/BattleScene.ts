import Phaser from 'phaser';
import { getCharacter } from '../characters';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CpuController, HumanController, type Controller } from '../battle/controllers';
import { Fighter, NO_INPUT } from '../battle/Fighter';
import { BUMP_HIT, MAX_JUMPS, PILLOW_HIT, RESPAWN_DELAY, STOCKS, isOutOfBounds } from '../battle/rules';
import { MAIN, buildPlatforms, drawBackground, startFireworks } from '../battle/stage';
import { online, type Role } from '../net/online';
import { RemoteInput, type FxEvent, type PillowSnap, type SnapMsg } from '../net/protocol';
import { listenOnline } from '../net/ui';

// ひとりで（CPUと）／ふたりで（1台を2人で）／2だいで（通信）
export type BattleMode = 'cpu' | 'versus' | 'online';

export interface BattleData {
  p1: string; // キャラクターID
  p2: string;
  mode: BattleMode;
  role?: Role; // 2だいで のとき。親（host）が1P、子（guest）が2P
}

const SNAP_INTERVAL = 15; // 親が様子を送る間かく(ms)
const INPUT_KEEPALIVE = 100; // 子が操作を送る間かく（変わらないとき）

interface Pillow {
  id: number;
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
  // 2だいで あそぶとき
  private remoteInput = new RemoteInput();
  private fxQueue: FxEvent[] = [];
  private pillowSeq = 0;
  private lastSent = 0;
  private sentInput = '';
  private pressCount = { j: 0, th: 0, b: 0 };
  private remotePillows = new Map<number, Phaser.GameObjects.Image>();

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
    this.remoteInput = new RemoteInput();
    this.fxQueue = [];
    this.pillowSeq = 0;
    this.lastSent = 0;
    this.sentInput = '';
    this.pressCount = { j: 0, th: 0, b: 0 };
    this.remotePillows = new Map();
  }

  private get online() {
    return this.data_.mode === 'online';
  }

  private get isHost() {
    return this.online && this.data_.role === 'host';
  }

  private get isGuest() {
    return this.online && this.data_.role === 'guest';
  }

  // この画面で自分が動かすキャラ（0=1P, 1=2P）
  private get myIndex() {
    return this.isGuest ? 1 : 0;
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
    if (this.data_.mode === 'versus') {
      this.controllers = [
        new HumanController(this, 'p1', { text: '1P', color: p1.def.color }),
        new HumanController(this, 'p2', { text: '2P', color: p2.def.color }),
      ];
    } else if (this.isHost) {
      // 2Pは、子の画面から届いた操作で動く
      this.controllers = [new HumanController(this), { read: () => this.remoteInput.read() }];
    } else if (this.isGuest) {
      // 子は自分の操作を送るだけ。キャラは親から届いた様子のとおりに映す
      this.controllers = [new HumanController(this)];
      this.fighters.forEach((f) => f.makeRemote());
    } else {
      this.controllers = [new HumanController(this), new CpuController(p2, p1, stageArea, 0.45)];
    }
    if (this.online) {
      listenOnline(this, (m) => {
        if (m.t === 'in' && this.isHost) this.remoteInput.receive(m);
        if (m.t === 'snap' && this.isGuest) this.applySnap(m);
      });
      // 「やめる」などで勝負の途中に場面を出るときは、つながりも切る
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (!this.finished) online.leave();
      });
    }

    for (const f of this.isGuest ? [] : this.fighters) {
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

    // 2だいで のときは、片方だけ止めるわけにいかないので止めない
    const onBlur = () => {
      if (!this.online) this.setPaused(true);
    };
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.game.events.on(Phaser.Core.Events.HIDDEN, onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
      this.game.events.off(Phaser.Core.Events.HIDDEN, onBlur);
    });
  }

  update(time: number, delta: number) {
    if (this.paused && !this.online) return;
    if (this.isGuest) {
      this.guestUpdate(time);
      return;
    }
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
    if (this.isHost && time - this.lastSent >= SNAP_INTERVAL) this.sendSnap(time);
  }

  // ---- 2だいで あそぶとき ----

  // 親：キャラ・まくら・演出をまとめて子へ送る
  private sendSnap(now: number) {
    this.lastSent = now;
    const msg: SnapMsg = {
      t: 'snap',
      f: this.fighters.map((f) => f.snapshot(now)),
      p: this.pillows.map((p) => ({
        id: p.id,
        x: Math.round(p.img.x),
        y: Math.round(p.img.y),
        r: Math.round(p.img.rotation * 100) / 100,
        sc: p.scale,
      })),
      e: this.fxQueue,
    };
    this.fxQueue = [];
    online.send(msg);
  }

  // 子：自分の操作を親へ送り、届いた様子を映す
  private guestUpdate(time: number) {
    const input = this.started && !this.finished ? this.controllers[0].read(time) : NO_INPUT;
    if (input.jump) this.pressCount.j++;
    if (input.throw) this.pressCount.th++;
    if (input.bump) this.pressCount.b++;
    const msg = { t: 'in' as const, l: input.left, r: input.right, d: input.down, ...this.pressCount };
    const key = JSON.stringify(msg);
    if (key !== this.sentInput || time - this.lastSent >= INPUT_KEEPALIVE) {
      this.sentInput = key;
      this.lastSent = time;
      online.send(msg);
    }
    this.fighters.forEach((f) => f.remoteUpdate(time));
    for (const img of this.remotePillows.values()) {
      const to = img.getData('to') as PillowSnap;
      img.setPosition(Phaser.Math.Linear(img.x, to.x, 0.6), Phaser.Math.Linear(img.y, to.y, 0.6));
      img.setRotation(to.r);
    }
    this.updateHud();
  }

  private applySnap(m: SnapMsg) {
    const now = this.time.now;
    m.f.forEach((s, i) => this.fighters[i]?.applySnapshot(s, now));
    const alive = new Set<number>();
    for (const p of m.p) {
      alive.add(p.id);
      let img = this.remotePillows.get(p.id);
      if (!img) {
        img = this.add.image(p.x, p.y, 'pillow').setScale(p.sc * 0.9).setDepth(5);
        this.remotePillows.set(p.id, img);
      }
      img.setData('to', p);
    }
    for (const [id, img] of this.remotePillows) {
      if (alive.has(id)) continue;
      img.destroy();
      this.remotePillows.delete(id);
    }
    for (const e of m.e) this.fx(e);
  }

  // 演出を出す。親のときは子にも同じ演出を送る
  private fx(e: FxEvent) {
    if (this.isHost) this.fxQueue.push(e);
    switch (e.t) {
      case 'hit':
        if (this.isGuest) this.fighters[e.i].flash();
        this.hitEffect(e.x, e.y, e.w, this.fighters[e.i]);
        break;
      case 'poof':
        this.feathers(e.x, e.y);
        break;
      case 'ko':
        this.knockOutEffect(e.x, e.y);
        break;
      case 'ledge':
        this.ledgeText(e.x, e.y);
        break;
      case 'finish':
        this.showFinish(e.winner);
        break;
    }
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
    this.pillows.push({ id: ++this.pillowSeq, img, owner: f, scale, bornAt: now });
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
          if (f.receiveHit(PILLOW_HIT, dir, now, p.scale)) {
            this.fx({ t: 'hit', x: Math.round(img.x), y: Math.round(img.y), w: 'ぽふっ', i: this.fighters.indexOf(f) });
          }
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
    if (poof) this.fx({ t: 'poof', x: Math.round(p.img.x), y: Math.round(p.img.y) });
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
          const x = Math.round((atk.body.x + def.body.x) / 2);
          this.fx({ t: 'hit', x, y: Math.round(def.body.y), w: 'ぽよん！', i: this.fighters.indexOf(def) });
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
      this.fx({ t: 'ledge', x: Math.round(x), y: Math.round(y) });
      return;
    }
  }

  private ledgeText(x: number, y: number) {
    const t = this.add
      .text(x, y - 70, 'よいしょ', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff', stroke: '#3a1a5a', strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: t, y: y - 110, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  // ---- 場外 ----

  private checkOutOfBounds(now: number) {
    for (const f of this.fighters) {
      if (f.out || !isOutOfBounds(f.body.x, f.body.y, GAME_WIDTH, GAME_HEIGHT)) continue;
      this.fx({ t: 'ko', x: Math.round(f.body.x), y: Math.round(f.body.y) });
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
    const winner = this.fighters.find((f) => f.stocks > 0) ?? this.fighters[0];
    this.fx({ t: 'finish', winner: this.fighters.indexOf(winner) });
  }

  private showFinish(winnerIndex: number) {
    if (this.finished) return;
    this.finished = true;
    this.bigText('おしまい！', '#ffffff');
    if (this.isHost) this.sendSnap(this.time.now); // 子にも すぐ知らせる
    this.time.delayedCall(1600, () => this.scene.start('Result', { ...this.data_, winnerIndex }));
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
        .text(right ? x - 90 : x + 96, 26, `${this.playerLabel(i)}　${f.def.name}`, {
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

  private playerLabel(i: number) {
    if (this.data_.mode === 'versus') return i === 0 ? '1P' : '2P';
    if (this.online) return i === this.myIndex ? 'あなた' : 'あいて';
    return i === 0 ? 'あなた' : 'CPU';
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
    // 2だいで のときは、ゲームは止めずに「やめる」を選べるだけにする
    const freeze = !this.online;
    if (paused) {
      if (freeze) {
        this.physics.pause();
        this.tweens.pauseAll();
        this.time.paused = true;
      }
      const bg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setInteractive();
      const title = this.add.text(GAME_WIDTH / 2, 230, freeze ? 'ひとやすみ' : 'やめる？', { fontFamily: FONT, fontSize: '72px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
      const resume = this.menuButton(GAME_WIDTH / 2, 380, 'つづける', () => this.setPaused(false));
      const back = freeze
        ? this.menuButton(GAME_WIDTH / 2, 490, 'キャラえらびへ', () => this.scene.start('Select', { mode: this.data_.mode }))
        : this.menuButton(GAME_WIDTH / 2, 490, 'やめる', () => this.scene.start('Title'));
      this.pauseLayer = this.add.container(0, 0, [bg, title, ...resume, ...back]).setDepth(100);
    } else {
      if (freeze) {
        this.physics.resume();
        this.tweens.resumeAll();
        this.time.paused = false;
      }
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
