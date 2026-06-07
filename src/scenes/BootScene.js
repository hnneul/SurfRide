import Phaser from 'phaser';

const OBSTACLE_ASSETS = [
  ['obstacle-flying-fish', 'img/obstacle-flying-fish.png'],
  ['obstacle-shark', 'img/obstacle-shark.png'],
  ['obstacle-whale', 'img/obstacle-whale.png'],
  ['obstacle-jellyfish', 'img/obstacle-jellyfish.png'],
  ['obstacle-octopus', 'img/obstacle-octopus.png'],
  ['obstacle-lightning', 'img/obstacle-lightning.png'],
];

export default class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }

  preload() {
    for (const [key, url] of OBSTACLE_ASSETS) this.load.image(key, url);
  }

  create() { this.scene.start('MainMenuScene'); }
}
