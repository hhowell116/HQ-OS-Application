// Trading Floor tab: live desk cards, ticker tape, signal board and paper book. Data comes from Stonks/engine via main.js (IPC "tf").
(function () {
  const $ = (s) => document.querySelector(s);
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const ORDER = ["market", "news", "sentiment", "analyst", "debate", "risk", "lead", "score", "reflect"];
  const ICON = { market: "▦", news: "✉", sentiment: "☺", analyst: "∿", debate: "⚔", risk: "⛨", lead: "★", score: "✓", reflect: "✎" };
  const NAME = { market: "Market Data", news: "News & Policy", sentiment: "Sentiment", analyst: "Analyst", debate: "Bull vs Bear", risk: "Risk Manager", lead: "Lead", score: "Scorekeeper", reflect: "Reflector" };
  const S = { running: false, desks: {}, alerts: [], tape: [], stats: null, sig: {}, finishedAt: 0 };
  const sgn = (n) => (n > 0 ? "+" : "") + n;
  const cls = (n) => (n > 0 ? "up" : n < 0 ? "dn" : "");
  const usd = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

  function renderDesks() {
    const box = $("#fl-desks"); box.textContent = "";
    for (const id of ORDER) {
      const d = S.desks[id] || { id, name: NAME[id], status: "idle", step: "", out: "" };
      const c = mk("div", "fl-desk " + d.status), h = mk("div", "hd"); h.append(mk("span", "", (ICON[id] || "•") + " " + d.name), mk("span", "st", d.status), mk("span", "led"));
      c.append(h, mk("div", "step", d.step || (d.status === "idle" ? "standing by" : "")), mk("div", "out", d.out || "")); box.append(c);
    }
    const w = Object.values(S.desks).filter((d) => d.status === "working");
    $("#fl-sub").textContent = S.running ? (w.length ? w.map((d) => d.name).join(" + ") + " working" : "run in progress") : S.finishedAt ? "last run " + new Date(S.finishedAt).toLocaleTimeString() : "desks idle";
    const go = $("#fl-go"); go.textContent = S.running ? "RUNNING" : "GO"; go.classList.toggle("run", S.running); go.disabled = S.running; $("#fl-score").disabled = S.running;
  }
  function renderTape() {
    const t = S.tape.length ? S.tape : [{ s: "SPY", px: 0, chg: 0 }]; const inn = $("#fl-tape-in"); inn.textContent = "";
    for (const x of [...t, ...t]) { const s = mk("span", "fl-tk " + cls(x.chg)); s.append(mk("b", "", x.s), document.createTextNode((x.chg > 0 ? "▲ " : x.chg < 0 ? "▼ " : "") + (x.px ? x.px + " " : "") + sgn(x.chg) + "%")); inn.append(s); }
  }
  function card(a) {
    const c = mk("div", "fl-card " + a.action), top = mk("div", "top"), px = mk("div", "px");
    px.append(mk("div", "", a.px ? "$" + a.px : ""), mk("div", cls(a.chg), a.chg != null ? sgn(a.chg) + "% today" : ""));
    top.append(mk("span", "act", a.action), mk("span", "tk", a.ticker), px); c.append(top, mk("div", "thesis", a.thesis || ""));
    const cf = mk("div", "fl-conf"), bar = mk("i"), fill = mk("b"); fill.style.width = Math.max(0, Math.min(100, a.confidence || 0)) + "%"; bar.append(fill); cf.append(mk("span", "", "CONFIDENCE " + (a.confidence || 0)), bar); c.append(cf);
    if (a.plan) {
      const l = mk("div", "fl-lad"); [["ENTRY", a.plan.entry, ""], ["STOP", a.plan.stop, "s"], ["TARGET 1", a.plan.t1, "t"], ["TARGET 2", a.plan.t2, "t"]].forEach(([k, v, z]) => { const d = mk("div", z); d.append(mk("small", "", k), document.createTextNode("$" + v)); l.append(d); }); c.append(l);
      c.append(mk("div", "sz", "size " + a.plan.shares + " sh · risk $" + a.plan.riskUsd + (a.positionId ? " · paper position " + a.positionId : "")));
    }
    if (a.vetoWhy && a.vetoWhy.length) c.append(mk("div", "veto", "Risk: " + a.vetoWhy.join("; ")));
    const ul = mk("ul"); (a.reasons || []).forEach((r) => ul.append(mk("li", "", r))); c.append(ul);
    const ch = mk("div", "fl-chips"); (a.signals || []).forEach((s) => ch.append(mk("span", "sg", s))); (a.sources || []).forEach((s) => { const e = mk("span", "", s); e.title = s; ch.append(e); }); c.append(ch);
    return c;
  }
  const RANK = { BUY: 0, SELL: 1, WATCH: 2 };
  function renderAlerts() {
    const box = $("#fl-alerts"); box.textContent = "";
    if (!S.alerts.length) { box.append(mk("div", "fl-empty", "No alerts yet. Hit GO to send the desks to work.")); $("#fl-when").textContent = ""; return; }
    [...S.alerts].sort((a, b) => (RANK[a.action] - RANK[b.action]) || b.confidence - a.confidence).forEach((a) => box.append(card(a)));
    const t = S.alerts[0] && S.alerts[0].ts; $("#fl-when").textContent = t ? new Date(t).toLocaleString() : "";
  }
  function renderBook() {
    const s = S.stats, box = $("#fl-stats"); box.textContent = "";
    if (!s) { box.append(mk("div", "fl-empty", "No ledger yet.")); return; }
    const ring = mk("div", "fl-ring"), b = mk("b", "", s.winRate == null ? "--" : s.winRate + "%"); b.append(mk("small", "", "WIN RATE")); ring.append(b);
    ring.style.setProperty("--p", s.winRate || 0); ring.style.setProperty("--c", s.winRate == null || s.winRate >= 50 ? "#00f5a0" : "#ff3d6b");
    const kv = mk("div", "fl-kv"), row = (k, v, c) => { const d = mk("div"); d.append(mk("span", "", k), mk("b", c || "", v)); kv.append(d); };
    row("REALIZED P&L", usd(s.pnl), cls(s.pnl)); row("OPEN P&L", usd(s.unreal), cls(s.unreal)); row("EQUITY", usd(s.equity), cls(s.retPct)); row("RETURN", sgn(s.retPct) + "%", cls(s.retPct));
    row("VS SPY", s.vsSpy == null ? "n/a" : sgn(s.vsSpy) + " pts", s.vsSpy == null ? "" : cls(s.vsSpy)); row("TRADES", s.trades + " closed · " + s.open + " open");
    box.append(ring, kv);
    const pb = $("#fl-pos"); pb.textContent = ""; if (!s.positions.length) pb.append(mk("div", "fl-empty", "No paper positions yet."));
    for (const p of s.positions.slice(0, 12)) {
      const closed = p.status === "closed", pl = closed ? p.pnl : p.unreal || 0, r = mk("div", "fl-row " + (closed ? (pl > 0 ? "win" : "loss") : "open"));
      r.append(mk("b", "", p.ticker), mk("span", "sd", p.side.toUpperCase()), mk("span", "lv", "$" + p.entry + (closed ? " → $" + p.exit + " (" + p.reason + ")" : p.last ? " → $" + p.last : "")), mk("span", "pl " + cls(pl), usd(pl))); pb.append(r);
    }
  }
  function renderSig() {
    const box = $("#fl-sig"); box.textContent = ""; const e = Object.entries(S.sig).sort((a, b) => b[1].n - a[1].n);
    if (!e.length) { box.append(mk("div", "fl-empty", "Signals are scored once trades close.")); return; }
    for (const [k, v] of e) { const r = mk("div", "fl-row"), n = mk("span", "", k); if (v.demoted) n.append(mk("span", "dem", "DEMOTED")); r.append(n, mk("span", "pl " + cls(v.pnl), Math.round(v.winRate * 100) + "% · " + v.n + " · " + usd(v.pnl))); box.append(r); }
  }
  const all = () => { renderDesks(); renderTape(); renderAlerts(); renderBook(); renderSig(); };
  function load(r) { const st = r.state; if (st) { S.desks = st.desks || {}; S.alerts = st.alerts || []; S.tape = st.tape || []; S.finishedAt = st.finishedAt || 0; } S.running = !!r.running; S.stats = r.stats; S.sig = r.journal || {}; all(); }
  async function refresh() { try { load(await hq.tfState()); } catch (e) {} }
  hq.on("tf", async (m) => {
    if (m.t === "desk") { S.desks[m.id] = m.desk; renderDesks(); if (m.id === "market" && m.desk.status === "done") refresh(); }
    else if (m.t === "start") { S.running = true; S.alerts = []; renderAlerts(); renderDesks(); }
    else if (m.t === "done") { S.running = false; await refresh(); }
  });
  async function start(fn) { try { S.running = true; renderDesks(); if ((await fn()) === false) await refresh(); } catch (e) { S.running = false; renderDesks(); const t = $("#toast"); if (t) { t.textContent = e.message; t.classList.remove("hidden"); setTimeout(() => t.classList.add("hidden"), 4000); } } }
  $("#fl-go").onclick = () => start(() => hq.tfGo());
  $("#fl-score").onclick = () => start(() => hq.tfScore());
  const clk = () => { $("#fl-clock").textContent = new Date().toLocaleTimeString([], { hour12: false }); };
  clk(); setInterval(clk, 1000);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("in-floor")) window.HQView("hq"); });
  window.HQFloor = { shown: refresh };
  all(); refresh(); setInterval(() => { if (document.body.classList.contains("in-floor") && !S.running) refresh(); }, 30000);
})();
