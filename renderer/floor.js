// Trading Floor: one screen (office view + signal board + book strip). Office art is in office.js.
// Data comes from Stonks/engine via main.js: IPC "tf" live lines (desk + msg events), tf-state, tf-events (replay), tf-usage, kn-*.
(function () {
  const $ = (s) => document.querySelector(s);
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const ICON = { market: "▦", news: "✉", sentiment: "☺", analyst: "∿", bull: "▲", bear: "▼", backtest: "⟲", risk: "⛨", lead: "★", score: "✓", reflect: "✎" };
  const NAME = { market: "Market Data", news: "News & Policy", sentiment: "Sentiment", analyst: "Analyst", debate: "Bull vs Bear", bull: "Bull", bear: "Bear", backtest: "Backtester", risk: "Risk Manager", lead: "Lead", score: "Scorekeeper", reflect: "Reflector" };
  const HUE = { market: "#4aa8ff", news: "#b58cff", sentiment: "#ff8fd0", analyst: "#ffb02e", bull: "#00f5a0", bear: "#ff3d6b", backtest: "#5ee6ff", risk: "#ff7a45", lead: "#ffe066", score: "#9ad17a", reflect: "#c0a0ff" };
  // seat angle in degrees clockwise from the top; bull (270) and bear (90) sit opposite each other
  const ANG = { market: 325, news: 0, sentiment: 35, bear: 90, backtest: 135, risk: 165, lead: 195, reflect: 222, score: 248, bull: 270, analyst: 298 };
  const SEATS = Object.keys(ANG).concat("steady");
  const NEXT = { score: "market", market: "analyst", news: "analyst", sentiment: "analyst", analyst: "bull", bull: "bear", bear: "backtest", debate: "backtest", backtest: "risk", risk: "lead", lead: "reflect", reflect: "" };
  const STAGES = [["SCORE", ["score"]], ["DATA", ["market", "news", "sentiment"]], ["ANALYST", ["analyst"]], ["DEBATE", ["bull", "bear"]], ["BACKTEST", ["backtest"]], ["RISK", ["risk"]], ["LEAD", ["lead"]], ["REFLECT", ["reflect"]]];
  const S = { health: { ok: true, why: [] }, running: false, desks: {}, alerts: [], tape: [], stats: null, sig: {}, equity: [], finishedAt: 0, ev: [], cur: -1, follow: true, sel: "", play: null, usage: null };
  const sgn = (n) => (n > 0 ? "+" : "") + n;
  const cls = (n) => (n > 0 ? "up" : n < 0 ? "dn" : "");
  const usd = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const toast = (m) => { const t = $("#toast"); if (t) { t.textContent = m; t.classList.remove("hidden"); setTimeout(() => t.classList.add("hidden"), 4000); } };
  const seatOf = (a) => (a === "debate" ? "bear" : a);
  const seatsFor = (a) => (a === "debate" ? ["bull", "bear"] : [a]);
  const short = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
  const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? "just now" : m < 60 ? m + "m ago" : m < 1440 ? Math.floor(m / 60) + "h ago" : Math.floor(m / 1440) + "d ago"; };

  // ---------- events: live feed, with a fallback built from the desk cards when no run has logged any yet ----------
  function events() {
    if (S.ev.length) return S.ev;
    return Object.values(S.desks).filter((d) => (d.status === "done" || d.status === "error") && (d.out || d.step)).sort((a, b) => (a.t || 0) - (b.t || 0))
      .map((d, i) => ({ seq: i + 1, ts: d.t || 0, agent: d.id, kind: d.status === "error" ? "error" : "done", to: NEXT[d.id] || "", text: [d.step, d.out].filter(Boolean).join(" | ") }));
  }
  function derive(ev, cur) {
    const st = {}; SEATS.forEach((s) => (st[s] = { status: "idle", text: "" }));
    let veto = null;
    for (let i = 0; i <= cur && i < ev.length; i++) {
      const e = ev[i];
      if (e.kind === "start") seatsFor(e.agent).forEach((s) => st[s] && (st[s].status = "working"));
      else if (e.kind === "done") seatsFor(e.agent).forEach((s) => st[s] && (st[s].status = "done"));
      else if (e.kind === "error") seatsFor(e.agent).forEach((s) => st[s] && (st[s].status = "error"));
      if (st[seatOf(e.agent)]) st[seatOf(e.agent)].text = e.text;
      if (e.kind === "veto") veto = e;
    }
    return { st, veto };
  }

  // ---------- Office (canvas, see office.js) ----------
  const O = window.FloOffice; let animCur = -1, pinned = "";
  const roomOfA = (a) => (a ? O.roomOf(a) : "");
  function roomMsgs(k, cur) { return events().slice(0, cur + 1).filter((m) => m.text && roomOfA(m.agent) === k); }
  function popFor(k, x, y, pin) {
    const p = $("#fl-pop"); if (!k) { if (!pinned) p.classList.add("hidden"); return; }
    if (pinned && !pin) return;
    const ev = events(), st = derive(ev, S.cur).st, ag = O.agentsOf(k), msgs = roomMsgs(k, S.cur).slice(-3);
    p.textContent = ""; p.style.setProperty("--h", O.HUE[ag[0]] || "#ffb02e");
    const h = mk("div", "ph"); h.append(mk("b", "", O.NAME[k]), mk("em", "", ag.map((a) => (st[a] ? st[a].status : "idle")).join(" / "))); p.append(h);
    if (!msgs.length) p.append(mk("div", "pm", "Nothing from this desk in the current run."));
    msgs.forEach((m) => { const d = mk("div", "pm"); d.append(mk("small", "", NAME[m.agent] + (m.to ? " → " + NAME[m.to] : "")), document.createTextNode(m.text)); p.append(d); });
    p.append(mk("div", "pf", pin ? "pinned · click the room again to unpin (transcript filtered to this desk)" : "click to pin and filter the transcript"));
    p.classList.remove("hidden"); const box = $("#fl-office").getBoundingClientRect(), pw = p.offsetWidth, ph = p.offsetHeight;
    p.style.left = Math.max(6, Math.min(box.width - pw - 6, x - box.left + 16)) + "px"; p.style.top = Math.max(6, Math.min(box.height - ph - 6, y - box.top + 10)) + "px";
  }
  O.init($("#fl-cv"), {
    shown: () => document.body.classList.contains("in-floor") && !document.hidden,
    onHover: (k, e) => { if (!pinned) popFor(k, e ? e.clientX : 0, e ? e.clientY : 0, false); },
    onClick: (k, e, who) => { if (!k || (pinned === k && !who)) { pinned = ""; S.sel = ""; $("#fl-pop").classList.add("hidden"); O.focus(""); } else { pinned = k; S.sel = k; O.focus(k, who); popFor(k, e.clientX, e.clientY, true); } renderAgents(); },
  });
  function renderAgents() {
    const ev = events(), n = ev.length; if (S.follow || S.cur >= n) S.cur = n - 1;
    const cur = S.cur, { st, veto } = derive(ev, cur), e = ev[cur];
    if (cur !== animCur) {
      if (cur > animCur && cur - animCur <= 6) for (let i = animCur + 1; i <= cur; i++) O.trigger(ev[i]);
      else { O.reset(); if (cur >= 0) O.trigger(ev[cur], true); }
      animCur = cur;
    }
    const cl = ((S.stats && S.stats.positions) || []).filter((p) => p.status === "closed");
    O.setView({ st, veto, running: S.running, tape: S.tape, eq: (S.equity || []).map((p) => p.total).filter((v) => v != null), wins: cl.filter((p) => p.pnl > 0).length, losses: cl.filter((p) => p.pnl <= 0).length });
    const stp = $("#fl-stepper"); stp.textContent = "";
    STAGES.forEach(([label, ids], i) => { const ss = ids.map((x) => st[x].status), c = ss.includes("working") ? "working" : ss.includes("error") ? "error" : ss.every((x) => x === "done") ? "done" : ss.includes("done") ? "working" : ""; stp.append(mk("span", "stp " + c, label)); if (i < STAGES.length - 1) stp.append(mk("i")); });
    // scrubber
    const r = $("#fl-range"); r.max = Math.max(0, n - 1); r.value = Math.max(0, cur); $("#fl-spos").textContent = n ? (cur + 1) + "/" + n : "0/0";
    $("#fl-live").classList.toggle("on", S.follow); $("#fl-play").textContent = S.play ? "PAUSE" : "PLAY";
    // transcript
    const log = $("#fl-log"), keep = log.scrollTop, atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40; log.textContent = "";
    $("#fl-filter").textContent = S.sel ? O.NAME[S.sel] + " only (click the room to clear)" : "";
    if (!n) log.append(mk("div", "fl-empty", "No messages yet. Hit GO and watch the desks hand work to each other."));
    ev.forEach((m, i) => {
      if (S.sel && O.roomOf(m.agent) !== S.sel && O.roomOf(m.to || "") !== S.sel) return;
      const sid = seatOf(m.agent), row = mk("div", "ln " + m.kind + (i === cur ? " cur" : "") + (i > cur ? " future" : "")); row.style.setProperty("--h", HUE[sid] || "#888");
      const h = mk("div", "lh"); h.append(mk("b", "", NAME[m.agent] || m.agent), mk("em", "", (m.to ? "→ " + NAME[m.to] : "") + (m.kind === "veto" ? "  VETO" : m.kind === "start" ? "  working" : m.kind === "error" ? "  error" : "")), mk("time", "", m.ts ? new Date(m.ts).toLocaleTimeString([], { hour12: false }) : ""));
      row.append(h, mk("div", "lt", m.text)); row.onclick = () => { S.follow = false; S.cur = i; stopPlay(); renderAgents(); }; log.append(row);
    });
    if (S.follow || atEnd) { const c = log.querySelector(".cur"); if (c) log.scrollTop = c.offsetTop - log.clientHeight + c.offsetHeight + 8; else log.scrollTop = log.scrollHeight; } else log.scrollTop = keep;
  }
  function stopPlay() { if (S.play) { clearInterval(S.play); S.play = null; } }
  function startPlay() { const n = events().length; if (!n) return; S.follow = false; if (S.cur >= n - 1) S.cur = -1; S.play = setInterval(() => { const m = events().length; if (S.cur >= m - 1) { stopPlay(); S.follow = S.running; renderAgents(); return; } S.cur++; renderAgents(); }, 1400); renderAgents(); }
  $("#fl-play").onclick = () => (S.play ? (stopPlay(), renderAgents()) : startPlay());
  $("#fl-live").onclick = () => { stopPlay(); S.follow = true; renderAgents(); };
  $("#fl-range").oninput = (x) => { stopPlay(); S.follow = false; S.cur = +x.target.value; renderAgents(); };
  function renderTape() {
    const t = S.tape.length ? S.tape : [{ s: "SPY", px: 0, chg: 0 }]; const inn = $("#fl-tape-in"); inn.textContent = "";
    for (const x of [...t, ...t]) { const s = mk("span", "fl-tk " + cls(x.chg)); s.append(mk("b", "", x.s), document.createTextNode((x.chg > 0 ? "▲ " : x.chg < 0 ? "▼ " : "") + (x.px ? x.px + " " : "") + sgn(x.chg) + "%")); inn.append(s); }
  }
  function card(a) {
    const c = mk("div", "fl-card " + a.action), top = mk("div", "top"), px = mk("div", "px");
    px.append(mk("div", "", a.px ? "$" + a.px : ""), mk("div", cls(a.chg), a.chg != null ? sgn(a.chg) + "% today" : ""));
    top.append(mk("span", "act", a.action), mk("span", "tk", a.ticker), mk("span", "fl-strat " + (a.strategy || "Scanner"), (a.strategy || "Scanner").toUpperCase()), px); c.append(top, mk("div", "thesis", a.thesis || ""));
    if (a.confidence != null) { const cf = mk("div", "fl-conf"), bar = mk("i"), fill = mk("b"); fill.style.width = Math.max(0, Math.min(100, a.confidence || 0)) + "%"; bar.append(fill); cf.append(mk("span", "", "CONFIDENCE " + (a.confidence || 0)), bar); c.append(cf); }
    if (a.plan) {
      const l = mk("div", "fl-lad"); [["ENTRY", a.plan.entry, ""], ["STOP", a.plan.stop, "s"], [a.strategy === "Steady" ? "52W HIGH" : "TARGET 1", a.plan.t1, "t"], ["TARGET 2", a.plan.t2, "t"]].filter((x) => x[1] != null).forEach(([k, v, z]) => { const d = mk("div", z); d.append(mk("small", "", k), document.createTextNode("$" + v)); l.append(d); }); c.append(l);
      c.append(mk("div", "sz", "size " + a.plan.shares + " sh" + (a.plan.riskUsd != null ? " · risk $" + a.plan.riskUsd : "") + (a.positionId ? " · paper position " + a.positionId : "")));
    }
    if (a.vetoWhy && a.vetoWhy.length) c.append(mk("div", "veto", "Risk: " + a.vetoWhy.join("; ")));
    const ul = mk("ul"); (a.reasons || []).forEach((r) => ul.append(mk("li", "", r))); c.append(ul);
    const ch = mk("div", "fl-chips"); (a.signals || []).forEach((s) => ch.append(mk("span", "sg", s))); (a.sources || []).forEach((s) => { const e = mk("span", "", s); e.title = s; ch.append(e); }); c.append(ch);
    c.onclick = () => openDrawer(a); return c;
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
      r.append(mk("b", "", p.ticker), Object.assign(mk("span", "sd", (p.strat === "Steady" ? "S " : "") + p.side.toUpperCase()), { title: p.strat || "Scanner" }), mk("span", "lv", "$" + p.entry + (closed ? " → $" + p.exit + " (" + p.reason + ")" : p.last ? " → $" + p.last : "")), mk("span", "pl " + cls(pl), usd(pl))); pb.append(r);
    }
  }
  function renderSafety() {
    const sf = (S.stats && S.stats.safety) || {}, paused = sf.status === "PAUSED", h = S.health || { ok: true, why: [] }, fl = S.flag;
    const pill = $("#fl-pill"); pill.textContent = paused ? "PAUSED" : "ACTIVE"; pill.className = "fl-pill " + (paused ? "paused" : "active"); pill.title = paused ? (sf.reason || "paused") : "Agent is allowed to trade";
    $("#fl-resume").classList.toggle("hidden", !paused);
    const b = $("#fl-banner"), msgs = [];
    if (!h.ok) msgs.push("LEDGER PROBLEM, NO TRADING: " + h.why.join("; "));
    if (paused) msgs.push("PAUSED: " + (sf.reason || "no reason recorded") + ". Press RESUME when you are ready.");
    if (fl) msgs.push(fl);
    b.textContent = msgs.join("  |  "); b.classList.toggle("hidden", !msgs.length);
    const L = (S.stats && S.stats.limits) || null, box = $("#fl-rules"); box.textContent = ""; if (!L) return;
    [["CAP", "$" + L.maxCapital], ["BREAKER", "-" + L.circuitBreakerPct + "% from peak"], ["ORDER", "<= " + L.maxOrderPct + "% of cap"], ["TRADES", "<= " + L.maxTradesPerDay + "/day"], ["DAILY LOSS", L.dailyLossPct + "%"], ["MIN CONF", L.minConfidence], ["SHORTS", L.allowShort ? "on" : "off"], ["STOP", "every order"], ["APPROVAL", L.requireApproval ? "live: required" : "off"]].forEach(([k, v]) => { const s = mk("span", "", ""); s.append(mk("small", "", k), document.createTextNode(v)); box.append(s); });
    if (sf.peak) box.append(Object.assign(mk("span", "pk", ""), { textContent: "PEAK $" + Math.round(sf.peak) }));
  }
  function renderCmp() {
    const s = S.stats, box = $("#fl-cmp"); box.textContent = ""; if (!s || !s.steady) return;
    const rows = [["SCANNER", s.retPct, s.trades + " closed · " + s.open + " open"], ["STEADY", s.steady.retPct, s.steady.trades + " closed · " + s.steady.open + " open"], ["SPY", s.spy && s.spy.retPct, s.spy && s.spy.since ? "since " + new Date(s.spy.since).toLocaleDateString() : "benchmark"]];
    for (const [k, v, n] of rows) { const d = mk("div", "t " + k); d.append(mk("small", "", k), mk("b", cls(v), v == null ? "--" : sgn(v) + "%"), mk("em", "", n)); box.append(d); }
    if (s.review && s.review.due) box.append(mk("div", "rev", "Steady watchlist review due (every " + s.review.every + " days)"));
  }
  function renderSig() {
    const box = $("#fl-sig"); box.textContent = ""; const e = Object.entries(S.sig).sort((a, b) => b[1].n - a[1].n);
    if (!e.length) { box.append(mk("div", "fl-empty", "Signals are scored once trades close.")); return; }
    for (const [k, v] of e) { const r = mk("div", "fl-row"), n = mk("span", "", k); if (v.demoted) n.append(mk("span", "dem", "DEMOTED")); r.append(n, mk("span", "pl " + cls(v.pnl), Math.round(v.winRate * 100) + "% · " + v.n + " · " + usd(v.pnl))); box.append(r); }
  }

  // ---------- Signals drawer ----------
  function openDrawer(a) {
    const d = $("#fl-drawer"); d.textContent = ""; d.classList.remove("hidden");
    const x = mk("button", "fl-btn ghost", "CLOSE"); x.onclick = () => d.classList.add("hidden");
    const top = mk("div", "dtop"); top.append(mk("span", "dact " + a.action, a.action), mk("b", "tk", a.ticker), mk("span", "fl-strat " + (a.strategy || "Scanner"), (a.strategy || "Scanner").toUpperCase()), mk("span", "spacer"), x); d.append(top);
    d.append(mk("div", "dpx", (a.px ? "$" + a.px + "  " : "") + (a.chg != null ? sgn(a.chg) + "% today" : "") + (a.confidence != null ? "   confidence " + a.confidence : "")), mk("p", "dth", a.thesis || ""));
    const sec = (t, rows) => { if (!rows.length) return; d.append(mk("div", "fl-h", t)); const ul = mk("ul", "dl"); rows.forEach((r) => ul.append(mk("li", "", r))); d.append(ul); };
    sec("REASONS", a.reasons || []);
    const lines = S.ev.filter((m) => (m.kind === "say" || m.kind === "veto") && new RegExp("^" + a.ticker + "\\b").test(m.text || ""));
    sec("DESK VERDICTS", lines.map((m) => NAME[m.agent] + ": " + m.text));
    sec("BACKTEST", a.backtest && a.backtest.text ? [a.backtest.text] : []);
    sec("RISK CHECK", (a.vetoWhy && a.vetoWhy.length ? a.vetoWhy.map((v) => "Veto: " + v) : a.plan ? ["Approved: size " + a.plan.shares + " sh, risk $" + (a.plan.riskUsd != null ? a.plan.riskUsd : "?")] : []));
    if (a.plan) { const l = mk("div", "fl-lad"); [["ENTRY", a.plan.entry, ""], ["STOP", a.plan.stop, "s"], ["TARGET 1", a.plan.t1, "t"], ["TARGET 2", a.plan.t2, "t"]].filter((z) => z[1] != null).forEach(([k, v, z]) => { const e = mk("div", z); e.append(mk("small", "", k), document.createTextNode("$" + v)); l.append(e); }); d.append(l); }
    sec("SIGNALS", a.signals || []); sec("SOURCES", a.sources || []);
    d.append(mk("div", "dis", a.disclaimer || "Research only, paper-traded, not financial advice."));
  }

  // ---------- Book: equity curve (inline SVG) ----------
  function renderCurve() {
    const box = $("#fl-curve"); box.textContent = ""; const h = S.equity || [], s = S.stats;

    if (h.length < 2) { box.append(mk("div", "fl-empty", "The curve fills in as runs finish. Each GO or SCORE adds a point.")); return; }
    const cap = (s && s.capital) || h[0].total || 1000, W = 380, H = 92, P = { l: 34, r: 8, t: 6, b: 16 };
    const pct = (v) => (v == null ? null : (v / cap - 1) * 100);
    const series = [["TOTAL", "#ffb02e", h.map((p) => pct(p.total))], ["SCANNER", "#00f5a0", h.map((p) => (p.scanner == null ? null : (p.scanner / (cap / 2) - 1) * 100))], ["STEADY", "#4aa8ff", h.map((p) => (p.steady == null ? null : (p.steady / (cap / 2) - 1) * 100))], ["SPY", "#8a9a94", h.map((p) => p.spy)]];
    const vals = series.flatMap((x) => x[2]).filter((v) => v != null), lo = Math.min(0, ...vals), hi = Math.max(0.5, ...vals), pad = (hi - lo) * 0.1 || 1, y0 = lo - pad, y1 = hi + pad;
    const t0 = h[0].ts, t1 = h[h.length - 1].ts || t0 + 1, X = (t) => P.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r), Y = (v) => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
    const ns = "http://www.w3.org/2000/svg", el = (n, a) => { const e = document.createElementNS(ns, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "crv" });
    for (let i = 0; i <= 4; i++) { const v = y0 + ((y1 - y0) * i) / 4, y = Y(v); svg.append(el("line", { x1: P.l, x2: W - P.r, y1: y, y2: y, class: "gl" })); const t = el("text", { x: P.l - 6, y: y + 3, class: "ax", "text-anchor": "end" }); t.textContent = v.toFixed(1) + "%"; svg.append(t); }
    svg.append(el("line", { x1: P.l, x2: W - P.r, y1: Y(0), y2: Y(0), class: "zero" }));
    for (const [name, col, arr] of series) { const pts = arr.map((v, i) => (v == null ? null : [X(h[i].ts), Y(v)])).filter(Boolean); if (pts.length < 2) continue; svg.append(el("polyline", { points: pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" "), fill: "none", stroke: col, "stroke-width": name === "TOTAL" ? 2.4 : 1.6, "stroke-dasharray": name === "SPY" ? "4 3" : "" })); const l = pts[pts.length - 1]; svg.append(el("circle", { cx: l[0], cy: l[1], r: 3, fill: col })); }
    const d0 = el("text", { x: P.l, y: H - 6, class: "ax" }); d0.textContent = new Date(t0).toLocaleDateString(); const d1 = el("text", { x: W - P.r, y: H - 6, class: "ax", "text-anchor": "end" }); d1.textContent = new Date(t1).toLocaleDateString(); svg.append(d0, d1);
    box.append(svg); const lg = mk("div", "lg"); series.forEach(([n, c]) => { const i = mk("span", "", n); i.style.setProperty("--c", c); lg.append(i); }); box.append(lg);
  }

  // ---------- Header: equity, usage meter, run state ----------
  function renderHead() {
    const s = S.stats, eq = s && (s.totalEquity != null ? s.totalEquity : s.equity), cap = s && (s.capital || 0);
    $("#fl-eq").textContent = eq == null ? "--" : usd(eq);
    const ret = eq != null && cap ? Math.round((eq / cap - 1) * 10000) / 100 : null, spy = s && s.spy && s.spy.retPct;
    const r = $("#fl-ret"); r.textContent = ret == null ? "--" : sgn(ret) + "%"; r.className = cls(ret);
    const vs = ret != null && spy != null ? Math.round((ret - spy) * 100) / 100 : null, v = $("#fl-vs"); v.textContent = vs == null ? "--" : sgn(vs) + " pts"; v.className = cls(vs); v.title = spy != null ? "SPY " + sgn(spy) + "% over the same period" : "";
    const w = Object.values(S.desks).filter((d) => d.status === "working");
    $("#fl-sub").textContent = S.running ? (w.length ? w.map((d) => d.name).join(" + ") + " working" : "run in progress") : S.finishedAt ? "last run " + new Date(S.finishedAt).toLocaleTimeString() : "desks idle";
    const go = $("#fl-go"); go.textContent = S.running ? "RUNNING" : "GO"; go.classList.toggle("run", S.running); go.disabled = S.running; $("#fl-score").disabled = S.running;
  }
  const lvl = (p) => (p >= 80 ? "r" : p >= 50 ? "a" : "g");
  const until = (sec) => { const m = Math.max(0, Math.round((sec * 1000 - Date.now()) / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60); return d ? d + "d " + h + "h" : h ? h + "h " + (m % 60) + "m" : (m % 60) + "m"; };
  function renderUsage() {
    const u = S.usage, box = $("#fl-use"), fresh = u && u.updated && Date.now() - u.updated < 7 * 86400000;
    box.classList.toggle("none", !fresh); box.classList.toggle("stale", !!fresh && Date.now() - u.updated > 15 * 60000);
    for (const [id, key] of [["#fl-u5", "five_hour"], ["#fl-u7", "seven_day"]]) {
      const e = $(id), b = fresh && u[key], bar = e.querySelector("b"), t = e.querySelector("span");
      if (!b) { bar.style.width = "0"; bar.className = ""; t.textContent = "--"; continue; }
      const reset = b.resets_at && b.resets_at * 1000 < Date.now(), p = reset ? 0 : Math.max(0, Math.min(100, Math.round(b.used_percentage)));
      bar.style.width = p + "%"; bar.className = lvl(p); t.textContent = p + "%" + (reset ? " (reset)" : b.resets_at ? " · resets " + until(b.resets_at) : "");
    }
    box.title = "Claude usage. " + ($("#fl-uage").textContent = fresh ? "updated " + ago(u.updated) + (u.via ? " via " + u.via : "") + (box.classList.contains("stale") ? " (stale)" : "") : "no data yet");
  }
  async function refreshUsage() {
    try { S.usage = await hq.tfUsage(); } catch (e) { S.usage = null; }
    // the statusline file only updates in interactive Claude Code sessions in Stonks; HQ chats run headless, so fall back to HQ's own usage poll
    if (!S.usage || !S.usage.updated || Date.now() - S.usage.updated > 15 * 60000) {
      try {
        const r = await hq.usage(false), u = r && r.usage, m = (x) => (x && x.utilization != null ? { used_percentage: x.utilization, resets_at: x.resets_at ? Math.floor(new Date(x.resets_at).getTime() / 1000) : null } : null);
        if (u && (m(u.five_hour) || m(u.seven_day))) S.usage = { updated: Date.now(), five_hour: m(u.five_hour), seven_day: m(u.seven_day), via: "HQ usage poll" };
      } catch (e) {}
    }
    renderUsage();
  }

  // ---------- Wiring ----------
  const closePanels = (except) => { for (const [id, b] of [["fl-rail", "fl-tr"], ["fl-chatpanel", "fl-chbtn"]]) if (id !== except) { $("#" + id).classList.remove("open"); $("#" + b).classList.remove("on"); } };
  const togglePanel = (id, b) => { const p = $("#" + id), o = !p.classList.contains("open"); closePanels(o ? id : ""); p.classList.toggle("open", o); $("#" + b).classList.toggle("on", o); renderAgents(); };
  $("#fl-tr").onclick = () => togglePanel("fl-rail", "fl-tr");
  $("#fl-chbtn").onclick = () => togglePanel("fl-chatpanel", "fl-chbtn");
  const all = () => { renderSafety(); renderCmp(); renderHead(); renderTape(); renderAlerts(); renderBook(); renderSig(); renderCurve(); renderAgents(); };
  function load(r) {
    const st = r.state; if (st) { S.desks = st.desks || {}; S.alerts = st.alerts || []; S.tape = st.tape || []; S.finishedAt = st.finishedAt || 0; S.flag = st.flag || ""; }
    S.health = r.health || { ok: true, why: [] }; S.running = !!r.running; S.stats = r.stats; S.sig = r.journal || {}; S.equity = r.equity || []; all();
  }
  async function refresh() {
    try { load(await hq.tfState()); if (!S.running || !S.ev.length) { S.ev = await hq.tfEvents(); renderAgents(); } } catch (e) {}
    if (S.autoPlay && !S.running && !S.play && S.ev.length) { S.autoPlay = false; startPlay(); } // idle: replay the last run
    refreshUsage();
  }
  hq.on("tf", async (m) => {
    if (m.t === "desk") { S.desks[m.id] = m.desk; renderHead(); if (m.id === "market" && m.desk.status === "done") { try { load(await hq.tfState()); } catch (e) {} } }
    else if (m.t === "msg" && m.ev) { if (m.ev.seq === 1) { S.ev = []; S.cur = -1; S.follow = true; } if (!S.ev.some((x) => x.seq === m.ev.seq && x.ts === m.ev.ts)) S.ev.push(m.ev); if (S.follow) renderAgents(); }
    else if (m.t === "start") { stopPlay(); S.autoPlay = false; S.running = true; S.alerts = []; S.ev = []; S.cur = -1; S.follow = true; renderAlerts(); renderHead(); renderAgents(); }
    else if (m.t === "done") { S.running = false; await refresh(); }
  });
  async function start(fn) { try { S.running = true; renderHead(); if ((await fn()) === false) await refresh(); } catch (e) { S.running = false; renderHead(); toast(e.message); } }
  $("#fl-go").onclick = () => start(() => hq.tfGo());
  $("#fl-resume").onclick = () => { if (confirm("Resume trading? The peak resets to current equity.")) start(() => hq.tfResume()); };
  $("#fl-kill").onclick = () => { if (confirm("KILL: close ALL paper positions and pause the agent?")) start(() => hq.tfKill()); };
  $("#fl-score").onclick = () => start(() => hq.tfScore());
  const clk = () => { $("#fl-clock").textContent = new Date().toLocaleTimeString([], { hour12: false }); };
  clk(); setInterval(clk, 1000);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("in-floor")) { const d = $("#fl-drawer"); if (!d.classList.contains("hidden")) d.classList.add("hidden"); else if (pinned) { pinned = ""; S.sel = ""; $("#fl-pop").classList.add("hidden"); O.focus(""); renderAgents(); } else if (document.querySelector(".fl-rail.open,.fl-chatpanel.open")) closePanels(""); else window.HQView("hq"); } });
  window.HQFloor = { shown: () => { S.autoPlay = true; refresh(); } };
  all(); refresh();
  setInterval(() => { if (document.body.classList.contains("in-floor")) { refreshUsage(); if (!S.running) refresh(); } }, 30000);
})();
