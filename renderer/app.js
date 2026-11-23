// HQ OS renderer: draws state that the main process hands over. No Node here; everything goes through window.hq.
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const S = { voiceName: "af_heart", speed: 1.1, projects: [], cur: "", detail: null, conv: null, voice: false, person: "Hayden", agents: [], usage: null, follow: true, archived: new Set(), showArch: false };
const core = new HQCore($("#core"));

// ---------- helpers ----------
function toast(msg, bad) { const t = $("#toast"); t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); clearTimeout(t._h); t._h = setTimeout(() => t.classList.add("hidden"), 3200); }
const dur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + "h" + (m % 60) + "m" : m ? m + "m" + (s % 60) + "s" : s + "s"; };
const left = (iso) => { let m = Math.max(0, Math.round((new Date(iso) - Date.now()) / 60000)); const d = Math.floor(m / 1440); m -= d * 1440; const h = Math.floor(m / 60); m -= h * 60; return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
function spark(svg, vals) {
  svg.textContent = ""; if (!vals || !vals.length) return;
  const hi = Math.max(1, ...vals), n = vals.length, W = +svg.viewBox.baseVal.width || 140, H = +svg.viewBox.baseVal.height || 26;
  const pl = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  pl.setAttribute("points", vals.map((v, i) => [(i * (W - 4)) / (n - 1) + 2, H - 3 - (v / hi) * (H - 6)].join(",")).join(" "));
  svg.appendChild(pl);
}
// Minimal, safe markdown: escape first, then add a few tags. Never inserts raw model HTML.
function md(src) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const parts = String(src || "").split(/```/); let html = "";
  parts.forEach((p, i) => {
    if (i % 2) { html += "<pre><code>" + esc(p.replace(/^[\w-]*\n/, "")) + "</code></pre>"; return; }
    const lines = esc(p).split("\n"); let list = "";
    const inline = (s) => s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    const close = () => { if (list) { html += "</" + list + ">"; list = ""; } };
    let para = [];
    const flush = () => { if (para.length) { html += "<p>" + inline(para.join("<br>")) + "</p>"; para = []; } };
    for (const l of lines) {
      let m;
      if ((m = /^#{1,3}\s+(.*)/.exec(l))) { flush(); close(); html += "<h3>" + inline(m[1]) + "</h3>"; }
      else if ((m = /^\s*[-*]\s+(.*)/.exec(l))) { flush(); if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += "<li>" + inline(m[1]) + "</li>"; }
      else if ((m = /^\s*\d+[.)]\s+(.*)/.exec(l))) { flush(); if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += "<li>" + inline(m[1]) + "</li>"; }
      else if (!l.trim()) { flush(); close(); }
      else { close(); para.push(l); }
    }
    flush(); close();
  });
  return html;
}

// ---------- clock + greeting ----------
function tickClock() {
  const d = new Date();
  $("#clock-t").textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  $("#clock-d").textContent = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
function greet() { const h = new Date().getHours(); return (h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening") + ", " + S.person + "."; }
function setMood(m, text) { core.setMood(m); $("#mood").textContent = text || { idle: "standing by", think: "processing", speak: "responding", alert: "attention needed" }[m]; }

// ---------- projects ----------
// inline project rename (right-click a card or double-click its name); Enter saves, Esc cancels
function startProjRename(id) { S.renId = id; S.renErr = ""; renderProjects(); const i = document.querySelector("#projects .ren-in"); if (i) { i.focus(); i.select(); } }
function renameBox(p) {
  const w = el("div", "ren"), inp = el("input", "ren-in"), er = el("div", "np-err", S.renErr || ""); let busy = false;
  inp.type = "text"; inp.maxLength = 60; inp.spellcheck = false; inp.value = p.name;
  const done = () => { S.renId = null; S.renErr = ""; renderProjects(); };
  inp.onclick = (e) => e.stopPropagation(); inp.ondblclick = (e) => e.stopPropagation();
  inp.addEventListener("input", () => (er.textContent = ""));
  inp.addEventListener("blur", () => setTimeout(() => { if (S.renId === p.id && !busy) done(); }, 150));
  inp.addEventListener("keydown", async (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); done(); }
    else if (e.key === "Enter") { e.preventDefault(); if (busy) return; const v = inp.value.trim(); if (v === p.name) return done(); busy = true;
      try { const r = await hq.projectRename({ id: p.id, name: v }); if (!r.ok) er.textContent = r.err; else { S.renId = null; await loadProjects(); await selectProject(r.id); toast("Renamed to " + r.name); } }
      catch (x) { er.textContent = /No handler/.test(x.message) ? "Restart HQ OS to use this" : x.message; } busy = false; } });
  w.append(inp, er); return w;
}
function projMenu(x, y, p) {
  document.querySelectorAll(".projmenu").forEach((m) => m.remove());
  const m = el("div", "projmenu"); m.style.left = x + "px"; m.style.top = y + "px";
  const b = el("button", "", "Rename…"); b.onclick = () => { m.remove(); startProjRename(p.id); }; m.append(b); document.body.append(m);
  const off = () => { m.remove(); removeEventListener("mousedown", offd, true); removeEventListener("keydown", off, true); };
  const offd = (e) => { if (!m.contains(e.target)) off(); }; addEventListener("mousedown", offd, true); addEventListener("keydown", off, true);
}
function renderProjects() {
  if (S.renId && document.querySelector("#projects .ren-in") === document.activeElement) return; // don't wipe the box while typing
  const box = $("#projects"); box.textContent = "";
  const live = window.HQActivity ? window.HQActivity.groups(S.projects) : { byProj: new Map() };
  const active = activeProjects(), archived = S.projects.filter((p) => S.archived.has(p.id));
  active.forEach((p, i) => {
    const d = el("div", "proj" + (p.id === S.cur ? " on" : ""));
    const ab = el("button", "arch", "⊟"); ab.title = "Archive " + p.name + " (find it under ARCHIVED below)"; ab.onclick = (e) => { e.stopPropagation(); setArchived(p.id, true); }; d.append(ab); if (p.accent) d.style.setProperty("--pa", p.accent);
    const n = el("div", "n");
    if (S.renId === p.id) { n.append(renameBox(p)); d.classList.add("renaming"); }
    else { const ns = el("span", "", p.name); ns.title = "Double-click to rename"; ns.ondblclick = (e) => { e.stopPropagation(); startProjRename(p.id); }; n.append(ns); if (i < 9) n.append(el("span", "k", "^" + (i + 1))); }
    d.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); projMenu(e.clientX, e.clientY, p); }; d.append(n);
    const m = el("div", "m");
    m.append(el("span", "", p.hasTodo ? p.next + " next" : "no to-do"));
    if (p.wait) m.append(el("span", "w", p.wait + " need you"));
    if (p.review) m.append(el("span", "", p.review + " review"));
    const wn = (live.byProj.get(p.id) || []).length;
    if (wn) { m.append(el("span", "busy", "● " + wn + " working")); d.classList.add("plive"); }
    d.append(m);
    const sv = document.createElementNS("http://www.w3.org/2000/svg", "svg"); sv.setAttribute("viewBox", "0 0 140 14"); sv.setAttribute("preserveAspectRatio", "none"); d.append(sv); spark(sv, p.git);
    d.onclick = () => selectProject(p.id);
    box.append(d);
  });
  if (archived.length) {
    const h = el("div", "arch-h" + (S.showArch ? " open" : "")); h.append(el("span", "", (S.showArch ? "▾" : "▸") + " ARCHIVED"), el("span", "count", String(archived.length)));
    h.onclick = () => { S.showArch = !S.showArch; renderProjects(); }; box.append(h);
    if (S.showArch) archived.forEach((p) => {
      const r = el("div", "proj archived" + (p.id === S.cur ? " on" : "")); r.append(el("span", "an", p.name));
      const rb = el("button", "ghost restore", "restore"); rb.title = "Bring " + p.name + " back to the list"; rb.onclick = (e) => { e.stopPropagation(); setArchived(p.id, false); }; r.append(rb);
      r.onclick = () => selectProject(p.id); box.append(r);
    });
  }
  const waiting = active.reduce((a, p) => a + p.wait, 0);
  const sys = $("#chip-sys"); sys.textContent = waiting ? waiting + " items need you" : "systems nominal"; sys.className = "chip " + (waiting ? "warn" : "dim");
}
// archived projects drop out of the list, the needs count and Ctrl+1-9, but stay one click away under ARCHIVED
function activeProjects() { return S.projects.filter((p) => !S.archived.has(p.id)); }
function setArchived(id, on) { on ? S.archived.add(id) : S.archived.delete(id); hq.set({ archived: [...S.archived] }); const p = S.projects.find((x) => x.id === id); toast((on ? "Archived " : "Restored ") + (p ? p.name : "")); renderProjects(); }
async function loadProjects() { S.projects = await hq.projects(); renderProjects(); }

async function selectProject(id) {
  if (!id) return; S.cur = id; renderProjects();
  S.detail = await hq.project(id); renderDetail(); REV.items = []; renderReview(); loadReview();
  // jump to this project's latest conversation
  const list = await hq.chatList(id); await fillConvPick(list);
  if (list.length) openConv(list[0].id); else { S.conv = null; renderLog(); }
}

function renderDetail() {
  const d = S.detail; if (!d) return;
  $("#p-name").textContent = d.name;
  const live = $("#p-live"); live.textContent = d.todo.live || ""; live.title = "Click to expand"; live.classList.toggle("hidden", !d.todo.live); live.onclick = () => live.classList.toggle("x");
  spark($("#p-spark"), d.git.days); $("#p-last").textContent = d.git.last || "no recent commits"; $("#p-last").title = d.git.last || "";
  const row = (it, kind) => {
    const r = el("div", "item " + kind + (it.done ? " done" : "")); r.dataset.line = it.line;
    const b = el("div", "box", it.done ? "✓" : ""); b.title = it.done ? "Mark not done" : "Mark done";
    b.onclick = async () => { try { S.detail = await hq.todoToggle({ id: d.id, line: it.line, raw: it.raw, on: !it.done }); renderDetail(); loadProjects(); } catch (e) { toast(e.message, true); S.detail = await hq.project(d.id); renderDetail(); } };
    r.append(b); if (it.num) r.append(el("span", "num", it.num)); const t = el("div", "t", it.text); t.title = it.text; r.append(t);
    return r;
  };
  const wait = d.todo.wait.filter((x) => !x.done), next = d.todo.next.filter((x) => !x.done);
  const pw = $("#p-wait"); pw.textContent = ""; wait.forEach((x) => pw.append(row(x, "wait"))); if (!wait.length) pw.append(el("div", "none", "Nothing waiting on you."));
  const pn = $("#p-next"); pn.textContent = ""; next.forEach((x) => pn.append(row(x, ""))); if (!next.length) pn.append(el("div", "none", d.todo.missing ? "No tasks yet. Add one below." : "Next list is clear."));
  $("#c-wait").textContent = wait.length; $("#c-wait").classList.toggle("zero", !wait.length);
  $("#c-next").textContent = next.length; $("#c-next").classList.toggle("zero", !next.length);
  const pb = $("#p-board"); pb.textContent = "";
  d.board.forEach((a) => { const b = el("div", "brd" + (a.working ? " on" : "")); b.append(el("span", "at", a.updated), el("div", "an", a.name), el("div", "", a.working ? a.task : a.last)); pb.append(b); });
  if (!d.board.length) pb.append(el("div", "none", "No Agent Activity board."));
}
// ---------- agents + usage ----------
function renderAgents() {
  const run = S.agents.filter((a) => a.status === "running");
  $("#chip-agents").textContent = run.length + " agent" + (run.length === 1 ? "" : "s") + " live";
  $("#chip-agents").className = "chip" + (run.length ? "" : " dim");
}
function renderUsage(u, err) {
  const box = $("#rings"); box.textContent = "";
  if (err && !u) { box.append(el("div", "none", err)); $("#chip-usage").textContent = "usage n/a"; return; }
  // minimal rows: label, %, hairline bar, reset time
  [["SESSION", u && u.five_hour, "acc"], ["WEEK", u && u.seven_day, "sec"]].forEach(([label, x, tone]) => {
    const p = Math.round((x && x.utilization) || 0);
    const r = el("div", "urow " + tone + (p >= 90 ? " bad" : p >= 75 ? " warn" : ""));
    const top = el("div", "ut"); top.append(el("span", "k", label), el("span", "v", p + "%")); r.append(top);
    const bar = el("div", "ubar"), fill = el("i"); fill.style.width = p + "%"; bar.append(fill); r.append(bar);
    r.append(el("div", "r", x && x.resets_at ? "resets in " + left(x.resets_at) : ""));
    box.append(r);
  });
  const s = Math.round((u && u.five_hour && u.five_hour.utilization) || 0);
  $("#chip-usage").textContent = "session " + s + "%"; $("#chip-usage").className = "chip" + (s >= 90 ? " bad" : s >= 75 ? " warn" : "");
}

// ---------- console ----------
async function fillConvPick(list) {
  const sel = $("#conv-pick"); sel.textContent = "";
  if (!list.length) { const o = el("option", "", "no conversations yet"); o.value = ""; sel.append(o); }
  list.forEach((c) => { const o = el("option", "", (c.busy ? "● " : "") + c.title); o.value = c.id; sel.append(o); });
  if (S.conv) sel.value = S.conv.id;
}
async function openConv(id) { S.conv = await hq.chatGet(id); $("#conv-pick").value = id; $("#model-pick").value = (S.conv && S.conv.model) || ""; S.follow = true; renderLog(); }

function renderLog() {
  const log = $("#log"), c = S.conv; const fromBottom = log.scrollHeight - log.scrollTop; log.textContent = "";
  const has = c && c.msgs && c.msgs.length;
  $("#core-wrap").classList.toggle("small", !!has && !S.hideChat);
  $("#console").classList.toggle("collapsed", !!S.hideChat); $("#btn-hide").textContent = S.hideChat ? "▴ show chat" : "▾ hide chat";
  $("#btn-del").classList.toggle("hidden", !c);
  if (!has) {
    const p = S.projects.find((x) => x.id === S.cur);
    const e = el("div", "empty"); e.append(el("div", "", p ? "CONSOLE READY · " + p.name.toUpperCase() : "CONSOLE READY"), el("div", "", "Claude works inside this project's folder."), el("div", "", "Ctrl+K focus · Ctrl+N new conversation · Ctrl+1-9 switch project · Ctrl+Alt+H show/hide"));
    log.append(e);
  } else c.msgs.forEach((m) => log.append(renderMsg(m)));
  if (c) (c.queue || []).forEach((q) => { const m = renderMsg({ r: "user", text: q.text, imgs: q.imgs }); m.classList.add("queued"); const w = m.querySelector(".who"); w.append(el("span", "qtag", " · queued · sends when Claude finishes ")); const now = el("button", "ghost qnow", "⚡ send now"); now.title = "Interrupt Claude and send this now (Ctrl+Enter)"; now.onclick = () => hq.chatStop(c.id); w.append(now); log.append(m); });
  const busy = !!(c && c.busy); $("#btn-send").classList.toggle("hidden", busy); $("#btn-stop").classList.toggle("hidden", !busy);
  renderCache();
  // keep the reader where they were: rebuilding the log used to reset it to the top
  if (S.follow) log.scrollTop = log.scrollHeight; else log.scrollTop = Math.max(0, log.scrollHeight - fromBottom);
  log.querySelectorAll("img").forEach((im) => { if (!im.complete) im.addEventListener("load", () => { if (S.follow) log.scrollTop = log.scrollHeight; }, { once: true }); });
}
function renderMsg(m) {
  const d = el("div", "msg " + (m.r === "user" ? "user" : "asst"));
  d.append(el("div", "who", m.r === "user" ? S.person.toUpperCase() : "CLAUDE"));
  const body = el("div", "body");
  if (m.r === "user") {
    if (m.text) body.textContent = m.text;
    if (m.imgs && m.imgs.length) { const g = el("div", "msg-imgs"); m.imgs.forEach((p) => { const i = document.createElement("img"); i.src = "hqchat://f/" + encodeURIComponent(p); i.onclick = () => window.open(i.src); g.append(i); }); body.append(g); }
  }
  else (m.blocks || []).forEach((b) => {
    if (b.k === "text") { const t = el("div", "md"); t.innerHTML = md(b.text); body.append(t); }
    else if (b.k === "think") body.append(el("div", "think", "· thinking ·"));
    else if (b.k === "tool") { const t = el("div", "tool" + (b.open ? " open" : "") + (b.isErr ? " err" : "")); const nm = el("span", "nm", "▸ " + b.name); t.append(nm, document.createTextNode(" " + (b.target || ""))); if (b.result) { const r = el("div", "res", b.result); t.append(r); t.onclick = () => t.classList.toggle("x"); } body.append(t); }
    else if (b.k === "error") body.append(el("div", "errb", "⚠ " + b.text));
  });
  if (m.stopped) body.append(el("div", "cost", "stopped"));
  d.append(body); return d;
}
async function newConv() { if (!S.cur) return toast("Pick a project first", true); S.conv = await hq.chatNew({ proj: S.cur, model: $("#model-pick").value }); await fillConvPick(await hq.chatList(S.cur)); renderLog(); $("#input").focus(); }
$("#btn-hide").onclick = () => { S.hideChat = !S.hideChat; renderLog(); };
async function sendInput() {
  if (S.hideChat) { S.hideChat = false; renderLog(); }
  const ta = $("#input"), text = ta.value.trim(), images = S.attach.map((a) => ({ mediaType: a.mediaType, data: a.data })); if (!text && !images.length) return;
  if (!S.conv) await newConv(); if (!S.conv) return;
  ta.value = ""; S.attach = []; renderAttach(); autosize(); S.follow = true; await hq.chatSend({ id: S.conv.id, text, images });
}
// ---- rename ----
function startRename() {
  if (!S.conv) return; const sel = $("#conv-pick"); if (sel.nextElementSibling && sel.nextElementSibling.id === "rename-in") return;
  const inp = document.createElement("input"); inp.id = "rename-in"; inp.className = "rename-in"; inp.maxLength = 80; inp.value = S.conv.title || "";
  let done = false;
  const end = async (save) => { if (done) return; done = true; const v = inp.value.trim(); inp.remove(); sel.style.display = ""; if (save && v && v !== S.conv.title) { try { await hq.chatRename({ id: S.conv.id, title: v }); } catch (x) { return toast(/No handler/i.test(String(x)) ? "Rename needs a restart: click ⟳ restart to apply" : "Rename failed: " + (x.message || x), true); } S.conv.title = v; if (S.cur) fillConvPick(await hq.chatList(S.cur)); } };
  inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); end(true); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(false); } };
  inp.onblur = () => end(true);
  sel.style.display = "none"; sel.after(inp); inp.focus(); inp.select();
}
$("#btn-rename").onclick = startRename; $("#conv-pick").ondblclick = startRename;
// ---- image attachments (paste / drop) ----
S.attach = [];
const MAX_IMG = 5 * 1024 * 1024, MAX_N = 6;
function renderAttach() {
  const st = $("#attach"); st.textContent = ""; st.classList.toggle("hidden", !S.attach.length);
  S.attach.forEach((a, i) => { const w = el("div", "thumb"), im = document.createElement("img"); im.src = "data:" + a.mediaType + ";base64," + a.data; const x = el("button", "x", "×"); x.title = "Remove"; x.onclick = () => { S.attach.splice(i, 1); renderAttach(); }; w.append(im, x); st.append(w); });
}
function readFile(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
async function shrink(url, mt) { // downscale until the base64 payload fits the limit
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  let scale = 1, out = url, outMt = mt;
  for (let n = 0; n < 8 && Math.ceil((out.length - out.indexOf(",") - 1) * 0.75) > MAX_IMG; n++) {
    scale *= 0.75; const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(img.naturalWidth * scale)); cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); outMt = "image/jpeg"; out = cv.toDataURL("image/jpeg", 0.85);
  }
  return { mediaType: outMt, data: out.slice(out.indexOf(",") + 1) };
}
async function addFiles(files) {
  const imgs = [...files].filter((f) => /^image\/(png|jpeg|gif|webp)$/.test(f.type)); if (!imgs.length) return false;
  for (const f of imgs) {
    if (S.attach.length >= MAX_N) { toast("Max " + MAX_N + " images per message", true); break; }
    try { const url = await readFile(f); S.attach.push(await shrink(url, f.type)); } catch (e) { toast("Could not read that image", true); }
  }
  renderAttach(); return true;
}
function wireAttach(elm) {
  elm.addEventListener("paste", (e) => { const fl = [...((e.clipboardData && e.clipboardData.items) || [])].filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter(Boolean); if (!e._hq && fl.some((f) => /^image\//.test(f.type))) { e._hq = 1; e.preventDefault(); addFiles(fl); } });
  elm.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); elm.classList.add("dropping"); } });
  elm.addEventListener("dragleave", () => elm.classList.remove("dropping"));
  elm.addEventListener("drop", (e) => { elm.classList.remove("dropping"); if (!e._hq && e.dataTransfer && e.dataTransfer.files.length) { e._hq = 1; e.preventDefault(); addFiles(e.dataTransfer.files); } });
}
wireAttach($("#input")); wireAttach($("#console"));
function autosize() { const ta = $("#input"); ta.style.height = "auto"; ta.style.height = Math.min(220, ta.scrollHeight + 2) + "px"; }
function lastReplyText(c) { const m = [...(c.msgs || [])].reverse().find((x) => x.r === "asst"); if (!m) return ""; return (m.blocks || []).filter((b) => b.k === "text").map((b) => b.text).join(" "); }
// Kokoro voice: main-process worker streams WAV clips (one per sentence); we queue and play them in order.
const TTS = { id: 0, q: [], playing: null, ctx: null, done: false, started: false, failed: false, dog: 0 };
const tlog = (m) => { try { Promise.resolve(hq.ttsLog(m)).catch(() => {}); } catch {} };
function ttsCtx() { return TTS.ctx || (TTS.ctx = new AudioContext()); }
function dogReset() { clearTimeout(TTS.dog); TTS.dog = TTS.started && !TTS.done ? setTimeout(() => ttsFail("no audio received from the voice engine"), 90000) : 0; }
function stopSpeech() { clearTimeout(TTS.dog); TTS.id = 0; TTS.q = []; TTS.done = true; if (TTS.playing) { try { TTS.playing.onended = null; TTS.playing.stop(); } catch {} TTS.playing = null; } hq.ttsStop(); speechSynthesis.cancel(); $("#btn-voice").classList.remove("loading"); }
function ttsNext() {
  if (TTS.playing) return;
  const buf = TTS.q.shift();
  if (!buf) { if (TTS.done && TTS.started) { TTS.started = false; clearTimeout(TTS.dog); setMood("idle"); } return; }
  const ctx = ttsCtx(); TTS.playing = true; // reserve the slot while resume() settles
  Promise.resolve(ctx.state === "running" ? 0 : ctx.resume()).then(() => {
    tlog("play " + buf.duration.toFixed(2) + "s ctx=" + ctx.state);
    if (ctx.state !== "running") { TTS.playing = null; return ttsFail("audio output is suspended (" + ctx.state + ")"); }
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
    src.onended = () => { tlog("ended"); TTS.playing = null; ttsNext(); };
    TTS.playing = src; src.start(); setMood("speak", "speaking");
  }).catch((e) => { TTS.playing = null; ttsFail("playback: " + e.message); });
}
function cleanForSpeech(text) { return text.replace(/```[\s\S]*?```/g, " code block. ").replace(/[`*#>_\[\]()]/g, "").replace(/https?:\/\/\S+/g, "link").slice(0, 600); }
function speakFallback(clean) {
  const u = new SpeechSynthesisUtterance(clean); const v = speechSynthesis.getVoices().find((x) => /en-GB/i.test(x.lang) && /male|ryan|george/i.test(x.name)) || speechSynthesis.getVoices().find((x) => /en-GB/i.test(x.lang)) || null;
  if (v) u.voice = v; u.rate = 1.05; u.pitch = 0.9;
  u.onstart = () => { tlog("fallback speaking"); setMood("speak", "speaking"); }; u.onend = () => setMood("idle"); u.onerror = (e) => { tlog("fallback error " + e.error); toast("System voice failed too: " + e.error, true); };
  speechSynthesis.speak(u);
}
function voiceBtn() { const b = $("#btn-voice"); b.classList.remove("loading"); b.textContent = S.voice ? "🔊 voice on" : "🔈 voice off"; }
function ttsFail(msg) {
  tlog("FAIL " + msg); clearTimeout(TTS.dog); voiceBtn();
  if (TTS.failed || !S.voice) return; TTS.failed = true;
  toast("Kokoro voice failed (" + msg + "), using the system voice", true);
  TTS.q = []; TTS.done = true; hq.ttsStop(); if (TTS.playing && TTS.playing.stop) { try { TTS.playing.onended = null; TTS.playing.stop(); } catch {} } TTS.playing = null;
  if (TTS.clean) speakFallback(TTS.clean);
}
async function speak(text) {
  if (!S.voice || !text) return; stopSpeech();
  const clean = cleanForSpeech(text); TTS.q = []; TTS.done = false; TTS.started = true; TTS.failed = false; TTS.clean = clean;
  try { ttsCtx().resume().catch(() => {}); } catch {}
  if (!TTS.ready) { $("#btn-voice").classList.add("loading"); setMood("think", "loading voice"); }
  tlog("speak() " + clean.length + " chars voice=" + S.voiceName + " speed=" + S.speed);
  dogReset();
  if (typeof hq.ttsSpeak !== "function") return ttsFail("the running HQ OS is older than the voice engine: restart HQ OS");
  try { TTS.id = await hq.ttsSpeak({ text: clean, voice: S.voiceName, speed: S.speed }); } catch (e) { ttsFail(/No handler|not a function/.test(e.message) ? "the running HQ OS is older than the voice engine: restart HQ OS" : "ipc: " + e.message); }
}
hq.on("tts", async (m) => {
  if (m.type === "progress") { dogReset(); $("#btn-voice").textContent = "⏳ loading voice " + m.pct + "%"; return; }
  if (m.type === "ready") { TTS.ready = true; return; }
  if (m.id && m.id !== TTS.id) return; // stale clip from a cancelled reply
  if (m.type === "chunk") {
    TTS.ready = true; dogReset(); voiceBtn();
    try { const buf = await ttsCtx().decodeAudioData(m.wav.buffer.slice(m.wav.byteOffset, m.wav.byteOffset + m.wav.byteLength)); tlog("decoded " + buf.duration.toFixed(2) + "s @" + buf.sampleRate + "Hz"); TTS.q.push(buf); ttsNext(); } catch (e) { ttsFail("decode: " + e.message); }
  } else if (m.type === "done") { TTS.done = true; ttsNext(); }
  else if (m.type === "error") ttsFail(m.error);
});
// compact voice settings: one button + popover (voice list, speed row), clamped to the viewport
const VOICES = [["am_michael", "Michael (US)"], ["bm_george", "George (UK)"], ["af_heart", "Heart (US, F)"], ["bf_emma", "Emma (UK, F)"], ["am_fenrir", "Fenrir (US)"], ["bm_fable", "Fable (UK)"]], SPEEDS = [0.9, 1, 1.1, 1.25, 1.4];
function vsetLabel() { const v = VOICES.find((x) => x[0] === S.voiceName) || VOICES[0]; $("#btn-vset").textContent = v[1][0] + "·" + (+S.speed || 1.1) + "×"; }
function closeVpop() { const p = $("#vpop"); if (p) p.remove(); }
function openVpop() {
  closeVpop(); const btn = $("#btn-vset"), p = document.createElement("div"); p.id = "vpop"; p.className = "vpop";
  const draw = () => { p.innerHTML = '<div class="vp-h">Voice</div>' + VOICES.map((v) => '<button data-v="' + v[0] + '"' + (v[0] === S.voiceName ? ' class="on"' : "") + ">" + v[1] + "</button>").join("") + '<div class="vp-h">Speed</div><div class="vp-sp">' + SPEEDS.map((x) => '<button data-s="' + x + '"' + (x === +S.speed ? ' class="on"' : "") + ">" + x + "×</button>").join("") + '</div><div class="vp-h">Mic</div><button data-auto="1"' + (S.autoSend ? ' class="on"' : "") + ">Auto-send after speaking: " + (S.autoSend ? "on" : "off") + "</button>"; };
  draw(); document.body.appendChild(p);
  const place = () => { const r = btn.getBoundingClientRect(), z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1, w = p.offsetWidth, h = p.offsetHeight, vw = innerWidth / z, vh = innerHeight / z, rl = r.left / z, rt = r.top / z, rb = r.bottom / z;
    let top = rb + 4; if (top + h > vh - 6 && rt - h - 4 > 6) top = rt - h - 4; top = Math.max(6, Math.min(top, vh - h - 6)); p.style.left = Math.max(6, Math.min(rl, vw - w - 6)) + "px"; p.style.top = top + "px"; };
  place();
  p.onclick = (e) => { const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.auto) { S.autoSend = !S.autoSend; hq.set({ autoSend: S.autoSend }); draw(); place(); return; }
    if (b.dataset.v) { S.voiceName = b.dataset.v; hq.set({ voiceName: S.voiceName }); } else { S.speed = +b.dataset.s; hq.set({ speed: S.speed }); }
    speak("Voice online."); vsetLabel(); draw(); place(); };
  const cleanup = () => { document.removeEventListener("mousedown", off, true); document.removeEventListener("keydown", off, true); removeEventListener("resize", shut); removeEventListener("blur", shut); };
  const shut = () => { closeVpop(); cleanup(); };
  const off = (e) => { if (e.type === "keydown" ? e.key === "Escape" : !p.contains(e.target) && e.target !== btn) shut(); };
  setTimeout(() => { document.addEventListener("mousedown", off, true); document.addEventListener("keydown", off, true); addEventListener("resize", shut); addEventListener("blur", shut); }, 0);
}

// ---------- wiring ----------
hq.on("chat", async (ev) => {
  if (ev.what === "list" || !ev.conv) {
    if (!S.cur) return; const list = await hq.chatList(S.cur);
    if (S.conv && !list.some((c) => c.id === S.conv.id)) { S.conv = null; renderLog(); } // deleted elsewhere
    fillConvPick(list); return;
  }
  if (S.conv && ev.conv.id === S.conv.id) {
    S.conv = ev.conv; renderLog();
    if (ev.what === "turn") setMood("think");
    else if (ev.what === "stream") { const last = ev.conv.msgs[ev.conv.msgs.length - 1]; const b = last && last.blocks && last.blocks[last.blocks.length - 1]; setMood(b && b.k === "text" ? "speak" : "think", b && b.k === "tool" ? "running " + b.name : undefined); }
    else if (ev.what === "done") { setMood("idle"); speak(lastReplyText(ev.conv)); fillConvPick(await hq.chatList(S.cur)); }
  } else if (ev.what === "done") toast("Claude finished: " + ev.conv.title);
});
hq.on("agents", (a) => { S.agents = a; renderAgents(); renderProjects(); });
if (window.HQActivity) window.HQActivity.onCounts(() => renderProjects());
hq.on("usage", (u) => { S.usage = u.usage; renderUsage(u.usage, u.err); });
hq.on("todo-changed", async (id) => { if (id === S.cur) { S.detail = await hq.project(id); renderDetail(); } loadProjects(); });

{ const l = $("#log"); let userScroll = 0; const mark = () => (userScroll = Date.now());
  ["wheel", "touchmove", "mousedown", "keydown"].forEach((ev) => l.addEventListener(ev, mark, { passive: true }));
  l.addEventListener("scroll", () => { if (Date.now() - userScroll < 800) S.follow = l.scrollHeight - l.scrollTop - l.clientHeight < 40; });
  // any layout change (view switch, panel open, fold, resize) re-pins to the bottom while following
  new ResizeObserver(() => { if (S.follow) l.scrollTop = l.scrollHeight; }).observe(l);
  window.HQPinLog = () => { S.follow = true; l.scrollTop = l.scrollHeight; }; }
$("#input").addEventListener("input", autosize);
$("#input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const cut = (e.ctrlKey || e.metaKey) && S.conv && S.conv.busy, id = S.conv && S.conv.id; sendInput().then(() => { if (cut && id) hq.chatStop(id); }); } });
$("#btn-send").onclick = sendInput;
$("#btn-stop").onclick = () => S.conv && hq.chatStop(S.conv.id);
$("#btn-new").onclick = newConv;
$("#btn-del").onclick = async () => { if (!S.conv) return; const b = $("#btn-del"); if (!b.dataset.arm) { b.dataset.arm = "1"; b.textContent = "confirm?"; setTimeout(() => { delete b.dataset.arm; b.textContent = "delete"; }, 2500); return; } delete b.dataset.arm; b.textContent = "delete"; await hq.chatDelete(S.conv.id); S.conv = null; const list = await hq.chatList(S.cur); await fillConvPick(list); if (list.length) openConv(list[0].id); else renderLog(); };
$("#conv-pick").onchange = (e) => e.target.value && openConv(e.target.value);
$("#model-pick").onchange = (e) => S.conv && hq.chatModel({ id: S.conv.id, model: e.target.value });
// ---- voice input (local Whisper in a utility process) ----
const MIC = { st: "idle", ctx: null, stream: null, node: null, src: null, chunks: [], t0: 0, hold: false };
function micUI(st, tip) { MIC.st = st; const b = $("#btn-mic"); b.classList.toggle("rec", st === "rec"); b.classList.toggle("busy", st === "busy"); b.textContent = st === "busy" ? "…" : st === "rec" ? "⏹" : "🎤"; b.title = tip || (st === "rec" ? "Listening: click to stop, Esc to cancel" : st === "busy" ? "Transcribing…" : "Talk to Claude (click to start/stop, Esc cancels; hold Ctrl+Space to talk)"); $(".input-row").classList.toggle("mic-" + "rec", st === "rec"); $("#input").placeholder = st === "rec" ? "Listening…" : st === "busy" ? "Transcribing…" : MIC.ph; }
MIC.ph = $("#input").placeholder;
function micCleanup() { try { MIC.node && MIC.node.disconnect(); MIC.src && MIC.src.disconnect(); MIC.stream && MIC.stream.getTracks().forEach((t) => t.stop()); MIC.ctx && MIC.ctx.close(); } catch {} MIC.node = MIC.src = MIC.stream = MIC.ctx = null; }
async function micStart() {
  if (MIC.st !== "idle") return; MIC.chunks = []; MIC.cancel = false;
  try { stopSpeech(); } catch {}
  try {
    MIC.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    MIC.ctx = new AudioContext({ sampleRate: 16000 }); MIC.src = MIC.ctx.createMediaStreamSource(MIC.stream);
    MIC.node = MIC.ctx.createScriptProcessor(4096, 1, 1); MIC.node.onaudioprocess = (e) => MIC.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    MIC.src.connect(MIC.node); MIC.node.connect(MIC.ctx.destination); MIC.t0 = Date.now(); micUI("rec");
  } catch (e) { micCleanup(); micUI("idle"); toast("Microphone unavailable: " + (e && e.message || e), true); }
}
async function micStop(cancel) {
  if (MIC.st !== "rec") return; const sr = MIC.ctx ? MIC.ctx.sampleRate : 16000, chunks = MIC.chunks; MIC.chunks = []; micCleanup();
  if (cancel) return micUI("idle");
  const n = chunks.reduce((s, c) => s + c.length, 0); if (n < sr * 0.4) { micUI("idle"); return toast("Too short, nothing heard"); }
  let pcm = new Float32Array(n), o = 0; for (const c of chunks) { pcm.set(c, o); o += c.length; }
  if (sr !== 16000) { const r = sr / 16000, out = new Float32Array(Math.floor(n / r)); for (let i = 0; i < out.length; i++) { const x = i * r, j = Math.floor(x), t = x - j; out[i] = pcm[j] * (1 - t) + (pcm[j + 1] ?? pcm[j]) * t; } pcm = out; }
  micUI("busy");
  try {
    const text = ((await hq.sttTranscribe(pcm)) || "").trim(); micUI("idle");
    if (!text) return toast("Didn't catch anything");
    const ta = $("#input"), s = ta.selectionStart ?? ta.value.length, e2 = ta.selectionEnd ?? s, before = ta.value.slice(0, s), after = ta.value.slice(e2), sp = before && !/s$/.test(before) ? " " : "";
    ta.value = before + sp + text + after; const pos = (before + sp + text).length; ta.setSelectionRange(pos, pos); autosize(); ta.focus();
    if (S.autoSend) sendInput();
  } catch (e) { micUI("idle"); toast("Transcription failed: " + (e && e.message || e), true); }
}
hq.on("stt", (m) => { if (m.type === "progress" && MIC.st === "busy") $("#btn-mic").title = "Loading speech model " + m.pct + "%"; });
$("#btn-mic").onclick = () => (MIC.st === "rec" ? micStop() : micStart());
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && MIC.st === "rec") { e.preventDefault(); micStop(true); }
  else if (e.ctrlKey && e.code === "Space" && !e.repeat) { e.preventDefault(); if (MIC.st === "rec") micStop(); else { MIC.hold = true; micStart(); } }
}, true);
addEventListener("keyup", (e) => { if (MIC.hold && (e.code === "Space" || e.key === "Control")) { MIC.hold = false; if (MIC.st === "rec" && Date.now() - MIC.t0 > 600) micStop(); } }, true);
$("#btn-vset").onclick = (e) => { e.stopPropagation(); if ($("#vpop")) closeVpop(); else openVpop(); };
$("#btn-voice").onclick = () => { S.voice = !S.voice; hq.set({ voice: S.voice }); $("#btn-voice").textContent = S.voice ? "🔊 voice on" : "🔈 voice off"; if (!S.voice) stopSpeech(); else speak("Voice online."); };
{ const box = $("#newproj"), inp = $("#newproj-name"), err = $("#newproj-err"); let busy = false;
  const close = () => { box.classList.add("hidden"); inp.value = ""; err.textContent = ""; };
  $("#btn-newproj").onclick = () => { if (box.classList.contains("hidden")) { box.classList.remove("hidden"); inp.focus(); } else close(); };
  inp.addEventListener("input", () => (err.textContent = ""));
  inp.addEventListener("keydown", async (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Enter") { e.preventDefault(); if (busy) return; busy = true;
      try { const r = await hq.projectCreate(inp.value); if (!r.ok) err.textContent = r.err; else { close(); await loadProjects(); if (r.id) await selectProject(r.id); toast("Created " + r.name); } }
      catch (x) { err.textContent = /No handler/.test(x.message) ? "Restart HQ OS to use this" : x.message; } busy = false; } });
}
$("#add-form").onsubmit = async (e) => { e.preventDefault(); const i = $("#add-input"), t = i.value.trim(); if (!t || !S.cur) return; try { S.detail = await hq.todoAdd({ id: S.cur, text: t }); i.value = ""; renderDetail(); loadProjects(); } catch (er) { toast(er.message, true); } };
document.querySelectorAll(".winbtns button").forEach((b) => (b.onclick = () => hq.win(b.dataset.w)));
document.addEventListener("keydown", (e) => {
  if (e.key === "F1") { e.preventDefault(); return setView("hq"); }
  if (e.key === "F4") { e.preventDefault(); return goStonks(); }
  if (e.key === "F5") { e.preventDefault(); return setView(document.body.classList.contains("in-nebula") ? "hq" : "home"); }
  if (e.key === "F2") { e.preventDefault(); return setView(document.body.classList.contains("in-tower") ? "hq" : "tower"); }
  if (document.body.classList.contains("in-tower")) return; // the tower handles its own keys
  if (e.ctrlKey && e.key.toLowerCase() === "k") { e.preventDefault(); $("#input").focus(); }
  else if (e.ctrlKey && e.key.toLowerCase() === "n") { e.preventDefault(); newConv(); }
  else if (e.ctrlKey && /^[1-9]$/.test(e.key)) { const p = activeProjects()[+e.key - 1]; if (p) { e.preventDefault(); selectProject(p.id); } }
  else if (e.key === "F5") { e.preventDefault(); loadProjects(); }
  else if (e.key === "Escape") {
    let did = false; if (TTS.started) { stopSpeech(); did = true; } if (S.conv && S.conv.busy) { hq.chatStop(S.conv.id); did = true; }
    const a = document.activeElement, typing = a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.value;
    // nothing to stop, no popup open, nothing typed: Esc goes home
    if (!did && !e.defaultPrevented && !typing && !REV.cur && !document.querySelector("#vpop, #newproj:not(.hidden), #needs-pop:not(.hidden), #acc-pop:not(.hidden)") && document.body.classList.contains("in-nebula") === false) setView("home");
  }
  else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "h") { e.preventDefault(); $("#btn-handoff").click(); }
});

