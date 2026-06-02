import Phaser from 'phaser';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import { StorageManager } from '../storage.js';
import { STAGES } from '../stages.js';

const W = LOGICAL_WIDTH;
const H = LOGICAL_HEIGHT;

const NODES = [
  { id: 1,  x: 170,  y: 615 }, { id: 2,  x: 360,  y: 550 }, { id: 3,  x: 545,  y: 480 },
  { id: 4,  x: 735,  y: 400 }, { id: 5,  x: 920,  y: 342 }, { id: 6,  x: 1105, y: 298 },
  { id: 7,  x: 1285, y: 268 }, { id: 8,  x: 1458, y: 248 }, { id: 9,  x: 1628, y: 232 },
  { id: 10, x: 1790, y: 218 },
];

const MAP_TEXTS = {
  1: '첫 파도에 올라타세요',      2: '연안의 생물들을 조심하세요',
  3: '큰 파도가 밀려옵니다',      4: '바람이 착지를 흔듭니다',
  5: '암초를 피해 나아가세요',    6: '태풍이 다가옵니다',
  7: '빛나는 신호만 믿으세요',    8: '이질적인 바다가 펼쳐집니다',
  9: '파도와 번개가 동시에 몰아칩니다', 10: '모든 파도가 당신을 시험합니다',
};

export default class WorldMapScene extends Phaser.Scene {
  constructor() { super({ key: 'WorldMapScene' }); }

