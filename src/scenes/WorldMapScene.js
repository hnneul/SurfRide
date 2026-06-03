import Phaser from 'phaser';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import { StorageManager } from '../storage.js';
import { STAGES } from '../stages.js';

const W = LOGICAL_WIDTH;
const H = LOGICAL_HEIGHT;

const PALETTE = Object.freeze({
  ink: 0x07263e,
  inkSoft: 0x536f83,
  foam: 0xf3fbff,
  sky: 0xbff0ff,
  sea: 0x72cff2,
  ocean: 0x2291c9,
  deep: 0x075480,
  coral: 0xff6f59,
  coralDeep: 0xc93c58,
  sun: 0xffd66b,
  sand: 0xf4d58d,
  route: 0xffffff,
  locked: 0x6b7785,
});

const NODES = [
  { id: 1,  x: 250,  y: 610, island: 'jeju' },
  { id: 2,  x: 435,  y: 542, island: 'coast' },
  { id: 3,  x: 620,  y: 470, island: 'south' },
  { id: 4,  x: 820,  y: 405, island: 'china' },
  { id: 5,  x: 1012, y: 358, island: 'okinawa' },
  { id: 6,  x: 1198, y: 335, island: 'philippines' },
  { id: 7,  x: 1375, y: 350, island: 'night' },
  { id: 8,  x: 1532, y: 425, island: 'volcanic' },
  { id: 9,  x: 1652, y: 542, island: 'storm' },
  { id: 10, x: 1760, y: 690, island: 'final' },
];

const MAP_TEXTS = {
  1: '첫 파도에 올라타세요',
  2: '연안의 생물 신호를 읽는 구간',
  3: '큰 파도가 항로를 흔듭니다',
  4: '바람과 가짜 신호가 시작됩니다',
  5: '암초 지대를 빠르게 통과하세요',
  6: '태풍 전야, 리듬이 빨라집니다',
  7: '밤바다에서 번개 신호를 구분하세요',
  8: '화산 해역의 낯선 흐름',
  9: '폭풍과 번개가 동시에 몰아칩니다',
  10: '모든 파도가 마지막 시험이 됩니다',
};

const TYPE_LABEL = Object.freeze({
  FLYING_FISH: '날치',
  JELLYFISH: '해파리',
  SHARK: '상어',
  WHALE: '고래',
  OCTOPUS: '문어',
  LIGHTNING: '번개',
});

export default class WorldMapScene extends Phaser.Scene {
  constructor() { super({ key: 'WorldMapScene' }); }

  create() {
    try {
      this._createWorldMap();
    } catch (error) {
      console.error('WorldMapScene failed to render', error);
      this.add.text(W / 2, H / 2, '세계지도를 불러오지 못했습니다', {
        fontSize: '42px',
        fontFamily: 'sans-serif',
        color: '#ffffff',
      }).setOrigin(0.5);
    }
  }

  _createWorldMap() {
    this._storage = new StorageManager();
    this._save = this._storage.load() ?? {};
    this._unlocked = this._save.unlockedStages ?? [
      { id: 1, stars: 0, highScore: 0, cleared: false },
    ];
    this._nodeViews = new Map();
    this._panelObjects = [];
    this._buttonObjects = [];
    this._selectedId = this._defaultSelectedId();

    this._drawBackground();
    this._drawHeader();
    this._drawRoute();
    this._drawNodes();
    this._drawSummaryStrip();
    this._renderSelectionPanel();
    this._renderButtons();
  }

  _defaultSelectedId() {
    const next = this._nextId();
    if (next !== null) return next;
    const cleared = this._unlocked.filter(s => s.cleared).map(s => s.id);
    return cleared.length > 0 ? Math.max(...cleared) : 1;
  }

  _nextId() {
    const clearedIds = this._unlocked.filter(s => s.cleared).map(s => s.id);
    const maxCleared = clearedIds.length > 0 ? Math.max(...clearedIds) : 0;
    return maxCleared < STAGES.length ? maxCleared + 1 : null;
  }

