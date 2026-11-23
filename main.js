// HQ OS: Electron main process. Owns the file system, Claude processes and polling; windows only render.
let codePending = null; // a main-process file changed since launch (survives renderer reloads)
const { app, BrowserWindow, ipcMain, utilityProcess, shell, globalShortcut, session, desktopCapturer, protocol, net } = require("electron");
const { pathToFileURL } = require("url");
const path = require("path"), fs = require("fs");
const D = require("./data");
const { Chats } = require("./chat");
const SYS = require("./system");

const APP_ID = "HaydenHowell.HQOS";
app.setName("HQ OS");
app.setAppUserModelId(APP_ID); // own taskbar identity + icon instead of Electron's
if (!app.requestSingleInstanceLock()) app.quit(); // second launch just focuses the open window
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

const USER = app.getPath("userData");
const SETTINGS_FILE = path.join(USER, "settings.json");
const LEGACY = path.join(__dirname, "..", "data.json"); // the Obsidian plugin's settings, imported once
const ICON = path.join(__dirname, "renderer", "icon.ico");
const ELECTRON = process.execPath;
let settings = D.loadSettings(SETTINGS_FILE, LEGACY);
let win = null, chats = null, now = null, tfProc = null, FX = null;
const cache = { projects: [], agents: [], boards: [], usage: null, usageErr: "", usageAt: 0, music: null, vit: [] };

