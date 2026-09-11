// ---------------------------------------------------------------------------
// Ravenhold — boot
// ---------------------------------------------------------------------------
(function () {
  'use strict';
  const TD = window.TD;
  function boot() {
    TD.Game.init(document.getElementById('game'));
    TD.UI.init();
    const start = () => { TD.Audio.init(); TD.UI.startGame(); };
    document.getElementById('btn-start').addEventListener('click', start);
    document.getElementById('title').addEventListener('pointerdown', () => TD.Audio.init(), { once: true });
    document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
  }
  function ready() { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot(); }
  if (window.THREE) ready(); else window.addEventListener('three-ready', ready, { once: true });
})();