// ---------- themes, audio, music ----------
HQTheme.onAccent((rgb, sec) => core.setAccent(rgb, sec));
function fillThemes(cur) { const sel = $("#theme-pick"); sel.textContent = ""; HQTheme.THEMES.forEach((t) => { const o = el("option", "", "◐ " + t.name); o.value = t.id; sel.append(o); }); sel.value = HQTheme.THEMES.some((t) => t.id === cur) ? cur : "cyan"; return sel.value; }
$("#theme-pick").onchange = (e) => { HQTheme.apply(e.target.value); hq.set({ theme: e.target.value }); paintAccentBtn(); };
// ---------- accent picker (old HQ OS swatches + custom); the second colour follows as its opposite ----------
function paintAccentBtn() { $("#acc-sw").style.background = getComputedStyle(document.documentElement).getPropertyValue("--acc"); }
function setAccentColour(h) { HQTheme.setAccent(h); hq.set({ accent: HQTheme.accent }); paintAccentBtn(); document.querySelectorAll("#acc-grid button").forEach((b) => b.classList.toggle("on", b.dataset.c === HQTheme.accent)); }
HQTheme.ACCENTS.forEach(([name, c]) => { const b = el("button", "acc-s"); b.title = name; b.dataset.c = c; b.style.background = c; b.onclick = () => setAccentColour(c); $("#acc-grid").append(b); });
$("#acc-btn").onclick = (e) => { e.stopPropagation(); $("#acc-pop").classList.toggle("hidden"); };
$("#acc-pop").onclick = (e) => e.stopPropagation();
document.addEventListener("click", () => $("#acc-pop").classList.add("hidden"));
$("#acc-custom").oninput = (e) => setAccentColour(e.target.value);
$("#acc-reset").onclick = () => setAccentColour("");
function setAudio(on) { S.audio = on; $("#btn-audio").textContent = on ? "♫ viz on" : "♫ viz off"; if (on) HQAudio.start().then(() => { if (HQAudio.err) toast("Visualizer: " + HQAudio.err, true); }); else HQAudio.stop(); }
$("#btn-audio").onclick = () => { setAudio(!S.audio); hq.set({ audio: S.audio }); };
function renderMusic(m) {
  const box = $("#music"); box.classList.toggle("hidden", !m); $("#core-wrap").classList.toggle("has-music", !!m);
  HQTheme.setMusic(m && m.cover);
  if (!m) return;
  $("#m-cover").src = m.cover || "icon.png"; $("#m-title").textContent = m.title; $("#m-artist").textContent = m.artist || ""; $("#m-app").textContent = (m.playing ? "▶ " : "❚❚ ") + m.app;
  $("#m-play").textContent = m.playing ? "⏸" : "▶"; box.classList.toggle("playing", !!m.playing); box.title = (m.playing ? "Playing in " : "Paused in ") + m.app;
}
document.querySelectorAll(".music .mc button").forEach((b) => (b.onclick = () => hq.musicCtl(b.dataset.m)));
hq.on("music", renderMusic);

