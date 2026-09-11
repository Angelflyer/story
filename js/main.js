// ---------------------------------------------------------------------------
// Ravenhold — boot
// ---------------------------------------------------------------------------
(function () {
  'use strict';
  const TD = window.TD;
  function boot() {
    TD.UI.init();
    TD.Game.init(document.getElementById('game'));
    const start = () => {
      TD.Audio.init();
      TD.UI.startGame();
    };
    document.getElementById('btn-start').addEventListener('click', start);
    // make the first tap anywhere on the title also unlock audio
    document.getElementById('title').addEventListener('pointerdown', () => TD.Audio.init(), { once: true });
    // prevent iOS Safari from bouncing the page
    document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