  create() {
    this._storage = new StorageManager();
    const save = this._storage.load() ?? {};
    const unlocked  = save.unlockedStages ?? [{ id: 1, stars: 0, highScore: 0, cleared: false }];
    const isCleared  = id => unlocked.some(s => s.id === id && s.cleared);
    const isUnlocked = id => unlocked.some(s => s.id === id);
    const getStars   = id => unlocked.find(s => s.id === id)?.stars ?? 0;
    const clearedIds = unlocked.filter(s => s.cleared).map(s => s.id);
    const maxCleared = clearedIds.length > 0 ? Math.max(...clearedIds) : 0;
    const nextId     = maxCleared < 10 ? maxCleared + 1 : null;

    // ── Background ──────────────────────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillGradientStyle(0xcdf0fa, 0xcdf0fa, 0x0097a7, 0x0097a7, 1).fillRect(0, 0, W, H * 0.65);
    bg.fillGradientStyle(0x0097a7, 0x0097a7, 0x004d56, 0x004d56, 1).fillRect(0, H * 0.65, W, H * 0.35);

    // ── Header ──────────────────────────────────────────────────────────────
    this.add.text(W / 2, 66, '세계지도', {
      fontSize: '54px', fontFamily: 'sans-serif', color: '#1a2744', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(W / 2, 104, '제주에서 태평양 끝까지 — 신호를 읽고 파도를 넘는 항해', {
      fontSize: '26px', fontFamily: 'sans-serif', color: '#004d56',
    }).setOrigin(0.5);
    this.add.graphics()
      .lineStyle(1, 0x004d56, 0.25)
      .beginPath().moveTo(100, 122).lineTo(W - 100, 122).strokePath();

    // ── Route line ──────────────────────────────────────────────────────────
    const routeGfx = this.add.graphics();
    routeGfx.lineStyle(3, 0x1a2744, 0.45);
    routeGfx.beginPath();
    routeGfx.moveTo(NODES[0].x, NODES[0].y);
    for (let i = 1; i < NODES.length; i++) routeGfx.lineTo(NODES[i].x, NODES[i].y);
    routeGfx.strokePath();

    // ── Nodes ───────────────────────────────────────────────────────────────
    const R = 30;
    for (const { id, x, y } of NODES) {
      const cleared  = isCleared(id);
      const unlocked = isUnlocked(id);
      const isNext   = nextId !== null && id === nextId;

      const nodeGfx = this.add.graphics();
      if (cleared) {
        nodeGfx.fillStyle(0x1a2744, 1).lineStyle(3, 0x29b6f6, 1);
      } else if (isNext) {
        nodeGfx.fillStyle(0xe1b612, 1).lineStyle(4, 0xffe441, 1);
      } else if (unlocked) {
        nodeGfx.fillStyle(0xffffff, 0.55).lineStyle(2, 0x1a2744, 0.45);
      } else {
        nodeGfx.fillStyle(0xffffff, 0.18).lineStyle(2, 0x1a2744, 0.25);
      }
      nodeGfx.fillCircle(x, y, R).strokeCircle(x, y, R);

      // Number or lock
      if (!unlocked && !isNext) {
        this.add.text(x, y + 8, '🔒', { fontSize: '22px' }).setOrigin(0.5);
      } else {
        this.add.text(x, y + 8, String(id), {
          fontSize: '22px', fontFamily: 'sans-serif', fontStyle: 'bold',
          color: cleared ? '#ffffff' : isNext ? '#2a1800' : '#1a2744',
        }).setOrigin(0.5);
      }

      // Stage name below node
      const stage = STAGES[id - 1];
      this.add.text(x, y + R + 22, stage.name, {
        fontSize: isNext ? '21px' : '19px',
        fontFamily: 'sans-serif',
        fontStyle: isNext ? 'bold' : 'normal',
        color: cleared  ? '#1a2744'
             : isNext   ? '#ffe566'
             : unlocked ? 'rgba(26,39,68,0.85)'
             : 'rgba(26,39,68,0.45)',
      }).setOrigin(0.5, 0);

      if (cleared) {
        const s = getStars(id);
        this.add.text(x, y + R + 44, '★'.repeat(s) + '☆'.repeat(3 - s), {
          fontSize: '16px', fontFamily: 'sans-serif', color: '#f9a825',
        }).setOrigin(0.5, 0);
      }

      // Clickable button for cleared/next nodes
      if ((cleared || isNext) && !(nextId === null && !cleared)) {
        this.add.zone(x, y, R * 2 + 20, R * 2 + 20)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.scene.start('GameScene', { stageIndex: id - 1 }));
      }
    }

    // ── Surfer icon at current position ─────────────────────────────────────
    const boardNode = NODES[(nextId ?? 10) - 1];
    this.add.text(boardNode.x, boardNode.y - 46, '🏄', { fontSize: '40px' }).setOrigin(0.5);

    // ── Next goal tooltip ────────────────────────────────────────────────────
    if (nextId !== null) {
      const nNode = NODES[nextId - 1];
      const text  = MAP_TEXTS[nextId] ?? '';
      if (text) {
        const tw = text.length * 14; // rough estimate
        const bw = tw + 44, bh = 48;
        let bx = nNode.x - bw / 2;
        bx = Math.max(14, Math.min(W - bw - 14, bx));
        const by = Math.max(136, nNode.y - R - 68);

        this.add.graphics()
          .fillStyle(0xffd223, 0.15).lineStyle(1.5, 0xf9a825, 0.7)
          .fillRoundedRect(bx, by, bw, bh, 8).strokeRoundedRect(bx, by, bw, bh, 8);
        this.add.text(bx + bw / 2, by + bh / 2, text, {
          fontSize: '24px', fontFamily: 'sans-serif', color: '#7a5000',
        }).setOrigin(0.5);
      }
    }

    if (maxCleared >= 10) {
      this.add.text(W / 2, 160, '🎉 모든 해역 정복 완료!', {
        fontSize: '34px', fontFamily: 'sans-serif', color: '#1a2744', fontStyle: 'bold',
      }).setOrigin(0.5);
    }

    // ── Stage card panel ─────────────────────────────────────────────────────
    this._renderCards(645, unlocked, isCleared, isUnlocked, getStars, nextId);

    // ── Buttons ──────────────────────────────────────────────────────────────
    this._btn(172, 65, 224, 58, '← 돌아가기', false, () => this.scene.start('MainMenuScene'));

    if (nextId !== null) {
      const sd = STAGES[nextId - 1];
      const label = `${nextId}해역 입장 — ${sd.name}`;
      this._btn(W / 2, H - 56, 360, 68, label, true, () => this.scene.start('GameScene', { stageIndex: nextId - 1 }));
    }
  }

  _renderCards(panelY, unlocked, isCleared, isUnlocked, getStars, nextId) {
    const panelH = 295;

    const panelGfx = this.add.graphics();
    panelGfx.fillStyle(0xffffff, 0.82).fillRect(0, panelY, W, panelH);
    panelGfx.lineStyle(1, 0x0097a7, 0.35).beginPath().moveTo(0, panelY).lineTo(W, panelY).strokePath();

    const clearedCnt = unlocked.filter(s => s.cleared).length;
    const totalStars = unlocked.reduce((a, s) => a + (s.stars ?? 0), 0);

    this.add.text(60, panelY + 28, '해역 목록', {
      fontSize: '22px', fontFamily: 'sans-serif', color: '#1a2744', fontStyle: 'bold',
    });
    this.add.text(W - 60, panelY + 28, `클리어 ${clearedCnt} / ${STAGES.length}  ★ ${totalStars}`, {
      fontSize: '20px', fontFamily: 'sans-serif', color: '#0097a7',
    }).setOrigin(1, 0);

    const cardW = 162, cardH = 230, gap = 12;
    const totalW = STAGES.length * cardW + (STAGES.length - 1) * gap;
    const startX = Math.round((W - totalW) / 2);
    const cardTop = panelY + 44;

    for (let i = 0; i < STAGES.length; i++) {
      const stage    = STAGES[i];
      const id       = stage.id;
      const cleared  = isCleared(id);
      const unlocked2 = isUnlocked(id);
      const isNext   = nextId === id;
      const stars    = getStars(id);
      const cx2      = startX + i * (cardW + gap);
      const cy2      = cardTop;

      const cGfx = this.add.graphics();
      if (isNext) {
        cGfx.fillStyle(0xfff8e1, 0.95).lineStyle(2, 0xf9a825, 0.8);
      } else if (cleared) {
        cGfx.fillStyle(0xe0f7fa, 0.92).lineStyle(1, 0x0097a7, 0.55);
      } else {
        cGfx.fillStyle(0xffffff, 0.45).lineStyle(1, 0x1a2744, 0.18);
      }
      cGfx.fillRoundedRect(cx2, cy2, cardW, cardH, 8).strokeRoundedRect(cx2, cy2, cardW, cardH, 8);

      const ncx = cx2 + cardW / 2, ncy = cy2 + 36;
      const nGfx = this.add.graphics();
      if (cleared) {
        nGfx.fillStyle(0x1a2744, 1).lineStyle(2, 0x0097a7, 1);
      } else if (isNext) {
        nGfx.fillStyle(0xf9a825, 0.9).lineStyle(2, 0xf9a825, 1);
      } else {
        nGfx.fillStyle(0xffffff, 0.6).lineStyle(1, 0x1a2744, 0.3);
      }
      nGfx.fillCircle(ncx, ncy, 22).strokeCircle(ncx, ncy, 22);

      if (!unlocked2 && !isNext) {
        this.add.text(ncx, ncy + 6, '🔒', { fontSize: '16px' }).setOrigin(0.5);
      } else {
        this.add.text(ncx, ncy + 6, String(id), {
          fontSize: '16px', fontFamily: 'sans-serif', fontStyle: 'bold',
          color: cleared ? '#ffffff' : '#1a2744',
        }).setOrigin(0.5);
      }

      const nameColor = cleared ? '#1a2744' : isNext ? '#7a5000' : unlocked2 ? 'rgba(26,39,68,0.8)' : 'rgba(26,39,68,0.38)';
      this.add.text(ncx, cy2 + 66, stage.name, {
        fontSize: isNext ? '11px' : '11px', fontFamily: 'sans-serif',
        fontStyle: isNext ? 'bold' : 'normal', color: nameColor, wordWrap: { width: cardW - 10 },
      }).setOrigin(0.5, 0);

      if (cleared) {
        this.add.text(ncx, cy2 + 110, '★'.repeat(stars) + '☆'.repeat(3 - stars), {
          fontSize: '13px', fontFamily: 'sans-serif', color: '#f9a825',
        }).setOrigin(0.5, 0);
      } else if (isNext) {
        this.add.text(ncx, cy2 + 110, '다음 목적지', { fontSize: '10px', fontFamily: 'sans-serif', color: 'rgba(122,80,0,0.85)' }).setOrigin(0.5, 0);
      } else if (!unlocked2) {
        this.add.text(ncx, cy2 + 110, `${id - 1}해역 클리어`, { fontSize: '9px', fontFamily: 'sans-serif', color: 'rgba(26,39,68,0.45)' }).setOrigin(0.5, 0);
      }

      if (cleared || isNext) {
        const btnLabel = isNext ? '⚓ 입장하기' : '재도전';
        const btnY2    = cy2 + cardH - 42;
        const bGfx     = this.add.graphics();
        bGfx.fillStyle(isNext ? 0xf9a825 : 0x1a2744, isNext ? 0.9 : 0.82);
        bGfx.fillRoundedRect(cx2 + 8, btnY2 - 15, cardW - 16, 30, 6);

        this.add.text(ncx, btnY2, btnLabel, {
          fontSize: '11px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
        }).setOrigin(0.5);

        const idx = i;
        this.add.zone(ncx, btnY2, cardW - 16, 30)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.scene.start('GameScene', { stageIndex: idx }));
      }
    }
  }

  _btn(cx, cy, w, h, label, primary, cb) {
    const gfx = this.add.graphics();
    if (primary) {
      gfx.fillStyle(0x1a2744, 1).fillRoundedRect(cx - w/2, cy - h/2, w, h, 10);
    } else {
      gfx.fillStyle(0xffffff, 0.85);
    }
    gfx.lineStyle(2, 0x1a2744, 1).fillRoundedRect(cx - w/2, cy - h/2, w, h, 10).strokeRoundedRect(cx - w/2, cy - h/2, w, h, 10);

    this.add.text(cx, cy, label, {
      fontSize: '28px', fontFamily: 'sans-serif',
      color: primary ? '#ffffff' : '#1a2744', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true }).on('pointerdown', cb);
  }
}