// ---------- vitals ----------
function vitLine(svg, vals) { const n = vals.length; if (n < 2) return; svg.querySelector("polyline").setAttribute("points", vals.map((v, i) => [(i * 60) / (n - 1), 17 - (v / 100) * 16].join(",")).join(" ")); }
hq.on("vitals", ({ now, hist }) => {
  for (const [id, v, k] of [["#v-cpu", now.cpu, 0], ["#v-ram", now.ram, 1]]) {
    const row = $(id); row.querySelector(".v").textContent = v + "%"; row.querySelector("i").style.width = v + "%"; row.classList.toggle("hot", v >= 85);
    vitLine(row.querySelector("svg"), hist.map((h) => h[k]));
  }
  $("#v-ram").title = now.ramUsed.toFixed(1) + " / " + now.ramTot.toFixed(1) + " GB";
  $("#v-sub").textContent = now.ramUsed.toFixed(1) + "/" + Math.round(now.ramTot) + " GB · claude ×" + now.claude + (now.claudeMem ? " · " + (now.claudeMem / 1024).toFixed(1) + " GB" : "");
  $("#v-sub").title = now.cores + " CPU cores";
});

// ---------- cache clock + handoff / compact ----------
const CACHE_WARN = 50, CACHE_COLD = 60; // minutes (same defaults as the plugin)
const kfmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(Math.round(n || 0));
function renderCache() {
  const c = S.conv, chip = $("#cache"), ho = $("#btn-handoff");
  if (!c || !c.lastAt || !c.ctx) { chip.classList.add("hidden"); ho.classList.remove("hot"); return; }
  const age = (Date.now() - c.lastAt) / 60000, left = Math.max(0, Math.ceil(CACHE_COLD - age));
  const st = c.busy ? "warm" : age >= CACHE_COLD ? "cold" : age >= CACHE_WARN ? "warn" : "warm";
  chip.className = "cache " + st;
  chip.textContent = st === "cold" ? "❄ cache cold · next msg re-reads " + kfmt(c.ctx) : st === "warn" ? "⚠ cache cold in " + left + "m" : "● cache warm · " + left + "m · " + kfmt(c.ctx) + " ctx";
  chip.title = "Claude keeps this chat cached for about an hour after each message. After that the next message re-reads all " + kfmt(c.ctx) + " tokens at full price.";
  const big = c.ctx > 120000, coldHot = st === "cold" && c.ctx > 20000;
  ho.classList.toggle("hot", big || coldHot);
  ho.dataset.why = big ? "Context is high (" + kfmt(c.ctx) + "): hand off to a fresh chat." : coldHot ? "Cache is cold: the next message re-reads " + kfmt(c.ctx) + ". A handoff starts fresh and cheaper." : "";
  ho.title = (ho.dataset.why ? ho.dataset.why + "\n\n" : "") + "HANDOFF: Claude writes a detailed summary of this chat, then a NEW chat starts with it.";
  $("#btn-compact").classList.toggle("hot", c.ctx > 150000 && st !== "cold");
}
setInterval(renderCache, 15000);
$("#btn-handoff").onclick = async () => {
  if (!S.conv) return toast("Open a chat first", true);
  const b = $("#btn-handoff"); if (b.classList.contains("busy")) return;
  b.classList.add("busy"); b.textContent = "⇄ handing off…"; setMood("think", "writing handoff");
  try { const nid = await hq.chatHandoff(S.conv.id); await fillConvPick(await hq.chatList(S.cur)); await openConv(nid); toast("Handoff done: new chat started with the summary"); }
  catch (e) { toast("Handoff: " + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""), true); }
  finally { b.classList.remove("busy"); b.textContent = "⇄ handoff"; }
};
$("#btn-compact").onclick = async () => { if (!S.conv) return toast("Open a chat first", true); try { await hq.chatCompact(S.conv.id); toast("Compacting…"); } catch (e) { toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""), true); } };

