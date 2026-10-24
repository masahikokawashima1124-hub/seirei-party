import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { online } from './online';

// 白い角丸ボタン
export function textButton(scene: Phaser.Scene, x: number, y: number, label: string, onTap: () => void, w = 360, h = 84) {
  const r = scene.add.rectangle(x, y, w, h, 0xffffff, 0.95).setStrokeStyle(5, 0xffb347).setInteractive();
  const t = scene.add.text(x, y, label, { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#3a1a5a' }).setOrigin(0.5);
  r.on('pointerdown', onTap);
  return [r, t] as const;
}

// 相手とのつながりが切れたときのお知らせ。タイトルにもどる
export function showLost(scene: Phaser.Scene) {
  if (scene.children.getByName('lost')) return;
  const bg = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setInteractive();
  const title = scene.add
    .text(GAME_WIDTH / 2, 260, 'つうしんが きれちゃった', { fontFamily: FONT, fontSize: '60px', fontStyle: 'bold', color: '#ffffff' })
    .setOrigin(0.5);
  const sub = scene.add
    .text(GAME_WIDTH / 2, 340, 'あいてが やめたか、でんぱが とどかなかったみたい', { fontFamily: FONT, fontSize: '26px', color: '#d8c8ff' })
    .setOrigin(0.5);
  const btn = textButton(scene, GAME_WIDTH / 2, 470, 'タイトルへ', () => scene.scene.start('Title'));
  scene.add.container(0, 0, [bg, title, sub, ...btn]).setDepth(200).setName('lost');
}

// 場面が続くあいだだけ、相手のデータと切断を聞く
export function listenOnline(scene: Phaser.Scene, onMsg: Parameters<typeof online.on>[0]) {
  const offMsg = online.on(onMsg);
  const offClose = online.onClose(() => showLost(scene));
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    offMsg();
    offClose();
  });
}
