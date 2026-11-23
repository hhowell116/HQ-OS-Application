// Trading Floor panels: the HTML HUD of the Stocks floor in the tower (#tw-stonks). The 3D room is stocks3d.js, mounted by tower.js; this file owns the data, panels and controls.
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
  // render gate: a panel only rebuilds its DOM when its inputs actually changed (rebuilding on every poll/tick made the HUD flash)
  const memo = {}; const changed = (k, v) => { const x = JSON.stringify(v); if (memo[k] === x) return false; memo[k] = x; return true; };
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

  const matchSel = (m) => (!S.kind || m.kind === S.kind) && (!S.sel || seatsFor(m.agent).includes(S.sel) || seatsFor(m.to || "").includes(S.sel));
  function renderAgents() {
    syncBusy();
    const ev = events(), n = ev.length; if (S.follow || S.cur >= n) S.cur = n - 1;
    const cur = S.cur, { st } = derive(ev, cur);
    notify(); const lastE = ev[n - 1] || {}; if (!changed("ag", [n, cur, lastE.ts, lastE.seq, S.follow, !!S.play, S.sel, S.kind, !!S.dv, S.card, S.running, !!S.cardOpen, Object.keys(S.desks).map((k) => k + ":" + (S.desks[k] && S.desks[k].status))])) return;
    const stp = $("#fl-stepper"); stp.textContent = "";
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
    if (S.card) renderCard(); renderDv();
    if (S.hold) log.scrollTop = keep; else if (S.follow || atEnd) { const c = log.querySelector(".cur"); if (c) log.scrollTop = c.offsetTop - log.clientHeight + c.offsetHeight + 8; else log.scrollTop = log.scrollHeight; } else log.scrollTop = keep;
  }
  function stopPlay() { if (S.play) { clearInterval(S.play); S.play = null; } }
  function startPlay() { const n = events().length; if (!n) return; S.follow = false; if (S.cur >= n - 1) S.cur = -1; S.play = setInterval(() => { const m = events().length; if (S.cur >= m - 1) { stopPlay(); S.follow = S.running; renderAgents(); return; } S.cur++; renderAgents(); }, 1400); renderAgents(); }
  $("#fl-play").onclick = () => (S.play ? (stopPlay(), renderAgents()) : startPlay());
  $("#fl-live").onclick = () => { stopPlay(); S.follow = true; S.hold = false; renderAgents(); };
  { const l = $("#fl-log"); let us = 0; const mk_ = () => (us = Date.now()); // user scrolled up in the transcript: stop auto-scrolling (replay/live) until they return to the bottom or press LIVE
    ["wheel", "touchmove", "mousedown", "keydown"].forEach((e) => l.addEventListener(e, mk_, { passive: true }));
    l.addEventListener("scroll", () => { if (Date.now() - us < 800) S.hold = l.scrollHeight - l.scrollTop - l.clientHeight > 40; }); }
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
    px.append(mk("div", "", a.px ? "$" + a.px : ""), mk("div", cls(a.chg), a.chg != null ? sgn(a.chg) + "%" + " today" : ""));
    top.append(...(rank ? [mk("span", "rk", "#" + rank)] : []), mk("span", "act", a.action), mk("span", "tk", a.ticker), mk("span", "fl-strat " + (a.strategy || "Scanner"), (a.strategy || "Scanner").toUpperCase()), px); c.append(top, mk("div", "stline", statusLine(a)));
    if (!compact) c.append(Object.assign(mk("div", "thesis", short(a.thesis, 120)), { title: a.thesis || "" }));
    if (!compact && a.confidence != null) { const cf = mk("div", "fl-conf"), bar = mk("i"), fill = mk("b"); fill.style.width = Math.max(0, Math.min(100, a.confidence || 0)) + "%"; bar.append(fill); cf.dataset.c = a.confidence || 0; cf.append(mk("span", "", "CONFIDENCE " + (a.confidence || 0) + "/100"), bar); c.append(cf); }
    if (!compact && a.plan && a.plan.shares > 0) {
      const l = mk("div", "fl-lad"); [["BUY NEAR", a.plan.entry, ""], ["STOP-LOSS", a.plan.stop, "s"], [a.strategy === "Steady" ? "52W HIGH" : "TAKE PROFIT", a.plan.t1, "t"]].filter((x) => x[1] != null).forEach(([k, v, z]) => { const d = mk("div", z); d.append(mk("small", "", k), document.createTextNode("$" + v)); l.append(d); }); c.append(l);
    }
    if (isLive() && !compact && (a.action === "BUY" || a.action === "SELL") && a.plan && a.plan.shares > 0 && a.id) {
      const o = orderFor(a.id), ap = mk("div", "fl-appr"), btn = mk("button", "fl-btn fl-approve", o ? "RECORDED" : "APPROVE"); btn.disabled = !!o; btn.title = "Records this order. Live orders are OFF, so nothing is sent.";
      btn.onclick = async (e) => { e.stopPropagation(); if (!confirm("Approve: " + orderTxt(a) + " - " + "Live orders are OFF, so this only records the order as blocked.")) return; try { await hq.tfCmd(["live-approve", a.id]); } catch (x) { toast(x.message); } };
      ap.append(mk("span", "fl-ot", orderTxt(a)), btn); if (o) ap.append(mk("em", "", o.status)); c.append(ap);
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
    if (!changed("al", [S.mode, S.live && S.live.orders, S.alerts, S.passedOpen, S.finishedAt, S.stats && S.stats.positions, Math.floor(Date.now() / 60000)])) return;
    renderHero(); const box = $("#fl-alerts"), keepTop = box.scrollTop; box.textContent = "";
    if (!S.alerts.length) { box.append(mk("div", "fl-empty", "No alerts yet. Hit GO to send the desks to work.")); $("#fl-when").textContent = ""; return; }
    const g = ranked(); let n = 0;
    [...g.act, ...g.watch].forEach((a) => box.append(card(a, ++n)));
    if (g.passed.length) {
      const f = mk("button", "fl-fold", (S.passedOpen ? "▾ " : "▸ ") + "Passed on (" + g.passed.length + ")"); f.onclick = () => { S.passedOpen = !S.passedOpen; renderAlerts(); }; box.append(f);
      if (S.passedOpen) g.passed.forEach((a) => box.append(card(a, 0, true)));
    }
    const t = S.alerts[0] && S.alerts[0].ts; $("#fl-when").textContent = t ? new Date(t).toLocaleString([], { hour: "numeric", minute: "2-digit" }) : ""; box.scrollTop = keepTop;
  }
  function renderBook() {
    if (!changed("bk", S.stats)) return;
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
    if (!changed("sf", [S.stats && S.stats.safety, S.stats && S.stats.limits, S.health, S.flag])) return;
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
    if (!changed("cmp", S.stats)) return;
    const s = S.stats, box = $("#fl-cmp"); box.textContent = ""; if (!s || !s.steady) return;
    const rows = [["SCANNER", s.retPct, s.trades + " closed · " + s.open + " open"], ["STEADY", s.steady.retPct, s.steady.trades + " closed · " + s.steady.open + " open"], ...(s.mirror ? [["MIRROR", s.mirror.retPct, s.mirror.trades + " closed · " + s.mirror.open + " open"]] : []), ["SPY", s.spy && s.spy.retPct, s.spy && s.spy.since ? "since " + new Date(s.spy.since).toLocaleDateString() : "benchmark"]];
    for (const [k, v, n] of rows) { const d = mk("div", "t " + k); d.append(mk("small", "", k), mk("b", cls(v), v == null ? "--" : sgn(v) + "%"), mk("em", "", n)); box.append(d); }
    if (s.review && s.review.due) box.append(mk("div", "rev", "Steady watchlist review due (every " + s.review.every + " days)"));
  }
  function renderSig() {
    if (!changed("sig", S.sig)) return;
    const box = $("#fl-sig"); box.textContent = ""; const e = Object.entries(S.sig).sort((a, b) => b[1].n - a[1].n);
    if (!e.length) { box.append(mk("div", "fl-empty", "Signals are scored once trades close.")); return; }
    for (const [k, v] of e) { const r = mk("div", "fl-row"), n = mk("span", "", k); if (v.demoted) n.append(mk("span", "dem", "DEMOTED")); r.append(n, mk("span", "pl " + cls(v.pnl), Math.round(v.winRate * 100) + "% · " + v.n + " · " + usd(v.pnl))); box.append(r); }
  }

  // ---------- Usage line: tokens from claude -p JSON; % only when the statusline file refreshed during the run ----------
  const kTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n || 0));
  function usageLine() {
    const u = S.usage; if (!u || !u.total) return " · Last run: —";
    const p = u.pct, pc = (v) => (v == null ? "—" : (v < 0.1 && v > 0 ? "<0.1" : v) + "%");
    return " · Last run: " + kTok(u.total.tokens) + " tokens · " + (p ? "~" + pc(p.session) + " session · " + pc(p.week) + " week" : "— session · — week");
  }
  // ---------- Agent card: click a desk in the 3D room (stocks3d.js) -> the drawer shows that agent's latest output ----------
  const AG_NAME = Object.assign({}, NAME, { steady: "Steady Desk", hub: "Lead Hub", debate: "Bull vs Bear" });
  function closeCard() { if (window.HQStocks3D && HQStocks3D.focused()) HQStocks3D.unfocus(); else agentClose(); }
  function agentClose() { if (!S.card) return; const id = S.card; S.card = null; $("#fl-drawer").classList.add("hidden"); if (S.sel === id) { S.sel = ""; renderAgents(); } }
  function agentCard(id) { delete memo.ag; S.card = id; S.sel = ANG[id] != null ? id : ""; renderAgents(); }
  function renderCard() {
    const id = S.card, d = $("#fl-drawer"), ev = events(), cur = Math.min(S.cur, ev.length - 1); d.textContent = ""; d.classList.remove("hidden");
    const mine = (e) => (id === "hub" ? !!e.to : id === "steady" ? /steady/i.test(e.text || "") : id === "debate" ? ["debate", "bull", "bear"].includes(e.agent) : e.agent === id), upto = ev.slice(0, cur + 1), list = upto.filter(mine), last = list[list.length - 1], st = derive(ev, cur).st;
    const sid = id === "hub" ? "lead" : id === "debate" ? "bear" : id, stat = id === "steady" ? (list.length && Date.now() - (last.ts || 0) < 6e4 ? "working" : "idle") : id === "hub" ? "routing" : (st[sid] || {}).status || "idle";
    const x = mk("button", "fl-btn ghost", "CLOSE"); x.onclick = closeCard;
    const top = mk("div", "dtop"); top.append(mk("b", "tk ag", AG_NAME[id] || id), mk("span", "dst " + stat, stat.toUpperCase()), mk("span", "spacer"), x); d.style.setProperty("--h", id === "debate" ? "#ffb02e" : HUE[sid] || "#4aa8ff"); d.append(top);
    { const bd = S.usage && S.usage.byDesk && S.usage.byDesk[id === "hub" ? "lead" : id], u = S.usage; d.append(mk("div", "fl-h", "TOKENS (LAST RUN)"), mk("p", "dth", bd ? kTok(bd.tokens) + " tokens · " + bd.calls + " call" + (bd.calls === 1 ? "" : "s") + " · in " + kTok(bd.in) + " / out " + kTok(bd.out) + " / cache " + kTok(bd.cacheWrite + bd.cacheRead) + (bd.cost ? " · $" + bd.cost.toFixed(3) : "") : "—")); }
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
    if (!changed("cv", [S.equity, S.stats && S.stats.capital, S.stats && S.stats.sleeves])) return;
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
    if (!changed("hd", [eq, cap, s && s.spy, S.running, S.finishedAt, Object.values(S.desks).filter((d) => d.status === "working").map((d) => d.name)])) { notify(); return; }
    $("#fl-eq").textContent = eq == null ? "--" : usd(eq);
    const ret = eq != null && cap ? Math.round((eq / cap - 1) * 10000) / 100 : null, spy = s && s.spy && s.spy.retPct;
    const r = $("#fl-ret"); r.textContent = ret == null ? "--" : sgn(ret) + "%"; r.className = cls(ret);
    const vs = ret != null && spy != null ? Math.round((ret - spy) * 100) / 100 : null, v = $("#fl-vs"); v.textContent = vs == null ? "--" : sgn(vs) + " pts"; v.className = cls(vs); v.title = spy != null ? "SPY " + sgn(spy) + "% over the same period" : "";
    notify(); const w = Object.values(S.desks).filter((d) => d.status === "working");
    $("#fl-sub").textContent = S.running ? (w.length ? w.map((d) => d.name).join(" + ") + " working" : "run in progress") : S.finishedAt ? "last run " + new Date(S.finishedAt).toLocaleTimeString() + usageLine() : "desks idle";
    const go = $("#fl-go"); go.textContent = S.running ? "RUNNING" : "GO"; go.classList.toggle("run", S.running); go.disabled = S.running; $("#fl-score").disabled = S.running;
  }
  const lvl = (p) => (p >= 80 ? "r" : p >= 50 ? "a" : "g");
  const until = (sec) => { const m = Math.max(0, Math.round((sec * 1000 - Date.now()) / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60); return d ? d + "d " + h + "h" : h ? h + "h " + (m % 60) + "m" : (m % 60) + "m"; };
  function renderUsage() {
    if (!changed("use", [S.usage, Math.floor(Date.now() / 60000)])) return;
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
  // ---------- DATA VIEW: dense dashboard over the same panels (CSS re-layout in floor.css, class .dv on #tw-stonks). Entered from the wall button in the 3D room. ----------
  const ROLE = { market: "prices & data", news: "news & policy", sentiment: "social mood", analyst: "picks ideas", bull: "argues buy", bear: "argues pass", backtest: "tests history", risk: "sizes & vetoes", lead: "final call", score: "prices book", reflect: "lessons", mirror: "copy trades", steady: "long holds" };
  const sAgo = (ts) => { if (!ts) return "--"; const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 60 ? s + "s" : s < 3600 ? Math.floor(s / 60) + "m" : s < 86400 ? Math.floor(s / 3600) + "h" : Math.floor(s / 86400) + "d"; };
  function renderDv() {
    if (!S.dv) return; const box = $("#fl-agstrip"), ev = events(), { st } = derive(ev, S.cur), last = {}; if (!box) return;
    for (let i = 0; i <= S.cur && i < ev.length; i++) seatsFor(ev[i].agent).forEach((x) => (last[x] = ev[i]));
    box.textContent = "";
    SEATS.forEach((id) => {
      const s = st[id] || { status: "idle", text: "" }, e = last[id], b = mk("div", "dvag " + s.status + (S.sel === id ? " sel" : "")), h = mk("div", "dvah"), full = s.text || "no activity yet";
      b.style.setProperty("--h", HUE[id] || "#4aa8ff"); h.append(mk("i", "dvdt"), mk("b", "", AG_NAME[id] || id), mk("em", "", ROLE[id] || ""), mk("time", "", sAgo(e && e.ts)));
      b.append(h, mk("div", "dvl", short(full, 80))); b.title = (AG_NAME[id] || id) + " · " + s.status + "\n" + full; b.onclick = () => { S.sel = S.sel === id ? "" : id; renderAgents(); }; box.append(b);
    });
    const kb = $("#fl-kinds"); if (kb) { kb.textContent = ""; const cnt = {}; ev.forEach((m) => (cnt[m.kind] = (cnt[m.kind] || 0) + 1));
      [["", "ALL", ev.length], ...Object.keys(cnt).map((k) => [k, k.toUpperCase(), cnt[k]])].forEach(([k, l, n]) => { const c = mk("button", "kc" + ((S.kind || "") === k ? " on" : ""), l + " " + n); c.onclick = () => { S.kind = k; renderAgents(); }; kb.append(c); }); }
  }
  const DVK = "hqStocksDV", dvStore = (v) => { try { sessionStorage.setItem(DVK, v ? "1" : "0"); } catch (e) {} };
  function dvApply(on) { S.dv = on; const t = $("#tw-stonks"), tv = $("#tower-view"); t.classList.toggle("dv", on); if (tv) tv.classList.toggle("stk-dv", on); $("#fl-view").classList.toggle("hidden", !on); if (on) renderAgents(); notify(); }
  function dvSwap(fn) { const t = $("#tw-stonks"); t.style.transition = "opacity .2s"; t.style.opacity = "0"; setTimeout(() => { fn(); t.style.opacity = ""; setTimeout(() => { t.style.transition = ""; }, 260); }, 200); } // 0.4s cross-fade of the whole HUD
  function dvEnter(instant, n) {
    if (S.dv || S.dvBusy) return; const fp = window.HQStocks3D && HQStocks3D.wallFocus && HQStocks3D.wallFocus();
    if (instant && !fp) { if ((n || 0) < 30 && S.active) setTimeout(() => dvEnter(true, (n || 0) + 1), 100); return; }
    dvStore(true); if (fp && window.HQTower) { HQTower.setFocus(fp); S.focusSet = true; }
    if (instant) { dvApply(true); return; }
    S.dvBusy = true; setTimeout(() => dvSwap(() => { dvApply(true); S.dvBusy = false; }), 800); // camera pushes in ~0.8s, then cross-fade
  }
  function dvExit() {
    if (!S.dv || S.dvBusy) return; dvStore(false); S.dvBusy = true;
    dvSwap(() => { dvApply(false); setTimeout(() => { if (S.focusSet && window.HQTower) { HQTower.clearFocus(); S.focusSet = false; } S.dvBusy = false; }, 60); }); // fade back, then the camera eases back to the desk
  }
  { const b = mk("button", "fl-btn ghost hidden", "DESK VIEW"); b.id = "fl-view"; b.title = "Back to the 3D desk (Esc)"; b.onclick = dvExit; b.className += " fl-viewbtn"; const sc = $("#fl-score"); sc.parentNode.insertBefore(b, sc);
    const ag = mk("div", "fl-agstrip"); ag.id = "fl-agstrip"; $("#tw-stonks").insertBefore(ag, $(".fl-board"));
    const kd = mk("span", "fl-kinds"); kd.id = "fl-kinds"; $(".fl-scrub").append(kd); }
  setInterval(() => { if (S.dv && S.active) renderDv(); }, 5000);
  const all = () => { collapsibles(); renderSafety(); renderCmp(); renderHead(); renderTape(); renderAlerts(); renderBook(); renderSig(); renderCurve(); renderAgents(); renderLive(); };
  // ---------- PAPER / LIVE mode. LIVE = read-only view of the agent's real account + locked order approvals (no order is sent while live orders are off). ----------
  const isLive = () => S.mode === "live";
  const orderTxt = (a) => { const p = a.plan || {}; return (a.action === "SELL" ? "SELL " : "BUY ") + p.shares + " " + a.ticker + " limit $" + p.entry + " · stop $" + p.stop + " · est. $" + Math.round((p.shares || 0) * (p.entry || 0)); };
  const orderFor = (id) => ((S.live && S.live.orders) || []).filter((o) => o.alertId === id).pop();
  function applyMode() {
    const t = $("#tw-stonks"), live = isLive(); if (!t) return;
    t.classList.toggle("live", live); const tv = $("#tower-view"); if (tv) tv.classList.toggle("stk-live", live);
    const b = $("#fl-mode"); if (b) { b.textContent = live ? "LIVE" : "PAPER"; b.className = "fl-btn fl-mode " + (live ? "live" : "paper"); b.title = live ? "LIVE view (real account, read-only). Click to go back to PAPER." : "PAPER mode. Click to switch to LIVE (read-only real account view; orders stay locked)."; }
    const g = $("#fl-livebadge"); if (g) g.classList.toggle("hidden", !live);
  }
  function renderLive() {
    applyMode(); const box = $("#fl-live"); if (!box) return;
    if (!changed("live", [S.mode, S.live, Math.floor(Date.now() / 30000)])) return; box.textContent = "";
    if (!isLive()) return;
    const a = (S.live && S.live.account) || {}, hd = mk("div", "fl-h"); hd.append(mk("span", "", "LIVE ACCOUNT" + (a.account ? " " + a.account : "")), mk("span", "fl-rule"), mk("span", "fl-note", a.fetchedAt ? "read-only · " + ago(a.fetchedAt) : "read-only"));
    const body = mk("div", "fl-livebody"); box.append(hd, body);
    if (a.status === "login-needed" || (!a.status && !a.fetchedAt)) { body.append(mk("div", "fl-lg", a.status ? "Webull login needed — run `node engine/broker-webull.js token` and approve in the app" : "Loading the live account...")); }
    else if (a.status === "rate-limited" || (a.status === "error" && !a.fetchedAt)) body.append(mk("div", "fl-lg", a.error || "Webull is not answering yet. Retrying, at most once a minute."));
    if (a.fetchedAt) {
      if (a.status !== "ok") body.append(mk("div", "fl-lg", a.status === "login-needed" ? "Webull login needed — run `node engine/broker-webull.js token` and approve in the app (showing last snapshot)" : "Showing the last snapshot. " + (a.error || "")));
      const kv = mk("div", "fl-kv"), row = (k, v, c) => { const d = mk("div"); d.append(mk("span", "", k), mk("b", c || "", v)); kv.append(d); };
      row("NET VALUE", a.netValue == null ? "--" : usd(a.netValue)); row("CASH", a.cash == null ? "--" : usd(a.cash)); row("BUYING POWER", a.buyingPower == null ? "--" : usd(a.buyingPower)); row("TODAY", a.dayChange == null ? "--" : (a.dayChange > 0 ? "+" : "") + usd(a.dayChange), cls(a.dayChange || 0));
      body.append(kv); const ps = a.positions || [], pb = mk("div", "fl-pos");
      if (!ps.length) pb.append(mk("div", "fl-empty", "No open positions in the agent account."));
      ps.forEach((p) => { const r = mk("div", "fl-row open"); r.append(mk("b", "", p.ticker), mk("span", "sd", p.qty + " sh"), mk("span", "lv", "$" + p.cost + " → $" + p.last), mk("span", "pl " + cls(p.pnl || 0), p.pnl == null ? "--" : (p.pnl > 0 ? "+" : "") + usd(p.pnl) + (p.pnlPct != null ? " (" + sgn(p.pnlPct) + "%)" : ""))); pb.append(r); });
      body.append(pb);
    }
    const os = ((S.live && S.live.orders) || []).filter((o) => !o.kill).slice(-5).reverse();
    body.append(mk("div", "fl-lg dim", "Live orders are OFF. Approve only records the order here; nothing is sent to Webull."));
    os.forEach((o) => { const r = mk("div", "fl-ord"); r.append(mk("b", "", o.text), mk("span", "", o.status)); body.append(r); });
  }
  async function refreshLive() {
    if (!isLive()) { renderLive(); return; }
    try { S.live = await hq.tfLive(); } catch (e) {}
    renderLive(); renderAlerts();
    if (Date.now() - (S.liveAsk || 0) > 65000 && !S.running) { S.liveAsk = Date.now(); try { await hq.tfCmd(["live-refresh"]); } catch (e) {} } // engine enforces the 60s minimum and backoff
  }
  async function setMode(m) {
    try { S.running = true; renderHead(); await hq.tfCmd(["live-mode", m]); S.mode = m; S.liveAsk = 0; applyMode(); renderAlerts(); } catch (e) { S.running = false; renderHead(); toast(e.message); }
  }
  { const b = mk("button", "fl-btn fl-mode paper", "PAPER"); b.id = "fl-mode"; const r = $("#fl-resume"); r.parentNode.insertBefore(b, r.nextSibling);
    const g = mk("span", "fl-livebadge hidden", "LIVE · REAL MONEY"); g.id = "fl-livebadge"; $("#fl-pill").before(g);
    const lv = mk("div", "fl-sc fl-livesc"); lv.id = "fl-live"; $(".fl-rcol").prepend(lv);
    b.onclick = () => { if (S.running) return; if (isLive()) setMode("paper"); else if (confirm("Switch to LIVE?\n\nThis shows your real Webull agent account (read-only). Live orders are OFF: nothing can be sent. Continue?")) setMode("live"); }; }
  const busy = () => !!(S.running || S.play);
  function syncBusy() { const t = $("#tw-stonks"); if (t) t.classList.toggle("fl-busy", busy()); }
  function collapsibles() { // book/safety panels: compact, click a header to fold; Paper Book open by default
    if (S.coll) return; S.coll = true; let saved = {}; try { saved = JSON.parse(localStorage.getItem("flcoll2") || "{}"); } catch (e) {}
    document.querySelectorAll(".fl-rcol > .fl-sc").forEach((p, i) => { const hd = p.querySelector(".fl-h"); if (!hd) return; const key = (hd.textContent || "").trim().slice(0, 12) || "p" + i; hd.classList.add("fold"); p.classList.toggle("collapsed", key in saved ? !!saved[key] : false);
      hd.onclick = () => { const c = p.classList.toggle("collapsed"); saved[key] = c; try { localStorage.setItem("flcoll2", JSON.stringify(saved)); } catch (e) {} }; });
  }
  function load(r) {
    if (S.preview) return; // dev screenshot hook: HQFloor.preview() freezes the data
    const st = r.state; if (st) { S.desks = st.desks || {}; S.alerts = st.alerts || []; S.tape = st.tape || []; S.finishedAt = st.finishedAt || 0; S.usage = st.usage || null; S.flag = st.flag || ""; S.mode = st.mode === "live" ? "live" : "paper"; }
    S.health = r.health || { ok: true, why: [] }; S.running = !!r.running; S.stats = r.stats; S.sig = r.journal || {}; S.equity = r.equity || []; all();
  }
  async function refresh() {
    try { load(await hq.tfState()); if (!S.running || !S.ev.length) { S.ev = await hq.tfEvents(); renderAgents(); } } catch (e) {}
    if (S.autoPlay && !S.running && !S.play && S.ev.length) { S.autoPlay = false; startPlay(); } // idle: replay the last run
    refreshUsage(); refreshLive();
  }
  hq.on("tf", async (m) => {
    if (m.t === "desk") { S.desks[m.id] = m.desk; renderHead(); if (m.id === "market" && m.desk.status === "done") { try { load(await hq.tfState()); } catch (e) {} } }
    else if (m.t === "msg" && m.ev) { if (m.ev.seq === 1) { S.ev = []; S.cur = -1; S.follow = true; } if (!S.ev.some((x) => x.seq === m.ev.seq && x.ts === m.ev.ts)) S.ev.push(m.ev); if (S.follow) renderAgents(); }
    else if (m.t === "start") { stopPlay(); S.autoPlay = false; S.running = true; S.alerts = []; S.ev = []; S.cur = -1; S.follow = true; S.hold = false; renderAlerts(); renderHead(); renderAgents(); }
    else if (m.t === "done") { S.running = false; await refresh(); }
  });
  async function start(fn) { try { S.running = true; renderHead(); if ((await fn()) === false) await refresh(); } catch (e) { S.running = false; renderHead(); toast(e.message); } }
  $("#fl-go").onclick = () => start(() => hq.tfGo());
  $("#fl-resume").onclick = () => { if (confirm("Resume trading? The peak resets to current equity.")) start(() => hq.tfResume()); };
  $("#fl-kill").onclick = () => { if (confirm("KILL: close ALL paper positions and pause the agent?")) start(() => hq.tfKill()); };
  $("#fl-score").onclick = () => start(() => hq.tfScore());
  // CHAT: opens HQ's own chat panel for this floor's project (tower-chat.js: HQTowerChat.open / .close, fallback = click its own toggle)
  { const b = mk("button", "fl-btn ghost", "CHAT"); b.id = "fl-chat"; b.title = "Chat with Claude about the Stocks project (C)"; const r = $("#fl-resume"); r.parentNode.insertBefore(b, r.nextSibling);
    b.onclick = () => { const C = window.HQTowerChat; if (C && C.open) { C.isOpen() ? C.close() : C.open(true); } else { const t = document.getElementById("tw-chatbtn"); if (t) t.click(); else toast("Chat is not available here"); } };
    const dvb = mk("button", "fl-btn ghost", "DATA VIEW"); dvb.id = "fl-dvbtn"; dvb.title = "Dense dashboard view (also the DATA VIEW button on the wall)"; dvb.onclick = () => dvEnter(); b.after(dvb);
    setInterval(() => { const on = !!(window.HQTowerChat && HQTowerChat.isOpen && HQTowerChat.isOpen()); if (b.classList.contains("on") !== on) b.classList.toggle("on", on); dvb.classList.toggle("hidden", !!S.dv); }, 500); }
  const clk = () => { $("#fl-clock").textContent = new Date().toLocaleTimeString([], { hour12: false }); };
  clk(); setInterval(clk, 1000);
  window.HQFloor = {
    shown: (on) => { S.active = on !== false; if (S.active) { S.autoPlay = true; refresh(); let st = ""; try { st = sessionStorage.getItem(DVK); } catch (e) {} if (st === "1" && !S.dv) dvEnter(true); } else { stopPlay(); closeCard(); if (S.dv || S.focusSet) { dvApply(false); if (S.focusSet && window.HQTower) HQTower.clearFocus(); S.focusSet = false; S.dvBusy = false; } } },
    dv: () => !!S.dv, dataView: (on) => (on === false ? dvExit() : dvEnter()),
    events: () => events(), cur: () => S.cur, active: () => !!S.active, agentCard, agentClose,
    preview: (al, pos) => { S.preview = true; S.alerts = al; if (pos && S.stats) S.stats = Object.assign({}, S.stats, { positions: pos }); all(); }, running: () => S.running, busy, desks: deskView, onChange: (f) => listeners.push(f), NAME, HUE, ANG, SEATS,
    data: () => ({ tape: S.tape, equity: S.equity, alerts: S.alerts, stats: S.stats }),
    select: (seat) => { S.sel = S.sel === seat ? "" : seat; renderAgents(); }, selected: () => S.sel,
    escape: () => { if (S.dv) { dvExit(); return true; } if (S.card) { closeCard(); return true; } const d = $("#fl-drawer"); if (!d.classList.contains("hidden")) { d.classList.add("hidden"); return true; } if (S.sel) { S.sel = ""; renderAgents(); return true; } return false; },
  };
  all(); refresh();
  setInterval(() => { if (S.active) { refreshUsage(); if (!S.running) refresh(); } }, 30000);
})();
