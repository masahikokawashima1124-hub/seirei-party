import Phaser from 'phaser';
import { getCharacter } from '../characters';
import { FONT, GAME_WIDTH } from '../config';
import { drawBackground, startFireworks } from '../battle/stage';
import { online } from '../net/online';
import { listenOnline } from '../net/ui';
import type { BattleData } from './BattleScene';

interface ResultData extends BattleData {
  winnerIndex: number; // 0 = 1P、1 = 2P
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
    const myIndex = data.role === 'guest' ? 1 : 0; // 2だいで の子は 2P
    const won = data.winnerIndex === myIndex;
    const title = versus ? `${data.winnerIndex === 0 ? '1P' : '2P'}の かち！` : won ? 'あなたの かち！' : 'ざんねん…';
    const happy = versus || won;

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

    if (data.mode === 'online') {
      this.onlineButtons(data);
      return;
    }
    this.button(GAME_WIDTH / 2 - 210, 600, 'もういちど', () => this.scene.start('Battle', { p1: data.p1, p2: data.p2, mode: data.mode }));
    this.button(GAME_WIDTH / 2 + 210, 600, 'キャラえらび', () => this.scene.start('Select', { mode: data.mode }));
  }

  // 2だいで：ふたりとも「もういちど」を押したら、親がはじめる
  private onlineButtons(data: ResultData) {
    let mine = false;
    let theirs = false;
    const note = this.add
      .text(GAME_WIDTH / 2, 530, '', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffe066', stroke: '#3a1a5a', strokeThickness: 6 })
      .setOrigin(0.5);
    const tryStart = () => {
      if (!mine || !theirs || data.role !== 'host') return;
      online.send({ t: 'start', p1: data.p1, p2: data.p2 });
      this.scene.start('Battle', { p1: data.p1, p2: data.p2, mode: 'online', role: 'host' });
    };
    listenOnline(this, (m) => {
      if (m.t === 'again') {
        theirs = true;
        if (!mine) note.setText('あいては「もういちど」を えらんだよ');
        tryStart();
      }
      if (m.t === 'start' && data.role === 'guest') this.scene.start('Battle', { p1: m.p1, p2: m.p2, mode: 'online', role: 'guest' });
    });
    if (!online.connected) note.setText('あいてとの つうしんが きれています');
    this.button(GAME_WIDTH / 2 - 210, 600, 'もういちど', () => {
      mine = true;
      online.send({ t: 'again' });
      note.setText('あいてを まってるよ…');
      tryStart();
    });
    this.button(GAME_WIDTH / 2 + 210, 600, 'おわる', () => {
      online.leave();
      this.scene.start('Title');
    });
  }

  private button(x: number, y: number, label: string, onTap: () => void) {
    const r = this.add.rectangle(x, y, 360, 90, 0xffffff, 0.95).setStrokeStyle(6, 0xffb347).setInteractive();
    this.add.text(x, y, label, { fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: '#3a1a5a' }).setOrigin(0.5);
    r.once('pointerdown', onTap);
  }
}
