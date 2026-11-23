// Trading Floor office: tile-grid pixel office rendered to a 640x432 native canvas and scaled with crisp nearest-neighbour.
// Art: Kenney "Roguelike Indoors" + "Roguelike Characters" (CC0, see assets/floor/CREDITS.txt) plus a few code-drawn props (monitors, vault, clock).
// Characters are layered paper-dolls from the Kenney sheet. Speech/emote bubbles, name plates and the VETO stamp are DOM overlays that follow the sprites.
window.FloOffice = (function () {
  const NW = 640, NH = 432, TS = 17;
  const HUE = { market: "#4aa8ff", news: "#b58cff", sentiment: "#ff8fd0", analyst: "#ffb02e", bull: "#00f5a0", bear: "#ff3d6b", backtest: "#5ee6ff", risk: "#ff7a45", lead: "#ffe066", score: "#9ad17a", reflect: "#c0a0ff", steady: "#6fd36f" };
  const NAME = { market: "MARKET DATA", news: "NEWS & POLICY", sentiment: "SENTIMENT", analyst: "ANALYST", debate: "BULL VS BEAR", backtest: "BACKTESTER", risk: "RISK MANAGER", lib: "SCORE & REFLECT", steady: "STEADY", hub: "LEAD" };
  const AGN = { market: "Market", news: "News", sentiment: "Sentiment", analyst: "Analyst", bull: "Bull", bear: "Bear", backtest: "Backtest", risk: "Risk", lead: "Lead", score: "Score", reflect: "Reflect", steady: "Steady" };
  const J = { x: 224, y: 232 }, G = { x: 380, y: 246 };
  const R = {}; const room = (k, tx, ty, tw, th, hue, floor, tint, agents, exits) => (R[k] = { k, x: tx * 16, y: ty * 16, w: tw * 16, h: th * 16, hue, floor, tint, agents, exits });
  const topExit = (s, dx) => [{ x: s.x, y: s.y + 34 }, { x: dx, y: 128 }, { x: 224, y: 128 }, J];
  const botExit = (s) => [{ x: s.x + 32, y: s.y }, { x: s.x + 32, y: 288 }, { x: 224, y: 288 }, J];
  room("market", 0, 0, 9, 7, HUE.market, [24, 5], "#2a6ab8", { market: { x: 72, y: 66 } }, (s) => topExit(s, 72));
  room("news", 10, 0, 9, 7, HUE.news, [24, 5], "#6a3ab8", { news: { x: 232, y: 66 } }, (s) => topExit(s, 232));
  room("sentiment", 20, 0, 9, 7, HUE.sentiment, [24, 5], "#b83a8a", { sentiment: { x: 392, y: 66 } }, (s) => topExit(s, 392));
  room("steady", 30, 0, 9, 7, HUE.steady, [24, 5], "#3ab85a", { steady: { x: 552, y: 66 } }, (s) => topExit(s, 552));
  room("analyst", 0, 9, 9, 8, HUE.analyst, [24, 5], "#b88a1a", { analyst: { x: 72, y: 204 } }, (s) => [{ x: s.x + 34, y: s.y + 10 }, { x: s.x + 34, y: 232 }, { x: 152, y: 232 }, J]);
  room("hub", 10, 9, 20, 8, HUE.lead, [24, 1], "#b89a1a", { lead: { x: 390, y: 196 } }, () => []);
  room("debate", 31, 9, 9, 8, HUE.bull, [24, 5], "#2a8a6a", { bull: { x: 532, y: 206 }, bear: { x: 604, y: 206 } }, (s) => [{ x: s.x, y: 236 }, { x: 490, y: 232 }, J]);
  room("backtest", 0, 19, 13, 8, HUE.backtest, [24, 5], "#2a8ab8", { backtest: { x: 56, y: 356 } }, botExit);
  room("risk", 14, 19, 12, 8, HUE.risk, [24, 5], "#b8502a", { risk: { x: 360, y: 356 } }, botExit);
  room("lib", 27, 19, 13, 8, HUE.score, [24, 5], "#5a9a2a", { score: { x: 480, y: 356 }, reflect: { x: 590, y: 356 } }, botExit);
  const roomOf = (a) => (a === "score" || a === "reflect" ? "lib" : a === "bull" || a === "bear" ? "debate" : a === "lead" ? "hub" : a);
  function seatOf(a) { const r = R[roomOf(a)]; return r.agents[a] || Object.values(r.agents)[0]; }
  const visitSpot = (k, a) => { if (k === "hub") return G; const s = seatOf(a || k); return k === "debate" ? { x: 568, y: 244 } : { x: s.x + 34, y: s.y + 14 }; };
  const eq = (a, b) => a.x === b.x && a.y === b.y;
  const route = (k, spot, fa) => (k === "hub" ? [spot, J] : [spot, ...R[k].exits(fa ? seatOf(fa) : spot)]);
  function pathTo(fk, fs, tk, ts, fa, ta) {
    if (fk === tk) return [ts];
    const a = route(fk, fs, fa), b = route(tk, ts, ta);
    while (a.length > 2 && b.length > 2 && eq(a[a.length - 1], b[b.length - 1]) && eq(a[a.length - 2], b[b.length - 2])) { a.pop(); b.pop(); }
    const o = []; for (const q of [...a, ...b.reverse()]) if (!o.length || !eq(o[o.length - 1], q)) o.push(q); return o.slice(1);
  }
  // paper-doll looks: body row/skin (col 0 and 1 are the two walk frames), shirt [c,r], hair [c,r], hat [c,r]
  const LOOK = {
    market: { b: 0, s: [10, 0], h: [20, 0] }, news: { b: 5, s: [6, 0], h: [19, 1], hat: [28, 0] }, sentiment: { b: 6, s: [14, 0], h: [22, 2] },
    analyst: { b: 7, s: [8, 2], h: [21, 0] }, bull: { b: 8, s: [6, 6], h: [20, 3], hat: [30, 3] }, bear: { b: 9, s: [14, 3], h: [23, 4] },
    backtest: { b: 1, s: [11, 1], h: [21, 5] }, risk: { b: 2, s: [7, 1], h: [22, 7], hat: [28, 2] }, lead: { b: 5, s: [17, 0], h: [19, 0], hat: [29, 1] },
    score: { b: 0, s: [12, 5], h: [20, 2] }, reflect: { b: 6, s: [16, 0], h: [24, 1] }, steady: { b: 9, s: [6, 5], h: [22, 8], hat: [29, 5] },
  };
  const agents = Object.keys(LOOK), chars = {}, sheets = {}, cache = {};
  let cv, ctx, nat, nx, ov, cssW = 1, cssH = 1, dpr = 1, raf = 0, t0 = 0, view = { st: {}, running: false, tape: [], eq: [] }, bubbles = {}, stampT = -99, shown = () => true, hoverK = "", loaded = 0;
  const cam = { x: NW / 2, y: NH / 2, z: 1, tx: NW / 2, ty: NH / 2, tz: 1, follow: "" };
  const els = { plate: {}, bub: {}, tag: {}, led: {} };
  ["indoor", "chars"].forEach((n) => { const i = new Image(); i.onload = () => { sheets[n] = i; loaded++; if (loaded === 2) composeAll(); }; i.src = "assets/floor/" + n + ".png"; });
  function composeAll() { for (const a of agents) { cache[a] = [0, 1].map((f) => { const c = document.createElement("canvas"); c.width = c.height = 16; const x = c.getContext("2d"), L = LOOK[a], d = (cc, rr) => x.drawImage(sheets.chars, cc * TS, rr * TS, 16, 16, 0, 0, 16, 16); d(f, L.b); d(L.s[0], L.s[1]); d(L.h[0], L.h[1]); if (L.hat) d(L.hat[0], L.hat[1]); return c; }); } }
  function mkChars() { agents.forEach((a, i) => { const s = seatOf(a); chars[a] = { id: a, x: s.x, y: s.y, path: [], q: [], loc: roomOf(a), wait: 0, face: 1, carry: 0, step: 0, phase: i * 1.7, dest: null }; }); }

  function trigger(e, snap) {
    if (!e) return; const a = e.agent === "debate" ? "bear" : e.agent;
    if (e.text && (e.kind !== "start" || e.text.length > 6) && chars[a]) { bubbles[a] = { text: e.text, born: performance.now() / 1000, kind: e.kind }; if (e.kind === "veto") bubbles.risk = bubbles[a]; }
    if (e.kind === "veto") { stampT = performance.now() / 1000; if (els.stamp) { els.stamp.classList.remove("go"); void els.stamp.offsetWidth; els.stamp.classList.add("go"); } }
    if (snap || !chars[a] || e.agent === "debate") return;
    if (e.kind === "done" && e.to && R[roomOf(e.to)] && roomOf(e.to) !== roomOf(a)) chars[a].q.push({ to: e.to });
  }
  function reset() { bubbles = {}; for (const a in chars) { const c = chars[a], s = seatOf(a); c.x = s.x; c.y = s.y; c.path = []; c.q = []; c.loc = roomOf(a); c.wait = 0; c.carry = 0; c.dest = null; } }
  function updateChar(c, dt) {
    if (c.path.length) {
      const p = c.path[0], dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy), sp = 62 * dt;
      if (d <= sp) { c.x = p.x; c.y = p.y; c.path.shift(); if (!c.path.length) c.wait = c.dest ? 1.8 : 0; } else { c.x += (dx / d) * sp; c.y += (dy / d) * sp; c.step += dt * 8; }
      if (Math.abs(dx) > 0.5) c.face = dx > 0 ? 1 : -1; return;
    }
    if (c.wait > 0) { c.wait -= dt; if (c.wait <= 0 && c.dest) { c.dest = null; c.carry = 0; c.path = pathTo(c.loc, { x: c.x, y: c.y }, roomOf(c.id), seatOf(c.id), null, c.id); c.loc = roomOf(c.id); } return; }
    if (c.q.length) { const j = c.q.shift(), k = roomOf(j.to); c.path = pathTo(c.loc, { x: c.x, y: c.y }, k, visitSpot(k, j.to), c.loc === roomOf(c.id) ? c.id : null, j.to); c.dest = k; c.loc = k; c.carry = 1; }
  }
  const st = (a) => (view.st[a] && view.st[a].status) || "idle";

  // ---------- drawing (native resolution) ----------
  const rect = (x, y, w, h, c) => { nx.fillStyle = c; nx.fillRect(Math.round(x), Math.round(y), w, h); };
  const tile = (c, r, x, y, w, h) => { if (!sheets.indoor) return; for (let i = 0; i < (w || 1); i++) for (let j = 0; j < (h || 1); j++) nx.drawImage(sheets.indoor, (c + i) * TS, (r + j) * TS, 16, 16, Math.round(x + i * 16), Math.round(y + j * 16), 16, 16); };
  const glowRect = (x, y, w, h, col, a) => { nx.globalAlpha = a; nx.fillStyle = col; nx.fillRect(x, y, w, h); nx.globalAlpha = 1; };
  function monitor(x, y, col, on, t, seed) { rect(x, y, 13, 10, "#1c1f26"); rect(x + 1, y + 1, 11, 7, on ? "#07151a" : "#0d1114"); if (on) for (let i = 0; i < 3; i++) rect(x + 2, y + 2 + i * 2, 2 + ((Math.sin(t * 3 + i * 1.7 + seed) + 1) * 3.5) | 0, 1, col); rect(x + 5, y + 10, 3, 2, "#444"); rect(x + 2, y + 12, 9, 1, "#333"); if (on) glowRect(x - 2, y - 2, 17, 14, col, 0.10); }
  function deskAt(s, a, t) {
    const x = s.x - 24, y = s.y - 1; tile(0, 0, x, y, 3, 2); const on = st(a) === "working";
    monitor(s.x - 21, y - 4, HUE[a] || "#fff", on, t, s.x); rect(s.x + 8, y + 3, 10, 3, "#2a2a30"); if (st(a) === "done") rect(s.x + 6, y - 1, 9, 6, "#f4f4ee");
  }
  const wallBand = (r) => { rect(r.x, r.y, r.w, 32, "#4a3a4e"); for (let yy = 0; yy < 32; yy += 8) { rect(r.x, r.y + yy, r.w, 1, "#35283a"); for (let xx = (yy / 8) % 2 ? 0 : 8; xx < r.w; xx += 16) rect(r.x + xx, r.y + yy, 1, 8, "#35283a"); } rect(r.x, r.y + 30, r.w, 2, "#241a28"); };
  const floor = (r) => { for (let x = 0; x < r.w; x += 16) for (let y = 32; y < r.h; y += 16) tile(r.floor[0], r.floor[1], r.x + x, r.y + y); glowRect(r.x, r.y + 32, r.w, r.h - 32, r.tint, r.k === "hub" ? 0.18 : 0.22); };
  function screens(r, n, w, t, seeds) { const tp = view.tape || []; for (let i = 0; i < n; i++) { const x = r.x + 6 + i * ((r.w - 12) / n), y = r.y + 5; rect(x, y, w, 18, "#0b1014"); rect(x + 1, y + 1, w - 2, 16, "#10202a"); const q = tp.length ? tp[i % tp.length] : null, up = q ? q.chg >= 0 : Math.sin(i + t) > 0, c = up ? "#00f5a0" : "#ff3d6b"; rect(x + 2, y + 11, w - 4, 1, c + "55"); for (let k = 0; k < 6; k++) rect(x + 2 + k * ((w - 4) / 6), y + 14 - (up ? k : 5 - k) * 1.2 - (Math.sin(k + t * 2 + i) + 1), 2, 2, c); rect(x + 2, y + 3, 6, 2, "#9fb5ac"); rect(x + 10, y + 3, 6, 2, c); } }
  const DECOR = {
    market(r, t) { screens(r, 5, 22, t); tile(16, 0, r.x + 4, r.y + 78); tile(17, 0, r.x + 124, r.y + 78); },
    news(r, t) { for (let i = 0; i < 3; i++) { const x = r.x + 8 + i * 45, y = r.y + 4; rect(x, y, 40, 24, "#0b0e14"); rect(x + 2, y + 2, 36, 15, ["#1d3a6a", "#4a2a3a", "#2a4a3a"][i]); rect(x + 8, y + 5 + Math.sin(t * 2 + i), 10, 9, "#b58cff"); rect(x + 2, y + 18, 36, 5, "#c33"); rect(x + 4, y + 20, 8, 1, "#fff"); } tile(16, 0, r.x + 4, r.y + 78); tile(18, 0, r.x + 124, r.y + 6); },
    sentiment(r, t) { for (let i = 0; i < 4; i++) { const x = r.x + 10 + i * 32, y = r.y + 6; rect(x, y, 20, 22, "#15101a"); rect(x + 2, y + 2, 16, 18, "#2a1a28"); rect(x + 6, y + 6, 8, 2, "#ff8fd0"); rect(x + 6, y + 10, 8, 2, "#ff8fd099"); rect(x + 6, y + 14, 5, 2, "#ff8fd055"); } for (let i = 0; i < 4; i++) { const k = (t * 0.4 + i * 0.25) % 1; nx.globalAlpha = 1 - k; rect(r.x + 20 + i * 30, r.y + 90 - k * 40, 4, 4, "#ff8fd0"); nx.globalAlpha = 1; } tile(17, 0, r.x + 124, r.y + 78); },
    steady(r, t) { glowRect(r.x, r.y, r.w, 32, "#bfffd0", 0.18); for (let i = 0; i < 9; i++) rect(r.x + 8 + i * 16, r.y + 2, 1, 28, "rgba(220,255,230,.35)"); tile(16, 0, r.x + 6, r.y + 70); tile(17, 0, r.x + 110, r.y + 70); tile(16, 0, r.x + 6, r.y + 36); tile(17, 0, r.x + 124, r.y + 36); tile(16, 0, r.x + 62, r.y + 92); },
    analyst(r, t) { rect(r.x + 14, r.y + 5, 116, 22, "#e9eef0"); rect(r.x + 14, r.y + 5, 116, 1, "#8a9a9a"); nx.fillStyle = "#c44"; for (let k = 0; k < 14; k++) { const px = r.x + 20 + k * 7, py = r.y + 22 - k * 0.9 - Math.sin(k * 0.9) * 3; rect(px, py, 3, 3, "#ffb02e"); } for (let k = 0; k < 6; k++) rect(r.x + 100 + k * 5, r.y + 24 - (k * 5) % 12 - 3, 3, 3 + (k * 5) % 12, k % 3 ? "#2ca66a" : "#c44"); tile(16, 0, r.x + 4, r.y + 110); tile(17, 0, r.x + 124, r.y + 110); tile(0, 9, r.x + 20, r.y + 100, 3, 2); },
    debate(r, t) { rect(r.x + 70, r.y + 38, 4, 90, "rgba(255,255,255,.12)"); rect(r.x + 18, r.y + 6, 2, 26, "#aaa"); rect(r.x + 20, r.y + 8, 22 + Math.sin(t * 3), 10, "#00f5a0"); rect(r.x + 106, r.y + 6, 2, 26, "#aaa"); rect(r.x + 82, r.y + 8, 24 - Math.sin(t * 3), 10, "#ff3d6b"); tile(3, 9, r.x + 56, r.y + 92, 2, 2); tile(16, 0, r.x + 4, r.y + 110); tile(17, 0, r.x + 124, r.y + 110); },
    backtest(r, t) { for (let i = 0; i < 3; i++) tile(19 + i, 17, r.x + 8 + i * 16, r.y + 8, 1, 1), tile(19 + i, 17, r.x + 8 + i * 16, r.y + 24 - 8, 1, 1); const cx = r.x + 160, cy = r.y + 70, on = view.st.backtest && view.st.backtest.status === "working"; nx.fillStyle = "#5ee6ff"; for (let a = 0; a < 24; a++) { const an = (a / 24) * 6.283; rect(cx + Math.cos(an) * 26, cy + Math.sin(an) * 26, 2, 2, a % 6 ? "#2a8ab8" : "#5ee6ff"); } const sp = on ? 4 : 0.3; for (const [len, k] of [[20, 1], [13, 0.12]]) for (let l = 2; l < len; l += 2) rect(cx + Math.cos(-t * sp * k) * l, cy + Math.sin(-t * sp * k) * l, 2, 2, "#5ee6ff"); rect(cx - 2, cy - 2, 4, 4, "#fff"); glowRect(cx - 30, cy - 30, 60, 60, "#5ee6ff", on ? 0.15 : 0.05); tile(0, 9, r.x + 100, r.y + 108, 3, 2); },
    risk(r, t) { const on = st("risk") === "working", cx = r.x + 52, cy = r.y + 74; rect(cx - 34, cy - 40, 68, 78, "#53463c"); rect(cx - 30, cy - 36, 60, 70, "#3a3028"); nx.fillStyle = "#888"; for (let a = 0; a < 32; a++) { const an = (a / 32) * 6.283; rect(cx + Math.cos(an) * 24, cy + Math.sin(an) * 24, 3, 3, "#aaa"); } rect(cx - 20, cy - 20, 40, 40, "#2a2a30"); for (let i = 0; i < 4; i++) { const an = i * 1.5708 + (on ? t : 0); for (let l = 0; l < 18; l += 3) rect(cx + Math.cos(an) * l, cy + Math.sin(an) * l, 3, 3, "#bbb"); } rect(cx - 4, cy - 4, 8, 8, "#ffb02e"); rect(cx - 30, cy - 36, 60, 2, r.hue); for (let i = 0; i < 4; i++) rect(r.x + 110 + i * 26, r.y + 6, 20, 22, "#1d1410"), rect(r.x + 112 + i * 26, r.y + 8, 16, 18, "#2a1d16"), rect(r.x + 118 + i * 26, r.y + 14, 4, 6, "#ff7a45"); },
    lib(r, t) { for (let i = 0; i < 4; i++) tile(19 + (i % 3), 17, r.x + 8 + i * 16, r.y + 8); rect(r.x + 120, r.y + 4, 90, 24, "#06100a"); rect(r.x + 122, r.y + 6, 86, 20, "#0c1c10"); const w = String(Math.round(view.wins || 0)).padStart(2, "0"), l = String(Math.round(view.losses || 0)).padStart(2, "0"); nx.fillStyle = "#9ad17a"; nx.font = "bold 14px monospace"; nx.textAlign = "center"; nx.fillText(w + " : " + l, r.x + 165, r.y + 22); tile(16, 0, r.x + 4, r.y + 108); tile(17, 0, r.x + 188, r.y + 108); },
    hub(r, t) {
      for (let i = 0; i < 3; i++) tile(19, 0, r.x + 20 + i * 100, r.y + 8); tile(22, 14, r.x + 270, r.y + 0, 1, 2);
      rect(r.x + 60, r.y + 6, 110, 24, "#0b1014"); rect(r.x + 62, r.y + 8, 106, 20, "#10202a"); const eqs = view.eq || [];
      if (eqs.length > 1) { const lo = Math.min(...eqs), hi = Math.max(...eqs) + 1e-9; eqs.forEach((v, i) => rect(r.x + 66 + (i / (eqs.length - 1)) * 98, r.y + 24 - ((v - lo) / (hi - lo + 1e-9)) * 12, 2, 2, "#ffe066")); } else rect(r.x + 70, r.y + 17, 90, 2, "#ffe06655");
      tile(3, 9, r.x + 100, r.y + 100, 2, 2); tile(16, 0, r.x + 8, r.y + 104); tile(17, 0, r.x + 296, r.y + 104); tile(0, 9, r.x + 160, r.y + 96, 3, 2);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + t * (view.running ? 0.8 : 0.1); rect(r.x + 134 + Math.cos(a) * 18, r.y + 118 + Math.sin(a) * 6, 3, 3, "#ffe066"); }
    },
  };
  function drawRoom(r, t) {
    floor(r); wallBand(r); DECOR[r.k] && DECOR[r.k](r, t);
    nx.strokeStyle = "#1a1420"; nx.lineWidth = 2; nx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    const ag = Object.keys(r.agents), working = r.k === "hub" ? view.running : ag.some((a) => st(a) === "working");
    if (working || hoverK === r.k) { nx.strokeStyle = r.hue; nx.lineWidth = 2; nx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); }
  }
  function person(c, t) {
    const a = c.id, walking = c.path.length > 0, w = st(a) === "working", sitting = !walking && !c.dest && !c.wait, im = cache[a]; if (!im) return;
    const bob = walking ? ((c.step | 0) % 2 ? -1 : 0) : sitting && w ? Math.round(Math.sin(t * 14 + c.phase) * 0.6) : 0, f = walking ? (c.step | 0) % 2 : (t * 1.2 + c.phase) % 3 < 0.15 ? 1 : 0;
    nx.fillStyle = "rgba(0,0,0,.3)"; nx.fillRect(Math.round(c.x) - 6, Math.round(c.y) - 1, 12, 3);
    nx.save(); nx.translate(Math.round(c.x), Math.round(c.y) + bob); if (c.face < 0) nx.scale(-1, 1); nx.drawImage(im[f], -8, -16); nx.restore();
    if (c.carry) { rect(Math.round(c.x) + (c.face > 0 ? 5 : -10), Math.round(c.y) - 8 + bob, 6, 8, "#f4f4ee"); rect(Math.round(c.x) + (c.face > 0 ? 6 : -9), Math.round(c.y) - 6 + bob, 4, 1, "#99a"); }
  }
  // ---------- DOM overlay ----------
  const mk = (cls, parent) => { const e = document.createElement("div"); e.className = cls; parent.append(e); return e; };
  function buildOverlay() {
    ov = mk("fl-ov", cv.parentNode);
    for (const k in R) { const p = mk("fl-plate", ov); p.style.setProperty("--h", R[k].hue); p.innerHTML = '<i></i><span></span>'; p.lastChild.textContent = NAME[k]; els.plate[k] = p; }
    for (const a of agents) { const t = mk("fl-tag", ov); t.style.setProperty("--h", HUE[a]); t.textContent = AGN[a]; els.tag[a] = t; const b = mk("fl-bub", ov); b.style.setProperty("--h", HUE[a]); b.innerHTML = '<em></em><span></span>'; b.classList.add("off"); els.bub[a] = b; }
    els.stamp = mk("fl-vstamp", ov); els.stamp.textContent = "VETO";
  }
  const EMO = ["💻", "💬", "💡"];
  function overlay(S, ox, oy, t) {
    const now = performance.now() / 1000, put = (e, x, y) => { e.style.transform = "translate(" + Math.round(ox + x * S) + "px," + Math.round(oy + y * S) + "px)"; };
    for (const k in R) { const r = R[k], ag = Object.keys(r.agents), sc = ag.some((a) => st(a) === "error") ? "err" : (k === "hub" ? view.running : ag.some((a) => st(a) === "working")) ? "work" : ag.some((a) => st(a) === "done") ? "done" : ""; els.plate[k].className = "fl-plate " + sc + (hoverK === k ? " hot" : ""); put(els.plate[k], r.x + 6, r.y + 3); }
    for (const a of agents) {
      const c = chars[a], tg = els.tag[a], b = els.bub[a], q = bubbles[a], s = st(a);
      put(tg, c.x, c.y + 3); tg.className = "fl-tag " + s + (cam.follow === a ? " follow" : "");
      let emo = s === "working" ? EMO[((t * 0.8 + c.phase) | 0) % 3] : s === "done" ? "✓" : s === "error" ? "⚠" : ""; if (c.carry) emo = "📄";
      if (q && now - q.born > 7) { delete bubbles[a]; }
      const qq = bubbles[a];
      if (qq) { const age = now - qq.born, tx = qq.text.length > 120 ? qq.text.slice(0, 119) + "…" : qq.text; if (b._t !== tx) { b._t = tx; b.lastChild.textContent = tx; } b.firstChild.textContent = emo; b.className = "fl-bub" + (qq.kind === "veto" ? " veto" : "") + (age > 6 ? " fade" : ""); put(b, c.x, c.y < 90 ? c.y + 38 : c.y - 22); b.classList.toggle("below", c.y < 90); }
      else if (emo) { if (b._t !== "") { b._t = ""; b.lastChild.textContent = ""; } b.firstChild.textContent = emo; b.className = "fl-bub emo"; put(b, c.x, c.y - 22); } else b.className = "fl-bub off";
    }
    const rk = R.risk; put(els.stamp, rk.x + 60, rk.y + 60);
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame); if (document.hidden || !shown() || !sheets.indoor || !cache.market) { t0 = 0; return; }
    const now = ts / 1000; if (!t0) t0 = now; const dt = Math.min(0.1, now - t0); t0 = now, t = now;
    if (!cssW) return;
    if (cam.follow && chars[cam.follow]) { cam.tx = chars[cam.follow].x; cam.ty = chars[cam.follow].y - 10; }
    const k = 1 - Math.exp(-dt * 6); cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; cam.z += (cam.tz - cam.z) * k;
    nx.fillStyle = "#0c0f14"; nx.fillRect(0, 0, NW, NH);
    rect(0, 112, NW, 32, "#2b2c36"); rect(0, 272, NW, 32, "#2b2c36"); for (let x = 0; x < NW; x += 16) { rect(x, 112, 1, 32, "#24252e"); rect(x, 272, 1, 32, "#24252e"); } rect(0, 127, NW, 2, "#3a3b48"); rect(0, 287, NW, 2, "#3a3b48");
    rect(144, 216, 16, 32, "#2b2c36"); rect(480, 216, 16, 32, "#2b2c36"); rect(208, 144, 32, 32, "#2b2c36"); rect(208, 240, 32, 32, "#2b2c36");
    Object.values(R).forEach((r) => drawRoom(r, now));
    for (const a in chars) updateChar(chars[a], dt);
    const items = []; for (const a of agents) { const c = chars[a], s = seatOf(a), home = !c.path.length && !c.dest && roomOf(a) === c.loc; if (a !== "bull" && a !== "bear") items.push({ y: s.y + 20, f: () => deskAt(s, a, now) }); else items.push({ y: s.y + 20, f: () => { tile(0, 0, s.x - 24, s.y - 1, 3, 2); monitor(s.x - 21, s.y - 5, HUE[a], st(a) === "working", now, s.x); } }); items.push({ y: home ? s.y - 1 : c.y, f: () => person(c, now) }); }
    items.sort((p, q) => p.y - q.y).forEach((i) => i.f());
    const bu = chars.bull, be = chars.bear; if (!bu.path.length && !bu.dest) bu.face = 1; if (!be.path.length && !be.dest) be.face = -1;
    const base = Math.min(cssW / NW, cssH / NH), S0 = base * cam.z, S = S0 >= 2 ? Math.floor(S0) : S0, ox = Math.round(cssW / 2 - cam.x * S), oy = Math.round(cssH / 2 - cam.y * S);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.fillStyle = "#05090b"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(nat, 0, 0, NW, NH, Math.round(ox * dpr), Math.round(oy * dpr), Math.round(NW * S * dpr), Math.round(NH * S * dpr));
    cam.S = S; cam.ox = ox; cam.oy = oy; overlay(S, ox, oy, now);
  }
  let t = 0;
  function resize() { const p = cv.parentNode, w = p.clientWidth, h = p.clientHeight; if (!w || !h) return; cssW = w; cssH = h; dpr = window.devicePixelRatio || 1; cv.style.width = w + "px"; cv.style.height = h + "px"; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const toWorld = (ev) => { const b = cv.getBoundingClientRect(); return { x: (ev.clientX - b.left - cam.ox) / cam.S, y: (ev.clientY - b.top - cam.oy) / cam.S }; };
  function hit(ev) { if (!cam.S) return {}; const p = toWorld(ev); let who = ""; for (const a of agents) { const c = chars[a]; if (Math.abs(p.x - c.x) < 9 && p.y > c.y - 18 && p.y < c.y + 3) who = a; } const r = Object.values(R).find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h); return { room: r ? r.k : who ? roomOf(who) : "", who }; }
  function focus(k, who) { cam.follow = who || ""; if (!k && !who) { cam.tx = NW / 2; cam.ty = NH / 2; cam.tz = 1; return; } if (who) { cam.tz = 2.6; return; } const r = R[k]; cam.tx = r.x + r.w / 2; cam.ty = r.y + r.h / 2; cam.tz = Math.min(3, Math.min(NW / r.w, NH / r.h) * 0.9); }
  function init(canvas, opts) {
    cv = canvas; ctx = cv.getContext("2d"); nat = document.createElement("canvas"); nat.width = NW; nat.height = NH; nx = nat.getContext("2d"); nx.imageSmoothingEnabled = false;
    shown = opts.shown || shown; mkChars(); buildOverlay(); resize(); new ResizeObserver(resize).observe(cv.parentNode); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    cv.addEventListener("mousemove", (e) => { const h = hit(e); hoverK = h.room; cv.style.cursor = h.room ? "pointer" : "default"; opts.onHover && opts.onHover(h.room, e); });
    cv.addEventListener("mouseleave", () => { hoverK = ""; opts.onHover && opts.onHover("", null); });
    cv.addEventListener("click", (e) => { const h = hit(e); opts.onClick && opts.onClick(h.room, e, h.who); });
  }
  return { init, trigger, reset, focus, setView: (v) => Object.assign(view, v), agentsOf: (k) => Object.keys(R[k].agents), NAME, HUE, roomOf };
})();