  _entry(id) { return this._unlocked.find(s => s.id === id); }
  _isCleared(id) { return !!this._entry(id)?.cleared; }
  _isUnlocked(id) { return !!this._entry(id); }
  _isPlayable(id) { return this._isCleared(id) || this._nextId() === id || this._isUnlocked(id); }
  _stars(id) { return this._entry(id)?.stars ?? 0; }
  _highScore(id) { return this._entry(id)?.highScore ?? 0; }

  _drawBackground() {
    const bg = this.add.graphics();
    bg.fillGradientStyle(PALETTE.sky, PALETTE.sky, PALETTE.ocean, PALETTE.ocean, 1);
    bg.fillRect(0, 0, W, H * 0.66);
    bg.fillGradientStyle(PALETTE.ocean, PALETTE.ocean, PALETTE.deep, PALETTE.deep, 1);
    bg.fillRect(0, H * 0.58, W, H * 0.42);

    bg.fillStyle(PALETTE.sun, 0.95);
    bg.fillCircle(290, 150, 74);
    bg.fillStyle(PALETTE.sun, 0.22);
    bg.fillCircle(290, 150, 126);

    bg.fillStyle(0xffffff, 0.72);
    this._cloud(bg, 1270, 130, 1.05);
    this._cloud(bg, 1545, 190, 0.78);
    this._cloud(bg, 520, 205, 0.64);

    bg.fillStyle(0xffffff, 0.1);
    bg.fillRect(0, 262, W, 46);
    bg.fillStyle(0xffffff, 0.13);
    for (let i = 0; i < 6; i++) {
      const y = 742 + i * 52;
      bg.fillRoundedRect(-80 + i * 36, y, W + 160, 4, 2);
    }

    this._waveBand(0, 782, 0x054874, 0.18, 1.08);
    this._waveBand(0, 876, 0x062b4c, 0.22, 0.9);
  }

  _cloud(g, x, y, s) {
    g.fillCircle(x, y, 34 * s);
    g.fillCircle(x + 42 * s, y - 13 * s, 48 * s);
    g.fillCircle(x + 92 * s, y, 34 * s);
    g.fillRoundedRect(x - 36 * s, y - 3 * s, 160 * s, 38 * s, 18 * s);
  }

