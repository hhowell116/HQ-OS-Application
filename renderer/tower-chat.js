// Chat inside the tower: the HQ #console is re-parented into a glass panel on the right while a floor is open
// (same component, same S.cur / conversation list / history as clicking the project card). Closing the panel or leaving the
// tower moves #console back to its place in HQ. Loaded before tower.js so its Esc handling runs first.
(function () {
  const $ = (s) => document.querySelector(s);
  const view = $("#tower-view"), consoleEl = $("#console");
  if (!view || !consoleEl) return;
  let open = false, marker = null, seq = 0; const unread = new Set();

  const panel = document.createElement("aside"); panel.id = "tw-chat"; panel.className = "hidden";
  panel.innerHTML = '<div class="twc-h"><span class="twc-t" id="twc-t"></span><span class="twc-s" id="twc-s"></span><button class="ghost" id="twc-x" title="Close chat (Esc when idle)">&#10005;</button></div><div class="twc-tabs" id="twc-tabs"></div><div class="twc-b" id="twc-b"></div><div class="twc-pane p-review" id="twp-review"></div><div class="twc-pane p-next" id="twp-next"></div><div class="twc-pane p-wait" id="twp-wait"></div><div class="twc-pane p-task" id="twp-task"></div>';
  const btn = document.createElement("button"); btn.id = "tw-chatbtn"; btn.className = "ghost hidden"; btn.title = "Chat with Claude about this floor's project (C)";
  btn.innerHTML = '&#128172; chat (C)<i class="twc-dot hidden"></i>';
  view.append(panel, btn);
  const body = panel.querySelector("#twc-b"), dot = btn.querySelector(".twc-dot");

  const T = () => (window.HQTower && HQTower.state) || {};
  // the project whose chat this floor uses; the command deck uses the HQ OS project (general chat)
  function projFor(f) {
    if (!f) return null; const ps = (typeof S !== "undefined" && S.projects) || [];
    if (f.kind === "project") return ps.find((p) => p.id === f.id) || null;
    if (f.kind === "deck") return ps.find((p) => /^hq[\s_-]*os$/i.test(p.name)) || ps[0] || null;
    return null;
  }
  const floorNow = () => { const t = T(); return t.cur && (t.mode === "int" || t.flight) ? t.cur : null; };
  const available = () => { const f = floorNow(); return !!(f && f.kind !== "lobby" && projFor(f)); };
  const busyNow = () => typeof S !== "undefined" && S.conv && S.conv.busy;

  // ---------- HQ panels as tabs (same data/IPC as the HQ dashboard: hq.reviewList/reviewSet, hq.project, hq.todoToggle) ----------
  const api = () => window.__twApi || window.hq; // test hook only
  const TABS = [["chat", "CHAT"], ["review", "REVIEW"], ["next", "NEXT"], ["wait", "WAITING"], ["task", "TASK"]];
  let tab = "chat", data = null, dataFor = "", rvOpen = null; const rvDraft = {};
  const tabsEl = panel.querySelector("#twc-tabs");
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const ago = (iso) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); return isNaN(m) ? "" : m < 60 ? m + "m" : m < 1440 ? Math.floor(m / 60) + "h" : Math.floor(m / 1440) + "d"; };
  const curProj = () => projFor(floorNow());
  function counts() { const p = curProj(); if (!p) return { r: 0, n: 0, w: 0 }; if (data && dataFor === p.id) return { r: data.rev.filter((i) => i.status === "needs-review").length, n: data.next.length, w: data.wait.length }; return { r: p.review || 0, n: p.next || 0, w: p.wait || 0 }; }
  function paintTabs() {
    const c = counts(), n = { review: c.r, next: c.n, wait: c.w }; tabsEl.textContent = "";
    for (const [id, label] of TABS) { const b = mk("button", "twc-tab" + (tab === id ? " on" : ""), label); if (n[id]) { const cb = mk("b", "", "(" + n[id] + ")"); if (id !== "review") cb.style.color = "inherit"; b.append(cb); } b.onclick = () => setTab(id); tabsEl.append(b); }
    panel.dataset.tab = tab;
  }
  async function refresh() {
    const p = curProj(); if (!p) return; const id = p.id;
    try { const [d, rev] = await Promise.all([api().project(id), api().reviewList(id)]); if (!curProj() || curProj().id !== id) return; data = { live: d.todo.live || "", next: d.todo.next.filter((x) => !x.done), wait: d.todo.wait.filter((x) => !x.done), rev, todo: d.todo }; dataFor = id; } catch (e) { return; }
    paintPanes(); paintTabs();
  }
  const syncCounts = () => { if (typeof loadProjects === "function") loadProjects().then(() => { if (typeof loadReview === "function") loadReview(); }).catch(() => {}); };
  function toast2(m, bad) { if (typeof toast === "function") toast(m, bad); }
  function itemRow(it, id, kind) {
    const r = mk("div", "twc-it"), b = mk("div", "box", ""); b.title = "Mark done";
    b.onclick = async () => { b.textContent = "\u2713"; try { const d = await api().todoToggle({ id, line: it.line, raw: it.raw, on: true }); if (data && dataFor === id) { data.todo = d.todo; data.next = d.todo.next.filter((x) => !x.done); data.wait = d.todo.wait.filter((x) => !x.done); data.live = d.todo.live || ""; } paintPanes(); paintTabs(); syncCounts(); } catch (e) { toast2(e.message, true); refresh(); } };
    r.append(b); if (it.num) r.append(mk("span", "num", it.num)); const t = mk("div", "t", it.text); t.title = it.text; r.append(t); return r;
  }
  function paintPanes() {
    const p = curProj(); if (!p || !data || dataFor !== p.id) return; const id = p.id;
    const pn = panel.querySelector("#twp-next"), pw = panel.querySelector("#twp-wait"), pr = panel.querySelector("#twp-review");
    for (const e of [pn, pw, pr]) e.textContent = "";
    if (data.live) { const lv = mk("div", "twc-live", data.live); lv.title = "Click to expand"; lv.onclick = () => lv.classList.toggle("x"); pn.append(lv); }
    data.next.forEach((x) => pn.append(itemRow(x, id))); if (!data.next.length) pn.append(mk("div", "twc-none", data.todo.missing ? "No To-Do note for this project." : "Next list is clear."));
    data.wait.forEach((x) => pw.append(itemRow(x, id))); if (!data.wait.length) pw.append(mk("div", "twc-none", "Nothing waiting on you."));
    const todo = data.rev.filter((i) => i.status === "needs-review"); if (!todo.length) pr.append(mk("div", "twc-none", "Nothing to review."));
    for (const i of todo) {
      const c = mk("div", "twc-rv"), top = mk("div", "top"), th = mk("div", "th"), tt = mk("div", "tt");
      if (i.media[0] && !i.video) { const im = mk("img"); im.src = i.media[0]; im.alt = ""; th.append(im); } else th.textContent = i.video ? "\u25b6" : "\u270e";
      th.title = "Open full size"; th.onclick = () => { if (typeof openReview === "function") openReview(i); };
      tt.append(mk("b", "", i.title), mk("span", "", ago(i.created) + " ago"));
      top.append(th, tt);
      const acts = mk("div", "acts"), ok = mk("button", "ghost ok", "APPROVE"), chg = mk("button", "ghost chg", "CHANGES"), ta = mk("textarea", rvOpen === i.key ? "" : "hidden");
      ta.placeholder = "What should change? (then press CHANGES again)"; ta.value = rvDraft[i.key] || ""; ta.oninput = () => (rvDraft[i.key] = ta.value);
      const act = async (status) => { const comment = ta.value.trim(); try { await api().reviewSet({ id, key: i.key, status, comment }); delete rvDraft[i.key]; rvOpen = null; toast2(status === "approved" ? "Approved" : "Changes requested"); await refresh(); syncCounts(); } catch (e) { toast2(e.message, true); } };
      ok.onclick = () => act("approved");
      chg.onclick = () => { if (rvOpen !== i.key) { rvOpen = i.key; ta.classList.remove("hidden"); ta.focus(); return; } act("changes"); };
      acts.append(ok, chg); c.append(top, ta, acts); pr.append(c);
    }
  }
  // ---------- TASK tab: send a task to this project's Claude as a NEW conversation (worker chat; the open chat is not disturbed) ----------
  const sentLog = {}; // proj id -> [{text, at}]
  function paintTask() {
    const p = curProj(), pane = panel.querySelector("#twp-task"); if (!p) return; const id = p.id;
    if (pane.dataset.for === id && pane.firstChild) { paintSent(pane, id); return; }
    pane.textContent = ""; pane.dataset.for = id;
    const ta = mk("textarea", "twc-task-in"); ta.id = "twc-task-in"; ta.rows = 4; ta.maxLength = 4000; ta.placeholder = "Give " + (p.name || "this team") + " a task...  (Ctrl+Enter sends)";
    const row = mk("div", "twc-task-row"), go = mk("button", "ghost ok", "SEND TASK"), msg = mk("span", "twc-task-msg", ""); msg.id = "twc-task-msg"; go.id = "twc-task-go";
    const send = async () => {
      const text = ta.value.trim(); if (!text || go.disabled) return; go.disabled = true; msg.textContent = "sending..."; msg.className = "twc-task-msg";
      try {
        const conv = await api().chatNew({ proj: id, model: ($("#model-pick") || {}).value });
        const first = text.split(/\r?\n/)[0].slice(0, 50); try { await api().chatRename({ id: conv.id, title: "Task: " + first }); } catch (e) {}
        await api().chatSend({ id: conv.id, text: "Task for the " + (p.name || "project") + " team (work on it with the project's specialists, then report back briefly):\n\n" + text, images: [] });
        (sentLog[id] = sentLog[id] || []).unshift({ text, at: Date.now() }); ta.value = ""; msg.textContent = "\u2713 sent to " + (p.name || "team"); msg.className = "twc-task-msg ok";
        toast2("Task sent to " + (p.name || "team")); paintSent(pane, id);
      } catch (e) { msg.textContent = "failed: " + e.message; msg.className = "twc-task-msg bad"; }
      go.disabled = false;
    };
    go.onclick = send; ta.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
    row.append(go, msg); pane.append(mk("div", "twc-none", "Starts a new chat for this project; the team works on it. Replies show a dot on the chat button."), ta, row, mk("div", "twc-sent")); paintSent(pane, id);
  }
  function paintSent(pane, id) { const box = pane.querySelector(".twc-sent"); if (!box) return; box.textContent = ""; for (const x of (sentLog[id] || []).slice(0, 6)) { const r = mk("div", "twc-sent-it"); r.append(mk("b", "", new Date(x.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })), mk("span", "", x.text.replace(/\s+/g, " ").slice(0, 120))); box.append(r); } }
  function setTab(t, noFocus) {
    tab = t; paintTabs(); if (t === "task") { paintTask(); setTimeout(() => { if (!noFocus && tab === "task") { const i = $("#twc-task-in"); if (i) i.focus(); } }, 30); } else if (t !== "chat") { paintPanes(); refresh(); } else if (window.HQPinLog) requestAnimationFrame(HQPinLog);
    if (t === "chat" && !noFocus && open) { const i = $("#input"); if (i) i.focus(); }
  }

  async function openChat(focus, wantTab) {
    const f = floorNow(); if (!f || !available()) return; const p = projFor(f), my = ++seq;
    if (!open) { marker = document.createComment("console-home"); consoleEl.before(marker); body.append(consoleEl); open = true; }
    consoleEl.classList.add("in-tower-chat"); if (window.HQTower && HQTower.termFocus) HQTower.termFocus(true); // camera pushes toward this floor's terminal
    panel.classList.remove("hidden"); requestAnimationFrame(() => panel.classList.add("show")); view.classList.add("chat-open");
    panel.style.setProperty("--fc", "#" + f.color.getHexString());
    $("#twc-t").textContent = (f.kind === "deck" ? "COMMAND DECK" : p.name.toUpperCase()) + " TERMINAL";
    $("#twc-s").textContent = f.kind === "deck" ? "general chat (" + p.name + ")" : "chat · Esc closes";
    unread.delete(p.id); paintBtn();
    if (dataFor !== p.id) { data = null; rvOpen = null; } if (wantTab) tab = wantTab; paintTabs(); if (tab === "task") paintTask(); else if (tab !== "chat") { paintPanes(); refresh(); } else refresh();
    if (S.cur !== p.id) { await selectProject(p.id); if (my !== seq) return; } else if (window.HQPinLog) HQPinLog();
    if (window.HQPinLog) requestAnimationFrame(HQPinLog);
    if (focus && tab === "chat") $("#input").focus();
  }
  function closeChat() {
    ++seq; if (window.HQTower && HQTower.termFocus) HQTower.termFocus(false); // camera eases back
    if (!open) { paintBtn(); return; }
    open = false; tab = "chat"; panel.classList.remove("show"); view.classList.remove("chat-open"); consoleEl.classList.remove("in-tower-chat");
    if (marker && marker.parentNode) { marker.replaceWith(consoleEl); } marker = null;
    setTimeout(() => { if (!open) panel.classList.add("hidden"); }, 260);
    if (window.HQPinLog) requestAnimationFrame(HQPinLog); paintBtn();
  }
  function paintBtn() {
    const f = floorNow(), p = projFor(f), on = available() && !open;
    btn.classList.toggle("hidden", !on); btn.classList.toggle("stonks", !!(f && f.stonks));
    dot.classList.toggle("hidden", !(p && unread.has(p.id)));
    btn.classList.toggle("busy", !!(p && S.conv && S.conv.proj === p.id && S.conv.busy));
  }
  // called by tower.js whenever the interior is (re)built: stay open across floor hops (switching project), close for the lobby
  function sync() {
    lobby(); if (!available()) { closeChat(); return; }
    if (open) openChat(false); else paintBtn();
  }

  btn.onclick = () => openChat(true);
  panel.querySelector("#twc-x").onclick = closeChat;

  // reply arrived while the panel was closed: dot on the button
  if (window.hq) hq.on("chat", (ev) => {
    if (!ev || !ev.conv) return;
    if (ev.what === "done") { const p = projFor(floorNow()); if (ev.conv.proj && (!open || !p || p.id !== ev.conv.proj)) { unread.add(ev.conv.proj); } }
    paintBtn();
  });
  setInterval(() => { if (T().on) paintBtn(); }, 1000);

  const typing = (e) => { const a = e.target; return a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };
  addEventListener("keydown", (e) => {
    const t = T(); if (!t.on || t.mode !== "int" || !floorNow()) return;
    const inPanel = open && panel.contains(e.target);
    if (e.key === "Escape") {
      if (typeof MIC !== "undefined" && MIC.st === "rec") return; // let the mic cancel
      if (!open) return;
      if (typeof TTS !== "undefined" && TTS.started && typeof stopSpeech === "function") { e.preventDefault(); e.stopImmediatePropagation(); stopSpeech(); return; }
      if (busyNow()) { e.preventDefault(); e.stopImmediatePropagation(); hq.chatStop(S.conv.id); return; }
      const a = document.activeElement; if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.value) { e.stopImmediatePropagation(); return; } // typing: the chat keeps Esc
      if (document.querySelector("#vpop")) return;
      e.preventDefault(); e.stopImmediatePropagation(); closeChat(); return;
    }
    if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === "k") { if (!available()) return; e.preventDefault(); e.stopImmediatePropagation(); open ? (tab !== "chat" ? setTab("chat") : $("#input").focus()) : openChat(true, "chat"); return; }
    if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "n" && open) { e.preventDefault(); e.stopImmediatePropagation(); newConv(); return; }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "h" && open) { e.preventDefault(); $("#btn-handoff").click(); return; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "/" && !typing(e) && !t.flight && available()) { e.preventDefault(); e.stopImmediatePropagation(); open ? (tab !== "chat" ? setTab("chat") : $("#input").focus()) : openChat(true, "chat"); return; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "c" && !typing(e) && !inPanel && !t.flight && available()) {
      e.preventDefault(); open ? closeChat() : openChat(true);
    }
  }, true);

  // ---------- lobby reception summary: cross-project review / waiting, each line flies to that floor's terminal on the right tab ----------
  const lob = document.createElement("div"); lob.id = "tw-lobsum"; view.append(lob); let lobSig = "", want = null;
  function lobby() {
    const f = floorNow(), on = !!(f && f.kind === "lobby" && !T().flight);
    const ps = ((typeof S !== "undefined" && typeof activeProjects === "function") ? activeProjects() : []).filter((p) => (p.review || 0) + (p.wait || 0) > 0);
    const sig = on + "|" + ps.map((p) => p.id + p.review + "," + p.wait).join(";") + "|" + (typeof S !== "undefined" ? S.projects.length : 0);
    if (sig === lobSig) return; lobSig = sig; lob.classList.toggle("on", on); if (!on) return; lob.textContent = "";
    const R = ps.reduce((a, p) => a + (p.review || 0), 0), W = ps.reduce((a, p) => a + (p.wait || 0), 0);
    const h = mk("div", "h"); h.append(mk("b", "", R + " need review"), document.createTextNode(" \u00b7 " + W + " waiting on you")); lob.append(h);
    if (!ps.length) lob.append(mk("div", "twc-none", "All clear."));
    for (const p of ps) {
      const l = mk("div", "l"), d = mk("i"); d.style.background = p.accent || "var(--acc)"; l.append(d, mk("span", "n", p.name));
      if (p.review) l.append(mk("span", "r", p.review + " review")); if (p.wait) l.append(mk("span", "w", p.wait + " waiting"));
      l.title = "Fly to " + p.name; l.onclick = () => flyTo(p, p.review ? "review" : "wait"); lob.append(l);
    }
  }
  function flyTo(p, t) { want = { id: p.id, tab: t, at: Date.now() }; if (window.HQTower) HQTower.hop(p.id); }
  setInterval(() => {
    if (!T().on) return; lobby();
    if (want) { if (Date.now() - want.at > 8000) want = null; else { const f = floorNow(), t = T(); if (f && f.id === want.id && t.mode === "int" && !t.flight) { const w = want; want = null; openChat(false, w.tab); } } }
  }, 250);

  window.HQTowerChat = { setTab, refresh, flyTo, tab: () => tab, projFor, sync, close: closeChat, open: openChat, isOpen: () => open, unread, paintBtn };
})();
