// ---------------------------------------------------------------------------
// Ravenhold — game state, simulation, camera, input and frame rendering
// ---------------------------------------------------------------------------
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  const R3 = () => TD.R3, A = () => TD.Audio, UI = () => TD.UI;
  const TAU = Math.PI * 2;
  const W = TD.WORLD.w, H = TD.WORLD.h;

  const G = {
    canvas: null, path: null,
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
    G.canvas = canvas;
    G.path = TD.buildPath(TD.LEVEL.path, TD.LEVEL.cornerRadius, 4);
    R3().init(canvas, TD.LEVEL, G.path);
    window.addEventListener('resize', () => R3().resize());
    window.addEventListener('orientationchange', () => setTimeout(() => R3().resize(), 250));
    G.bindInput();
    R3().fitInitial();
    requestAnimationFrame(G.frame);
  };
  G.fitInitial = function () { R3().fitInitial(); };
  G.fitMap = function () { R3().fitMap(); };
  G.toWorld = function (sx, sy) { return R3().screenToWorld(sx, sy); };
  G.toScreen = function (wx, wy, h) { return R3().worldToScreen(wx, h || 0, wy); };

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
  G.burst = function (x, y, n, opts) { R3().burst(x, y, n, opts); };
  G.floater = function (x, y, text, color, size) { R3().floater(x, y, text, color || '#e2b657', size || 14); };
  G.ring = function (x, y, r0, r1, dur, color, width) { R3().ring(x, y, r0, r1, dur, color, width); };
  G.shakeCam = function (s) { R3().shake(s); };
  function pan(x) { return Math.max(-0.8, Math.min(0.8, (G.toScreen(x, 0).x / R3().vw - 0.5) * 1.6)); }
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
    G.ring(x, y, 10, 60, 0.6, 0xe2b657, 3);
    G.sfxAt('build', x, { vol: 0.9, vary: 0.05 }); setTimeout(() => G.sfxAt('gold', x, { vol: 0.5 }), 90);
    G.select({ kind: 'tower', index: plotIndex });
    return true;
  };
  G.upgradeCost = function (t) { return t.level < 2 ? t.def.upgrade[t.level] : null; };
  G.upgrade = function (t) {
    const c = G.upgradeCost(t); if (c == null) return false;
    if (G.gold < c) { UI().toast('Not enough gold'); A().play('ui_close'); return false; }
    G.gold -= c; G.stats.spent += c; t.invested += c; t.level++;
    G.ring(t.x, t.y, 8, 70, 0.7, 0xfff0b4, 3);
    G.burst(t.x, t.y, 22, { speed: [30, 110], life: [0.5, 1.0], size: [1.5, 3], type: 'spark', color: '#ffe08a', up: 60, y: 30 });
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
  G.select = function (sel) {
    G.selected = sel; UI().onSelect(sel);
    if (!sel) { R3().setSelection(null); return; }
    const p = TD.LEVEL.plots[sel.index], t = G.towers[sel.index];
    if (t) { const lv = t.def.levels[t.level]; R3().setSelection({ x: p[0], y: p[1], range: lv.range, minRange: lv.minRange }); } else R3().setSelection(null);
  };
  G.previewRange = function (type) {
    const sel = G.selected; if (!sel || sel.kind !== 'plot') return; const p = TD.LEVEL.plots[sel.index];
    if (!type) { R3().setSelection(null); return; } const lv = TD.TOWERS[type].levels[0]; R3().setSelection({ x: p[0], y: p[1], range: lv.range, minRange: lv.minRange });
  };

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
    G.burst(e.x, e.y, 6, { speed: [10, 30], life: [0.6, 1.2], size: [6, 12], type: 'fog', color: '#2a1638', y: 12 });
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
    if (e.type === 'skeleton') G.burst(e.x, e.y, 12, { speed: [10, 50], life: [0.5, 1.0], size: [1.5, 3.5], type: 'wisp', color: '#bfe9ff', up: 40, y: s });
    else G.burst(e.x, e.y, 10 + (s | 0), { speed: [30, 120], life: [0.3, 0.7], size: [1.5, 3.5], type: 'blood', color: e.type === 'troll' || e.type === 'chieftain' ? '#3a4a58' : '#5a1212', g: 300, up: 80, y: s });
    G.burst(e.x, e.y, 6, { speed: [10, 40], life: [0.5, 0.9], size: [4, 9], type: 'smoke', color: '#8a7a60', up: 15, flat: true });
    G.sfxAny([e.def.sfx + '_die1', e.def.sfx + '_die2'], e.x, { vol: e.def.boss ? 1 : 0.6, vary: 0.06, throttle: 90 });
    if (e.def.boss) { G.shakeCam(10); G.ring(e.x, e.y, 10, 120, 0.9, 0xffc878, 4); A().play('fanfare', { vol: 0.7 }); }
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
      const fx = { kind: 'meteor', x, y, r: sp.radius, age: 0, dur: 0.75, done: false, streaks: Array.from({ length: 6 }, () => ({ ox: rand(-sp.radius * 0.7, sp.radius * 0.7), oy: rand(-sp.radius * 0.6, sp.radius * 0.6), delay: rand(0, 0.25) })) };
      G.effects.push(fx); R3().effect(Object.assign({}, fx));
      G.sfxAt('flame', x, { vol: 0.9 }); A().play('rumble', { vol: 0.5 });
      G.ring(x, y, sp.radius * 0.6, sp.radius, 0.75, 0xff9a3a, 3);
    } else if (id === 'frost') {
      for (const e of G.enemies) { e.slowT = Math.max(e.slowT, sp.duration); e.slowAmt = Math.max(e.slowAmt, sp.slow); G.burst(e.x, e.y, 6, { speed: [10, 40], life: [0.6, 1.2], size: [1.5, 3], type: 'snow', color: '#e8f7ff', up: 10, y: e.def.size }); }
      G.frost = 1; A().play('frost', { vol: 1 }); A().play('holy', { vol: 0.5, rate: 0.8 });
      R3().effect({ kind: 'frostwave', x: W / 2, y: H / 2, dur: 1.2 });
      for (let i = 0; i < 120; i++) R3().spawnParticle({ x: rand(0, W), y: rand(60, 220), z: rand(0, H), vx: rand(-10, 10), vy: -rand(25, 50), vz: rand(-10, 10), life: rand(2, 4), size: rand(3, 6), type: 'snow', color: 0xffffff, g: 0 });
    }
  };
  function meteorImpact(fx) {
    const sp = TD.SPELLS.fire;
    for (const e of G.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - fx.x, e.y - fx.y); if (d < sp.radius + e.def.size * 0.5) { G.damage(e, sp.dmg * (d < sp.radius * 0.5 ? 1 : 0.7), 'magic'); e.burnT = sp.burnDur; e.burnDps = sp.burn; } }
    G.shakeCam(12); G.sfxAt('explosion', fx.x, { vol: 1 }); G.sfxAt('fire', fx.x, { vol: 0.7 });
    G.ring(fx.x, fx.y, 20, sp.radius * 1.3, 0.6, 0xffaa3c, 5);
    R3().effect({ kind: 'flash', x: fx.x, y: fx.y, r: sp.radius, h: 20, dur: 0.5 });
    G.burst(fx.x, fx.y, 40, { speed: [60, 260], life: [0.4, 1.1], size: [2, 5], type: 'ember', color: '#ffb347', up: 120, g: 200 });
    G.burst(fx.x, fx.y, 24, { speed: [20, 70], life: [1.2, 2.4], size: [10, 22], type: 'smoke', color: '#2a2420', up: 40, flat: true });
    for (let i = 0; i < 7; i++) R3().effect({ kind: 'firepatch', x: fx.x + rand(-sp.radius * 0.8, sp.radius * 0.8), y: fx.y + rand(-sp.radius * 0.7, sp.radius * 0.7), dur: rand(2.2, 3.4), r: rand(7, 13) });
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
      if (e.burnT > 0) { e.burnT -= dt; e.hp -= e.burnDps * dt; if (e.hp <= 0) { G.kill(e); continue; } if (Math.random() < dt * 10) R3().spawnParticle({ x: e.x + rand(-6, 6), y: e.def.size, z: e.y + rand(-6, 6), vx: rand(-10, 10), vy: rand(20, 50), vz: rand(-10, 10), life: rand(0.3, 0.6), size: rand(3, 6), type: 'ember', color: 0xffb347, g: 0 }); }
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
    for (const fx of G.effects) { fx.age += dt; if (fx.kind === 'meteor' && !fx.done && fx.age >= fx.dur) { fx.done = true; meteorImpact(fx); } }
    G.effects = G.effects.filter((fx) => fx.age < fx.dur);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 1.5);
    if (G.frost > 0) G.frost = Math.max(0, G.frost - dt * 0.35);
  };

  // ---------- projectiles -------------------------------------------------------
  G.fire = function (t, target, lv) {
    const def = t.def; const sx = t.x, sy = t.y; const h0 = def.id === 'mage' ? 110 + t.level * 12 : def.id === 'archer' ? 62 + t.level * 9 : def.id === 'ballista' ? 48 + t.level * 5 : 30;
    if (def.projectile === 'arrow') {
      G.projectiles.push({ kind: 'arrow', x: sx, y: sy, h: h0, vx: 0, vy: 0, speed: 560, target, dmg: lv.dmg, dtype: lv.dtype, tower: t, height: 0, age: 0 });
      G.sfxAt(Math.random() < 0.5 ? 'bow' : 'bow2', t.x, { vol: 0.45, vary: 0.08, throttle: 60 });
    } else if (def.projectile === 'bolt') {
      const a = Math.atan2(target.y - sy, target.x - sx); const sp = 760;
      G.projectiles.push({ kind: 'bolt', x: sx, y: sy, h: h0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, maxDist: lv.range + 60, travelled: 0, hit: new Set(), pierce: lv.pierce, dmg: lv.dmg, dtype: lv.dtype, tower: t, height: 0, age: 0 });
      G.sfxAt(Math.random() < 0.5 ? 'crossbow' : 'crossbow2', t.x, { vol: 0.7, vary: 0.06 });
    } else if (def.projectile === 'orb') {
      const colors = [[0x8fd8ff, 0x2a7fd0], [0xc99cff, 0x6a2fd0], [0xffffff, 0xc0a0ff]][t.level];
      G.projectiles.push({ kind: 'orb', x: sx, y: sy, h: h0, vx: 0, vy: 0, speed: 400, target, dmg: lv.dmg, dtype: lv.dtype, slow: lv.slow, slowDur: lv.slowDur, color: colors, tower: t, height: 0, age: 0, trail: 0 });
      G.sfxAny(['magic1', 'magic2', 'magic3'], t.x, { vol: 0.5, vary: 0.05 });
    } else if (def.projectile === 'stone') {
      // lead the target
      const d = Math.hypot(target.x - sx, target.y - sy); const T = Math.max(0.5, d / 300);
      let tsp = target.def.speed * (target.slowT > 0 ? 1 - target.slowAmt : 1);
      const lead = TD.pathPos(G.path, target.dist + tsp * T * 0.9);
      const tx = lead.x - lead.dy * target.off, ty = lead.y + lead.dx * target.off;
      G.projectiles.push({ kind: 'stone', x: sx, y: sy, h: h0, sx, sy, tx, ty, T, age: 0, vx: 0, vy: 0, dmg: lv.dmg, dtype: lv.dtype, splash: lv.splash, tower: t, height: 0 });
      G.sfxAt('catapult', t.x, { vol: 0.8, vary: 0.05 }); G.sfxAt('throw', t.x, { vol: 0.5 });
    }
  };

  G.updateProjectile = function (p, dt) {
    p.age += dt;
    if (p.kind === 'arrow' || p.kind === 'orb') {
      const tg = p.target; const tx = tg.dead ? p.lastX : tg.x, ty = tg.dead ? p.lastY : tg.y; const hitH = tg.def.size * 1.0;
      if (!tg.dead) { p.lastX = tg.x; p.lastY = ty; }
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      p.vx = dx / (d || 1) * p.speed; p.vy = dy / (d || 1) * p.speed;
      p.h += (hitH - p.h) * Math.min(1, step / (d || 1));
      if (p.kind === 'arrow') p.height = Math.sin(Math.min(1, p.age * 1.8) * Math.PI) * 22;
      if (d <= step + 4) {
        p.dead = true;
        if (!tg.dead) {
          G.damage(tg, p.dmg, p.dtype, { tower: p.tower });
          if (p.kind === 'orb') { if (p.slow) { tg.slowT = Math.max(tg.slowT, p.slowDur); tg.slowAmt = Math.max(tg.slowAmt, p.slow); } G.burst(tg.x, ty, 8, { speed: [20, 90], life: [0.2, 0.5], size: [1.5, 3], type: 'spark', color: p.color[0], g: 0, y: hitH }); G.sfxAt('faerie', tg.x, { vol: 0.25, throttle: 150, rate: 1.4 }); }
          else { G.sfxAt('flesh', tg.x, { vol: 0.35, vary: 0.1, throttle: 70 }); }
        }
      } else { p.x += p.vx * dt; p.y += p.vy * dt; }
    } else if (p.kind === 'bolt') {
      const step = Math.hypot(p.vx, p.vy) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.travelled += step;
      for (const e of G.enemies) {
        if (e.dead || p.hit.has(e.id)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < e.def.size + 8) {
          p.hit.add(e.id); G.damage(e, p.dmg, p.dtype, { tower: p.tower }); G.sfxAt('flesh', e.x, { vol: 0.5, vary: 0.1, throttle: 70 });
          G.burst(e.x, e.y, 5, { speed: [30, 100], life: [0.2, 0.4], size: [1, 2.5], type: 'blood', color: '#5a1212', g: 300, y: e.def.size });
          if (p.hit.size >= p.pierce) { p.dead = true; break; }
        }
      }
      if (p.travelled > p.maxDist || p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) p.dead = true;
    } else if (p.kind === 'stone') {
      const k = Math.min(1, p.age / p.T);
      p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k; p.height = Math.sin(k * Math.PI) * 140 - p.h * k;
      if (k >= 1) {
        p.dead = true;
        for (const e of G.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - p.tx, e.y - p.ty); if (d < p.splash + e.def.size * 0.5) G.damage(e, p.dmg * (d < p.splash * 0.5 ? 1 : 0.65), p.dtype, { tower: p.tower }); }
        G.shakeCam(3); G.sfxAt('impact', p.tx, { vol: 0.8, vary: 0.08 }); G.sfxAt('cavein', p.tx, { vol: 0.25, rate: 1.6, throttle: 200 });
        G.ring(p.tx, p.ty, 6, p.splash * 1.1, 0.4, 0xc8b48c, 3);
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
        R3().zoomAt(d / (P.pinch.d || d), cx, cy);
        R3().pan(cx - P.pinch.cx, cy - P.pinch.cy);
        P.pinch = { d, cx, cy };
        return;
      }
      if (!P.down) return;
      const p = pos(ev);
      if (!P.moved && Math.hypot(p.x - P.sx, p.y - P.sy) > 9) P.moved = true;
      if (P.moved) R3().pan(p.x - P.lx, p.y - P.ly);
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
    c.addEventListener('wheel', (ev) => { ev.preventDefault(); R3().zoomAt(ev.deltaY < 0 ? 1.12 : 0.89, ev.clientX, ev.clientY); }, { passive: false });
    c.addEventListener('contextmenu', (ev) => ev.preventDefault());
    document.addEventListener('gesturestart', (ev) => ev.preventDefault());
  };

  G.onTap = function (sx, sy) {
    if (!G.running || G.paused) return;
    const w = G.toWorld(sx, sy); if (!w) return;
    if (G.casting) {
      const id = G.casting;
      if (w.x < -30 || w.x > W + 30 || w.y < -30 || w.y > H + 30) return;
      G.cast(id, w.x, w.y); return;
    }
    // towers/plots (hit radius generous for fingers)
    let best = -1, bestD = 1e9;
    TD.LEVEL.plots.forEach((p, i) => { const t = G.towers[i]; const d = Math.hypot(w.x - p[0], w.y - (p[1] - (t ? 24 : 0))); const rad = t ? 60 : 48; if (d < rad && d < bestD) { best = i; bestD = d; } });
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
    const time = performance.now() / 1000; const R = R3();
    R.syncTowers(G.towers, time); R.syncEnemies(G.enemies, time); R.syncProjectiles(G.projectiles);
    R.setPlotStates(G.towers, G.selected && G.selected.kind === 'plot' ? G.selected.index : -1, time);
    R.setSpellHint(G.casting === 'fire' && G.spellHint ? { x: G.spellHint.x, y: G.spellHint.y, r: TD.SPELLS.fire.radius } : null);
    R.render(rawDt, time, G);
    UI().afterRender();
  };

  TD.Game = G;
})(window.TD);