// Read-only hqreview://f/<encoded path>: serves only media inside a project's Review folder.
protocol.registerSchemesAsPrivileged([{ scheme: "hqchat", privileges: { standard: true, secure: true, supportFetchAPI: true } }, { scheme: "hqreview", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const inReview = (f) => cache.projects.some((p) => p.review && D.inside(p.review, f));

const wins = () => [win].filter((w) => w && !w.isDestroyed());
const send = (ch, data) => wins().forEach((w) => w.webContents.send(ch, data));
const projById = (id) => cache.projects.find((p) => p.id === id);

function refreshProjects() { cache.projects = D.listProjects(settings); return cache.projects; }

async function projectSummary(p) {
  const [todo, git, review] = await Promise.all([D.readTodo(p, settings.person), D.fetchCommits(p.repo), D.reviewCount(p)]);
  return { id: p.id, name: p.name, accent: p.accent, pinned: p.pinned, folder: p.folder,
    next: todo.next.filter((x) => !x.done).length, wait: todo.wait.filter((x) => !x.done).length,
    live: todo.live, git: git.days, lastCommit: git.last, review, hasTodo: !todo.missing };
}
async function projectDetail(id) {
  const p = projById(id); if (!p) return null;
  const [todo, board, git, review] = await Promise.all([D.readTodo(p, settings.person), D.readBoard(p), D.fetchCommits(p.repo), D.reviewCount(p)]);
  return { id: p.id, name: p.name, folder: p.folder, todoFile: p.todo, todo, board, git, review };
}

// ---------- polling ----------
// Usage: keep the last good reading on disk (survives restarts) and back off 10 min when rate-limited.
const USAGE_FILE = path.join(USER, "usage-cache.json");
try { const u = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8")); cache.usage = u.usage; cache.usageAt = u.at || 0; } catch (e) {}
async function pollUsage(force) {
  const minGap = cache.usageBackoff && Date.now() < cache.usageBackoff ? Infinity : force ? 60000 : 180000;
  if (Date.now() - cache.usageAt < minGap) { send("usage", { usage: cache.usage, err: cache.usageErr }); return; }
  cache.usageAt = Date.now();
  try { cache.usage = await D.fetchUsage(); cache.usageErr = ""; cache.usageBackoff = 0; fs.writeFile(USAGE_FILE, JSON.stringify({ usage: cache.usage, at: cache.usageAt }), () => {}); }
  catch (e) { cache.usageErr = e.message; if (/429/.test(e.message)) cache.usageBackoff = Date.now() + 600000; }
  send("usage", { usage: cache.usage, err: cache.usageErr });
}
// Board rows only carry a clock time ("2:29 AM"): minutes since then, assuming today (or yesterday if in the future).
function boardAge(s) { const m = /(\d+):(\d+)\s*([AP]M)/i.exec(s || ""); if (!m) return Infinity; let h = +m[1] % 12; if (/p/i.test(m[3])) h += 12; const t = new Date(); t.setHours(h, +m[2], 0, 0); let dm = (Date.now() - t) / 60000; if (dm < 0) dm += 1440; return dm; }
// One combined "crew" list for the tracker windows: subagents, busy console chats, and Agent Activity board rows.
function crew() {
  const nowT = Date.now(), out = [];
  for (const a of cache.agents) if (a.status === "running" || (a.status === "stalled" && nowT - a.mtime < 3600e3)) out.push({ id: a.id, kind: "agent", name: a.title, role: a.type, model: a.model, proj: a.proj, status: a.status, start: a.start, step: a.step, steps: a.steps, files: a.files });
  for (const c of chats ? chats.active() : []) out.push({ id: c.id, kind: "chat", name: c.title, role: "HQ console", model: c.model, proj: c.proj, status: "running", start: c.start, step: c.step, steps: c.say ? [{ kind: "say", text: c.say }] : [], files: c.files });
  for (const b of cache.boards) if (b.working && boardAge(b.updated) <= 90) out.push({ id: "board:" + b.proj + ":" + b.name, kind: "board", name: b.name, role: b.proj + " team", proj: b.proj, status: "running", step: b.task, steps: [{ kind: "say", text: b.task }], files: [], updated: b.updated });
  return out;
}
async function pollAgents() {
  try { cache.agents = await D.scanAgents(settings.excludeRe); } catch (e) {}
  send("agents", cache.agents); send("crew", crew());
}
async function pollBoards() { try { cache.boards = await D.allBoards(cache.projects); } catch (e) {} }
function pollVitals() { const v = SYS.vitals(); cache.vit.push(v); if (cache.vit.length > 60) cache.vit.shift(); send("vitals", { now: v, hist: cache.vit.map((x) => [x.cpu, x.ram]) }); }

// Watch only the To-Do files (tiny), never project trees.
let watched = new Map();
function watchTodos() {
  for (const [, w] of watched) try { w.close(); } catch (e) {}
  watched = new Map();
  for (const p of cache.projects) if (p.todo && fs.existsSync(p.todo)) {
    try { let t; const w = fs.watch(p.todo, () => { clearTimeout(t); t = setTimeout(() => send("todo-changed", p.id), 300); }); watched.set(p.id, w); } catch (e) {}
  }
}

// ---------- windows ----------
const webPrefs = () => ({ preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false });
function harden(w) {
  w.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  // Pinning a window to the taskbar uses these: our icon and a relaunch command, not Electron's.
  try { w.setAppDetails({ appId: APP_ID, appIconPath: ICON, appIconIndex: 0, relaunchCommand: `"${ELECTRON}" "${__dirname}"`, relaunchDisplayName: "HQ OS" }); } catch (e) {}
}
function createWindow() {
  win = new BrowserWindow({ width: 1600, height: 960, minWidth: 1100, minHeight: 700, frame: false, backgroundColor: "#03080c", show: false, title: "HQ OS", icon: ICON, webPreferences: webPrefs() });
  harden(win);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.once("ready-to-show", () => { win.maximize(); win.show(); });
  win.on("maximize", () => win.webContents.send("win-state", "max")); win.on("unmaximize", () => win.webContents.send("win-state", "normal"));
  win.on("closed", () => { win = null; });
}
// Desktop / Start-menu shortcuts carry our AppUserModelID so a pin from them keeps the HQ OS icon.
function ensureShortcuts() {
  const targets = [path.join(app.getPath("desktop"), "HQ OS.lnk"), path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "HQ OS.lnk")];
  for (const lnk of targets) {
    try { shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? "replace" : "create", { target: ELECTRON, args: `"${__dirname}"`, cwd: __dirname, icon: ICON, iconIndex: 0, appUserModelId: APP_ID, description: "HQ OS command center" }); } catch (e) {}
  }
}

app.whenReady().then(() => {
  refreshProjects();
  protocol.handle("hqreview", (req) => {
    let f = ""; try { f = path.resolve(decodeURIComponent(new URL(req.url).pathname.slice(1))); } catch (e) {}
    if (!f || !/\.(png|jpe?g|gif|webp|mp4|webm)$/i.test(f) || !inReview(f)) return new Response("denied", { status: 403 });
    return net.fetch(pathToFileURL(f).toString(), { headers: req.headers });
  });
  // Read-only hqchat://f/<encoded path>: serves only images inside userData/chat-images.
  protocol.handle("hqchat", (req) => {
    let f = ""; try { f = path.resolve(decodeURIComponent(new URL(req.url).pathname.slice(1))); } catch (e) {}
    const root = path.resolve(USER, "chat-images") + path.sep;
    if (!f || !/\.(png|jpe?g|gif|webp)$/i.test(f) || !f.toLowerCase().startsWith(root.toLowerCase())) return new Response("denied", { status: 403 });
    return net.fetch(pathToFileURL(f).toString());
  });
  chats = new Chats(path.join(USER, "chats"), () => settings, (ev) => { send("chat", ev); if (ev.what !== "stream") send("crew", crew()); });
  now = new SYS.NowPlaying((m) => { cache.music = m; send("music", m); });

  // Desktop audio (loopback) for the visualizer: getDisplayMedia gets the screen's audio, the 1-pixel video is dropped.
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((s) => cb(s[0] ? { video: s[0], audio: "loopback" } : {})).catch(() => cb({}));
  });

  { const own = (wc) => !!wc && !!win && !win.isDestroyed() && wc === win.webContents;
    // Only the app's own window gets permissions: mic (voice input) and display-capture/loopback (visualizer) both need "media".
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(own(wc)));
    session.defaultSession.setPermissionCheckHandler((wc) => own(wc)); }
  const pub = () => ({ person: settings.person, voice: !!settings.voice, voiceName: settings.voiceName || "af_heart", speed: settings.speed || 1.1, last: settings.last, projectsRoot: settings.projectsRoot, theme: settings.theme || "cyan", accent: settings.accent || "", audio: settings.audio !== false, autoSend: !!settings.autoSend, music: settings.music !== false, archived: settings.archived || [], startView: settings.startView || "home", nebulaMode: settings.nebulaMode || "" });
  FX = require("./files-ipc.js")({ ipcMain, shell, settings, send, save: () => D.saveSettings(SETTINGS_FILE, settings) }); // file explorer (files-ipc.js)
  ipcMain.handle("init", async () => ({ settings: pub(), projects: await Promise.all(cache.projects.map(projectSummary)) }));
  ipcMain.handle("settings", () => pub());
  ipcMain.handle("projects", async () => { refreshProjects(); watchTodos(); return Promise.all(cache.projects.map(projectSummary)); });
  ipcMain.handle("needs", async () => { const out = []; for (const p of cache.projects) { if ((settings.archived || []).includes(p.id)) continue; const t = await D.readTodo(p, settings.person); const items = t.wait.filter((x) => !x.done).map((x) => ({ line: x.line, text: x.text })); if (items.length) out.push({ id: p.id, name: p.name, items }); } return out; });
  ipcMain.handle("project", (_, id) => { if (id && settings.last !== id) { settings.last = id; D.saveSettings(SETTINGS_FILE, settings); } return projectDetail(id); });
  ipcMain.handle("todo-toggle", async (_, { id, line, raw, on }) => { const p = projById(id); if (!p || !p.todo) throw new Error("No To-Do note"); await D.toggleTodo(p.todo, line, raw, on); return projectDetail(id); });
  ipcMain.handle("todo-add", async (_, { id, text }) => { const p = projById(id); if (!p) throw new Error("Unknown project");
    // no To-Do note yet: create one in the project's Notes folder so the sidebar list just works
    if (!p.todo) { const dir = p.notes || path.join(p.folder, "Notes"); fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, p.name + " To-Do.md"); if (!fs.existsSync(f)) fs.writeFileSync(f, "# " + p.name + " To-Do\n\n## Now\n\n## Next\n\n## Waiting on Hayden\n\n## Done\n"); p.todo = f; } await D.addTodo(p.todo, p, String(text).trim()); return projectDetail(id); });
  // New project: <projectsRoot>/<Name>/Notes with a To-Do note and an empty Claude/Index.md (listProjects discovers it by its Notes folder).
  ipcMain.handle("project-create", async (_, raw) => {
    const name = String(raw == null ? "" : raw).trim();
    if (!name) return { ok: false, err: "Enter a name" };
    if (name.length > 60) return { ok: false, err: "Name too long (60 max)" };
    if (/[\/:*?"<>|\x00-\x1f]/.test(name) || name.includes("..") || /[. ]$/.test(name) || name.startsWith(".")) return { ok: false, err: "Name has characters that can't be in a folder name" };
    if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i.test(name)) return { ok: false, err: "That is a reserved Windows name" };
    const root = settings.projectsRoot; if (!root || !fs.existsSync(root)) return { ok: false, err: "Projects folder not found" };
    const folder = path.join(root, name);
    if (path.dirname(path.resolve(folder)).toLowerCase() !== path.resolve(root).toLowerCase()) return { ok: false, err: "Invalid name" };
    if (fs.existsSync(folder) || fs.readdirSync(root).some((n) => n.toLowerCase() === name.toLowerCase())) return { ok: false, err: "A project with that name already exists" };
    try {
      fs.mkdirSync(path.join(folder, "Notes", "Claude"), { recursive: true });
      fs.writeFileSync(path.join(folder, "Notes", name + " To-Do.md"), "# " + name + " To-Do\n\n## Now\n\n## Next\n\n## Waiting on Hayden\n\n## Done\n");
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
      fs.writeFileSync(path.join(folder, "Notes", "Claude", "Index.md"), "# " + name + ": Claude's Notes\n\nKnowledge base for the " + name + " team. Read this first; add a line per note.\n\nTeam: " + slug + "-team-builder (ask it to \"build the " + name + " team\" to create the specialists)\n");
      // Starter team: a team-builder agent that writes this floor's specialists on first use (rules: Projects/CLAUDE.md "Project teams").
      try { const tpl = fs.readFileSync(path.join(__dirname, "templates", "team-builder.md"), "utf8"); fs.mkdirSync(path.join(folder, ".claude", "agents"), { recursive: true }); fs.writeFileSync(path.join(folder, ".claude", "agents", slug + "-team-builder.md"), tpl.split("{{PROJECT}}").join(name).split("{{SLUG}}").join(slug).split("{{FOLDER}}").join(folder)); } catch (e) {}
    } catch (e) { return { ok: false, err: "Could not create: " + e.message }; }
    refreshProjects(); watchTodos();
    const p = cache.projects.find((x) => path.basename(x.folder).toLowerCase() === name.toLowerCase());
    return { ok: true, id: p ? p.id : "", name };
  });
  // Rename project: folder, To-Do note, settings entries, saved chats and archived list follow. Agent files keep their old slug prefix.
  ipcMain.handle("project-rename", async (_, arg) => {
    const id = arg && arg.id, raw = arg && arg.name;
    const name = String(raw == null ? "" : raw).trim();
    const old = cache.projects.find((x) => x.id === id);
    if (!old) return { ok: false, err: "Unknown project" };
    if (!name) return { ok: false, err: "Enter a name" };
    if (name.length > 60) return { ok: false, err: "Name too long (60 max)" };
    if (/[\/\\:*?"<>|\x00-\x1f]/.test(name) || name.includes("..") || /[. ]$/.test(name) || name.startsWith(".")) return { ok: false, err: "Name has characters that can't be in a folder name" };
    if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i.test(name)) return { ok: false, err: "That is a reserved Windows name" };
    const root = settings.projectsRoot; if (!root || !fs.existsSync(root)) return { ok: false, err: "Projects folder not found" };
    const oldFolder = path.resolve(old.folder), oldName = path.basename(oldFolder), newFolder = path.join(root, name);
    if (path.dirname(oldFolder).toLowerCase() !== path.resolve(root).toLowerCase()) return { ok: false, err: "Only projects directly under the Projects folder can be renamed" };
    if (name === oldName) return { ok: false, err: "That is already the name" };
    const caseOnly = name.toLowerCase() === oldName.toLowerCase();
    if (!caseOnly && (fs.existsSync(newFolder) || fs.readdirSync(root).some((n) => n.toLowerCase() === name.toLowerCase()))) return { ok: false, err: "A project with that name already exists" };
    if (chats && chats.busyIn(oldFolder).length) return { ok: false, err: "A chat in this project is still working. Wait for it to finish, then rename." };
    for (const [, w] of watched) try { w.close(); } catch (e) {} watched = new Map(); // release file handles before renaming
    try { if (FX && FX.unwatchUnder) FX.unwatchUnder(oldFolder); } catch (e) {}
    try { if (chats && chats.stopIdleIn) { const n = await chats.stopIdleIn(oldFolder); if (n) await new Promise((r) => setTimeout(r, 400)); } } catch (e) {}
    const busyMsg = "Something has files open in this project (an editor, terminal or git). Close it and try again.";
    try {
      if (caseOnly) { const tmp = oldFolder + ".hqrename-" + Date.now(); fs.renameSync(oldFolder, tmp); try { fs.renameSync(tmp, newFolder); } catch (e) { try { fs.renameSync(tmp, oldFolder); } catch (e2) {} throw e; } }
      else fs.renameSync(oldFolder, newFolder);
    } catch (e) { refreshProjects(); watchTodos(); return { ok: false, err: /EBUSY|EPERM|EACCES/.test(e.code || e.message) ? busyMsg : "Could not rename: " + e.message }; }
    const slug = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
    const newId = old.id === slug(oldName) || old.id === slug(old.name) ? slug(name) : old.id;
    const warn = [];
    try { // To-Do note + heading
      const nd = path.join(newFolder, "Notes"), oldTodo = path.join(nd, oldName + " To-Do.md"), newTodo = path.join(nd, name + " To-Do.md");
      const src = fs.existsSync(oldTodo) ? oldTodo : "";
      if (src) { let t = fs.readFileSync(src, "utf8"); t = t.replace(new RegExp("^# " + oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " To-Do", "im"), "# " + name + " To-Do"); fs.writeFileSync(newTodo + ".tmp", t); if (src.toLowerCase() !== newTodo.toLowerCase() || src !== newTodo) { fs.renameSync(src, src + ".old"); } fs.renameSync(newTodo + ".tmp", newTodo); fs.unlinkSync(src + ".old"); }
    } catch (e) { warn.push("To-Do note: " + e.message); }
    const lc = (s) => String(s).toLowerCase(), oldTodoName = oldName + " To-Do.md";
    const fix = (v) => { if (!v) return v; const s = String(v);
      if (path.isAbsolute(s)) { if (lc(s) === lc(oldFolder) || lc(s).startsWith(lc(oldFolder) + path.sep)) { let r = newFolder + s.slice(oldFolder.length); if (lc(path.basename(r)) === lc(oldTodoName)) r = path.join(path.dirname(r), name + " To-Do.md"); return r; } return s; }
      const parts = s.split(/[\\/]/); if (lc(parts[0]) === lc(oldName)) parts[0] = name; if (lc(parts[parts.length - 1]) === lc(oldTodoName)) parts[parts.length - 1] = name + " To-Do.md"; return parts.join("/"); };
    try {
      for (const p of settings.projects || []) if (p.id === old.id || lc(p.name) === lc(old.name) || lc(path.basename(mapAny(p.folder || p.name))) === lc(oldName)) {
        p.name = name; p.id = newId; for (const k of ["folder", "todo", "notes", "agents", "review", "daily", "metricsCwd"]) if (p[k]) p[k] = fix(p[k]);
        if (!p.folder) p.folder = name;
      }
      if (settings.last === old.id) settings.last = newId;
      if (Array.isArray(settings.archived)) settings.archived = settings.archived.map((x) => (x === old.id ? newId : x));
      D.saveSettings(SETTINGS_FILE, settings);
    } catch (e) { warn.push("settings: " + e.message); }
    try { if (chats) chats.moveProject(oldFolder, newFolder, old.id, newId, name); } catch (e) { warn.push("chats: " + e.message); }
    refreshProjects(); watchTodos();
    const p = cache.projects.find((x) => path.basename(x.folder).toLowerCase() === name.toLowerCase());
    send("settings", pub());
    return { ok: true, id: p ? p.id : newId, name, note: "Agent files in .claude/agents keep their old name prefix.", warn };
    function mapAny(v) { return path.isAbsolute(String(v)) ? String(v) : path.join(root, String(v)); }
  });
  ipcMain.handle("review-list", async (_, id) => { const p = projById(id); if (!p) return []; return (await D.reviewList(p)).map((i) => ({ key: i.key, title: i.title, status: i.status, created: i.created, note: i.note, video: i.video, media: i.files.map((f) => "hqreview://f/" + encodeURIComponent(f)) })); });
  ipcMain.handle("review-set", async (_, { id, key, status, comment }) => { const p = projById(id); if (!p) throw new Error("Unknown project"); await D.reviewSet(p, String(key), String(status), comment); return true; });
  ipcMain.handle("busy", () => !!(chats && chats.active().length));
  // Kokoro TTS runs in a utility process so the UI never stalls; clips stream back as "tts" events.
  let ttsProc = null, ttsId = 0;
  const ttsLog = (line) => { try { fs.appendFileSync(path.join(USER, "tts.log"), new Date().toISOString() + " " + String(line).slice(0, 600) + "\n"); } catch (e) {} };
  const ttsStart = () => {
    if (ttsProc) return ttsProc;
    ttsLog("spawn worker " + path.join(__dirname, "tts-worker.js") + " cache=" + path.join(USER, "kokoro-cache"));
    ttsProc = utilityProcess.fork(path.join(__dirname, "tts-worker.js"), [], { serviceName: "hq-tts", stdio: "pipe" });
    const pipe = (st, tag) => st && st.on("data", (d) => ttsLog(tag + " " + String(d).trim()));
    pipe(ttsProc.stdout, "out"); pipe(ttsProc.stderr, "err");
    ttsProc.on("spawn", () => ttsLog("worker spawned pid=" + ttsProc.pid));
    ttsProc.on("message", (m) => {
      if (m.type !== "progress") ttsLog("worker " + m.type + (m.id ? " id=" + m.id : "") + (m.error ? " ERROR " + m.error : "") + (m.wav ? " bytes=" + m.wav.length : ""));
      if (m.wav) m.wav = new Uint8Array(m.wav); send("tts", m);
    });
    ttsProc.on("exit", (code) => { ttsLog("worker exit code=" + code); ttsProc = null; send("tts", { type: "error", id: ttsId, error: "voice engine exited (code " + code + ")" }); });
    ttsProc.postMessage({ type: "init", cache: path.join(USER, "kokoro-cache") });
    return ttsProc;
  };
  ipcMain.handle("tts-speak", (_, { text, voice, speed }) => { const id = ++ttsId; ttsLog("speak id=" + id + " voice=" + voice + " speed=" + speed + " chars=" + String(text || "").length); try { ttsStart().postMessage({ type: "speak", id, text: String(text || "").slice(0, 2000), voice, speed, cache: path.join(USER, "kokoro-cache") }); } catch (e) { ttsLog("speak failed: " + e.message); send("tts", { type: "error", id, error: e.message }); } return id; });
  ipcMain.handle("tts-stop", () => { ++ttsId; if (ttsProc) ttsProc.postMessage({ type: "stop" }); return true; });
  // Whisper speech-to-text (local) in its own utility process; lazy-started on first use.
  let sttProc = null, sttId = 0; const sttWait = new Map();
  const sttLog = (line) => { try { fs.appendFileSync(path.join(USER, "stt.log"), new Date().toISOString() + " " + String(line).slice(0, 600) + "\n"); } catch (e) {} };
  const sttStart = () => {
    if (sttProc) return sttProc;
    const cacheDir = path.join(USER, "whisper-cache");
    sttLog("spawn worker cache=" + cacheDir);
    sttProc = utilityProcess.fork(path.join(__dirname, "stt-worker.js"), [], { serviceName: "hq-stt", stdio: "pipe" });
    const pipe = (st, tag) => st && st.on("data", (d) => sttLog(tag + " " + String(d).trim()));
    pipe(sttProc.stdout, "out"); pipe(sttProc.stderr, "err");
    sttProc.on("message", (m) => {
      if (m.type === "progress") return send("stt", m);
      sttLog("worker " + m.type + (m.id ? " id=" + m.id : "") + (m.error ? " ERROR " + m.error : "") + (m.text ? " chars=" + m.text.length : ""));
      const w = sttWait.get(m.id); if (w) { sttWait.delete(m.id); m.type === "text" ? w.res(m.text) : w.rej(new Error(m.error)); }
    });
    sttProc.on("exit", (code) => { sttLog("worker exit code=" + code); sttProc = null; for (const [, w] of sttWait) w.rej(new Error("speech engine exited (code " + code + ")")); sttWait.clear(); });
    sttProc.postMessage({ type: "init", cache: cacheDir });
    return sttProc;
  };
  ipcMain.handle("stt-transcribe", (_, buf) => new Promise((res, rej) => {
    const id = ++sttId; let audio;
    try { audio = buf instanceof Float32Array ? buf : new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); } catch (e) { return rej(new Error("bad audio")); }
    if (audio.length < 1600) return res("");
    if (audio.length > 16000 * 120) audio = audio.slice(0, 16000 * 120);
    sttWait.set(id, { res, rej }); sttLog("transcribe id=" + id + " samples=" + audio.length);
    try { sttStart().postMessage({ type: "transcribe", id, audio, cache: path.join(USER, "whisper-cache") }); } catch (e) { sttWait.delete(id); rej(e); }
  }));
  app.on("before-quit", () => { if (sttProc) sttProc.kill(); });
  ipcMain.handle("tts-log", (_, line) => { ttsLog("ui " + line); return true; });
  app.on("before-quit", () => { if (ttsProc) ttsProc.kill(); });
  ipcMain.handle("code-pending", () => codePending);
  ipcMain.handle("restart", () => { app.relaunch(); app.exit(0); });
  if (!app.isPackaged) {
    // Dev watchers. Changes apply only once they are FINISHED, i.e. committed (Hayden 2026-11-22: no reloads mid-change).
    // File edits just mark what changed; a new commit in app/.git then reloads the window (renderer) or shows the restart chip (main process).
    let rendDirty = false, mainDirty = null, tc = null;
    try { fs.watch(path.join(__dirname, "renderer"), { recursive: true }, (_, f) => { if (f && !/(~|.swp|.tmp|.part)$|^.#|^4913$/i.test(f)) rendDirty = true; }); } catch (e) {}
    try { fs.watch(__dirname, (_, f) => { if (f && /\.js$/i.test(f)) mainDirty = f; }); } catch (e) {}
    const applyFinished = () => {
      if (mainDirty) { codePending = mainDirty; send("code-changed", mainDirty); mainDirty = null; }
      if (rendDirty) { rendDirty = false; if (win && !win.isDestroyed()) win.webContents.reload(); }
    };
    // HEAD's reflog grows on every commit; wait a moment so a commit + push sequence settles
    try { fs.watch(path.join(__dirname, ".git", "logs"), { recursive: true }, () => { clearTimeout(tc); tc = setTimeout(applyFinished, 1500); }); } catch (e) {}
  }
  ipcMain.handle("agents", async () => { await pollAgents(); return cache.agents; });
  ipcMain.handle("crew", () => crew());
  // Tower: specialist teams per project (<folder>/.claude/agents/*.md) plus the shared core agents (Agent Team/Agents).
  ipcMain.handle("team-list", () => {
    const read = (dir) => { try { return fs.readdirSync(dir).filter((n) => /\.md$/i.test(n)).slice(0, 24).map((n) => { const t = fs.readFileSync(path.join(dir, n), "utf8").slice(0, 1500), g = (k) => { const x = new RegExp("^" + k + ":\s*(.+)$", "mi").exec(t); return x ? x[1].trim().replace(/^["']|["']$/g, "") : ""; }; return { name: g("name") || n.replace(/\.md$/i, ""), desc: g("description").slice(0, 160), model: g("model") }; }); } catch (e) { return []; } };
    const projects = {}; for (const p of cache.projects) projects[p.id] = read(path.join(p.folder, ".claude", "agents"));
    return { projects, core: read(path.join(settings.projectsRoot, "Agent Team", "Agents")) };
  });
  ipcMain.handle("usage", async (_, force) => { await pollUsage(!!force); return { usage: cache.usage, err: cache.usageErr }; });
  ipcMain.handle("music", () => { now.start(); return cache.music; });
  ipcMain.handle("music-ctl", (_, cmd) => now.control(cmd));
  ipcMain.handle("set", (_, kv) => { for (const k of ["voice", "voiceName", "speed", "person", "theme", "accent", "audio", "music", "autoSend", "startView", "nebulaMode"]) if (k in kv) settings[k] = kv[k]; if (Array.isArray(kv.archived)) settings.archived = kv.archived.filter((x) => typeof x === "string"); D.saveSettings(SETTINGS_FILE, settings); send("settings", pub()); if ("music" in kv) kv.music ? now.start() : (now.stop(), send("music", null)); return true; });
  ipcMain.handle("open-path", (_, p) => { const target = p === "settings" ? SETTINGS_FILE : p; if (target && fs.existsSync(target)) shell.openPath(target); });
  // Rules viewer: read-only, exactly one file (CLAUDE.md in the Projects root). The renderer never supplies a path.
  const rulesFile = () => path.join(settings.projectsRoot || path.join(require("os").homedir(), "Projects"), "CLAUDE.md");
  let graphCache = null; // Nebula tab: scan on demand (graph-scan force=true) or when stale
  ipcMain.handle("graph-scan", (_, force) => { if (!graphCache || force || Date.now() - graphCache.at > 120000) { try { graphCache = require("./graph.js").scan(settings, refreshProjects()); } catch (e) { return { nodes: [], links: [], projects: [], at: Date.now(), err: String(e.message || e) }; } } return graphCache; });
  ipcMain.handle("rules-read", () => { const f = rulesFile(); try { return { path: f, text: fs.readFileSync(f, "utf8"), mtime: fs.statSync(f).mtimeMs }; } catch (e) { return { path: f, text: "", mtime: 0, err: "Could not read " + path.basename(f) }; } });
  ipcMain.handle("rules-open", () => { const f = rulesFile(); if (fs.existsSync(f)) shell.openPath(f); });
  { let t, w; try { w = fs.watch(path.dirname(rulesFile()), (ev, name) => { if (name && name.toLowerCase() !== "claude.md") return; clearTimeout(t); t = setTimeout(() => send("rules-changed", true), 300); }); w.on("error", () => {}); } catch (e) {} }
  ipcMain.handle("chat-list", (_, proj) => chats.list(proj));
  ipcMain.handle("chat-get", (_, id) => chats.get(id));
  ipcMain.handle("chat-new", (_, { proj, model }) => chats.create(proj ? projById(proj) : null, model));
  ipcMain.handle("chat-rename", (_, { id, title }) => chats.rename(id, title));
  ipcMain.handle("chat-send", (_, { id, text, images }) => chats.send(id, text, images));
  ipcMain.handle("chat-stop", (_, id) => chats.stop(id));
  ipcMain.handle("chat-model", (_, { id, model }) => chats.setModel(id, model));
  ipcMain.handle("chat-delete", (_, id) => chats.remove(id));
  ipcMain.handle("chat-handoff", (_, id) => chats.handoff(id));
  ipcMain.handle("chat-compact", (_, id) => chats.compact(id));
  // ---------- Trading Floor: runs Stonks/engine/run.js as a child process and relays its JSON lines ----------
  // Project was renamed Stonks -> Stocks (2026-11-23); resolve at call time so both names work during the switch.
  const stkDir = () => { if (process.env.STONKS_DIR) return process.env.STONKS_DIR; const root = path.dirname(path.dirname(__dirname)); for (const n of ["Stocks", "Stonks"]) { const p = path.join(root, n); if (fs.existsSync(p)) return p; } return path.join(root, "Stocks"); };
  const tfRead = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(stkDir(), "data", f), "utf8")); } catch (e) { return d; } };
  function tfStats() { try { return require(path.join(stkDir(), "engine", "steady.js")).book(); } catch (e) { return null; } }
  function tfHealth() { try { return require(path.join(stkDir(), "engine", "safety.js")).health(); } catch (e) { return { ok: false, why: ["engine unreadable: " + String(e.message).slice(0, 80)] }; } }
  function tfStart(mode) {
    if (tfProc) return false;
    const script = path.join(stkDir(), "engine", "run.js"); if (!fs.existsSync(script)) throw new Error("Stonks engine not found at " + script);
    const p = tfProc = require("child_process").spawn(process.execPath, [script, mode], { cwd: path.dirname(script), windowsHide: true, env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: "1" }) });
    let buf = ""; tfProc.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { send("tf", JSON.parse(l)); } catch (e) {} } });
    tfProc.stderr.on("data", () => {});
    tfProc.on("close", () => { if (tfProc === p) tfProc = null; send("tf", { t: "done", stats: tfStats(), state: tfRead("state.json", null) }); });
    tfProc.on("error", () => { tfProc = null; });
    return true;
  }
  ipcMain.handle("tf-state", () => ({ running: !!tfProc, health: tfHealth(), state: tfRead("state.json", null), stats: tfStats(), journal: tfRead("signals.json", {}), equity: tfRead("equity.json", []) }));
  ipcMain.handle("tf-go", () => tfStart("go"));
  ipcMain.handle("tf-score", () => tfStart("score"));
  ipcMain.handle("tf-resume", () => tfStart("resume"));
  ipcMain.handle("tf-kill", () => { if (tfProc) { try { tfProc.kill(); } catch (e) {} tfProc = null; } return tfStart("kill"); });
  ipcMain.handle("tf-stop", () => { if (tfProc) { try { tfProc.kill(); } catch (e) {} } return true; });
  // roundtable feed (data/events.jsonl, rewritten by every GO), usage meter (data/usage.json written by Stonks' statusline script), knowledge ingest
  ipcMain.handle("tf-events", () => { try { return fs.readFileSync(path.join(stkDir(), "data", "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).slice(-400); } catch (e) { return []; } });
  ipcMain.handle("tf-usage", () => tfRead("usage.json", null));
  ipcMain.handle("kn-list", () => { try { return JSON.parse(require("child_process").execFileSync(process.execPath, [path.join(stkDir(), "engine", "ingest.js"), "list"], { cwd: path.join(stkDir(), "engine"), windowsHide: true, env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: "1" }), encoding: "utf8", timeout: 15000 })); } catch (e) { return { sources: [], backlog: [] }; } });
  ipcMain.handle("kn-ingest", (_, o) => new Promise((res) => {
    const p = require("child_process").spawn(process.execPath, [path.join(stkDir(), "engine", "ingest.js")], { cwd: path.join(stkDir(), "engine"), windowsHide: true, env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: "1" }) });
    let b = ""; p.stdout.on("data", (d) => (b += d)); p.stderr.on("data", () => {});
    p.on("error", (e) => res({ ok: false, error: e.message }));
    p.on("close", () => { try { res(JSON.parse(b.trim().split("\n").pop())); } catch (e) { res({ ok: false, error: "ingest failed" }); } });
    p.stdin.end(JSON.stringify({ title: o && o.title, type: o && o.type, url: o && o.url, text: o && o.text }));
  }));
  ipcMain.handle("kn-open", (_, rel) => { const S0 = stkDir(), f = path.join(S0, String(rel || "")); if (!f.startsWith(S0) || /\.\./.test(rel)) return false; return require("electron").shell.openPath(f).then(() => true); });
  ipcMain.on("win", (e, a) => { const w = BrowserWindow.fromWebContents(e.sender); if (!w) return; if (a === "min") w.minimize(); else if (a === "max") w.isMaximized() ? w.unmaximize() : w.maximize(); else if (a === "close") w.close(); else if (a === "top") w.setAlwaysOnTop(!w.isAlwaysOnTop()); });

  createWindow();
  ensureShortcuts();
  watchTodos();
  if (settings.music !== false) now.start();
  pollBoards(); setInterval(pollBoards, 15000);
  setInterval(pollAgents, 4000);
  setInterval(pollVitals, 2000);
  setInterval(() => pollUsage(false), 30000);
  setTimeout(() => { pollAgents(); pollUsage(true); pollVitals(); }, 800);
  globalShortcut.register("Control+Alt+H", () => { if (!win) return; if (win.isVisible() && win.isFocused()) win.minimize(); else { win.show(); win.focus(); } });
});

app.on("window-all-closed", () => { try { if (tfProc) tfProc.kill(); } catch (e) {} if (chats) chats.killAll(); if (now) now.stop(); app.quit(); });
app.on("will-quit", () => { globalShortcut.unregisterAll(); if (now) now.stop(); });
