// ---------------------------------------------------------------------------
// Ravenhold — ground texture (grass, road, river bed) painted once on a canvas
// and used as the terrain map in the 3D scene.
// ---------------------------------------------------------------------------
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  const TAU = Math.PI * 2;
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function makeNoise(seed) {
    const rnd = mulberry32(seed); const perm = new Uint8Array(512); const p = [];
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const grad = (h, x, y) => { switch (h & 3) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; default: return -x - y; } };
    const n2 = (x, y) => {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
      const u = fade(x), v = fade(y); const a = perm[X] + Y, b = perm[X + 1] + Y; const l = (t, p, q) => p + t * (q - p);
      return l(v, l(u, grad(perm[a], x, y), grad(perm[b], x - 1, y)), l(u, grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1)));
    };
    return { fbm: (x, y, oct) => { let s = 0, a = 1, f = 1, m = 0; for (let i = 0; i < (oct || 4); i++) { s += a * n2(x * f, y * f); m += a; a *= 0.5; f *= 2; } return s / m; } };
  }
  const lerpC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function polyline(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }
  function ell(ctx, x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
  function circ(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }

  TD.mulberry32 = mulberry32;

  // Returns {canvas, river (smoothed points)}
  TD.buildGround = function (level, path, scale) {
    const W = TD.WORLD.w, H = TD.WORLD.h;
    const cv = document.createElement('canvas'); cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
    const ctx = cv.getContext('2d'); ctx.scale(scale, scale);
    const rnd = mulberry32(1337); const noise = makeNoise(42);
    const river = TD.smoothCurve(level.river, 8); const roadPts = path.pts;

    // grass
    (function () {
      const gw = 240, gh = 400; const img = ctx.createImageData(gw, gh); const d = img.data;
      const g1 = [78, 170, 96], g2 = [46, 126, 76], g3 = [124, 190, 96], g4 = [58, 146, 84];
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        const wx = x / gw * W, wy = y / gh * H;
        const n = noise.fbm(wx / 260, wy / 260, 4) * 0.5 + 0.5, m = noise.fbm(wx / 90 + 7, wy / 90 + 3, 3) * 0.5 + 0.5;
        let c = lerpC(g2, g1, n); c = lerpC(c, g3, Math.max(0, m - 0.55) * 1.2); c = lerpC(c, g4, Math.max(0, 0.42 - m) * 1.4);
        c = lerpC(c, [44, 96, 78], Math.max(0, 1 - wy / 420) * 0.28);
        const i = (y * gw + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
      const tmp = document.createElement('canvas'); tmp.width = gw; tmp.height = gh; tmp.getContext('2d').putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(tmp, 0, 0, W, H);
      for (let i = 0; i < 14000; i++) { const x = rnd() * W, y = rnd() * H; const l = 2 + rnd() * 4; ctx.strokeStyle = rnd() < 0.5 ? 'rgba(160,225,130,0.22)' : 'rgba(20,80,50,0.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 2, y - l); ctx.stroke(); }
      // worn dirt patches
      for (let i = 0; i < 40; i++) { const x = rnd() * W, y = rnd() * H; ell(ctx, x, y, 20 + rnd() * 40, 12 + rnd() * 20, 'rgba(150,120,70,0.1)'); }
    })();

    // river bed (water surface is a 3D mesh)
    (function () {
      const w = level.riverWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      polyline(ctx, river); ctx.strokeStyle = 'rgba(90,70,44,0.5)'; ctx.lineWidth = w + 26; ctx.stroke();
      polyline(ctx, river); ctx.strokeStyle = '#b27052'; ctx.lineWidth = w + 12; ctx.stroke();
      polyline(ctx, river); ctx.strokeStyle = '#17708f'; ctx.lineWidth = w + 2; ctx.stroke();
      polyline(ctx, river); ctx.strokeStyle = '#1f92bd'; ctx.lineWidth = w * 0.7; ctx.stroke();
      for (let i = 0; i < river.length; i += 2) {
        const p = river[i], q = river[Math.min(i + 1, river.length - 1)]; const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        for (const s of [-1, 1]) if (rnd() < 0.6) { const o = w / 2 + 5 + rnd() * 8; circ(ctx, p[0] + nx * o * s, p[1] + ny * o * s, 1.5 + rnd() * 2.5, rnd() < 0.5 ? '#aab8be' : '#837265'); }
      }
    })();

    // road
    (function () {
      const w = level.roadWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      polyline(ctx, roadPts); ctx.strokeStyle = 'rgba(70,50,28,0.35)'; ctx.lineWidth = w + 16; ctx.stroke();
      polyline(ctx, roadPts); ctx.strokeStyle = '#b27052'; ctx.lineWidth = w + 5; ctx.stroke();
      polyline(ctx, roadPts); ctx.strokeStyle = '#c08e59'; ctx.lineWidth = w; ctx.stroke();
      for (let i = 0; i < roadPts.length; i++) {
        const p = roadPts[i], q = roadPts[Math.min(i + 1, roadPts.length - 1)]; const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        for (let k = 0; k < 2; k++) { const o = (rnd() - 0.5) * w * 0.8; ell(ctx, p[0] + nx * o, p[1] + ny * o, 3 + rnd() * 6, 2 + rnd() * 3, rnd() < 0.5 ? 'rgba(226,188,141,0.22)' : 'rgba(150,98,64,0.24)'); }
        if (i % 2 === 0) for (const s of [-1, 1]) { const o = 13 * s; circ(ctx, p[0] + nx * o, p[1] + ny * o, 1.6, 'rgba(125,61,44,0.3)'); }
        if (rnd() < 0.2) { const s = rnd() < 0.5 ? -1 : 1; const o = w / 2 + 2 + rnd() * 5; circ(ctx, p[0] + nx * o * s, p[1] + ny * o * s, 1 + rnd() * 1.6, 'rgba(150,145,135,0.8)'); }
      }
    })();

    // stone foundations on the build plots
    (function () {
      for (const [x, y] of level.plots) {
        const gr = ctx.createRadialGradient(x - 8, y - 8, 4, x, y, 42);
        gr.addColorStop(0, '#cfc6b6'); gr.addColorStop(0.75, '#b3a996'); gr.addColorStop(1, '#8d8477');
        circ(ctx, x, y, 42, gr);
        ctx.strokeStyle = 'rgba(70,62,52,0.5)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, 42, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(70,62,52,0.32)'; ctx.lineWidth = 1.4;
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * TAU + 0.3;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 17, y + Math.sin(a) * 17);
          ctx.lineTo(x + Math.cos(a) * 41, y + Math.sin(a) * 41); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.stroke();
      }
    })();

    // dark ground under the Blackgate & flagstones in the castle yard
    (function () {
      const g = level.gate; const gr = ctx.createRadialGradient(g.x, g.y, 5, g.x, g.y, 120); gr.addColorStop(0, 'rgba(25,12,35,0.9)'); gr.addColorStop(1, 'rgba(25,12,35,0)'); circ(ctx, g.x, g.y, 120, gr);
      const c = level.castle; ctx.fillStyle = '#8d857a'; ctx.fillRect(c.x - 190, c.y - 152, 380, 296);
      ctx.strokeStyle = 'rgba(60,56,50,0.25)'; ctx.lineWidth = 1; for (let y = c.y - 152; y < c.y + 144; y += 16) { ctx.beginPath(); ctx.moveTo(c.x - 190, y); ctx.lineTo(c.x + 190, y); ctx.stroke(); } for (let x = c.x - 190; x < c.x + 190; x += 20) { ctx.beginPath(); ctx.moveTo(x, c.y - 152); ctx.lineTo(x, c.y + 144); ctx.stroke(); }
    })();
    return { canvas: cv, river };
  };
})(window.TD);
