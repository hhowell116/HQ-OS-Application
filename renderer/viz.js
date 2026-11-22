// Dedicated audio visualizer fed by HQAudio (system audio loopback). Click it to cycle styles.
// Styles are original canvas code inspired by entries in awesome-audio-visualization:
//   spectrum (mirrored bars), radial (Audible Visuals), wave (the Wave codevember piece), burst (Fireworks with WebGL).
(() => {
  const cv = document.getElementById("viz"); if (!cv) return;
  const wrap = cv.parentElement, ctx = cv.getContext("2d"), N = 56, TAU = Math.PI * 2;
  const MODES = ["spectrum", "radial", "wave", "burst"];
  let mode = localStorage.getItem("hq-viz-mode") ? Math.max(0, MODES.indexOf(localStorage.getItem("hq-viz-mode"))) : MODES.indexOf("wave");
  let wGain = 0.15; // auto-gain so quiet music still moves the wave
  const bars = new Float32Array(N), peaks = new Float32Array(N), pv = new Float32Array(N), pts = [];
  let raf = 0, poll = 0, quietSince = 0, shown = false, lastT = 0, W = 0, H = 0, dpr = 1, ph = 0, bassEnv = 0, lastBurst = 0;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function colours() {
    const sr = (v) => css(v).split(",").map(Number), ok = (a) => a.length === 3 && !a.some(isNaN);
    const a = sr("--acc-rgb"), b = sr("--sec-rgb");
    return [ok(a) ? a : [25, 227, 208], ok(b) ? b : [255, 95, 168]];
  }
  function size() {
    dpr = window.devicePixelRatio || 1; const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    W = cv.width; H = cv.height;
  }
  // 32 bands -> N bars, log-ish spread with a gentle treble tilt so bass doesn't dominate
  function sample(bands, i) {
    const f = Math.pow(i / (N - 1), 0.85) * 31, a = Math.floor(f), b = Math.min(31, a + 1), k = f - a;
    const v = bands[a] * (1 - k) + bands[b] * k, tilt = 0.8 + 0.6 * (i / (N - 1));
    return Math.min(1, Math.pow(v, 1.15) * tilt * 1.25);
  }
  const grad = (c1, c2) => { const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, `rgb(${c1})`); g.addColorStop(0.5, `rgb(${c2})`); g.addColorStop(1, `rgb(${c1})`); return g; };

  function spectrum(c1, c2) {
    const mid = H / 2, slot = W / 2 / N, w = Math.max(2 * dpr, slot * 0.72), maxh = H / 2 - 3 * dpr;
    ctx.lineCap = "round"; ctx.lineWidth = w; ctx.strokeStyle = grad(c2, c1); ctx.shadowColor = `rgba(${c1},.55)`; ctx.shadowBlur = 8 * dpr;
    for (const side of [-1, 1]) for (let i = 0; i < N; i++) {
      const x = W / 2 + side * (i + 0.5) * slot, h = Math.max(w / 2, bars[i] * maxh);
      ctx.beginPath(); ctx.moveTo(x, mid - h); ctx.lineTo(x, mid + h); ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.fillStyle = `rgba(${c2},.9)`;
    for (let i = 0; i < N; i++) {
      if (peaks[i] < 0.04) continue; const y = peaks[i] * maxh + 3 * dpr, r = w * 0.4;
      for (const side of [-1, 1]) { const x = W / 2 + side * (i + 0.5) * slot; ctx.beginPath(); ctx.arc(x, mid - y, r, 0, TAU); ctx.arc(x, mid + y, r, 0, TAU); ctx.fill(); }
    }
  }
  // elliptical halo of bars, rotating slowly, bass breathes the ring
  function radial(c1, c2, dt) {
    ph += dt * 0.35; const cx = W / 2, cy = H / 2, ry0 = H * 0.26, rx0 = ry0 * 2.4, M = 96;
    ctx.lineCap = "round"; ctx.lineWidth = 2.2 * dpr; ctx.shadowColor = `rgba(${c1},.5)`; ctx.shadowBlur = 6 * dpr;
    for (let i = 0; i < M; i++) {
      const u = i / M, m = u < 0.5 ? u * 2 : (1 - u) * 2, v = bars[Math.min(N - 1, Math.floor(m * (N - 1)))];
      const ang = u * TAU + ph, ca = Math.cos(ang), sa = Math.sin(ang), br = 1 + bassEnv * 0.12, l = H * 0.05 + v * H * 0.3;
      ctx.strokeStyle = `rgba(${m > 0.55 ? c2 : c1},${0.35 + v * 0.65})`;
      ctx.beginPath(); ctx.moveTo(cx + ca * rx0 * br, cy + sa * ry0 * br); ctx.lineTo(cx + ca * (rx0 * br + l * 2.6), cy + sa * (ry0 * br + l)); ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(${c1},.25)`; ctx.lineWidth = dpr; ctx.beginPath(); ctx.ellipse(cx, cy, rx0 * 0.92, ry0 * 0.92, 0, 0, TAU); ctx.stroke();
  }
  // flowing oscilloscope ribbon built from the bands (band-driven sine partials) with ghost layers
  function wave(c1, c2, dt) {
    ph += dt * 2.2; const mid = H / 2, amp = H * 0.42, S = 160;
    let pk = 0; for (let i = 0; i < bars.length; i++) pk = Math.max(pk, bars[i]); wGain = Math.max(wGain * Math.pow(0.6, dt), pk, 0.06); const g = 1 / wGain;
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      for (let s = 0; s <= S; s++) {
        const x = (s / S) * W, u = s / S, env = Math.sin(u * Math.PI); let y = 0;
        for (let k = 0; k < 8; k++) y += bars[k * 6 + 1] * Math.sin(u * TAU * (k + 1) * 0.9 + ph * (1 + k * 0.35) + layer * 0.8) / (1 + k * 0.25);
        y = Math.max(-amp, Math.min(amp, (y / 1.5) * g * amp * env)); if (s) ctx.lineTo(x, mid + y); else ctx.moveTo(x, mid + y);
      }
      ctx.lineJoin = "round"; ctx.lineWidth = (layer === 0 ? 2.4 : 1.2) * dpr; ctx.strokeStyle = layer === 0 ? grad(c1, c2) : `rgba(${layer === 1 ? c2 : c1},${0.28 - layer * 0.08})`;
      ctx.shadowColor = `rgba(${c1},.6)`; ctx.shadowBlur = layer === 0 ? 10 * dpr : 0; ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  // bass-triggered particle fountains with gravity
  function burst(c1, c2, dt, now) {
    let lvl = 0; for (let i = 0; i < N; i++) lvl += bars[i]; lvl /= N;
    if (bassEnv > 0.45 && now - lastBurst > 140 && pts.length < 260) {
      lastBurst = now; const n = 14 + Math.floor(bassEnv * 22), ox = W / 2 + (Math.random() - 0.5) * W * 0.5;
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = (0.5 + Math.random()) * H * (0.9 + bassEnv); pts.push({ x: ox, y: H * 0.92, vx: Math.cos(a) * sp * 1.6, vy: Math.sin(a) * sp, life: 1, hue: Math.random() < 0.4 }); }
    }
    ctx.strokeStyle = `rgba(${c1},${0.2 + lvl * 0.6})`; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.moveTo(W * 0.1, H * 0.92); ctx.lineTo(W * 0.9, H * 0.92); ctx.stroke();
    ctx.shadowColor = `rgba(${c2},.6)`; ctx.shadowBlur = 6 * dpr;
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i]; p.vy += H * 2.4 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 0.9;
      if (p.life <= 0 || p.y > H) { pts.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(${p.hue ? c2 : c1},${p.life})`; ctx.beginPath(); ctx.arc(p.x, p.y, (1 + p.life * 1.6) * dpr, 0, TAU); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  const DRAW = { spectrum, radial, wave, burst };

  function draw(now) {
    raf = 0;
    const A = window.HQAudio; if (!A) return;
    if (document.hidden || !cv.offsetParent) { idle(); return; }
    A.read();
    const dt = Math.min(0.05, (now - (lastT || now)) / 1000) || 0.016; lastT = now;
    const active = A.on && (A.level > 0.012 || A.bass > 0.02);
    if (active) quietSince = 0; else if (!quietSince) quietSince = now;
    const fade = quietSince && now - quietSince > 1500;
    if (fade && shown) { shown = false; cv.classList.remove("on"); wrap.classList.remove("viz-on"); }
    if (!fade && active && !shown) { shown = true; cv.classList.add("on"); wrap.classList.add("viz-on"); }
    if (fade && now - quietSince > 2500) { size(); ctx.clearRect(0, 0, W, H); bars.fill(0); peaks.fill(0); pv.fill(0); pts.length = 0; bassEnv = 0; idle(); return; }
    size(); ctx.clearRect(0, 0, W, H);
    const att = 1 - Math.pow(0.0005, dt), rel = 1 - Math.pow(0.12, dt);
    for (let i = 0; i < N; i++) {
      const v = fade ? 0 : sample(A.bands, i), b = bars[i];
      bars[i] = v > b ? b + (v - b) * att : b + (v - b) * rel;
      if (bars[i] >= peaks[i]) { peaks[i] = bars[i]; pv[i] = 0; } else { pv[i] += dt * 1.6; peaks[i] = Math.max(bars[i], peaks[i] - pv[i] * dt); }
    }
    const bt = fade ? 0 : A.bass; bassEnv = bt > bassEnv ? bt : bassEnv + (bt - bassEnv) * Math.min(1, dt * 6);
    const [c1, c2] = colours(); DRAW[MODES[mode]](c1, c2, dt, now);
    raf = requestAnimationFrame(draw);
  }
  // no animation frames while idle: a slow timer watches the level and restarts drawing when sound arrives
  function idle() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (poll) return;
    poll = setInterval(() => {
      const A = window.HQAudio; if (!A || !A.on || document.hidden) return;
      A.read(); if (A.level > 0.012 && cv.offsetParent) wake();
    }, 400);
  }
  function wake() { clearInterval(poll); poll = 0; quietSince = 0; lastT = 0; if (!raf) raf = requestAnimationFrame(draw); }
  document.addEventListener("visibilitychange", () => { if (document.hidden) idle(); else if (window.HQAudio && window.HQAudio.on) wake(); });
  cv.addEventListener("click", () => setMode((mode + 1) % MODES.length));
  function setMode(m) { mode = typeof m === "string" ? Math.max(0, MODES.indexOf(m)) : m; localStorage.setItem("hq-viz-mode", MODES[mode]); pts.length = 0; cv.title = "Visualizer: " + MODES[mode] + " (click to change)"; }
  setMode(mode); idle();
  window.HQViz = { wake, setMode, modes: MODES };
})();
