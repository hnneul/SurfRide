import Phaser from 'phaser';
import { StorageManager } from '../storage.js';
import { STAGES } from '../stages.js';
import { mountWorldMap } from '../ui/worldMapDom.js';

// 세계지도는 HTML/CSS 오버레이로 렌더한다. Phaser 씬은 저장 데이터를 읽고,
// DOM UI 콜백으로 씬 전환만 담당한다.
export default class WorldMapScene extends Phaser.Scene {
  constructor() { super({ key: 'WorldMapScene' }); }

  create() {
    const storage = new StorageManager();
    const save = storage.load();

    this._worldMap = mountWorldMap({
      save,
      stages: STAGES,
      onBack: () => this.scene.start('MainMenuScene'),
      onChallenge: (stageIndex) => this.scene.start('GameScene', { stageIndex }),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this._teardown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this._teardown, this);
  }

  _teardown() {
    this._worldMap?.destroy();
    this._worldMap = null;
  }
}
