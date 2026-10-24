import Phaser from 'phaser';
import { getCharacter } from '../characters';
import { FONT, GAME_WIDTH } from '../config';
import { drawBackground, startFireworks } from '../battle/stage';
import type { BattleData } from './BattleScene';

interface ResultData extends BattleData {
  winnerIndex: number; // 0 = 1P（あなた）、1 = 2P（CPU）
}

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data: ResultData) {
    drawBackground(this);
    startFireworks(this);
    const def = getCharacter(data.winnerIndex === 0 ? data.p1 : data.p2);
    const versus = data.mode === 'versus';
    const title = versus ? `${data.winnerIndex === 0 ? '1P' : '2P'}の かち！` : data.winnerIndex === 0 ? 'あなたの かち！' : 'ざんねん…';
    const happy = versus || data.winnerIndex === 0;

    this.add
      .text(GAME_WIDTH / 2, 90, title, {
        fontFamily: FONT,
        fontSize: '80px',
        fontStyle: 'bold',
        color: happy ? '#ffe066' : '#ffffff',
        stroke: '#5a2d82',
        strokeThickness: 14,
      })
      .setOrigin(0.5);

    const img = this.add.image(GAME_WIDTH / 2, 430, def.id).setOrigin(0.5, 1);
    img.setScale(240 / img.height);
    this.tweens.add({ targets: img, y: 400, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeOut' });

    this.add
      .text(GAME_WIDTH / 2, 470, `${def.name}「${def.catchphrase}」`, {
        fontFamily: FONT,
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#3a1a5a',
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    this.button(GAME_WIDTH / 2 - 210, 600, 'もういちど', () => this.scene.start('Battle', { p1: data.p1, p2: data.p2, mode: data.mode }));
    this.button(GAME_WIDTH / 2 + 210, 600, 'キャラえらび', () => this.scene.start('Select', { mode: data.mode }));
  }

  private button(x: number, y: number, label: string, onTap: () => void) {
    const r = this.add.rectangle(x, y, 360, 90, 0xffffff, 0.95).setStrokeStyle(6, 0xffb347).setInteractive();
    this.add.text(x, y, label, { fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: '#3a1a5a' }).setOrigin(0.5);
    r.once('pointerdown', onTap);
  }
}
