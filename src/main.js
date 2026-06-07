import Phaser from 'phaser';
import '../style.css';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from './constants.js';
import BootScene      from './scenes/BootScene.js';
import MainMenuScene  from './scenes/MainMenuScene.js';
import WorldMapScene  from './scenes/WorldMapScene.js';
import GameScene      from './scenes/GameScene.js';
import PauseScene     from './scenes/PauseScene.js';
import ResultScene    from './scenes/ResultScene.js';

const config = {
  type: Phaser.AUTO,
  width: LOGICAL_WIDTH,
  height: LOGICAL_HEIGHT,
  backgroundColor: '#000000',
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MainMenuScene, WorldMapScene, GameScene, PauseScene, ResultScene],
};

const game = new Phaser.Game(config);
if (import.meta.env.DEV) window.game = game;   // 개발용 디버그 접근 (프로덕션 빌드엔 미포함)
