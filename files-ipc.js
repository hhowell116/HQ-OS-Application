// File explorer backend (main process). Every path from the renderer is validated: it must resolve inside settings.projectsRoot,
// must not be a hidden/excluded name, and never touches the Obsidian vault. No delete, no move; rename and new-note only, never overwriting.
const fs = require("fs"), path = require("path");
const HIDE_NAMES = new Set(["node_modules", ".git", "dist", "out", "build", "release", ".cache", "data", "__pycache__"]);
const BAD_CHARS = /[\\/:*?"<>|\x00-\x1f]/, RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
const hiddenName = (n) => HIDE_NAMES.has(n.toLowerCase()) || /^\.env/i.test(n) || /personal|💀/i.test(n);
const sep = path.sep, lc = (s) => s.toLowerCase();

module.exports = function init({ ipcMain, shell, settings, save, send, root: rootFn }) {
  const root = () => path.resolve(rootFn ? rootFn() : settings.projectsRoot || path.join(require("os").homedir(), "Projects"));
  // Inside the root, not the vault, no hidden segment below the root.
  function safe(p) {
    if (typeof p !== "string" || !p || p.includes("\0")) return null;
    const r = root(), f = path.resolve(p), rl = lc(r), fl = lc(f);
    if (fl !== rl && !fl.startsWith(rl + sep)) return null;
    if (/myvault/i.test(f)) return null;
    const rel = f.slice(r.length).split(sep).filter(Boolean);
    if (rel.some(hiddenName)) return null;
    return f;
  }
  const projectOf = (f) => { const rel = f.slice(root().length).split(sep).filter(Boolean); return rel.length ? path.join(root(), rel[0]) : null; };
  const isProjectDir = (f) => path.dirname(f).toLowerCase() === root().toLowerCase();

  function list(dir) {
    const d = safe(dir || root()); if (!d) return { err: "outside projects folder" };
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return { err: "cannot read folder" }; }
    const out = [], atRoot = d.toLowerCase() === root().toLowerCase(), inProj = isProjectDir(d);
    for (const e of ents) {
      if (hiddenName(e.name)) continue;
      const full = path.join(d, e.name); let st = null;
      const isDir = e.isDirectory();
      if (atRoot && !isDir && !/\.md$/i.test(e.name)) continue;
      if (!isDir) { try { st = fs.statSync(full); } catch (x) { continue; } }
      out.push({ name: e.name, path: full, dir: isDir, size: st ? st.size : 0, mtime: st ? st.mtimeMs : 0, project: atRoot && isDir });
    }
    out.sort((a, b) => {
      if (inProj) { const an = a.dir && a.name === "Notes", bn = b.dir && b.name === "Notes"; if (an !== bn) return an ? -1 : 1; }
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
    return { path: d, entries: out };
  }

  // Async capped walk for the filter box: names only, same exclusions.
  async function search(q) {
    q = String(q || "").trim().toLowerCase(); if (q.length < 2) return [];
    const hits = [], stack = [root()]; let seen = 0;
    while (stack.length && hits.length < 120 && seen < 20000) {
      const d = stack.pop(); let ents; try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch (e) { continue; }
      for (const e of ents) {
        if (hiddenName(e.name) || /myvault/i.test(e.name)) continue; seen++;
        const full = path.join(d, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (lc(e.name).includes(q)) hits.push({ name: e.name, path: full, project: path.basename(projectOf(full) || ""), rel: full.slice(root().length + 1) });
        if (hits.length >= 120) break;
      }
      if (seen % 400 < 40) await new Promise((r) => setImmediate(r));
    }
    return hits;
  }

  const read = (p) => {
    const f = safe(p); if (!f) return { err: "outside projects folder" };
    try { const st = fs.statSync(f); if (!st.isFile() || st.size > 2e6) return { err: "file too large to preview" }; return { path: f, text: fs.readFileSync(f, "utf8"), mtime: st.mtimeMs, project: path.basename(projectOf(f) || "") }; } catch (e) { return { err: "cannot read file" }; }
  };

  // [[wiki link]] -> note path, searched only inside the same project (async capped walk).
  async function resolve({ from, link }) {
    const f = safe(from), proj = f && projectOf(f); if (!proj) return null;
    let name = String(link || "").split("|")[0].split("#")[0].trim().replace(/\.md$/i, ""); if (!name) return null;
    const want = lc(name.split("/").pop()), stack = [proj]; let seen = 0, best = null;
    while (stack.length && seen < 20000) {
      const d = stack.pop(); let ents; try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch (e) { continue; }
      for (const e of ents) {
        if (hiddenName(e.name)) continue; seen++;
        const full = path.join(d, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (lc(e.name) === want + ".md") { if (!best || full.length < best.length) best = full; }
      }
    }
    return best;
  }

  function validName(n) {
    n = String(n || "").trim();
    if (!n || n.length > 150) return "name must be 1-150 characters";
    if (BAD_CHARS.test(n)) return "name has characters Windows doesn't allow";
    if (/[. ]$/.test(n) || n.startsWith(".")) return "name can't start with a dot or end with a dot/space";
    if (RESERVED.test(n)) return "reserved name";
    if (hiddenName(n)) return "that name is reserved";
    return "";
  }
  function rename({ path: p, name }) {
    const f = safe(p); if (!f || f.toLowerCase() === root().toLowerCase() || isProjectDir(f)) return { ok: false, err: "can't rename this" };
    let n = String(name || "").trim(); const e = validName(n); if (e) return { ok: false, err: e };
    const st = fs.existsSync(f) && fs.statSync(f); if (!st) return { ok: false, err: "file is gone" };
    if (st.isFile() && !path.extname(n) && path.extname(f)) n += path.extname(f); // keep the extension if left off
    const to = path.join(path.dirname(f), n); if (!safe(to)) return { ok: false, err: "bad name" };
    if (to === f) return { ok: true, path: f };
    if (lc(to) !== lc(f) && fs.existsSync(to)) return { ok: false, err: "a file with that name already exists" };
    try { fs.renameSync(f, to); return { ok: true, path: to }; } catch (x) { return { ok: false, err: "rename failed: " + x.code }; }
  }
  function newNote(dir) {
    const d = safe(dir); if (!d || d.toLowerCase() === root().toLowerCase()) return { ok: false, err: "pick a project folder" };
    try { if (!fs.statSync(d).isDirectory()) return { ok: false, err: "not a folder" }; } catch (x) { return { ok: false, err: "folder is gone" }; }
    let n = "Untitled.md", i = 2; while (fs.existsSync(path.join(d, n))) n = "Untitled " + i++ + ".md";
    const f = path.join(d, n);
    try { fs.writeFileSync(f, "", { flag: "wx" }); return { ok: true, path: f }; } catch (x) { return { ok: false, err: "could not create note" }; }
  }

  // fs.watch only on folders the tree has expanded; debounced per folder.
  const watchers = new Map(), timers = new Map();
  function watch(dirs) {
    const want = new Set((Array.isArray(dirs) ? dirs : []).slice(0, 60).map(safe).filter(Boolean));
    for (const [d, w] of watchers) if (!want.has(d)) { try { w.close(); } catch (e) {} watchers.delete(d); }
    for (const d of want) {
      if (watchers.has(d)) continue;
      try { const w = fs.watch(d, () => { clearTimeout(timers.get(d)); timers.set(d, setTimeout(() => send("files-changed", { dir: d }), 250)); }); w.on("error", () => { watchers.delete(d); }); watchers.set(d, w); } catch (e) {}
    }
    return true;
  }

  ipcMain.handle("files-list", (_, d) => list(d));
  ipcMain.handle("files-search", (_, q) => search(q));
  ipcMain.handle("files-read", (_, p) => read(p));
  ipcMain.handle("files-resolve", (_, o) => resolve(o || {}));
  ipcMain.handle("files-open", (_, p) => { const f = safe(p); if (!f || !fs.existsSync(f)) return false; shell.openPath(f); return true; });
  ipcMain.handle("files-reveal", (_, p) => { const f = safe(p); if (!f || !fs.existsSync(f)) return false; shell.showItemInFolder(f); return true; });
  ipcMain.handle("files-rename", (_, o) => rename(o || {}));
  ipcMain.handle("files-new", (_, d) => newNote(d));
  ipcMain.handle("files-watch", (_, dirs) => watch(dirs));
  ipcMain.handle("files-pref", (_, o) => { if (o && typeof o.open === "boolean") settings.filesOpen = o.open; if (o && Number.isFinite(o.w)) settings.filesW = Math.max(200, Math.min(560, Math.round(o.w))); save(); return { open: !!settings.filesOpen, w: settings.filesW || 280 }; });
  ipcMain.handle("files-state", () => ({ open: !!settings.filesOpen, w: settings.filesW || 280, root: root() }));
  return { list, rename, newNote, safe, validName, search, resolve };
};
