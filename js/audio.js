// ---------------------------------------------------------------------------
// Ravenhold — audio engine (Web Audio for SFX, media elements routed through
// Web Audio for music so volume/crossfades work on iOS)
// ---------------------------------------------------------------------------
window.TD = window.TD || {};
(function (TD) {
  'use strict';

  const SFX_NAMES = ('birds1 birds2 birds3 bow bow2 build catapult cavein crossbow crossbow2 dark explosion faerie fanfare fire flame flesh frost ' +
    'gob_die1 gob_die2 gob_hit1 gob_hit2 gold groan heal holy horn1 horn2 horn3 horn4 horse_canter horse_die horse_hit human_die1 human_die2 ' +
    'human_hit1 human_hit2 impact lich_die lightning magic1 magic2 magic3 ogre_die1 ogre_die2 ogre_hit1 ogre_hit2 orc_die1 orc_die2 orc_hit1 ' +
    'orc_hit2 rumble sell skel_die1 skel_die2 skel_hit1 skel_hit2 swish throw troll_die1 troll_die2 troll_hit1 troll_hit2 ugg ui_close ui_open ' +
    'ui_tap ui_tap2 upgrade wail wardrums wolf_die1 wolf_die2 wolf_growl1 wolf_growl2 wolf_hit1 wolf_hit2').split(' ');

  const BASE = (function () {
    // resolve relative to the page so it works from any sub-path
    return 'audio/';
  })();

  const A = {
    ctx: null, master: null, sfxGain: null, musicGain: null,
    buffers: {}, loading: false, ready: false,
    muted: false, musicMuted: false,
    music: { a: null, b: null, cur: null, track: null, playlist: null, plIndex: 0, unlocked: false },
    lastPlayed: {},
    sfxVolume: 1, musicVolume: 0.75,
  };

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('ravenhold.audio') || '{}');
      if (typeof p.muted === 'boolean') A.muted = p.muted;
      if (typeof p.musicMuted === 'boolean') A.musicMuted = p.musicMuted;
    } catch (e) { /* ignore */ }
  }
  function savePrefs() {
    try { localStorage.setItem('ravenhold.audio', JSON.stringify({ muted: A.muted, musicMuted: A.musicMuted })); } catch (e) { /* ignore */ }
  }
  loadPrefs();

  function mkElement() {
    const el = new Audio();
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.setAttribute('playsinline', '');
    el.loop = false;
    return el;
  }

  // Must be called from a user gesture (touchend/click)
  A.init = function () {
    if (A.ctx) { if (A.ctx.state !== 'running') A.ctx.resume().catch(() => {}); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
    A.ctx = new Ctx({ latencyHint: 'interactive' });
    A.master = A.ctx.createGain();
    A.sfxGain = A.ctx.createGain();
    A.musicGain = A.ctx.createGain();
    A.sfxGain.connect(A.master); A.musicGain.connect(A.master); A.master.connect(A.ctx.destination);
    A.applyVolumes();
    // music elements routed through the graph
    A.music.a = { el: mkElement(), gain: A.ctx.createGain(), src: null };
    A.music.b = { el: mkElement(), gain: A.ctx.createGain(), src: null };
    for (const m of [A.music.a, A.music.b]) {
      try {
        m.src = A.ctx.createMediaElementSource(m.el);
        m.src.connect(m.gain);
      } catch (e) { m.src = null; }
      m.gain.gain.value = 0;
      m.gain.connect(A.musicGain);
      m.el.addEventListener('ended', () => { if (A.music.cur === m) A._advance(); });
    }
    if (A.ctx.state !== 'running') A.ctx.resume().catch(() => {});
    // iOS unlock: a silent buffer inside the gesture
    try {
      const b = A.ctx.createBuffer(1, 1, 22050); const s = A.ctx.createBufferSource(); s.buffer = b; s.connect(A.ctx.destination); s.start(0);
    } catch (e) { /* ignore */ }
    A.loadAll();
    document.addEventListener('visibilitychange', () => {
      if (!A.ctx) return;
      if (document.hidden) { A.ctx.suspend().catch(() => {}); }
      else { A.ctx.resume().catch(() => {}); if (A.music.cur && A.music.cur.el.paused && !A.musicMuted) A.music.cur.el.play().catch(() => {}); }
    });
  };

  A.applyVolumes = function () {
    if (!A.ctx) return;
    A.sfxGain.gain.value = A.muted ? 0 : A.sfxVolume;
    A.musicGain.gain.value = (A.muted || A.musicMuted) ? 0 : A.musicVolume;
  };

  A.loadAll = function () {
    if (A.loading) return; A.loading = true;
    let n = 0;
    const done = () => { n++; if (n >= SFX_NAMES.length) A.ready = true; };
    SFX_NAMES.forEach((name) => {
      fetch(BASE + 'sfx/' + name + '.mp3').then((r) => r.arrayBuffer()).then((ab) => new Promise((res, rej) => {
        // callback form for older iOS
        A.ctx.decodeAudioData(ab, res, rej);
      })).then((buf) => { A.buffers[name] = buf; done(); }).catch(() => done());
    });
  };

  // play a sound effect. opts: {vol, rate, throttle(ms)}
  A.play = function (name, opts) {
    if (!A.ctx || A.muted) return null;
    const buf = A.buffers[name]; if (!buf) return null;
    opts = opts || {};
    const now = performance.now();
    const thr = opts.throttle == null ? 45 : opts.throttle;
    if (A.lastPlayed[name] && now - A.lastPlayed[name] < thr) return null;
    A.lastPlayed[name] = now;
    const src = A.ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = (opts.rate || 1) * (opts.vary ? (1 + (Math.random() * 2 - 1) * opts.vary) : 1);
    const g = A.ctx.createGain(); g.gain.value = opts.vol == null ? 1 : opts.vol;
    src.connect(g);
    let last = g;
    if (opts.pan != null && A.ctx.createStereoPanner) { const p = A.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan)); last.connect(p); last = p; }
    last.connect(A.sfxGain);
    src.start(0);
    return src;
  };
  A.playAny = function (names, opts) { return A.play(names[Math.floor(Math.random() * names.length)], opts); };

  // ---- music ------------------------------------------------------------
  function other(m) { return m === A.music.a ? A.music.b : A.music.a; }

  A._advance = function () {
    if (A.music.playlist) {
      A.music.plIndex = (A.music.plIndex + 1) % A.music.playlist.length;
      A.playTrack(A.music.playlist[A.music.plIndex], { fade: 1.5 });
    }
  };

  // Crossfades to a track. opts: {loop, fade, playlist}
  A.playTrack = function (key, opts) {
    if (!A.ctx) return;
    opts = opts || {};
    if (opts.playlist) { A.music.playlist = opts.playlist; A.music.plIndex = Math.max(0, opts.playlist.indexOf(key)); }
    else if (!opts.keepPlaylist) A.music.playlist = null;
    if (A.music.track === key && A.music.cur && !A.music.cur.el.paused) return;
    const prev = A.music.cur;
    const nxt = prev ? other(prev) : A.music.a;
    const t = A.ctx.currentTime, fade = opts.fade == null ? 1.2 : opts.fade;
    if (prev) {
      prev.gain.gain.cancelScheduledValues(t); prev.gain.gain.setValueAtTime(prev.gain.gain.value, t);
      prev.gain.gain.linearRampToValueAtTime(0, t + fade);
      const pel = prev.el; setTimeout(() => { if (A.music.cur !== prev) { pel.pause(); } }, fade * 1000 + 50);
    }
    nxt.el.loop = !!opts.loop;
    nxt.el.src = BASE + 'music/' + key + '.mp3';
    nxt.el.currentTime = 0;
    nxt.gain.gain.cancelScheduledValues(t); nxt.gain.gain.setValueAtTime(0, t);
    nxt.gain.gain.linearRampToValueAtTime(1, t + fade);
    A.music.cur = nxt; A.music.track = key;
    if (!A.musicMuted) nxt.el.play().catch(() => {});
  };

  A.stopMusic = function (fade) {
    if (!A.ctx || !A.music.cur) return;
    const m = A.music.cur, t = A.ctx.currentTime; fade = fade == null ? 1 : fade;
    m.gain.gain.cancelScheduledValues(t); m.gain.gain.setValueAtTime(m.gain.gain.value, t);
    m.gain.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => { if (A.music.cur === m) { m.el.pause(); A.music.cur = null; A.music.track = null; } }, fade * 1000 + 50);
    A.music.playlist = null;
  };

  A.setMuted = function (v) { A.muted = v; A.applyVolumes(); savePrefs(); if (A.music.cur) { if (v) A.music.cur.el.pause(); else if (!A.musicMuted) A.music.cur.el.play().catch(() => {}); } };
  A.setMusicMuted = function (v) { A.musicMuted = v; A.applyVolumes(); savePrefs(); if (A.music.cur) { if (v) A.music.cur.el.pause(); else if (!A.muted) A.music.cur.el.play().catch(() => {}); } };
  A.setMusicVolume = function (v) { A.musicVolume = v; A.applyVolumes(); };

  TD.Audio = A;
})(window.TD);
