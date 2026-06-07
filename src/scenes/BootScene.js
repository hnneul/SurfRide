import Phaser from 'phaser';

const OBSTACLE_ASSETS = [
  ['obstacle-flying-fish', 'obstacles/flying-fish-b.png'],
  ['obstacle-shark', 'obstacles/shark.png'],
  ['obstacle-whale', 'obstacles/whale.png'],
  ['obstacle-jellyfish', 'obstacles/jellyfish.png'],
  ['obstacle-octopus', 'obstacles/octopus.png'],
  ['obstacle-lightning', 'obstacles/lightning.png'],
];

export default class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }

  preload() {
    for (const [key, url] of OBSTACLE_ASSETS) this.load.image(key, url);
  }

  create() { this.scene.start('MainMenuScene'); }
}
