// ---------------------------------------------------------------------------
// Ravenhold — 3D renderer.
//
// All models come from the CC0 KayKit packs and are built into
// assets/models/*.glb by tools/build_assets.py:
//   kit.glb      every static prop (towers, keep, trees, rocks) in one file
//   <name>.glb   one skinned character per enemy species
//
// World coordinates: game (x, y) -> scene (x, 0, z = y). Up is +y.
// ---------------------------------------------------------------------------
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  const R = {};
  let T, GLTFLoader, cloneSkinned;
  const W = TD.WORLD.w, H = TD.WORLD.h;
  const PITCH = 52 * Math.PI / 180, FOV = 38;
  const rand = (a, b) => a + Math.random() * (b - a);

  // One KayKit model unit in world units.
  const U = 42;
  // Per-model scale overrides (multiplied by U).
  const SCALE = { keep: 1.5, mountain_a: 2.1, mountain_b: 2.1, mountain_c: 2.1, plot: 0.78, bridge: 1.85 };

  R.setLibs = function (three, loaderCtor, skeletonClone) {
    T = three; GLTFLoader = loaderCtor; cloneSkinned = skeletonClone; window.THREE = three;
  };

  // ---------- init ----------------------------------------------------------
  R.init = function (canvas, level, path) {
    R.level = level; R.path = path;
    R.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    R.mobile = navigator.maxTouchPoints > 1;
    R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    R.renderer.shadowMap.enabled = true;
    R.renderer.shadowMap.type = T.PCFSoftShadowMap;
    R.renderer.toneMapping = T.ACESFilmicToneMapping;
    R.renderer.toneMappingExposure = 1.05;
    R.renderer.outputColorSpace = T.SRGBColorSpace;
    R.scene = new T.Scene();
    R.scene.background = new T.Color(0x9dc4e0);
    R.scene.fog = new T.Fog(0x9dc4e0, 1400, 3200);
    R.camera = new T.PerspectiveCamera(FOV, 1, 20, 8000);
    R.cam = { tx: W / 2, tz: H * 0.62, dist: 700, dMin: 260, dMax: 2400 };
    R.shakeAmt = 0; R.time = 0;
    R.particles = []; R.effects = []; R.floaters = [];
    R.enemyModels = new Map(); R.corpses = []; R.projModels = new Map();
    R.mixers = [];
    initTextures();
    lights();
    R.resize();
  };

  function lights() {
    R.hemi = new T.HemisphereLight(0xcfe4f5, 0x5e7042, 1.15); R.scene.add(R.hemi);
    R.sun = new T.DirectionalLight(0xfff3e0, 2.5); R.sun.castShadow = true;
    const s = R.mobile ? 1536 : 2048;
    R.sun.shadow.mapSize.set(s, s);
    R.sun.shadow.bias = -0.0004; R.sun.shadow.normalBias = 1.5;
    R.sun.shadow.camera.near = 100; R.sun.shadow.camera.far = 3200;
    R.scene.add(R.sun); R.scene.add(R.sun.target);
    R.sunDir = new T.Vector3(-0.42, 1.0, 0.38).normalize();
    R.gateLight = new T.PointLight(0xb060ff, 0, 400, 1.6); R.scene.add(R.gateLight);
  }

  function initTextures() {
    const soft = document.createElement('canvas'); soft.width = soft.height = 64;
    let c = soft.getContext('2d');
    let g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    R.texSoft = new T.CanvasTexture(soft);
    const hard = document.createElement('canvas'); hard.width = hard.height = 32;
    c = hard.getContext('2d'); c.fillStyle = '#fff'; c.beginPath(); c.arc(16, 16, 13, 0, 6.283); c.fill();
    R.texHard = new T.CanvasTexture(hard);
    const fl = document.createElement('canvas'); fl.width = 64; fl.height = 96; c = fl.getContext('2d');
    g = c.createRadialGradient(32, 60, 2, 32, 56, 40);
    g.addColorStop(0, 'rgba(255,245,200,1)'); g.addColorStop(0.35, 'rgba(255,170,50,0.9)');
    g.addColorStop(0.7, 'rgba(255,80,10,0.4)'); g.addColorStop(1, 'rgba(255,40,0,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(32, 2); c.quadraticCurveTo(62, 50, 32, 94); c.quadraticCurveTo(2, 50, 32, 2); c.fill();
    R.texFlame = new T.CanvasTexture(fl);
    const wt = document.createElement('canvas'); wt.width = 256; wt.height = 64; c = wt.getContext('2d');
    const rnd = TD.mulberry32(9);
    for (let i = 0; i < 26; i++) {
      const x = rnd() * 256, y = 8 + rnd() * 48, l = 20 + rnd() * 50;
      c.strokeStyle = 'rgba(255,255,255,' + (0.25 + rnd() * 0.4) + ')';
      c.lineWidth = 2 + rnd() * 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y + (rnd() - 0.5) * 6); c.stroke();
    }
    R.texWater = new T.CanvasTexture(wt); R.texWater.wrapS = R.texWater.wrapT = T.RepeatWrapping;
  }

  // ---------- asset loading --------------------------------------------------
  const CHARACTERS = ['goblin', 'orc', 'rider', 'mage', 'skeleton', 'skeleton_minion', 'skeleton_mage'];

  R.load = function (onProgress) {
    const loader = new GLTFLoader();
    const files = [['kit', 'assets/models/kit.glb']].concat(CHARACTERS.map((n) => [n, 'assets/models/' + n + '.glb']));
    let done = 0;
    R.kit = {}; R.chars = {};
    const one = ([name, url]) => new Promise((res, rej) => {
      loader.load(url, (g) => {
        if (name === 'kit') {
          for (const child of g.scene.children.slice()) { R.kit[child.name] = child; g.scene.remove(child); }
          for (const key in R.kit) {
            R.kit[key].traverse((o) => {
              if (!o.isMesh) return;
              o.castShadow = true; o.receiveShadow = true;
              o.material.roughness = 0.85; o.material.metalness = 0;
              if (o.material.map) o.material.map.anisotropy = 4;
            });
          }
        } else {
          const box = new T.Box3().setFromObject(g.scene);
          R.chars[name] = { scene: g.scene, animations: g.animations, height: box.max.y - box.min.y };
        }
        onProgress && onProgress(++done / files.length);
        res();
      }, undefined, rej);
    });
    return Promise.all(files.map(one)).then(() => { R.buildWorld(); });
  };

  function proto(name) {
    const p = R.kit[name];
    if (!p) { console.warn('missing kit model', name); return new T.Group(); }
    const c = p.clone(true);
    c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return c;
  }
  R.proto = proto;

  // Clone the shared kit material so one instance can be recoloured.
  function tint(obj, hex, rough) {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.color.setHex(hex);
      if (rough != null) o.material.roughness = rough;
    });
    return obj;
  }
  R.tint = tint;

  function place(name, x, z, opts) {
    opts = opts || {};
    const g = new T.Group();
    const m = proto(name);
    const s = (opts.scale || 1) * (SCALE[name] || 1) * U;
    m.scale.setScalar(s);
    g.add(m);
    g.position.set(x, opts.y || 0, z);
    g.rotation.y = opts.ry || 0;
    R.scene.add(g);
    return g;
  }

  // ---------- world ----------------------------------------------------------
  function buildGround(level, path) {
    const scale = Math.min(2, Math.max(1.25, window.devicePixelRatio || 1));
    const gr = TD.buildGround(level, path, scale);
    const tex = new T.CanvasTexture(gr.canvas);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = Math.min(8, R.renderer.capabilities.getMaxAnisotropy());
    const ground = new T.Mesh(new T.PlaneGeometry(W, H), new T.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(W / 2, 0, H / 2);
    ground.receiveShadow = true;
    R.scene.add(ground);
    const skirt = new T.Mesh(new T.PlaneGeometry(W + 5000, H + 5000), new T.MeshStandardMaterial({ color: 0x4e8a45, roughness: 1 }));
    skirt.rotation.x = -Math.PI / 2; skirt.position.set(W / 2, -1.5, H / 2); skirt.receiveShadow = true;
    R.scene.add(skirt);
    return gr.river;
  }

  function buildWater(level, pts) {
    const w = level.riverWidth + 8;
    const pos = [], uv = [], idx = []; let len = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(0, i - 1)];
      const dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
      if (i > 0) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      pos.push(p[0] + nx * w / 2, 1.0, p[1] + ny * w / 2, p[0] - nx * w / 2, 1.0, p[1] - ny * w / 2);
      uv.push(len / 150, 0, len / 150, 1);
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    R.waterMat = new T.MeshStandardMaterial({ color: 0x2eb3e8, map: R.texWater, transparent: true, opacity: 0.8, roughness: 0.18, metalness: 0.05, depthWrite: false });
    R.scene.add(new T.Mesh(geo, R.waterMat));
    R.waterMat2 = new T.MeshStandardMaterial({ color: 0xd6f2ff, map: R.texWater.clone(), transparent: true, opacity: 0.3, roughness: 0.15, depthWrite: false });
    R.waterMat2.map.wrapS = R.waterMat2.map.wrapT = T.RepeatWrapping;
    R.waterMat2.map.repeat.set(0.55, 1);
    const m2 = new T.Mesh(geo, R.waterMat2); m2.position.y = 0.6; R.scene.add(m2);
  }

  function buildWorld_() { /* placeholder kept for clarity */ }

  R.buildWorld = function () {
    const level = R.level, path = R.path;
    const river = buildGround(level, path);
    R.river = river;
    buildWater(level, river);
    scatterNature(level, path, river);
    buildCastle(level.castle);
    buildBlackgate(level.gate);
    // bridge over the river, aligned with the road
    const b = level.bridge;
    place('bridge', b.x, b.y, { ry: Math.PI / 2, y: 0.5 });
    // build plots
    // The stone pad itself is painted into the terrain texture; only the
    // pulsing "buildable" ring lives in the scene.
    R.plots = level.plots.map(([x, z]) => {
      const ringMat = new T.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.3, side: T.DoubleSide, depthWrite: false, toneMapped: false });
      const ring = new T.Mesh(new T.RingGeometry(33, 39, 40), ringMat);
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, 1.6, z);
      R.scene.add(ring);
      return { g: ring, ringMat, x, z, model: null, type: null, level: -1 };
    });
    R.updateShadow();
  };

  function scatterNature(level, path, river) {
    const rnd = TD.mulberry32(4242);
    const c = level.castle;
    const near = (x, y, pts, d) => TD.distToPolyline(x, y, pts) < d;
    const blocked = (x, y, pad) =>
      near(x, y, path.pts, level.roadWidth / 2 + 26 + pad) ||
      near(x, y, river, level.riverWidth / 2 + 22 + pad) ||
      level.plots.some((p) => Math.hypot(x - p[0], y - p[1]) < 72 + pad) ||
      (x > c.x - 200 - pad && x < c.x + 200 + pad && y > c.y - 190 - pad && y < c.y + 140 + pad) ||
      Math.hypot(x - level.gate.x, y - level.gate.y) < 150 + pad;

    // mountain wall along the north edge and down both sides
    const mtn = ['mountain_a', 'mountain_b', 'mountain_c'];
    for (let x = -320; x < W + 320; x += 190 + rnd() * 110) {
      place(mtn[(rnd() * 3) | 0], x, -150 - rnd() * 90, { ry: rnd() * 6.28, scale: 0.75 + rnd() * 0.5, y: -8 });
      if (rnd() < 0.6) place(mtn[(rnd() * 3) | 0], x + rnd() * 120, -360 - rnd() * 220, { ry: rnd() * 6.28, scale: 1.0 + rnd() * 0.7, y: -8 });
    }
    for (let z = -120; z < H + 340; z += 250 + rnd() * 140) {
      for (const side of [-1, 1]) {
        const x = side < 0 ? -250 - rnd() * 170 : W + 250 + rnd() * 170;
        place(mtn[(rnd() * 3) | 0], x, z, { ry: rnd() * 6.28, scale: 0.7 + rnd() * 0.6, y: -8 });
      }
    }

    // forest
    const clusters = ['trees_a_small', 'trees_a_med', 'trees_a_large', 'trees_b_small', 'trees_b_med', 'trees_b_large'];
    const singles = ['tree_a', 'tree_b'];
    const spots = [];
    const tryPlace = (x, y, r) => {
      if (x < 20 || y < 60 || x > W - 20 || y > H - 20) return false;
      if (blocked(x, y, 6)) return false;
      for (const s of spots) if (Math.hypot(s[0] - x, s[1] - y) < (s[2] + r)) return false;
      spots.push([x, y, r]); return true;
    };
    const patches = [[120, 1450, 150], [880, 1500, 130], [900, 160, 120], [470, 1010, 80], [60, 1120, 90],
      [880, 480, 110], [660, 640, 80], [150, 780, 70], [820, 900, 70], [330, 640, 60]];
    for (const [px, py, pr] of patches) {
      for (let i = 0; i < 22; i++) {
        const a = rnd() * 6.283, d = Math.sqrt(rnd()) * pr;
        const x = px + Math.cos(a) * d, y = py + Math.sin(a) * d;
        if (tryPlace(x, y, 46)) place(clusters[(rnd() * clusters.length) | 0], x, y, { ry: rnd() * 6.28, scale: 0.75 + rnd() * 0.4 });
      }
    }
    for (let i = 0; i < 170; i++) {
      const x = rnd() * W, y = rnd() * H;
      if (tryPlace(x, y, 34)) place(singles[(rnd() * 2) | 0], x, y, { ry: rnd() * 6.28, scale: 0.7 + rnd() * 0.5 });
    }
    // ring of trees beyond the playfield so the edges read as forest
    for (let i = 0; i < 150; i++) {
      let x, y;
      if (rnd() < 0.55) { x = rnd() < 0.5 ? -30 - rnd() * 190 : W + 30 + rnd() * 190; y = rnd() * (H + 260) - 60; }
      else { x = rnd() * W; y = H + 30 + rnd() * 220; }
      place(rnd() < 0.5 ? clusters[(rnd() * clusters.length) | 0] : singles[(rnd() * 2) | 0], x, y, { ry: rnd() * 6.28, scale: 0.8 + rnd() * 0.5 });
    }
    // rocks and stumps
    const rocks = ['rock_a', 'rock_b', 'rock_c', 'rock_d', 'rock_e'];
    for (let i = 0; i < 60; i++) {
      const x = rnd() * W, y = 80 + rnd() * (H - 90);
      if (blocked(x, y, -12)) continue;
      place(rocks[(rnd() * rocks.length) | 0], x, y, { ry: rnd() * 6.28, scale: 0.7 + rnd() * 0.9 });
    }
    for (let i = 0; i < 14; i++) {
      const x = rnd() * W, y = 80 + rnd() * (H - 90);
      if (blocked(x, y, -6)) continue;
      place('stump_a', x, y, { ry: rnd() * 6.28, scale: 0.8 });
    }
    // reeds along the river
    for (let i = 4; i < river.length - 4; i += 7) {
      const p = river[i], q = river[i + 1];
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
      for (const side of [-1, 1]) {
        if (rnd() < 0.45) continue;
        const o = level.riverWidth / 2 + 6 + rnd() * 10;
        place(rnd() < 0.6 ? 'waterplant_a' : 'waterlily_a', p[0] - dy / l * o * side, p[1] + dx / l * o * side, { ry: rnd() * 6.28, scale: 0.8 + rnd() * 0.6, y: 1 });
      }
    }
  }

  function buildCastle(c) {
    place('keep', c.x, c.y + 6, { ry: Math.PI });
    // curtain wall with a gate facing the road (north)
    const halfW = 190, zN = c.y - 150, zS = c.y + 140;
    const step = 2.0 * U;
    for (let x = -halfW + step / 2; x < halfW; x += step) {
      if (Math.abs(x) < step * 0.75) place('wall_gate', c.x + x, zN, { ry: 0 });
      else place('wall', c.x + x, zN, { ry: 0 });
      place('wall', c.x + x, zS, { ry: 0 });
    }
    for (let z = zN + step / 2; z < zS; z += step) {
      place('wall', c.x - halfW, z, { ry: Math.PI / 2 });
      place('wall', c.x + halfW, z, { ry: Math.PI / 2 });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      place('wall_corner', c.x + sx * halfW, sz < 0 ? zN : zS, { ry: (sx > 0 ? 0 : Math.PI / 2) + (sz > 0 ? -Math.PI / 2 : 0) });
    }
    // dressing
    place('tent', c.x - 130, c.y + 40, { ry: 0.4, scale: 1.1 });
    place('tent', c.x + 130, c.y + 55, { ry: -0.6, scale: 1.1 });
    place('crate', c.x - 90, c.y + 90, { ry: 0.3 });
    place('barrel', c.x + 96, c.y + 96, { ry: 0.9 });
    place('weaponrack', c.x - 150, c.y - 60, { ry: 1.2 });
    place('lumber', c.x + 150, c.y - 40, { ry: -0.4 });
    R.torches = [[c.x - 46, 28, zN - 14], [c.x + 46, 28, zN - 14]];
    R.torchSprites = R.torches.map((p) => {
      const s = new T.Sprite(new T.SpriteMaterial({ map: R.texFlame, color: 0xffb060, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      s.position.set(p[0], p[1], p[2]); s.scale.set(16, 26, 1); R.scene.add(s); return s;
    });
    R.keepLight = new T.PointLight(0xffb060, 1800, 420, 2); R.keepLight.position.set(c.x, 50, zN - 30); R.scene.add(R.keepLight);
  }

  function buildBlackgate(gt) {
    const dark = (g) => tint(g, 0x9a8ea8, 1.0);
    dark(place('ruin', gt.x + 34, gt.y, { ry: -Math.PI / 2, scale: 1.7 }));
    dark(place('wall', gt.x + 30, gt.y - 84, { ry: Math.PI / 2, scale: 1.3 }));
    dark(place('wall', gt.x + 30, gt.y + 84, { ry: Math.PI / 2, scale: 1.3 }));
    dark(place('rock_e', gt.x + 104, gt.y - 74, { scale: 1.7 }));
    dark(place('rock_c', gt.x + 96, gt.y + 82, { scale: 1.5 }));
    const portal = new T.Mesh(new T.PlaneGeometry(92, 104),
      new T.MeshBasicMaterial({ color: 0x2c0a4a, side: T.DoubleSide, transparent: true, opacity: 0.9, toneMapped: false }));
    portal.position.set(gt.x + 10, 52, gt.y); portal.rotation.y = Math.PI / 2; R.scene.add(portal);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: R.texSoft, color: 0x8a35e0, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    glow.position.set(gt.x + 16, 52, gt.y); glow.scale.set(200, 200, 1); R.scene.add(glow); R.portalGlow = glow;
    R.gateLight.position.set(gt.x + 40, 70, gt.y);
    R.gateLight.distance = 320; R.gateLight.intensity = 1400;
  }

  // ---------- towers ---------------------------------------------------------
  R.makeTower = function (type, lv) {
    const g = new T.Group();
    const m = proto('tower_' + type + '_' + (lv + 1));
    m.scale.setScalar(U * (1 + lv * 0.04));
    g.add(m);
    g.userData = {};
    if (type === 'catapult') {
      // the catapult tower ships a separate turret and arm node: aim and swing them
      const turret = new T.Group();
      const parts = [];
      m.traverse((o) => { if (/catapult_(turret|arm)/.test(o.name)) parts.push(o); });
      for (const p of parts) { m.remove(p); turret.add(p); if (/arm/.test(p.name)) g.userData.arm = p; }
      turret.scale.setScalar(U * (1 + lv * 0.04));
      g.add(turret); g.userData.turret = turret;
      if (g.userData.arm) g.userData.armRest = g.userData.arm.rotation.x;
      // extra tiers get banners and gear so the upgrade reads without a colour change
      if (lv >= 1) { const f = proto('flag_red'); f.scale.setScalar(U * 0.9); f.position.set(26, 0, 20); g.add(f); }
      if (lv >= 2) {
        const f = proto('flag_red'); f.scale.setScalar(U * 0.9); f.position.set(-26, 0, 22); f.rotation.y = 0.6; g.add(f);
        const c2 = proto('stone_pile'); c2.scale.setScalar(U * 0.9); c2.position.set(30, 0, -22); g.add(c2);
      }
    }
    if (type === 'archer' && lv >= 1) { const t = proto('target'); t.scale.setScalar(U * 0.9); t.position.set(-28, 0, 24); t.rotation.y = 0.5; g.add(t); }
    if (type === 'ballista' && lv >= 1) { const t = proto('weaponrack'); t.scale.setScalar(U * 0.9); t.position.set(28, 0, 22); t.rotation.y = -0.5; g.add(t); }
    if (type === 'mage' && lv >= 1) {
      const colors = [0x5fc8ff, 0xb07cff, 0xffffff][lv];
      const orb = new T.Mesh(new T.OctahedronGeometry(7 + lv * 2, 0), new T.MeshStandardMaterial({ color: colors, emissive: colors, emissiveIntensity: 1.4, roughness: 0.2, flatShading: true }));
      orb.position.y = 118 + lv * 14; g.add(orb); g.userData.orb = orb;
      const glow = new T.Sprite(new T.SpriteMaterial({ map: R.texSoft, color: colors, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.4 }));
      glow.position.y = orb.position.y; glow.scale.set(70, 70, 1); g.add(glow); g.userData.glow = glow;
    }
    return g;
  };

  R.towerHeight = function (type, lv) {
    const key = 'tower_' + type + '_' + (lv + 1);
    const p = R.kit[key];
    if (!p) return 90;
    const box = new T.Box3().setFromObject(p);
    return (box.max.y - box.min.y) * U * (1 + lv * 0.04);
  };

  R.syncTowers = function (towers, time) {
    towers.forEach((t, i) => {
      const plot = R.plots[i];
      if (!plot) return;
      if (!t) {
        if (plot.model) { R.scene.remove(plot.model); plot.model = null; plot.level = -1; plot.type = null; }
        return;
      }
      if (!plot.model || plot.level !== t.level || plot.type !== t.type) {
        if (plot.model) R.scene.remove(plot.model);
        plot.model = R.makeTower(t.type, t.level);
        plot.model.position.set(t.x, 2, t.y);
        plot.level = t.level; plot.type = t.type;
        R.scene.add(plot.model);
      }
      const ud = plot.model.userData;
      if (ud.turret) {
        ud.turret.rotation.y = Math.atan2(Math.cos(t.angle), Math.sin(t.angle)) + Math.PI;
        if (ud.arm) {
          const ft = t.fireT == null ? 9 : t.fireT;
          const swing = ft < 0.22 ? 1 - ft / 0.22 : ft < 1.3 ? Math.max(0, (ft - 0.22) / 1.08) * 0 : 0;
          ud.arm.rotation.x = ud.armRest - swing * 1.5;
        }
      }
      if (ud.orb) {
        ud.orb.rotation.y = time * 1.6;
        ud.orb.position.y += (Math.sin(time * 2 + i) * 3 - (ud.orb.position.y - ud.orbBase || 0)) * 0;
        ud.glow.material.opacity = 0.32 + Math.sin(time * 5 + i) * 0.1;
      }
    });
  };

  // ---------- enemies --------------------------------------------------------
  R.makeEnemy = function (def) {
    const src = R.chars[def.model];
    if (!src) return { root: new T.Group(), mixer: null, actions: {} };
    const root = cloneSkinned(src.scene);
    const scale = def.h / src.height;
    root.scale.setScalar(scale);
    const mats = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = false;
      o.frustumCulled = false;
      o.material = o.material.clone();
      if (def.tint) o.material.color.setHex(def.tint);
      o.material.emissive = new T.Color(0xffffff);
      o.material.emissiveIntensity = 0;
      mats.push(o.material);
    });
    const mixer = new T.AnimationMixer(root);
    const actions = {};
    for (const clip of src.animations) actions[clip.name] = mixer.clipAction(clip);
    return { root, mixer, actions, mats, scale };
  };

  R.syncEnemies = function (enemies, time, dt) {
    const seen = new Set();
    for (const e of enemies) {
      seen.add(e.id);
      let m = R.enemyModels.get(e.id);
      if (!m) {
        m = R.makeEnemy(e.def);
        const loop = m.actions[e.def.anim] || m.actions.walk;
        if (loop) { loop.reset(); loop.timeScale = 0.9 + Math.random() * 0.25; loop.play(); m.loop = loop; }
        const bw = e.def.boss ? 56 : Math.max(22, Math.min(40, e.def.size * 1.9));
        const bar = new T.Group();
        const bg = new T.Mesh(new T.PlaneGeometry(bw + 3, 6), new T.MeshBasicMaterial({ color: 0x14100e, transparent: true, opacity: 0.8, depthTest: false, toneMapped: false }));
        const fill = new T.Mesh(new T.PlaneGeometry(bw, 4), new T.MeshBasicMaterial({ color: 0x74d35a, depthTest: false, toneMapped: false }));
        fill.position.z = 0.2; bar.add(bg); bar.add(fill);
        bg.renderOrder = 10; fill.renderOrder = 11; bar.visible = false;
        R.scene.add(bar);
        const ice = new T.Mesh(new T.IcosahedronGeometry(e.def.size * 1.25, 1), new T.MeshStandardMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.38, roughness: 0.1, flatShading: true }));
        ice.position.y = e.def.h * 0.5; ice.scale.y = e.def.h / (e.def.size * 2.5); ice.visible = false;
        const fire = new T.Sprite(new T.SpriteMaterial({ map: R.texFlame, color: 0xffa040, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
        fire.scale.set(e.def.size * 1.4, e.def.h * 0.9, 1); fire.position.y = e.def.h * 0.7; fire.visible = false;
        m.bar = bar; m.fill = fill; m.bw = bw; m.ice = ice; m.fire = fire;
        R.scene.add(ice); R.scene.add(fire);
        R.scene.add(m.root);
        R.enemyModels.set(e.id, m);
      }
      m.root.position.set(e.x, 0, e.y);
      m.root.rotation.y = Math.atan2(e.dx, e.dy);
      const slow = e.slowT > 0 ? 1 - e.slowAmt : 1;
      if (m.loop) m.loop.timeScale = (m.loop.userData_base || 1) * Math.max(0.15, slow);
      if (m.mixer) m.mixer.update(dt * Math.max(0.15, slow));
      const flash = e.hitT > 0 ? Math.min(1, e.hitT * 7) * 0.8 : 0;
      for (const mt of m.mats) if (mt.emissiveIntensity !== flash) mt.emissiveIntensity = flash;
      m.ice.visible = e.slowT > 0;
      if (m.ice.visible) m.ice.position.set(e.x, e.def.h * 0.5, e.y);
      m.fire.visible = e.burnT > 0;
      if (m.fire.visible) {
        m.fire.position.set(e.x, e.def.h * 0.7, e.y);
        m.fire.scale.set(e.def.size * (1.3 + Math.sin(time * 20) * 0.2), e.def.h * (0.9 + Math.sin(time * 17) * 0.12), 1);
      }
      if (e.hp < e.maxHp) {
        m.bar.visible = true;
        m.bar.position.set(e.x, e.def.h + 14, e.y);
        m.bar.quaternion.copy(R.camera.quaternion);
        const f = Math.max(0, e.hp / e.maxHp);
        m.fill.scale.x = f; m.fill.position.x = -m.bw * (1 - f) / 2;
        m.fill.material.color.setHex(f > 0.5 ? 0x74d35a : f > 0.25 ? 0xe8bd5c : 0xd9483b);
      }
    }
    for (const [id, m] of R.enemyModels) if (!seen.has(id)) removeEnemy(id, m);
    // corpses
    for (const c of R.corpses) {
      c.age += dt;
      c.mixer.update(dt);
      if (c.age > c.dur) {
        const k = Math.min(1, (c.age - c.dur) / 1.2);
        c.root.position.y = -k * 34;
        for (const mt of c.mats) { mt.transparent = true; mt.opacity = 1 - k; }
      }
    }
    R.corpses = R.corpses.filter((c) => {
      if (c.age > c.dur + 1.25) { R.scene.remove(c.root); return false; }
      return true;
    });
  };

  function removeEnemy(id, m) {
    R.scene.remove(m.bar); R.scene.remove(m.ice); R.scene.remove(m.fire);
    R.scene.remove(m.root);
    R.enemyModels.delete(id);
  }

  // Called by the game when an enemy is killed (not when it reaches the keep):
  // detach the model and let the death animation play out.
  R.killEnemy = function (e) {
    const m = R.enemyModels.get(e.id);
    if (!m) return;
    R.scene.remove(m.bar); R.scene.remove(m.ice); R.scene.remove(m.fire);
    R.enemyModels.delete(e.id);
    const die = m.actions.die;
    if (!die || R.corpses.length > 14) { R.scene.remove(m.root); return; }
    if (m.loop) m.loop.stop();
    for (const mt of m.mats) mt.emissiveIntensity = 0;
    die.reset(); die.setLoop(T.LoopOnce, 1); die.clampWhenFinished = true; die.play();
    R.corpses.push({ root: m.root, mixer: m.mixer, mats: m.mats, age: 0, dur: die.getClip().duration + 1.4 });
  };

  // ---------- projectiles ----------------------------------------------------
  R.makeProjectile = function (p) {
    if (p.kind === 'arrow' || p.kind === 'bolt') {
      const g = new T.Group();
      const m = proto(p.kind === 'bolt' ? 'crossbow_bolt' : 'arrow');
      m.scale.setScalar(U * (p.kind === 'bolt' ? 0.85 : 0.7));
      m.rotation.x = Math.PI / 2; // model points up the Y axis; lay it along +Z
      g.add(m);
      return g;
    }
    if (p.kind === 'orb') {
      const g = new T.Group();
      const c = new T.Color(p.color[0]);
      g.add(new T.Mesh(new T.IcosahedronGeometry(4, 1), new T.MeshBasicMaterial({ color: 0xffffff })));
      const sp = new T.Sprite(new T.SpriteMaterial({ map: R.texSoft, color: c, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      sp.scale.set(38, 38, 1); g.add(sp);
      return g;
    }
    if (p.kind === 'stone') {
      const m = proto('projectile_stone');
      m.scale.setScalar(U * 0.55);
      const g = new T.Group(); g.add(m); return g;
    }
    return new T.Group();
  };

  R.syncProjectiles = function (projectiles) {
    const seen = new Set();
    for (const p of projectiles) {
      seen.add(p);
      let m = R.projModels.get(p);
      if (!m) { m = R.makeProjectile(p); R.scene.add(m); R.projModels.set(p, m); }
      const y = (p.h == null ? 30 : p.h) + (p.height || 0);
      const prev = m.position.clone();
      m.position.set(p.x, y, p.y);
      if (p.kind === 'arrow' || p.kind === 'bolt') {
        if (prev.distanceToSquared(m.position) > 0.01) m.lookAt(m.position.clone().add(m.position.clone().sub(prev)));
      }
      if (p.kind === 'stone') { m.rotation.x += 0.18; m.rotation.z += 0.11; }
      if (p.kind === 'orb' && Math.random() < 0.6) {
        R.spawnParticle({ x: p.x, y, z: p.y, vx: rand(-15, 15), vy: rand(-10, 10), vz: rand(-15, 15), life: 0.35, size: rand(4, 8), type: 'spark', color: p.color[0], g: 0 });
      }
    }
    for (const [p, m] of R.projModels) if (!seen.has(p)) { R.scene.remove(m); R.projModels.delete(p); }
  };

  // ---------- particles ------------------------------------------------------
  const PTYPE = {
    spark: { tex: 'soft', add: true }, ember: { tex: 'soft', add: true }, wisp: { tex: 'soft', add: true },
    smoke: { tex: 'soft', add: false, grow: 2.2, alpha: 0.45 }, fog: { tex: 'soft', add: false, grow: 1.6, alpha: 0.3 },
    blood: { tex: 'hard', add: false }, debris: { tex: 'hard', add: false },
    leaf: { tex: 'hard', add: false, alpha: 0.7 }, snow: { tex: 'soft', add: false, alpha: 0.9 },
  };
  R.spawnParticle = function (p) {
    if (R.particles.length > 460) { const old = R.particles.shift(); R.scene.remove(old.s); old.s.material.dispose(); }
    const t = PTYPE[p.type] || PTYPE.spark;
    const s = new T.Sprite(new T.SpriteMaterial({
      map: t.tex === 'hard' ? R.texHard : R.texSoft, color: p.color || 0xffffff,
      transparent: true, blending: t.add ? T.AdditiveBlending : T.NormalBlending,
      depthWrite: false, opacity: t.alpha || 1,
    }));
    s.position.set(p.x, p.y, p.z); s.scale.set(p.size, p.size, 1); s.renderOrder = 5;
    p.s = s; p.age = 0; p.t = t; R.scene.add(s); R.particles.push(p);
  };
  R.burst = function (x, z, n, o) {
    const hard = (PTYPE[o.type] || PTYPE.spark).tex === 'hard';
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.283), sp = rand(o.speed[0], o.speed[1]) * (o.flat ? 1 : 0.8), up = o.up || 0;
      R.spawnParticle({
        x, y: o.y || 4, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp,
        vy: rand(up * 0.4, up * 1.3) + (o.flat ? 0 : rand(0, 20)),
        life: rand(o.life[0], o.life[1]), size: rand(o.size[0], o.size[1]) * (hard ? 1.2 : 2.2),
        type: o.type, color: o.color, g: o.g || 0,
      });
    }
  };
  function updateParticles(dt) {
    for (const p of R.particles) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= (p.g || 0) * dt;
      if (p.t.grow) { p.vx *= 0.97; p.vz *= 0.97; p.vy *= 0.97; }
      if (p.y < 1 && (p.type === 'blood' || p.type === 'debris')) { p.y = 1; p.vx = p.vz = p.vy = 0; }
      const k = p.age / p.life;
      const sz = p.size * (p.t.grow ? 0.5 + k * p.t.grow : (p.type === 'spark' || p.type === 'ember' ? 1 - k * 0.6 : 1));
      p.s.position.set(p.x, p.y, p.z); p.s.scale.set(sz, sz, 1);
      p.s.material.opacity = (p.t.alpha || 1) * (p.type === 'leaf' || p.type === 'snow' ? Math.sin(k * Math.PI) : 1 - k);
    }
    R.particles = R.particles.filter((p) => {
      if (p.age >= p.life) { R.scene.remove(p.s); p.s.material.dispose(); return false; }
      return true;
    });
  }

  // ---------- effects & floaters --------------------------------------------
  function ringMesh(r, color, width) {
    const m = new T.Mesh(new T.RingGeometry(1 - (width || 0.12), 1, 48),
      new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 2.5; m.scale.set(r, r, 1);
    return m;
  }
  R.ring = function (x, z, r0, r1, dur, color, width) {
    const m = ringMesh(r0, color || 0xffdc96, width ? width / 40 : 0.1);
    m.position.x = x; m.position.z = z; R.scene.add(m);
    R.effects.push({ kind: 'ring', m, r0, r1, dur, age: 0 });
  };
  R.effect = function (fx) {
    fx.age = 0;
    if (fx.kind === 'meteor') {
      fx.streaks = fx.streaks.map((s) => {
        const g = new T.Group();
        const rod = new T.Mesh(new T.CylinderGeometry(2.5, 0.5, 90, 6),
          new T.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
        rod.position.y = 45; g.add(rod);
        const head = new T.Sprite(new T.SpriteMaterial({ map: R.texSoft, color: 0xffe0a0, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
        head.scale.set(40, 40, 1); g.add(head); g.visible = false; R.scene.add(g);
        return Object.assign(s, { g });
      });
    } else if (fx.kind === 'firepatch') {
      const s = new T.Sprite(new T.SpriteMaterial({ map: R.texFlame, color: 0xffa040, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      s.position.set(fx.x, fx.r * 1.2, fx.y); s.scale.set(fx.r * 2.2, fx.r * 3.6, 1); R.scene.add(s); fx.s = s;
      const sc = new T.Mesh(new T.CircleGeometry(fx.r * 1.6, 12), new T.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: 0.6, depthWrite: false }));
      sc.rotation.x = -Math.PI / 2; sc.position.set(fx.x, 1.2, fx.y); R.scene.add(sc); fx.sc = sc;
    } else if (fx.kind === 'frostwave') {
      fx.m = ringMesh(60, 0xcfefff, 0.15); fx.m.position.set(fx.x, 3, fx.y); R.scene.add(fx.m);
    } else if (fx.kind === 'flash') {
      const s = new T.Sprite(new T.SpriteMaterial({ map: R.texSoft, color: fx.color || 0xffd090, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      s.position.set(fx.x, fx.h || 10, fx.y); s.scale.set(fx.r * 2.4, fx.r * 2.4, 1); R.scene.add(s); fx.s = s;
    }
    R.effects.push(fx);
  };
  function updateEffects(dt, time) {
    for (const fx of R.effects) {
      fx.age += dt; const k = Math.min(1, fx.age / fx.dur);
      if (fx.kind === 'ring') { const r = fx.r0 + (fx.r1 - fx.r0) * k; fx.m.scale.set(r, r, 1); fx.m.material.opacity = 1 - k; }
      else if (fx.kind === 'meteor') {
        for (const s of fx.streaks) {
          const t = Math.min(1, Math.max(0, (fx.age - s.delay) / (fx.dur - s.delay)));
          if (t <= 0) continue;
          s.g.visible = t < 1;
          const ex = fx.x + s.ox, ez = fx.y + s.oy, sx = ex + 260, sy = 900, sz = ez + 380;
          s.g.position.set(sx + (ex - sx) * t, sy * (1 - t), sz + (ez - sz) * t);
          s.g.lookAt(sx, sy, sz); s.g.rotateX(Math.PI / 2);
        }
      } else if (fx.kind === 'firepatch') {
        fx.s.scale.set(fx.r * (2 + Math.sin(time * 19 + fx.x) * 0.4) * (1 - k * 0.5), fx.r * (3.6 + Math.sin(time * 23 + fx.y) * 0.6) * (1 - k * 0.5), 1);
        fx.s.material.opacity = 1 - k * k; fx.sc.material.opacity = 0.6 * (1 - k);
        if (Math.random() < dt * 5) {
          R.spawnParticle({ x: fx.x + rand(-fx.r, fx.r), y: 6, z: fx.y + rand(-fx.r, fx.r), vx: rand(-8, 8), vy: rand(25, 50), vz: rand(-8, 8), life: rand(0.5, 1), size: rand(3, 6), type: 'ember', color: 0xffb347, g: 0 });
        }
      } else if (fx.kind === 'frostwave') { const r = 60 + k * 1400; fx.m.scale.set(r, r, 1); fx.m.material.opacity = 0.6 * (1 - k); }
      else if (fx.kind === 'flash') { fx.s.material.opacity = 1 - k; fx.s.scale.set(fx.r * (2.4 + k * 2), fx.r * (2.4 + k * 2), 1); }
    }
    R.effects = R.effects.filter((fx) => {
      if (fx.age >= fx.dur) {
        if (fx.m) R.scene.remove(fx.m);
        if (fx.s) R.scene.remove(fx.s);
        if (fx.sc) R.scene.remove(fx.sc);
        if (fx.streaks) fx.streaks.forEach((s) => R.scene.remove(s.g));
        return false;
      }
      return true;
    });
  }
  const textCache = new Map();
  function textTexture(text, color, size) {
    const key = text + '|' + color + '|' + size;
    if (textCache.has(key)) return textCache.get(key);
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.font = '700 ' + (size * 3) + 'px Cinzel, Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(text, 128, 48);
    ctx.fillStyle = color; ctx.fillText(text, 128, 48);
    const t = new T.CanvasTexture(c); textCache.set(key, t); return t;
  }
  R.floater = function (x, z, text, color, size) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: textTexture(text, color || '#e8bd5c', size || 14), transparent: true, depthTest: false, toneMapped: false }));
    s.scale.set(44, 16.5, 1); s.position.set(x, 46, z); s.renderOrder = 20;
    R.scene.add(s); R.floaters.push({ s, age: 0, life: 1.1 });
  };
  function updateFloaters(dt) {
    for (const f of R.floaters) { f.age += dt; f.s.position.y += 30 * dt; f.s.material.opacity = 1 - Math.pow(f.age / f.life, 2); }
    R.floaters = R.floaters.filter((f) => {
      if (f.age >= f.life) { R.scene.remove(f.s); f.s.material.dispose(); return false; }
      return true;
    });
  }

  // ---------- selection / hints ---------------------------------------------
  R.setSelection = function (sel) {
    for (const k of ['selRing', 'selMin', 'selDisc']) if (R[k]) { R.scene.remove(R[k]); R[k] = null; }
    if (!sel) return;
    R.selRing = ringMesh(sel.range, 0xffe08a, 0.018); R.selRing.position.set(sel.x, 3, sel.y); R.scene.add(R.selRing);
    R.selDisc = new T.Mesh(new T.CircleGeometry(sel.range, 56), new T.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.09, depthWrite: false, toneMapped: false }));
    R.selDisc.rotation.x = -Math.PI / 2; R.selDisc.position.set(sel.x, 2.6, sel.y); R.scene.add(R.selDisc);
    if (sel.minRange) { R.selMin = ringMesh(sel.minRange, 0xe05a44, 0.04); R.selMin.position.set(sel.x, 3.2, sel.y); R.scene.add(R.selMin); }
  };
  R.setSpellHint = function (h) {
    if (!h) { if (R.hint) { R.scene.remove(R.hint); R.hint = null; } return; }
    if (!R.hint) { R.hint = ringMesh(h.r, 0xff9a3a, 0.05); R.hint.material.opacity = 0.85; R.scene.add(R.hint); }
    R.hint.position.set(h.x, 3.5, h.y); R.hint.scale.set(h.r, h.r, 1);
  };
  R.setPlotStates = function (towers, selectedPlot, time) {
    if (!R.plots) return;
    R.plots.forEach((p, i) => {
      const empty = !towers[i];
      p.ringMat.opacity = !empty ? 0 : (selectedPlot === i ? 0.95 : 0.25 + Math.sin(time * 2.5 + i) * 0.12);
    });
  };

  // ---------- camera ---------------------------------------------------------
  R.resize = function () {
    const vw = window.innerWidth, vh = window.innerHeight;
    R.vw = vw; R.vh = vh;
    R.renderer.setSize(vw, vh, false);
    R.camera.aspect = vw / vh; R.camera.updateProjectionMatrix();
    const tanF = Math.tan(FOV / 2 * Math.PI / 180);
    R.cam.dMax = Math.max(W * 1.1 / (2 * tanF * R.camera.aspect), H * 1.02 * Math.sin(PITCH) / (2 * tanF));
    R.cam.dMin = 240;
    R.clampCam(); R.updateShadow();
  };
  R.visibleWidth = function () { return 2 * R.cam.dist * Math.tan(FOV / 2 * Math.PI / 180) * R.camera.aspect; };
  R.fitInitial = function () {
    R.cam.dist = Math.min(R.cam.dMax, Math.max(R.cam.dMin, 560 / (2 * Math.tan(FOV / 2 * Math.PI / 180) * R.camera.aspect)));
    R.cam.tx = W / 2; R.cam.tz = H * 0.62; R.clampCam();
  };
  R.fitMap = function () { R.cam.dist = R.cam.dMax; R.cam.tx = W / 2; R.cam.tz = H / 2 + 20; R.clampCam(); };
  R.clampCam = function () {
    const c = R.cam;
    c.dist = Math.max(c.dMin, Math.min(c.dMax, c.dist));
    const vw = R.visibleWidth(), vd = vw / R.camera.aspect / Math.sin(PITCH), m = 40;
    c.tx = vw >= W + m * 2 ? W / 2 : Math.max(vw / 2 - m, Math.min(W - vw / 2 + m, c.tx));
    c.tz = vd >= H + m * 2 ? H / 2 : Math.max(vd / 2 - m, Math.min(H - vd / 2 + m, c.tz));
    R.applyCamera();
  };
  R.applyCamera = function () {
    const c = R.cam;
    const sx = R.shakeAmt > 0 ? rand(-1, 1) * R.shakeAmt : 0;
    const sz = R.shakeAmt > 0 ? rand(-1, 1) * R.shakeAmt : 0;
    R.camera.position.set(c.tx + sx, c.dist * Math.sin(PITCH), c.tz + c.dist * Math.cos(PITCH) + sz);
    R.camera.lookAt(c.tx + sx, 0, c.tz + sz);
  };
  R.updateShadow = function () {
    const half = Math.min(1400, R.visibleWidth() * 0.95);
    const sc = R.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix();
  };
  R.pan = function (dx, dy) {
    const sc = R.visibleWidth() / R.vw;
    R.cam.tx -= dx * sc; R.cam.tz -= dy * sc / Math.sin(PITCH); R.clampCam();
  };
  R.zoomAt = function (factor, sx, sy) {
    const before = R.screenToWorld(sx, sy);
    R.cam.dist = Math.max(R.cam.dMin, Math.min(R.cam.dMax, R.cam.dist / factor));
    R.applyCamera();
    const after = R.screenToWorld(sx, sy);
    if (before && after) { R.cam.tx += before.x - after.x; R.cam.tz += before.y - after.y; }
    R.clampCam(); R.updateShadow();
  };
  const ray = {};
  R.screenToWorld = function (sx, sy) {
    if (!ray.rc) { ray.rc = new T.Raycaster(); ray.plane = new T.Plane(new T.Vector3(0, 1, 0), 0); ray.v = new T.Vector3(); }
    ray.rc.setFromCamera({ x: sx / R.vw * 2 - 1, y: -(sy / R.vh) * 2 + 1 }, R.camera);
    const hit = ray.rc.ray.intersectPlane(ray.plane, ray.v);
    return hit ? { x: hit.x, y: hit.z } : null;
  };
  R.worldToScreen = function (x, h, z) {
    const v = new T.Vector3(x, h, z).project(R.camera);
    return { x: (v.x + 1) / 2 * R.vw, y: (1 - v.y) / 2 * R.vh, behind: v.z > 1 };
  };
  R.shake = function (s) { R.shakeAmt = Math.max(R.shakeAmt, s); };

  // ---------- frame ----------------------------------------------------------
  R.render = function (dt, time) {
    R.time = time;
    if (R.shakeAmt > 0) R.shakeAmt = Math.max(0, R.shakeAmt - dt * 30);
    R.applyCamera();
    R.scene.fog.near = R.cam.dist * 1.7; R.scene.fog.far = R.cam.dist * 3.6;
    R.sun.position.copy(R.sunDir).multiplyScalar(1000).add(new T.Vector3(R.cam.tx, 0, R.cam.tz));
    R.sun.target.position.set(R.cam.tx, 0, R.cam.tz); R.sun.target.updateMatrixWorld();
    if (R.waterMat) { R.waterMat.map.offset.x -= dt * 0.1; R.waterMat2.map.offset.x -= dt * 0.17; }
    if (R.torchSprites) R.torchSprites.forEach((s, i) => {
      const f = 0.85 + Math.sin(time * 13 + i) * 0.12 + Math.sin(time * 29 + i * 2) * 0.06;
      s.scale.set(16 * f, 26 * f, 1);
    });
    if (R.keepLight) R.keepLight.intensity = 1800 + Math.sin(time * 11) * 450;
    R.gateLight.intensity = 1200 + Math.sin(time * 3) * 350;
    if (R.portalGlow) { const f = 0.8 + Math.sin(time * 2.2) * 0.16; R.portalGlow.scale.set(190 * f, 190 * f, 1); }
    if (R.selRing) R.selRing.rotation.z = time * 0.4;
    updateParticles(dt); updateEffects(dt, time); updateFloaters(dt);
    if (Math.random() < dt * 2) {
      R.spawnParticle({ x: rand(R.cam.tx - 400, R.cam.tx + 400), y: rand(10, 70), z: rand(R.cam.tz - 500, R.cam.tz + 300), vx: rand(8, 25), vy: rand(-6, 2), vz: rand(5, 15), life: rand(3, 6), size: rand(2, 5), type: 'leaf', color: 0xd8cf6a, g: 0 });
    }
    if (Math.random() < dt * 4) {
      const g = R.level.gate;
      R.spawnParticle({ x: g.x + rand(-5, 34), y: rand(4, 40), z: g.y + rand(-46, 46), vx: rand(5, 24), vy: rand(2, 9), vz: rand(-6, 6), life: rand(2, 4), size: rand(26, 54), type: 'fog', color: 0x7a4aa8, g: 0 });
    }
    R.renderer.render(R.scene, R.camera);
  };

  // ---------- tower icons for the UI ----------------------------------------
  R.towerIcon = function (type, level, size) {
    size = size || 128;
    R.iconCache = R.iconCache || {};
    const key = type + level + size;
    if (R.iconCache[key]) return R.iconCache[key];
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xffffff, 0x66714a, 2.4));
    const dl = new T.DirectionalLight(0xfff2dd, 3.0); dl.position.set(-60, 120, 90); scene.add(dl);
    const m = R.makeTower(type, level);
    scene.add(m);
    const box = new T.Box3().setFromObject(m);
    const c = box.getCenter(new T.Vector3()), s = box.getSize(new T.Vector3());
    const r = Math.max(s.x, s.y, s.z) || 1;
    const cam = new T.PerspectiveCamera(30, 1, 1, 4000);
    cam.position.set(c.x + r * 1.1, c.y + r * 0.85, c.z + r * 1.7);
    cam.lookAt(c.x, c.y, c.z);
    const rt = new T.WebGLRenderTarget(size, size);
    const prev = R.renderer.getRenderTarget();
    R.renderer.setRenderTarget(rt);
    R.renderer.setClearColor(0x000000, 0);
    R.renderer.clear();
    R.renderer.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    R.renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    R.renderer.setRenderTarget(prev);
    rt.dispose();
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    const url = cv.toDataURL();
    R.iconCache[key] = url;
    return url;
  };

  TD.R3 = R;
})(window.TD);
