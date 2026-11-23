// File explorer: Obsidian-style ribbon + collapsible tree of the whole Projects folder. All fs work happens in main (files-ipc.js).
(() => {
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const note = (m, bad) => { if (typeof toast === "function") toast(m, !!bad); };
  const F = { open: false, w: 280, root: "", kids: new Map(), exp: new Set(), sel: "", play: new Set(), playDirs: new Set(), editing: "", q: "", hits: null, hist: [], cur: null };
  const norm = (p) => String(p || "").replace(/\//g, "\\").toLowerCase();
  const ICON = { md: ["✎", "md"], markdown: ["✎", "md"], js: ["‹›", "code"], mjs: ["‹›", "code"], ts: ["‹›", "code"], css: ["‹›", "code"], html: ["‹›", "code"], py: ["‹›", "code"], ps1: ["‹›", "code"], bat: ["‹›", "code"], json: ["{}", "data"], yml: ["{}", "data"], yaml: ["{}", "data"], jsonl: ["{}", "data"], csv: ["▦", "data"], txt: ["≡", "plain"], png: ["◩", "img"], jpg: ["◩", "img"], jpeg: ["◩", "img"], gif: ["◩", "img"], webp: ["◩", "img"], svg: ["◩", "img"], mp3: ["♪", "av"], wav: ["♪", "av"], mp4: ["▶", "av"], webm: ["▶", "av"], pdf: ["▤", "doc"], docx: ["▤", "doc"] };
  const parentOf = (p) => norm(p.slice(0, p.lastIndexOf("\\")));
  const iconFor = (e) => e.dir ? null : (ICON[(e.name.split(".").pop() || "").toLowerCase()] || ["·", "plain"]);
  const fmtSize = (n) => n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB";

  // ---------- DOM (all built here; index.html only loads this file and files.css) ----------
  const rib = mk("div", "", ""); rib.id = "fx-rib";
  const rbtn = mk("button", "fx-rb", "▤"); rbtn.title = "Files (Projects folder)"; rib.append(rbtn);
  const panel = mk("aside", ""); panel.id = "fx-panel";
  const head = mk("div", "fx-h"); const ttl = mk("span", "", "FILES"); const sp = mk("span", "fx-sp");
  const bRef = mk("button", "ghost fx-hb", "↻"); bRef.title = "Refresh"; const bCol = mk("button", "ghost fx-hb", "⇤"); bCol.title = "Collapse all";
  head.append(ttl, sp, bRef, bCol);
  const filt = mk("input", ""); filt.id = "fx-q"; filt.type = "text"; filt.placeholder = "Filter files…"; filt.spellcheck = false;
  const tree = mk("div", ""); tree.id = "fx-tree";
  const grip = mk("div", ""); grip.id = "fx-grip"; grip.title = "Drag to resize";
  panel.append(head, filt, tree, grip);
  const ov = mk("div", "rev-ov hidden"); ov.id = "fx-ov";
  ov.innerHTML = '<div class="rl-box"><div class="rl-top"><button class="ghost" id="fx-back" title="Back">◂</button><span class="rl-ttl" id="fx-rt"></span><span class="dim small" id="fx-rm"></span><span class="spacer"></span><button class="ghost" id="fx-re">open in editor</button><button class="ghost" id="fx-rc" title="Close (Esc)">✕</button></div><div class="rl-body"><article class="rl-doc" id="fx-doc"></article></div></div>';
  const menu = mk("div", "hidden"); menu.id = "fx-menu";
  document.body.append(panel, ov, menu); { const tb = document.querySelector(".titlebar"); if (tb) tb.prepend(rbtn); else { rib.append(rbtn); document.body.append(rib); } } // files button lives in the title bar (Hayden 2026-11-23)
  const $f = (s) => document.querySelector(s);

  // ---------- layout state ----------
  const applyLayout = () => { document.body.classList.toggle("fx-open", F.open); document.body.style.setProperty("--fxw", F.w + "px"); rbtn.classList.toggle("on", F.open); };
  const syncHide = () => { document.body.classList.toggle("fx-hide", [...document.body.classList].some((c) => /^in-/.test(c))); };
  new MutationObserver(syncHide).observe(document.body, { attributes: true, attributeFilter: ["class"] }); syncHide();
  const setOpen = (o) => { F.open = o; applyLayout(); hq.files("pref", { open: o }); if (o && !F.kids.has(F.root)) load(F.root).then(render); };
  rbtn.onclick = () => setOpen(!F.open);
  grip.onmousedown = (e) => {
    e.preventDefault(); document.body.classList.add("fx-drag"); const x0 = e.clientX, w0 = F.w;
    const mv = (ev) => { F.w = Math.max(200, Math.min(560, w0 + ev.clientX - x0)); document.body.style.setProperty("--fxw", F.w + "px"); };
    const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); document.body.classList.remove("fx-drag"); hq.files("pref", { w: F.w }); };
    document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
  };

  // ---------- tree ----------
  async function load(dir) {
    const r = await hq.files("list", dir);
    if (r.err) { F.kids.set(dir, []); return []; }
    F.kids.set(dir, r.entries);
    // a project folder opens with its Notes folder expanded one level (once)
    for (const e of r.entries) if (e.dir && e.name === "Notes" && !F.seen.has(e.path) && parentOf(dir) === norm(F.root)) { F.seen.add(e.path); F.exp.add(e.path); await load(e.path); }
    return r.entries;
  }
  F.seen = new Set();
  async function toggle(e) {
    if (F.exp.has(e.path)) F.exp.delete(e.path);
    else { F.exp.add(e.path); if (!F.kids.has(e.path)) { await load(e.path); } }
    render(); watch();
  }
  function rowFor(e, depth) {
    const r = mk("div", "fx-row" + (e.dir ? " dir" : " file") + (F.sel === e.path ? " sel" : "") + (F.play.has(norm(e.path)) ? " play" : "") + (e.dir && F.playDirs.has(norm(e.path)) ? " playin" : ""));
    r.style.paddingLeft = 8 + depth * 14 + "px"; r.dataset.path = e.path;
    if (e.dir) { r.append(mk("span", "fx-ar", F.exp.has(e.path) ? "▾" : "▸"), mk("span", "fx-ic fold", e.project ? "◈" : F.exp.has(e.path) ? "▤" : "▣")); }
    else { const [g, k] = iconFor(e); r.append(mk("span", "fx-ar", ""), mk("span", "fx-ic k-" + k, g)); }
    if (F.editing === e.path) r.append(editBox(e)); else r.append(mk("span", "fx-nm", e.name));
    if (!e.dir) r.title = e.name + "\n" + fmtSize(e.size) + " · " + new Date(e.mtime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); else r.title = e.path;
    r.onclick = (ev) => { if (F.editing) return; F.sel = e.path; e.dir ? toggle(e) : openFile(e); if (!e.dir) render(); };
    r.oncontextmenu = (ev) => { ev.preventDefault(); showMenu(ev.clientX, ev.clientY, e); };
    return r;
  }
  function build(dir, depth, out) {
    for (const e of F.kids.get(dir) || []) {
      out.push(rowFor(e, depth));
      if (e.dir && F.exp.has(e.path)) { if (!F.kids.has(e.path)) out.push(mk("div", "fx-ld", "…")); else if (!F.kids.get(e.path).length) { const n = mk("div", "fx-empty", "empty"); n.style.paddingLeft = 8 + (depth + 1) * 14 + 20 + "px"; out.push(n); } else build(e.path, depth + 1, out); }
    }
  }
  function render() {
    const keep = tree.scrollTop; tree.textContent = "";
    if (F.hits) {
      if (!F.hits.length) tree.append(mk("div", "fx-empty", F.q.length < 2 ? "type 2+ characters" : "no matches"));
      for (const h of F.hits) { const r = mk("div", "fx-row file hit" + (F.play.has(norm(h.path)) ? " play" : "")); r.title = h.rel; const [g, k] = iconFor({ name: h.name, dir: false }); r.append(mk("span", "fx-ic k-" + k, g), mk("span", "fx-nm", h.name), mk("span", "fx-pj", h.project)); r.onclick = () => openFile(h); r.oncontextmenu = (ev) => { ev.preventDefault(); showMenu(ev.clientX, ev.clientY, h); }; tree.append(r); }
    } else { const rows = []; build(F.root, 0, rows); if (!rows.length) rows.push(mk("div", "fx-empty", "loading…")); tree.append(...rows); }
    tree.scrollTop = keep;
    const ed = tree.querySelector(".fx-edit"); if (ed) { ed.focus(); ed.select(); }
  }
  const watch = () => hq.files("watch", F.open ? [F.root, ...F.exp].filter((d) => F.kids.has(d)) : []).catch(() => {});

  // ---------- files in play (crew data the app already tracks) ----------
  function setPlay(crew) {
    const p = new Set(), d = new Set(), root = norm(F.root);
    for (const a of crew || []) for (const f of a.files || []) { const k = norm(f.p); p.add(k); let dir = k; while ((dir = dir.slice(0, dir.lastIndexOf("\\"))) && dir.length > root.length) d.add(dir); }
    const same = p.size === F.play.size && [...p].every((x) => F.play.has(x)); F.play = p; F.playDirs = d; if (!same && !F.editing) render();
  }
  hq.on("crew", setPlay);

  // ---------- filter ----------
  let ft = 0, fseq = 0;
  filt.oninput = () => { clearTimeout(ft); F.q = filt.value.trim(); if (!F.q) { F.hits = null; render(); return; } ft = setTimeout(async () => { const s = ++fseq; const h = F.q.length < 2 ? [] : await hq.files("search", F.q); if (s === fseq) { F.hits = h; render(); } }, 200); };
  filt.onkeydown = (e) => { if (e.key === "Escape") { filt.value = ""; filt.oninput(); filt.blur(); } };

  // ---------- reader (reuses the Rules viewer's markdown renderer) ----------
  function mdToHtml(src) {
    src = String(src || "").replace(/^﻿/, "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
    let html = typeof rulesMd === "function" ? rulesMd(src).html : "<pre>" + src.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</pre>";
    return html.split(/(<pre>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>)/).map((s, i) => i % 2 ? s : s.replace(/\[\[([^\]\n]+)\]\]/g, (_, l) => '<a class="fx-wl" data-l="' + l.replace(/"/g, "&quot;") + '">' + (l.split("|")[1] || l.split("|")[0]) + "</a>")).join("");
  }
  async function showNote(p, push) {
    const r = await hq.files("read", p); if (r.err) return note(r.err, true);
    if (push && F.cur) F.hist.push(F.cur); F.cur = p;
    $f("#fx-rt").textContent = "✎ " + p.split("\\").pop().replace(/\.md$/i, ""); $f("#fx-rm").textContent = r.project + " · " + new Date(r.mtime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    const d = $f("#fx-doc"); d.innerHTML = mdToHtml(r.text); d.scrollTop = 0; $f("#fx-back").style.visibility = F.hist.length ? "visible" : "hidden";
    ov.classList.remove("hidden");
  }
  const closeReader = () => { ov.classList.add("hidden"); F.hist = []; F.cur = null; };
  $f("#fx-rc").onclick = closeReader; ov.onclick = (e) => { if (e.target === ov) closeReader(); };
  $f("#fx-re").onclick = () => F.cur && hq.files("open", F.cur);
  $f("#fx-back").onclick = () => { const p = F.hist.pop(); if (p) showNote(p, false); };
  $f("#fx-doc").addEventListener("click", async (e) => {
    const a = e.target.closest("a"); if (!a) return;
    if (a.classList.contains("fx-wl")) { e.preventDefault(); const t = await hq.files("resolve", { from: F.cur, link: a.dataset.l }); t ? showNote(t, true) : note("No note called “" + a.dataset.l.split("|")[0] + "” in this project", true); }
    else if (a.href) { e.preventDefault(); window.open(a.href); }
  });
  function openFile(e) { /\.md$/i.test(e.name) ? showNote(e.path, false) : hq.files("open", e.path); }

  // ---------- context menu, rename, new note ----------
  function hideMenu() { menu.classList.add("hidden"); }
  document.addEventListener("mousedown", (e) => { if (!menu.contains(e.target)) hideMenu(); }, true);
  window.addEventListener("blur", hideMenu);
  function showMenu(x, y, e) {
    menu.textContent = "";
    const item = (label, fn, off) => { const b = mk("div", "fx-mi" + (off ? " off" : ""), label); if (!off) b.onclick = () => { hideMenu(); fn(); }; menu.append(b); };
    const isProj = e.project, folder = e.dir ? e.path : e.path.replace(/\\[^\\]*$/, "");
    item("Open in editor", () => hq.files("open", e.path));
    item("Show in Explorer", () => hq.files("reveal", e.path));
    item("Copy path", () => navigator.clipboard.writeText(e.path).then(() => note("Path copied")).catch(() => {}));
    if (!e.dir && /\.md$/i.test(e.name) && window.HQNebula && window.HQNebula.select) item("Show in Nebula", () => { window.HQView("nebula"); setTimeout(() => window.HQNebula.select(e.path), 800); });
    menu.append(mk("div", "fx-sep"));
    item("New note here", () => newNote(folder));
    if (!isProj && !F.hits) item("Rename", () => { F.editing = e.path; render(); }); else if (F.hits) item("Rename", () => { F.hits = null; filt.value = ""; F.q = ""; F.editing = e.path; render(); });
    menu.classList.remove("hidden"); const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.min(x, innerWidth - w - 6) + "px"; menu.style.top = Math.min(y, innerHeight - h - 6) + "px";
  }
  function editBox(e) {
    const i = mk("input", "fx-edit"); i.value = e.name; i.spellcheck = false; let done = false;
    const stem = e.name.replace(/\.[^.]+$/, ""); setTimeout(() => { i.focus(); i.setSelectionRange(0, e.dir ? e.name.length : stem.length); }, 0);
    const finish = async (ok) => {
      if (done) return; done = true;
      if (ok && i.value.trim() !== e.name) {
        const r = await hq.files("rename", { path: e.path, name: i.value });
        if (!r.ok) { note(r.err, true); done = false; i.classList.add("bad"); i.title = r.err; i.focus(); return; }
        if (F.sel === e.path) F.sel = r.path; if (F.cur === e.path) F.cur = r.path;
        if (F.exp.has(e.path)) { F.exp.delete(e.path); F.exp.add(r.path); }
      }
      F.editing = ""; await load(e.path.replace(/\\[^\\]*$/, "")); render();
    };
    i.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === "Enter") { ev.preventDefault(); finish(true); } else if (ev.key === "Escape") { ev.preventDefault(); finish(false); } };
    i.onblur = () => finish(true); i.onclick = (ev) => ev.stopPropagation();
    return i;
  }
  async function newNote(dir) {
    const r = await hq.files("new", dir); if (!r.ok) return note(r.err, true);
    if (F.hits) { F.hits = null; filt.value = ""; F.q = ""; }
    F.exp.add(dir); await load(dir); F.sel = r.path; F.editing = r.path; render(); watch();
  }

  // ---------- live updates ----------
  hq.on("files-changed", async (d) => { if (F.editing || !d || !F.kids.has(d.dir)) return; await load(d.dir); render(); });
  bRef.onclick = async () => { for (const d of [...F.kids.keys()]) if (F.exp.has(d) || d === F.root) await load(d); render(); };
  bCol.onclick = () => { F.exp.clear(); render(); watch(); };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.classList.contains("hidden")) { e.preventDefault(); e.stopImmediatePropagation(); return hideMenu(); }
    if (e.key === "Escape" && !ov.classList.contains("hidden")) { e.preventDefault(); e.stopImmediatePropagation(); closeReader(); }
  }, true);

  // ---------- boot ----------
  (async () => {
    try {
      const s = await hq.files("state"); F.root = s.root; F.open = !!s.open; F.w = s.w || 280; applyLayout();
      await load(F.root); render(); watch();
      if (typeof S !== "undefined" && S.crew) setPlay(S.crew);
    } catch (e) { tree.append(mk("div", "fx-empty", "files unavailable")); }
  })();
  window.HQFiles = { toggle: setOpen, state: F, load, render, showNote };
})();
