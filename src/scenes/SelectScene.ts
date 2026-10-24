import Phaser from 'phaser';
import { CHARACTERS, type CharacterDef } from '../characters';
import { FONT, GAME_WIDTH } from '../config';
import { drawBackground } from '../battle/stage';
import type { BattleMode } from './BattleScene';

// キャラえらび：はじめに「ひとりで／ふたりで／2だいで」を選び、つぎに 1P、さいごに相手（CPU か 2P）。
// 2だいで のときは自分のキャラだけ選んで、へやばんごうの画面へ
export class SelectScene extends Phaser.Scene {
  private mode: BattleMode | null = null;
  private p1: string | null = null;
  private heading!: Phaser.GameObjects.Text;
  private picker!: Phaser.GameObjects.Container;
  private modeLayer!: Phaser.GameObjects.Container;
  private cards: { def: CharacterDef; frame: Phaser.GameObjects.Rectangle; tag: Phaser.GameObjects.Text }[] = [];

  constructor() {
    super('Select');
  }

  // 結果画面から戻ったときは、同じ遊び方のままキャラえらびから始める
  init(data?: { mode?: BattleMode }) {
    this.mode = data?.mode ?? null;
    this.p1 = null;
    this.cards = [];
  }

  create() {
    drawBackground(this);
    this.heading = this.add
      .text(GAME_WIDTH / 2, 70, '', { fontFamily: FONT, fontSize: '48px', fontStyle: 'bold', color: '#ffffff', stroke: '#5a2d82', strokeThickness: 10 })
      .setOrigin(0.5);
    this.createModeChoice();
    this.createPicker();
    this.refresh();
  }

  private createModeChoice() {
    const make = (x: number, title: string, sub: string, mode: BattleMode, color: number) => {
      const r = this.add.rectangle(x, 360, 370, 300, 0xffffff, 0.94).setStrokeStyle(8, color).setInteractive();
      const t = this.add.text(x, 320, title, { fontFamily: FONT, fontSize: '50px', fontStyle: 'bold', color: '#3a1a5a' }).setOrigin(0.5);
      const s = this.add.text(x, 410, sub, { fontFamily: FONT, fontSize: '22px', color: '#6a4a8a', align: 'center' }).setOrigin(0.5);
      r.on('pointerdown', () => {
        this.mode = mode;
        this.refresh();
      });
      return [r, t, s];
    };
    this.modeLayer = this.add.container(0, 0, [
      ...make(GAME_WIDTH / 2 - 400, 'ひとりで', 'コンピュータと\nたいせん', 'cpu', 0x7cd4ff),
      ...make(GAME_WIDTH / 2, 'ふたりで', '1だいを 2人で もって\nたいせん', 'versus', 0xffa0c8),
      ...make(GAME_WIDTH / 2 + 400, '2だいで', 'スマホ2だいを\nつないで たいせん', 'online', 0x9be37a),
    ]);
  }

  private createPicker() {
    const items: Phaser.GameObjects.GameObject[] = [];
    const cardW = 220;
    const gap = 22;
    const startX = GAME_WIDTH / 2 - ((cardW + gap) * CHARACTERS.length - gap) / 2 + cardW / 2;
    CHARACTERS.forEach((def, i) => {
      const x = startX + i * (cardW + gap);
      const y = 360;
      const frame = this.add.rectangle(x, y, cardW, 380, 0xffffff, 0.92).setStrokeStyle(6, def.color).setInteractive();
      const band = this.add.rectangle(x, y - 175, cardW, 30, def.color);
      const img = this.add.image(x, y + 30, def.id).setOrigin(0.5, 1);
      img.setScale(170 / img.height);
      const name = this.add.text(x, y + 60, def.name, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#3a1a5a' }).setOrigin(0.5);
      const phrase = this.add.text(x, y + 98, `「${def.catchphrase}」`, { fontFamily: FONT, fontSize: '17px', color: '#6a4a8a' }).setOrigin(0.5);
      const trait = this.add.text(x, y + 140, def.trait, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#e0612b' }).setOrigin(0.5);
      const tag = this.add
        .text(x, y - 205, '', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 6 })
        .setOrigin(0.5);
      frame.on('pointerdown', () => this.pick(def.id));
      this.tweens.add({ targets: img, scaleY: img.scaleY * 0.95, duration: 500 + i * 60, yoyo: true, repeat: -1 });
      this.cards.push({ def, frame, tag });
      items.push(frame, band, img, name, phrase, trait, tag);
    });

    const random = this.add.rectangle(GAME_WIDTH / 2, 630, 300, 70, 0xffe066).setStrokeStyle(5, 0xffffff).setInteractive();
    const randomText = this.add.text(GAME_WIDTH / 2, 630, 'おまかせ', { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#3a1a5a' }).setOrigin(0.5);
    random.on('pointerdown', () => this.pick(Phaser.Utils.Array.GetRandom(CHARACTERS).id));

    const back = this.add.rectangle(110, 630, 170, 64, 0xffffff, 0.85).setStrokeStyle(4, 0xb39ddb).setInteractive();
    const backText = this.add.text(110, 630, 'もどる', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#3a1a5a' }).setOrigin(0.5);
    back.on('pointerdown', () => {
      if (this.p1) this.p1 = null;
      else this.mode = null;
      this.refresh();
    });
    this.picker = this.add.container(0, 0, [...items, random, randomText, back, backText]);
  }

  private pick(id: string) {
    if (!this.mode) return;
    if (this.mode === 'online') {
      this.cards.forEach((c) => c.frame.disableInteractive());
      this.time.delayedCall(250, () => this.scene.start('Lobby', { char: id }));
      return;
    }
    if (!this.p1) {
      this.p1 = id;
      this.refresh();
      return;
    }
    const data = { p1: this.p1, p2: id, mode: this.mode };
    this.cards.forEach((c) => c.frame.disableInteractive());
    this.time.delayedCall(250, () => this.scene.start('Battle', data));
  }

  private refresh() {
    this.modeLayer.setVisible(!this.mode);
    this.picker.setVisible(!!this.mode);
    if (!this.mode) {
      this.heading.setText('どうやって あそぶ？');
      return;
    }
    const versus = this.mode === 'versus';
    if (this.mode === 'online') this.heading.setText('じぶんの キャラを えらんでね');
    else if (!this.p1) this.heading.setText(versus ? '1Pの キャラを えらんでね' : 'じぶんの キャラを えらんでね');
    else this.heading.setText(versus ? '2Pの キャラを えらんでね' : 'あいてを えらんでね');
    for (const c of this.cards) {
      const mine = c.def.id === this.p1;
      c.tag.setText(mine ? (versus ? '1P' : 'あなた') : '');
      c.frame.setFillStyle(mine ? 0xfff3c4 : 0xffffff, 0.92);
    }
  }
}
