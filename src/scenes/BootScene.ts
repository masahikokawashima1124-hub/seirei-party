import Phaser from 'phaser';
import { CHARACTERS } from '../characters';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';

// 画像を読み込む
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const text = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'よみこみちゅう…', { fontFamily: FONT, fontSize: '36px', color: '#ffffff' })
      .setOrigin(0.5);
    this.load.on('progress', (v: number) => text.setText(`よみこみちゅう… ${Math.round(v * 100)}%`));
    for (const c of CHARACTERS) this.load.image(c.id, `assets/chars/${c.id}.png`);
  }

  create() {
    this.scene.start('Title');
  }
}
