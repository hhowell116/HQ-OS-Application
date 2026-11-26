// Dependency-free candlestick chart for the Trading Floor (canvas). HQStockChart.mount(parent, {symbol, tf, lines, marks}) -> {destroy, setTf}.
// Data comes from the engine (engine/charts.js, cached) through the "tf-chart" IPC: {bars, sma20, sma50, vwap}. Lines = entry/stop/target levels, marks = our buy/sell fills.
// Research only, not financial advice. No network access here.
(function () {
  const TFS = [["1D", "1D"], ["5D", "5D"], ["1M", "1M"], ["6M", "6M"]];
  const css = (el, v, d) => (getComputedStyle(el).getPropertyValue(v) || "").trim() || d;
  const fmt = (n) => (n >= 1000 ? n.toFixed(0) : n >= 100 ? n.toFixed(1) : n.toFixed(2));
  const ET = { timeZone: "America/New_York" };
  const stamp = (t, intra) => new Date(t).toLocaleString("en-US", Object.assign({}, ET, intra ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", year: "2-digit" }));
  const tick = (t, tf) => new Date(t).toLocaleString("en-US", Object.assign({}, ET, tf === "1D" ? { hour: "numeric", minute: "2-digit" } : tf === "5D" ? { weekday: "short", day: "numeric" } : { month: "short", day: "numeric" }));
  function mount(parent, o) {
    const mk = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
    const root = mk("div", "sc-wrap"), bar = mk("div", "sc-bar"), cv = mk("canvas", "sc-cv"), tip = mk("div", "sc-tip hidden"), msg = mk("div", "sc-msg", "Loading chart…");
    const st = { tf: o.tf || "1D", data: null, hover: -1, dead: false, req: 0 }, btns = {};
    for (const [k, l] of TFS) { const b = mk("button", "sc-tf", l); b.onclick = (e) => { e.stopPropagation(); setTf(k); }; btns[k] = b; bar.append(b); }
    const leg = mk("span", "sc-leg"); bar.append(leg); const box = mk("div", "sc-box"); box.append(cv, tip, msg); root.append(bar, box); parent.append(root);
    function setTf(tf) { st.tf = tf; for (const k in btns) btns[k].classList.toggle("on", k === tf); load(); }
    async function load() {
      const id = ++st.req; msg.textContent = "Loading chart…"; msg.classList.remove("hidden");
      let d = null; try { d = await window.hq.tfChart([o.symbol, st.tf]); } catch (e) { d = { error: e.message }; }
      if (st.dead || id !== st.req) return;
      if (!d || d.error || !d.bars || d.bars.length < 2) { st.data = null; msg.textContent = "No chart data" + (d && d.error ? " (" + d.error + ")" : "") + ". The market may be closed or the source is down."; msg.classList.remove("hidden"); draw(); return; }
      st.data = d; msg.classList.add("hidden"); draw();
    }
    function geom() { const w = cv.clientWidth, h = cv.clientHeight, padR = 52, padB = 16, volH = Math.round((h - padB) * 0.2); return { w, h, padR, padB, volH, ph: h - padB - volH - 4, pw: w - padR }; }
    function draw() {
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const d = st.data; if (!d) return;
      const up = css(root, "--up", "#34d399"), dn = css(root, "--dn", "#fb7185"), amb = css(root, "--amb", "#f5b94a"), mut = css(root, "--mut", "#7d8b99"), line = css(root, "--line", "rgba(255,255,255,.08)"), fg = css(root, "--fg", "#e6edf3");
      const G = geom(), n = d.bars.length, step = G.pw / n, bw = Math.max(1, Math.min(14, step * 0.68)), X = (i) => (i + 0.5) * step;
      const lv = (o.lines || []).filter((l) => l.v > 0); let lo = Infinity, hi = -Infinity;
      for (const b of d.bars) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
      const span0 = hi - lo || hi * 0.01; for (const l of lv) if (l.v > lo - span0 * 1.2 && l.v < hi + span0 * 1.2) { lo = Math.min(lo, l.v); hi = Math.max(hi, l.v); } // keep far-away levels off the scale
      const pad = (hi - lo) * 0.06 || 0.5; lo -= pad; hi += pad; const Y = (v) => 4 + (hi - v) / (hi - lo) * G.ph;
      g.font = "10px ui-monospace,Consolas,monospace"; g.textBaseline = "middle"; g.lineWidth = 1;
      for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = Math.round(Y(v)) + 0.5; g.strokeStyle = line; g.beginPath(); g.moveTo(0, y); g.lineTo(G.pw, y); g.stroke(); g.fillStyle = mut; g.textAlign = "left"; g.fillText(fmt(v), G.pw + 4, y); }
      // x ticks
      g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillStyle = mut; const every = Math.max(1, Math.round(n / (G.pw > 420 ? 6 : 4))); let lastLab = "";
      for (let i = 0; i < n; i += every) { const lab = tick(d.bars[i].t, st.tf); if (lab !== lastLab) { g.fillText(lab, Math.min(G.pw - 18, Math.max(18, X(i))), G.h - 3); lastLab = lab; } }
      // volume
      const vmax = Math.max(1, ...d.bars.map((b) => b.v)); d.bars.forEach((b, i) => { const hh = Math.max(1, b.v / vmax * G.volH); g.fillStyle = (b.c >= b.o ? up : dn) + "55"; g.fillRect(X(i) - bw / 2, G.h - G.padB - hh, bw, hh); });
      const poly = (arr, col, dash) => { g.strokeStyle = col; g.lineWidth = 1.2; g.setLineDash(dash || []); g.beginPath(); let on = false; arr.forEach((v, i) => { if (v == null) { on = false; return; } if (!on) { g.moveTo(X(i), Y(v)); on = true; } else g.lineTo(X(i), Y(v)); }); g.stroke(); g.setLineDash([]); };
      // candles
      d.bars.forEach((b, i) => { const col = b.c >= b.o ? up : dn, x = X(i); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(Math.round(x) + 0.5, Y(b.h)); g.lineTo(Math.round(x) + 0.5, Y(b.l)); g.stroke(); const y1 = Y(Math.max(b.o, b.c)), y2 = Y(Math.min(b.o, b.c)); g.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1)); });
      if (d.sma20) poly(d.sma20, amb); if (d.sma50) poly(d.sma50, "#60a5fa"); if (d.vwap) poly(d.vwap, "#c084fc", [4, 3]);
      // entry / stop / target lines
      g.textBaseline = "middle"; for (const l of lv) { if (l.v < lo || l.v > hi) continue; const y = Math.round(Y(l.v)) + 0.5, col = l.c === "s" ? dn : l.c === "t" ? up : fg; g.strokeStyle = col; g.globalAlpha = 0.85; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(0, y); g.lineTo(G.pw, y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; const tx = l.k + " " + fmt(l.v), tw = g.measureText(tx).width + 8; g.fillStyle = col; g.fillRect(G.pw - tw, y - 7, tw, 14); g.fillStyle = "#0b1118"; g.textAlign = "left"; g.fillText(tx, G.pw - tw + 4, y + 0.5); }
      // our fills
      for (const m of o.marks || []) { if (!(m.t >= d.bars[0].t && m.t <= d.bars[n - 1].t + (d.bars[n - 1].t - d.bars[Math.max(0, n - 2)].t))) continue; let bi = 0; for (let i = 0; i < n; i++) if (d.bars[i].t <= m.t) bi = i; const x = X(bi), buy = m.side === "buy", y = buy ? Y(d.bars[bi].l) + 11 : Y(d.bars[bi].h) - 11;
        g.fillStyle = buy ? up : dn; g.strokeStyle = "#0b1118"; g.lineWidth = 1.5; g.beginPath(); if (buy) { g.moveTo(x, y - 8); g.lineTo(x - 6, y + 4); g.lineTo(x + 6, y + 4); } else { g.moveTo(x, y + 8); g.lineTo(x - 6, y - 4); g.lineTo(x + 6, y - 4); } g.closePath(); g.stroke(); g.fill(); }
      // crosshair
      if (st.hover >= 0 && st.hover < n) { const b = d.bars[st.hover], x = Math.round(X(st.hover)) + 0.5; g.strokeStyle = mut; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, G.h - G.padB); g.stroke(); const cy = Y(b.c); g.beginPath(); g.moveTo(0, cy); g.lineTo(G.pw, cy); g.stroke(); g.setLineDash([]); }
      const last = d.bars[n - 1], first = d.bars[0], chg = (last.c / first.o - 1) * 100; leg.textContent = ""; leg.append(mk("b", "", (d.symbol || o.symbol) + " " + fmt(last.c)), mk("span", chg >= 0 ? "u" : "d", (chg >= 0 ? "+" : "") + chg.toFixed(2) + "% (" + st.tf + ")"));
      if (d.sma20) leg.append(mk("i", "k20", "SMA20")), leg.append(mk("i", "k50", "SMA50")); if (d.vwap) leg.append(mk("i", "kv", "VWAP"));
    }
    cv.addEventListener("mousemove", (e) => { const d = st.data; if (!d) return; const r = cv.getBoundingClientRect(), G = geom(), i = Math.floor((e.clientX - r.left) / (G.pw / d.bars.length)); if (i < 0 || i >= d.bars.length) { st.hover = -1; tip.classList.add("hidden"); draw(); return; }
      st.hover = i; const b = d.bars[i]; tip.textContent = ""; tip.append(mk("b", "", stamp(b.t, d.intraday)), mk("div", "", "O " + fmt(b.o) + "  H " + fmt(b.h)), mk("div", "", "L " + fmt(b.l) + "  C " + fmt(b.c)), mk("div", "", "Vol " + (b.v >= 1e6 ? (b.v / 1e6).toFixed(2) + "M" : b.v >= 1e3 ? (b.v / 1e3).toFixed(1) + "K" : b.v)));
      if (d.sma20 && d.sma20[i] != null) tip.append(mk("div", "", "SMA20 " + fmt(d.sma20[i]) + (d.sma50 && d.sma50[i] != null ? "  SMA50 " + fmt(d.sma50[i]) : ""))); if (d.vwap && d.vwap[i] != null) tip.append(mk("div", "", "VWAP " + fmt(d.vwap[i])));
      tip.classList.remove("hidden"); const left = e.clientX - r.left > r.width / 2; tip.style.left = left ? "6px" : "auto"; tip.style.right = left ? "auto" : "60px"; draw(); });
    cv.addEventListener("mouseleave", () => { st.hover = -1; tip.classList.add("hidden"); draw(); });
    let ro = null; if (window.ResizeObserver) { ro = new ResizeObserver(() => draw()); ro.observe(cv); }
    setTf(st.tf);
    return { setTf, el: root, redraw: draw, destroy() { st.dead = true; if (ro) ro.disconnect(); root.remove(); } };
  }
  window.HQStockChart = { mount };
})();
