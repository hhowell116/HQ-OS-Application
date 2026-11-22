// HQ OS: Electron main process. Owns the file system, Claude processes and polling; windows only render.
const { app, BrowserWindow, ipcMain, shell, globalShortcut, session, desktopCapturer } = require("electron");
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
let win = null, chats = null, now = null;
const cache = { projects: [], agents: [], boards: [], usage: null, usageErr: "", usageAt: 0, music: null, vit: [] };

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
  chats = new Chats(path.join(USER, "chats"), () => settings, (ev) => { send("chat", ev); if (ev.what !== "stream") send("crew", crew()); });
  now = new SYS.NowPlaying((m) => { cache.music = m; send("music", m); });

  // Desktop audio (loopback) for the visualizer: getDisplayMedia gets the screen's audio, the 1-pixel video is dropped.
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((s) => cb(s[0] ? { video: s[0], audio: "loopback" } : {})).catch(() => cb({}));
  });

  const pub = () => ({ person: settings.person, voice: !!settings.voice, last: settings.last, projectsRoot: settings.projectsRoot, theme: settings.theme || "cyan", accent: settings.accent || "", audio: settings.audio !== false, music: settings.music !== false, archived: settings.archived || [] });
  ipcMain.handle("init", async () => ({ settings: pub(), projects: await Promise.all(cache.projects.map(projectSummary)) }));
  ipcMain.handle("settings", () => pub());
  ipcMain.handle("projects", async () => { refreshProjects(); watchTodos(); return Promise.all(cache.projects.map(projectSummary)); });
  ipcMain.handle("needs", async () => { const out = []; for (const p of cache.projects) { if ((settings.archived || []).includes(p.id)) continue; const t = await D.readTodo(p, settings.person); const items = t.wait.filter((x) => !x.done).map((x) => ({ line: x.line, text: x.text })); if (items.length) out.push({ id: p.id, name: p.name, items }); } return out; });
  ipcMain.handle("project", (_, id) => { if (id && settings.last !== id) { settings.last = id; D.saveSettings(SETTINGS_FILE, settings); } return projectDetail(id); });
  ipcMain.handle("todo-toggle", async (_, { id, line, raw, on }) => { const p = projById(id); if (!p || !p.todo) throw new Error("No To-Do note"); await D.toggleTodo(p.todo, line, raw, on); return projectDetail(id); });
  ipcMain.handle("todo-add", async (_, { id, text }) => { const p = projById(id); if (!p || !p.todo) throw new Error("No To-Do note"); await D.addTodo(p.todo, p, String(text).trim()); return projectDetail(id); });
  ipcMain.handle("agents", async () => { await pollAgents(); return cache.agents; });
  ipcMain.handle("crew", () => crew());
  ipcMain.handle("usage", async (_, force) => { await pollUsage(!!force); return { usage: cache.usage, err: cache.usageErr }; });
  ipcMain.handle("music", () => { now.start(); return cache.music; });
  ipcMain.handle("music-ctl", (_, cmd) => now.control(cmd));
  ipcMain.handle("set", (_, kv) => { for (const k of ["voice", "person", "theme", "accent", "audio", "music"]) if (k in kv) settings[k] = kv[k]; if (Array.isArray(kv.archived)) settings.archived = kv.archived.filter((x) => typeof x === "string"); D.saveSettings(SETTINGS_FILE, settings); send("settings", pub()); if ("music" in kv) kv.music ? now.start() : (now.stop(), send("music", null)); return true; });
  ipcMain.handle("open-path", (_, p) => { const target = p === "settings" ? SETTINGS_FILE : p; if (target && fs.existsSync(target)) shell.openPath(target); });
  ipcMain.handle("open-vscode", (_, id) => { const p = projById(id); if (!p) return; const code = path.join(process.env.LOCALAPPDATA || "", "Programs", "Microsoft VS Code", "bin", "code.cmd"); require("child_process").spawn(fs.existsSync(code) ? code : "code", [p.folder], { shell: true, detached: true, windowsHide: true }).unref(); });
  ipcMain.handle("chat-list", (_, proj) => chats.list(proj));
  ipcMain.handle("chat-get", (_, id) => chats.get(id));
  ipcMain.handle("chat-new", (_, { proj, model }) => chats.create(proj ? projById(proj) : null, model));
  ipcMain.handle("chat-send", (_, { id, text }) => chats.send(id, text));
  ipcMain.handle("chat-stop", (_, id) => chats.stop(id));
  ipcMain.handle("chat-model", (_, { id, model }) => chats.setModel(id, model));
  ipcMain.handle("chat-delete", (_, id) => chats.remove(id));
  ipcMain.handle("chat-handoff", (_, id) => chats.handoff(id));
  ipcMain.handle("chat-compact", (_, id) => chats.compact(id));
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

app.on("window-all-closed", () => { if (chats) chats.killAll(); if (now) now.stop(); app.quit(); });
app.on("will-quit", () => { globalShortcut.unregisterAll(); if (now) now.stop(); });