// ---------- files in play (from the crew: agents + busy console chats) ----------
function renderFiles(crew) {
  const seen = new Map();
  for (const a of crew) for (const f of a.files || []) { const k = String(f.p).replace(/\\/g, "/").toLowerCase(); const prev = seen.get(k); if (!prev || (f.t || 0) > (prev.t || 0)) seen.set(k, Object.assign({ who: a.name }, f)); }
  const list = [...seen.values()].sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 10), box = $("#files"); box.textContent = "";
  list.forEach((f) => { const r = el("div", "file " + f.op); r.title = f.p; r.append(el("span", "op", f.op === "edit" ? "EDIT" : "READ"), el("span", "fp", String(f.p).replace(/\\/g, "/").split("/").slice(-3).join("/")), el("span", "who", f.who)); box.append(r); });
  if (!list.length) box.append(el("div", "none", "Nothing open right now."));
  $("#c-files").textContent = list.length; $("#c-files").classList.toggle("zero", !list.length);
}
hq.on("crew", (c) => { renderFiles(c); renderLive(c); });
// ---------- live agents panel (bottom-left): everyone working right now; click one to open the tower ----------
function renderLive(crew) {
  S.crew = crew; const box = $("#live-ag"); box.textContent = "";
  const order = { running: 0, stalled: 1 }; const list = crew.slice().sort((a, b) => (order[a.status] || 0) - (order[b.status] || 0) || (b.start || 0) - (a.start || 0));
  list.forEach((a) => {
    const r = el("div", "la " + a.status + " k-" + a.kind); r.title = a.name + (a.step ? "\n" + a.step : "");
    const top = el("div", "la-t"); top.append(el("span", "dot"), el("span", "la-n", a.name), el("span", "la-tm", a.start ? dur(Date.now() - a.start) : a.updated || ""));
    const last = a.steps && a.steps.length ? a.steps[a.steps.length - 1].text : a.step || "";
    r.append(top, el("div", "la-s", (a.kind === "chat" ? "console · " : a.kind === "board" ? "team · " : "") + (a.proj ? a.proj + " · " : "") + (last || (a.status === "stalled" ? "quiet for a while" : "starting…"))));
    r.onclick = () => setView("tower");
    box.append(r);
  });
  if (!list.length) box.append(el("div", "none", "No agents running."));
  const run = list.filter((x) => x.status === "running").length;
  $("#c-live").textContent = run; $("#c-live").classList.toggle("zero", !run);
}
setInterval(() => S.crew && renderLive(S.crew), 15000); // keep the timers ticking
$("#live-room").onclick = () => setView("tower");
// ---------- "N items need you" chip: everything waiting on you, across projects ----------
async function jumpToNeed(id, line) {
  setView("hq"); $("#needs-pop").classList.add("hidden");
  if (S.cur !== id) await selectProject(id);
  const pw = $("#p-wait"); pw.scrollIntoView({ behavior: "smooth", block: "start" });
  const r = line !== undefined && pw.querySelector(`.item[data-line="${line}"]`);
  (r ? [r] : [...pw.querySelectorAll(".item")]).forEach((x) => { x.classList.remove("flash"); void x.offsetWidth; x.classList.add("flash"); });
}
$("#chip-sys").onclick = async (e) => {
  e.stopPropagation(); const pop = $("#needs-pop");
  if (!pop.classList.contains("hidden")) return pop.classList.add("hidden");
  const groups = await hq.needs(); pop.textContent = "";
  if (!groups.length) pop.append(el("div", "none", "Nothing is waiting on you."));
  groups.forEach((g) => {
    const h = el("div", "np-h"); h.append(el("span", "", g.name), el("span", "count", String(g.items.length))); h.onclick = () => jumpToNeed(g.id); pop.append(h);
    g.items.forEach((it) => { const r = el("div", "np-i", it.text); r.title = it.text; r.onclick = () => jumpToNeed(g.id, it.line); pop.append(r); });
  });
  pop.classList.remove("hidden");
};
$("#needs-pop").onclick = (e) => e.stopPropagation();
document.addEventListener("click", () => $("#needs-pop").classList.add("hidden"));

