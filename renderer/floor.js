// Trading Floor panels: the HTML HUD of the Stocks floor in the tower (#tw-stonks). The 3D room is stonks3d.js, mounted by tower.js; this file owns the data, panels and controls.
// Data comes from Stonks/engine via main.js: IPC "tf" live lines (desk + msg events), tf-state, tf-events (replay), tf-usage, kn-*.
(function () {
  const $ = (s) => document.querySelector(s);
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  const NAME = { market: "Market Data", news: "News & Policy", sentiment: "Sentiment", analyst: "Analyst", debate: "Bull vs Bear", bull: "Bull", bear: "Bear", backtest: "Backtester", risk: "Risk Manager", lead: "Lead", score: "Scorekeeper", reflect: "Reflector", mirror: "Mirror" };
  const HUE = { market: "#4aa8ff", news: "#b58cff", sentiment: "#ff8fd0", analyst: "#ffb02e", bull: "#00f5a0", bear: "#ff3d6b", backtest: "#5ee6ff", risk: "#ff7a45", lead: "#ffe066", score: "#9ad17a", reflect: "#c0a0ff", mirror: "#ffb86b" };
  // seat angle in degrees clockwise from the top; bull (270) and bear (90) sit opposite each other
  const ANG = { news: 0, sentiment: 30, mirror: 60, bear: 90, backtest: 120, risk: 150, lead: 180, reflect: 210, score: 240, bull: 270, analyst: 300, market: 330 };
  const SEATS = Object.keys(ANG).concat("steady");
  const NEXT = { score: "market", market: "analyst", news: "analyst", sentiment: "analyst", mirror: "analyst", analyst: "bull", bull: "bear", bear: "backtest", debate: "backtest", backtest: "risk", risk: "lead", lead: "reflect", reflect: "" };
  const STAGES = [["SCORE", ["score"]], ["DATA", ["market", "news", "sentiment", "mirror"]], ["ANALYST", ["analyst"]], ["DEBATE", ["bull", "bear"]], ["BACKTEST", ["backtest"]], ["RISK", ["risk"]], ["LEAD", ["lead"]], ["REFLECT", ["reflect"]]];
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

  const matchSel = (m) => !S.sel || seatsFor(m.agent).includes(S.sel) || seatsFor(m.to || "").includes(S.sel);
  function renderAgents() {
    syncBusy();
    const ev = events(), n = ev.length; if (S.follow || S.cur >= n) S.cur = n - 1;
    const cur = S.cur, { st } = derive(ev, cur);
    notify(); const stp = $("#fl-stepper"); stp.textContent = "";
    STAGES.forEach(([label, ids], i) => { const ss = ids.map((x) => st[x].status), c = ss.includes("working") ? "working" : ss.includes("error") ? "error" : ss.every((x) => x === "done") ? "done" : ss.includes("done") ? "working" : ""; stp.append(mk("span", "stp " + c, label)); if (i < STAGES.length - 1) stp.append(mk("i")); });
    // scrubber
    const r = $("#fl-range"); r.max = Math.max(0, n - 1); r.value = Math.max(0, cur); $("#fl-spos").textContent = n ? (cur + 1) + "/" + n : "0/0";
    $("#fl-live").classList.toggle("on", S.follow); $("#fl-play").textContent = S.play ? "PAUSE" : "PLAY";
    // transcript
    const log = $("#fl-log"), keep = log.scrollTop, atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40; log.textContent = "";
    $("#fl-filter").textContent = S.sel ? NAME[S.sel] + " only (click the agent again to clear)" : "";
    if (!n) log.append(mk("div", "fl-empty", "No messages yet. Hit GO and watch the desks hand work to each other."));
    ev.forEach((m, i) => {
      if (!matchSel(m)) return;
      const sid = seatOf(m.agent), row = mk("div", "ln " + m.kind + (i === cur ? " cur" : "") + (i > cur ? " future" : "")); row.style.setProperty("--h", HUE[sid] || "#888");
      const h = mk("div", "lh"); h.append(mk("b", "", NAME[m.agent] || m.agent), mk("em", "", (m.to ? "→ " + NAME[m.to] : "") + (m.kind === "veto" ? "  VETO" : m.kind === "start" ? "  working" : m.kind === "error" ? "  error" : "")), mk("time", "", m.ts ? new Date(m.ts).toLocaleTimeString([], { hour12: false }) : ""));
      row.append(h, mk("div", "lt", m.text)); row.onclick = () => { S.follow = false; S.cur = i; stopPlay(); renderAgents(); }; log.append(row);
    });
    if (S.card) renderCard();
    if (S.follow || atEnd) { const c = log.querySelector(".cur"); if (c) log.scrollTop = c.offsetTop - log.clientHeight + c.offsetHeight + 8; else log.scrollTop = log.scrollHeight; } else log.scrollTop = keep;
  }
  function stopPlay() { if (S.play) { clearInterval(S.play); S.play = null; } }
  function startPlay() { const n = events().length; if (!n) return; S.follow = false; if (S.cur >= n - 1) S.cur = -1; S.play = setInterval(() => { const m = events().length; if (S.cur >= m - 1) { stopPlay(); S.follow = S.running; renderAgents(); return; } S.cur++; renderAgents(); }, 1400); renderAgents(); }
  $("#fl-play").onclick = () => (S.play ? (stopPlay(), renderAgents()) : startPlay());
  $("#fl-live").onclick = () => { stopPlay(); S.follow = true; renderAgents(); };
  $("#fl-range").oninput = (x) => { stopPlay(); S.follow = false; S.cur = +x.target.value; renderAgents(); };
  function renderTape() {
    const sig = JSON.stringify(S.tape); if (S.tapeSig === sig) return; S.tapeSig = sig;
    const t = S.tape.length ? S.tape : [{ s: "SPY", px: 0, chg: 0 }]; const inn = $("#fl-tape-in"); inn.textContent = "";
    for (const x of [...t, ...t]) { const s = mk("span", "fl-tk " + cls(x.chg)); s.append(mk("b", "", x.s), document.createTextNode((x.chg > 0 ? "▲ " : x.chg < 0 ? "▼ " : "") + (x.px ? x.px + " " : "") + sgn(x.chg) + "%")); inn.append(s); }
  }
  // ---------- plain-English ranking: actionable BUY/SELL, then WATCH, then "Passed on" ----------
  const vetoed = (a) => !!(a.vetoWhy && a.vetoWhy.length);
  const actionable = (a) => !vetoed(a) && ((a.action === "BUY" && a.plan && a.plan.shares > 0) || a.action === "SELL");
  const byConf = (x, y) => (y.confidence || 0) - (x.confidence || 0);
  function ranked() {
    const g = { act: [], watch: [], passed: [] };
    for (const a of S.alerts) (actionable(a) ? g.act : vetoed(a) ? g.passed : g.watch).push(a);
    g.act.sort(byConf); g.watch.sort(byConf); g.passed.sort(byConf); return g;
  }
  function statusLine(a) {
    if (actionable(a)) return a.action === "BUY" ? "Buy: the team approved this one" : "Sell: the team says take it off";
    if (vetoed(a)) { const w = a.vetoWhy.join(" ").toLowerCase(); return "Not buying: " + (/no edge|conviction|confidence/.test(w) ? "no clear edge" : /size|share|fits/.test(w) ? "too small to size safely" : /data/.test(w) ? "data looked unreliable" : "risk too high"); }
    return "Watching: interesting, not ready yet";
  }
  function card(a, rank, compact) {
    const c = mk("div", "fl-card " + a.action + (compact ? " compact" : "") + (rank === 1 ? " top1" : "")), top = mk("div", "top"), px = mk("div", "px");
    px.append(mk("div", "", a.px ? "$" + a.px : ""), mk("div", cls(a.chg), a.chg != null ? sgn(a.chg) + "% today" : ""));
    top.append(...(rank ? [mk("span", "rk", "#" + rank)] : []), mk("span", "act", a.action), mk("span", "tk", a.ticker), mk("span", "fl-strat " + (a.strategy || "Scanner"), (a.strategy || "Scanner").toUpperCase()), px); c.append(top, mk("div", "stline", statusLine(a)));
    if (!compact) c.append(mk("div", "thesis", short(a.thesis, 120)));
    if (!compact && a.confidence != null) { const cf = mk("div", "fl-conf"), bar = mk("i"), fill = mk("b"); fill.style.width = Math.max(0, Math.min(100, a.confidence || 0)) + "%"; bar.append(fill); cf.append(mk("span", "", "CONFIDENCE " + (a.confidence || 0) + "/100"), bar); c.append(cf); }
    if (!compact && a.plan && a.plan.shares > 0) {
      const l = mk("div", "fl-lad"); [["BUY NEAR", a.plan.entry, ""], ["STOP-LOSS", a.plan.stop, "s"], [a.strategy === "Steady" ? "52W HIGH" : "TAKE PROFIT", a.plan.t1, "t"]].filter((x) => x[1] != null).forEach(([k, v, z]) => { const d = mk("div", z); d.append(mk("small", "", k), document.createTextNode("$" + v)); l.append(d); }); c.append(l);
    }
    c.title = "Click for the full reasoning"; c.onclick = () => openDrawer(a); return c;
  }
  // holds (Steady / Mirror / Scanner) that hit their target or stop-loss
  function holdsNeedingAction() {
    const out = []; for (const p of (S.stats && S.stats.positions) || []) { if (p.status !== "open" || p.last == null) continue; const st = p.strat || "Scanner";
      const sh = p.side === "short";
      if (p.t1 != null && (sh ? p.last <= p.t1 : p.last >= p.t1)) out.push({ p, txt: st + ": sell " + p.ticker + (st === "Steady" ? " - hit a new high ($" + p.last + ")" : " - hit its profit target ($" + p.last + ")") });
      else if (p.stop != null && (sh ? p.last >= p.stop : p.last <= p.stop)) out.push({ p, txt: st + ": sell " + p.ticker + " - fell to its stop-loss ($" + p.last + ")" }); }
    return out;
  }
  function ensureHero() {
    let h = $("#fl-hero"); if (h) return h; const board = $(".fl-board"); if (!board) return null;
    h = mk("section", "fl-hero"); h.id = "fl-hero"; board.insertBefore(h, board.firstChild);
    const hd = board.querySelector(".fl-h"), q = mk("button", "fl-q", "?"); q.title = "What do these words mean?"; q.setAttribute("aria-label", "Explain the signal words");
    const lg = mk("div", "fl-legend hidden"); lg.id = "fl-legend";
    [["BUY", "The team thinks this is worth buying now."], ["WATCH", "Interesting, but not ready. Do nothing yet."], ["PASSED", "The Risk Manager said no. Skipped."], ["BUY NEAR", "The price to buy at."], ["STOP-LOSS", "An automatic sell if the price falls here. It caps your loss."], ["TAKE PROFIT", "The price to sell and bank the gain."], ["CONFIDENCE", "0 to 100. How sure the team is. Under 60 never trades."]].forEach(([k, v]) => { const d = mk("div"); d.append(mk("b", "", k), document.createTextNode(" " + v)); lg.append(d); });
    q.onclick = () => lg.classList.toggle("hidden"); hd.append(q); hd.after(lg); return h;
  }
  function renderHero() {
    const h = ensureHero(); if (!h) return; h.textContent = ""; const g = ranked(), holds = holdsNeedingAction(), pick = g.act[0];
    h.className = "fl-hero " + (pick ? pick.action : "calm");
    const head = mk("div", "hh"); head.append(mk("span", "ht", "TODAY'S MOVE")); if (pick) head.append(mk("span", "fl-strat " + (pick.strategy || "Scanner"), (pick.strategy || "Scanner").toUpperCase())); h.append(head);
    if (pick) {
      const p = pick.plan, big = mk("div", "hb"); big.append(mk("span", "hact " + pick.action, pick.action), mk("span", "htk", pick.ticker)); h.append(big);
      h.append(mk("div", "hsay", pick.action === "BUY" ? "Buy " + p.shares + " share" + (p.shares === 1 ? "" : "s") + " of " + pick.ticker + " at about $" + p.entry : "Sell " + pick.ticker + (pick.px ? " at about $" + pick.px : "")));
      const k = mk("div", "hk"); const kv = (lab, val, c, tip) => { const d = mk("div", c); d.append(mk("small", "", lab), document.createTextNode(val)); if (tip) d.title = tip; k.append(d); };
      if (p) { kv("STOP-LOSS", "$" + p.stop, "s", "Sell if it falls here"); if (p.t1 != null) kv("TAKE PROFIT", "$" + p.t1, "t", "Sell here to bank the gain"); }
      kv("CONFIDENCE", (pick.confidence || 0) + "/100", ""); h.append(k);
      h.append(mk("div", "hwhy", "Why: " + short(pick.thesis, 150)));
      h.onclick = () => openDrawer(pick); h.title = "Click for the full reasoning"; h.classList.add("clk");
      g.act.slice(1, 3).forEach((a, i) => { const r = mk("div", "hrun"); r.append(mk("b", "", "#" + (i + 2) + " " + a.action + " " + a.ticker), document.createTextNode(" " + (a.confidence || 0) + "/100 " + (a.strategy || "Scanner"))); r.onclick = (e) => { e.stopPropagation(); openDrawer(a); }; h.append(r); });
    } else {
      h.onclick = null; h.title = ""; h.classList.remove("clk");
      h.append(mk("div", "hcalm", "No trade right now"), mk("div", "hsay", "The team found nothing worth the risk. Sitting out is a valid move."), mk("div", "hsub", (S.finishedAt ? "Last checked " + new Date(S.finishedAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) + " (" + ago(S.finishedAt) + ")" : "Not checked yet") + ". Press GO to scan again."));
    }
    if (holds.length) { const hb = mk("div", "hhold"); hb.append(mk("small", "", "NEEDS ACTION")); holds.slice(0, 3).forEach((x) => hb.append(mk("div", "", x.txt))); h.append(hb); }
  }
  function renderAlerts() {
    renderHero(); const box = $("#fl-alerts"); box.textContent = "";
    if (!S.alerts.length) { box.append(mk("div", "fl-empty", "No alerts yet. Hit GO to send the desks to work.")); $("#fl-when").textContent = ""; return; }
    const g = ranked(); let n = 0;
    [...g.act, ...g.watch].forEach((a) => box.append(card(a, ++n)));
    if (g.passed.length) {
      const f = mk("button", "fl-fold", (S.passedOpen ? "▾ " : "▸ ") + "Passed on (" + g.passed.length + ")"); f.onclick = () => { S.passedOpen = !S.passedOpen; renderAlerts(); }; box.append(f);
      if (S.passedOpen) g.passed.forEach((a) => box.append(card(a, 0, true)));
    }
    const t = S.alerts[0] && S.alerts[0].ts; $("#fl-when").textContent = t ? new Date(t).toLocaleString([], { hour: "numeric", minute: "2-digit" }) : "";
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
    const rows = [["SCANNER", s.retPct, s.trades + " closed · " + s.open + " open"], ["STEADY", s.steady.retPct, s.steady.trades + " closed · " + s.steady.open + " open"], ...(s.mirror ? [["MIRROR", s.mirror.retPct, s.mirror.trades + " closed · " + s.mirror.open + " open"]] : []), ["SPY", s.spy && s.spy.retPct, s.spy && s.spy.since ? "since " + new Date(s.spy.since).toLocaleDateString() : "benchmark"]];
    for (const [k, v, n] of rows) { const d = mk("div", "t " + k); d.append(mk("small", "", k), mk("b", cls(v), v == null ? "--" : sgn(v) + "%"), mk("em", "", n)); box.append(d); }
    if (s.review && s.review.due) box.append(mk("div", "rev", "Steady watchlist review due (every " + s.review.every + " days)"));
  }
  function renderSig() {
    const box = $("#fl-sig"); box.textContent = ""; const e = Object.entries(S.sig).sort((a, b) => b[1].n - a[1].n);
    if (!e.length) { box.append(mk("div", "fl-empty", "Signals are scored once trades close.")); return; }
    for (const [k, v] of e) { const r = mk("div", "fl-row"), n = mk("span", "", k); if (v.demoted) n.append(mk("span", "dem", "DEMOTED")); r.append(n, mk("span", "pl " + cls(v.pnl), Math.round(v.winRate * 100) + "% · " + v.n + " · " + usd(v.pnl))); box.append(r); }
  }

  // ---------- Agent card: click a desk in the 3D room (stocks3d.js) -> the drawer shows that agent's latest output ----------
  const AG_NAME = Object.assign({}, NAME, { steady: "Steady Desk", hub: "Lead Hub", debate: "Bull vs Bear" });
  function closeCard() { if (window.HQStocks3D && HQStocks3D.focused()) HQStocks3D.unfocus(); else agentClose(); }
  function agentClose() { if (!S.card) return; const id = S.card; S.card = null; $("#fl-drawer").classList.add("hidden"); if (S.sel === id) { S.sel = ""; renderAgents(); } }
  function agentCard(id) { S.card = id; S.sel = ANG[id] != null ? id : ""; renderAgents(); }
  function renderCard() {
    const id = S.card, d = $("#fl-drawer"), ev = events(), cur = Math.min(S.cur, ev.length - 1); d.textContent = ""; d.classList.remove("hidden");
    const mine = (e) => (id === "hub" ? !!e.to : id === "steady" ? /steady/i.test(e.text || "") : id === "debate" ? ["debate", "bull", "bear"].includes(e.agent) : e.agent === id), upto = ev.slice(0, cur + 1), list = upto.filter(mine), last = list[list.length - 1], st = derive(ev, cur).st;
    const sid = id === "hub" ? "lead" : id === "debate" ? "bear" : id, stat = id === "steady" ? (list.length && Date.now() - (last.ts || 0) < 6e4 ? "working" : "idle") : id === "hub" ? "routing" : (st[sid] || {}).status || "idle";
    const x = mk("button", "fl-btn ghost", "CLOSE"); x.onclick = closeCard;
    const top = mk("div", "dtop"); top.append(mk("b", "tk ag", AG_NAME[id] || id), mk("span", "dst " + stat, stat.toUpperCase()), mk("span", "spacer"), x); d.style.setProperty("--h", id === "debate" ? "#ffb02e" : HUE[sid] || "#4aa8ff"); d.append(top);
    d.append(mk("div", "fl-h", "LATEST OUTPUT"));
    if (last) { d.append(mk("div", "dpx", (last.ts ? new Date(last.ts).toLocaleTimeString([], { hour12: false }) + "  " : "") + last.kind + (last.to ? "  → " + (AG_NAME[last.to] || last.to) : "")), mk("p", "dth dtxt", last.text || "")); }
    else d.append(mk("p", "dth", id === "steady" ? "No Steady activity in this run yet." : "Nothing yet. This desk has not reported in this run."));
    if (id === "steady" && S.stats && S.stats.steady) { const t = S.stats.steady; d.append(mk("div", "fl-h", "STEADY SLEEVE"), mk("p", "dth", sgn(t.retPct) + "% return · " + t.open + " open · " + t.trades + " closed")); }
    const rec = list.slice(-8, -1).reverse(); if (rec.length) { d.append(mk("div", "fl-h", id === "hub" ? "RECENT HANDOFFS" : "EARLIER THIS RUN")); const ul = mk("ul", "dl"); rec.forEach((e) => ul.append(mk("li", "", (id === "hub" ? (AG_NAME[e.agent] || e.agent) + " → " + (AG_NAME[e.to] || e.to) + ": " : e.kind + ": ") + short(e.text, 160)))); d.append(ul); }
  }

  // ---------- Signals drawer ----------
  function openDrawer(a) {
    if (S.card) { S.card = null; if (window.HQStocks3D && HQStocks3D.focused()) HQStocks3D.unfocus(); }
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
    const series = [["TOTAL", "#ffb02e", h.map((p) => pct(p.total))], ["SCANNER", "#00f5a0", h.map((p) => (p.scanner == null ? null : (p.scanner / ((s.sleeves && s.sleeves.scanner) || cap / 2) - 1) * 100))], ["STEADY", "#4aa8ff", h.map((p) => (p.steady == null ? null : (p.steady / ((s.sleeves && s.sleeves.steady) || cap / 2) - 1) * 100))], ["MIRROR", "#ffb86b", h.map((p) => (p.mirror == null || !(s.sleeves && s.sleeves.mirror) ? null : (p.mirror / s.sleeves.mirror - 1) * 100))], ["SPY", "#8a9a94", h.map((p) => p.spy)]];
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
    syncBusy();
    const s = S.stats, eq = s && (s.totalEquity != null ? s.totalEquity : s.equity), cap = s && (s.capital || 0);
    $("#fl-eq").textContent = eq == null ? "--" : usd(eq);
    const ret = eq != null && cap ? Math.round((eq / cap - 1) * 10000) / 100 : null, spy = s && s.spy && s.spy.retPct;
    const r = $("#fl-ret"); r.textContent = ret == null ? "--" : sgn(ret) + "%"; r.className = cls(ret);
    const vs = ret != null && spy != null ? Math.round((ret - spy) * 100) / 100 : null, v = $("#fl-vs"); v.textContent = vs == null ? "--" : sgn(vs) + " pts"; v.className = cls(vs); v.title = spy != null ? "SPY " + sgn(spy) + "% over the same period" : "";
    notify(); const w = Object.values(S.desks).filter((d) => d.status === "working");
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
    // the statusline file only updates in interactive Claude Code sessions in Stocks; HQ chats run headless, so fall back to HQ's own usage poll
    if (!S.usage || !S.usage.updated || Date.now() - S.usage.updated > 15 * 60000) {
      try {
        const r = await hq.usage(false), u = r && r.usage, m = (x) => (x && x.utilization != null ? { used_percentage: x.utilization, resets_at: x.resets_at ? Math.floor(new Date(x.resets_at).getTime() / 1000) : null } : null);
        if (u && (m(u.five_hour) || m(u.seven_day))) S.usage = { updated: Date.now(), five_hour: m(u.five_hour), seven_day: m(u.seven_day), via: "HQ usage poll" };
      } catch (e) {}
    }
    renderUsage();
  }

  // ---------- Wiring ----------
  // ---------- API for the 3D room and the tower ----------
  const listeners = [];
  let dv = null;
  const notify = () => { dv = null; listeners.forEach((f) => { try { f(); } catch (e) {} }); };
  function deskView() { if (dv) return dv; // seat status/text for the 3D desks: derived from the (replayed) events, live desk cards win while a run is following
    const ev = events(), d = derive(ev, S.cur), st = d.st, cur = ev[S.cur] || null;
    if (S.running && S.follow) for (const id in S.desks) { const k = S.desks[id]; if (k && k.status === "working") seatsFor(id).forEach((x) => { if (st[x]) { st[x].status = "working"; if (!st[x].text) st[x].text = k.step || ""; } }); }
    return (dv = { st, cur, veto: d.veto, running: S.running });
  }
  const all = () => { collapsibles(); renderSafety(); renderCmp(); renderHead(); renderTape(); renderAlerts(); renderBook(); renderSig(); renderCurve(); renderAgents(); };
  const busy = () => !!(S.running || S.play);
  function syncBusy() { const t = $("#tw-stonks"); if (t) t.classList.toggle("fl-busy", busy()); }
  function collapsibles() { // book/safety panels: compact, click a header to fold; Paper Book open by default
    if (S.coll) return; S.coll = true; let saved = {}; try { saved = JSON.parse(localStorage.getItem("flcoll2") || "{}"); } catch (e) {}
    document.querySelectorAll(".fl-rcol > .fl-sc").forEach((p, i) => { const hd = p.querySelector(".fl-h"); if (!hd) return; const key = (hd.textContent || "").trim().slice(0, 12) || "p" + i; hd.classList.add("fold"); p.classList.toggle("collapsed", key in saved ? !!saved[key] : false);
      hd.onclick = () => { const c = p.classList.toggle("collapsed"); saved[key] = c; try { localStorage.setItem("flcoll2", JSON.stringify(saved)); } catch (e) {} }; });
  }
  function load(r) {
    if (S.preview) return; // dev screenshot hook: HQFloor.preview() freezes the data
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
  window.HQFloor = {
    shown: (on) => { S.active = on !== false; if (S.active) { S.autoPlay = true; refresh(); } else { stopPlay(); closeCard(); } },
    events: () => events(), cur: () => S.cur, active: () => !!S.active, agentCard, agentClose,
    preview: (al, pos) => { S.preview = true; S.alerts = al; if (pos && S.stats) S.stats = Object.assign({}, S.stats, { positions: pos }); all(); }, running: () => S.running, busy, desks: deskView, onChange: (f) => listeners.push(f), NAME, HUE, ANG, SEATS,
    data: () => ({ tape: S.tape, equity: S.equity, alerts: S.alerts, stats: S.stats }),
    select: (seat) => { S.sel = S.sel === seat ? "" : seat; renderAgents(); }, selected: () => S.sel,
    escape: () => { if (S.card) { closeCard(); return true; } const d = $("#fl-drawer"); if (!d.classList.contains("hidden")) { d.classList.add("hidden"); return true; } if (S.sel) { S.sel = ""; renderAgents(); return true; } return false; },
  };
  all(); refresh();
  setInterval(() => { if (S.active) { refreshUsage(); if (!S.running) refresh(); } }, 30000);
})();
