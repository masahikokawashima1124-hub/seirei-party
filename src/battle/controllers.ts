import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { Fighter, FighterInput } from './Fighter';

export interface Controller {
  read(now: number): FighterInput;
}

export type HeldKey = 'left' | 'right' | 'down' | 'jump' | 'throw' | 'bump';
export type PlayerSlot = 'solo' | 'p1' | 'p2';

interface ButtonDef {
  key: HeldKey;
  x: number;
  y: number;
  r: number;
  label: string;
  color: number;
}

const W = GAME_WIDTH;
const H = GAME_HEIGHT;

// キーボードの割り当て。ひとりのときは、どちらのキーでも動かせる
const KEYS: Record<PlayerSlot, Record<string, HeldKey>> = {
  solo: {
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
    KeyS: 'down',
    ArrowDown: 'down',
    KeyW: 'jump',
    ArrowUp: 'jump',
    Space: 'jump',
    KeyJ: 'throw',
    KeyZ: 'throw',
    KeyF: 'throw',
    KeyK: 'bump',
    KeyX: 'bump',
    KeyG: 'bump',
  },
  p1: { KeyA: 'left', KeyD: 'right', KeyS: 'down', KeyW: 'jump', KeyF: 'throw', KeyG: 'bump' },
  p2: {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowDown: 'down',
    ArrowUp: 'jump',
    Period: 'throw',
    Slash: 'bump',
    Numpad1: 'throw',
    Numpad2: 'bump',
  },
};

// 画面のボタンの並び
function touchLayout(slot: PlayerSlot): ButtonDef[] {
  if (slot === 'solo') {
    // 左手：移動、右手：ジャンプ・まくら・ぽよん
    return [
      { key: 'left', x: 95, y: H - 105, r: 66, label: '◀', color: 0xffffff },
      { key: 'right', x: 255, y: H - 105, r: 66, label: '▶', color: 0xffffff },
      { key: 'down', x: 175, y: H - 225, r: 44, label: '▼', color: 0xffffff },
      { key: 'jump', x: W - 100, y: H - 110, r: 74, label: 'ジャンプ', color: 0x7cd4ff },
      { key: 'throw', x: W - 255, y: H - 85, r: 60, label: 'まくら', color: 0xffe08a },
      { key: 'bump', x: W - 190, y: H - 240, r: 56, label: 'ぽよん', color: 0xffa0c8 },
    ];
  }
  // ふたりのとき：画面の左半分が1P、右半分が2P。外側に移動、内側にジャンプ・まくら・ぽよん。
  // 内側のボタンはステージの床より下に横一列で並べ、キャラが隠れないようにする
  const y = H - 62;
  const left: ButtonDef[] = [
    { key: 'left', x: 62, y, r: 50, label: '◀', color: 0xffffff },
    { key: 'right', x: 178, y, r: 50, label: '▶', color: 0xffffff },
    { key: 'down', x: 120, y: H - 165, r: 36, label: '▼', color: 0xffffff },
    { key: 'throw', x: 358, y, r: 46, label: 'まくら', color: 0xffe08a },
    { key: 'bump', x: 458, y, r: 46, label: 'ぽよん', color: 0xffa0c8 },
    { key: 'jump', x: 566, y, r: 52, label: 'ジャンプ', color: 0x7cd4ff },
  ];
  if (slot === 'p1') return left;
  // 2P は左右を反転。ただし ◀ ▶ の向きはそのまま
  return left.map((b) => {
    const mirrored = { ...b, x: W - b.x };
    if (b.key === 'left') return { ...mirrored, key: 'right' as const, label: '▶' };
    if (b.key === 'right') return { ...mirrored, key: 'left' as const, label: '◀' };
    return mirrored;
  });
}

// 人が操作する：キーボード＋画面のボタン
export class HumanController implements Controller {
  private held: Record<HeldKey, boolean> = { left: false, right: false, down: false, jump: false, throw: false, bump: false };
  private prev: Record<HeldKey, boolean> = { ...this.held };
  private touchHeld: Record<HeldKey, number> = { left: 0, right: 0, down: 0, jump: 0, throw: 0, bump: 0 };
  // 1フレームより短く押して離しても取りこぼさないよう、「押した」ことを覚えておく
  private tapped = new Set<HeldKey>();

  constructor(scene: Phaser.Scene, slot: PlayerSlot = 'solo', tag?: { text: string; color: number }) {
    this.setupKeyboard(scene, KEYS[slot]);
    this.setupTouch(scene, touchLayout(slot), tag);
  }

  read(): FighterInput {
    const now: Record<HeldKey, boolean> = { ...this.held };
    for (const k of Object.keys(now) as HeldKey[]) now[k] = now[k] || this.touchHeld[k] > 0;
    const input: FighterInput = {
      left: now.left,
      right: now.right,
      down: now.down,
      jump: (now.jump && !this.prev.jump) || this.tapped.has('jump'),
      throw: (now.throw && !this.prev.throw) || this.tapped.has('throw'),
      bump: (now.bump && !this.prev.bump) || this.tapped.has('bump'),
    };
    this.prev = now;
    this.tapped.clear();
    return input;
  }