// ---------- views: HQ, Home and Tower live in the same window (the Trading Floor is the Stonks floor inside the tower) ----------
function goStonks() { setView("tower"); if (window.HQTower) HQTower.go("stonks"); }
window.HQGoStonks = goStonks;
function setView(v, welcome) {
  if (v === "nebula") v = "home";
  const neb = v === "home"; document.body.classList.toggle("in-nebula", neb); $("#nebula-view").classList.toggle("hidden", !neb); if (window.HQNebula) window.HQNebula.show(neb); if (window.HQHome) window.HQHome.show(neb, neb && !!welcome);
  const tw = v === "tower"; document.body.classList.toggle("in-tower", tw); $("#tower-view").classList.toggle("hidden", !tw); if (window.HQTower) window.HQTower.show(tw);
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  requestAnimationFrame(() => window.HQPinLog && window.HQPinLog());
  if (tw) { const ae = document.activeElement; if (ae && ae.blur) ae.blur(); } else $("#input").focus();
}
window.HQView = setView;
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => setView(b.dataset.view)));

// ---------- boot ----------
(async function boot() {
  tickClock(); setInterval(tickClock, 1000);
  setMood("think", "booting");
  const init = await hq.init();
  S.autoSend = !!init.settings.autoSend; S.person = init.settings.person || "Hayden"; S.voice = init.settings.voice; S.voiceName = init.settings.voiceName || "am_michael"; S.speed = +init.settings.speed || 1.1; vsetLabel(); S.projects = init.projects; S.archived = new Set(init.settings.archived || []);
  $("#btn-voice").textContent = S.voice ? "🔊 voice on" : "🔈 voice off";
  const th = fillThemes(init.settings.theme); if (th !== init.settings.theme) hq.set({ theme: th }); // removed themes fall back to Cyan
  HQTheme.setAccent(init.settings.accent); HQTheme.apply(th); paintAccentBtn(); setAudio(init.settings.audio);
  document.querySelectorAll("#acc-grid button").forEach((b) => b.classList.toggle("on", b.dataset.c === HQTheme.accent));
  hq.music().then(renderMusic); hq.crew().then((c) => { renderFiles(c); renderLive(c); });
  $("#greet").textContent = greet(); setInterval(() => ($("#greet").textContent = greet()), 60000);
  renderProjects();
  const ui = JSON.parse(sessionStorage.getItem("hqui") || "{}"); S.hideChat = ui.hide === undefined ? true : !!ui.hide; // fresh start: chat hidden (Hayden 2026-11-23); reloads keep the last state
  const start = S.projects.find((p) => p.id === (ui.proj || init.settings.last)) || S.projects.find((p) => p.id === init.settings.last) || activeProjects()[0] || S.projects[0];
  if (start) await selectProject(start.id);
  if (ui.conv && ui.proj === S.cur) { try { await openConv(ui.conv); } catch (e) {} }
  if (ui.view === "tower") setView("tower"); else if (ui.view === "home" || ui.view === "nebula") setView("home"); else if (!ui.view && (init.settings.startView || "home") === "home") setView("home", true);
  hq.agents().then((a) => { S.agents = a; renderAgents(); renderProjects(); });
  hq.usage(false).then((u) => renderUsage(u.usage, u.err));
  setTimeout(() => setMood("idle"), 900);
  setInterval(loadProjects, 60000);
})();

