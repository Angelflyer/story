// ---------------------------------------------------------------------------
// Ravenhold — HUD, radial build menu, tower menu, overlays
// ---------------------------------------------------------------------------
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const G = () => TD.Game, A = () => TD.Audio, R3 = () => TD.R3;
  const U = { last: {}, bannerTimer: null, toastTimer: null, anchor: null };
  const RADIAL = [200, 245, 295, 340]; // degrees, arc above the plot
  const RADIUS = 74;

  U.init = function () {
    const radial = $('radial'); radial.innerHTML = '';
    TD.TOWER_ORDER.forEach((id, i) => {
      const def = TD.TOWERS[id]; const b = document.createElement('button'); b.className = 'rb'; b.dataset.type = id;
      const a = RADIAL[i] * Math.PI / 180; b.style.left = Math.cos(a) * RADIUS + 'px'; b.style.top = Math.sin(a) * RADIUS + 'px'; if (i === 0) b.classList.add('side-l'); if (i === 3) b.classList.add('side-r');
      const img = document.createElement('img'); img.alt = def.name; img.dataset.tower = id; b.appendChild(img);
      const n = document.createElement('span'); n.className = 'n'; n.textContent = def.short; b.appendChild(n);
      const c = document.createElement('span'); c.className = 'c'; c.textContent = def.cost; b.appendChild(c);
      b.addEventListener('click', (ev) => { ev.stopPropagation(); const s = G().selected; if (!s || s.kind !== 'plot') return; G().build(s.index, id); });
      b.addEventListener('pointerenter', () => G().previewRange(id)); b.addEventListener('pointerleave', () => G().previewRange(null));
      radial.appendChild(b);
    });
    $('btn-wave').addEventListener('click', () => { if (G().startWave()) A().play('ui_tap2', { vol: 0.6 }); });
    $('btn-fire').addEventListener('click', () => G().beginCast('fire'));
    $('btn-frost').addEventListener('click', () => G().beginCast('frost'));
    $('btn-cancel-cast').addEventListener('click', () => { G().casting = null; U.onCastingChange(); });
    $('btn-speed').addEventListener('click', () => { const g = G(); g.speed = g.speed === 1 ? 2 : 1; $('btn-speed').textContent = g.speed + '×'; A().play('ui_tap', { vol: 0.5 }); });
    $('btn-sound').addEventListener('click', () => { A().setMuted(!A().muted); U.refreshSound(); if (!A().muted) A().play('ui_tap', { vol: 0.5 }); });
    $('btn-menu').addEventListener('click', () => U.openMenu());
    $('btn-resume').addEventListener('click', () => U.closeMenu());
    $('btn-fit').addEventListener('click', () => { G().fitMap(); U.closeMenu(); });
    $('btn-restart').addEventListener('click', () => { U.closeMenu(); U.startGame(); });
    $('tg-music').addEventListener('click', () => { A().setMusicMuted(!A().musicMuted); U.refreshSound(); });
    $('tg-sfx').addEventListener('click', () => { A().setMuted(!A().muted); U.refreshSound(); });
    $('btn-credits').addEventListener('click', () => { U.buildCredits(); $('credits').classList.remove('hidden'); });
    $('btn-credits-close').addEventListener('click', () => $('credits').classList.add('hidden'));
    $('btn-end-restart').addEventListener('click', () => { $('end').classList.add('hidden'); U.startGame(); });
    $('btn-upgrade').addEventListener('click', () => { const t = U.selectedTower(); if (t) G().upgrade(t); });
    $('btn-sell').addEventListener('click', () => { const t = U.selectedTower(); if (t) G().sell(t); });
    U.refreshSound();
  };

  // Tower thumbnails are rendered from the real 3D models, so they can only be
  // made once the kit has finished loading.
  U.buildIcons = function () {
    document.querySelectorAll('.rb img').forEach((img) => { img.src = R3().towerIcon(img.dataset.tower, 0, 128); });
  };

  U.startGame = function () {
    $('title').classList.add('hidden'); $('end').classList.add('hidden'); $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden'); $('btn-speed').textContent = '1×';
    G().newGame();
    A().playTrack('battle1', { playlist: ['battle1', 'battle2', 'battle3'], fade: 1.5 });
    U.banner('Ravenhold', 'The Old Road');
  };

  U.selectedTower = function () { const s = G().selected; return s && s.kind === 'tower' ? G().towers[s.index] : null; };

  U.onSelect = function (sel) {
    $('radial').classList.add('hidden'); $('tmwrap').classList.add('hidden'); U.anchor = null;
    if (!sel) return;
    const p = TD.LEVEL.plots[sel.index];
    if (sel.kind === 'plot') { U.refreshCards(); U.anchor = { el: $('radial'), x: p[0], z: p[1], h: 6 }; $('radial').classList.remove('hidden'); }
    else { U.refreshTowerMenu(); const t = G().towers[sel.index]; U.anchor = { el: $('tmwrap'), x: p[0], z: p[1], h: R3().towerHeight(t.type, t.level) + 14 }; $('tmwrap').classList.remove('hidden'); }
    U.placeAnchor();
  };
  U.placeAnchor = function () {
    const a = U.anchor; if (!a) return; const s = G().toScreen(a.x, a.z, a.h);
    if (a.el.id === 'tmwrap') { const w = 232; const x = Math.max(w / 2 + 8, Math.min(R3().vw - w / 2 - 8, s.x)); a.el.style.left = x + 'px'; a.el.style.top = Math.max(150, s.y - 8) + 'px'; }
    else { a.el.style.left = s.x + 'px'; a.el.style.top = s.y + 'px'; }
  };
  U.afterRender = function () {
    U.placeAnchor();
    const g = G(); $('fx-flash').style.opacity = g.flash > 0 ? Math.min(1, g.flash) : 0; $('fx-frost').style.opacity = g.frost > 0 ? Math.min(1, g.frost) * 0.8 : 0;
  };

  U.refreshCards = function () { document.querySelectorAll('.rb').forEach((c) => c.classList.toggle('poor', !G().canBuild(c.dataset.type))); };

  U.refreshTowerMenu = function () {
    const t = U.selectedTower(); if (!t) return;
    const lv = t.def.levels[t.level], nx = t.def.levels[t.level + 1];
    $('tm-name').textContent = t.def.name + ' · Lv ' + (t.level + 1);
    $('tm-icon').src = R3().towerIcon(t.type, t.level, 96);
    const up = (a, b) => (nx != null && b !== a) ? `<i>→${b}</i>` : '';
    let html = `Dmg <b>${lv.dmg}</b>${up(lv.dmg, nx && nx.dmg)} · Rng <b>${lv.range}</b>${up(lv.range, nx && nx.range)} · <b>${lv.rate.toFixed(1)}/s</b>`;
    if (lv.splash) html += ` · Splash <b>${lv.splash}</b>${up(lv.splash, nx && nx.splash)}`;
    if (lv.pierce) html += ` · Pierce <b>${lv.pierce}</b>${up(lv.pierce, nx && nx.pierce)}`;
    html += `<br>${lv.dtype === 'magic' ? 'Magic' : 'Physical'}${nx && nx.slow ? ' · <i>next: chills</i>' : ''}${t.kills ? ' · ' + t.kills + ' kills' : ''}`;
    $('tm-stats').innerHTML = html;
    const c = G().upgradeCost(t); const ub = $('btn-upgrade');
    if (c == null) { ub.disabled = true; ub.querySelector('.lbl').textContent = 'Max level'; ub.querySelector('.cost').style.display = 'none'; }
    else { ub.disabled = false; ub.querySelector('.lbl').textContent = 'Upgrade'; ub.querySelector('.cost').style.display = ''; $('upgrade-cost').textContent = c; ub.classList.toggle('poor', G().gold < c); }
    $('sell-value').textContent = G().sellValue(t);
  };

  U.onCastingChange = function () {
    const g = G(); document.querySelectorAll('.spell').forEach((b) => b.classList.toggle('armed', g.casting === b.dataset.spell));
    $('cast-hint').classList.toggle('hidden', !g.casting);
  };

  U.refreshHud = function () {
    const g = G(), L = U.last;
    if (L.gold !== g.gold) { L.gold = g.gold; $('hud-gold').textContent = g.gold; U.refreshCards(); const t = U.selectedTower(); if (t) { const c = g.upgradeCost(t); if (c != null) $('btn-upgrade').classList.toggle('poor', g.gold < c); } }
    if (L.lives !== g.lives) { L.lives = g.lives; $('hud-lives').textContent = Math.max(0, g.lives); }
    const waveTxt = 'Wave ' + Math.min(g.waveIndex, TD.WAVES.length) + '/' + TD.WAVES.length;
    if (L.wave !== waveTxt) { L.wave = waveTxt; $('hud-wave').textContent = waveTxt; }
    const active = g.waveActive(); const next = TD.WAVES[g.waveIndex]; const key = (next ? g.waveIndex : 'done') + ':' + active + ':' + g.over;
    if (L.waveKey !== key) {
      L.waveKey = key; const b = $('btn-wave');
      if (!next) { b.classList.add('busy'); b.querySelector('.wl').textContent = g.over ? (g.won ? 'Victory' : 'Ravenhold has fallen') : 'Hold the line'; b.querySelector('.ws').textContent = g.over ? '' : 'Last wave is on the road'; b.disabled = true; }
      else { b.disabled = false; b.classList.toggle('busy', active); b.querySelector('.wl').textContent = active ? 'Call next wave' : 'Sound the horn'; b.querySelector('.ws').textContent = 'Wave ' + (g.waveIndex + 1) + ' · ' + next.name; }
    }
    for (const id of ['fire', 'frost']) {
      const b = $('btn-' + id), cd = g.cooldowns[id], sp = TD.SPELLS[id]; const ready = cd <= 0;
      b.classList.toggle('ready', ready && !g.over); b.classList.toggle('cooling', !ready);
      b.querySelector('.cd').style.setProperty('--p', (ready ? 0 : cd / sp.cooldown * 100) + '%');
      const txt = ready ? '' : Math.ceil(cd) + ''; const el = b.querySelector('.cdt'); if (el.textContent !== txt) el.textContent = txt;
    }
  };
  U.refreshAll = function () { U.last = {}; U.refreshHud(); U.refreshCards(); if (U.selectedTower()) U.refreshTowerMenu(); U.onCastingChange(); };

  U.refreshSound = function () {
    $('btn-sound').classList.toggle('muted', A().muted);
    $('tg-music').classList.toggle('off', A().musicMuted); $('tg-music').querySelector('b').textContent = A().musicMuted ? 'Off' : 'On';
    $('tg-sfx').classList.toggle('off', A().muted); $('tg-sfx').querySelector('b').textContent = A().muted ? 'Off' : 'On';
  };
  U.openMenu = function () { G().paused = true; $('menu').classList.remove('hidden'); A().play('ui_open', { vol: 0.6 }); };
  U.closeMenu = function () { G().paused = false; $('menu').classList.add('hidden'); A().play('ui_close', { vol: 0.5 }); };

  U.banner = function (main, sub) {
    const b = $('banner'); b.querySelector('.bm').textContent = main; b.querySelector('.bs').textContent = sub || '';
    b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(U.bannerTimer); U.bannerTimer = setTimeout(() => b.classList.add('hidden'), 2600);
  };
  U.toast = function (text) {
    const t = $('toast'); t.textContent = text; t.classList.remove('hidden'); t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(U.toastTimer); U.toastTimer = setTimeout(() => t.classList.add('hidden'), 1600);
  };
  U.showEnd = function (won) {
    const g = G();
    $('end-title').textContent = won ? 'Ravenhold stands' : 'Ravenhold has fallen';
    $('end-text').textContent = won ? `The Blackgate host is broken on the Old Road. ${g.stats.kills} foes slain, ${g.stats.leaks} reached the gate. Lives left: ${g.lives}.`
      : `The gate is breached after wave ${g.waveIndex}. ${g.stats.kills} foes fell before the end. Raise your towers earlier and mind the road's bends.`;
    $('end').classList.remove('hidden');
  };
  U.buildCredits = function () {
    const b = $('credits-body'); if (b.dataset.done) return; b.dataset.done = '1';
    b.innerHTML = `
      <p>Ravenhold is a fan-made, free tower defense. Every model, track and sound effect is a free/open asset:</p>
      <h3>3D models — KayKit by Kay Lousberg (CC0)</h3>
      <ul><li>Medieval Hexagon Pack — towers, keep, walls, bridge, trees, rocks, mountains</li><li>Character Pack: Skeletons — the undead, plus arrows and bolts</li><li>Character Pack: Adventurers — goblins, orcs, riders and warlocks</li></ul>
      <p><a href="https://www.kaylousberg.com" target="_blank" rel="noopener">kaylousberg.com</a> — free for personal and commercial use.</p>
      <h3>Music — The Battle for Wesnoth (GNU GPL v2+)</h3>
      <ul><li>“Legends of the North” — Mattias Westlund</li><li>“The City Falls” — Doug Kaufman</li><li>“Siege of Laurelmor” — Doug Kaufman</li><li>“Frantic” — Stephen Rozanc</li><li>“Victory” and “Defeat” — Ryan Reilly</li></ul>
      <h3>Sound effects</h3>
      <ul><li>Combat, creature and ambient sounds — The Battle for Wesnoth project (Lari Nieminen, Richard Kettering, Scott Klempner, J.W. Bjerk and others), GNU GPL v2+</li><li>Interface clicks — Kenney (kenney.nl), CC0</li></ul>
      <p>Rendering: three.js (MIT). Fonts: Cinzel and Crimson Pro (SIL OFL). The terrain texture is generated by the game.</p>`;
  };

  TD.UI = U;
})(window.TD);