  _waveBand(x, y, color, alpha, scale) {
    const g = this.add.graphics();
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(x, H);
    g.lineTo(x, y);
    for (let px = -80; px <= W + 120; px += 24) {
      const wave = Math.sin(((px + 80) / 160) * Math.PI) * 54 * scale;
      g.lineTo(px, y - wave);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fillPath();
  }

  _drawHeader() {
    this.add.text(80, 54, '세계지도', {
      fontSize: '58px',
      fontFamily: 'sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0, 0.5).setShadow(0, 8, 'rgba(4,40,74,0.28)', 18);

    this.add.text(82, 102, '제주에서 태평양 끝까지, 파도 위 항로를 따라갑니다', {
      fontSize: '24px',
      fontFamily: 'sans-serif',
      color: '#e8f5ff',
    });

    const clearedCnt = this._unlocked.filter(s => s.cleared).length;
    const totalStars = this._unlocked.reduce((a, s) => a + (s.stars ?? 0), 0);
    const high = this._unlocked.reduce((a, s) => Math.max(a, s.highScore ?? 0), 0);
    this._pill(W - 530, 54, 190, 44, `★ ${totalStars} / 30`, PALETTE.sun, '#07263e');
    this._pill(W - 326, 54, 230, 44, `클리어 ${clearedCnt} / ${STAGES.length}`, 0xffffff, '#07263e', 0.78);
    this._pill(W - 80, 54, 220, 44, `BEST ${high.toLocaleString()}`, 0xffffff, '#07263e', 0.64);
  }

  _pill(cx, cy, w, h, label, fill, color, alpha = 0.94) {
    const g = this.add.graphics();
    g.fillStyle(fill, alpha);
    g.lineStyle(1.5, 0xffffff, 0.55);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    this.add.text(cx, cy + 1, label, {
      fontSize: '18px',
      fontFamily: 'sans-serif',
      fontStyle: 'bold',
      color,
    }).setOrigin(0.5);
  }

  _drawRoute() {
    this._drawIslands();

    const shadow = this.add.graphics();
    shadow.lineStyle(16, 0x06456d, 0.18);
    this._strokeRoute(shadow);

    const route = this.add.graphics();
    route.lineStyle(6, PALETTE.route, 0.82);
    this._strokeRoute(route);

    const dash = this.add.graphics();
    dash.lineStyle(3, PALETTE.sun, 0.9);
    for (let i = 0; i < NODES.length - 1; i++) this._dashedSegment(dash, NODES[i], NODES[i + 1], 18, 14);
  }

  _strokeRoute(g) {
    g.beginPath();
    g.moveTo(NODES[0].x, NODES[0].y);
    for (let i = 1; i < NODES.length; i++) {
      const prev = NODES[i - 1];
      const curr = NODES[i];
      const midX = (prev.x + curr.x) / 2;
      const midY = (prev.y + curr.y) / 2 - (i < 6 ? 26 : -10);
      for (let step = 1; step <= 12; step++) {
        const t = step / 12;
        const inv = 1 - t;
        const x = inv * inv * prev.x + 2 * inv * t * midX + t * t * curr.x;
        const y = inv * inv * prev.y + 2 * inv * t * midY + t * t * curr.y;
        g.lineTo(x, y);
      }
    }
    g.strokePath();
  }

  _dashedSegment(g, a, b, dashLen, gapLen) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const ux = dx / dist;
    const uy = dy / dist;
    for (let d = 22; d < dist - 22; d += dashLen + gapLen) {
      const x1 = a.x + ux * d;
      const y1 = a.y + uy * d;
      const x2 = a.x + ux * Math.min(d + dashLen, dist - 22);
      const y2 = a.y + uy * Math.min(d + dashLen, dist - 22);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.strokePath();
    }
  }

  _drawIslands() {
    const g = this.add.graphics();
    for (const node of NODES) {
      const cleared = this._isCleared(node.id);
      const playable = this._isPlayable(node.id);
      const alpha = playable ? 0.88 : 0.32;
      const tint = cleared ? 0x8ed58c : PALETTE.sand;

      g.fillStyle(0x063b5e, 0.2 * alpha);
      g.fillEllipse(node.x + 8, node.y + 44, 132, 28);
      g.fillStyle(tint, alpha);
      g.fillEllipse(node.x, node.y + 38, 118, 38);
      g.fillStyle(0x2fa66d, 0.48 * alpha);
      g.fillEllipse(node.x - 20, node.y + 29, 58, 20);
    }
  }

  _drawNodes() {
    for (const node of NODES) {
      const container = this.add.container(node.x, node.y);
      const ring = this.add.graphics();
      const body = this.add.graphics();
      const label = this.add.text(0, 2, String(node.id), {
        fontSize: '28px',
        fontFamily: 'sans-serif',
        fontStyle: 'bold',
        color: '#07263e',
      }).setOrigin(0.5);
      const name = this.add.text(0, 66, STAGES[node.id - 1].name, {
        fontSize: '19px',
        fontFamily: 'sans-serif',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: 160 },
      }).setOrigin(0.5, 0).setShadow(0, 3, 'rgba(4,40,74,0.36)', 8);
      const stars = this.add.text(0, 98, '', {
        fontSize: '18px',
        fontFamily: 'sans-serif',
        color: '#ffd66b',
      }).setOrigin(0.5, 0).setShadow(0, 2, 'rgba(4,40,74,0.35)', 6);
      container.add([ring, body, label, name, stars]);

      const playable = this._isPlayable(node.id);
      container.setSize(112, 112);
      if (playable) {
        container.setInteractive(
          new Phaser.Geom.Circle(56, 56, 56),
          Phaser.Geom.Circle.Contains,
        );
        container.on('pointerdown', () => this._selectNode(node.id));
        container.on('pointerover', () => container.setScale(1.05));
        container.on('pointerout', () => container.setScale(1));
      }

      this._nodeViews.set(node.id, { ring, body, label, name, stars, container });
    }
    this._refreshNodes();
  }

  _refreshNodes() {
    const nextId = this._nextId();
    for (const node of NODES) {
      const view = this._nodeViews.get(node.id);
      const selected = node.id === this._selectedId;
      const cleared = this._isCleared(node.id);
      const playable = this._isPlayable(node.id);
      const locked = !playable;
      const isNext = nextId === node.id;

      view.ring.clear();
      view.body.clear();
      view.container.setAlpha(locked ? 0.48 : 1);

      if (selected) {
        view.ring.fillStyle(PALETTE.sun, 0.22);
        view.ring.fillCircle(0, 0, 68);
        view.ring.lineStyle(5, PALETTE.sun, 0.95);
        view.ring.strokeCircle(0, 0, 56);
      } else if (isNext) {
        view.ring.lineStyle(4, PALETTE.sun, 0.72);
        view.ring.strokeCircle(0, 0, 52);
      }

      if (cleared) {
        view.body.fillStyle(PALETTE.foam, 0.98);
        view.body.lineStyle(4, 0x79ddff, 0.95);
      } else if (isNext) {
        view.body.fillStyle(PALETTE.sun, 0.98);
        view.body.lineStyle(4, 0xffffff, 0.88);
      } else if (playable) {
        view.body.fillStyle(0xffffff, 0.82);
        view.body.lineStyle(3, 0xffffff, 0.62);
      } else {
        view.body.fillStyle(0x7aa5bd, 0.36);
        view.body.lineStyle(3, 0xffffff, 0.24);
      }
      view.body.fillCircle(0, 0, 38);
      view.body.strokeCircle(0, 0, 38);

      view.label.setText(locked ? '잠김' : String(node.id));
      view.label.setFontSize(locked ? 19 : 28);
      view.label.setColor(locked ? '#d6e4ed' : '#07263e');
      view.name.setColor(locked ? 'rgba(232,245,255,0.55)' : '#ffffff');

      const s = this._stars(node.id);
      view.stars.setText(cleared ? '★'.repeat(s) + '☆'.repeat(3 - s) : isNext ? '다음 목적지' : '');
      view.stars.setFontSize(isNext && !cleared ? 17 : 18);
      view.stars.setColor(isNext && !cleared ? '#fff4c2' : '#ffd66b');
    }
  }

  _selectNode(id) {
    if (!this._isPlayable(id)) return;
    this._selectedId = id;
    this._refreshNodes();
    this._renderSelectionPanel();
    this._renderButtons();
  }

  _drawSummaryStrip() {
    const g = this.add.graphics();
    g.fillStyle(0x063b5e, 0.28);
    g.fillRoundedRect(72, 842, W - 144, 56, 8);
    g.lineStyle(1.5, 0xffffff, 0.24);
    g.strokeRoundedRect(72, 842, W - 144, 56, 8);

    const nextId = this._nextId();
    const message = nextId === null
      ? '모든 항로를 정복했습니다. 원하는 해역을 골라 기록을 갱신하세요.'
      : `${nextId}해역이 다음 목적지입니다. 노드를 눌러 브리핑을 확인하고 출발하세요.`;
    this.add.text(W / 2, 870, message, {
      fontSize: '24px',
      fontFamily: 'sans-serif',
      fontStyle: 'bold',
      color: '#e8f5ff',
    }).setOrigin(0.5);
  }

  _renderSelectionPanel() {
    this._panelObjects.forEach(obj => obj.destroy());
    this._panelObjects = [];

    const stage = STAGES[this._selectedId - 1];
    const cleared = this._isCleared(this._selectedId);
    const isNext = this._nextId() === this._selectedId;
    const stars = this._stars(this._selectedId);
    const highScore = this._highScore(this._selectedId);
    const types = [...new Set(stage.events.map(event => event.obstacleType))]
      .map(type => TYPE_LABEL[type] ?? type)
      .join(', ');

    const add = obj => { this._panelObjects.push(obj); return obj; };
    const panelX = 72;
    const panelY = 916;
    const panelW = W - 144;
    const panelH = 128;

    const panel = add(this.add.graphics());
    panel.fillStyle(PALETTE.foam, 0.86);
    panel.lineStyle(2, 0xffffff, 0.72);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 8);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 8);

