// ---------------------------------------------------------------------------
// Ravenhold — 3D renderer (three.js). Low-poly lit world, procedural models,
// sprites for particles and effects, tilted perspective camera.
// World coordinates: data (x, y) -> scene (x, 0, z=y). Up is +y.
// ---------------------------------------------------------------------------
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  const R = {};
  let T; // THREE
  const W = TD.WORLD.w, H = TD.WORLD.h;
  const PITCH = 52 * Math.PI / 180, FOV = 38;
  const rand = (a, b) => a + Math.random() * (b - a);
  const M = {}; // shared materials
  const G = {}; // shared geometries

  function mat(color, o) { return new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.92, metalness: 0.0, flatShading: true }, o || {})); }
  function mesh(geo, m, x, y, z) { const me = new T.Mesh(geo, m); me.position.set(x || 0, y || 0, z || 0); me.castShadow = true; me.receiveShadow = true; return me; }
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, seg) => new T.CylinderGeometry(rt, rb, h, seg || 10);
  const cone = (r, h, seg) => new T.ConeGeometry(r, h, seg || 8);
  const sph = (r, d) => new T.IcosahedronGeometry(r, d == null ? 1 : d);

  // ---------- init ----------------------------------------------------------
  R.init = function (canvas, level, path) {
    T = window.THREE; R.level = level; R.path = path;
    R.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const mobile = navigator.maxTouchPoints > 1; R.mobile = mobile;
    R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 2 : 2));
    R.renderer.shadowMap.enabled = true; R.renderer.shadowMap.type = T.PCFSoftShadowMap;
    R.renderer.toneMapping = T.ACESFilmicToneMapping; R.renderer.toneMappingExposure = 1.0;
    R.scene = new T.Scene(); R.scene.background = new T.Color(0x0e131a);
    R.scene.fog = new T.Fog(0x8fa6b8, 1400, 3200);
    R.camera = new T.PerspectiveCamera(FOV, 1, 20, 7000);
    R.cam = { tx: W / 2, tz: H * 0.62, dist: 700, dMin: 260, dMax: 2400 };
    R.shakeAmt = 0; R.time = 0;
    R.particles = []; R.effects = []; R.floaters = []; R.enemyModels = new Map(); R.projModels = new Map();
    initMaterials(); initTextures(); lights(); buildWorld(level, path);
    R.resize();
  };

  function initMaterials() {
    M.stone = mat(0x8f8778); M.stoneDark = mat(0x5f594f); M.stoneBlue = mat(0x8e9ab3); M.wood = mat(0x7a5433); M.woodDark = mat(0x4a3320);
    M.roof = mat(0x8a2e28); M.roofBlue = mat(0x2f3f8c); M.gold = mat(0xe2b657, { roughness: 0.4, metalness: 0.5 }); M.iron = mat(0x4a4d55, { roughness: 0.5, metalness: 0.6 });
    M.trunk = mat(0x5a3d24); M.leafA = mat(0x4a8c3c); M.leafB = mat(0x35773f); M.pine = mat(0x3b7a44); M.rock = mat(0x777069);
    M.snow = mat(0xe9eef2); M.mountain = mat(0x4b5261); M.mountainFar = mat(0x5c6a80);
    M.banner = mat(0x1a1a22, { side: T.DoubleSide }); M.flag = mat(0x9a2c26, { side: T.DoubleSide });
    M.dark = mat(0x151316); M.portal = new T.MeshBasicMaterial({ color: 0x3a1050, side: T.DoubleSide });
    M.gateStone = mat(0x3b3944); M.bone = mat(0xe6dfcc);
    G.merlon = box(6, 6, 6); G.post = cyl(1, 1, 8, 5);
  }

  function initTextures() {
    // soft particle
    const soft = document.createElement('canvas'); soft.width = soft.height = 64; let c = soft.getContext('2d');
    let g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    R.texSoft = new T.CanvasTexture(soft);
    const hard = document.createElement('canvas'); hard.width = hard.height = 32; c = hard.getContext('2d'); c.fillStyle = '#fff'; c.beginPath(); c.arc(16, 16, 13, 0, Math.PI * 2); c.fill();
    R.texHard = new T.CanvasTexture(hard);
    // flame
    const fl = document.createElement('canvas'); fl.width = 64; fl.height = 96; c = fl.getContext('2d');
    g = c.createRadialGradient(32, 60, 2, 32, 56, 40); g.addColorStop(0, 'rgba(255,245,200,1)'); g.addColorStop(0.35, 'rgba(255,170,50,0.9)'); g.addColorStop(0.7, 'rgba(255,80,10,0.4)'); g.addColorStop(1, 'rgba(255,40,0,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(32, 2); c.quadraticCurveTo(62, 50, 32, 94); c.quadraticCurveTo(2, 50, 32, 2); c.fill();
    R.texFlame = new T.CanvasTexture(fl);
    // water streaks
    const wt = document.createElement('canvas'); wt.width = 256; wt.height = 64; c = wt.getContext('2d');
    const rnd = TD.mulberry32(9);
    for (let i = 0; i < 26; i++) { const x = rnd() * 256, y = 8 + rnd() * 48, l = 20 + rnd() * 50; c.strokeStyle = `rgba(255,255,255,${0.25 + rnd() * 0.4})`; c.lineWidth = 2 + rnd() * 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y + (rnd() - 0.5) * 6); c.stroke(); }
    R.texWater = new T.CanvasTexture(wt); R.texWater.wrapS = R.texWater.wrapT = T.RepeatWrapping;
  }

  function lights() {
    R.hemi = new T.HemisphereLight(0xd6e4f2, 0x4f5f33, 0.75); R.scene.add(R.hemi);
    R.sun = new T.DirectionalLight(0xfff0d8, 2.2); R.sun.castShadow = true;
    R.sun.shadow.mapSize.set(R.mobile ? 1536 : 2048, R.mobile ? 1536 : 2048); R.sun.shadow.bias = -0.0006; R.sun.shadow.normalBias = 1.2; R.sun.shadow.camera.near = 100; R.sun.shadow.camera.far = 3000;
    R.scene.add(R.sun); R.scene.add(R.sun.target);
    R.sunDir = new T.Vector3(-0.45, 1.0, 0.35).normalize();
    R.gateLight = new T.PointLight(0xff9a3a, 0, 260, 1.6); R.scene.add(R.gateLight);
  }

  // ---------- world ------------------------------------------------------------
  function buildWorld(level, path) {
    const scale = Math.min(2, Math.max(1.25, window.devicePixelRatio || 1));
    const gr = TD.buildGround(level, path, scale);
    const tex = new T.CanvasTexture(gr.canvas); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = Math.min(8, R.renderer.capabilities.getMaxAnisotropy());
    const ground = new T.Mesh(new T.PlaneGeometry(W, H), new T.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, H / 2); ground.receiveShadow = true; R.scene.add(ground);
    const skirt = new T.Mesh(new T.PlaneGeometry(W + 4000, H + 4000), mat(0x2f4a28, { flatShading: false }));
    skirt.rotation.x = -Math.PI / 2; skirt.position.set(W / 2, -1, H / 2); skirt.receiveShadow = true; R.scene.add(skirt);
    R.river = gr.river;
    buildWater(level, gr.river); buildBridge(level); buildMountains(); buildForest(level, path, gr.river); buildPlots(level);
    buildCastle(level.castle); buildBlackgate(level.gate);
  }

  function buildWater(level, pts) {
    const w = level.riverWidth + 6; const pos = [], uv = [], idx = []; let len = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(0, i - 1)];
      const dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
      if (i > 0) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      pos.push(p[0] + nx * w / 2, 0.8, p[1] + ny * w / 2, p[0] - nx * w / 2, 0.8, p[1] - ny * w / 2);
      uv.push(len / 140, 0, len / 140, 1);
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    R.waterMat = new T.MeshStandardMaterial({ color: 0x5fb6d6, map: R.texWater, transparent: true, opacity: 0.75, roughness: 0.25, metalness: 0.1, depthWrite: false });
    const m = new T.Mesh(geo, R.waterMat); m.receiveShadow = true; R.scene.add(m);
    R.waterMat2 = new T.MeshStandardMaterial({ color: 0xbfe9ff, map: R.texWater.clone(), transparent: true, opacity: 0.35, roughness: 0.2, depthWrite: false }); R.waterMat2.map.wrapS = R.waterMat2.map.wrapT = T.RepeatWrapping; R.waterMat2.map.repeat.set(0.6, 1);
    const m2 = new T.Mesh(geo, R.waterMat2); m2.position.y = 0.3; R.scene.add(m2);
  }

  function buildBridge(level) {
    const b = level.bridge; const g = new T.Group(); g.position.set(b.x, 0, b.y);
    g.add(mesh(box(b.w, 7, b.h), M.stone, 0, 3.5, 0));
    for (const s of [-1, 1]) { g.add(mesh(box(b.w + 8, 8, 6), M.stoneDark, 0, 10, s * (b.h / 2 - 2))); for (const e of [-1, 1]) g.add(mesh(box(9, 14, 9), M.stoneDark, e * (b.w / 2 + 2), 12, s * (b.h / 2 - 2))); }
    R.scene.add(g);
  }

  function buildMountains() {
    const rnd = TD.mulberry32(77); const list = [];
    for (let x = -300; x < W + 300; x += 60 + rnd() * 50) list.push({ x, z: -60 - rnd() * 80, s: 90 + rnd() * 110, far: false });
    for (let x = -600; x < W + 600; x += 90 + rnd() * 60) list.push({ x, z: -260 - rnd() * 160, s: 180 + rnd() * 140, far: true });
    for (let z = 60; z < H + 200; z += 70 + rnd() * 60) { list.push({ x: -120 - rnd() * 80, z, s: 60 + rnd() * 60, far: false }); list.push({ x: W + 120 + rnd() * 80, z, s: 60 + rnd() * 60, far: false }); }
    const geo = cone(1, 1, 6); const snowGeo = cone(0.34, 0.34, 6);
    const im = new T.InstancedMesh(geo, M.mountain, list.length), sm = new T.InstancedMesh(snowGeo, M.snow, list.length);
    const o = new T.Object3D();
    list.forEach((m, i) => {
      o.position.set(m.x, m.s * 0.5 - 4, m.z); o.scale.set(m.s * (0.9 + rnd() * 0.5), m.s, m.s * (0.9 + rnd() * 0.5)); o.rotation.y = rnd() * 6; o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, new T.Color(m.far ? 0x6b7a92 : 0x4b5261));
      o.position.y = m.s * 0.845 - 4; o.updateMatrix(); sm.setMatrixAt(i, o.matrix);
    });
    im.castShadow = true; im.receiveShadow = true; R.scene.add(im); R.scene.add(sm);
  }

  function buildForest(level, path, river) {
    const rnd = TD.mulberry32(4242); const near = (x, y, pts, d) => TD.distToPolyline(x, y, pts) < d; const c = level.castle;
    const blocked = (x, y, pad) => near(x, y, path.pts, level.roadWidth / 2 + 18 + pad) || near(x, y, river, level.riverWidth / 2 + 16 + pad) || level.plots.some((p) => Math.hypot(x - p[0], y - p[1]) < 56 + pad) || (x > c.x - 160 - pad && x < c.x + 160 + pad && y > c.y - 130 - pad && y < c.y + 110 + pad) || Math.hypot(x - level.gate.x, y - level.gate.y) < 130 + pad;
    const trees = [], rocks = [];
    const tryPlace = (x, y, r) => { if (x < 15 || y < 70 || x > W - 15 || y > H - 15) return false; if (blocked(x, y, 8)) return false; for (const t of trees) if (Math.hypot(t.x - x, t.y - y) < (t.r + r) * 0.8) return false; return true; };
    const patches = [[120, 1450, 150], [880, 1500, 130], [900, 150, 120], [470, 1000, 70], [60, 1120, 90], [880, 480, 110], [650, 630, 70], [440, 880, 45], [130, 760, 60]];
    for (const [px, py, pr] of patches) for (let i = 0; i < 45; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * pr; const x = px + Math.cos(a) * d, y = py + Math.sin(a) * d; const r = 13 + rnd() * 12; if (tryPlace(x, y, r)) trees.push({ x, y, r, kind: rnd() < (py < 500 ? 0.75 : 0.35) ? 'pine' : 'oak' }); }
    for (let i = 0; i < 300; i++) { const x = rnd() * W, y = rnd() * H; const r = 12 + rnd() * 12; if (tryPlace(x, y, r) && rnd() < 0.5) trees.push({ x, y, r, kind: rnd() < (y < 500 ? 0.7 : 0.3) ? 'pine' : 'oak' }); }
    // outer ring forest beyond the edges
    for (let i = 0; i < 260; i++) { const side = rnd(); let x, y; if (side < 0.5) { x = rnd() < 0.5 ? -20 - rnd() * 200 : W + 20 + rnd() * 200; y = rnd() * (H + 200); } else { x = rnd() * W; y = H + 20 + rnd() * 200; } trees.push({ x, y, r: 16 + rnd() * 14, kind: rnd() < 0.5 ? 'pine' : 'oak' }); }
    for (let i = 0; i < 60; i++) { const x = rnd() * W, y = 90 + rnd() * (H - 100); if (blocked(x, y, 0)) continue; rocks.push({ x, y, s: 5 + rnd() * 10 }); }
    const pines = trees.filter((t) => t.kind === 'pine'), oaks = trees.filter((t) => t.kind === 'oak'); const o = new T.Object3D();
    const inst = (geo, m, n) => { const im = new T.InstancedMesh(geo, m, n); im.castShadow = true; im.receiveShadow = true; R.scene.add(im); return im; };
    // pines: trunk + 3 tiers
    const pt = inst(cyl(1, 1.3, 1, 6), M.trunk, pines.length); const tiers = [inst(cone(1, 1, 7), M.pine, pines.length), inst(cone(1, 1, 7), M.pine, pines.length), inst(cone(1, 1, 7), M.pine, pines.length)];
    pines.forEach((t, i) => {
      const h = t.r * 2.6, ry = rnd() * 6; const col = new T.Color().setHSL(0.33 + rnd() * 0.05, 0.45 + rnd() * 0.2, 0.3 + rnd() * 0.12);
      o.position.set(t.x, 6, t.y); o.scale.set(t.r * 0.18, 12, t.r * 0.18); o.rotation.y = ry; o.updateMatrix(); pt.setMatrixAt(i, o.matrix);
      for (let k = 0; k < 3; k++) { const s = 1 - k * 0.26; o.position.set(t.x, 8 + h * 0.2 + k * h * 0.26, t.y); o.scale.set(t.r * 0.95 * s, h * 0.5, t.r * 0.95 * s); o.rotation.y = ry + k * 0.4; o.updateMatrix(); tiers[k].setMatrixAt(i, o.matrix); tiers[k].setColorAt(i, col.clone().offsetHSL(0, 0, k * 0.04)); }
    });
    const ot = inst(cyl(1.2, 1.6, 1, 6), M.trunk, oaks.length); const blobs = [inst(sph(1, 1), M.leafA, oaks.length), inst(sph(1, 1), M.leafB, oaks.length), inst(sph(1, 1), M.leafA, oaks.length)];
    oaks.forEach((t, i) => {
      const col = new T.Color().setHSL(0.26 + rnd() * 0.07, 0.55 + rnd() * 0.2, 0.36 + rnd() * 0.12);
      o.position.set(t.x, 8, t.y); o.scale.set(t.r * 0.16, 16, t.r * 0.16); o.rotation.y = rnd() * 6; o.updateMatrix(); ot.setMatrixAt(i, o.matrix);
      for (let k = 0; k < 3; k++) { const a = rnd() * 6.28, d = k ? t.r * 0.35 : 0; o.position.set(t.x + Math.cos(a) * d, 16 + t.r * 0.75 - k * t.r * 0.15, t.y + Math.sin(a) * d); const s = t.r * (k ? 0.62 : 0.85); o.scale.set(s, s * 0.85, s); o.rotation.set(rnd(), rnd(), rnd()); o.updateMatrix(); blobs[k].setMatrixAt(i, o.matrix); blobs[k].setColorAt(i, col.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.08)); }
    });
    const rk = inst(new T.DodecahedronGeometry(1, 0), M.rock, rocks.length);
    rocks.forEach((r, i) => { o.position.set(r.x, r.s * 0.4, r.y); o.scale.set(r.s * (0.8 + rnd() * 0.5), r.s * 0.7, r.s * (0.8 + rnd() * 0.5)); o.rotation.set(rnd(), rnd(), rnd()); o.updateMatrix(); rk.setMatrixAt(i, o.matrix); });
  }

  function buildPlots(level) {
    R.plots = level.plots.map(([x, z]) => {
      const g = new T.Group(); g.position.set(x, 0, z);
      g.add(mesh(cyl(36, 39, 5, 22), M.stone, 0, 2.5, 0));
      const ringMat = new T.MeshBasicMaterial({ color: 0xe2b657, transparent: true, opacity: 0.25 });
      const ring = new T.Mesh(new T.TorusGeometry(31, 1.4, 6, 40), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 5.3; g.add(ring);
      const cracks = new T.Mesh(new T.TorusGeometry(16, 0.5, 4, 24), new T.MeshBasicMaterial({ color: 0x6f6960 })); cracks.rotation.x = Math.PI / 2; cracks.position.y = 5.2; g.add(cracks);
      R.scene.add(g); return { g, ringMat, x, z };
    });
  }

  function merlonRow(g, x0, z0, x1, z1, y) {
    const n = Math.max(1, Math.floor(Math.hypot(x1 - x0, z1 - z0) / 12)); const im = new T.InstancedMesh(G.merlon, M.stone, n + 1); const o = new T.Object3D(); const ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) { const t = i / n; o.position.set(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t); o.rotation.y = ang; o.updateMatrix(); im.setMatrixAt(i, o.matrix); }
    im.castShadow = true; g.add(im);
  }
  function roundTower(g, x, z, r, h, roofMat) {
    g.add(mesh(cyl(r, r + 2, h, 12), M.stone, x, h / 2, z)); g.add(mesh(cyl(r + 3, r + 3, 4, 12), M.stoneDark, x, h, z));
    g.add(mesh(cone(r + 4, r * 1.6, 12), roofMat || M.roof, x, h + 2 + r * 0.8, z));
    return g;
  }
  function flag(g, x, y, z, color) {
    g.add(mesh(cyl(0.8, 0.8, 26, 5), M.iron, x, y + 13, z));
    const f = new T.Mesh(new T.PlaneGeometry(16, 9, 4, 1), color || M.flag); f.position.set(x + 8, y + 21, z); f.castShadow = true; g.add(f); R.flags = R.flags || []; R.flags.push(f); return f;
  }
  function buildCastle(c) {
    const g = new T.Group(); const cx = c.x; const zN = c.y - 100, zS = c.y + 60, xW = cx - 125, xE = cx + 125; const wh = 42;
    const wall = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0); const m = mesh(box(14, wh, L), M.stone, (x0 + x1) / 2, wh / 2, (z0 + z1) / 2); m.rotation.y = Math.atan2(x1 - x0, z1 - z0); g.add(m); const nx = -(z1 - z0) / L * 5, nz = (x1 - x0) / L * 5; merlonRow(g, x0 + nx, z0 + nz, x1 + nx, z1 + nz, wh + 3); merlonRow(g, x0 - nx, z0 - nz, x1 - nx, z1 - nz, wh + 3); };
    // north wall with gate opening
    wall(xW, zN, cx - 34, zN); wall(cx + 34, zN, xE, zN); wall(xW, zS, xE, zS); wall(xW, zN, xW, zS); wall(xE, zN, xE, zS);
    // gatehouse
    for (const s of [-1, 1]) { g.add(mesh(box(26, 66, 30), M.stone, cx + s * 40, 33, zN)); merlonRow(g, cx + s * 40 - 12, zN - 12, cx + s * 40 + 12, zN - 12, 70); merlonRow(g, cx + s * 40 - 12, zN + 12, cx + s * 40 + 12, zN + 12, 70); }
    g.add(mesh(box(56, 16, 30), M.stone, cx, 60, zN)); merlonRow(g, cx - 26, zN - 12, cx + 26, zN - 12, 71);
    g.add(mesh(box(50, 52, 4), M.dark, cx, 26, zN + 4)); // dark passage
    for (let k = -18; k <= 18; k += 9) g.add(mesh(box(2, 44, 2), M.iron, cx + k, 22, zN - 8));
    // corner towers
    roundTower(g, xW, zN, 20, 72); roundTower(g, xE, zN, 20, 72); roundTower(g, xW, zS, 22, 82); roundTower(g, xE, zS, 22, 82);
    // keep
    g.add(mesh(box(110, 78, 84), M.stone, cx, 39, c.y - 6)); merlonRow(g, cx - 55, c.y - 48, cx + 55, c.y - 48, 82); merlonRow(g, cx - 55, c.y + 36, cx + 55, c.y + 36, 82); merlonRow(g, cx - 55, c.y - 48, cx - 55, c.y + 36, 82); merlonRow(g, cx + 55, c.y - 48, cx + 55, c.y + 36, 82);
    roundTower(g, cx, c.y - 6, 17, 118, M.roof);
    for (const s of [-1, 1]) { const b = new T.Mesh(new T.PlaneGeometry(22, 40), M.banner); b.position.set(cx + s * 30, 50, c.y - 49); g.add(b); const em = new T.Mesh(new T.CircleGeometry(6, 12), M.gold); em.position.set(cx + s * 30, 56, c.y - 49.5); em.rotation.y = Math.PI; g.add(em); }
    flag(g, cx, 118 + 2 + 26 * 0.8 + 18, c.y - 6, M.flag); flag(g, xW, 82 + 2 + 22 * 0.8 + 16, zS); flag(g, xE, 82 + 2 + 22 * 0.8 + 16, zS);
    // torches at the gate
    R.torches = [[cx - 30, 36, zN - 18], [cx + 30, 36, zN - 18]];
    R.gateLight.position.set(cx, 40, zN - 30); R.gateLight.intensity = 3000;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    R.scene.add(g);
    R.torchSprites = R.torches.map((p) => { const s = new T.Sprite(new T.SpriteMaterial({ map: R.texFlame, color: 0xffb060, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); s.position.set(p[0], p[1] + 8, p[2]); s.scale.set(12, 20, 1); R.scene.add(s); return s; });
  }
  function buildBlackgate(gt) {
    const g = new T.Group();
    for (const s of [-1, 1]) { g.add(mesh(box(22, 74, 22), M.gateStone, gt.x + 14, 37, gt.y + s * 48)); g.add(mesh(box(28, 8, 28), M.gateStone, gt.x + 14, 76, gt.y + s * 48)); }
    const lintel = mesh(box(26, 12, 60), M.gateStone, gt.x + 14, 84, gt.y - 20); lintel.rotation.x = 0.12; g.add(lintel);
    const portal = new T.Mesh(new T.PlaneGeometry(64, 68), M.portal); portal.position.set(gt.x + 6, 34, gt.y); portal.rotation.y = Math.PI / 2; g.add(portal);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: R.texSoft, color: 0x7a30c0, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.8 })); glow.position.set(gt.x + 10, 34, gt.y); glow.scale.set(140, 140, 1); g.add(glow); R.portalGlow = glow;
    for (const [sx, sz] of [[gt.x + 70, gt.y - 76], [gt.x + 74, gt.y + 74]]) { g.add(mesh(cyl(1.2, 1.5, 30, 5), M.woodDark, sx, 15, sz)); g.add(mesh(sph(4, 0), M.bone, sx, 32, sz)); }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    R.scene.add(g);
  }

  // ---------- towers -----------------------------------------------------------
  function humanoidFigure(s, opts) {
    const g = new T.Group(); const skin = opts.skin || mat(0xd9b08c), cloth = opts.cloth || mat(0x3d5a2c);
    g.add(mesh(sph(s * 0.32, 0), skin, 0, s * 1.5, 0));
    const hood = mesh(sph(s * 0.34, 0), opts.hood || M.woodDark, 0, s * 1.58, 0); hood.scale.y = 0.6; g.add(hood);
    const body = mesh(sph(s * 0.42, 0), cloth, 0, s * 0.95, 0); body.scale.set(1, 1.25, 0.85); g.add(body);
    for (const sx of [-1, 1]) g.add(mesh(cyl(s * 0.11, s * 0.13, s * 0.6, 5), cloth, sx * s * 0.2, s * 0.3, 0));
    return g;
  }
  R.makeTower = function (type, lv) {
    const g = new T.Group(); g.userData = {};
    if (type === 'archer') {
      const h = 46 + lv * 9; g.add(mesh(cyl(19, 22, h, 12), M.stone, 0, h / 2, 0)); g.add(mesh(cyl(24, 24, 4, 12), M.wood, 0, h + 2, 0));
      const posts = new T.InstancedMesh(G.post, M.woodDark, 8); const o = new T.Object3D(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; o.position.set(Math.cos(a) * 22, h + 8, Math.sin(a) * 22); o.updateMatrix(); posts.setMatrixAt(i, o.matrix); } g.add(posts);
      const rail = new T.Mesh(new T.TorusGeometry(22, 0.9, 5, 24), M.woodDark); rail.rotation.x = Math.PI / 2; rail.position.y = h + 12; g.add(rail);
      const tur = new T.Group(); tur.position.y = h + 4; const fig = humanoidFigure(9, {}); tur.add(fig);
      const bow = new T.Mesh(new T.TorusGeometry(7, 0.7, 5, 12, Math.PI), mat(0xc9a15c)); bow.rotation.set(0, Math.PI / 2, 0); bow.position.set(4, 12, 7); bow.rotation.z = -Math.PI / 2; tur.add(bow); g.userData.bow = bow;
      g.add(tur); g.userData.turret = tur;
      if (lv >= 1) { const f = flag(g, 20, h + 2, 0, lv >= 2 ? M.gold : M.flag); g.userData.flag = f; }
    } else if (type === 'ballista') {
      const h = 28 + lv * 5; g.add(mesh(box(46, h, 46), M.stone, 0, h / 2, 0)); g.add(mesh(box(52, 5, 52), M.stoneDark, 0, h + 2.5, 0));
      merlonRow(g, -26, -26, 26, -26, h + 8); merlonRow(g, -26, 26, 26, 26, h + 8); merlonRow(g, -26, -14, -26, 14, h + 8); merlonRow(g, 26, -14, 26, 14, h + 8);
      const tur = new T.Group(); tur.position.y = h + 8;
      tur.add(mesh(cyl(6, 8, 6, 8), M.woodDark, 0, 3, 0)); const rail = mesh(box(6, 4, 36), M.wood, 0, 8, 4); tur.add(rail); g.userData.rail = rail;
      for (const s of [-1, 1]) { const arm = mesh(cyl(1.6, 1.2, 26, 6), M.wood, s * 12, 9, -6); arm.rotation.z = Math.PI / 2; arm.rotation.y = s * 0.35; tur.add(arm); }
      if (lv >= 1) tur.add(mesh(box(8, 3, 10), M.iron, 0, 10.5, -4));
      const bolt = mesh(cyl(0.9, 0.9, 30, 5), mat(0xc9b48a), 0, 11, 6); bolt.rotation.x = Math.PI / 2; tur.add(bolt); g.userData.bolt = bolt;
      if (lv >= 2) { const b2 = bolt.clone(); b2.position.x = 4; tur.add(b2); bolt.position.x = -4; }
      g.add(tur); g.userData.turret = tur;
    } else if (type === 'mage') {
      const h = 62 + lv * 12; g.add(mesh(cyl(14, 17, h, 10), M.stoneBlue, 0, h / 2, 0)); g.add(mesh(cyl(19, 19, 3, 10), M.gold, 0, h + 1, 0)); g.add(mesh(cone(20, 36, 10), M.roofBlue, 0, h + 20, 0));
      for (let i = 0; i <= lv; i++) { const win = mesh(box(4, 8, 2), new T.MeshBasicMaterial({ color: 0x8fe0ff }), 0, h * (0.35 + i * 0.25), 16); g.add(win); }
      const colors = [0x5fc8ff, 0xb07cff, 0xffffff][lv];
      const cr = new T.Mesh(new T.OctahedronGeometry(6 + lv * 1.5, 0), new T.MeshStandardMaterial({ color: colors, emissive: colors, emissiveIntensity: 1.2, roughness: 0.2, flatShading: true })); cr.position.y = h + 48; g.add(cr); g.userData.crystal = cr;
      const glow = new T.Sprite(new T.SpriteMaterial({ map: R.texSoft, color: colors, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.35 })); glow.position.y = h + 48; glow.scale.set(36 + lv * 8, 36 + lv * 8, 1); g.add(glow); g.userData.glow = glow;
      g.userData.orbits = []; for (let k = 0; k < 2 + lv; k++) { const s = new T.Mesh(sph(1.6, 0), new T.MeshBasicMaterial({ color: colors })); g.add(s); g.userData.orbits.push(s); }
      g.userData.crystalY = h + 48;
    } else if (type === 'catapult') {
      g.add(mesh(box(54, 6, 42), M.wood, 0, 6, 0)); for (const s of [-1, 1]) g.add(mesh(box(54, 2, 3), M.woodDark, 0, 9.5, s * 18));
      if (lv >= 1) for (const s of [-1, 1]) g.add(mesh(box(56, 2, 5), M.iron, 0, 9.6, s * 12));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = mesh(cyl(6 + lv, 6 + lv, 4, 10), M.woodDark, sx * 20, 6, sz * 22); wh.rotation.x = Math.PI / 2; g.add(wh); }
      const tur = new T.Group(); tur.position.y = 9;
      tur.add(mesh(box(14, 4, 30), M.woodDark, 0, 2, 0)); for (const s of [-1, 1]) { const f = mesh(box(3, 16, 3), M.wood, s * 7, 10, 2); f.rotation.x = 0.3; tur.add(f); }
      const arm = new T.Group(); arm.position.set(0, 12, -6); const armMesh = mesh(box(3, 3, 34), M.wood, 0, 0, 12); arm.add(armMesh); const bucket = mesh(cyl(5, 3, 4, 8), M.woodDark, 0, 2, 28); arm.add(bucket); const stone = mesh(new T.DodecahedronGeometry(4.5, 0), M.rock, 0, 5, 28); arm.add(stone); g.userData.stone = stone;
      tur.add(arm); g.userData.arm = arm; g.add(tur); g.userData.turret = tur;
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  };

  // ---------- enemies ----------------------------------------------------------
  const PAL = {
    goblin: { skin: 0x8fc04f, dark: 0x4f7a2a, cloth: 0x6b4a2a, eye: 0xffe36b },
    orc: { skin: 0x8a9a4a, dark: 0x4a5a26, cloth: 0x3a2c22, eye: 0xffd24a, pauldron: 0x4a4650 },
    skeleton: { skin: 0xefe9d6, dark: 0xa8a08a, cloth: null, eye: 0x7fd0ff },
    troll: { skin: 0x8a9aa8, dark: 0x3f4b58, cloth: 0x4a3a2a, eye: 0xffd24a },
    chieftain: { skin: 0x7f96a8, dark: 0x354452, cloth: 0x5a2a1e, eye: 0xff8a3a },
    ogre: { skin: 0xb58a5a, dark: 0x6a4a2a, cloth: 0x3a2c22, eye: 0xff5a3a, pauldron: 0x5a5660 },
  };
  function eyes(g, s, y, color, gap) { const m = new T.MeshBasicMaterial({ color }); for (const sx of [-1, 1]) { const e = new T.Mesh(sph(s * 0.07, 0), m); e.position.set(sx * (gap || s * 0.13), y, s * 0.3); g.add(e); } }
  function makeHumanoid(type, s) {
    const p = PAL[type]; const skin = mat(p.skin), dark = mat(p.dark), cloth = p.cloth != null ? mat(p.cloth) : null; const g = new T.Group(); const ud = g.userData; ud.flash = [skin, dark]; if (cloth) ud.flash.push(cloth);
    const hunch = (type === 'troll' || type === 'chieftain') ? s * 0.25 : 0;
    ud.legs = [];
    for (const sx of [-1, 1]) { const lg = new T.Group(); lg.position.set(sx * s * 0.28, s * 0.62, 0); const lm = mesh(cyl(s * 0.13, s * 0.17, s * 0.62, 6), dark, 0, -s * 0.31, 0); lg.add(lm); g.add(lg); ud.legs.push(lg); }
    const body = mesh(sph(s * 0.5, 1), skin, 0, s * 1.05 - hunch * 0.3, 0); body.scale.set(1.1, 1.15, 0.9); g.add(body);
    if (cloth) { const belt = mesh(cyl(s * 0.52, s * 0.56, s * 0.25, 8), cloth, 0, s * 0.68, 0); g.add(belt); }
    if (type === 'skeleton') { for (let k = 0; k < 3; k++) { const rib = new T.Mesh(new T.TorusGeometry(s * 0.42, s * 0.035, 4, 10, Math.PI), mat(0x8a8272)); rib.position.set(0, s * 1.25 - k * s * 0.18, s * 0.1); rib.rotation.x = Math.PI / 2; rib.rotation.z = Math.PI; g.add(rib); } }
    if (p.pauldron) for (const sx of [-1, 1]) { const pd = mesh(sph(s * 0.3, 0), mat(p.pauldron), sx * s * 0.6, s * 1.45, 0); pd.scale.y = 0.6; g.add(pd); const spike = mesh(cone(s * 0.08, s * 0.28, 5), M.bone, sx * s * 0.6, s * 1.68, 0); g.add(spike); }
    const hy = s * 1.75 - hunch; const head = mesh(sph(s * 0.36, 1), type === 'skeleton' ? M.bone : skin, 0, hy, s * 0.05); g.add(head);
    eyes(g, s, hy + s * 0.02, p.eye);
    if (type === 'goblin') for (const sx of [-1, 1]) { const ear = mesh(cone(s * 0.1, s * 0.45, 4), skin, sx * s * 0.45, hy + s * 0.05, 0); ear.rotation.z = sx * -Math.PI / 2; g.add(ear); }
    if (type === 'orc' || type === 'ogre') for (const sx of [-1, 1]) { const tusk = mesh(cone(s * 0.05, s * 0.2, 4), M.bone, sx * s * 0.14, hy - s * 0.18, s * 0.32); g.add(tusk); }
    if (type === 'chieftain') for (const sx of [-1, 1]) { const a = mesh(cyl(s * 0.03, s * 0.05, s * 0.8, 4), M.bone, sx * s * 0.3, hy + s * 0.55, -s * 0.1); a.rotation.z = sx * -0.5; g.add(a); const b = mesh(cyl(s * 0.02, s * 0.04, s * 0.4, 4), M.bone, sx * s * 0.45, hy + s * 0.75, -s * 0.1); b.rotation.z = sx * -1.3; g.add(b); const neck = new T.Mesh(new T.TorusGeometry(s * 0.4, s * 0.05, 4, 10), M.bone); neck.position.y = s * 1.4; neck.rotation.x = Math.PI / 2 - 0.3; g.add(neck); }
    if (type === 'ogre') { const crown = new T.Mesh(new T.TorusGeometry(s * 0.3, s * 0.05, 4, 8), M.iron); crown.rotation.x = Math.PI / 2; crown.position.y = hy + s * 0.32; g.add(crown); for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283; g.add(mesh(cone(s * 0.05, s * 0.18, 4), M.iron, Math.cos(a) * s * 0.3, hy + s * 0.42, Math.sin(a) * s * 0.3)); } }
    // arms + weapon
    const arm = new T.Group(); arm.position.set(s * 0.6, s * 1.35, 0); arm.add(mesh(cyl(s * 0.1, s * 0.12, s * 0.7, 5), skin, 0, -s * 0.3, 0)); g.add(arm); ud.arm = arm;
    const armL = new T.Group(); armL.position.set(-s * 0.6, s * 1.35, 0); armL.add(mesh(cyl(s * 0.1, s * 0.12, s * 0.7, 5), skin, 0, -s * 0.3, 0)); g.add(armL); ud.armL = armL;
    const wp = new T.Group(); wp.position.set(0, -s * 0.6, 0); arm.add(wp);
    if (type === 'goblin') { const d = mesh(box(s * 0.06, s * 0.5, s * 0.12), M.iron, 0, s * 0.2, s * 0.1); wp.add(d); }
    else if (type === 'orc') { wp.add(mesh(cyl(s * 0.04, s * 0.04, s * 1.1, 5), M.woodDark, 0, s * 0.3, 0)); const bl = mesh(box(s * 0.08, s * 0.5, s * 0.4), M.iron, 0, s * 0.75, s * 0.2); wp.add(bl); }
    else if (type === 'skeleton') { const sw = mesh(box(s * 0.06, s * 1.0, s * 0.14), mat(0xd7dbe0, { metalness: 0.6, roughness: 0.4 }), 0, s * 0.45, 0); wp.add(sw); wp.add(mesh(box(s * 0.3, s * 0.05, s * 0.08), M.woodDark, 0, s * 0.02, 0)); const sh = mesh(cyl(s * 0.45, s * 0.45, s * 0.08, 10), M.wood, 0, -s * 0.1, s * 0.1); sh.rotation.x = Math.PI / 2; armL.add(sh); const boss = mesh(sph(s * 0.12, 0), M.iron, 0, -s * 0.1, s * 0.16); armL.add(boss); }
    else if (type === 'troll' || type === 'chieftain' || type === 'ogre') { wp.add(mesh(cyl(s * 0.06, s * 0.08, s * 1.2, 5), M.woodDark, 0, s * 0.3, 0)); wp.add(mesh(sph(s * 0.26, 0), M.woodDark, 0, s * 0.95, 0)); if (type === 'ogre') for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; const sp = mesh(cone(s * 0.05, s * 0.2, 4), M.iron, Math.cos(a) * s * 0.28, s * 0.95, Math.sin(a) * s * 0.28); sp.lookAt(0, s * 0.95, 0); sp.rotateX(-Math.PI / 2); wp.add(sp); } }
    return g;
  }
  function makeQuadruped(s, colors) {
    const g = new T.Group(); const ud = g.userData; const body = mat(colors.body), dark = mat(colors.dark); ud.flash = [body, dark]; ud.legs = [];
    const b = mesh(sph(s * 0.55, 1), body, 0, s * 0.95, 0); b.scale.set(0.9, 0.85, 1.7); g.add(b);
    for (const [sx, sz, ph] of [[-1, 1, 1], [1, 1, -1], [-1, -1, -1], [1, -1, 1]]) { const lg = new T.Group(); lg.position.set(sx * s * 0.3, s * 0.65, sz * s * 0.55); lg.add(mesh(cyl(s * 0.1, s * 0.13, s * 0.65, 5), dark, 0, -s * 0.32, 0)); lg.userData.ph = ph; g.add(lg); ud.legs.push(lg); }
    const head = mesh(sph(s * 0.36, 1), body, 0, s * 1.3, s * 1.05); g.add(head); const snout = mesh(box(s * 0.3, s * 0.25, s * 0.4), dark, 0, s * 1.2, s * 1.4); g.add(snout);
    for (const sx of [-1, 1]) { const ear = mesh(cone(s * 0.09, s * 0.3, 4), dark, sx * s * 0.2, s * 1.65, s * 0.95); g.add(ear); }
    const em = new T.MeshBasicMaterial({ color: colors.eye }); for (const sx of [-1, 1]) { const e = new T.Mesh(sph(s * 0.06, 0), em); e.position.set(sx * s * 0.16, s * 1.38, s * 1.35); g.add(e); }
    const tail = mesh(cyl(s * 0.04, s * 0.1, s * 0.7, 5), dark, 0, s * 1.2, -s * 1.05); tail.rotation.x = -0.9; g.add(tail); ud.tail = tail;
    return g;
  }
  R.makeEnemy = function (type, s) {
    let g;
    if (type === 'wolf') g = makeQuadruped(s, { body: 0x6f6a62, dark: 0x3d3a36, eye: 0xff3a2a });
    else if (type === 'rider') {
      g = makeQuadruped(s * 0.95, { body: 0x2b2a30, dark: 0x101014, eye: 0xff3a2a });
      const r = new T.Group(); r.position.set(0, s * 1.2, -s * 0.1); const armor = mat(0x1c1c24, { metalness: 0.5, roughness: 0.5 }); g.userData.flash.push(armor);
      const bd = mesh(sph(s * 0.36, 1), armor, 0, s * 0.5, 0); bd.scale.set(1, 1.3, 0.8); r.add(bd); r.add(mesh(sph(s * 0.28, 1), armor, 0, s * 1.05, 0)); const plume = mesh(box(s * 0.05, s * 0.12, s * 0.4), mat(0xd42a2a), 0, s * 1.35, -s * 0.05); r.add(plume);
      for (const sx of [-1, 1]) r.add(mesh(sph(s * 0.18, 0), armor, sx * s * 0.42, s * 0.82, 0));
      const cape = new T.Mesh(new T.PlaneGeometry(s * 0.8, s * 1.1), mat(0x5a1a1a, { side: T.DoubleSide })); cape.position.set(0, s * 0.45, -s * 0.35); cape.rotation.x = 0.35; r.add(cape); g.userData.cape = cape;
      const lance = mesh(cyl(s * 0.03, s * 0.05, s * 2.4, 5), M.wood, s * 0.45, s * 0.7, s * 0.6); lance.rotation.x = Math.PI / 2 - 0.25; r.add(lance); const tip = mesh(cone(s * 0.08, s * 0.3, 5), M.iron, s * 0.45, s * 0.98, s * 1.75); tip.rotation.x = Math.PI / 2 - 0.25; r.add(tip);
      g.add(r);
    } else g = makeHumanoid(type, s);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    return g;
  };

  // ---------- sync: towers / enemies / projectiles -----------------------------
  R.syncTowers = function (towers, time) {
    towers.forEach((t, i) => {
      const plot = R.plots[i];
      if (!t) { if (plot.model) { R.scene.remove(plot.model); plot.model = null; plot.level = -1; } return; }
      if (!plot.model || plot.level !== t.level || plot.type !== t.type) { if (plot.model) R.scene.remove(plot.model); plot.model = R.makeTower(t.type, t.level); plot.model.position.set(t.x, 0, t.y); plot.level = t.level; plot.type = t.type; R.scene.add(plot.model); }
      const ud = plot.model.userData; const rotY = Math.atan2(Math.cos(t.angle), Math.sin(t.angle));
      if (ud.turret) ud.turret.rotation.y = rotY;
      if (t.type === 'ballista' && ud.bolt) { const rec = Math.max(0, 1 - t.fireT * 3) * 6; ud.bolt.position.z = 6 - rec; ud.bolt.visible = t.fireT > 0.15; ud.rail.position.z = 4 - rec * 0.5; }
      if (t.type === 'catapult' && ud.arm) { const ft = t.fireT; const swing = ft < 0.22 ? 1 - ft / 0.22 : ft < 1.2 ? (ft - 0.22) / 1 : 0; ud.arm.rotation.x = -0.2 - (1 - Math.min(1, swing)) * 0 - Math.max(0, swing) * 1.6; ud.stone.visible = ft > 1.0 || ft < 0.01; }
      if (t.type === 'mage' && ud.crystal) { ud.crystal.position.y = ud.crystalY + Math.sin(time * 2 + i) * 3; ud.crystal.rotation.y = time * 1.5; ud.glow.position.y = ud.crystal.position.y; ud.glow.material.opacity = 0.3 + Math.sin(time * 5 + i) * 0.1; ud.orbits.forEach((o, k) => { const a = time * 2.5 + k / ud.orbits.length * 6.283; o.position.set(Math.cos(a) * 14, ud.crystal.position.y + Math.sin(a * 1.3) * 5, Math.sin(a) * 14); }); }
      if (t.type === 'archer' && ud.bow) { ud.bow.position.z = 7 - Math.max(0, 1 - t.fireT * 4) * 2; }
    });
  };

  R.syncEnemies = function (enemies, time) {
    const seen = new Set();
    for (const e of enemies) {
      seen.add(e.id); let m = R.enemyModels.get(e.id);
      if (!m) {
        const g = R.makeEnemy(e.type, e.def.size); R.scene.add(g);
        const bar = new T.Group(); const bw = e.def.boss ? 46 : Math.max(18, Math.min(34, e.def.size * 1.7));
        const bg = new T.Mesh(new T.PlaneGeometry(bw + 2, 5), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false })); bar.add(bg);
        const fill = new T.Mesh(new T.PlaneGeometry(bw, 3.4), new T.MeshBasicMaterial({ color: 0x6cd35a, depthTest: false })); fill.position.z = 0.1; bar.add(fill); bar.renderOrder = 10; bg.renderOrder = 10; fill.renderOrder = 11; bar.visible = false; R.scene.add(bar);
        const ice = new T.Mesh(sph(e.def.size * 1.1, 1), new T.MeshStandardMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.35, roughness: 0.1, flatShading: true })); ice.position.y = e.def.size * 1.0; ice.scale.y = 1.3; ice.visible = false; g.add(ice);
        const fire = new T.Sprite(new T.SpriteMaterial({ map: R.texFlame, color: 0xffa040, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); fire.scale.set(e.def.size * 1.2, e.def.size * 2, 1); fire.position.y = e.def.size * 1.6; fire.visible = false; g.add(fire);
        m = { g, bar, fill, bw, ice, fire }; R.enemyModels.set(e.id, m);
      }
      const s = e.def.size, ud = m.g.userData; const sp = (e.slowT > 0 ? 1 - e.slowAmt : 1);
      const bob = Math.abs(Math.sin(e.walkT * 8)) * s * 0.08 * sp;
      m.g.position.set(e.x, bob, e.y); m.g.rotation.y = Math.atan2(e.dx, e.dy);
      const sw = Math.sin(e.walkT * 8) * 0.55 * sp;
      ud.legs.forEach((lg, k) => { lg.rotation.x = sw * (lg.userData.ph || (k % 2 ? -1 : 1)); });
      if (ud.arm) { ud.arm.rotation.x = -0.6 + sw * 0.3; ud.armL.rotation.x = 0.2 - sw * 0.4; }
      if (ud.tail) ud.tail.rotation.z = Math.sin(e.walkT * 6) * 0.3;
      if (ud.cape) ud.cape.rotation.x = 0.35 + Math.sin(e.walkT * 5) * 0.15;
      const flash = e.hitT > 0 ? 0.9 : 0; for (const mt of ud.flash) { if (mt.emissiveIntensity !== flash) { mt.emissive.set(0xffffff); mt.emissiveIntensity = flash; } }
      m.ice.visible = e.slowT > 0; m.fire.visible = e.burnT > 0; if (e.burnT > 0) { m.fire.scale.set(s * (1.1 + Math.sin(time * 20) * 0.15), s * (2 + Math.sin(time * 17) * 0.3), 1); }
      if (e.hp < e.maxHp) { m.bar.visible = true; m.bar.position.set(e.x, s * 2.3 + 6 + bob, e.y); m.bar.quaternion.copy(R.camera.quaternion); const f = Math.max(0, e.hp / e.maxHp); m.fill.scale.x = f; m.fill.position.x = -m.bw * (1 - f) / 2; m.fill.material.color.set(f > 0.5 ? 0x6cd35a : f > 0.25 ? 0xe2b657 : 0xd9483b); }
    }
    for (const [id, m] of R.enemyModels) if (!seen.has(id)) { R.scene.remove(m.g); R.scene.remove(m.bar); R.enemyModels.delete(id); }
  };

  R.makeProjectile = function (p) {
    if (p.kind === 'arrow' || p.kind === 'bolt') {
      const g = new T.Group(); const L = p.kind === 'bolt' ? 24 : 15, r = p.kind === 'bolt' ? 1.1 : 0.6;
      const sh = mesh(cyl(r, r, L, 5), p.kind === 'bolt' ? M.woodDark : M.wood, 0, 0, 0); sh.rotation.x = Math.PI / 2; g.add(sh);
      const tip = mesh(cone(r * 2.2, 4, 5), M.iron, 0, 0, L / 2 + 2); tip.rotation.x = Math.PI / 2; g.add(tip);
      const fl = mesh(box(r * 4, 0.4, 4), p.kind === 'bolt' ? M.flag : M.bone, 0, 0, -L / 2 + 2); g.add(fl); return g;
    }
    if (p.kind === 'orb') { const g = new T.Group(); const c = new T.Color(p.color[0]); g.add(new T.Mesh(sph(3.5, 1), new T.MeshBasicMaterial({ color: 0xffffff }))); const sp = new T.Sprite(new T.SpriteMaterial({ map: R.texSoft, color: c, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); sp.scale.set(34, 34, 1); g.add(sp); return g; }
    if (p.kind === 'stone') { return mesh(new T.DodecahedronGeometry(6, 0), M.rock); }
    return new T.Group();
  };
  R.syncProjectiles = function (projectiles) {
    const seen = new Set();
    for (const p of projectiles) {
      seen.add(p); let m = R.projModels.get(p); if (!m) { m = R.makeProjectile(p); m.castShadow = true; R.scene.add(m); R.projModels.set(p, m); }
      const y = (p.h == null ? 30 : p.h) + (p.height || 0);
      const prev = m.position.clone(); m.position.set(p.x, y, p.y);
      if (p.kind === 'arrow' || p.kind === 'bolt') { if (prev.distanceToSquared(m.position) > 0.01) m.lookAt(m.position.clone().add(m.position.clone().sub(prev))); }
      if (p.kind === 'stone') { m.rotation.x += 0.2; m.rotation.z += 0.13; }
      if (p.kind === 'orb' && Math.random() < 0.6) R.spawnParticle({ x: p.x, y, z: p.y, vx: rand(-15, 15), vy: rand(-10, 10), vz: rand(-15, 15), life: 0.35, size: rand(4, 8), type: 'spark', color: p.color[0], g: 0 });
    }
    for (const [p, m] of R.projModels) if (!seen.has(p)) { R.scene.remove(m); R.projModels.delete(p); }
  };

  // ---------- particles ----------------------------------------------------
  const PTYPE = {
    spark: { tex: 'soft', add: true }, ember: { tex: 'soft', add: true }, wisp: { tex: 'soft', add: true },
    smoke: { tex: 'soft', add: false, grow: 2.2, alpha: 0.45 }, fog: { tex: 'soft', add: false, grow: 1.6, alpha: 0.3 },
    blood: { tex: 'hard', add: false }, debris: { tex: 'hard', add: false }, leaf: { tex: 'hard', add: false, alpha: 0.7 }, snow: { tex: 'soft', add: false, alpha: 0.9 },
  };
  R.spawnParticle = function (p) {
    if (R.particles.length > 500) { const old = R.particles.shift(); R.scene.remove(old.s); old.s.material.dispose(); }
    const t = PTYPE[p.type] || PTYPE.spark;
    const s = new T.Sprite(new T.SpriteMaterial({ map: t.tex === 'hard' ? R.texHard : R.texSoft, color: p.color || 0xffffff, transparent: true, blending: t.add ? T.AdditiveBlending : T.NormalBlending, depthWrite: false, opacity: t.alpha || 1 }));
    s.position.set(p.x, p.y, p.z); s.scale.set(p.size, p.size, 1); s.renderOrder = 5;
    p.s = s; p.age = 0; p.t = t; R.scene.add(s); R.particles.push(p);
  };
  // 2D-style API used by the game: (x, z) ground position; up = vertical impulse
  R.burst = function (x, z, n, o) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.283), sp = rand(o.speed[0], o.speed[1]) * (o.flat ? 1 : 0.8); const up = o.up || 0;
      R.spawnParticle({ x, y: o.y || 4, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rand(up * 0.4, up * 1.3) + (o.flat ? 0 : rand(0, 20)), life: rand(o.life[0], o.life[1]), size: rand(o.size[0], o.size[1]) * ((PTYPE[o.type] || PTYPE.spark).tex === 'hard' ? 1.2 : 2.2), type: o.type, color: o.color, g: o.g || 0 });
    }
  };
  function updateParticles(dt) {
    for (const p of R.particles) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= (p.g || 0) * dt;
      if (p.t.grow) { p.vx *= 0.97; p.vz *= 0.97; p.vy *= 0.97; }
      if (p.y < 1 && (p.type === 'blood' || p.type === 'debris')) { p.y = 1; p.vx = p.vz = 0; p.vy = 0; }
      const k = p.age / p.life; const sz = p.size * (p.t.grow ? 0.5 + k * p.t.grow : (p.type === 'spark' || p.type === 'ember' ? 1 - k * 0.6 : 1));
      p.s.position.set(p.x, p.y, p.z); p.s.scale.set(sz, sz, 1); p.s.material.opacity = (p.t.alpha || 1) * (p.type === 'leaf' || p.type === 'snow' ? Math.sin(k * Math.PI) : 1 - k);
    }
    R.particles = R.particles.filter((p) => { if (p.age >= p.life) { R.scene.remove(p.s); p.s.material.dispose(); return false; } return true; });
  }

  // ---------- effects & floaters -------------------------------------------
  function ringMesh(r, color, width) { const m = new T.Mesh(new T.RingGeometry(1 - (width || 0.12), 1, 40), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 1.5; m.scale.set(r, r, 1); return m; }
  R.ring = function (x, z, r0, r1, dur, color, width) { const m = ringMesh(r0, color || 0xffdc96, width ? width / 40 : 0.1); m.position.x = x; m.position.z = z; R.scene.add(m); R.effects.push({ kind: 'ring', m, r0, r1, dur, age: 0 }); };
  R.effect = function (fx) {
    fx.age = 0;
    if (fx.kind === 'meteor') {
      fx.streaks = fx.streaks.map((s) => { const g = new T.Group(); const rod = new T.Mesh(cyl(2.5, 0.5, 90, 6), new T.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false })); rod.position.y = 45; g.add(rod); const head = new T.Sprite(new T.SpriteMaterial({ map: R.texSoft, color: 0xffe0a0, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); head.scale.set(40, 40, 1); g.add(head); g.visible = false; R.scene.add(g); return Object.assign(s, { g }); });
    } else if (fx.kind === 'firepatch') {
      const s = new T.Sprite(new T.SpriteMaterial({ map: R.texFlame, color: 0xffa040, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); s.position.set(fx.x, fx.r * 1.2, fx.y); s.scale.set(fx.r * 2.2, fx.r * 3.6, 1); R.scene.add(s); fx.s = s;
      const sc = new T.Mesh(new T.CircleGeometry(fx.r * 1.6, 12), new T.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: 0.6, depthWrite: false })); sc.rotation.x = -Math.PI / 2; sc.position.set(fx.x, 0.6, fx.y); R.scene.add(sc); fx.sc = sc;
    } else if (fx.kind === 'frostwave') { fx.m = ringMesh(60, 0xcfefff, 0.15); fx.m.position.set(fx.x, 2, fx.y); R.scene.add(fx.m); }
    else if (fx.kind === 'flash') { const s = new T.Sprite(new T.SpriteMaterial({ map: R.texSoft, color: fx.color || 0xffd090, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); s.position.set(fx.x, fx.h || 10, fx.y); s.scale.set(fx.r * 2.4, fx.r * 2.4, 1); R.scene.add(s); fx.s = s; }
    R.effects.push(fx);
  };
  function updateEffects(dt, time) {
    for (const fx of R.effects) {
      fx.age += dt; const k = Math.min(1, fx.age / fx.dur);
      if (fx.kind === 'ring') { const r = fx.r0 + (fx.r1 - fx.r0) * k; fx.m.scale.set(r, r, 1); fx.m.material.opacity = 1 - k; }
      else if (fx.kind === 'meteor') { for (const s of fx.streaks) { const t = Math.min(1, Math.max(0, (fx.age - s.delay) / (fx.dur - s.delay))); if (t <= 0) continue; s.g.visible = t < 1; const ex = fx.x + s.ox, ez = fx.y + s.oy; const sx = ex + 260, sy = 900, sz = ez + 380; s.g.position.set(sx + (ex - sx) * t, sy * (1 - t), sz + (ez - sz) * t); s.g.lookAt(sx, sy, sz); s.g.rotateX(Math.PI / 2); } }
      else if (fx.kind === 'firepatch') { fx.s.scale.set(fx.r * (2 + Math.sin(time * 19 + fx.x) * 0.4) * (1 - k * 0.5), fx.r * (3.6 + Math.sin(time * 23 + fx.y) * 0.6) * (1 - k * 0.5), 1); fx.s.material.opacity = 1 - k * k; fx.sc.material.opacity = 0.6 * (1 - k); if (Math.random() < dt * 5) R.spawnParticle({ x: fx.x + rand(-fx.r, fx.r), y: 6, z: fx.y + rand(-fx.r, fx.r), vx: rand(-8, 8), vy: rand(25, 50), vz: rand(-8, 8), life: rand(0.5, 1), size: rand(3, 6), type: 'ember', color: 0xffb347, g: 0 }); }
      else if (fx.kind === 'frostwave') { const r = 60 + k * 1400; fx.m.scale.set(r, r, 1); fx.m.material.opacity = 0.6 * (1 - k); }
      else if (fx.kind === 'flash') { fx.s.material.opacity = 1 - k; fx.s.scale.set(fx.r * (2.4 + k * 2), fx.r * (2.4 + k * 2), 1); }
    }
    R.effects = R.effects.filter((fx) => { if (fx.age >= fx.dur) { if (fx.m) R.scene.remove(fx.m); if (fx.s) R.scene.remove(fx.s); if (fx.sc) R.scene.remove(fx.sc); if (fx.streaks) fx.streaks.forEach((s) => R.scene.remove(s.g)); return false; } return true; });
  }
  const textCache = new Map();
  function textTexture(text, color, size) {
    const key = text + '|' + color + '|' + size; if (textCache.has(key)) return textCache.get(key);
    const c = document.createElement('canvas'); c.width = 256; c.height = 96; const ctx = c.getContext('2d');
    ctx.font = `700 ${size * 3}px Cinzel, Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(text, 128, 48); ctx.fillStyle = color; ctx.fillText(text, 128, 48);
    const t = new T.CanvasTexture(c); textCache.set(key, t); return t;
  }
  R.floater = function (x, z, text, color, size) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: textTexture(text, color || '#e2b657', size || 14), transparent: true, depthTest: false })); s.scale.set(44, 16.5, 1); s.position.set(x, 40, z); s.renderOrder = 20; R.scene.add(s); R.floaters.push({ s, age: 0, life: 1.1 });
  };
  function updateFloaters(dt) { for (const f of R.floaters) { f.age += dt; f.s.position.y += 30 * dt; f.s.material.opacity = 1 - (f.age / f.life) ** 2; } R.floaters = R.floaters.filter((f) => { if (f.age >= f.life) { R.scene.remove(f.s); f.s.material.dispose(); return false; } return true; }); }

  // ---------- selection / hints --------------------------------------------
  R.setSelection = function (sel) {
    if (R.selRing) { R.scene.remove(R.selRing); R.selRing = null; } if (R.selMin) { R.scene.remove(R.selMin); R.selMin = null; } if (R.selDisc) { R.scene.remove(R.selDisc); R.selDisc = null; }
    if (!sel) return;
    R.selRing = ringMesh(sel.range, 0xe2b657, 0.02); R.selRing.position.set(sel.x, 1.2, sel.y); R.scene.add(R.selRing);
    R.selDisc = new T.Mesh(new T.CircleGeometry(sel.range, 48), new T.MeshBasicMaterial({ color: 0xe2b657, transparent: true, opacity: 0.08, depthWrite: false })); R.selDisc.rotation.x = -Math.PI / 2; R.selDisc.position.set(sel.x, 1.0, sel.y); R.scene.add(R.selDisc);
    if (sel.minRange) { R.selMin = ringMesh(sel.minRange, 0xd94a3a, 0.04); R.selMin.position.set(sel.x, 1.3, sel.y); R.scene.add(R.selMin); }
  };
  R.setSpellHint = function (h) {
    if (!h) { if (R.hint) { R.scene.remove(R.hint); R.hint = null; } return; }
    if (!R.hint) { R.hint = ringMesh(h.r, 0xff9a3a, 0.05); R.hint.material.opacity = 0.8; R.scene.add(R.hint); }
    R.hint.position.set(h.x, 1.4, h.y); R.hint.scale.set(h.r, h.r, 1);
  };
  R.setPlotStates = function (towers, selectedPlot, time) {
    R.plots.forEach((p, i) => { const empty = !towers[i]; p.ringMat.opacity = !empty ? 0 : (selectedPlot === i ? 0.95 : 0.22 + Math.sin(time * 2.5 + i) * 0.1); });
  };

  // ---------- camera -----------------------------------------------------------
  R.resize = function () {
    const vw = window.innerWidth, vh = window.innerHeight; R.vw = vw; R.vh = vh;
    R.renderer.setSize(vw, vh, false); R.camera.aspect = vw / vh; R.camera.updateProjectionMatrix();
    const tanF = Math.tan(FOV / 2 * Math.PI / 180);
    R.cam.dMax = Math.max(W * 1.08 / (2 * tanF * R.camera.aspect), H * 1.02 * Math.sin(PITCH) / (2 * tanF)) ;
    R.cam.dMin = 240; R.clampCam(); R.updateShadow();
  };
  R.visibleWidth = function () { return 2 * R.cam.dist * Math.tan(FOV / 2 * Math.PI / 180) * R.camera.aspect; };
  R.fitInitial = function () { R.cam.dist = Math.min(R.cam.dMax, Math.max(R.cam.dMin, 540 / (2 * Math.tan(FOV / 2 * Math.PI / 180) * R.camera.aspect))); R.cam.tx = W / 2; R.cam.tz = H * 0.62; R.clampCam(); };
  R.fitMap = function () { R.cam.dist = R.cam.dMax; R.cam.tx = W / 2; R.cam.tz = H / 2 + 20; R.clampCam(); };
  R.clampCam = function () {
    const c = R.cam; c.dist = Math.max(c.dMin, Math.min(c.dMax, c.dist));
    const vw = R.visibleWidth(), vd = vw / R.camera.aspect / Math.sin(PITCH); const m = 40;
    if (vw >= W + m * 2) c.tx = W / 2; else c.tx = Math.max(vw / 2 - m, Math.min(W - vw / 2 + m, c.tx));
    if (vd >= H + m * 2) c.tz = H / 2; else c.tz = Math.max(vd / 2 - m, Math.min(H - vd / 2 + m, c.tz));
    R.applyCamera();
  };
  R.applyCamera = function () {
    const c = R.cam; const sx = R.shakeAmt > 0 ? rand(-1, 1) * R.shakeAmt : 0, sz = R.shakeAmt > 0 ? rand(-1, 1) * R.shakeAmt : 0;
    R.camera.position.set(c.tx + sx, c.dist * Math.sin(PITCH), c.tz + c.dist * Math.cos(PITCH) + sz);
    R.camera.lookAt(c.tx + sx, 0, c.tz + sz);
  };
  R.updateShadow = function () {
    const half = Math.min(1200, R.visibleWidth() * 0.9); const sc = R.sun.shadow.camera; sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix();
  };
  R.pan = function (dx, dy) { const sc = R.visibleWidth() / R.vw; R.cam.tx -= dx * sc; R.cam.tz -= dy * sc / Math.sin(PITCH); R.clampCam(); };
  R.zoomAt = function (factor, sx, sy) {
    const before = R.screenToWorld(sx, sy); R.cam.dist = Math.max(R.cam.dMin, Math.min(R.cam.dMax, R.cam.dist / factor)); R.applyCamera();
    const after = R.screenToWorld(sx, sy); if (before && after) { R.cam.tx += before.x - after.x; R.cam.tz += before.y - after.y; }
    R.clampCam(); R.updateShadow();
  };
  const ray = { rc: null, plane: null, v: null };
  R.screenToWorld = function (sx, sy) {
    if (!ray.rc) { ray.rc = new T.Raycaster(); ray.plane = new T.Plane(new T.Vector3(0, 1, 0), 0); ray.v = new T.Vector3(); }
    ray.rc.setFromCamera({ x: sx / R.vw * 2 - 1, y: -(sy / R.vh) * 2 + 1 }, R.camera);
    const hit = ray.rc.ray.intersectPlane(ray.plane, ray.v); return hit ? { x: hit.x, y: hit.z } : null;
  };
  R.worldToScreen = function (x, h, z) { const v = new T.Vector3(x, h, z).project(R.camera); return { x: (v.x + 1) / 2 * R.vw, y: (1 - v.y) / 2 * R.vh, behind: v.z > 1 }; };
  R.shake = function (s) { R.shakeAmt = Math.max(R.shakeAmt, s); };

  // ---------- frame ----------------------------------------------------------
  R.render = function (dt, time, state) {
    R.time = time;
    if (R.shakeAmt > 0) R.shakeAmt = Math.max(0, R.shakeAmt - dt * 30);
    R.applyCamera();
    R.scene.fog.near = R.cam.dist * 1.6; R.scene.fog.far = R.cam.dist * 3.2;
    // sun follows the camera target
    R.sun.position.copy(R.sunDir).multiplyScalar(900).add(new T.Vector3(R.cam.tx, 0, R.cam.tz)); R.sun.target.position.set(R.cam.tx, 0, R.cam.tz); R.sun.target.updateMatrixWorld();
    R.waterMat.map.offset.x -= dt * 0.12; R.waterMat2.map.offset.x -= dt * 0.2;
    if (R.torchSprites) R.torchSprites.forEach((s, i) => { const f = 0.85 + Math.sin(time * 13 + i) * 0.12 + Math.sin(time * 29 + i * 2) * 0.06; s.scale.set(12 * f, 20 * f, 1); });
    R.gateLight.intensity = 2600 + Math.sin(time * 11) * 500;
    if (R.portalGlow) { const f = 0.75 + Math.sin(time * 2.2) * 0.15; R.portalGlow.scale.set(140 * f, 140 * f, 1); }
    if (R.flags) for (const f of R.flags) { f.rotation.y = Math.sin(time * 3 + f.position.x) * 0.25; }
    if (R.selRing) R.selRing.rotation.z = time * 0.4;
    updateParticles(dt); updateEffects(dt, time); updateFloaters(dt);
    // ambience
    if (Math.random() < dt * 2) R.spawnParticle({ x: rand(R.cam.tx - 400, R.cam.tx + 400), y: rand(10, 60), z: rand(R.cam.tz - 500, R.cam.tz + 300), vx: rand(8, 25), vy: rand(-6, 2), vz: rand(5, 15), life: rand(3, 6), size: rand(2, 4), type: 'leaf', color: 0xd8cf6a, g: 0 });
    if (Math.random() < dt * 4) { const g = R.level.gate; R.spawnParticle({ x: g.x + rand(-5, 30), y: rand(4, 30), z: g.y + rand(-40, 40), vx: rand(5, 22), vy: rand(2, 8), vz: rand(-6, 6), life: rand(2, 4), size: rand(24, 48), type: 'fog', color: 0x6a4a8a, g: 0 }); }
    R.renderer.render(R.scene, R.camera);
  };

  // ---------- icons: render a tower model to a data URL ----------------------
  R.towerIcon = function (type, level, size) {
    size = size || 128; R.iconCache = R.iconCache || {}; const key = type + level + size; if (R.iconCache[key]) return R.iconCache[key];
    const scene = new T.Scene(); scene.add(new T.HemisphereLight(0xffffff, 0x556633, 2.2)); const dl = new T.DirectionalLight(0xfff0d8, 3.2); dl.position.set(-60, 120, 90); scene.add(dl);
    const m = R.makeTower(type, level); scene.add(m); const cam = new T.PerspectiveCamera(30, 1, 10, 1000);
    const h = { archer: 80, ballista: 50, mage: 125, catapult: 40 }[type] + level * 8;
    cam.position.set(90, h * 0.75 + 70, 150); cam.lookAt(0, h * 0.5, 0);
    const rt = new T.WebGLRenderTarget(size, size); const prev = R.renderer.getRenderTarget(); const bg = scene.background; scene.background = null;
    R.renderer.setRenderTarget(rt); R.renderer.setClearColor(0x000000, 0); R.renderer.clear(); R.renderer.render(scene, cam); const px = new Uint8Array(size * size * 4); R.renderer.readRenderTargetPixels(rt, 0, 0, size, size, px); R.renderer.setRenderTarget(prev); rt.dispose();
    const c = document.createElement('canvas'); c.width = size; c.height = size; const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0); const url = c.toDataURL(); R.iconCache[key] = url; m.traverse((o) => { if (o.isMesh && o.material && o.material.map == null) { /* shared materials kept */ } }); return url;
  };

  TD.R3 = R;
})(window.TD);