// ---------- needs review ----------
const REV = { items: [], all: false, cur: null, proj: "" };
const ago = (iso) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); return isNaN(m) ? "" : m < 60 ? m + "m" : m < 1440 ? Math.floor(m / 60) + "h" : Math.floor(m / 1440) + "d"; };
async function loadReview() {
  const id = S.cur; if (!id) return;
  try { const items = await hq.reviewList(id); if (id !== S.cur) return; REV.items = items; REV.proj = id; } catch (e) { return; }
  renderReview();
}
function renderReview() {
  const todo = REV.items.filter((i) => i.status === "needs-review"), list = REV.all ? REV.items : todo, box = $("#p-rev");
  $("#c-rev").textContent = todo.length; $("#c-rev").classList.toggle("zero", !todo.length);
  $("#rev-filter").textContent = REV.all ? "all" : "to review";
  box.textContent = "";
  if (!list.length) box.append(el("div", "dim small", REV.all ? "Nothing in the review folder." : "Nothing to review."));
  for (const i of list) {
    const r = el("div", "rev-item"), th = el("div", "th");
    if (i.media[0] && !i.video) { const im = el("img"); im.src = i.media[0]; im.alt = ""; th.append(im); } else th.textContent = i.video ? "▶" : "✎";
    const tt = el("div", "tt"); tt.append(el("b", "", i.title), el("span", "", ago(i.created) + " ago"));
    const cls = { approved: "ok", rejected: "bad", changes: "chg" }[i.status] || "";
    r.append(th, tt); if (i.status !== "needs-review") r.append(el("span", "st " + cls, i.status));
    r.onclick = () => openReview(i); box.append(r);
  }
  const p = S.projects.find((x) => x.id === S.cur); if (p && p.review !== todo.length) { p.review = todo.length; renderProjects(); }
}
function openReview(i) {
  REV.cur = i; $("#rv-title").textContent = i.title; $("#rv-meta").textContent = i.status + " · " + ago(i.created) + " ago";
  const m = $("#rv-media"); m.textContent = "";
  for (const u of i.media) { if (/\.(mp4|webm)$/i.test(decodeURIComponent(u))) { const v = el("video"); v.src = u; v.controls = true; m.append(v); } else { const im = el("img"); im.src = u; im.alt = i.title; m.append(im); } }
  $("#rv-note").innerHTML = md(i.note); $("#rv-comment").value = ""; $("#rev-ov").classList.remove("hidden");
}
function closeReview() { $("#rev-ov").classList.add("hidden"); $("#rv-media").textContent = ""; REV.cur = null; }
async function reviewAct(status) {
  const i = REV.cur; if (!i) return; const comment = $("#rv-comment").value.trim();
  try { await hq.reviewSet({ id: S.cur, key: i.key, status, comment }); closeReview(); toast(status === "approved" ? "Approved" : status === "changes" ? "Changes requested" : "Rejected"); await loadReview(); loadProjects(); }
  catch (e) { toast(e.message, true); }
}
$("#rv-ok").onclick = () => reviewAct("approved"); $("#rv-chg").onclick = () => reviewAct("changes"); $("#rv-no").onclick = () => reviewAct("rejected");
$("#rv-close").onclick = closeReview; $("#rev-ov").onclick = (e) => { if (e.target.id === "rev-ov") closeReview(); };
$("#rev-filter").onclick = () => { REV.all = !REV.all; renderReview(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && REV.cur) { e.stopImmediatePropagation(); closeReview(); } }, true);
window.addEventListener("focus", loadReview); setInterval(loadReview, 45000);

// ---------- reload state + dev watchers ----------
window.addEventListener("beforeunload", () => sessionStorage.setItem("hqui", JSON.stringify({ proj: S.cur, conv: S.conv && S.conv.id, view: document.body.classList.contains("in-tower") ? "tower" : document.body.classList.contains("in-nebula") ? "home" : "hq", hide: !!S.hideChat })));
hq.on("code-changed", () => $("#restart-chip").classList.remove("hidden"));
hq.codePending().then((f) => f && $("#restart-chip").classList.remove("hidden")).catch(() => {});
$("#restart-chip").onclick = async () => { const busy = await hq.busy(); if (busy && !confirm("A chat is still running, restart anyway?")) return; hq.restart(); };

// Tiny restart button in the title bar (Hayden 2026-11-23)
{ const b = document.getElementById("btn-restart"); if (b) b.onclick = async () => { if (await hq.busy().catch(() => false) && !confirm("A chat is still running. Restart anyway?")) return; hq.restart(); }; }
