import Phaser from 'phaser';
import { getCharacter } from '../characters';
import { FONT, GAME_WIDTH } from '../config';
import { drawBackground } from '../battle/stage';
import { online, type OnlineError } from '../net/online';
import { PROTOCOL_VERSION, isRoomCode } from '../net/protocol';
import { listenOnline, textButton } from '../net/ui';
import type { BattleData } from './BattleScene';

const ERROR_TEXT: Record<OnlineError, string> = {
  'no-room': 'その ばんごうの へやは みつからないよ',
  network: 'つながらなかったよ。インターネットを たしかめてね',
  busy: 'その へやは もう いっぱいだよ',
};

// 2台で遊ぶ：へやを つくる人（親）と、へやばんごうを入れて はいる人（子）
export class LobbyScene extends Phaser.Scene {
  private char = '';
  private heading!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private layer?: Phaser.GameObjects.Container;
  private typed = '';
  private digits: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('Lobby');
  }

  init(data: { char: string }) {
    this.char = data.char;
    this.typed = '';
    this.digits = [];
    this.layer = undefined;
  }

  create() {
    drawBackground(this);
    online.leave();
    this.heading = this.add
      .text(GAME_WIDTH / 2, 70, '', { fontFamily: FONT, fontSize: '48px', fontStyle: 'bold', color: '#ffffff', stroke: '#5a2d82', strokeThickness: 10 })
      .setOrigin(0.5);
    this.status = this.add
      .text(GAME_WIDTH / 2, 600, '', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffe066', stroke: '#3a1a5a', strokeThickness: 6, align: 'center' })
      .setOrigin(0.5)
      .setDepth(10);

    // じぶんのキャラ
    const def = getCharacter(this.char);
    const img = this.add.image(140, 470, def.id).setOrigin(0.5, 1);
    img.setScale(190 / img.height);
    this.add.text(140, 500, `あなた：${def.name}`, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    this.tweens.add({ targets: img, y: 450, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeOut' });

    listenOnline(this, (m) => {
      if (m.t === 'hello' && online.role === 'host') {
        const start = { t: 'start' as const, p1: this.char, p2: m.char };
        online.send(start);
        this.startBattle({ p1: start.p1, p2: start.p2, mode: 'online', role: 'host' });
      }
      if (m.t === 'start' && online.role === 'guest') {
        this.startBattle({ p1: m.p1, p2: m.p2, mode: 'online', role: 'guest' });
      }
    });

    // PC のキーボードでも番号を入れられる（速く打っても取りこぼさないよう、ブラウザから直接受け取る）
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) this.type(e.key);
      if (e.key === 'Backspace') this.type('back');
    };
    window.addEventListener('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('keydown', onKey));

    this.showChoice();
  }

  private clear() {
    this.layer?.destroy();
    this.status.setText('');
  }

  private showChoice() {
    this.clear();
    online.leave();
    this.heading.setText('2だいで あそぶ');
    const make = (x: number, title: string, sub: string, color: number, onTap: () => void) => {
      const r = this.add.rectangle(x, 330, 400, 280, 0xffffff, 0.94).setStrokeStyle(8, color).setInteractive();
      const t = this.add.text(x, 290, title, { fontFamily: FONT, fontSize: '46px', fontStyle: 'bold', color: '#3a1a5a' }).setOrigin(0.5);
      const s = this.add.text(x, 380, sub, { fontFamily: FONT, fontSize: '22px', color: '#6a4a8a', align: 'center' }).setOrigin(0.5);
      r.on('pointerdown', onTap);
      return [r, t, s];
    };
    const back = textButton(this, GAME_WIDTH / 2 + 60, 560, 'キャラえらびへ', () => this.scene.start('Select', { mode: 'online' }), 300, 70);
    this.layer = this.add.container(0, 0, [
      ...make(GAME_WIDTH / 2 - 160, 'へやを つくる', 'ばんごうが でるので\nあいてに おしえてね', 0x7cd4ff, () => this.showHost()),
      ...make(GAME_WIDTH / 2 + 280, 'へやに はいる', 'あいての へやの\nばんごうを いれてね', 0xffa0c8, () => this.showJoin()),
      ...back,
    ]);
  }

  private showHost() {
    this.clear();
    this.heading.setText('へやを つくったよ');
    const label = this.add.text(GAME_WIDTH / 2 + 60, 190, 'へやばんごう', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    const code = this.add
      .text(GAME_WIDTH / 2 + 60, 300, '・・・・', {
        fontFamily: FONT,
        fontSize: '140px',
        fontStyle: 'bold',
        color: '#ffe066',
        stroke: '#3a1a5a',
        strokeThickness: 14,
        letterSpacing: 24,
      })
      .setOrigin(0.5);
    const back = textButton(this, GAME_WIDTH / 2 + 60, 680, 'やめる', () => this.showChoice(), 240, 64);
    this.layer = this.add.container(0, 0, [label, code, ...back]);
    this.status.setText('へやを じゅんびしているよ…');
    online.host(
      (c) => {
        code.setText(c);
        this.status.setText('この ばんごうを あいてに おしえてね\nあいてが はいってくるのを まってるよ…');
      },
      () => this.status.setText('あいてが きたよ！'),
      (e) => this.status.setText(ERROR_TEXT[e]),
    );
  }

  private showJoin() {
    this.clear();
    this.heading.setText('へやばんごうを いれてね');
    this.typed = '';
    const items: Phaser.GameObjects.GameObject[] = [];
    this.digits = [];
    for (let i = 0; i < 4; i++) {
      const x = GAME_WIDTH / 2 + 60 + (i - 1.5) * 100;
      items.push(this.add.rectangle(x, 170, 84, 100, 0xffffff, 0.95).setStrokeStyle(5, 0xffa0c8));
      const t = this.add.text(x, 170, '', { fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color: '#3a1a5a' }).setOrigin(0.5);
      this.digits.push(t);
      items.push(t);
    }
    // すうじボタン
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'clear'];
    keys.forEach((k, i) => {
      const x = GAME_WIDTH / 2 + 60 + ((i % 3) - 1) * 130;
      const y = 280 + Math.floor(i / 3) * 82;
      const label = k === 'back' ? '←' : k === 'clear' ? 'けす' : k;
      const r = this.add.rectangle(x, y, 116, 70, 0xffffff, 0.9).setStrokeStyle(4, 0xb39ddb).setInteractive();
      const t = this.add.text(x, y, label, { fontFamily: FONT, fontSize: k.length > 1 ? '28px' : '40px', fontStyle: 'bold', color: '#3a1a5a' }).setOrigin(0.5);
      r.on('pointerdown', () => this.type(k));
      items.push(r, t);
    });
    const back = textButton(this, GAME_WIDTH - 150, 680, 'もどる', () => this.showChoice(), 220, 64);
    this.layer = this.add.container(0, 0, [...items, ...back]);
  }

  private type(k: string) {
    if (!this.digits.length || online.role) return; // 入力中だけ
    if (k === 'back') this.typed = this.typed.slice(0, -1);
    else if (k === 'clear') this.typed = '';
    else if (this.typed.length < 4) this.typed += k;
    this.digits.forEach((t, i) => t.setText(this.typed[i] ?? ''));
    this.status.setText('');
    if (isRoomCode(this.typed)) this.connect(this.typed);
  }

  private connect(code: string) {
    this.status.setText('つないでいるよ…');
    online.join(
      code,
      () => {
        this.status.setText('つながったよ！');
        online.send({ t: 'hello', v: PROTOCOL_VERSION, char: this.char });
      },
      (e) => {
        online.leave();
        this.status.setText(ERROR_TEXT[e]);
        this.typed = '';
        this.digits.forEach((t) => t.setText(''));
      },
    );
  }

  private startBattle(data: BattleData) {
    this.time.delayedCall(400, () => this.scene.start('Battle', data));
  }
}
