// Chat inside the tower: the HQ #console is re-parented into a glass panel on the right while a floor is open
// (same component, same S.cur / conversation list / history as clicking the project card). Closing the panel or leaving the
// tower moves #console back to its place in HQ. Loaded before tower.js so its Esc handling runs first.
(function () {
  const $ = (s) => document.querySelector(s);
  const view = $("#tower-view"), consoleEl = $("#console");
  if (!view || !consoleEl) return;
  let open = false, marker = null, seq = 0; const unread = new Set();

  const panel = document.createElement("aside"); panel.id = "tw-chat"; panel.className = "hidden";
  panel.innerHTML = '<div class="twc-h"><span class="twc-t" id="twc-t"></span><span class="twc-s" id="twc-s"></span><button class="ghost" id="twc-x" title="Close chat (Esc when idle)">&#10005;</button></div><div class="twc-b" id="twc-b"></div>';
  const btn = document.createElement("button"); btn.id = "tw-chatbtn"; btn.className = "ghost hidden"; btn.title = "Chat with Claude about this floor's project (C)";
  btn.innerHTML = '&#128172; chat<i class="twc-dot hidden"></i>';
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

  async function openChat(focus) {
    const f = floorNow(); if (!f || !available()) return; const p = projFor(f), my = ++seq;
    if (!open) { marker = document.createComment("console-home"); consoleEl.before(marker); body.append(consoleEl); open = true; }
    consoleEl.classList.add("in-tower-chat");
    panel.classList.remove("hidden"); requestAnimationFrame(() => panel.classList.add("show")); view.classList.add("chat-open");
    $("#twc-t").textContent = (f.kind === "deck" ? "General" : p.name) + " · chat";
    $("#twc-s").textContent = f.kind === "deck" ? "(" + p.name + ")" : "";
    unread.delete(p.id); paintBtn();
    if (S.cur !== p.id) { await selectProject(p.id); if (my !== seq) return; } else if (window.HQPinLog) HQPinLog();
    if (window.HQPinLog) requestAnimationFrame(HQPinLog);
    if (focus) $("#input").focus();
  }
  function closeChat() {
    ++seq; if (!open) { paintBtn(); return; }
    open = false; panel.classList.remove("show"); view.classList.remove("chat-open"); consoleEl.classList.remove("in-tower-chat");
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
    if (!available()) { closeChat(); return; }
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
    if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === "k") { if (!available()) return; e.preventDefault(); e.stopImmediatePropagation(); open ? $("#input").focus() : openChat(true); return; }
    if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "n" && open) { e.preventDefault(); e.stopImmediatePropagation(); newConv(); return; }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "h" && open) { e.preventDefault(); $("#btn-handoff").click(); return; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "/" && !typing(e) && !t.flight && available()) { e.preventDefault(); e.stopImmediatePropagation(); open ? $("#input").focus() : openChat(true); return; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "c" && !typing(e) && !inPanel && !t.flight && available()) {
      e.preventDefault(); open ? closeChat() : openChat(true);
    }
  }, true);

  window.HQTowerChat = { sync, close: closeChat, open: openChat, isOpen: () => open, unread, paintBtn };
})();
