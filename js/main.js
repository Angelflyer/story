// ---------------------------------------------------------------------------
// Ravenhold — boot. Called from the module script once three.js is imported.
// ---------------------------------------------------------------------------
(function () {
  'use strict';
  const TD = window.TD;

  TD.boot = function () {
    const fill = document.getElementById('loading-fill');
    const text = document.getElementById('loading-text');
    const startBtn = document.getElementById('btn-start');

    TD.UI.init();
    TD.Game.init(document.getElementById('game'), (p) => {
      fill.style.width = Math.round(p * 100) + '%';
      if (p >= 1) text.textContent = 'Ready';
    }).then(() => {
      TD.UI.buildIcons();
      document.getElementById('loading').classList.add('done');
      startBtn.disabled = false;
    }).catch((err) => {
      text.textContent = 'Could not load the art assets. Reload to try again.';
      console.error(err);
    });

    const start = () => { if (startBtn.disabled) return; TD.Audio.init(); TD.UI.startGame(); };
    startBtn.addEventListener('click', start);
    document.getElementById('title').addEventListener('pointerdown', () => TD.Audio.init(), { once: true });
    document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
  };
})();
