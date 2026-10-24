import Phaser from 'phaser';
import { CHARACTERS, type CharacterDef } from '../characters';
import { FONT, GAME_WIDTH } from '../config';
import { drawBackground } from '../battle/stage';

// キャラえらび：まず自分、つぎに相手
export class SelectScene extends Phaser.Scene {
  private p1: string | null = null;
  private heading!: Phaser.GameObjects.Text;
  private cards: { def: CharacterDef; frame: Phaser.GameObjects.Rectangle; tag: Phaser.GameObjects.Text }[] = [];

  constructor() {
    super('Select');
  }

  create() {
    this.p1 = null;
    this.cards = [];
    drawBackground(this);
    this.heading = this.add
      .text(GAME_WIDTH / 2, 70, '', { fontFamily: FONT, fontSize: '48px', fontStyle: 'bold', color: '#ffffff', stroke: '#5a2d82', strokeThickness: 10 })
      .setOrigin(0.5);

    const cardW = 220;
    const gap = 22;
    const startX = GAME_WIDTH / 2 - ((cardW + gap) * CHARACTERS.length - gap) / 2 + cardW / 2;
    CHARACTERS.forEach((def, i) => {
      const x = startX + i * (cardW + gap);
      const y = 360;
      const frame = this.add.rectangle(x, y, cardW, 380, 0xffffff, 0.92).setStrokeStyle(6, def.color).setInteractive();
      this.add.rectangle(x, y - 175, cardW, 30, def.color);
      const img = this.add.image(x, y + 30, def.id).setOrigin(0.5, 1);
      img.setScale(170 / img.height);
      this.add.text(x, y + 60, def.name, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#3a1a5a' }).setOrigin(0.5);
      this.add.text(x, y + 98, `「${def.catchphrase}」`, { fontFamily: FONT, fontSize: '17px', color: '#6a4a8a' }).setOrigin(0.5);
      this.add.text(x, y + 140, def.trait, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#e0612b' }).setOrigin(0.5);
      const tag = this.add
        .text(x, y - 205, '', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 6 })
        .setOrigin(0.5);
      frame.on('pointerdown', () => this.pick(def.id));
      this.tweens.add({ targets: img, scaleY: img.scaleY * 0.95, duration: 500 + i * 60, yoyo: true, repeat: -1 });
      this.cards.push({ def, frame, tag });
    });

    const random = this.add.rectangle(GAME_WIDTH / 2, 630, 300, 70, 0xffe066).setStrokeStyle(5, 0xffffff).setInteractive();
    this.add.text(GAME_WIDTH / 2, 630, 'おまかせ', { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#3a1a5a' }).setOrigin(0.5);
    random.on('pointerdown', () => this.pick(Phaser.Utils.Array.GetRandom(CHARACTERS).id));

    this.refresh();
  }

  private pick(id: string) {
    if (!this.p1) {
      this.p1 = id;
      this.refresh();
      return;
    }
    const p1 = this.p1;
    this.cards.forEach((c) => c.frame.disableInteractive());
    this.time.delayedCall(250, () => this.scene.start('Battle', { p1, p2: id }));
  }

  private refresh() {
    this.heading.setText(this.p1 ? 'あいてを えらんでね' : 'じぶんの キャラを えらんでね');
    for (const c of this.cards) {
      const mine = c.def.id === this.p1;
      c.tag.setText(mine ? 'あなた' : '');
      c.frame.setFillStyle(mine ? 0xfff3c4 : 0xffffff, 0.92);
    }
  }
}
