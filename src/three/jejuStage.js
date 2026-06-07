import * as THREE from 'three';
import { disposeObject } from './bridge.js';

const FOG_FREE = { fog: false };
const JEJU_BACKDROP = '/stage-1-jeju-scenic-loop.png';
const BACKDROP_SCROLL_SPEED = 0.014;

export class JejuStageSet {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'JejuStageSet';
    this.foam = [];
    this.currents = [];
    this.spray = [];
    this.cloudBands = [];
    this.backdropTex = null;
    this.extraTextures = [];
    this.prevBackground = scene.background;

    this._buildScenicBackdrop();
    this._buildFoamBands();
    this._buildCurrentStreaks();
    this._buildSeaGlitter();
    this._buildPixelCloudBands();

    this.scene.add(this.root);
  }

  update(t) {
    if (this.backdropTex) {
      this.backdropTex.offset.x = (t * BACKDROP_SCROLL_SPEED) % 1;
    }

    for (const band of this.foam) {
      const phase = band.userData.phase;
      const drift = (t * band.userData.speed + phase) % band.userData.loop;
      band.position.x = band.userData.x - drift;
      band.position.z = band.userData.z + Math.sin(t * 1.2 + phase) * band.userData.bobZ;
      band.position.y = band.userData.y + Math.sin(t * 2.4 + phase) * band.userData.bobY;
      band.material.opacity = band.userData.alpha + (Math.sin(t * 3.0 + phase) + 1) * 0.09;
    }

    for (const current of this.currents) {
      const phase = current.userData.phase;
      const drift = (t * current.userData.speed + phase) % current.userData.loop;
      current.position.x = current.userData.x - drift;
      current.position.z = current.userData.z + Math.sin(t * 1.35 + phase) * current.userData.bobZ;
      current.position.y = current.userData.y + Math.sin(t * 2.1 + phase) * current.userData.bobY;
      current.material.opacity = current.userData.alpha + (Math.sin(t * 2.8 + phase) + 1) * current.userData.pulse;
    }

    for (const drop of this.spray) {
      const phase = drop.userData.phase;
      const rise = (Math.sin(t * drop.userData.speed + phase) + 1) * 0.5;
      drop.position.y = drop.userData.y + rise * drop.userData.lift;
      drop.position.x = drop.userData.x + Math.sin(t * 1.7 + phase) * 0.12;
      drop.material.opacity = 0.12 + (1 - rise) * 0.38;
      drop.scale.setScalar(drop.userData.scale * (0.7 + rise * 0.5));
    }

    for (const cloud of this.cloudBands) {
      cloud.position.x -= cloud.userData.speed;
      if (cloud.position.x < -85) cloud.position.x = 82;
    }
  }

  dispose() {
    if (this.scene.background === this.backdropTex) this.scene.background = this.prevBackground;
    this.backdropTex?.dispose();
    this.extraTextures.forEach((tex) => tex.dispose());
    disposeObject(this.root);
  }

  _buildScenicBackdrop() {
    new THREE.TextureLoader().load(JEJU_BACKDROP, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.set(0.5, 1);
      this.scene.background = tex;
      this.backdropTex = tex;

    });
  }

  _buildDistantCoast() {
    const island = this._shapeMesh([
      [-24, 0], [-18, 2.1], [-12, 1.1], [-6, 3.2], [1, 1.6],
      [9, 2.1], [18, 0.4], [28, 0], [28, -1.7], [-24, -1.7],
    ], 0x1f7883, 0.58);
    island.position.set(-4, 5.25, -39);
    this.root.add(island);

    const farIslet = this._shapeMesh([
      [-8, 0], [-4, 0.7], [1, 0.45], [5, 1.0], [10, 0],
      [10, -1.0], [-8, -1.0],
    ], 0x246174, 0.43);
    farIslet.position.set(28, 4.95, -41);
    this.root.add(farIslet);

    const horizonGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(58, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xd8fff3, transparent: true, opacity: 0.12, ...FOG_FREE }),
    );
    horizonGlow.position.set(4, 4.55, -37);
    this.root.add(horizonGlow);

    const lighthouse = new THREE.Group();
    const white = new THREE.MeshBasicMaterial({ color: 0xf4f1e4, transparent: true, opacity: 0.95, ...FOG_FREE });
    const red = new THREE.MeshBasicMaterial({ color: 0xd6574c, transparent: true, opacity: 0.9, ...FOG_FREE });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 1.8, 5), white);
    tower.position.y = 0.9;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.17, 0.16), red);
    stripe.position.y = 1.05;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.2, 0.2), red);
    cap.position.y = 1.82;
    lighthouse.add(tower, stripe, cap);
    lighthouse.position.set(-24.5, 5.0, -37.5);
    this.root.add(lighthouse);
  }

  _buildShore() {
    const basalt = new THREE.MeshLambertMaterial({ color: 0x172129, flatShading: true });
    const basaltHi = new THREE.MeshLambertMaterial({ color: 0x31414a, flatShading: true });
    const moss = new THREE.MeshLambertMaterial({ color: 0x2f7d52, flatShading: true });

    const cliff = new THREE.Group();
    const columnDefs = [
      [-36, -26, 3.2, 2.4], [-34.6, -25.7, 4.2, 2.1], [-33.2, -25.2, 3.6, 2.5],
      [-31.8, -24.8, 4.8, 2.2], [-30.3, -24.4, 3.4, 2.4], [-28.8, -24.2, 2.7, 2.0],
      [-27.4, -23.9, 2.1, 1.7], [-26.1, -23.7, 1.6, 1.5],
    ];
    for (const [x, z, h, r] of columnDefs) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.24, r * 0.3, h, 6), basalt);
      col.position.set(x, h * 0.5 + 0.3, z);
      cliff.add(col);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.26, r * 0.23, 0.12, 6), basaltHi);
      top.position.set(x, h + 0.38, z);
      cliff.add(top);
    }

    const boulderDefs = [
      [-35.6, 0.6, -20, 3.8], [-32.2, 0.25, -18.8, 3.0], [-28.8, 0.12, -17.7, 2.4],
      [-38.2, 0.2, -17.0, 2.7], [-34.4, -0.1, -15.5, 2.2], [-30.6, -0.2, -14.6, 1.8],
      [-26.7, -0.25, -13.8, 1.4],
    ];
    for (const [x, y, z, s] of boulderDefs) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), basalt);
      rock.scale.set(1.55, 0.68, 1.0);
      rock.position.set(x, y, z);
      cliff.add(rock);
    }

    for (const [x, y, z, s] of [[-36.2, 3.5, -25.8, 0.7], [-32.8, 4.8, -24.8, 0.55], [-34.8, 2.1, -18.2, 0.64]]) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(s, s * 1.5, 5), moss);
      tuft.position.set(x, y, z);
      cliff.add(tuft);
    }

    this.root.add(cliff);
  }

  _buildDolHareubang() {
    const stone = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x847a6b, flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: 0x343532, flatShading: true });
    const mid = new THREE.MeshLambertMaterial({ color: 0x5d5b52, flatShading: true });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.34, 3.2, 8), mat);
    body.position.y = 1.6;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1.12, 8, 5), mat);
    belly.scale.set(0.88, 0.55, 0.65);
    belly.position.set(0, 1.2, 0.35);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.08, 8, 6), mat);
    head.scale.set(0.92, 1.05, 0.78);
    head.position.y = 3.45;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.42, 0.28, 8), mat);
    brim.position.y = 4.05;
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 0.92, 0.62, 8), mat);
    hat.position.y = 4.43;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.66, 0.24), dark);
    nose.position.set(0, 3.44, 0.86);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.12), dark);
    mouth.position.set(0, 3.05, 0.86);
    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.1), dark);
    leftEye.position.set(-0.42, 3.67, 0.78);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.42;
    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4), mid);
    leftHand.scale.set(1.2, 0.75, 0.55);
    leftHand.position.set(-0.58, 1.62, 0.82);
    const rightHand = leftHand.clone();
    rightHand.position.x = 0.58;
    stone.add(body, belly, head, brim, hat, nose, mouth, leftEye, rightEye, leftHand, rightHand);

    const spotGeo = new THREE.BoxGeometry(0.08, 0.08, 0.04);
    for (let i = 0; i < 34; i++) {
      const spot = new THREE.Mesh(spotGeo, i % 3 === 0 ? dark : mid);
      const a = i * 2.39;
      const y = 0.35 + (i % 17) * 0.22;
      const radius = y > 3.0 ? 0.66 : 0.86;
      spot.position.set(Math.sin(a) * radius, y, 0.9 + Math.cos(a) * 0.08);
      spot.scale.setScalar(0.55 + (i % 4) * 0.2);
      stone.add(spot);
    }

    stone.position.set(-32.2, 1.2, -24.7);
    stone.rotation.y = 0.22;
    stone.scale.setScalar(0.92);
    this.root.add(stone);
  }

  _buildFoamBands() {
    const defs = [
      [-34, -18, 7.2, 0.18, 0.8, 1.28, 8.5, 0.58],
      [-29, -14, 6.4, 0.17, 1.8, 1.08, 7.5, 0.56],
      [-23, -10, 5.3, 0.15, 2.9, 0.96, 7.0, 0.50],
      [-15, -5, 5.8, 0.13, 0.4, 0.78, 8.0, 0.40],
      [-6, -2, 5.0, 0.12, 2.2, 0.74, 7.0, 0.36],
      [3, 0, 5.7, 0.12, 3.1, 0.70, 7.6, 0.34],
      [14, 2, 5.2, 0.13, 1.3, 0.68, 7.3, 0.36],
      [26, 4, 4.6, 0.11, 2.7, 0.62, 6.6, 0.32],
      [39, 6, 3.6, 0.10, 1.0, 0.58, 6.0, 0.30],
    ];

    for (const [x, z, w, h, phase, speed, loop, alpha] of defs) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xf2ffff,
        transparent: true,
        opacity: alpha,
        depthWrite: false,
        ...FOG_FREE,
      });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(x, 0.96, z);
      strip.userData = { x, z, y: 0.96, phase, speed, loop, alpha, bobZ: 0.34, bobY: 0.06 };
      this.scene.add(strip);
      this.foam.push(strip);
    }

    const shoreDefs = [
      [-37.5, -16.2, 5.4, 0.18, 0.1], [-34.2, -14.5, 4.6, 0.16, 1.4],
      [-31.0, -12.8, 3.8, 0.14, 2.2], [-28.5, -11.5, 3.2, 0.12, 3.0],
    ];
    for (const [x, z, w, h, phase] of shoreDefs) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        ...FOG_FREE,
      });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(x, 1.04, z);
      strip.userData = { x, z, y: 1.04, phase, speed: 0.46, loop: 3.8, alpha: 0.56, bobZ: 0.18, bobY: 0.08 };
      this.scene.add(strip);
      this.foam.push(strip);
    }

    for (let i = 0; i < 36; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        ...FOG_FREE,
      });
      const drop = new THREE.Mesh(new THREE.CircleGeometry(0.06 + (i % 4) * 0.025, 6), mat);
      drop.position.set(-35 + (i % 12) * 0.9, 0.95 + (i % 3) * 0.12, -17 - Math.floor(i / 12) * 2.3);
      drop.rotation.x = -Math.PI / 2;
      drop.userData = {
        x: drop.position.x,
        y: drop.position.y,
        phase: i * 0.67,
        speed: 2.0 + (i % 5) * 0.22,
        lift: 0.4 + (i % 4) * 0.1,
        scale: 1.0,
      };
      this.scene.add(drop);
      this.spray.push(drop);
    }
  }

  _buildCurrentStreaks() {
    const defs = [
      [-38, -9.5, 10.5, 0.045, 0.0, 1.45, 14, 0.20],
      [-24, -7.1, 8.0, 0.04, 1.1, 1.22, 12, 0.16],
      [-10, -4.1, 12.0, 0.05, 2.2, 1.08, 15, 0.18],
      [5, -1.5, 9.0, 0.04, 0.6, 0.96, 12, 0.15],
      [18, 1.3, 11.5, 0.045, 1.8, 0.9, 14, 0.16],
      [33, 4.8, 7.5, 0.035, 2.9, 0.82, 11, 0.14],
    ];

    for (const [x, z, w, h, phase, speed, loop, alpha] of defs) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xdfffff,
        transparent: true,
        opacity: alpha,
        depthWrite: false,
        ...FOG_FREE,
      });
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      streak.rotation.x = -Math.PI / 2;
      streak.rotation.z = -0.04;
      streak.position.set(x, 1.02, z);
      streak.userData = { x, z, y: 1.02, phase, speed, loop, alpha, bobZ: 0.42, bobY: 0.035, pulse: 0.08 };
      this.scene.add(streak);
      this.currents.push(streak);
    }
  }

  _buildSeaGlitter() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xcffff8,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      ...FOG_FREE,
    });
    for (let i = 0; i < 18; i++) {
      const glint = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + (i % 4) * 0.5, 0.035), mat.clone());
      glint.rotation.x = -Math.PI / 2;
      glint.position.set(-28 + i * 4.0, 0.91, -6 + (i % 5) * 2.8);
      glint.userData = { x: glint.position.x, z: glint.position.z, y: 0.91, phase: i * 0.9, speed: 0.35, loop: 18, alpha: 0.12, bobZ: 0.12, bobY: 0.02 };
      this.scene.add(glint);
      this.foam.push(glint);
    }
  }

  _buildPixelCloudBands() {
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34, ...FOG_FREE });
    const placements = [
      [-48, 12.6, -36, 0.016, 1.0], [-18, 10.8, -39, 0.012, 0.72],
      [24, 12.1, -37, 0.014, 0.86], [54, 9.7, -35, 0.01, 0.6],
    ];
    for (const [x, y, z, speed, scale] of placements) {
      const cloud = new THREE.Group();
      for (const [px, py, w, h] of [[0, 0, 5.2, 0.8], [-2.4, -0.2, 2.8, 0.55], [2.3, 0.15, 3.2, 0.65], [0.6, 0.55, 2.4, 0.6]]) {
        const puff = new THREE.Mesh(new THREE.PlaneGeometry(w, h), cloudMat.clone());
        puff.position.set(px, py, 0);
        cloud.add(puff);
      }
      cloud.position.set(x, y, z);
      cloud.scale.setScalar(scale);
      cloud.userData.speed = speed;
      this.root.add(cloud);
      this.cloudBands.push(cloud);
    }
  }

  _shapeMesh(points, color, opacity) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    return new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, ...FOG_FREE }),
    );
  }
}
