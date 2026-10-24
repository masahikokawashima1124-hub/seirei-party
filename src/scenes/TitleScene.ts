import Phaser from 'phaser';
import { CHARACTERS } from '../characters';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { drawBackground, startFireworks } from '../battle/stage';

// スマホでは全画面にして横向きに固定する（Android で有効。iPhone はホーム画面に追加すると全画面になる）
function enterFullscreen(scene: Phaser.Scene) {
  if (!scene.scale.fullscreen.available || scene.scale.isFullscreen) return;
  scene.scale.startFullscreen();
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  orientation.lock?.('landscape').catch(() => {});
}

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    drawBackground(this);
    startFireworks(this);

    this.add
      .text(GAME_WIDTH / 2, 190, 'せいれい\nまくらなげ大会', {
        fontFamily: FONT,
        fontSize: '84px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
        stroke: '#5a2d82',
        strokeThickness: 14,
        lineSpacing: 4,
      })
      .setOrigin(0.5);

    // キャラクターが並んで、ぴょこぴょこ跳ねる
    CHARACTERS.forEach((c, i) => {
      const x = GAME_WIDTH / 2 + (i - (CHARACTERS.length - 1) / 2) * 200;
      const img = this.add.image(x, 520, c.id).setOrigin(0.5, 1);
      img.setScale(150 / img.height);
      this.tweens.add({ targets: img, y: 490, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeOut', delay: i * 120 });
    });

    const start = this.add
      .text(GAME_WIDTH / 2, 615, 'タップして はじめる', {
        fontFamily: FONT,
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#ffe066',
        stroke: '#3a1a5a',
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    this.add
      .text(GAME_WIDTH - 16, GAME_HEIGHT - 12, 'PC：A D いどう / W ジャンプ / J まくら / K ぽよん / S おりる', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#d8c8ff',
      })
      .setOrigin(1, 1);

    const go = () => this.scene.start('Select');
    this.input.once('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) enterFullscreen(this);
      go();
    });
    this.input.keyboard?.once('keydown', go);
  }
}
