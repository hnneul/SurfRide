import Phaser from 'phaser';
import { StorageManager } from '../storage.js';
import { STAGES } from '../stages.js';
import { mountMainMenu } from '../ui/mainMenuDom.js';
import { audio } from '../audio.js';

// 메뉴 UI 는 HTML/CSS 오버레이로 렌더한다. 이 씬은 오버레이를 마운트하고,
// 버튼 콜백으로 다른 씬을 시작하며, 씬 종료 시 오버레이를 정리한다.
export default class MainMenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MainMenuScene' }); }

  create() {
    audio.playBgm('menu');

    const storage = new StorageManager();
    const save = storage.load();

    this._menu = mountMainMenu({
      save,
      storage,
      stages: STAGES,
      onStart:    () => this.scene.start('GameScene', { stageIndex: 0 }),
      onContinue: () => this.scene.start('GameScene', { stageIndex: save?.currentStage ?? 0 }),
      onTutorial: () => this.scene.start('GameScene', { stageIndex: 0, forceTutorial: true }),
      onWorldMap: () => this.scene.start('WorldMapScene'),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this._teardown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this._teardown, this);
  }

  _teardown() {
    this._menu?.destroy();
    this._menu = null;
  }
}
