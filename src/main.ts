import Phaser from 'phaser';
import './style.css';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { GRAVITY } from './battle/rules';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { SelectScene } from './scenes/SelectScene';
import { BattleScene } from './scenes/BattleScene';
import { ResultScene } from './scenes/ResultScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1b1440',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  // スマホ・PCどちらでも、比率を保って自動で拡大縮小する
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: GRAVITY }, debug: false },
  },
  scene: [BootScene, TitleScene, SelectScene, BattleScene, ResultScene],
});

// 開発中だけ、ブラウザのコンソールからゲームを調べられるようにする
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
