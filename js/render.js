// ---------------------------------------------------------------------------
// Ravenhold — renderer. Everything is drawn procedurally on a 2D canvas.
// The static map is pre-rendered once; towers, enemies and effects are drawn
// every frame in world units under the camera transform.
// ---------------------------------------------------------------------------
window.TD = window.TD || {};
(function (TD) {
  'use strict';
  const R = {};
  const TAU = Math.PI * 2;

  // ---------- deterministic randomness ------------------------------------
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
      const u = fade(x), v = fade(y);
      const a = perm[X] + Y, b = perm[X + 1] + Y;
      const l = (t, p, q) => p + t * (q - p);
      return l(v, l(u, grad(perm[a], x, y), grad(perm[b], x - 1, y)), l(u, grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1)));
    };
    return { n2, fbm: (x, y, oct) => { let s = 0, a = 1, f = 1, m = 0; for (let i = 0; i < (oct || 4); i++) { s += a * n2(x * f, y * f); m += a; a *= 0.5; f *= 2; } return s / m; } };
  }
  R.mulberry32 = mulberry32;

  // ---------- small helpers -------------------------------------------------
  function ell(ctx, x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
  function circ(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function lerpC(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgb(c, a) { return a == null ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
  function polyline(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }
  R.ell = ell; R.circ = circ; R.rr = rr; R.rgb = rgb;

  // =========================================================================
  // STATIC MAP
  // =========================================================================
  R.buildBackground = function (level, path, scale) {
    const W = TD.WORLD.w, H = TD.WORLD.h;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    const rnd = mulberry32(1337);
    const noise = makeNoise(42);
    const river = TD.smoothCurve(level.river, 8);
    R.riverPts = river;
    const roadPts = path.pts;
    const plots = level.plots;
    const castle = level.castle;

    // --- grass base via low-res noise image ---
    (function grass() {
      const gw = 240, gh = 400; const img = ctx.createImageData(gw, gh); const d = img.data;
      const g1 = [96, 132, 58], g2 = [62, 96, 44], g3 = [128, 140, 66], g4 = [78, 112, 52];
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        const wx = x / gw * W, wy = y / gh * H;
        const n = noise.fbm(wx / 260, wy / 260, 4) * 0.5 + 0.5;
        const m = noise.fbm(wx / 90 + 7, wy / 90 + 3, 3) * 0.5 + 0.5;
        let c = lerpC(g2, g1, n); c = lerpC(c, g3, Math.max(0, m - 0.55) * 1.2); c = lerpC(c, g4, Math.max(0, 0.42 - m) * 1.4);
        // darker, colder toward the north (top)
        const north = Math.max(0, 1 - wy / 500) * 0.25; c = lerpC(c, [40, 58, 52], north);
        const i = (y * gw + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
      const tmp = document.createElement('canvas'); tmp.width = gw; tmp.height = gh; tmp.getContext('2d').putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(tmp, 0, 0, W, H);
      // grass tufts
      for (let i = 0; i < 9000; i++) {
        const x = rnd() * W, y = rnd() * H; const l = 2 + rnd() * 4; const a = rnd() < 0.5 ? 'rgba(160,190,90,0.22)' : 'rgba(30,50,25,0.22)';
        ctx.strokeStyle = a; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 2, y - l); ctx.stroke();
      }
    })();

    // occupancy test for decoration placement
    const near = (x, y, pts, d) => TD.distToPolyline(x, y, pts) < d;
    const blocked = (x, y, pad) => {
      if (near(x, y, roadPts, level.roadWidth / 2 + 16 + pad)) return true;
      if (near(x, y, river, level.riverWidth / 2 + 14 + pad)) return true;
      for (const p of plots) if (Math.hypot(x - p[0], y - p[1]) < 52 + pad) return true;
      if (x > castle.x - 190 - pad && x < castle.x + 190 + pad && y > castle.y - 130 - pad && y < castle.y + 110 + pad) return true;
      if (Math.hypot(x - level.gate.x, y - level.gate.y) < 120 + pad) return true;
      return false;
    };

    // --- cliffs & mountains (north rim and north-west corner) ---
    (function cliffs() {
      // northern mountain wall along the top edge: far ridge, near ridge, snow, fog
      const ridge = (baseY, minH, maxH, lit, dark, snow, seed) => {
        const r2 = mulberry32(seed); const peaks = []; let x = -80;
        while (x < W + 80) { const w = 55 + r2() * 45; const h = minH + r2() * (maxH - minH); peaks.push({ x, w, h }); x += w * (0.9 + r2() * 0.5); }
        for (const p of peaks) {
          const g = ctx.createLinearGradient(p.x - p.w, 0, p.x + p.w, 0); g.addColorStop(0, lit); g.addColorStop(0.5, dark); g.addColorStop(1, dark);
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(p.x - p.w, baseY); ctx.lineTo(p.x - p.w * 0.45, baseY - p.h * 0.55); ctx.lineTo(p.x, baseY - p.h); ctx.lineTo(p.x + p.w * 0.35, baseY - p.h * 0.6); ctx.lineTo(p.x + p.w, baseY); ctx.closePath(); ctx.fill();
          if (snow) { ctx.fillStyle = snow; ctx.beginPath(); ctx.moveTo(p.x - p.w * 0.22, baseY - p.h * 0.72); ctx.lineTo(p.x - p.w * 0.1, baseY - p.h * 0.66); ctx.lineTo(p.x, baseY - p.h * 0.74); ctx.lineTo(p.x + p.w * 0.12, baseY - p.h * 0.64); ctx.lineTo(p.x + p.w * 0.2, baseY - p.h * 0.7); ctx.lineTo(p.x, baseY - p.h); ctx.closePath(); ctx.fill(); }
        }
      };
      ctx.fillStyle = '#2b3140'; ctx.fillRect(-10, -10, W + 20, 90);
      ridge(100, 70, 120, '#6c7488', '#3b4152', 'rgba(225,232,240,0.9)', 7);
      ridge(105, 45, 85, '#5a5f6a', '#2c2f38', 'rgba(220,226,232,0.85)', 11);
      const fog = ctx.createLinearGradient(0, 60, 0, 130); fog.addColorStop(0, 'rgba(40,52,58,0.55)'); fog.addColorStop(1, 'rgba(40,52,58,0)');
      ctx.fillStyle = fog; ctx.fillRect(-10, 60, W + 20, 70);
      const drawRidge = (pts, fillTop, fillFace) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fillStyle = fillFace; ctx.fill(); ctx.strokeStyle = 'rgba(20,20,26,0.5)'; ctx.lineWidth = 2; ctx.stroke(); };
      // rocky rim around the Blackgate
      const g = level.gate;
      const rim = [[-40, 40], [40, 70], [90, 95], [120, 130], [110, 175], [90, 210], [50, 235], [-40, 250]];
      ctx.save(); ctx.globalAlpha = 0.95; drawRidge(rim, '#4a4e57', '#33363d'); ctx.restore();
      // rock facets
      for (let i = 0; i < 18; i++) {
        const cx = g.x + (rnd() - 0.3) * 120, cy = g.y + (rnd() - 0.5) * 180; if (Math.hypot(cx - g.x, cy - g.y) < 60) continue;
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(90,95,104,0.5)' : 'rgba(30,32,38,0.45)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 10 + rnd() * 12, cy + 4); ctx.lineTo(cx + 4, cy + 12 + rnd() * 8); ctx.closePath(); ctx.fill();
      }
    })();

    // --- river ---
    (function drawRiver() {
      const w = level.riverWidth;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      polyline(ctx, river); ctx.strokeStyle = 'rgba(60,52,34,0.55)'; ctx.lineWidth = w + 22; ctx.stroke();      // wet bank
      polyline(ctx, river); ctx.strokeStyle = '#5b4a30'; ctx.lineWidth = w + 10; ctx.stroke();                  // mud
      polyline(ctx, river); ctx.strokeStyle = '#1f4a5c'; ctx.lineWidth = w; ctx.stroke();                        // deep water
      polyline(ctx, river); ctx.strokeStyle = '#2c6b80'; ctx.lineWidth = w * 0.72; ctx.stroke();
      polyline(ctx, river); ctx.strokeStyle = 'rgba(120,190,205,0.35)'; ctx.lineWidth = w * 0.32; ctx.stroke();
      // pebbles & reeds on the banks
      for (let i = 0; i < river.length; i += 2) {
        const p = river[i], q = river[Math.min(i + 1, river.length - 1)];
        const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        for (const s of [-1, 1]) {
          if (rnd() < 0.6) { const o = w / 2 + 4 + rnd() * 8; circ(ctx, p[0] + nx * o * s, p[1] + ny * o * s, 1.5 + rnd() * 2.5, rnd() < 0.5 ? '#8d8677' : '#6a6357'); }
          if (rnd() < 0.35) { const o = w / 2 + 6 + rnd() * 6; const rx = p[0] + nx * o * s, ry = p[1] + ny * o * s; ctx.strokeStyle = '#4c6b2c'; ctx.lineWidth = 1.5; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + (rnd() - 0.5) * 8, ry - 8 - rnd() * 8); ctx.stroke(); } }
        }
      }
    })();

    // --- road ---
    (function road() {
      const w = level.roadWidth;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      polyline(ctx, roadPts); ctx.strokeStyle = 'rgba(40,32,18,0.45)'; ctx.lineWidth = w + 14; ctx.stroke();
      polyline(ctx, roadPts); ctx.strokeStyle = '#7a6142'; ctx.lineWidth = w + 4; ctx.stroke();
      polyline(ctx, roadPts); ctx.strokeStyle = '#9c8258'; ctx.lineWidth = w; ctx.stroke();
      // mottling
      for (let i = 0; i < roadPts.length; i += 1) {
        const p = roadPts[i]; const q = roadPts[Math.min(i + 1, roadPts.length - 1)];
        const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        for (let k = 0; k < 2; k++) {
          const o = (rnd() - 0.5) * w * 0.8; const x = p[0] + nx * o, y = p[1] + ny * o;
          const c = rnd() < 0.5 ? 'rgba(120,100,70,0.35)' : 'rgba(90,70,45,0.3)';
          ell(ctx, x, y, 3 + rnd() * 6, 2 + rnd() * 3, c);
        }
        // ruts
        if (i % 2 === 0) for (const s of [-1, 1]) { const o = 13 * s; circ(ctx, p[0] + nx * o, p[1] + ny * o, 1.6, 'rgba(70,52,30,0.35)'); }
        // edge stones
        if (rnd() < 0.22) { const s = rnd() < 0.5 ? -1 : 1; const o = w / 2 + 2 + rnd() * 5; circ(ctx, p[0] + nx * o * s, p[1] + ny * o * s, 1 + rnd() * 1.6, rnd() < 0.5 ? 'rgba(150,145,135,0.8)' : 'rgba(100,96,90,0.8)'); }
      }
    })();

    // --- bridge (deck along the road, river passes underneath) ---
    (function bridge() {
      const b = level.bridge; const x = b.x - b.w / 2, y = b.y - b.h / 2;
      ctx.save();
      // arches / shadow on the water (north & south of the deck)
      ctx.fillStyle = 'rgba(8,24,34,0.55)';
      ctx.beginPath(); ctx.ellipse(b.x, y + b.h + 6, 30, 9, 0, 0, Math.PI); ctx.fill();
      ctx.beginPath(); ctx.ellipse(b.x, y - 2, 30, 7, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; rr(ctx, x + 3, y + 6, b.w, b.h, 6); ctx.fill();
      const g = ctx.createLinearGradient(0, y, 0, y + b.h); g.addColorStop(0, '#a49c8e'); g.addColorStop(1, '#847b6d');
      ctx.fillStyle = g; rr(ctx, x, y, b.w, b.h, 6); ctx.fill();
      // flagstones
      ctx.strokeStyle = 'rgba(40,36,30,0.35)'; ctx.lineWidth = 1;
      for (let yy = y + 12; yy < y + b.h - 6; yy += 12) { ctx.beginPath(); ctx.moveTo(x + 3, yy); ctx.lineTo(x + b.w - 3, yy); ctx.stroke(); const off = ((yy / 12) | 0) % 2 ? 9 : 0; for (let xx = x + 9 + off; xx < x + b.w - 3; xx += 18) { ctx.beginPath(); ctx.moveTo(xx, yy - 12); ctx.lineTo(xx, yy); ctx.stroke(); } }
      // low parapets along both road-sides
      for (const py of [y - 3, y + b.h - 6]) { ctx.fillStyle = '#6b6357'; rr(ctx, x - 4, py, b.w + 8, 9, 3); ctx.fill(); ctx.fillStyle = '#9b9385'; rr(ctx, x - 4, py, b.w + 8, 4, 2); ctx.fill(); }
      ctx.fillStyle = '#5a5248'; for (const px of [x - 6, x + b.w - 2]) for (const py of [y - 6, y + b.h - 8]) { rr(ctx, px, py, 8, 12, 2); ctx.fill(); }
      ctx.restore();
    })();

    // --- build plots ---
    (function pads() {
      for (const p of plots) {
        const [x, y] = p;
        ell(ctx, x + 3, y + 5, 36, 30, 'rgba(0,0,0,0.28)');
        const g = ctx.createRadialGradient(x - 8, y - 10, 4, x, y, 38); g.addColorStop(0, '#9a948a'); g.addColorStop(1, '#5f5a52');
        ell(ctx, x, y, 36, 30, g);
        ctx.strokeStyle = 'rgba(30,28,24,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, 36, 30, 0, 0, TAU); ctx.stroke();
        // flagstone cracks
        ctx.strokeStyle = 'rgba(40,36,30,0.5)'; ctx.lineWidth = 1.2;
        for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + rnd() * 0.6; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 10, y + Math.sin(a) * 8); ctx.lineTo(x + Math.cos(a) * 34, y + Math.sin(a) * 28); ctx.stroke(); }
        ctx.beginPath(); ctx.ellipse(x, y, 14, 11, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(226,182,87,0.28)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y, 26, 21, 0, 0, TAU); ctx.stroke();
      }
    })();

    // --- vegetation & rocks ---
    (function forest() {
      const trees = [];
      const tryPlace = (x, y, r) => { if (x < 10 || y < 60 || x > W - 10 || y > H - 10) return false; if (blocked(x, y, 10)) return false; for (const t of trees) if (Math.hypot(t.x - x, t.y - y) < (t.r + r) * 0.75) return false; return true; };
      // dense forest patches
      const patches = [[120, 1450, 150], [880, 1500, 130], [900, 150, 120], [470, 1000, 70], [60, 1120, 90], [880, 480, 110], [650, 630, 70], [440, 880, 45], [130, 760, 60], [370, 470, 0]];
      for (const [px, py, pr] of patches) for (let i = 0; i < 40; i++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * pr; const x = px + Math.cos(a) * d, y = py + Math.sin(a) * d; const r = 14 + rnd() * 12; if (tryPlace(x, y, r)) trees.push({ x, y, r, kind: rnd() < (py < 500 ? 0.75 : 0.35) ? 'pine' : 'oak' }); }
      // scattered
      for (let i = 0; i < 260; i++) { const x = rnd() * W, y = rnd() * H; const r = 12 + rnd() * 12; if (tryPlace(x, y, r) && rnd() < 0.55) trees.push({ x, y, r, kind: rnd() < (y < 500 ? 0.7 : 0.3) ? 'pine' : 'oak' }); }
      // bushes & flowers
      for (let i = 0; i < 160; i++) { const x = rnd() * W, y = rnd() * H; if (blocked(x, y, -6)) continue; if (rnd() < 0.5) { const r = 5 + rnd() * 5; ell(ctx, x + 1, y + 2, r, r * 0.7, 'rgba(0,0,0,0.2)'); const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r); g.addColorStop(0, '#7fa848'); g.addColorStop(1, '#3e6a2c'); ell(ctx, x, y, r, r * 0.8, g); } else { for (let k = 0; k < 4; k++) circ(ctx, x + (rnd() - 0.5) * 12, y + (rnd() - 0.5) * 8, 1.4, rnd() < 0.5 ? '#e9d66b' : '#e8e2f0'); } }
      // rocks
      for (let i = 0; i < 40; i++) { const x = rnd() * W, y = 90 + rnd() * (H - 100); if (blocked(x, y, 2)) continue; drawRock(ctx, x, y, 5 + rnd() * 9, rnd); }
      trees.sort((a, b) => a.y - b.y);
      for (const t of trees) (t.kind === 'pine' ? drawPine : drawOak)(ctx, t.x, t.y, t.r, rnd);
    })();

    drawBlackgate(ctx, level.gate.x, level.gate.y, rnd);
    drawCastle(ctx, castle.x, castle.y, rnd);
    return cv;
  };

  function drawRock(ctx, x, y, r, rnd) {
    ell(ctx, x + r * 0.3, y + r * 0.5, r * 1.1, r * 0.6, 'rgba(0,0,0,0.25)');
    const n = 6 + (rnd() * 3 | 0); const pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU; const rr_ = r * (0.75 + rnd() * 0.4); pts.push([x + Math.cos(a) * rr_, y + Math.sin(a) * rr_ * 0.75]); }
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r); g.addColorStop(0, '#9b978f'); g.addColorStop(1, '#4e4b46');
    polyline(ctx, pts); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(20,20,20,0.4)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function drawPine(ctx, x, y, r, rnd) {
    const h = r * 2.4;
    ell(ctx, x + r * 0.45, y + r * 0.35, r * 0.95, r * 0.5, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = '#4a3320'; ctx.fillRect(x - 2, y - 4, 4, 8);
    const layers = 3; const dark = '#1f4a2a', light = '#3f7d3a';
    for (let i = 0; i < layers; i++) {
      const t = i / layers; const ly = y - h * t * 0.55; const lw = r * (1 - t * 0.55); const lh = h * 0.5 * (1 - t * 0.25);
      const g = ctx.createLinearGradient(x - lw, 0, x + lw, 0); g.addColorStop(0, dark); g.addColorStop(0.55, light); g.addColorStop(1, '#5a9a48');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, ly - lh); ctx.lineTo(x + lw, ly + 2); ctx.lineTo(x + lw * 0.4, ly + 4); ctx.lineTo(x, ly + 1); ctx.lineTo(x - lw * 0.4, ly + 4); ctx.lineTo(x - lw, ly + 2); ctx.closePath(); ctx.fill();
    }
  }
  function drawOak(ctx, x, y, r, rnd) {
    ell(ctx, x + r * 0.5, y + r * 0.4, r * 1.1, r * 0.55, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = '#4a3320'; ctx.fillRect(x - 2.5, y - 6, 5, 10);
    const blobs = 5;
    for (let i = 0; i < blobs; i++) {
      const a = rnd() * TAU, d = rnd() * r * 0.45; const bx = x + Math.cos(a) * d, by = y - r * 0.7 + Math.sin(a) * d * 0.7; const br = r * (0.55 + rnd() * 0.3);
      const g = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br); g.addColorStop(0, '#78b04a'); g.addColorStop(0.6, '#3f7d34'); g.addColorStop(1, '#1e4a26');
      circ(ctx, bx, by, br, g);
    }
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 1.05, 2, x, y - r * 0.75, r * 0.7); g.addColorStop(0, 'rgba(160,210,110,0.5)'); g.addColorStop(1, 'rgba(160,210,110,0)');
    circ(ctx, x, y - r * 0.75, r * 0.7, g);
  }

  function stoneWall(ctx, x, y, w, h, base, top) {
    // front face with courses of stone
    const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, top || '#8e8779'); g.addColorStop(1, base || '#5d574d');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(30,28,24,0.35)'; ctx.lineWidth = 1;
    for (let yy = y + 8; yy < y + h; yy += 9) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); const off = ((yy / 9) | 0) % 2 ? 8 : 0; for (let xx = x + 8 + off; xx < x + w; xx += 16) { ctx.beginPath(); ctx.moveTo(xx, yy - 9); ctx.lineTo(xx, yy); ctx.stroke(); } }
  }
  function merlons(ctx, x, y, w, color) { ctx.fillStyle = color; for (let xx = x; xx < x + w - 4; xx += 14) ctx.fillRect(xx, y - 8, 8, 9); }
  function roundTower(ctx, x, y, r, h, roof) {
    ell(ctx, x + 6, y + 6, r * 1.2, r * 0.6, 'rgba(0,0,0,0.3)');
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0); g.addColorStop(0, '#5b554b'); g.addColorStop(0.5, '#948d7e'); g.addColorStop(1, '#6a635a');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - h, r * 2, h);
    ell(ctx, x, y, r, r * 0.45, '#6a635a');
    ctx.strokeStyle = 'rgba(30,28,24,0.3)'; ctx.lineWidth = 1; for (let yy = y - h + 8; yy < y; yy += 9) { ctx.beginPath(); ctx.moveTo(x - r, yy); ctx.lineTo(x + r, yy); ctx.stroke(); }
    // roof
    const ry = y - h; ell(ctx, x, ry, r + 3, (r + 3) * 0.45, '#3b3530');
    const rg = ctx.createLinearGradient(x - r, 0, x + r, 0); rg.addColorStop(0, '#5a1f1c'); rg.addColorStop(0.5, '#9a3a30'); rg.addColorStop(1, '#4a1a16');
    ctx.fillStyle = roof || rg; ctx.beginPath(); ctx.moveTo(x - r - 3, ry); ctx.lineTo(x, ry - r * 2.2); ctx.lineTo(x + r + 3, ry); ctx.closePath(); ctx.fill();
    // window
    ctx.fillStyle = '#1d1a18'; rr(ctx, x - 3, y - h * 0.55, 6, 10, 3); ctx.fill();
  }
  function drawCastle(ctx, cx, cy, rnd) {
    const wallW = 250, wallH = 70; const wx = cx - wallW / 2, wy = cy - 30;
    // courtyard shadow / footprint
    ell(ctx, cx, cy + 40, 200, 70, 'rgba(0,0,0,0.25)');
    // stone ground inside
    const fg = ctx.createRadialGradient(cx, cy, 20, cx, cy, 200); fg.addColorStop(0, '#8a8478'); fg.addColorStop(1, '#5b564e');
    ctx.fillStyle = fg; rr(ctx, wx - 20, wy - 80, wallW + 40, 180, 14); ctx.fill();
    // keep (back)
    const kw = 120, kh = 110; stoneWall(ctx, cx - kw / 2, wy - 70 - kh + 30, kw, kh, '#5a544a', '#9a9384'); merlons(ctx, cx - kw / 2, wy - 70 - kh + 30, kw, '#a39c8c');
    // north gate in the keep (the road ends here)
    const kt = wy - 70 - kh + 30;
    ctx.fillStyle = '#3a3530'; ctx.beginPath(); ctx.moveTo(cx - 20, kt + 26); ctx.lineTo(cx - 20, kt + 10); ctx.arc(cx, kt + 10, 20, Math.PI, 0); ctx.lineTo(cx + 20, kt + 26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0e0c0a'; ctx.beginPath(); ctx.moveTo(cx - 14, kt + 26); ctx.lineTo(cx - 14, kt + 12); ctx.arc(cx, kt + 12, 14, Math.PI, 0); ctx.lineTo(cx + 14, kt + 26); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#4a4238'; ctx.lineWidth = 2; for (let k = -8; k <= 8; k += 8) { ctx.beginPath(); ctx.moveTo(cx + k, kt + 4); ctx.lineTo(cx + k, kt + 26); ctx.stroke(); }
    // keep banner
    ctx.fillStyle = '#1a1a22'; ctx.fillRect(cx - 14 - 34, wy - 70 - kh + 44, 28, 44); ctx.fillRect(cx - 14 + 34, wy - 70 - kh + 44, 28, 44); for (const bx of [cx - 34, cx + 34]) { circ(ctx, bx, wy - 70 - kh + 62, 8, '#e2b657'); ctx.fillStyle = '#1a1a22'; ctx.beginPath(); ctx.moveTo(bx - 14, wy - 70 - kh + 88); ctx.lineTo(bx, wy - 70 - kh + 80); ctx.lineTo(bx + 14, wy - 70 - kh + 88); ctx.closePath(); ctx.fill(); }
    // back towers
    roundTower(ctx, wx + 10, wy - 20, 18, 90); roundTower(ctx, wx + wallW - 10, wy - 20, 18, 90);
    // front wall with gate
    stoneWall(ctx, wx, wy, wallW, wallH); merlons(ctx, wx, wy, wallW, '#a39c8c');
    // gate
    const gx = cx, gy = wy; ctx.fillStyle = '#2a2622'; ctx.beginPath(); ctx.moveTo(gx - 24, gy + wallH); ctx.lineTo(gx - 24, gy + 26); ctx.arc(gx, gy + 26, 24, Math.PI, 0); ctx.lineTo(gx + 24, gy + wallH); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#100e0c'; ctx.beginPath(); ctx.moveTo(gx - 18, gy + wallH); ctx.lineTo(gx - 18, gy + 28); ctx.arc(gx, gy + 28, 18, Math.PI, 0); ctx.lineTo(gx + 18, gy + wallH); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#4a4238'; ctx.lineWidth = 2; for (let k = -12; k <= 12; k += 6) { ctx.beginPath(); ctx.moveTo(gx + k, gy + 30); ctx.lineTo(gx + k, gy + wallH); ctx.stroke(); }
    // gate arch top-view (road enters from the north through the wall)
    ctx.fillStyle = '#6a5a3a'; ctx.fillRect(gx - 20, gy - 4, 40, 6);
    // front towers
    roundTower(ctx, wx + 2, wy + wallH + 8, 22, 100); roundTower(ctx, wx + wallW - 2, wy + wallH + 8, 22, 100);
    // flags on front towers
    for (const fx of [wx + 2, wx + wallW - 2]) { const fy = wy + wallH + 8 - 100 - 50; ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, fy + 10); ctx.lineTo(fx, fy - 22); ctx.stroke(); ctx.fillStyle = '#8f2a24'; ctx.beginPath(); ctx.moveTo(fx, fy - 22); ctx.lineTo(fx + 18, fy - 16); ctx.lineTo(fx, fy - 8); ctx.closePath(); ctx.fill(); }
    R.castleTorches = [[gx - 30, gy + 14], [gx + 30, gy + 14], [cx - 26, kt + 6], [cx + 26, kt + 6]];
  }
  function drawBlackgate(ctx, gx, gy, rnd) {
    // dark ground
    const g = ctx.createRadialGradient(gx, gy, 5, gx, gy, 110); g.addColorStop(0, 'rgba(20,10,30,0.85)'); g.addColorStop(1, 'rgba(20,10,30,0)');
    circ(ctx, gx, gy, 110, g);
    // pillars
    for (const s of [-1, 1]) {
      const px = gx + 10, py = gy + s * 46;
      ell(ctx, px + 4, py + 6, 16, 8, 'rgba(0,0,0,0.4)');
      const pg = ctx.createLinearGradient(px - 12, 0, px + 12, 0); pg.addColorStop(0, '#26242b'); pg.addColorStop(0.5, '#4a4752'); pg.addColorStop(1, '#1e1c22');
      ctx.fillStyle = pg; rr(ctx, px - 12, py - 60, 24, 66, 4); ctx.fill();
      ctx.fillStyle = '#5a5762'; rr(ctx, px - 14, py - 64, 28, 10, 3); ctx.fill();
    }
    // lintel (broken)
    ctx.fillStyle = '#3a3742'; ctx.beginPath(); ctx.moveTo(gx - 6, gy - 108); ctx.lineTo(gx + 26, gy - 112); ctx.lineTo(gx + 30, gy - 96); ctx.lineTo(gx + 8, gy - 92); ctx.lineTo(gx - 4, gy - 98); ctx.closePath(); ctx.fill();
    // void
    const vg = ctx.createRadialGradient(gx - 4, gy, 2, gx - 4, gy, 46); vg.addColorStop(0, '#2a0f3a'); vg.addColorStop(0.6, '#150a20'); vg.addColorStop(1, 'rgba(10,6,14,0)');
    ell(ctx, gx - 4, gy, 30, 46, vg);
    // skull stakes
    for (const [sx, sy] of [[gx + 60, gy - 70], [gx + 64, gy + 76]]) { ctx.strokeStyle = '#3a3025'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, sy + 10); ctx.lineTo(sx, sy - 18); ctx.stroke(); circ(ctx, sx, sy - 21, 5, '#d9d2bf'); ctx.fillStyle = '#1a1512'; ctx.fillRect(sx - 3, sy - 23, 2, 2); ctx.fillRect(sx + 1, sy - 23, 2, 2); }
    R.gateBraziers = [[gx + 60, gy - 92], [gx + 64, gy + 54]];
  }

  // =========================================================================
  // TOWERS
  // =========================================================================
  // t: {type, level(0..2), angle, fireT (seconds since last shot), x, y}
  R.drawTower = function (ctx, t, time) {
    const x = t.x, y = t.y, lv = t.level;
    ctx.save();
    ell(ctx, x + 7, y + 8, 30, 15, 'rgba(0,0,0,0.32)');
    switch (t.type) {
      case 'archer': drawArcherTower(ctx, x, y, lv, t, time); break;
      case 'ballista': drawBallista(ctx, x, y, lv, t, time); break;
      case 'mage': drawMageTower(ctx, x, y, lv, t, time); break;
      case 'catapult': drawCatapult(ctx, x, y, lv, t, time); break;
    }
    ctx.restore();
  };

  function stoneCylinder(ctx, x, y, r, h, top, tint) {
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0); g.addColorStop(0, tint ? tint[0] : '#5b554b'); g.addColorStop(0.45, tint ? tint[1] : '#9a9384'); g.addColorStop(1, tint ? tint[2] : '#635d54');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - h, r * 2, h);
    ell(ctx, x, y, r, r * 0.42, tint ? tint[0] : '#5b554b');
    ctx.strokeStyle = 'rgba(30,28,24,0.28)'; ctx.lineWidth = 1;
    for (let yy = y - h + 7; yy < y - 2; yy += 8) { ctx.beginPath(); ctx.moveTo(x - r, yy); ctx.lineTo(x + r, yy); ctx.stroke(); const off = ((yy / 8) | 0) % 2 ? 6 : 0; for (let xx = x - r + 6 + off; xx < x + r; xx += 12) { ctx.beginPath(); ctx.moveTo(xx, yy - 8); ctx.lineTo(xx, yy); ctx.stroke(); } }
    if (top) ell(ctx, x, y - h, r, r * 0.42, top);
  }
  function pennant(ctx, x, y, color, time) {
    ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 22); ctx.stroke();
    const w = Math.sin(time * 6 + x) * 2;
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.quadraticCurveTo(x + 8, y - 20 + w, x + 15, y - 17 + w); ctx.lineTo(x, y - 10); ctx.closePath(); ctx.fill();
  }
  function drawArcherTower(ctx, x, y, lv, t, time) {
    const h = 44 + lv * 8, r = 19;
    stoneCylinder(ctx, x, y, r, h, '#7c7466');
    const ty = y - h;
    // wooden platform & railing
    ell(ctx, x, ty, r + 5, (r + 5) * 0.42, '#6b4a2a'); ell(ctx, x, ty - 2, r + 3, (r + 3) * 0.42, '#8a6538');
    ctx.strokeStyle = '#4a3320'; ctx.lineWidth = 2;
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; const px = x + Math.cos(a) * (r + 2), py = ty - 2 + Math.sin(a) * (r + 2) * 0.42; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 8); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(x, ty - 10, r + 2, (r + 2) * 0.42, 0, 0, TAU); ctx.stroke();
    if (lv >= 1) pennant(ctx, x + r - 2, ty - 8, lv >= 2 ? '#e2b657' : '#8f2a24', time);
    // archer
    const a = t.angle || 0; const ax = x, ay = ty - 14;
    ctx.save(); ctx.translate(ax, ay);
    const flip = Math.cos(a) < 0; ctx.scale(flip ? -1 : 1, 1);
    const la = flip ? Math.PI - a : a; // local aim angle
    ell(ctx, 0, 2, 6, 8, '#3d5a2c'); // body (green tunic)
    circ(ctx, 0, -8, 4.5, '#d9b08c'); ctx.fillStyle = '#5a3a1e'; ctx.beginPath(); ctx.arc(0, -9, 4.6, Math.PI, 0); ctx.fill(); // head + hood
    // bow
    ctx.save(); ctx.rotate(la); ctx.strokeStyle = '#c9a15c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(8, 0, 9, -1.3, 1.3); ctx.stroke();
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 0.8; const pull = Math.max(0, 1 - (t.fireT || 9) * 4); ctx.beginPath(); ctx.moveTo(8 + Math.cos(-1.3) * 9, Math.sin(-1.3) * 9); ctx.lineTo(4 - pull * 5, 0); ctx.lineTo(8 + Math.cos(1.3) * 9, Math.sin(1.3) * 9); ctx.stroke();
    ctx.strokeStyle = '#d9b08c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, 0); ctx.stroke();
    ctx.restore(); ctx.restore();
  }
  function drawBallista(ctx, x, y, lv, t, time) {
    const w = 46, h = 26 + lv * 4;
    // square stone base (front face + top)
    const g = ctx.createLinearGradient(0, y - h, 0, y + 10); g.addColorStop(0, '#8b8476'); g.addColorStop(1, '#4f4a42');
    ctx.fillStyle = g; rr(ctx, x - w / 2, y - h, w, h + 10, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(30,28,24,0.3)'; ctx.lineWidth = 1; for (let yy = y - h + 8; yy < y + 8; yy += 8) { ctx.beginPath(); ctx.moveTo(x - w / 2, yy); ctx.lineTo(x + w / 2, yy); ctx.stroke(); }
    ctx.fillStyle = '#a49c8d'; rr(ctx, x - w / 2 - 2, y - h - 6, w + 4, 10, 3); ctx.fill();
    merlons(ctx, x - w / 2 - 2, y - h - 6, w + 4, '#b3ab9b');
    if (lv >= 2) { ctx.fillStyle = '#3a3a40'; for (const s of [-1, 1]) rr(ctx, x + s * (w / 2 - 6) - 3, y - h - 14, 6, 10, 2), ctx.fill(); }
    // ballista on top
    ctx.save(); ctx.translate(x, y - h - 8); ctx.scale(1, 0.75); ctx.rotate(t.angle || 0);
    const recoil = Math.max(0, 1 - (t.fireT || 9) * 3) * 4;
    ctx.fillStyle = '#5a3d22'; rr(ctx, -6 - recoil, -4, 34, 8, 2); ctx.fill(); // rail
    ctx.strokeStyle = '#6e4a28'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(4, -22); ctx.quadraticCurveTo(14, -6, 8, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(4, 22); ctx.quadraticCurveTo(14, 6, 8, 0); ctx.stroke(); // arms
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(4, -22); ctx.lineTo(-2 - recoil, 0); ctx.lineTo(4, 22); ctx.stroke(); // string
    if (lv >= 1) { ctx.fillStyle = '#2f2f36'; ctx.fillRect(-2, -6, 6, 12); }
    ctx.fillStyle = '#c9b48a'; rr(ctx, -2 - recoil, -1.5, 30, 3, 1); ctx.fill(); // bolt
    ctx.fillStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(28 - recoil, -3); ctx.lineTo(34 - recoil, 0); ctx.lineTo(28 - recoil, 3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawMageTower(ctx, x, y, lv, t, time) {
    const h = 60 + lv * 10, r = 15;
    stoneCylinder(ctx, x, y, r, h, null, ['#4d5568', '#9aa4bb', '#5c657a']);
    const ty = y - h;
    // roof
    ell(ctx, x, ty, r + 4, (r + 4) * 0.42, '#2a2f45');
    const rg = ctx.createLinearGradient(x - r, 0, x + r, 0); rg.addColorStop(0, '#25305c'); rg.addColorStop(0.5, '#4a5ba8'); rg.addColorStop(1, '#1f2650');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(x - r - 4, ty); ctx.lineTo(x, ty - 34); ctx.lineTo(x + r + 4, ty); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e2b657'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - r - 4, ty); ctx.lineTo(x + r + 4, ty); ctx.stroke();
    // windows glow
    ctx.fillStyle = '#7fd0ff'; rr(ctx, x - 3, y - h * 0.5, 6, 10, 3); ctx.fill(); if (lv >= 1) { rr(ctx, x - 3, y - h * 0.8, 6, 10, 3); ctx.fill(); }
    // crystal
    const colors = [['#8fd8ff', '#2a7fd0'], ['#c99cff', '#6a2fd0'], ['#ffffff', '#c0a0ff']][lv];
    const cy = ty - 44 + Math.sin(time * 2 + x) * 3, cr = 6 + lv * 1.5;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(x, cy, 1, x, cy, cr * 3.2); gg.addColorStop(0, colors[1] + ''); gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55 + Math.sin(time * 5) * 0.1; circ(ctx, x, cy, cr * 3.2, gg); ctx.globalAlpha = 1;
    ctx.restore();
    ctx.save(); ctx.translate(x, cy); ctx.rotate(time * 1.2);
    const cg = ctx.createLinearGradient(-cr, -cr, cr, cr); cg.addColorStop(0, colors[0]); cg.addColorStop(1, colors[1]);
    ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(0, -cr * 1.4); ctx.lineTo(cr, 0); ctx.lineTo(0, cr * 1.4); ctx.lineTo(-cr, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
    for (let k = 0; k < 2 + lv; k++) { const a = time * 2.5 + k / (2 + lv) * TAU; circ(ctx, x + Math.cos(a) * (cr + 8), cy + Math.sin(a) * (cr + 8) * 0.4, 1.5, colors[0]); }
  }
  function drawCatapult(ctx, x, y, lv, t, time) {
    // wooden platform
    ctx.fillStyle = '#4a3320'; rr(ctx, x - 26, y - 22, 52, 34, 4); ctx.fill();
    ctx.fillStyle = '#7a5433'; rr(ctx, x - 24, y - 24, 48, 32, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(40,25,10,0.5)'; ctx.lineWidth = 1; for (let yy = y - 18; yy < y + 8; yy += 6) { ctx.beginPath(); ctx.moveTo(x - 24, yy); ctx.lineTo(x + 24, yy); ctx.stroke(); }
    if (lv >= 1) { ctx.fillStyle = '#3a3a40'; ctx.fillRect(x - 24, y - 24, 48, 3); ctx.fillRect(x - 24, y + 5, 48, 3); }
    // wheels
    for (const s of [-1, 1]) { circ(ctx, x + s * 20, y + 6, 6 + lv, '#2f2218'); circ(ctx, x + s * 20, y + 6, 3, '#8a6538'); }
    // catapult body: rotate toward target
    ctx.save(); ctx.translate(x, y - 10); ctx.scale(1, 0.8); ctx.rotate(t.angle || 0);
    ctx.fillStyle = '#5a3d22'; rr(ctx, -16, -8, 32, 16, 3); ctx.fill();
    ctx.fillStyle = '#3a2816'; rr(ctx, -12, -3, 24, 6, 2); ctx.fill();
    // arm swing: rest angle points backwards (-x), on fire it snaps forward
    const ft = t.fireT == null ? 9 : t.fireT; const swing = ft < 0.25 ? (1 - ft / 0.25) : 0;
    const armLen = 26; ctx.strokeStyle = '#8a6538'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.save(); ctx.scale(1, 1); const ang = Math.PI + (Math.PI * 0.75) * swing; // from pointing back to pointing forward-up
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * armLen, Math.sin(ang) * armLen * 0.5); ctx.stroke();
    if (swing < 0.3) circ(ctx, Math.cos(ang) * armLen, Math.sin(ang) * armLen * 0.5, 5, '#8c8377');
    ctx.restore();
    ctx.restore();
  }

  // =========================================================================
  // ENEMIES
  // =========================================================================
  R.drawEnemy = function (ctx, e, time) {
    const def = e.def; const s = def.size; const x = e.x, y = e.y;
    const walk = e.walkT; const bob = Math.abs(Math.sin(walk * 8)) * s * 0.12;
    ctx.save();
    ell(ctx, x + s * 0.2, y + s * 0.15, s * 0.95, s * 0.42, 'rgba(0,0,0,0.3)');
    ctx.translate(x, y - bob);
    if (e.dx < 0) ctx.scale(-1, 1);
    const legSwing = Math.sin(walk * 8);
    switch (e.type) {
      case 'wolf': drawQuadruped(ctx, s, legSwing, { body: ['#6f6a62', '#3d3a36'], head: '#5c5751', eye: '#ff3a2a', tail: true }); break;
      case 'rider': drawRider(ctx, s, legSwing, time); break;
      case 'goblin': drawHumanoid(ctx, s, legSwing, { skin: ['#9bc25a', '#4f7a2a'], cloth: '#6b4a2a', ears: true, weapon: 'dagger', eye: '#ffe36b' }); break;
      case 'orc': drawHumanoid(ctx, s, legSwing, { skin: ['#8a9a4a', '#4a5a26'], cloth: '#3a2c22', pauldrons: '#4a4650', weapon: 'axe', tusks: true, eye: '#ffd24a' }); break;
      case 'skeleton': drawHumanoid(ctx, s, legSwing, { skin: ['#efe9d6', '#a8a08a'], cloth: null, ribs: true, weapon: 'sword', shield: '#6b4a2a', eye: '#7fd0ff', skull: true }); break;
      case 'troll': drawHumanoid(ctx, s, legSwing, { skin: ['#8a9aa8', '#3f4b58'], cloth: '#4a3a2a', weapon: 'club', hunch: true, eye: '#ffd24a' }); break;
      case 'chieftain': drawHumanoid(ctx, s, legSwing, { skin: ['#7f96a8', '#354452'], cloth: '#5a2a1e', weapon: 'club', hunch: true, eye: '#ff8a3a', antlers: true, necklace: true }); break;
      case 'ogre': drawHumanoid(ctx, s, legSwing, { skin: ['#b58a5a', '#6a4a2a'], cloth: '#3a2c22', pauldrons: '#5a5660', weapon: 'spiked', tusks: true, eye: '#ff5a3a', crown: true }); break;
      default: drawHumanoid(ctx, s, legSwing, { skin: ['#9bc25a', '#4f7a2a'], cloth: '#6b4a2a' });
    }
    // status overlays
    if (e.slowT > 0) { ctx.globalAlpha = 0.55; ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -s * 0.7, s * 0.9, s * 1.05, 0, 0, TAU); ctx.stroke(); for (let k = 0; k < 4; k++) { const a = time * 3 + k * 1.57; circ(ctx, Math.cos(a) * s * 0.9, -s * 0.7 + Math.sin(a) * s, 1.8, '#e8f7ff'); } ctx.globalAlpha = 1; }
    if (e.hitT > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, e.hitT * 8) * 0.7; ell(ctx, 0, -s * 0.7, s * 0.9, s * 1.05, '#ffffff'); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
    // health bar
    if (e.hp < e.maxHp) {
      const bw = def.boss ? 46 : Math.max(18, Math.min(34, s * 1.7)), bh = def.boss ? 5 : 3.5; const bx = x - bw / 2, by = y - s * 2 - 8 - bob;
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; rr(ctx, bx - 1, by - 1, bw + 2, bh + 2, 2); ctx.fill();
      const f = Math.max(0, e.hp / e.maxHp); ctx.fillStyle = f > 0.5 ? '#6cd35a' : f > 0.25 ? '#e2b657' : '#d9483b'; ctx.fillRect(bx, by, bw * f, bh);
    }
    if (e.burnT > 0) { for (let k = 0; k < 3; k++) { const a = time * 9 + k * 2.1; const fx = x + Math.cos(a) * s * 0.5, fy = y - s * 0.8 - bob + Math.sin(a * 1.3) * s * 0.4; drawFlame(ctx, fx, fy, s * 0.35, time + k); } }
  };

  function drawFlame(ctx, x, y, r, time) {
    const f = 0.8 + Math.sin(time * 17) * 0.2;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2 * f); g.addColorStop(0, 'rgba(255,200,90,0.8)'); g.addColorStop(0.4, 'rgba(255,110,20,0.5)'); g.addColorStop(1, 'rgba(255,60,0,0)');
    circ(ctx, x, y, r * 2 * f, g);
    ctx.fillStyle = 'rgba(255,230,150,0.9)'; ctx.beginPath(); ctx.moveTo(x, y - r * 1.8 * f); ctx.quadraticCurveTo(x + r * 0.8, y - r * 0.4, x, y + r * 0.4); ctx.quadraticCurveTo(x - r * 0.8, y - r * 0.4, x, y - r * 1.8 * f); ctx.fill();
    ctx.restore();
  }
  R.drawFlame = drawFlame;

  function drawHumanoid(ctx, s, leg, o) {
    const skin = ctx.createLinearGradient(-s, 0, s, 0); skin.addColorStop(0, o.skin[1]); skin.addColorStop(0.55, o.skin[0]); skin.addColorStop(1, o.skin[1]);
    const hunch = o.hunch ? s * 0.25 : 0;
    // legs
    ctx.strokeStyle = o.skin[1]; ctx.lineWidth = s * 0.28; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.5); ctx.lineTo(-s * 0.3 + leg * s * 0.35, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.5); ctx.lineTo(s * 0.3 - leg * s * 0.35, 0); ctx.stroke();
    // shield (behind body)
    if (o.shield) { ell(ctx, -s * 0.75, -s * 0.9, s * 0.45, s * 0.55, o.shield); ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(-s * 0.75, -s * 0.9, s * 0.45, s * 0.55, 0, 0, TAU); ctx.stroke(); circ(ctx, -s * 0.75, -s * 0.9, s * 0.12, '#8a8a92'); }
    // body
    ell(ctx, 0, -s * 0.95 + hunch * 0.3, s * 0.72, s * 0.75, skin);
    if (o.cloth) { ctx.fillStyle = o.cloth; ctx.beginPath(); ctx.ellipse(0, -s * 0.5, s * 0.6, s * 0.3, 0, 0, Math.PI); ctx.fill(); }
    if (o.ribs) { ctx.strokeStyle = '#8a8272'; ctx.lineWidth = 1.2; for (let k = 0; k < 3; k++) { const yy = -s * 1.2 + k * s * 0.22; ctx.beginPath(); ctx.moveTo(-s * 0.45, yy); ctx.quadraticCurveTo(0, yy + s * 0.12, s * 0.45, yy); ctx.stroke(); } }
    if (o.pauldrons) { ell(ctx, -s * 0.62, -s * 1.35, s * 0.36, s * 0.24, o.pauldrons); ell(ctx, s * 0.62, -s * 1.35, s * 0.36, s * 0.24, o.pauldrons); ctx.fillStyle = '#cfc7b8'; for (const sx of [-0.62, 0.62]) { ctx.beginPath(); ctx.moveTo(sx * s, -s * 1.5); ctx.lineTo(sx * s + s * 0.08, -s * 1.75); ctx.lineTo(sx * s + s * 0.16, -s * 1.5); ctx.fill(); } }
    if (o.necklace) { for (let k = -2; k <= 2; k++) circ(ctx, k * s * 0.2, -s * 1.25 + Math.abs(k) * s * 0.06, s * 0.08, '#e8e2cf'); }
    // arm + weapon (front)
    ctx.strokeStyle = o.skin[1]; ctx.lineWidth = s * 0.24; ctx.beginPath(); ctx.moveTo(s * 0.4, -s * 1.15); ctx.lineTo(s * 0.85, -s * 0.8 - leg * s * 0.1); ctx.stroke();
    const wx = s * 0.85, wy = -s * 0.8 - leg * s * 0.1;
    if (o.weapon === 'dagger') { ctx.fillStyle = '#cfd3d8'; ctx.beginPath(); ctx.moveTo(wx, wy - s * 0.1); ctx.lineTo(wx + s * 0.55, wy - s * 0.35); ctx.lineTo(wx + s * 0.05, wy + s * 0.05); ctx.fill(); }
    if (o.weapon === 'sword') { ctx.strokeStyle = '#d7dbe0'; ctx.lineWidth = s * 0.14; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + s * 0.25, wy - s * 0.95); ctx.stroke(); ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(wx - s * 0.15, wy + s * 0.05); ctx.lineTo(wx + s * 0.2, wy - s * 0.1); ctx.stroke(); }
    if (o.weapon === 'axe') { ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = s * 0.14; ctx.beginPath(); ctx.moveTo(wx - s * 0.1, wy + s * 0.2); ctx.lineTo(wx + s * 0.35, wy - s * 0.9); ctx.stroke(); ctx.fillStyle = '#b7bcc4'; ctx.beginPath(); ctx.moveTo(wx + s * 0.3, wy - s * 1.0); ctx.quadraticCurveTo(wx + s * 0.9, wy - s * 0.85, wx + s * 0.55, wy - s * 0.35); ctx.lineTo(wx + s * 0.25, wy - s * 0.6); ctx.closePath(); ctx.fill(); }
    if (o.weapon === 'club' || o.weapon === 'spiked') { ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = s * 0.18; ctx.beginPath(); ctx.moveTo(wx - s * 0.1, wy + s * 0.2); ctx.lineTo(wx + s * 0.4, wy - s * 0.9); ctx.stroke(); ell(ctx, wx + s * 0.45, wy - s * 1.0, s * 0.28, s * 0.4, '#6e4a2a'); if (o.weapon === 'spiked') { ctx.fillStyle = '#c9ccd2'; for (let k = 0; k < 5; k++) { const a = -1.2 + k * 0.6; ctx.beginPath(); ctx.moveTo(wx + s * 0.45 + Math.cos(a) * s * 0.2, wy - s * 1.0 + Math.sin(a) * s * 0.3); ctx.lineTo(wx + s * 0.45 + Math.cos(a) * s * 0.5, wy - s * 1.0 + Math.sin(a) * s * 0.65); ctx.lineTo(wx + s * 0.45 + Math.cos(a + 0.3) * s * 0.2, wy - s * 1.0 + Math.sin(a + 0.3) * s * 0.3); ctx.fill(); } } }
    // head
    const hy = -s * 1.65 + hunch;
    circ(ctx, s * 0.05, hy, s * 0.42, o.skull ? '#efe9d6' : o.skin[0]);
    if (o.ears) { ctx.fillStyle = o.skin[0]; ctx.beginPath(); ctx.moveTo(-s * 0.3, hy - s * 0.1); ctx.lineTo(-s * 0.85, hy - s * 0.35); ctx.lineTo(-s * 0.3, hy + s * 0.15); ctx.fill(); }
    if (o.tusks) { ctx.fillStyle = '#f2ecd8'; ctx.beginPath(); ctx.moveTo(s * 0.15, hy + s * 0.2); ctx.lineTo(s * 0.22, hy - s * 0.05); ctx.lineTo(s * 0.3, hy + s * 0.2); ctx.fill(); ctx.beginPath(); ctx.moveTo(s * 0.32, hy + s * 0.2); ctx.lineTo(s * 0.4, hy - s * 0.05); ctx.lineTo(s * 0.46, hy + s * 0.2); ctx.fill(); }
    if (o.antlers) { ctx.strokeStyle = '#d9d2bf'; ctx.lineWidth = s * 0.08; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * s * 0.2, hy - s * 0.35); ctx.lineTo(sx * s * 0.45, hy - s * 0.9); ctx.lineTo(sx * s * 0.3, hy - s * 1.1); ctx.moveTo(sx * s * 0.45, hy - s * 0.9); ctx.lineTo(sx * s * 0.7, hy - s * 1.05); ctx.stroke(); } }
    if (o.crown) { ctx.fillStyle = '#8a8a92'; ctx.beginPath(); ctx.moveTo(-s * 0.3, hy - s * 0.3); ctx.lineTo(-s * 0.3, hy - s * 0.6); ctx.lineTo(-s * 0.15, hy - s * 0.45); ctx.lineTo(0, hy - s * 0.7); ctx.lineTo(s * 0.15, hy - s * 0.45); ctx.lineTo(s * 0.35, hy - s * 0.6); ctx.lineTo(s * 0.35, hy - s * 0.3); ctx.closePath(); ctx.fill(); }
    // eyes
    ctx.fillStyle = o.skull ? '#1a1512' : o.eye || '#ffd24a';
    circ(ctx, s * 0.22, hy - s * 0.05, o.skull ? s * 0.12 : s * 0.07, ctx.fillStyle); circ(ctx, s * 0.02, hy - s * 0.05, o.skull ? s * 0.12 : s * 0.07, ctx.fillStyle);
    if (o.skull) { circ(ctx, s * 0.22, hy - s * 0.05, s * 0.05, o.eye); circ(ctx, s * 0.02, hy - s * 0.05, s * 0.05, o.eye); }
  }
  function drawQuadruped(ctx, s, leg, o) {
    const body = ctx.createLinearGradient(0, -s * 1.3, 0, 0); body.addColorStop(0, o.body[0]); body.addColorStop(1, o.body[1]);
    // legs
    ctx.strokeStyle = o.body[1]; ctx.lineWidth = s * 0.22; ctx.lineCap = 'round';
    for (const [lx, ph] of [[-s * 0.7, 1], [-s * 0.4, -1], [s * 0.4, -1], [s * 0.7, 1]]) { ctx.beginPath(); ctx.moveTo(lx, -s * 0.6); ctx.lineTo(lx + leg * ph * s * 0.3, 0); ctx.stroke(); }
    ell(ctx, 0, -s * 0.75, s * 1.1, s * 0.5, body);
    if (o.tail) { ctx.strokeStyle = o.body[1]; ctx.lineWidth = s * 0.2; ctx.beginPath(); ctx.moveTo(-s * 1.0, -s * 0.8); ctx.quadraticCurveTo(-s * 1.5, -s * 1.1, -s * 1.6, -s * 0.6 + leg * s * 0.1); ctx.stroke(); }
    // head + snout
    circ(ctx, s * 1.1, -s * 1.0, s * 0.42, o.head); ell(ctx, s * 1.45, -s * 0.85, s * 0.35, s * 0.22, o.head);
    ctx.fillStyle = o.head; ctx.beginPath(); ctx.moveTo(s * 0.9, -s * 1.3); ctx.lineTo(s * 0.95, -s * 1.7); ctx.lineTo(s * 1.15, -s * 1.35); ctx.fill(); ctx.beginPath(); ctx.moveTo(s * 1.15, -s * 1.35); ctx.lineTo(s * 1.3, -s * 1.7); ctx.lineTo(s * 1.4, -s * 1.3); ctx.fill();
    circ(ctx, s * 1.2, -s * 1.1, s * 0.07, o.eye); circ(ctx, s * 1.75, -s * 0.9, s * 0.07, '#111');
  }
  function drawRider(ctx, s, leg, time) {
    // horse
    drawQuadruped(ctx, s * 0.95, leg, { body: ['#2b2a30', '#101014'], head: '#1d1c22', eye: '#ff3a2a', tail: true });
    // rider
    ctx.save(); ctx.translate(-s * 0.1, -s * 1.15);
    ctx.fillStyle = '#5a1a1a'; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.9); ctx.lineTo(-s * 1.0 - Math.sin(time * 6) * s * 0.1, -s * 0.2); ctx.lineTo(-s * 0.4, s * 0.1); ctx.closePath(); ctx.fill(); // cape
    ell(ctx, 0, -s * 0.45, s * 0.42, s * 0.55, '#1c1c24'); // armored body
    ell(ctx, -s * 0.35, -s * 0.85, s * 0.22, s * 0.16, '#3a3a44'); ell(ctx, s * 0.35, -s * 0.85, s * 0.22, s * 0.16, '#3a3a44');
    circ(ctx, s * 0.05, -s * 1.15, s * 0.3, '#2a2a34'); ctx.fillStyle = '#ff3a2a'; ctx.fillRect(s * 0.02, -s * 1.2, s * 0.2, s * 0.06);
    // lance
    ctx.strokeStyle = '#6e4a28'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.4); ctx.lineTo(s * 1.7, -s * 1.0); ctx.stroke(); ctx.fillStyle = '#c9ccd2'; ctx.beginPath(); ctx.moveTo(s * 1.65, -s * 1.05); ctx.lineTo(s * 1.95, -s * 1.15); ctx.lineTo(s * 1.72, -s * 0.9); ctx.fill();
    ctx.restore();
  }

  // =========================================================================
  // PROJECTILES & EFFECTS
  // =========================================================================
  R.drawProjectile = function (ctx, p, time) {
    const h = p.height || 0; // visual arc height
    ctx.save();
    if (p.kind === 'stone') { ell(ctx, p.x, p.y, 5 + h * 0.02, 3 + h * 0.01, 'rgba(0,0,0,0.25)'); }
    ctx.translate(p.x, p.y - h);
    if (p.kind === 'arrow' || p.kind === 'bolt') {
      ctx.rotate(Math.atan2(p.vy, p.vx));
      const L = p.kind === 'bolt' ? 22 : 14, w = p.kind === 'bolt' ? 2.6 : 1.6;
      ctx.strokeStyle = p.kind === 'bolt' ? '#3a2c1e' : '#6b4a2a'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
      ctx.fillStyle = '#d7dbe0'; ctx.beginPath(); ctx.moveTo(L / 2, 0); ctx.lineTo(L / 2 - 5, -2.2); ctx.lineTo(L / 2 - 5, 2.2); ctx.fill();
      ctx.fillStyle = p.kind === 'bolt' ? '#8f2a24' : '#e8e2cf'; ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(-L / 2 + 5, -2.5); ctx.lineTo(-L / 2 + 3, 0); ctx.lineTo(-L / 2 + 5, 2.5); ctx.fill();
    } else if (p.kind === 'orb') {
      const c = p.color || ['#8fd8ff', '#2a7fd0'];
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16); g.addColorStop(0, c[0]); g.addColorStop(0.3, c[1]); g.addColorStop(1, 'rgba(0,0,0,0)');
      circ(ctx, 0, 0, 16, g); circ(ctx, 0, 0, 3.5, '#ffffff');
    } else if (p.kind === 'stone') {
      const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 7); g.addColorStop(0, '#b3ada2'); g.addColorStop(1, '#4e4b46');
      circ(ctx, 0, 0, 7, g);
    }
    ctx.restore();
  };

  R.drawRangeCircle = function (ctx, x, y, r, minR, time, color) {
    ctx.save();
    ctx.fillStyle = color || 'rgba(226,182,87,0.10)'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); if (minR) { ctx.arc(x, y, minR, 0, TAU, true); } ctx.fill();
    ctx.strokeStyle = 'rgba(226,182,87,0.75)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -time * 20; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    if (minR) { ctx.strokeStyle = 'rgba(220,80,60,0.6)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(x, y, minR, 0, TAU); ctx.stroke(); }
    ctx.restore();
  };

  R.drawPlotGlow = function (ctx, x, y, time, strong) {
    const a = strong ? 0.6 : 0.18 + Math.sin(time * 2.2 + x * 0.01) * 0.08;
    ctx.save(); ctx.strokeStyle = `rgba(226,182,87,${a})`; ctx.lineWidth = strong ? 3 : 2; ctx.beginPath(); ctx.ellipse(x, y, 34, 28, 0, 0, TAU); ctx.stroke();
    if (strong) { ctx.fillStyle = 'rgba(226,182,87,0.15)'; ctx.fill(); }
    ctx.restore();
  };

  R.drawRiverShimmer = function (ctx, time, width) {
    const pts = R.riverPts; if (!pts) return;
    const b = TD.LEVEL.bridge; const inB = (p) => Math.abs(p[0] - b.x) < b.w / 2 + 6 && Math.abs(p[1] - b.y) < b.h / 2 + 4;
    const path = () => { ctx.beginPath(); let pen = false; for (const p of pts) { if (inB(p)) { pen = false; continue; } if (!pen) { ctx.moveTo(p[0], p[1]); pen = true; } else ctx.lineTo(p[0], p[1]); } };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    path(); ctx.strokeStyle = 'rgba(180,225,240,0.22)'; ctx.lineWidth = width * 0.22; ctx.setLineDash([26, 40]); ctx.lineDashOffset = -time * 55; ctx.stroke();
    path(); ctx.strokeStyle = 'rgba(220,245,255,0.16)'; ctx.lineWidth = width * 0.1; ctx.setLineDash([12, 58]); ctx.lineDashOffset = -time * 80 + 20; ctx.stroke();
    ctx.restore();
  };

  R.drawTorch = function (ctx, x, y, time, scale) {
    const f = 0.85 + Math.sin(time * 13 + x) * 0.1 + Math.sin(time * 29 + y) * 0.05; const s = scale || 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 1, x, y, 48 * s * f); g.addColorStop(0, 'rgba(255,170,60,0.5)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    circ(ctx, x, y, 48 * s * f, g);
    ctx.restore();
    drawFlame(ctx, x, y, 4 * s, time);
  };

  // screen-space overlays (call with identity transform, in CSS px)
  R.drawVignette = function (ctx, w, h, strength) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(5,5,12,${strength || 0.55})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  };

  // tower icon for UI cards
  R.towerIcon = function (canvas, type, level) {
    const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h); ctx.save(); const sc = w / 96; ctx.scale(sc, sc); ctx.translate(48, 82);
    R.drawTower(ctx, { type, level: level || 0, x: 0, y: 0, angle: -0.5, fireT: 9 }, 1.0);
    ctx.restore();
  };

  TD.Render = R;
})(window.TD);
