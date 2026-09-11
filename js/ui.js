// ---------------------------------------------------------------------------
// Ravenhold — HUD, sheets, menus
// ---------------------------------------------------------------------------
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const G = () => TD.Game, A = () => TD.Audio;
  const U = { previewType: null, last: {}, bannerTimer: null, toastTimer: null };

  U.init = function () {
    // tower cards
    const cards = $('tower-cards'); cards.innerHTML = '';
    for (const id of TD.TOWER_ORDER) {
      const def = TD.TOWERS[id];
      const card = document.createElement('button'); card.className = 'tower-card'; card.dataset.type = id;
      const cv = document.createElement('canvas'); cv.width = 112; cv.height = 112; TD.Render.towerIcon(cv, id, 0);
      card.appendChild(cv);
      const nm = document.createElement('div'); nm.className = 'tc-name'; nm.textContent = def.short; card.appendChild(nm);
      const cost = document.createElement('div'); cost.className = 'tc-cost'; cost.innerHTML = '<span class="ico ico-gold small"></span>' + def.cost; card.appendChild(cost);
      card.addEventListener('click', () => { const s = G().selected; if (!s || s.kind !== 'plot') return; G().build(s.index, id); });
      card.addEventListener('pointerenter', () => { U.previewType = id; U.showDesc(id); });
      card.addEventListener('pointerdown', () => { U.previewType = id; U.showDesc(id); });
      cards.appendChild(card);
    }
    const desc = document.createElement('div'); desc.className = 'tower-desc'; desc.id = 'tower-desc'; $('build-sheet').appendChild(desc);

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
    document.querySelectorAll('.spell').forEach((b) => { const cd = document.createElement('span'); cd.className = 'cd-text'; b.appendChild(cd); });
    U.refreshSound();
  };

  U.startGame = function () {
    $('title').classList.add('hidden'); $('end').classList.add('hidden'); $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('btn-speed').textContent = '1×';
    G().newGame();
    A().playTrack('battle1', { playlist: ['battle1', 'battle2', 'battle3'], fade: 1.5 });
    U.banner('Ravenhold', 'The Old Road');
  };

  U.selectedTower = function () { const s = G().selected; return s && s.kind === 'tower' ? G().towers[s.index] : null; };
  U.showDesc = function (id) { const d = $('tower-desc'); if (d) d.textContent = TD.TOWERS[id].desc; };

  U.onSelect = function (sel) {
    $('build-sheet').classList.add('hidden'); $('tower-sheet').classList.add('hidden'); U.previewType = null;
    if (!sel) return;
    if (sel.kind === 'plot') { U.refreshCards(); $('build-sheet').classList.remove('hidden'); U.previewType = null; const d = $('tower-desc'); if (d) d.textContent = 'Choose a tower to raise on this ground.'; }
    else U.refreshTowerSheet();
  };

  U.refreshCards = function () {
    document.querySelectorAll('.tower-card').forEach((c) => { c.classList.toggle('poor', !G().canBuild(c.dataset.type)); });
  };

  U.refreshTowerSheet = function () {
    const t = U.selectedTower(); if (!t) return;
    const lv = t.def.levels[t.level], nx = t.def.levels[t.level + 1];
    $('tower-name').textContent = t.def.name; $('tower-level').textContent = 'Level ' + (t.level + 1) + (t.level === 2 ? ' · Fully upgraded' : '') + (t.kills ? ' · ' + t.kills + ' kills' : '');
    TD.Render.towerIcon($('tower-portrait'), t.type, t.level);
    const up = (a, b) => (nx && b !== a) ? ` <span class="up">→ ${b}</span>` : '';
    const rate = (r) => (r).toFixed(1);
    let html = `<span>Damage <b>${lv.dmg}</b>${up(lv.dmg, nx && nx.dmg)}</span>` +
      `<span>Range <b>${lv.range}</b>${up(lv.range, nx && nx.range)}</span>` +
      `<span>Rate <b>${rate(lv.rate)}/s</b>${nx && nx.rate !== lv.rate ? ` <span class="up">→ ${rate(nx.rate)}/s</span>` : ''}</span>`;
    if (lv.splash) html += `<span>Splash <b>${lv.splash}</b>${up(lv.splash, nx && nx.splash)}</span>`;
    if (lv.pierce) html += `<span>Pierce <b>${lv.pierce}</b>${up(lv.pierce, nx && nx.pierce)}</span>`;
    html += `<span>${lv.dtype === 'magic' ? 'Magic damage' : 'Physical damage'}</span>`;
    if (nx && nx.slow) html += `<span class="up">Next: chills targets</span>`;
    $('tower-stats').innerHTML = html;
    const c = G().upgradeCost(t);
    const ub = $('btn-upgrade');
    if (c == null) { ub.disabled = true; ub.querySelector('.act-label').textContent = 'Max level'; ub.querySelector('.act-cost').style.display = 'none'; }
    else { ub.disabled = false; ub.querySelector('.act-label').textContent = 'Upgrade'; ub.querySelector('.act-cost').style.display = ''; $('upgrade-cost').textContent = c; ub.classList.toggle('poor', G().gold < c); }
    $('sell-value').textContent = G().sellValue(t);
    $('tower-sheet').classList.remove('hidden');
  };

  U.onCastingChange = function () {
    const g = G();
    document.querySelectorAll('.spell').forEach((b) => b.classList.toggle('armed', g.casting === b.dataset.spell));
    $('cast-hint').classList.toggle('hidden', !g.casting);
  };

  U.refreshHud = function () {
    const g = G(), L = U.last;
    if (L.gold !== g.gold) { L.gold = g.gold; $('hud-gold').textContent = g.gold; U.refreshCards(); const t = U.selectedTower(); if (t) { const c = g.upgradeCost(t); if (c != null) $('btn-upgrade').classList.toggle('poor', g.gold < c); } }
    if (L.lives !== g.lives) { L.lives = g.lives; $('hud-lives').textContent = Math.max(0, g.lives); }
    const waveTxt = 'Wave ' + Math.min(g.waveIndex, TD.WAVES.length) + '/' + TD.WAVES.length;
    if (L.wave !== waveTxt) { L.wave = waveTxt; $('hud-wave').textContent = waveTxt; }
    // wave button
    const active = g.waveActive(); const next = TD.WAVES[g.waveIndex];
    const key = (next ? g.waveIndex : 'done') + ':' + active + ':' + g.over;
    if (L.waveKey !== key) {
      L.waveKey = key; const b = $('btn-wave');
      if (!next) { b.classList.add('busy'); b.querySelector('.wave-label').textContent = g.over ? (g.won ? 'Victory' : 'Ravenhold has fallen') : 'Hold the line'; b.querySelector('.wave-sub').textContent = g.over ? '' : 'Last wave is on the road'; b.disabled = true; }
      else { b.disabled = false; b.classList.toggle('busy', active); b.querySelector('.wave-label').textContent = active ? 'Call next wave' : (g.waveIndex === 0 ? 'Sound the horn' : 'Sound the horn'); b.querySelector('.wave-sub').textContent = 'Wave ' + (g.waveIndex + 1) + ' · ' + next.name; }
    }
    // spells
    for (const id of ['fire', 'frost']) {
      const b = $('btn-' + id), cd = g.cooldowns[id], sp = TD.SPELLS[id]; const ready = cd <= 0;
      b.classList.toggle('ready', ready && !g.over); b.classList.toggle('cooling', !ready);
      b.querySelector('.spell-cd').style.transform = 'scaleY(' + (ready ? 0 : cd / sp.cooldown) + ')';
      const txt = ready ? '' : Math.ceil(cd) + 's'; const el = b.querySelector('.cd-text'); if (el.textContent !== txt) el.textContent = txt;
    }
  };
  U.refreshAll = function () { U.last = {}; U.refreshHud(); U.refreshCards(); if (U.selectedTower()) U.refreshTowerSheet(); U.onCastingChange(); };

  U.refreshSound = function () {
    $('btn-sound').classList.toggle('muted', A().muted);
    $('tg-music').classList.toggle('off', A().musicMuted); $('tg-music').querySelector('b').textContent = A().musicMuted ? 'Off' : 'On';
    $('tg-sfx').classList.toggle('off', A().muted); $('tg-sfx').querySelector('b').textContent = A().muted ? 'Off' : 'On';
  };

  U.openMenu = function () { G().paused = true; $('menu').classList.remove('hidden'); A().play('ui_open', { vol: 0.6 }); };
  U.closeMenu = function () { G().paused = false; $('menu').classList.add('hidden'); A().play('ui_close', { vol: 0.5 }); };

  U.banner = function (main, sub) {
    const b = $('banner'); b.querySelector('.banner-main').textContent = main; b.querySelector('.banner-sub').textContent = sub || '';
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
    $('end-text').textContent = won
      ? `The Blackgate host is broken on the Old Road. ${g.stats.kills} foes slain, ${g.stats.leaks} reached the gate. Lives left: ${g.lives}.`
      : `The gate is breached after wave ${g.waveIndex}. ${g.stats.kills} foes fell before the end. Raise your towers earlier and mind the road's bends.`;
    $('end').classList.remove('hidden');
  };

  U.buildCredits = function () {
    const b = $('credits-body'); if (b.dataset.done) return; b.dataset.done = '1';
    b.innerHTML = `
      <p>Ravenhold is a fan-made, free tower defense. All music and sound effects are free/open assets, used with attribution:</p>
      <h3>Music — The Battle for Wesnoth (GNU GPL v2+)</h3>
      <ul>
        <li>“Legends of the North” — Mattias Westlund</li>
        <li>“The City Falls” — Doug Kaufman</li>
        <li>“Siege of Laurelmor” — Doug Kaufman</li>
        <li>“Frantic” — Stephen Rozanc</li>
        <li>“Victory” and “Defeat” — Ryan Reilly</li>
      </ul>
      <h3>Sound effects</h3>
      <ul>
        <li>Combat, creature and ambient sounds — The Battle for Wesnoth project (Lari Nieminen, Richard Kettering, Scott Klempner, J.W. Bjerk and others), GNU GPL v2+</li>
        <li>Interface clicks — Kenney (kenney.nl), CC0</li>
      </ul>
      <p>Wesnoth assets: <a href="https://github.com/wesnoth/wesnoth" target="_blank" rel="noopener">github.com/wesnoth/wesnoth</a>. Full per-file credits ship with the game in audio/credits.json.</p>
      <p>Fonts: Cinzel and Crimson Pro (SIL Open Font License) via Google Fonts.</p>
      <p>Artwork is drawn procedurally by the game.</p>`;
  };

  TD.UI = U;
})(window.TD);
