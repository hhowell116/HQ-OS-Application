// Installed-app helpers: bundled Claude Code, bundled speech models, first-run setup, Claude sign-in. No scripts, no downloads.
const fs = require("fs"), path = require("path"), os = require("os");
const { spawn, execFile } = require("child_process");

const packaged = () => !!(process.resourcesPath && require("electron").app.isPackaged);
const exists = (p) => { try { return fs.existsSync(p); } catch (e) { return false; } };

// Claude Code binary shipped in resources\claude (installed app) or node_modules (dev checkout).
function bundledClaude() {
  const c = [];
  if (process.resourcesPath) c.push(path.join(process.resourcesPath, "claude", "claude.exe"));
  c.push(path.join(__dirname, "node_modules", "@anthropic-ai", "claude-code-win32-x64", "claude.exe"));
  return c.find(exists) || "";
}
function onPath(name) {
  for (const d of String(process.env.PATH || "").split(path.delimiter)) { if (!d) continue; for (const ext of [".exe", ".cmd"]) { const f = path.join(d.replace(/^"|"$/g, ""), name + ext); if (ext === ".exe" && exists(f)) return f; } }
  return "";
}
// Order: settings.claudePath, then (installed app) bundled, ~/.local/bin, PATH; (dev) ~/.local/bin, bundled, PATH.
function claudeExe(settings) {
  const set = ((settings && settings.claudePath) || "").trim(); if (set) return set;
  const local = path.join(os.homedir(), ".local", "bin", "claude.exe");
  const order = packaged() ? [bundledClaude(), local, onPath("claude")] : [local, bundledClaude(), onPath("claude")];
  return order.find((p) => p && exists(p)) || order[0] || local;
}

// Speech models: resources\models\<name> when bundled (then the workers never touch the network), else userData.
function modelDir(name, userData) {
  const cands = [process.env.HQ_MODELS_DIR, process.resourcesPath && path.join(process.resourcesPath, "models")].filter(Boolean);
  for (const c of cands) { const d = path.join(c, name); if (exists(d)) return { dir: d, offline: true }; }
  return { dir: path.join(userData, name), offline: false };
}

// First run: make sure a projects folder exists. Returns true when settings changed.
function firstRun(settings) {
  let changed = false;
  if (process.env.HQ_PROJECTS_ROOT) { settings.projectsRoot = process.env.HQ_PROJECTS_ROOT; changed = true; }
  if (!settings.projectsRoot) { settings.projectsRoot = path.join(os.homedir(), "Projects"); changed = true; }
  try { fs.mkdirSync(settings.projectsRoot, { recursive: true }); } catch (e) {}
  return changed;
}

// Env for the claude child: no self-update (nothing downloads), API key from settings (encrypted with the OS) if one was saved.
function claudeEnv(settings) {
  const env = Object.assign({}, process.env, { DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" });
  const k = apiKey(settings); if (k) env.ANTHROPIC_API_KEY = k;
  return env;
}
function apiKey(settings) {
  try { const { safeStorage } = require("electron"); if (settings.apiKeyEnc && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(settings.apiKeyEnc, "base64")); } catch (e) {}
  return "";
}
function setApiKey(settings, key) {
  const { safeStorage } = require("electron"); key = String(key || "").trim();
  if (!key) { delete settings.apiKeyEnc; return true; }
  if (!/^sk-[\w-]{20,}$/.test(key)) throw new Error("That does not look like an Anthropic API key");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure storage is not available on this PC");
  settings.apiKeyEnc = safeStorage.encryptString(key).toString("base64"); return true;
}

// `claude auth status` -> { ok, loggedIn, method }. Never returns account details.
function authStatus(settings) {
  return new Promise((res) => {
    const exe = claudeExe(settings); if (!exists(exe)) return res({ ok: false, loggedIn: false, err: "Claude Code not found" });
    if (apiKey(settings)) return res({ ok: true, loggedIn: true, method: "api key" });
    execFile(exe, ["auth", "status"], { windowsHide: true, timeout: 15000, env: claudeEnv(settings) }, (err, out) => {
      try { const j = JSON.parse(out); res({ ok: true, loggedIn: !!j.loggedIn, method: j.authMethod || "" }); } catch (e) { res({ ok: true, loggedIn: false }); }
    });
  });
}
// `claude auth login` opens the default browser for the Claude sign-in and exits when it completes.
let loginProc = null;
function authLogin(settings) {
  return new Promise((res) => {
    if (loginProc) return res({ ok: false, err: "Sign-in already open" });
    const exe = claudeExe(settings); if (!exists(exe)) return res({ ok: false, err: "Claude Code not found" });
    const p = loginProc = spawn(exe, ["auth", "login", "--claudeai"], { windowsHide: true, env: claudeEnv(settings), stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; const add = (d) => { out = (out + d.toString()).slice(-600); };
    p.stdout.on("data", add); p.stderr.on("data", add);
    const t = setTimeout(() => { try { p.kill(); } catch (e) {} }, 10 * 60000);
    p.on("error", (e) => { loginProc = null; clearTimeout(t); res({ ok: false, err: e.message }); });
    p.on("exit", (code) => { loginProc = null; clearTimeout(t); res(code === 0 ? { ok: true } : { ok: false, err: "Sign-in did not finish" }); });
  });
}

module.exports = { packaged, bundledClaude, claudeExe, claudeEnv, modelDir, firstRun, authStatus, authLogin, setApiKey, apiKey };
