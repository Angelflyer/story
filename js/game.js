// ---------------------------------------------------------------------------
// Ravenhold — game state, simulation, camera, input and frame rendering
// ---------------------------------------------------------------------------
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  const R = () => TD.Render, A = () => TD.Audio, UI = () => TD.UI;
  const TAU = Math.PI * 2;
  const W = TD.WORLD.w, H = TD.WORLD.h;

  const G = {
    canvas: null, ctx: null, dpr: 1, vw: 0, vh: 0,
    bg: null, bgScale: 1, path: null,
    cam: { x: W / 2, y: H * 0.6, zoom: 0.8 }, minZoom: 0.3, maxZoom: 1.9,
    time: 0, running: false, paused: false, over: false, won: false, speed: 1,
    gold: 0, lives: 0, waveIndex: 0, spawners: [], enemies: [], towers: [], projectiles: [], particles: [], effects: [], floaters: [],
    selected: null, // {kind:'plot'|'tower', index}
    casting: null, cooldowns: { fire: 0, frost: 0 }, spellHint: null,
    shake: 0, shakeX: 0, shakeY: 0, flash: 0, frost: 0, lastHorn: 0,
    stats: { kills: 0, leaks: 0, spent: 0 },
    pointer: { down: false, moved: false, sx: 0, sy: 0, lx: 0, ly: 0, t: 0, pinch: null, pointers: new Map() },
  };

  // ---------- setup ---------------------------------------------------------
  G.init = function (canvas) {
    G.canvas = canvas; G.ctx = canvas.getContext('2d', { alpha: false });
    G.path = TD.buildPath(TD.LEVEL.path, TD.LEVEL.cornerRadius, 4);
    G.resize();
    window.addEventListener('resize', () => G.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => G.resize(), 250));
    G.bindInput();
    G.bgScale = Math.min(2, Math.max(1, G.dpr));
    G.bg = R().buildBackground(TD.LEVEL, G.path, G.bgScale);
    G.fitInitial();
    requestAnimationFrame(G.frame);
  };

  G.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const vw = window.innerWidth, vh = window.innerHeight;
    G.dpr = dpr; G.vw = vw; G.vh = vh;
    G.canvas.width = Math.round(vw * dpr); G.canvas.height = Math.round(vh * dpr);
    G.canvas.style.width = vw + 'px'; G.canvas.style.height = vh + 'px';
    G.minZoom = Math.min(vw / (W + 40), vh / (H + 40));
    G.clampCam();
  };

  G.fitInitial = function () {
    // show ~520 world units across on phones; whole map on wide screens
    const z = Math.max(G.minZoom, Math.min(1.1, G.vw / 520));
    G.cam.zoom = z; G.cam.x = W / 2; G.cam.y = H * 0.62; G.clampCam();
  };
  G.fitMap = function () { G.cam.zoom = G.minZoom; G.cam.x = W / 2; G.cam.y = H / 2; G.clampCam(); };

  G.clampCam = function () {
    const c = G.cam; c.zoom = Math.max(G.minZoom, Math.min(G.maxZoom, c.zoom));
    const halfW = G.vw / 2 / c.zoom, halfH = G.vh / 2 / c.zoom; const m = 30;
    if (halfW * 2 >= W + m * 2) c.x = W / 2; else c.x = Math.max(halfW - m, Math.min(W - halfW + m, c.x));
    if (halfH * 2 >= H + m * 2) c.y = H / 2; else c.y = Math.max(halfH - m, Math.min(H - halfH + m, c.y));
  };
  G.toWorld = function (sx, sy) { return { x: (sx - G.vw / 2) / G.cam.zoom + G.cam.x, y: (sy - G.vh / 2) / G.cam.zoom + G.cam.y }; };
  G.toScreen = function (wx, wy) { return { x: (wx - G.cam.x) * G.cam.zoom + G.vw / 2, y: (wy - G.cam.y) * G.cam.zoom + G.vh / 2 }; };
  G.zoomAt = function (factor, sx, sy) {
    const before = G.toWorld(sx, sy); G.cam.zoom = Math.max(G.minZoom, Math.min(G.maxZoom, G.cam.zoom * factor));
    const after = G.toWorld(sx, sy); G.cam.x += before.x - after.x; G.cam.y += before.y - after.y; G.clampCam();
  };

  // ---------- new game -------------------------------------------------------
  G.newGame = function () {
    G.gold = TD.LEVEL.startGold; G.lives = TD.LEVEL.lives; G.waveIndex = 0; G.spawners = [];
    G.enemies = []; G.towers = TD.LEVEL.plots.map(() => null); G.projectiles = []; G.particles = []; G.effects = []; G.floaters = [];
    G.selected = null; G.casting = null; G.cooldowns = { fire: 0, frost: 0 }; G.over = false; G.won = false; G.paused = false; G.speed = 1;
    G.shake = 0; G.flash = 0; G.frost = 0; G.time = 0; G.stats = { kills: 0, leaks: 0, spent: 0 };
    G.running = true; G.fitInitial();
    UI().refreshAll();
  };

  // ---------- helpers ----------------------------------------------------------
  const rand = (a, b) => a + Math.random() * (b - a);
  G.addParticle = function (p) { if (G.particles.length > 700) G.particles.shift(); p.age = 0; G.particles.push(p); };
  G.burst = function (x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(opts.speed[0], opts.speed[1]);
      G.addParticle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * (opts.flat ? 0.5 : 1) - (opts.up || 0), life: rand(opts.life[0], opts.life[1]), size: rand(opts.size[0], opts.size[1]), type: opts.type, color: opts.color, g: opts.g || 0, height: 0 });
    }
  };
  G.floater = function (x, y, text, color, size) { G.floaters.push({ x, y, text, color: color || '#e2b657', size: size || 14, life: 1.1, age: 0 }); };
  G.ring = function (x, y, r0, r1, dur, color, width) { G.effects.push({ kind: 'ring', x, y, r0, r1, dur, age: 0, color: color || 'rgba(255,220,150,0.8)', width: width || 3 }); };
  G.shakeCam = function (s) { G.shake = Math.max(G.shake, s); };
  function pan(x) { return Math.max(-0.8, Math.min(0.8, (G.toScreen(x, 0).x / G.vw - 0.5) * 1.6)); }
  G.sfxAt = function (name, x, opts) { opts = opts || {}; opts.pan = pan(x); return A().play(name, opts); };
  G.sfxAny = function (names, x, opts) { return G.sfxAt(names[Math.floor(Math.random() * names.length)], x, opts); };

  // ---------- towers -----------------------------------------------------------
  G.towerAt = function (i) { return G.towers[i]; };
  G.canBuild = function (type) { return G.gold >= TD.TOWERS[type].cost; };
  G.build = function (plotIndex, type) {
    const def = TD.TOWERS[type]; if (!def || G.towers[plotIndex]) return false;
    if (G.gold < def.cost) { UI().toast('Not enough gold'); A().play('ui_close'); return false; }
    const [x, y] = TD.LEVEL.plots[plotIndex];
    G.gold -= def.cost; G.stats.spent += def.cost;
    const t = { type, def, level: 0, x, y, plot: plotIndex, angle: -Math.PI / 2, cd: 0, fireT: 9, invested: def.cost, target: null, kills: 0 };
    G.towers[plotIndex] = t;
    G.burst(x, y, 16, { speed: [20, 90], life: [0.4, 0.9], size: [2, 5], type: 'smoke', color: '#b9ad95', up: 20, flat: true });
    G.ring(x, y, 10, 60, 0.6, 'rgba(226,182,87,0.9)', 3);
    G.sfxAt('build', x, { vol: 0.9, vary: 0.05 }); setTimeout(() => G.sfxAt('gold', x, { vol: 0.5 }), 90);
    G.select({ kind: 'tower', index: plotIndex });
    return true;
  };
  G.upgradeCost = function (t) { return t.level < 2 ? t.def.upgrade[t.level] : null; };
  G.upgrade = function (t) {
    const c = G.upgradeCost(t); if (c == null) return false;
    if (G.gold < c) { UI().toast('Not enough gold'); A().play('ui_close'); return false; }
    G.gold -= c; G.stats.spent += c; t.invested += c; t.level++;
    G.ring(t.x, t.y - 20, 8, 70, 0.7, 'rgba(255,240,180,0.95)', 3);
    G.burst(t.x, t.y - 30, 22, { speed: [30, 110], life: [0.5, 1.0], size: [1.5, 3], type: 'spark', color: '#ffe08a', up: 40 });
    G.sfxAt('upgrade', t.x, { vol: 0.9 }); G.sfxAt('build', t.x, { vol: 0.5, rate: 1.2 });
    UI().refreshAll();
    return true;
  };
  G.sellValue = function (t) { return Math.round(t.invested * TD.SELL_RATIO); };
  G.sell = function (t) {
    G.gold += G.sellValue(t); G.towers[t.plot] = null; G.select(null);
    G.burst(t.x, t.y, 14, { speed: [20, 80], life: [0.4, 0.8], size: [2, 5], type: 'smoke', color: '#b9ad95', up: 10, flat: true });
    G.floater(t.x, t.y - 40, '+' + G.sellValue(t), '#e2b657');
    G.sfxAt('sell', t.x, { vol: 0.9 }); G.sfxAt('gold', t.x, { vol: 0.6 });
    UI().refreshAll();
  };
  G.select = function (sel) { G.selected = sel; UI().onSelect(sel); };

  // ---------- waves -----------------------------------------------------------
  G.wavesLeft = function () { return TD.WAVES.length - G.waveIndex; };
  G.waveActive = function () { return G.spawners.length > 0 || G.enemies.length > 0; };
  G.startWave = function () {
    if (G.over || G.waveIndex >= TD.WAVES.length) return false;
    const w = TD.WAVES[G.waveIndex]; const q = []; let t = 0.6;
    for (const g of w.groups) { t += g.delay || 0; for (let i = 0; i < g.n; i++) { q.push({ time: t, type: g.t }); t += g.gap; } }
    G.spawners.push({ wave: G.waveIndex, timer: 0, queue: q });
    G.waveIndex++;
    UI().banner('Wave ' + G.waveIndex, w.name);
    A().play(['horn1', 'horn2', 'horn3', 'horn4'][G.waveIndex % 4], { vol: 0.8 });
    if (w.groups.some((g) => TD.ENEMIES[g.t].boss)) setTimeout(() => A().play('wardrums', { vol: 0.5 }), 800);
    UI().refreshAll();
    return true;
  };

  G.spawn = function (type) {
    const def = TD.ENEMIES[type];
    const e = { type, def, hp: def.hp, maxHp: def.hp, dist: 0, off: rand(-13, 13), x: 0, y: 0, dx: 1, dy: 0, walkT: rand(0, 6), slowT: 0, slowAmt: 0, burnT: 0, burnDps: 0, hitT: 0, dead: false, id: Math.random() };
    G.enemies.push(e); G.positionEnemy(e);
    G.burst(e.x, e.y, 6, { speed: [10, 30], life: [0.6, 1.2], size: [6, 12], type: 'fog', color: '#2a1638' });
    if (def.boss) { UI().banner(def.name, 'approaches'); G.sfxAt(def.sfx === 'ogre' ? 'ugg' : 'troll_hit1', e.x, { vol: 1, rate: 0.7 }); G.shakeCam(6); }
    else if (type === 'wolf' && Math.random() < 0.3) G.sfxAny(['wolf_growl1', 'wolf_growl2'], e.x, { vol: 0.35 });
    else if (type === 'rider' && Math.random() < 0.5) G.sfxAt('horse_canter', e.x, { vol: 0.35 });
  };
  G.positionEnemy = function (e) {
    const p = TD.pathPos(G.path, e.dist);
    e.x = p.x - p.dy * e.off; e.y = p.y + p.dx * e.off; e.dx = p.dx; e.dy = p.dy;
  };

  G.damage = function (e, dmg, dtype, src) {
    if (e.dead) return;
    if (dtype === 'phys') dmg *= (1 - e.def.armor); else if (dtype === 'magic') dmg *= (1 - e.def.resist);
    e.hp -= dmg; e.hitT = 0.12;
    if (e.hp <= 0) G.kill(e, src);
    else if (Math.random() < 0.35) G.sfxAny([e.def.sfx + '_hit1', e.def.sfx + '_hit2'], e.x, { vol: 0.35, vary: 0.08, throttle: 120 });
  };
  G.kill = function (e, src) {
    e.dead = true; G.stats.kills++;
    G.gold += e.def.gold; G.floater(e.x, e.y - e.def.size * 2, '+' + e.def.gold, '#e2b657', e.def.boss ? 20 : 13);
    if (src && src.tower) src.tower.kills++;
    const s = e.def.size;
    if (e.type === 'skeleton') G.burst(e.x, e.y - s, 12, { speed: [10, 50], life: [0.5, 1.0], size: [1.5, 3.5], type: 'wisp', color: '#bfe9ff', up: 30 });
    else G.burst(e.x, e.y - s * 0.6, 10 + (s | 0), { speed: [30, 120], life: [0.3, 0.7], size: [1.5, 3.5], type: 'blood', color: e.type === 'troll' || e.type === 'chieftain' ? '#3a4a58' : '#5a1212', g: 300, up: 60 });
    G.burst(e.x, e.y, 6, { speed: [10, 40], life: [0.5, 0.9], size: [4, 9], type: 'smoke', color: '#8a7a60', up: 15, flat: true });
    G.sfxAny([e.def.sfx + '_die1', e.def.sfx + '_die2'], e.x, { vol: e.def.boss ? 1 : 0.6, vary: 0.06, throttle: 90 });
    if (e.def.boss) { G.shakeCam(10); G.ring(e.x, e.y, 10, 120, 0.9, 'rgba(255,200,120,0.9)', 4); A().play('fanfare', { vol: 0.7 }); }
  };
  G.leak = function (e) {
    e.dead = true; G.lives--; G.stats.leaks++;
    G.flash = 0.6; G.shakeCam(5);
    G.sfxAt('impact', e.x, { vol: 0.9 }); A().play('wail', { vol: 0.5, throttle: 400 });
    G.floater(TD.LEVEL.castle.x, TD.LEVEL.castle.y - 90, '-1', '#ff6b5a', 20);
    if (G.lives <= 0) G.endGame(false);
  };

  G.endGame = function (won) {
    if (G.over) return; G.over = true; G.won = won; G.casting = null; G.select(null);
    A().stopMusic(0.8);
    setTimeout(() => { A().playTrack(won ? 'victory' : 'defeat', { fade: 0.2 }); }, 700);
    setTimeout(() => UI().showEnd(won), won ? 1400 : 1200);
  };

  // ---------- spells -----------------------------------------------------------
  G.spellReady = function (id) { return G.cooldowns[id] <= 0 && !G.over; };
  G.beginCast = function (id) {
    if (!G.spellReady(id)) return;
    const sp = TD.SPELLS[id];
    if (sp.targeted) { G.casting = (G.casting === id) ? null : id; G.select(null); UI().onCastingChange(); A().play('ui_open', { vol: 0.6 }); }
    else G.cast(id, 0, 0);
  };
  G.cast = function (id, x, y) {
    const sp = TD.SPELLS[id]; G.cooldowns[id] = sp.cooldown; G.casting = null; UI().onCastingChange();
    if (id === 'fire') {
      G.effects.push({ kind: 'meteor', x, y, r: sp.radius, age: 0, dur: 0.75, done: false, streaks: Array.from({ length: 6 }, () => ({ ox: rand(-sp.radius * 0.7, sp.radius * 0.7), oy: rand(-sp.radius * 0.6, sp.radius * 0.6), delay: rand(0, 0.25) })) });
      G.sfxAt('flame', x, { vol: 0.9 }); A().play('rumble', { vol: 0.5 });
      G.effects.push({ kind: 'firecircle', x, y, r: sp.radius, age: 0, dur: 0.75 });
    } else if (id === 'frost') {
      for (const e of G.enemies) { e.slowT = Math.max(e.slowT, sp.duration); e.slowAmt = Math.max(e.slowAmt, sp.slow); G.burst(e.x, e.y - e.def.size, 6, { speed: [10, 40], life: [0.6, 1.2], size: [1.5, 3], type: 'snow', color: '#e8f7ff', up: 10 }); }
      G.frost = 1; A().play('frost', { vol: 1 }); A().play('holy', { vol: 0.5, rate: 0.8 });
      G.effects.push({ kind: 'frostwave', x: W / 2, y: H / 2, age: 0, dur: 1.2 });
      for (let i = 0; i < 80; i++) G.addParticle({ x: rand(0, W), y: rand(0, H), vx: rand(-10, 10), vy: rand(15, 40), life: rand(1.5, 3), size: rand(1.5, 3.5), type: 'snow', color: '#ffffff', g: 0 });
    }
  };
  function meteorImpact(fx) {
    const sp = TD.SPELLS.fire;
    for (const e of G.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - fx.x, e.y - fx.y); if (d < sp.radius + e.def.size * 0.5) { G.damage(e, sp.dmg * (d < sp.radius * 0.5 ? 1 : 0.7), 'magic'); e.burnT = sp.burnDur; e.burnDps = sp.burn; } }
    G.shakeCam(12); G.sfxAt('explosion', fx.x, { vol: 1 }); G.sfxAt('fire', fx.x, { vol: 0.7 });
    G.ring(fx.x, fx.y, 20, sp.radius * 1.3, 0.6, 'rgba(255,170,60,0.9)', 5);
    G.burst(fx.x, fx.y, 40, { speed: [60, 260], life: [0.4, 1.1], size: [2, 5], type: 'ember', color: '#ffb347', up: 80, g: 200 });
    G.burst(fx.x, fx.y, 24, { speed: [20, 70], life: [1.2, 2.4], size: [10, 22], type: 'smoke', color: '#2a2420', up: 40, flat: true });
    for (let i = 0; i < 7; i++) G.effects.push({ kind: 'firepatch', x: fx.x + rand(-sp.radius * 0.8, sp.radius * 0.8), y: fx.y + rand(-sp.radius * 0.7, sp.radius * 0.7), age: 0, dur: rand(2.2, 3.4), r: rand(7, 13) });
  }

  // ---------- update -----------------------------------------------------------
  G.update = function (dt) {
    if (!G.running || G.paused || G.over && G.enemies.length === 0) { if (G.running && !G.paused) G.updateFx(dt); return; }
    G.time += dt;
    for (const k in G.cooldowns) if (G.cooldowns[k] > 0) G.cooldowns[k] = Math.max(0, G.cooldowns[k] - dt);
    // spawners
    for (const s of G.spawners) { s.timer += dt; while (s.queue.length && s.queue[0].time <= s.timer) { G.spawn(s.queue.shift().type); } }
    G.spawners = G.spawners.filter((s) => s.queue.length > 0);
    // enemies
    for (const e of G.enemies) {
      if (e.dead) continue;
      let sp = e.def.speed;
      if (e.slowT > 0) { e.slowT -= dt; sp *= (1 - e.slowAmt); if (e.slowT <= 0) e.slowAmt = 0; }
      if (e.burnT > 0) { e.burnT -= dt; e.hp -= e.burnDps * dt; if (e.hp <= 0) { G.kill(e); continue; } if (Math.random() < dt * 10) G.addParticle({ x: e.x + rand(-6, 6), y: e.y - e.def.size, vx: rand(-10, 10), vy: rand(-50, -20), life: rand(0.3, 0.6), size: rand(1.5, 3), type: 'ember', color: '#ffb347', g: 0 }); }
      if (e.def.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.def.regen * dt);
      e.dist += sp * dt; e.walkT += dt * (sp / 60);
      if (e.hitT > 0) e.hitT -= dt;
      if (e.dist >= G.path.length) { G.leak(e); continue; }
      G.positionEnemy(e);
    }
    G.enemies = G.enemies.filter((e) => !e.dead);
    // towers
    for (const t of G.towers) {
      if (!t) continue; const lv = t.def.levels[t.level];
      t.cd -= dt; t.fireT += dt;
      // acquire target: furthest along the road inside range
      let best = null, bestD = -1;
      for (const e of G.enemies) { const d = Math.hypot(e.x - t.x, e.y - t.y); if (d <= lv.range && d >= (lv.minRange || 0) && e.dist > bestD) { best = e; bestD = e.dist; } }
      t.target = best;
      if (best) {
        const want = Math.atan2(best.y - t.y, best.x - t.x); let da = want - t.angle; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        t.angle += da * Math.min(1, dt * 10);
        if (t.cd <= 0) { G.fire(t, best, lv); t.cd = 1 / lv.rate; t.fireT = 0; }
      }
    }
    // projectiles
    for (const p of G.projectiles) G.updateProjectile(p, dt);
    G.projectiles = G.projectiles.filter((p) => !p.dead);
    // wave completion / victory
    if (!G.over && G.waveIndex >= TD.WAVES.length && G.spawners.length === 0 && G.enemies.length === 0) G.endGame(true);
    G.updateFx(dt);
    UI().refreshHud();
  };

  G.updateFx = function (dt) {
    for (const p of G.particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; if (p.type === 'smoke' || p.type === 'fog') { p.vx *= 0.98; p.vy *= 0.98; } }
    G.particles = G.particles.filter((p) => p.age < p.life);
    for (const f of G.floaters) { f.age += dt; f.y -= 28 * dt; }
    G.floaters = G.floaters.filter((f) => f.age < f.life);
    for (const fx of G.effects) {
      fx.age += dt;
      if (fx.kind === 'meteor' && !fx.done && fx.age >= fx.dur) { fx.done = true; meteorImpact(fx); }
    }
    G.effects = G.effects.filter((fx) => fx.age < fx.dur + (fx.kind === 'meteor' ? 0 : 0));
    if (G.shake > 0) { G.shake = Math.max(0, G.shake - dt * 30); G.shakeX = rand(-1, 1) * G.shake; G.shakeY = rand(-1, 1) * G.shake; } else { G.shakeX = G.shakeY = 0; }
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 1.5);
    if (G.frost > 0) G.frost = Math.max(0, G.frost - dt * 0.35);
    // ambient motes
    if (Math.random() < dt * 3) G.addParticle({ x: rand(G.cam.x - G.vw / G.cam.zoom, G.cam.x + G.vw / G.cam.zoom), y: rand(G.cam.y - G.vh / G.cam.zoom, G.cam.y + G.vh / G.cam.zoom), vx: rand(10, 30), vy: rand(5, 20), life: rand(3, 6), size: rand(1.5, 3), type: 'leaf', color: '#c9c06a', g: 0 });
    if (Math.random() < dt * 4) { const g = TD.LEVEL.gate; G.addParticle({ x: g.x + rand(-10, 30), y: g.y + rand(-40, 40), vx: rand(5, 25), vy: rand(-12, 6), life: rand(2, 4), size: rand(10, 22), type: 'fog', color: '#2a1638', g: 0 }); }
  };

  // ---------- projectiles -------------------------------------------------------
  G.fire = function (t, target, lv) {
    const def = t.def; const sx = t.x, sy = t.y - (def.id === 'mage' ? 100 + t.level * 10 : def.id === 'archer' ? 58 + t.level * 8 : 34);
    if (def.projectile === 'arrow') {
      G.projectiles.push({ kind: 'arrow', x: sx, y: sy, vx: 0, vy: 0, speed: 560, target, dmg: lv.dmg, dtype: lv.dtype, tower: t, height: 0, age: 0 });
      G.sfxAt(Math.random() < 0.5 ? 'bow' : 'bow2', t.x, { vol: 0.45, vary: 0.08, throttle: 60 });
    } else if (def.projectile === 'bolt') {
      const a = Math.atan2(target.y - sy, target.x - sx); const sp = 760;
      G.projectiles.push({ kind: 'bolt', x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, maxDist: lv.range + 60, travelled: 0, hit: new Set(), pierce: lv.pierce, dmg: lv.dmg, dtype: lv.dtype, tower: t, height: 0, age: 0 });
      G.sfxAt(Math.random() < 0.5 ? 'crossbow' : 'crossbow2', t.x, { vol: 0.7, vary: 0.06 });
    } else if (def.projectile === 'orb') {
      const colors = [['#8fd8ff', '#2a7fd0'], ['#c99cff', '#6a2fd0'], ['#ffffff', '#c0a0ff']][t.level];
      G.projectiles.push({ kind: 'orb', x: sx, y: sy, vx: 0, vy: 0, speed: 400, target, dmg: lv.dmg, dtype: lv.dtype, slow: lv.slow, slowDur: lv.slowDur, color: colors, tower: t, height: 0, age: 0, trail: 0 });
      G.sfxAny(['magic1', 'magic2', 'magic3'], t.x, { vol: 0.5, vary: 0.05 });
    } else if (def.projectile === 'stone') {
      // lead the target
      const d = Math.hypot(target.x - sx, target.y - sy); const T = Math.max(0.5, d / 300);
      let tsp = target.def.speed * (target.slowT > 0 ? 1 - target.slowAmt : 1);
      const lead = TD.pathPos(G.path, target.dist + tsp * T * 0.9);
      const tx = lead.x - lead.dy * target.off, ty = lead.y + lead.dx * target.off;
      G.projectiles.push({ kind: 'stone', x: sx, y: sy, sx, sy, tx, ty, T, age: 0, vx: 0, vy: 0, dmg: lv.dmg, dtype: lv.dtype, splash: lv.splash, tower: t, height: 0 });
      G.sfxAt('catapult', t.x, { vol: 0.8, vary: 0.05 }); G.sfxAt('throw', t.x, { vol: 0.5 });
    }
  };

  G.updateProjectile = function (p, dt) {
    p.age += dt;
    if (p.kind === 'arrow' || p.kind === 'orb') {
      const tg = p.target; const tx = tg.dead ? p.lastX : tg.x, ty = tg.dead ? p.lastY : tg.y - tg.def.size * 0.8;
      if (!tg.dead) { p.lastX = tg.x; p.lastY = ty; }
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      p.vx = dx / (d || 1) * p.speed; p.vy = dy / (d || 1) * p.speed;
      if (p.kind === 'arrow') p.height = Math.sin(Math.min(1, p.age * 1.8) * Math.PI) * 18;
      if (p.kind === 'orb' && (p.trail += dt) > 0.02) { p.trail = 0; G.addParticle({ x: p.x, y: p.y, vx: rand(-15, 15), vy: rand(-15, 15), life: 0.35, size: rand(2, 4), type: 'spark', color: p.color[0], g: 0 }); }
      if (d <= step + 4) {
        p.dead = true;
        if (!tg.dead) {
          G.damage(tg, p.dmg, p.dtype, { tower: p.tower });
          if (p.kind === 'orb') { if (p.slow) { tg.slowT = Math.max(tg.slowT, p.slowDur); tg.slowAmt = Math.max(tg.slowAmt, p.slow); } G.burst(tg.x, ty, 8, { speed: [20, 90], life: [0.2, 0.5], size: [1.5, 3], type: 'spark', color: p.color[0], g: 0 }); G.sfxAt('faerie', tg.x, { vol: 0.25, throttle: 150, rate: 1.4 }); }
          else { G.sfxAt('flesh', tg.x, { vol: 0.35, vary: 0.1, throttle: 70 }); }
        }
      } else { p.x += p.vx * dt; p.y += p.vy * dt; }
    } else if (p.kind === 'bolt') {
      const step = Math.hypot(p.vx, p.vy) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.travelled += step;
      for (const e of G.enemies) {
        if (e.dead || p.hit.has(e.id)) continue;
        if (Math.hypot(e.x - p.x, e.y - e.def.size * 0.7 - p.y) < e.def.size + 8) {
          p.hit.add(e.id); G.damage(e, p.dmg, p.dtype, { tower: p.tower }); G.sfxAt('flesh', e.x, { vol: 0.5, vary: 0.1, throttle: 70 });
          G.burst(e.x, e.y - e.def.size * 0.7, 5, { speed: [30, 100], life: [0.2, 0.4], size: [1, 2.5], type: 'blood', color: '#5a1212', g: 300 });
          if (p.hit.size >= p.pierce) { p.dead = true; break; }
        }
      }
      if (p.travelled > p.maxDist || p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) p.dead = true;
    } else if (p.kind === 'stone') {
      const k = Math.min(1, p.age / p.T);
      p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k; p.height = Math.sin(k * Math.PI) * 120;
      if (k >= 1) {
        p.dead = true;
        for (const e of G.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - p.tx, e.y - p.ty); if (d < p.splash + e.def.size * 0.5) G.damage(e, p.dmg * (d < p.splash * 0.5 ? 1 : 0.65), p.dtype, { tower: p.tower }); }
        G.shakeCam(3); G.sfxAt('impact', p.tx, { vol: 0.8, vary: 0.08 }); G.sfxAt('cavein', p.tx, { vol: 0.25, rate: 1.6, throttle: 200 });
        G.ring(p.tx, p.ty, 6, p.splash * 1.1, 0.4, 'rgba(200,180,140,0.8)', 3);
        G.burst(p.tx, p.ty, 14, { speed: [20, 90], life: [0.5, 1.1], size: [6, 14], type: 'smoke', color: '#9c8a6a', up: 20, flat: true });
        G.burst(p.tx, p.ty, 10, { speed: [60, 160], life: [0.3, 0.6], size: [1.5, 3], type: 'debris', color: '#5e5850', g: 400, up: 120 });
      }
    }
  };

  // ---------- input ----------------------------------------------------------
  G.bindInput = function () {
    const c = G.canvas, P = G.pointer;
    const pos = (ev) => ({ x: ev.clientX, y: ev.clientY });
    c.addEventListener('pointerdown', (ev) => {
      c.setPointerCapture && c.setPointerCapture(ev.pointerId);
      P.pointers.set(ev.pointerId, pos(ev));
      if (P.pointers.size === 1) { const p = pos(ev); P.down = true; P.moved = false; P.sx = p.x; P.sy = p.y; P.lx = p.x; P.ly = p.y; P.t = performance.now(); }
      else if (P.pointers.size === 2) { const [a, b] = [...P.pointers.values()]; P.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; P.moved = true; }
      if (G.casting) G.spellHint = G.toWorld(ev.clientX, ev.clientY);
    });
    c.addEventListener('pointermove', (ev) => {
      if (!P.pointers.has(ev.pointerId)) { if (G.casting) G.spellHint = G.toWorld(ev.clientX, ev.clientY); return; }
      P.pointers.set(ev.pointerId, pos(ev));
      if (P.pointers.size >= 2 && P.pinch) {
        const [a, b] = [...P.pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        G.zoomAt(d / (P.pinch.d || d), cx, cy);
        G.cam.x -= (cx - P.pinch.cx) / G.cam.zoom; G.cam.y -= (cy - P.pinch.cy) / G.cam.zoom; G.clampCam();
        P.pinch = { d, cx, cy };
        return;
      }
      if (!P.down) return;
      const p = pos(ev);
      if (!P.moved && Math.hypot(p.x - P.sx, p.y - P.sy) > 9) P.moved = true;
      if (P.moved) { G.cam.x -= (p.x - P.lx) / G.cam.zoom; G.cam.y -= (p.y - P.ly) / G.cam.zoom; G.clampCam(); }
      P.lx = p.x; P.ly = p.y;
      if (G.casting) G.spellHint = G.toWorld(p.x, p.y);
    });
    const up = (ev) => {
      const had = P.pointers.has(ev.pointerId); P.pointers.delete(ev.pointerId);
      if (P.pointers.size < 2) P.pinch = null;
      if (P.pointers.size === 0 && had) {
        const p = pos(ev); const tap = P.down && !P.moved && performance.now() - P.t < 450 && Math.hypot(p.x - P.sx, p.y - P.sy) < 12;
        P.down = false;
        if (tap && ev.type !== 'pointercancel') G.onTap(p.x, p.y);
      }
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (ev) => { ev.preventDefault(); G.zoomAt(ev.deltaY < 0 ? 1.12 : 0.89, ev.clientX, ev.clientY); }, { passive: false });
    c.addEventListener('contextmenu', (ev) => ev.preventDefault());
    document.addEventListener('gesturestart', (ev) => ev.preventDefault());
  };

  G.onTap = function (sx, sy) {
    if (!G.running || G.paused) return;
    const w = G.toWorld(sx, sy);
    if (G.casting) {
      const id = G.casting;
      if (w.x < -30 || w.x > W + 30 || w.y < -30 || w.y > H + 30) return;
      G.cast(id, w.x, w.y); return;
    }
    // towers/plots (hit radius generous for fingers)
    let best = -1, bestD = 1e9;
    TD.LEVEL.plots.forEach((p, i) => { const t = G.towers[i]; const d = Math.hypot(w.x - p[0], w.y - (p[1] - (t ? 30 : 0))); const rad = t ? 58 : 46; if (d < rad && d < bestD) { best = i; bestD = d; } });
    if (best >= 0) { A().play('ui_tap', { vol: 0.5 }); G.select({ kind: G.towers[best] ? 'tower' : 'plot', index: best }); return; }
    if (G.selected) { G.select(null); A().play('ui_close', { vol: 0.35 }); }
  };

  // ---------- frame ----------------------------------------------------------
  let last = 0;
  G.frame = function (ts) {
    requestAnimationFrame(G.frame);
    const raw = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    const dt = raw * (G.running && !G.paused ? G.speed : 1);
    if (G.running && !G.paused) G.update(dt);
    G.render(raw);
  };

  G.render = function (rawDt) {
    const ctx = G.ctx, dpr = G.dpr, vw = G.vw, vh = G.vh, cam = G.cam, time = performance.now() / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#10140f'; ctx.fillRect(0, 0, vw, vh);
    ctx.save();
    ctx.translate(vw / 2, vh / 2); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.x + G.shakeX, -cam.y + G.shakeY);
    // visible world rect
    const x0 = cam.x - vw / 2 / cam.zoom - 40, y0 = cam.y - vh / 2 / cam.zoom - 40, x1 = cam.x + vw / 2 / cam.zoom + 40, y1 = cam.y + vh / 2 / cam.zoom + 40;
    const bs = G.bgScale;
    const sx = Math.max(0, x0), sy = Math.max(0, y0), ex = Math.min(W, x1), ey = Math.min(H, y1);
    if (ex > sx && ey > sy) ctx.drawImage(G.bg, sx * bs, sy * bs, (ex - sx) * bs, (ey - sy) * bs, sx, sy, ex - sx, ey - sy);
    R().drawRiverShimmer(ctx, time, TD.LEVEL.riverWidth);
    // torches
    for (const [tx, ty] of R().castleTorches || []) R().drawTorch(ctx, tx, ty, time, 1);
    for (const [tx, ty] of R().gateBraziers || []) R().drawTorch(ctx, tx, ty, time, 0.8);
    // plot glows
    if (G.running) TD.LEVEL.plots.forEach((p, i) => { if (!G.towers[i]) R().drawPlotGlow(ctx, p[0], p[1], time, G.selected && G.selected.kind === 'plot' && G.selected.index === i); });
    // selection range
    if (G.selected) {
      const i = G.selected.index, t = G.towers[i], p = TD.LEVEL.plots[i];
      if (t) { const lv = t.def.levels[t.level]; R().drawRangeCircle(ctx, p[0], p[1], lv.range, lv.minRange, time); }
      else if (UI().previewType) { const lv = TD.TOWERS[UI().previewType].levels[0]; R().drawRangeCircle(ctx, p[0], p[1], lv.range, lv.minRange, time, 'rgba(226,182,87,0.07)'); }
    }
    // spell hint
    if (G.casting === 'fire' && G.spellHint) { const sp = TD.SPELLS.fire; ctx.save(); ctx.strokeStyle = 'rgba(255,140,40,0.9)'; ctx.fillStyle = 'rgba(255,120,30,0.15)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -time * 30; ctx.beginPath(); ctx.arc(G.spellHint.x, G.spellHint.y, sp.radius, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); }
    // fire patches & ground effects (below units)
    for (const fx of G.effects) if (fx.kind === 'firepatch') { const k = fx.age / fx.dur; const r = fx.r * (1 - k * 0.6); ctx.save(); ctx.globalAlpha = 0.5 * (1 - k); ctx.fillStyle = '#2a1a10'; R().ell(ctx, fx.x, fx.y, r * 1.8, r * 0.9, '#2a1a10'); ctx.restore(); R().drawFlame(ctx, fx.x, fx.y, r, time + fx.x); if (Math.random() < rawDt * 6) G.addParticle({ x: fx.x + rand(-r, r), y: fx.y, vx: rand(-8, 8), vy: rand(-40, -15), life: rand(0.4, 0.9), size: rand(1, 2.5), type: 'ember', color: '#ffb347', g: 0 }); }
    // ground particles (smoke/fog non additive) below units
    for (const p of G.particles) if (p.type === 'smoke' || p.type === 'fog' || p.type === 'blood' || p.type === 'debris') drawParticle(ctx, p);
    // units sorted by y
    const draw = [];
    for (const t of G.towers) if (t && t.y > y0 - 120 && t.y < y1 + 40 && t.x > x0 - 60 && t.x < x1 + 60) draw.push({ y: t.y, t });
    for (const e of G.enemies) if (e.y > y0 - 80 && e.y < y1 + 40) draw.push({ y: e.y, e });
    draw.sort((a, b) => a.y - b.y);
    for (const d of draw) { if (d.t) R().drawTower(ctx, d.t, time); else R().drawEnemy(ctx, d.e, time); }
    for (const p of G.projectiles) R().drawProjectile(ctx, p, time);
    // additive particles & effects
    for (const p of G.particles) if (!(p.type === 'smoke' || p.type === 'fog' || p.type === 'blood' || p.type === 'debris')) drawParticle(ctx, p);
    for (const fx of G.effects) drawEffect(ctx, fx, time);
    // floaters
    ctx.font = '700 14px Cinzel, Georgia, serif'; ctx.textAlign = 'center';
    for (const f of G.floaters) { const k = f.age / f.life; ctx.globalAlpha = 1 - k * k; ctx.font = `700 ${f.size}px Cinzel, Georgia, serif`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); }
    ctx.globalAlpha = 1;
    ctx.restore();
    // screen-space overlays
    R().drawVignette(ctx, vw, vh, 0.5);
    if (G.frost > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, G.frost) * 0.35; const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.25, vw / 2, vh / 2, Math.max(vw, vh) * 0.7); g.addColorStop(0, 'rgba(180,225,255,0)'); g.addColorStop(1, 'rgba(160,215,255,0.9)'); ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh); ctx.restore(); }
    if (G.flash > 0) { ctx.save(); ctx.globalAlpha = G.flash * 0.5; const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.7); g.addColorStop(0, 'rgba(200,40,30,0)'); g.addColorStop(1, 'rgba(200,40,30,0.9)'); ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh); ctx.restore(); }
  };

  function drawParticle(ctx, p) {
    const k = p.age / p.life; const a = 1 - k;
    ctx.save();
    switch (p.type) {
      case 'smoke': case 'fog': ctx.globalAlpha = a * (p.type === 'fog' ? 0.35 : 0.5); R().circ(ctx, p.x, p.y, p.size * (0.6 + k * 1.2), p.color); break;
      case 'blood': case 'debris': ctx.globalAlpha = a; R().circ(ctx, p.x, p.y, p.size, p.color); break;
      case 'leaf': ctx.globalAlpha = Math.sin(k * Math.PI) * 0.6; R().ell(ctx, p.x, p.y, p.size, p.size * 0.5, p.color); break;
      case 'snow': ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9; R().circ(ctx, p.x, p.y, p.size, p.color); break;
      default: // spark, ember, wisp — additive
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.2); g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        R().circ(ctx, p.x, p.y, p.size * 2.2, g);
    }
    ctx.restore();
  }
  function drawEffect(ctx, fx, time) {
    const k = Math.min(1, fx.age / fx.dur);
    ctx.save();
    if (fx.kind === 'ring') { ctx.globalAlpha = 1 - k; ctx.strokeStyle = fx.color; ctx.lineWidth = fx.width * (1 - k * 0.5); ctx.beginPath(); ctx.ellipse(fx.x, fx.y, fx.r0 + (fx.r1 - fx.r0) * k, (fx.r0 + (fx.r1 - fx.r0) * k) * 0.75, 0, 0, TAU); ctx.stroke(); }
    else if (fx.kind === 'firecircle') { ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = 'rgba(255,150,40,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * (0.6 + k * 0.4), 0, TAU); ctx.stroke(); }
    else if (fx.kind === 'meteor') {
      ctx.globalCompositeOperation = 'lighter';
      for (const s of fx.streaks) {
        const t = Math.min(1, Math.max(0, (fx.age - s.delay) / (fx.dur - s.delay))); if (t <= 0) continue;
        const ex = fx.x + s.ox, ey = fx.y + s.oy; const startX = ex + 260, startY = ey - 900;
        const px = startX + (ex - startX) * t, py = startY + (ey - startY) * t;
        const g = ctx.createLinearGradient(px + 40, py - 140, px, py); g.addColorStop(0, 'rgba(255,120,30,0)'); g.addColorStop(1, 'rgba(255,220,140,0.95)');
        ctx.strokeStyle = g; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px + 40, py - 140); ctx.lineTo(px, py); ctx.stroke();
        const gg = ctx.createRadialGradient(px, py, 0, px, py, 16); gg.addColorStop(0, 'rgba(255,255,220,1)'); gg.addColorStop(0.4, 'rgba(255,160,50,0.8)'); gg.addColorStop(1, 'rgba(255,80,0,0)'); R().circ(ctx, px, py, 16, gg);
      }
      if (fx.done) { ctx.globalAlpha = 1; const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, fx.r * 1.4); g.addColorStop(0, 'rgba(255,240,200,0.9)'); g.addColorStop(0.5, 'rgba(255,140,40,0.5)'); g.addColorStop(1, 'rgba(255,80,0,0)'); R().circ(ctx, fx.x, fx.y, fx.r * 1.4, g); }
    }
    else if (fx.kind === 'frostwave') { ctx.globalAlpha = (1 - k) * 0.5; ctx.strokeStyle = '#cfefff'; ctx.lineWidth = 12 * (1 - k); ctx.beginPath(); ctx.ellipse(fx.x, fx.y, 60 + k * 1200, 60 + k * 1200, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }

  TD.Game = G;
})(window.TD);