  private setupKeyboard(scene: Phaser.Scene, map: Record<string, HeldKey>) {
    const kb = scene.input.keyboard;
    if (!kb) return;
    kb.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');
    const onDown = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (!k) return;
      if (!this.held[k]) this.tapped.add(k);
      this.held[k] = true;
    };
    const onUp = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (k) this.held[k] = false;
    };
    kb.on('keydown', onDown);
    kb.on('keyup', onUp);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      kb.off('keydown', onDown);
      kb.off('keyup', onUp);
    });
  }

  private setupTouch(scene: Phaser.Scene, buttons: ButtonDef[], tag?: { text: string; color: number }) {
    scene.input.addPointer(5); // 2人×両手でも反応するように
    for (const b of buttons) {
      // ふたりのときは、ふちの色をキャラのテーマ色にして、どちらのボタンか分かるようにする
      const edge = tag ? tag.color : b.color;
      const circle = scene.add.circle(b.x, b.y, b.r, b.color, 0.22).setStrokeStyle(tag ? 6 : 4, edge, 0.8).setDepth(50).setInteractive();
      scene.add
        .text(b.x, b.y, b.label, {
          fontFamily: FONT,
          fontSize: b.label.length > 1 ? `${Math.round(b.r * 0.38)}px` : `${Math.round(b.r * 0.66)}px`,
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(51);
      // 指を置いている本数を数える（2本指で同じボタンを押しても困らないように）
      const pressed = new Set<number>();
      const update = () => {
        this.touchHeld[b.key] = pressed.size;
        circle.setFillStyle(b.color, pressed.size ? 0.5 : 0.22);
      };
      circle.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (!pressed.size) this.tapped.add(b.key);
        pressed.add(p.id);
        update();
      });
      const release = (p: Phaser.Input.Pointer) => {
        pressed.delete(p.id);
        update();
      };
      circle.on('pointerup', release);
      circle.on('pointerout', release);
    }
    if (tag) {
      // 「1P」「2P」の札（▼ボタンの上。ステージにかからない場所）
      const down = buttons.find((b) => b.key === 'down')!;
      scene.add
        .text(down.x, down.y - 72, tag.text, {
          fontFamily: FONT,
          fontSize: '30px',
          fontStyle: 'bold',
          color: '#ffffff',
          backgroundColor: Phaser.Display.Color.IntegerToColor(tag.color).rgba,
          padding: { x: 14, y: 4 },
        })
        .setOrigin(0.5)
        .setAlpha(0.85)
        .setDepth(51);
    }
  }
}

// コンピュータ。小学生が勝てるくらいの強さにしている
export class CpuController implements Controller {
  private me: Fighter;
  private target: Fighter;
  private stage: { left: number; right: number; top: number };
  private nextThink = 0;
  private plan: FighterInput = { left: false, right: false, down: false, jump: false, throw: false, bump: false };
  private level: number; // 0〜1。大きいほど強い

  constructor(me: Fighter, target: Fighter, stage: { left: number; right: number; top: number }, level = 0.5) {
    this.me = me;
    this.target = target;
    this.stage = stage;
    this.level = level;
  }

  read(now: number): FighterInput {
    const me = this.me.body;
    const b = this.me.arcade;
    const offStage = me.x < this.stage.left - 10 || me.x > this.stage.right + 10;

    // 場外からは最優先でステージに戻る
    if (offStage || me.y > this.stage.top + 40) {
      const toCenter = me.x < (this.stage.left + this.stage.right) / 2;
      const needJump = b.velocity.y > 0 && this.me.jumpsLeft > 0 && me.y > this.stage.top - 120;
      return { left: !toCenter, right: toCenter, down: false, jump: needJump, throw: false, bump: false };
    }

    if (now >= this.nextThink) {
      this.nextThink = now + Phaser.Math.Between(140, 320) - this.level * 80;
      const dx = this.target.body.x - me.x;
      const dy = this.target.body.y - me.y;
      const dist = Math.abs(dx);
      const r = Math.random();
      const towards = dx > 0;
      this.plan = { left: false, right: false, down: false, jump: false, throw: false, bump: false };
      if (this.target.out) return this.plan; // 相手がいない間は待つ

      if (dist > 300) {
        this.plan.left = !towards;
        this.plan.right = towards;
      } else if (dist < 90 && r < 0.3) {
        this.plan.left = towards; // 近すぎたら少し離れる
        this.plan.right = !towards;
      }
      // 向きをそろえてから投げる
      if (Math.abs(dy) < 90 && dist < 620 && r < 0.25 + this.level * 0.3) {
        this.plan.left = !towards;
        this.plan.right = towards;
        this.plan.throw = true;
      }
      if (dist < 150 && Math.abs(dy) < 60 && r > 0.75 - this.level * 0.2) {
        this.plan.left = !towards;
        this.plan.right = towards;
        this.plan.bump = true;
      }
      if (dy < -90 && this.me.grounded && r < 0.5) this.plan.jump = true;
      if (dy > 90 && this.me.grounded && r < 0.4) this.plan.down = true;
    }

    // 押した瞬間の操作は1回だけ
    const out = { ...this.plan };
    this.plan.jump = false;
    this.plan.throw = false;
    this.plan.bump = false;
    return out;
  }
}
