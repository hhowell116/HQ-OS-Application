// Trading Floor office: a cutaway 2D office drawn entirely in canvas (original vector/pixel art, no assets).
// Rooms are themed per agent, linked by corridors to the Lead's glass hub. Characters sit at desks, type, and walk to hand work off.
window.FloOffice = (function () {
  const W = 1000, H = 640, HUE = { market: "#4aa8ff", news: "#b58cff", sentiment: "#ff8fd0", analyst: "#ffb02e", bull: "#00f5a0", bear: "#ff3d6b", backtest: "#5ee6ff", risk: "#ff7a45", lead: "#ffe066", score: "#9ad17a", reflect: "#c0a0ff", steady: "#6fd36f" };
  const NAME = { market: "MARKET DATA", news: "NEWS & POLICY", sentiment: "SENTIMENT", analyst: "ANALYST", debate: "BULL VS BEAR", backtest: "BACKTESTER", risk: "RISK MANAGER", lib: "SCORE & REFLECT", steady: "STEADY", hub: "LEAD" };
  const G = { x: 545, y: 345 }, J = { x: 430, y: 335 };
  // rooms: key, rect, agents with seat offsets, exit waypoints toward the hub junction J
  const R = {}; const room = (k, x, y, w, h, hue, floor, agents, exits) => (R[k] = { k, x, y, w, h, hue, floor, agents, exits });
  const top = (k, x, hue, fl, ag) => room(k, x, 10, 230, 170, hue, fl, ag, (s) => [{ x: s.x + 30, y: s.y + 6 }, { x: x + 115, y: 168 }, { x: x + 115, y: 195 }, { x: 430, y: 195 }, J]);
  const bot = (k, x, w, hue, fl, ag) => room(k, x, 440, w, 190, hue, fl, ag, (s) => [{ x: s.x + 30, y: s.y + 6 }, { x: x + w / 2, y: 458 }, { x: x + w / 2, y: 425 }, { x: 430, y: 425 }, J]);
  top("market", 10, HUE.market, "#0b1a2a", { market: { x: 125, y: 98 } });
  top("news", 260, HUE.news, "#1a1228", { news: { x: 375, y: 98 } });
  top("sentiment", 510, HUE.sentiment, "#27121f", { sentiment: { x: 625, y: 98 } });
  top("steady", 760, HUE.steady, "#102418", { steady: { x: 875, y: 98 } });
  room("analyst", 10, 210, 230, 200, HUE.analyst, "#2a1f0b", { analyst: { x: 125, y: 300 } }, (s) => [{ x: s.x + 30, y: s.y + 20 }, { x: 238, y: 320 }, { x: 262, y: 320 }, J]);
  room("debate", 760, 210, 230, 200, HUE.bull, "#14201c", { bull: { x: 835, y: 305 }, bear: { x: 915, y: 305 } }, (s) => [{ x: s.x - 20, y: 340 }, { x: 762, y: 320 }, { x: 738, y: 320 }, J]);
  bot("backtest", 10, 313, HUE.backtest, "#0a2128", { backtest: { x: 166, y: 540 } });
  bot("risk", 343, 313, HUE.risk, "#2a140c", { risk: { x: 500, y: 540 } });
  bot("lib", 677, 313, HUE.score, "#162410", { score: { x: 770, y: 540 }, reflect: { x: 895, y: 540 } });
  room("hub", 260, 210, 480, 200, HUE.lead, "#241f0a", { lead: { x: 610, y: 270 } }, () => []);
  R.hub.seatOnly = true;
  const roomOf = (a) => (a === "score" || a === "reflect" ? "lib" : a === "bull" || a === "bear" ? "debate" : a === "lead" ? "hub" : a);
  const visitSpot = (k, a) => { if (k === "hub") return G; const s = seatOf(a || k); return k === "debate" ? { x: 875, y: 350 } : { x: s.x + 46, y: s.y + 22 }; };
  function seatOf(a) { const r = R[roomOf(a)]; return r.agents[a] || Object.values(r.agents)[0]; }
  // path between two (room, spot) pairs, cancelling shared stretches of corridor
  function route(k, spot, agentForSeat) { const r = R[k]; if (k === "hub") return [spot, J]; return [spot, ...r.exits(agentForSeat ? seatOf(agentForSeat) : spot)]; }
  const eq = (a, b) => a.x === b.x && a.y === b.y;
  function pathTo(fromK, fromSpot, toK, toSpot, fa, ta) {
    let a = route(fromK, fromSpot, fa), b = route(toK, toSpot, ta);
    if (fromK === toK) return [toSpot];
    while (a.length > 2 && b.length > 2 && eq(a[a.length - 1], b[b.length - 1]) && eq(a[a.length - 2], b[b.length - 2])) { a.pop(); b.pop(); }
    const p = [...a, ...b.reverse()], o = [];
    for (const q of p) if (!o.length || !eq(o[o.length - 1], q)) o.push(q);
    return o.slice(1);
  }
  const SKIN = ["#f1c9a5", "#d9a27a", "#a8714f", "#ffe0bd", "#8d5a3b", "#e8b98f"];
  const HAIR = { market: "#2a2a2a", news: "#7a3a1a", sentiment: "#e9d36a", analyst: "#444", bull: "#3b2a1a", bear: "#222", backtest: "#9a9a9a", risk: "#5a2a2a", lead: "#cfcfcf", score: "#1a1a2e", reflect: "#7a5a9a", steady: "#c9a86a" };
  const chars = {}; let ctx, cv, cssW = 1, cssH = 1, dpr = 1, raf = 0, t0 = 0, view = { st: {}, veto: null, running: false, tape: [] };
  let bubbles = {}, stamp = { t: -99, txt: "" }, anim = -1, shown = () => true, hoverK = "";
  const agents = Object.keys(HUE).filter((k) => k !== "debate");
  function mkChars() { agents.forEach((a, i) => { const s = seatOf(a); chars[a] = { id: a, x: s.x, y: s.y, path: [], q: [], loc: roomOf(a), wait: 0, face: 1, skin: SKIN[i % SKIN.length], carry: 0, step: 0, phase: i * 1.7 }; }); }

  function trigger(e, snapMode) {
    if (!e) return;
    const a = e.agent === "debate" ? "" : e.agent;
    if (e.text && e.kind !== "start" || (e.kind === "start" && e.text && e.text.length > 6)) { const who = a || "bear"; bubbles[who] = { text: e.text, born: performance.now() / 1000, kind: e.kind }; if (e.agent === "debate") bubbles.bull = bubbles.bull; }
    if (e.kind === "veto") stamp = { t: performance.now() / 1000, txt: "VETO" };
    if (snapMode || !a || !chars[a]) return;
    if (e.kind === "done" && e.to && R[roomOf(e.to)] && roomOf(e.to) !== roomOf(a)) chars[a].q.push({ to: e.to });
  }
  function reset() { bubbles = {}; stamp = { t: -99 }; for (const a in chars) { const c = chars[a], s = seatOf(a); c.x = s.x; c.y = s.y; c.path = []; c.q = []; c.loc = roomOf(a); c.wait = 0; c.carry = 0; } }
  function updateChar(c, dt) {
    if (c.path.length) {
      const p = c.path[0], dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy), sp = 95 * dt;
      if (d <= sp) { c.x = p.x; c.y = p.y; c.path.shift(); if (!c.path.length) c.wait = c.dest ? 1.6 : 0; } else { c.x += (dx / d) * sp; c.y += (dy / d) * sp; c.step += dt * 9; }
      if (Math.abs(dx) > 0.5) c.face = dx > 0 ? 1 : -1; return;
    }
    if (c.wait > 0) { c.wait -= dt; if (c.wait <= 0 && c.dest) { c.dest = null; c.carry = 0; c.back = true; const s = seatOf(c.id); c.path = pathTo(c.loc, { x: c.x, y: c.y }, roomOf(c.id), s, null, c.id); c.loc = roomOf(c.id); } return; }
    if (c.q.length) { const j = c.q.shift(), k = roomOf(j.to); c.path = pathTo(c.loc, { x: c.x, y: c.y }, k, visitSpot(k, j.to), c.loc === roomOf(c.id) ? c.id : null, j.to); c.dest = k; c.loc = k; c.carry = 1; }
  }

  // ---------- drawing helpers ----------
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const rr = (x, y, w, h, r, fill, stroke, lw) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.stroke(); } };
  const txt = (s, x, y, c, sz, al, w) => { ctx.font = (w || 700) + " " + (sz || 9) + "px Consolas, monospace"; ctx.fillStyle = c; ctx.textAlign = al || "left"; ctx.fillText(s, x, y); };
  const glow = (c, b) => { ctx.shadowColor = c; ctx.shadowBlur = b; }; const noGlow = () => { ctx.shadowBlur = 0; };
  const wrap = (s, max, fs) => { ctx.font = "600 " + fs + "px Consolas, monospace"; const out = []; let line = ""; for (const w of String(s).split(/\s+/)) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; };
  const st = (a) => (view.st[a] && view.st[a].status) || "idle";

  function drawRoom(r, t) {
    rr(r.x, r.y, r.w, r.h, 6, r.floor, "rgba(255,255,255,.14)", 2);
    ctx.save(); ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.clip();
    for (let yy = r.y + r.h * 0.4; yy < r.y + r.h; yy += 18) for (let xx = r.x + (((yy / 18) | 0) % 2) * 18; xx < r.x + r.w; xx += 36) rect(xx, yy, 18, 18, "rgba(255,255,255,.025)");
    rect(r.x, r.y, r.w, r.h * 0.4, "rgba(0,0,0,.28)"); rect(r.x, r.y + r.h * 0.4 - 2, r.w, 3, r.hue + "55");
    const working = r.k === "hub" ? view.running : ["x"].concat(Object.keys(r.agents)).some((a) => st(a) === "working");
    DECOR[r.k] && DECOR[r.k](r, t, working);
    ctx.restore();
    const hot = hoverK === r.k;
    if (hot || working) { glow(r.hue, working ? 14 : 8); rr(r.x, r.y, r.w, r.h, 6, null, r.hue + (hot ? "ff" : "99"), 2); noGlow(); }
    const nm = NAME[r.k], bw = nm.length * 6.2 + 26; rr(r.x + 8, r.y + 6, bw, 15, 3, "rgba(0,0,0,.72)", r.hue + "88", 1);
    const ag = Object.keys(r.agents), sc = ag.some((a) => st(a) === "error") ? "#ff3d6b" : ag.some((a) => st(a) === "working") ? "#ffb02e" : ag.every((a) => st(a) === "done") ? "#00f5a0" : "#3a4a44";
    ctx.beginPath(); ctx.arc(r.x + 17, r.y + 13.5, 3, 0, 7); ctx.fillStyle = sc; glow(sc, 6); ctx.fill(); noGlow(); txt(nm, r.x + 25, r.y + 17, "#e8f0ec", 9);
  }
  const screen = (x, y, w, h, c, t, rows, on) => { rr(x, y, w, h, 2, "#050a0c", "#2a3a38", 1); if (!on) { rect(x + 2, y + 2, w - 4, h - 4, "#0a1213"); return; } glow(c, 8); for (let i = 0; i < rows; i++) { const ww = (w - 8) * (0.3 + 0.7 * Math.abs(Math.sin(i * 2.1 + t * 1.3 + x))); rect(x + 3, y + 3 + i * ((h - 6) / rows), ww, Math.max(1.5, (h - 6) / rows - 2), c + "bb"); } noGlow(); };
  const DECOR = {
    market(r, t, on) { const sy = ["SPY", "QQQ", "NVDA", "TSLA", "AAPL", "BTC"], tp = view.tape && view.tape.length ? view.tape : []; for (let i = 0; i < 6; i++) { const x = r.x + 10 + i * 36, y = r.y + 30, q = tp[i % Math.max(1, tp.length)], up = q ? q.chg >= 0 : Math.sin(i + t * (on ? 1.5 : 0.3)) > 0, c = up ? "#00f5a0" : "#ff3d6b"; rr(x, y, 32, 34, 2, "#050a0c", "#2a3a38", 1); txt(q ? q.s.slice(0, 5) : sy[i], x + 16, y + 11, "#9fb5ac", 7, "center"); glow(c, 6); txt(q ? (q.chg > 0 ? "+" : "") + q.chg + "%" : (up ? "+" : "-") + (1 + ((i * 7) % 5) * 0.3).toFixed(1) + "%", x + 16, y + 22, c, 8, "center"); noGlow(); ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0; k < 8; k++) { const px = x + 3 + k * 3.7, py = y + 31 - (up ? k : 7 - k) * 0.7 - Math.sin(k * 1.3 + i + (on ? t * 2 : 0)) * 1.5; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); } },
    news(r, t, on) { for (let i = 0; i < 3; i++) { const x = r.x + 12 + i * 70, y = r.y + 30; rr(x, y, 64, 40, 3, "#06080f", "#3a3a5a", 1); rect(x + 3, y + 3, 58, 24, ["#1d3a6a", "#4a2a2a", "#2a4a3a"][i]); glow("#b58cff", 6); rect(x + 6, y + 8 + (on ? Math.sin(t * 2 + i) * 2 : 0), 24, 12, "#b58cffaa"); noGlow(); rect(x + 3, y + 30, 58, 6, "#c33"); txt("LIVE", x + 6, y + 36, "#fff", 5); const sc = ((t * 25 + i * 20) % 90); rect(x + 3, y + 30, 0, 0, "#fff"); ctx.save(); ctx.beginPath(); ctx.rect(x + 20, y + 30, 41, 6); ctx.clip(); txt("BREAKING " + "· POLICY ".repeat(3), x + 62 - sc * 2, y + 36, "#fff", 5); ctx.restore(); } },
    sentiment(r, t, on) { const ic = ["♥", "☺", "★", "✉", "↑"]; for (let i = 0; i < 4; i++) { const x = r.x + 16 + i * 52, y = r.y + 30; rr(x, y, 28, 46, 5, "#111", "#ff8fd0", 1); rect(x + 3, y + 6, 22, 34, "#1b0f18"); txt(ic[i], x + 14, y + 22, "#ff8fd0", 12, "center"); } if (on || true) for (let i = 0; i < 5; i++) { const k = (t * 0.35 + i * 0.2) % 1; ctx.globalAlpha = 1 - k; txt(ic[i % 5], r.x + 30 + i * 42 + Math.sin(t + i) * 5, r.y + 90 - k * 38, "#ff8fd0", 10, "center"); ctx.globalAlpha = 1; } },
    analyst(r, t, on) { rr(r.x + 12, r.y + 32, 206, 92, 3, "#e9eef0", "#8a9a9a", 2); ctx.strokeStyle = "#ffb02e"; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < 20; k++) { const px = r.x + 24 + k * 9, py = r.y + 100 - k * 2.2 - Math.sin(k * 0.9) * 10 - Math.sin(k * 2.1) * 4; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); for (let k = 0; k < 8; k++) { const px = r.x + 130 + k * 10, h = 10 + ((k * 13) % 17), up = k % 3 !== 0; rect(px, r.y + 118 - h, 6, h, up ? "#2ca66a" : "#c44"); } txt("ANALYSIS", r.x + 20, r.y + 46, "#445", 8); if (on) { ctx.beginPath(); ctx.arc(r.x + 28 + ((t * 40) % 180), r.y + 62, 3, 0, 7); ctx.fillStyle = "#c33"; ctx.fill(); } },
    debate(r, t, on) { rect(r.x + 114, r.y + 28, 2, r.h - 40, "rgba(255,255,255,.12)"); const f = (x, c, tx) => { rect(x, r.y + 28, 2, 38, "#999"); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x + 2, r.y + 30); ctx.lineTo(x + 30 + Math.sin(t * 3 + x) * 2, r.y + 38); ctx.lineTo(x + 2, r.y + 48); ctx.fill(); txt(tx, x + 14, r.y + 43, "#041", 8, "center"); }; f(r.x + 24, "#00f5a0", "▲"); f(r.x + 176, "#ff3d6b", "▼"); for (const [x, c] of [[r.x + 50, "#00f5a0"], [r.x + 160, "#ff3d6b"]]) { rr(x, r.y + 130, 30, 40, 3, "#2a3a34", c + "99", 1); } if (on) { txt("VS", r.x + 115, r.y + 130, "#fff", 12, "center"); } },
    backtest(r, t, on) { for (let i = 0; i < 6; i++) { rr(r.x + 12 + i * 20, r.y + 30, 17, 56, 2, "#102a30", "#5ee6ff55", 1); rect(r.x + 15 + i * 20, r.y + 36, 11, 3, "#5ee6ff"); rect(r.x + 15 + i * 20, r.y + 50, 11, 3, "#5ee6ff88"); } const cx = r.x + 235, cy = r.y + 78; glow("#5ee6ff", on ? 16 : 4); ctx.beginPath(); ctx.arc(cx, cy, 40, 0, 7); ctx.strokeStyle = "#5ee6ff"; ctx.lineWidth = 3; ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 30, 0, 7); ctx.lineWidth = 1; ctx.stroke(); noGlow(); const sp = on ? 4 : 0.3; for (const [len, k] of [[26, 1], [18, 0.12]]) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(-t * sp * k) * len, cy + Math.sin(-t * sp * k) * len); ctx.lineWidth = 2; ctx.stroke(); } for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; rect(cx + Math.cos(a) * 36 - 1, cy + Math.sin(a) * 36 - 1, 2, 2, "#5ee6ff"); } txt("◄◄ 2019 → 2024", cx, cy + 56, "#5ee6ff", 8, "center"); },
    risk(r, t, on) { const cx = r.x + 60, cy = r.y + 88; rr(cx - 46, cy - 52, 92, 100, 6, "#3a2a22", "#ff7a45", 2); ctx.beginPath(); ctx.arc(cx, cy, 30, 0, 7); ctx.fillStyle = "#222"; ctx.fill(); ctx.strokeStyle = "#aaa"; ctx.lineWidth = 3; ctx.stroke(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + (on ? t * 0.8 : 0); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24); ctx.strokeStyle = "#888"; ctx.lineWidth = 2; ctx.stroke(); } ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 7); ctx.fillStyle = "#ffb02e"; ctx.fill(); for (let i = 0; i < 4; i++) rect(r.x + 130 + i * 44, r.y + 40, 34, 40, "#1d1410"), rr(r.x + 130 + i * 44, r.y + 40, 34, 40, 2, null, "#ff7a4577", 1), txt("$", r.x + 147 + i * 44, r.y + 66, "#ff7a45aa", 16, "center"); const ls = [["RISK 1%", "#ffb02e"], ["MIN CONF 60", "#9fb5ac"]]; ls.forEach(([s, c], i) => txt(s, r.x + 132, r.y + 100 + i * 12, c, 8)); },
    lib(r, t, on) { for (let i = 0; i < 9; i++) { const x = r.x + 10 + i * 17; for (let j = 0; j < 2; j++) rect(x, r.y + 30 + j * 30, 13, 26, ["#5a7a3a", "#7a5a9a", "#3a6a7a", "#9a6a3a"][(i + j * 2) % 4]); } rect(r.x + 8, r.y + 58, 160, 2, "#775"); rect(r.x + 8, r.y + 88, 160, 2, "#775"); rr(r.x + 190, r.y + 30, 112, 52, 3, "#06100a", "#9ad17a", 1); txt("SCOREBOARD", r.x + 246, r.y + 43, "#9ad17a", 8, "center"); glow("#9ad17a", 6); txt(String(Math.round(view.wins || 0)).padStart(2, "0") + " : " + String(Math.round(view.losses || 0)).padStart(2, "0"), r.x + 246, r.y + 70, "#9ad17a", 20, "center"); noGlow(); },
    steady(r, t) { rect(r.x, r.y, r.w, r.h * 0.4, "rgba(111,211,111,.10)"); for (let i = 0; i < 5; i++) { const x = r.x + 20 + i * 44; for (let k = 0; k < 4; k++) { const sw = Math.sin(t * 0.6 + i + k) * 3; ctx.strokeStyle = "#3aa85a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, r.y + 78); ctx.quadraticCurveTo(x + sw, r.y + 62 - k * 3, x + (k - 1.5) * 8 + sw, r.y + 46 - k * 4); ctx.stroke(); } rr(x - 9, r.y + 76, 18, 12, 2, "#8a5a3a"); } for (let i = 0; i < 8; i++) { ctx.globalAlpha = 0.5; rect(r.x + 8 + i * 28, r.y + 22, 1, 100, "rgba(200,255,220,.25)"); ctx.globalAlpha = 1; } txt("slow & steady", r.x + r.w - 12, r.y + 19, "#6fd36f99", 8, "right"); const k = (t * 0.1) % 1; rect(r.x + 10 + k * 200, r.y + 150, 6, 4, "#6fd36f"); },
    hub(r, t, on) { for (let i = 0; i < 7; i++) rect(r.x + 8 + i * 68, r.y + 2, 1, r.h - 4, "rgba(255,255,255,.06)"); rr(r.x + 20, r.y + 30, 150, 50, 3, "#050a0c", "#ffe06688", 1); const eq = view.eq || []; if (eq.length > 1) { const lo = Math.min(...eq), hi = Math.max(...eq) + 1e-9; ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 1.5; ctx.beginPath(); eq.forEach((v, i) => { const x = r.x + 26 + (i / (eq.length - 1)) * 138, y = r.y + 74 - ((v - lo) / (hi - lo + 1e-9)) * 36; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); } else txt("PAPER BOOK", r.x + 95, r.y + 60, "#ffe06699", 9, "center"); const cx = r.x + 150, cy = r.y + 160; ctx.beginPath(); ctx.ellipse(cx, cy, 70, 28, 0, 0, 7); ctx.fillStyle = "#2a2410"; ctx.fill(); ctx.strokeStyle = "#ffe06666"; ctx.lineWidth = 2; ctx.stroke(); glow("#ffe066", 10); ctx.beginPath(); ctx.ellipse(cx, cy - 8, 36, 10, 0, 0, 7); ctx.strokeStyle = "#ffe066" + (on ? "dd" : "66"); ctx.stroke(); noGlow(); for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + t * (on ? 0.8 : 0.1); rect(cx + Math.cos(a) * 36 - 2, cy - 8 + Math.sin(a) * 10 - 6 - (on ? 2 : 0), 4, 6, "#ffe066aa"); } rr(r.x + 440, r.y + 40, 30, 130, 2, "rgba(150,220,255,.07)", "rgba(150,220,255,.3)", 1); rr(r.x + 6, r.y + 6, r.w - 12, r.h - 12, 6, null, "rgba(150,220,255,.18)", 3); }
  };

  function desk(a, t) {
    const s = seatOf(a), c = chars[a], col = HUE[a], work = st(a) === "working", away = c.path.length || c.dest;
    if (a === "bull" || a === "bear") { return; }
    rr(s.x - 24, s.y + 10, 48, 15, 2, "#3d3226", "#6a5a46", 1); rect(s.x - 22, s.y + 22, 44, 5, "#241c14");
    const mx = s.x - 11, my = s.y - 5;
    rr(mx, my, 22, 16, 2, "#0a0f10", work ? col : "#2a3a38", 1); rect(mx + 9, my + 16, 4, 4, "#555");
    if (work) { glow(col, 10); for (let i = 0; i < 4; i++) rect(mx + 2, my + 2 + i * 3.4, 4 + ((Math.sin(t * 3 + i * 1.7 + s.x) + 1) * 7), 1.6, col); noGlow(); } else if (st(a) === "done") txt("✓", mx + 11, my + 13, "#00f5a0", 11, "center"); else rect(mx + 2, my + 2, 18, 12, "#0e1a1a");
    if (a === "lead") { rr(s.x - 40, s.y + 8, 80, 18, 2, "#4a3a1a", "#ffe066", 1); }
  }
  // person: sitting (behind desk) or walking. unit = 2 world px
  function person(c, t) {
    const a = c.id, col = HUE[a], walking = c.path.length > 0, sit = !walking && !c.dest && !c.wait, u = 2, hair = HAIR[a] || "#333", w = st(a) === "working";
    const bob = walking ? Math.abs(Math.sin(c.step)) * 1.5 : sit && w ? Math.sin(t * 14 + c.phase) * 0.5 : Math.sin(t * 1.5 + c.phase) * 0.4;
    ctx.save(); ctx.translate(Math.round(c.x), Math.round(c.y - bob)); if (c.face < 0) ctx.scale(-1, 1);
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(0, 12 * (sit ? 1 : 1.4) + bob, 9, 3, 0, 0, 7); ctx.fill();
    const px = (x, y, w2, h2, k) => { ctx.fillStyle = k; ctx.fillRect(x * u, y * u, w2 * u, h2 * u); };
    if (!sit) { const l = Math.sin(c.step) * 1.4; px(-3, 3 + (walking ? 0 : 0), 2.4, 5 + l * 0.4, "#223"); px(0.6, 3, 2.4, 5 - l * 0.4, "#223"); px(-3.4, 7.6 + l * 0.4, 3, 1.4, "#111"); px(0.6, 7.6 - l * 0.4, 3, 1.4, "#111"); }
    px(-4, -3, 8, 7, col); px(-4, -3, 8, 1.4, "rgba(255,255,255,.28)");
    if (a === "lead") { px(-0.7, -3, 1.4, 6, "#7a1a1a"); px(-4, -3, 1.6, 7, "#2a2a3a"); px(2.4, -3, 1.6, 7, "#2a2a3a"); }
    if (a === "market") px(-0.7, -3, 1.4, 5, "#fff"); if (a === "score") { px(-2, -3, 1.6, 1.6, "#a22"); px(0.4, -3, 1.6, 1.6, "#a22"); }
    if (a === "reflect") px(-4, -3, 8, 1.8, "#7a5aa0"); if (a === "risk") px(-3, -2, 2.2, 2.6, "#ffd24a");
    const armY = sit && w ? -1 + Math.sin(t * 16 + c.phase) * 0.8 : sit ? 0 : -1 + Math.sin(c.step) * 0.8; px(-5.6, armY, 1.8, 4, col); px(3.8, armY, 1.8, 4, col);
    if (c.carry) { px(3.6, armY + 1, 4, 5, "#f4f4f0"); px(4.2, armY + 2.2, 2.6, 0.6, "#99a"); px(4.2, armY + 3.6, 2.6, 0.6, "#99a"); }
    px(-3, -9, 6, 6, c.skin); px(-3.4, -10, 6.8, 2.4, hair); px(-3.4, -10, 1.4, 5, hair);
    px(-1.6, -6.4, 1, 1, "#111"); px(1, -6.4, 1, 1, "#111"); if (w && Math.sin(t * 3 + c.phase) > 0.92) px(-1.6, -6.4, 4, 1, c.skin);
    switch (a) {
      case "market": px(-3.6, -10.6, 7.2, 1.6, "#1a6a3a"); px(-3.6, -9.6, 9, 1, "#1a6a3a"); break;
      case "news": px(-3.8, -8, 1.2, 3, "#222"); px(-3.8, -5.2, 3.6, 1, "#222"); break;
      case "sentiment": px(-3.6, -11, 7.2, 2.6, "#ff8fd0"); px(-0.8, -12.4, 1.6, 1.6, "#fff"); break;
      case "analyst": px(-3.2, -7, 2.6, 2, "#111"); px(0.6, -7, 2.6, 2, "#111"); px(-0.6, -6.6, 1.2, 0.6, "#111"); break;
      case "bull": px(-4.6, -11.4, 1.6, 2.6, "#fff"); px(3, -11.4, 1.6, 2.6, "#fff"); px(-3.4, -10, 6.8, 1.2, "#0a8"); break;
      case "bear": px(-4, -11.8, 2.4, 2.4, "#6a3a1a"); px(1.6, -11.8, 2.4, 2.4, "#6a3a1a"); break;
      case "backtest": px(-3.6, -8, 7.2, 2, "#5ee6ff"); px(-3.6, -8, 7.2, 0.5, "#fff"); break;
      case "risk": px(-3.8, -11.6, 7.6, 3, "#ffd24a"); px(-4.4, -9, 8.8, 1, "#ffd24a"); break;
      case "lead": px(-3, -12.8, 1.4, 2.4, "#ffe066"); px(-0.7, -13.6, 1.4, 3.2, "#ffe066"); px(1.6, -12.8, 1.4, 2.4, "#ffe066"); px(-3, -10.6, 6, 1, "#ffe066"); break;
      case "score": px(-3.6, -4, 7.2, 1.2, "#9ad17a"); break;
      case "steady": px(-5, -9.8, 10, 1.4, "#e6c76a"); px(-3, -12, 6, 2.4, "#e6c76a"); break;
    }
    ctx.restore();
  }
  function bubble(a, t) {
    const b = bubbles[a]; if (!b) return; const now = performance.now() / 1000, age = now - b.born, ttl = 7; if (age > ttl) { delete bubbles[a]; return; }
    const c = chars[a], text = b.text.length > 110 ? b.text.slice(0, 109) + "…" : b.text, ln = wrap(text, 128, 8.5).slice(0, 4), bw = 140, bh = ln.length * 10.5 + 8;
    let x = c.x - bw / 2, y = c.y - 34 - bh; const r = R[roomOf(a)];
    x = Math.max(r.x + 2, Math.min(r.x + r.w - bw - 2, x)); if (y < r.y + 24) y = c.y + 22; y = Math.max(r.y + 24, y);
    ctx.globalAlpha = Math.min(1, (ttl - age) * 2, age * 6 + 0.2); const col = b.kind === "veto" ? "#ff3d6b" : HUE[a];
    rr(x, y, bw, bh, 4, "rgba(6,10,12,.94)", col, 1.2); ctx.beginPath(); ctx.moveTo(c.x - 4, y + bh); ctx.lineTo(c.x, y + bh + 5); ctx.lineTo(c.x + 4, y + bh); ctx.fillStyle = col; ctx.fill();
    ln.forEach((l, i) => txt(l, x + 6, y + 11 + i * 10.5, "#e6efe9", 8.5, "left", 600)); ctx.globalAlpha = 1;
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame); if (document.hidden || !shown()) { t0 = 0; return; }
    const now = ts / 1000; if (!t0) t0 = now; const dt = Math.min(0.1, now - t0); t0 = now; const t = now;
    ctx.setTransform(dpr * (cssW / W), 0, 0, dpr * (cssW / W), 0, 0); ctx.clearRect(0, 0, W, H);
    // corridors
    rect(0, 180, W, 30, "#10161a"); rect(0, 410, W, 30, "#10161a"); for (let x = 4; x < W; x += 34) { rect(x, 193, 16, 3, "rgba(255,255,255,.06)"); rect(x, 423, 16, 3, "rgba(255,255,255,.06)"); }
    rect(240, 300, 20, 40, "#10161a"); rect(740, 300, 20, 40, "#10161a"); rect(415, 180, 30, 40, "#10161a"); rect(415, 400, 30, 40, "#10161a");
    Object.values(R).forEach((r) => drawRoom(r, t));
    for (const a in chars) updateChar(chars[a], dt);
    // stamp on the risk room
    const sa = now - stamp.t; const items = [];
    for (const a of agents) { items.push({ y: chars[a].y, f: () => { desk(a, t); } }); }
    for (const a of agents) items.push({ y: chars[a].y + (chars[a].path.length || chars[a].dest ? 0 : 0.5) + 14, f: () => person(chars[a], t) });
    // deskless debaters: lecterns in front of them
    items.push({ y: 340, f: () => { for (const [a, c] of [["bull", "#00f5a0"], ["bear", "#ff3d6b"]]) { const ch = chars[a]; if (ch.path.length || ch.dest) continue; rr(ch.x - 14, ch.y + 8, 28, 16, 2, "#2a3a34", c + "99", 1); } } });
    items.sort((p, q) => p.y - q.y).forEach((i) => i.f());
    // debaters face off
    const bu = chars.bull, be = chars.bear; if (!bu.path.length && !bu.dest) bu.face = 1; if (!be.path.length && !be.dest) be.face = -1;
    for (const a of agents) bubble(a, t);
    if (sa < 5) { const r = R.risk, k = Math.min(1, sa * 5), ease = 1 + (1 - k) * 2.4; ctx.save(); ctx.globalAlpha = sa > 4 ? 5 - sa : 1; ctx.translate(r.x + 232, r.y + 118); ctx.rotate(-0.2); ctx.scale(ease, ease); rr(-58, -20, 116, 40, 4, "rgba(40,0,10,.55)", "#ff3d6b", 4); glow("#ff3d6b", 14); txt("VETO", 0, 9, "#ff3d6b", 26, "center", 800); noGlow(); ctx.restore(); }
  }
  function resize() { const p = cv.parentNode, w = p.clientWidth, h = p.clientHeight; if (!w || !h) return; const k = Math.min(w / W, h / H); cssW = W * k; cssH = H * k; dpr = window.devicePixelRatio || 1; cv.style.width = cssW + "px"; cv.style.height = cssH + "px"; cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); }
  function roomAt(ev) { const b = cv.getBoundingClientRect(), x = ((ev.clientX - b.left) / b.width) * W, y = ((ev.clientY - b.top) / b.height) * H; return Object.values(R).find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) || null; }
  function init(canvas, opts) {
    cv = canvas; ctx = cv.getContext("2d"); shown = opts.shown || shown; mkChars(); resize(); new ResizeObserver(resize).observe(cv.parentNode); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    cv.addEventListener("mousemove", (e) => { const r = roomAt(e); hoverK = r ? r.k : ""; cv.style.cursor = r ? "pointer" : "default"; opts.onHover && opts.onHover(r ? r.k : "", e); });
    cv.addEventListener("mouseleave", () => { hoverK = ""; opts.onHover && opts.onHover("", null); });
    cv.addEventListener("click", (e) => { const r = roomAt(e); opts.onClick && opts.onClick(r ? r.k : "", e); });
  }
  return { init, trigger, reset, setView: (v) => Object.assign(view, v), agentsOf: (k) => Object.keys(R[k].agents), NAME, HUE, roomOf };
})();