    const badgeColor = cleared ? 0x2fa66d : isNext ? PALETTE.coral : PALETTE.ocean;
    const badge = add(this.add.graphics());
    badge.fillStyle(badgeColor, 0.96);
    badge.fillRoundedRect(panelX + 28, panelY + 26, 124, 76, 8);
    add(this.add.text(panelX + 90, panelY + 64, `${stage.id}구역`, {
      fontSize: '28px',
      fontFamily: 'sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5));

    add(this.add.text(panelX + 182, panelY + 26, stage.name, {
      fontSize: '32px',
      fontFamily: 'sans-serif',
      fontStyle: 'bold',
      color: '#07263e',
    }));
    add(this.add.text(panelX + 182, panelY + 70, MAP_TEXTS[stage.id], {
      fontSize: '21px',
      fontFamily: 'sans-serif',
      color: '#536f83',
    }));

    const status = cleared ? `클리어 ★ ${stars}/3` : isNext ? '다음 목적지' : '입장 가능';
    const statText = [
      status,
      `BEST ${highScore.toLocaleString()}`,
      `장애물 ${types}`,
      `목표 ${Math.round(stage.duration / 1000)}초 생존`,
    ];
    statText.forEach((text, i) => {
      const x = panelX + 720 + i * 250;
      add(this.add.text(x, panelY + 42, text, {
        fontSize: i === 0 ? '23px' : '20px',
        fontFamily: 'sans-serif',
        fontStyle: i === 0 ? 'bold' : 'normal',
        color: i === 0 ? '#07263e' : '#536f83',
      }).setOrigin(0.5, 0));
    });
  }

  _renderButtons() {
    this._buttonObjects.forEach(obj => obj.destroy());
    this._buttonObjects = [];

    this._buttonObjects.push(
      ...this._button(174, 778, 224, 58, '← 돌아가기', false, () => this.scene.start('MainMenuScene')),
    );

    if (this._isPlayable(this._selectedId)) {
      const stage = STAGES[this._selectedId - 1];
      this._buttonObjects.push(
        ...this._button(W - 234, 778, 330, 64, `${stage.id}구역 도전하기`, true,
          () => this.scene.start('GameScene', { stageIndex: this._selectedId - 1 })),
      );
    }
  }

  _button(cx, cy, w, h, label, primary, cb) {
    const objects = [];
    const gfx = this.add.graphics();
    objects.push(gfx);
    if (primary) {
      gfx.fillGradientStyle(PALETTE.coral, PALETTE.coral, PALETTE.coralDeep, PALETTE.coralDeep, 1);
      gfx.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
      gfx.lineStyle(2, 0xffffff, 0.44);
    } else {
      gfx.fillStyle(0xffffff, 0.18);
      gfx.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
      gfx.lineStyle(2, 0xffffff, 0.42);
    }
    gfx.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);

    objects.push(this.add.text(cx, cy + 1, label, {
      fontSize: primary ? '27px' : '24px',
      fontFamily: 'sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5).setShadow(0, 3, 'rgba(4,40,74,0.24)', 8));

    objects.push(this.add.zone(cx, cy, w, h)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', cb));
    return objects;
  }
}
