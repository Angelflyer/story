// ---------------------------------------------------------------------------
// Ravenhold — level data, towers, enemies, waves, spells
// ---------------------------------------------------------------------------
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  TD.WORLD = { w: 960, h: 1600 };

  // Level 1: "The Old Road"
  TD.LEVEL = {
    name: 'The Old Road',
    subtitle: 'Hold Ravenhold against the host of the Blackgate',
    startGold: 300,
    lives: 20,
    // Raw polyline; corners are rounded in TD.buildPath
    path: [
      [-70, 150], [640, 150], [640, 470], [200, 470], [200, 820],
      [760, 820], [760, 1150], [300, 1150], [300, 1280], [480, 1280], [480, 1322],
    ],
    cornerRadius: 70,
    roadWidth: 66,
    river: [
      [1030, 540], [780, 630], [580, 690], [490, 750], [480, 830], [460, 920],
      [400, 990], [290, 1045], [120, 1060], [-70, 1085],
    ],
    riverWidth: 58,
    bridge: { x: 480, y: 820, w: 124, h: 80 },   // deck runs along the road, across the river
    castle: { x: 480, y: 1500 },
    gate: { x: 20, y: 150 },                     // enemy origin (the Blackgate)
    plots: [
      [330, 300], [520, 300], [775, 320], [100, 305],
      [88, 640], [400, 600], [890, 700], [640, 960],
      [280, 900], [885, 1005], [560, 1235], [160, 1250],
      [700, 1240],
    ],
  };

  // Damage types: 'phys' reduced by armor, 'magic' reduced by resist
  TD.TOWERS = {
    archer: {
      id: 'archer', name: 'Archer Tower', short: 'Archer',
      desc: 'Quick volleys. Cheap and reliable.',
      cost: 70, upgrade: [70, 110],
      levels: [
        { range: 175, dmg: 9,  rate: 1.25, dtype: 'phys' },
        { range: 195, dmg: 15, rate: 1.45, dtype: 'phys' },
        { range: 215, dmg: 24, rate: 1.7,  dtype: 'phys' },
      ],
      projectile: 'arrow', sound: 'bow',
    },
    ballista: {
      id: 'ballista', name: 'Ballista', short: 'Ballista',
      desc: 'Slow, heavy bolts that pierce through foes.',
      cost: 120, upgrade: [110, 170],
      levels: [
        { range: 230, dmg: 48,  rate: 0.5,  dtype: 'phys', pierce: 2 },
        { range: 250, dmg: 80,  rate: 0.55, dtype: 'phys', pierce: 3 },
        { range: 275, dmg: 130, rate: 0.6,  dtype: 'phys', pierce: 4 },
      ],
      projectile: 'bolt', sound: 'crossbow',
    },
    mage: {
      id: 'mage', name: 'Mage Tower', short: 'Mage',
      desc: 'Arcane bolts ignore armor. Undead fear them.',
      cost: 125, upgrade: [115, 180],
      levels: [
        { range: 160, dmg: 26, rate: 0.85, dtype: 'magic' },
        { range: 175, dmg: 44, rate: 0.9,  dtype: 'magic' },
        { range: 190, dmg: 70, rate: 1.0,  dtype: 'magic', slow: 0.35, slowDur: 1.2 },
      ],
      projectile: 'orb', sound: 'magic',
    },
    catapult: {
      id: 'catapult', name: 'Catapult', short: 'Catapult',
      desc: 'Hurls stones that crush groups. Cannot hit close targets.',
      cost: 150, upgrade: [130, 200],
      levels: [
        { range: 210, minRange: 80, dmg: 34, rate: 0.36, dtype: 'phys', splash: 58 },
        { range: 230, minRange: 80, dmg: 56, rate: 0.4,  dtype: 'phys', splash: 68 },
        { range: 250, minRange: 80, dmg: 90, rate: 0.44, dtype: 'phys', splash: 80 },
      ],
      projectile: 'stone', sound: 'catapult',
    },
  };
  TD.TOWER_ORDER = ['archer', 'ballista', 'mage', 'catapult'];
  TD.SELL_RATIO = 0.7;

  TD.ENEMIES = {
    goblin:   { name: 'Goblin',        hp: 48,   speed: 74,  armor: 0,    resist: 0,   gold: 5,  size: 13, sfx: 'gob' },
    wolf:     { name: 'Warg',          hp: 66,   speed: 118, armor: 0,    resist: 0,   gold: 6,  size: 15, sfx: 'wolf' },
    orc:      { name: 'Orc Warrior',   hp: 150,  speed: 56,  armor: 0.2,  resist: 0,   gold: 9,  size: 17, sfx: 'orc' },
    skeleton: { name: 'Bone Sentinel', hp: 110,  speed: 60,  armor: 0.55, resist: -0.5, gold: 8, size: 15, sfx: 'skel' },
    rider:    { name: 'Black Rider',   hp: 260,  speed: 92,  armor: 0.4,  resist: 0.1, gold: 16, size: 19, sfx: 'human' },
    troll:    { name: 'Cave Troll',    hp: 480,  speed: 44,  armor: 0.25, resist: 0.1, gold: 22, size: 24, regen: 3, sfx: 'troll' },
    chieftain:{ name: 'Troll Chieftain', hp: 1700, speed: 40, armor: 0.3, resist: 0.15, gold: 90, size: 30, regen: 8, boss: true, sfx: 'troll' },
    ogre:     { name: 'Ogre Warlord',  hp: 3400, speed: 34,  armor: 0.35, resist: 0.2, gold: 200, size: 36, regen: 4, boss: true, sfx: 'ogre' },
  };

  // Each wave: groups spawn sequentially; {t: type, n: count, gap: seconds between, delay: seconds before group}
  TD.WAVES = [
    { name: 'Scouts',            groups: [ { t: 'goblin', n: 8, gap: 1.1 } ] },
    { name: 'Goblin raiders',    groups: [ { t: 'goblin', n: 10, gap: 0.9 }, { t: 'wolf', n: 3, gap: 1.0, delay: 3 } ] },
    { name: 'Wargs',             groups: [ { t: 'wolf', n: 8, gap: 0.8 }, { t: 'goblin', n: 6, gap: 0.8, delay: 2 } ] },
    { name: 'Orc vanguard',      groups: [ { t: 'orc', n: 6, gap: 1.4 }, { t: 'goblin', n: 8, gap: 0.7, delay: 2 } ] },
    { name: 'The dead walk',     groups: [ { t: 'skeleton', n: 8, gap: 1.2 }, { t: 'wolf', n: 5, gap: 0.8, delay: 4 } ] },
    { name: 'Mixed host',        groups: [ { t: 'orc', n: 8, gap: 1.1 }, { t: 'skeleton', n: 6, gap: 1.0, delay: 3 }, { t: 'goblin', n: 10, gap: 0.6, delay: 2 } ] },
    { name: 'Black Riders',      groups: [ { t: 'rider', n: 4, gap: 1.6 }, { t: 'wolf', n: 8, gap: 0.7, delay: 3 } ] },
    { name: 'Cave Trolls',       groups: [ { t: 'troll', n: 2, gap: 4 }, { t: 'orc', n: 8, gap: 1.0, delay: 2 } ] },
    { name: 'Bone legion',       groups: [ { t: 'skeleton', n: 14, gap: 0.8 }, { t: 'rider', n: 3, gap: 1.5, delay: 4 } ] },
    { name: 'The Chieftain',     groups: [ { t: 'orc', n: 6, gap: 1.0 }, { t: 'chieftain', n: 1, gap: 1, delay: 4 }, { t: 'goblin', n: 12, gap: 0.5, delay: 1 } ] },
    { name: 'Wolf packs',        groups: [ { t: 'wolf', n: 16, gap: 0.55 }, { t: 'rider', n: 4, gap: 1.2, delay: 3 } ] },
    { name: 'Orc warband',       groups: [ { t: 'orc', n: 14, gap: 0.8 }, { t: 'troll', n: 3, gap: 3, delay: 2 } ] },
    { name: 'Night of the dead', groups: [ { t: 'skeleton', n: 18, gap: 0.7 }, { t: 'rider', n: 5, gap: 1.2, delay: 2 }, { t: 'troll', n: 2, gap: 3, delay: 2 } ] },
    { name: 'The great host',    groups: [ { t: 'goblin', n: 14, gap: 0.45 }, { t: 'orc', n: 12, gap: 0.8, delay: 1 }, { t: 'rider', n: 6, gap: 1.1, delay: 2 }, { t: 'troll', n: 3, gap: 2.5, delay: 2 } ] },
    { name: 'The Ogre Warlord',  groups: [ { t: 'troll', n: 3, gap: 2.5 }, { t: 'skeleton', n: 10, gap: 0.7, delay: 2 }, { t: 'ogre', n: 1, gap: 1, delay: 5 }, { t: 'rider', n: 6, gap: 1.0, delay: 2 } ] },
  ];

  TD.SPELLS = {
    fire: {
      id: 'fire', name: "Dragon's Breath", desc: 'Call fire from the sky on a chosen spot.',
      cooldown: 45, radius: 95, dmg: 140, burn: 12, burnDur: 3, targeted: true, sound: 'flame',
    },
    frost: {
      id: 'frost', name: "Winter's Grasp", desc: 'Freeze every enemy on the road for a few seconds.',
      cooldown: 55, duration: 4.5, slow: 0.85, targeted: false, sound: 'frost',
    },
  };

  // ---------- path construction --------------------------------------------
  // Rounds corners of the polyline, then resamples to evenly spaced points.
  TD.buildPath = function (pts, radius, step) {
    const out = [];
    const v = (a, b) => [b[0] - a[0], b[1] - a[1]];
    const len = (a) => Math.hypot(a[0], a[1]);
    const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
    out.push(pts[0]);
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], d1 = norm(v(pts[i - 1], p)), d2 = norm(v(p, pts[i + 1]));
      const r = Math.min(radius, len(v(pts[i - 1], p)) / 2, len(v(p, pts[i + 1])) / 2);
      const a = [p[0] - d1[0] * r, p[1] - d1[1] * r];
      const b = [p[0] + d2[0] * r, p[1] + d2[1] * r];
      out.push(a);
      for (let t = 0.1; t < 1; t += 0.1) { // quadratic bezier a -> p -> b
        const it = 1 - t;
        out.push([it * it * a[0] + 2 * it * t * p[0] + t * t * b[0], it * it * a[1] + 2 * it * t * p[1] + t * t * b[1]]);
      }
      out.push(b);
    }
    out.push(pts[pts.length - 1]);
    // resample
    const res = [out[0]]; let acc = 0;
    for (let i = 1; i < out.length; i++) {
      let a = out[i - 1], b = out[i]; const segLen = len(v(a, b));
      let d = step - acc;
      while (d <= segLen) {
        const t = d / segLen; res.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        d += step;
      }
      acc = segLen - (d - step);
    }
    res.push(out[out.length - 1]);
    const cum = [0];
    for (let i = 1; i < res.length; i++) cum.push(cum[i - 1] + len(v(res[i - 1], res[i])));
    return { pts: res, cum, length: cum[cum.length - 1], step };
  };

  TD.pathPos = function (path, d) {
    if (d <= 0) return { x: path.pts[0][0], y: path.pts[0][1], dx: 1, dy: 0 };
    if (d >= path.length) { const p = path.pts[path.pts.length - 1]; return { x: p[0], y: p[1], dx: 0, dy: 1 }; }
    let i = Math.floor(d / path.step);
    while (i < path.cum.length - 1 && path.cum[i + 1] < d) i++;
    while (i > 0 && path.cum[i] > d) i--;
    const a = path.pts[i], b = path.pts[Math.min(i + 1, path.pts.length - 1)];
    const seg = (path.cum[i + 1] || path.cum[i]) - path.cum[i] || 1;
    const t = (d - path.cum[i]) / seg;
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return { x: a[0] + dx * t, y: a[1] + dy * t, dx: dx / l, dy: dy / l };
  };

  // Catmull-Rom smoothing for the river
  TD.smoothCurve = function (pts, segs) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let j = 0; j < segs; j++) {
        const t = j / segs, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  };

  TD.distToPolyline = function (x, y, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      let t = ((x - ax) * dx + (y - ay) * dy) / l2; t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t, py = ay + dy * t;
      const d = Math.hypot(x - px, y - py);
      if (d < best) best = d;
    }
    return best;
  };
})(window.TD);
