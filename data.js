// HQ OS data layer: projects under a projects root, To-Do parsing/write-back, live Claude agents, usage, commits.
// Pure Node (runs in the Electron main process). Never walks node_modules or code trees: only <project>/Notes.
const fs = require("fs"), fsp = fs.promises, path = require("path"), os = require("os");
const { execFile } = require("child_process");

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");
const OLD_WS = /^Claude'sWorkspace[\\/]/i;
const NOT_PROJECTS = new Set(["agent team", "token tools", "node_modules", "lumenads", "lumen-wt"]);

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const slug = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
const escRe = (x) => String(x).replace(/[.*+?^$\{}()|[\]\\]/g, "\\$&");
const clean = (s) => (s || "").replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu, "").replace(/\*\*|`/g, "").trim();

// ---------- settings ----------
// Old plugin paths were vault-relative ("Claude'sWorkspace/Lumen/Notes/x.md"); map them onto the projects root.
function mapPath(p, root) {
  if (!p) return "";
  p = String(p).trim();
  if (path.isAbsolute(p)) return p;
  return path.join(root, p.replace(OLD_WS, ""));
}

function loadSettings(file, legacyFile) {
  let s = null;
  try { s = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {}
  if (!s) {
    s = { projectsRoot: path.join(HOME, "Projects"), person: "Hayden", voice: false, projects: [], last: "" };
    try { // one-time import from the Obsidian plugin's data.json
      const old = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
      s.person = old.person || s.person;
      s.last = old.last || "";
      s.excludeRe = old.excludeRe || "";
      s.claudePath = old.claudePath || "";
      s.projects = (old.projects || []).map((p) => ({
        id: p.id, name: p.name, accent: p.accent || "",
        folder: p.folder ? String(p.folder).replace(OLD_WS, "") : "",
        todo: p.todo ? String(p.todo).replace(OLD_WS, "") : "",
        agents: p.agents ? String(p.agents).replace(OLD_WS, "") : "",
        review: p.review ? String(p.review).replace(OLD_WS, "") : "",
        daily: p.daily ? String(p.daily).replace(OLD_WS, "") : "",
        nextHead: p.nextHead || "Next", waitHead: p.waitHead || "Waiting on",
        liveRe: p.liveRe || "", metricsCmd: p.metricsCmd || "",
        metricsCwd: p.metricsCwd ? String(p.metricsCwd).replace(OLD_WS, "") : "",
        pinned: !!p.pinned, extra: p.extra || "",
      }));
      s.imported = new Date().toISOString();
    } catch (e) {}
    saveSettings(file, s);
  }
  return s;
}
function saveSettings(file, s) { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(s, null, 2)); } catch (e) {} }

// ---------- projects ----------
function resolveProject(pr, root) {
  const folder = mapPath(pr.folder || pr.name, root), notes = path.join(folder, "Notes");
  let md = []; try { md = fs.readdirSync(notes).filter((n) => /\.md$/i.test(n)); } catch (e) {}
  const pick = (v, auto) => (v ? mapPath(v, root) : auto);
  const todoName = md.find((n) => /to-?do/i.test(n)) || md.find((n) => /board/i.test(n));
  return {
    id: pr.id || slug(pr.name), name: pr.name, accent: pr.accent || "", pinned: !!pr.pinned,
    folder, notes, exists: isDir(folder),
    todo: pick(pr.todo, todoName ? path.join(notes, todoName) : ""),
    agents: pick(pr.agents, isFile(path.join(notes, "Agent Activity.md")) ? path.join(notes, "Agent Activity.md") : ""),
    review: pick(pr.review, isDir(path.join(notes, "Review")) ? path.join(notes, "Review") : ""),
    daily: pick(pr.daily, isDir(path.join(notes, "Daily")) ? path.join(notes, "Daily") : ""),
    repo: isDir(path.join(folder, ".git")) ? folder : "",
    nextHead: pr.nextHead || "Next", waitHead: pr.waitHead || "Waiting on", liveRe: pr.liveRe || "",
    metricsCmd: pr.metricsCmd || "", metricsCwd: pr.metricsCwd ? mapPath(pr.metricsCwd, root) : folder,
  };
}

function listProjects(s) {
  const root = s.projectsRoot, seen = new Set(), out = [];
  for (const p of s.projects || []) { const r = resolveProject(p, root); if (!r.exists || /-wt$/i.test(path.basename(r.folder))) continue; seen.add(path.basename(r.folder).toLowerCase()); out.push(r); }
  let dirs = []; try { dirs = fs.readdirSync(root, { withFileTypes: true }); } catch (e) {}
  for (const d of dirs) {
    if (!d.isDirectory() || d.name.startsWith(".") || NOT_PROJECTS.has(d.name.toLowerCase()) || seen.has(d.name.toLowerCase())) continue;
    if (!isDir(path.join(root, d.name, "Notes"))) continue;
    out.push(resolveProject({ name: d.name, folder: d.name }, root));
  }
  return out.sort((a, b) => (b.pinned - a.pinned) || a.name.localeCompare(b.name));
}

// ---------- To-Do ----------
function parseTodo(md, pr, person) {
  const lines = md.split(/\r?\n/), heads = [];
  lines.forEach((l, i) => { const h = /^## (.*)/.exec(l); if (h) heads.push({ name: h[1].trim(), start: i }); });
  heads.forEach((h, k) => { h.end = heads[k + 1] ? heads[k + 1].start : lines.length; });
  const who = (person || "").trim();
  const waitRe = new RegExp("^" + escRe(pr.waitHead || "Waiting on") + (who ? "(\\s*\\(?" + escRe(who) + "\\)?)?" : ""), "i");
  const nh = heads.find((h) => h.name.toLowerCase().startsWith((pr.nextHead || "Next").toLowerCase()));
  const wh = heads.find((h) => waitRe.test(h.name));
  const next = [], wait = [];
  if (nh) for (let i = nh.start + 1; i < nh.end; i++) {
    const m = /^(\d+[a-z]?)\.\s\[( |x|-)\]\s(.*)/i.exec(lines[i]); if (!m) continue;
    next.push({ line: i, raw: lines[i], num: m[1], done: m[2] !== " ", dropped: m[2] === "-", text: clean(m[3]) });
  }
  if (wh) for (let i = wh.start + 1; i < wh.end; i++) {
    const m = /^- \[( |x)\]\s(.*)/i.exec(lines[i]); if (!m) continue;
    wait.push({ line: i, raw: lines[i], done: m[1] !== " ", text: clean(m[2]) });
  }
  let live = "";
  if (pr.liveRe) { try { const m = new RegExp(pr.liveRe, "i").exec(lines.slice(0, 12).join("\n")); if (m) live = clean(m[1] !== undefined ? m[1] : m[0]).replace(/\.\s*$/, ""); } catch (e) {} }
  return { live, next, wait };
}

async function readTodo(pr, person) {
  if (!pr.todo) return { live: "", next: [], wait: [], missing: true };
  try { const md = await fsp.readFile(pr.todo, "utf8"); const st = await fsp.stat(pr.todo); return Object.assign(parseTodo(md, pr, person), { mtime: st.mtimeMs, file: pr.todo }); }
  catch (e) { return { live: "", next: [], wait: [], missing: true }; }
}

// Toggle a checkbox, but only if the line still holds exactly what the UI saw (no clobbering edits made elsewhere).
async function toggleTodo(file, line, raw, on) {
  const md = await fsp.readFile(file, "utf8"), eol = md.includes("\r\n") ? "\r\n" : "\n", L = md.split(/\r?\n/);
  if (L[line] !== raw) throw new Error("The note changed. Refreshing.");
  L[line] = raw.replace(/\[( |x|X)\]/, on ? "[x]" : "[ ]");
  await fsp.writeFile(file, L.join(eol));
  return true;
}

// Append a task to the "Next" section as the next number.
async function addTodo(file, pr, text) {
  const md = await fsp.readFile(file, "utf8"), eol = md.includes("\r\n") ? "\r\n" : "\n", L = md.split(/\r?\n/);
  const nS = L.findIndex((l) => new RegExp("^## " + escRe(pr.nextHead || "Next"), "i").test(l));
  if (nS < 0) { L.push("", "## " + (pr.nextHead || "Next"), "1. [ ] " + text); }
  else {
    let end = L.findIndex((l, i) => i > nS && /^## /.test(l)); if (end < 0) end = L.length;
    let max = 0, last = nS;
    for (let i = nS + 1; i < end; i++) { const m = /^(\d+)[a-z]?\.\s\[/.exec(L[i]); if (m) { max = Math.max(max, +m[1]); last = i; } else if (last > nS && /^\s+\S/.test(L[i]) && i === last + 1) last = i; }
    L.splice(last + 1, 0, (max + 1) + ". [ ] " + text);
  }
  await fsp.writeFile(file, L.join(eol));
}

// ---------- Agent Activity board ----------
function parseBoard(md) {
  const out = [];
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const c = line.split("|").slice(1, -1).map((x) => x.trim());
    if (c.length < 5 || c[0] === "Agent" || /^-+$/.test(c[0])) continue;
    out.push({ name: c[0], working: /working/i.test(c[1]), task: clean(c[2]), last: clean(c[3]), updated: c[4] });
  }
  return out;
}
async function readBoard(pr) { if (!pr.agents) return []; try { return parseBoard(await fsp.readFile(pr.agents, "utf8")); } catch (e) { return []; } }

// ---------- live Claude agents (subagent transcripts under ~/.claude/projects) ----------
const liveCache = new Map();
function hint(inp) {
  if (!inp) return "";
  const v = inp.description || inp.file_path || inp.path || inp.pattern || inp.command || inp.url || inp.query || inp.prompt || "";
  let t = String(v).replace(/\s+/g, " ");
  if (inp.file_path || inp.path) t = t.split(/[\\/]/).pop();
  return t.slice(0, 70);
}
async function readRange(file, from, len) {
  const fh = await fsp.open(file, "r");
  try { const b = Buffer.alloc(len); const { bytesRead } = await fh.read(b, 0, len, from); return b.toString("utf8", 0, bytesRead); } finally { await fh.close(); }
}
async function scanOne(metaFile, now) {
  const base = metaFile.replace(/\.meta\.json$/, ""), jf = base + ".jsonl";
  let ms, js = null;
  try { ms = await fsp.stat(metaFile); } catch (e) { return null; }
  try { js = await fsp.stat(jf); } catch (e) {}
  const mtime = js ? js.mtimeMs : ms.mtimeMs;
  if (now - mtime > 864e5) return null;
  const c = liveCache.get(metaFile);
  if (c && c.mtime === mtime && c.metaM === ms.mtimeMs) return c.out;
  let meta = {}; try { meta = JSON.parse(await fsp.readFile(metaFile, "utf8")); } catch (e) {}
  let step = "", count = 0, start = ms.birthtimeMs; const steps = [], files = new Map();
  if (js) {
    const head = await readRange(jf, 0, Math.min(4096, js.size)); const m = /"timestamp":"([^"]+)"/.exec(head); if (m) start = Date.parse(m[1]);
    const tailLen = Math.min(65536, js.size), tail = await readRange(jf, js.size - tailLen, tailLen);
    count = (tail.match(/"type":"tool_use"/g) || []).length;
    const lines = tail.split("\n"); if (js.size > tailLen) lines.shift();
    for (const l of lines) {
      if (!l.includes('"assistant"')) continue;
      let o; try { o = JSON.parse(l); } catch (e) { continue; }
      const ct = o.message && o.message.content; if (o.type !== "assistant" || !Array.isArray(ct)) continue;
      const t = Date.parse(o.timestamp) || mtime;
      for (const b of ct) {
        if (b.type === "tool_use") {
          step = b.name + (hint(b.input) ? " · " + hint(b.input) : ""); steps.push({ kind: "tool", text: step, t });
          const fp = b.input && (b.input.file_path || b.input.notebook_path);
          if (fp) { const op = /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(b.name) ? "edit" : b.name === "Read" ? "read" : ""; if (op) { const prev = files.get(fp); files.delete(fp); files.set(fp, { p: fp, op: prev && prev.op === "edit" ? "edit" : op, t }); } }
        } else if (b.type === "text" && b.text && b.text.trim()) { step = b.text.replace(/\s+/g, " ").trim().slice(0, 160); steps.push({ kind: "say", text: step, t }); }
      }
    }
  }
  const proj = path.basename(path.dirname(path.dirname(path.dirname(metaFile))));
  const out = { id: path.basename(base), proj, type: meta.agentType || "agent", title: meta.description || meta.agentType || "agent", model: String(meta.model || "").replace(/^claude-/, ""), finished: meta.finished === true, mtime, start, step, steps: steps.slice(-6), files: [...files.values()].slice(-8) };
  liveCache.set(metaFile, { mtime, metaM: ms.mtimeMs, out });
  return out;
}
async function scanAgents(excludeRe) {
  const now = Date.now(), files = [], root = path.join(CLAUDE_DIR, "projects");
  let ex = null; try { ex = excludeRe ? new RegExp(excludeRe, "i") : null; } catch (e) {}
  let dirs = []; try { dirs = await fsp.readdir(root); } catch (e) { return []; }
  for (const d of dirs) {
    if (ex && ex.test(d)) continue;
    let sess = []; try { sess = await fsp.readdir(path.join(root, d), { withFileTypes: true }); } catch (e) { continue; }
    for (const s of sess) {
      if (!s.isDirectory()) continue;
      const sub = path.join(root, d, s.name, "subagents");
      let fl = []; try { fl = await fsp.readdir(sub); } catch (e) { continue; }
      fl.filter((f) => /^agent-.*\.meta\.json$/.test(f)).forEach((f) => files.push(path.join(sub, f)));
    }
  }
  const res = (await Promise.all(files.map((f) => scanOne(f, now).catch(() => null)))).filter(Boolean);
  res.forEach((a) => { a.status = a.finished ? "done" : now - a.mtime < 15 * 60000 ? "running" : "stalled"; });
  return res.sort((a, b) => b.mtime - a.mtime).slice(0, 40);
}

// ---------- Claude plan usage ----------
async function fetchUsage() {
  const cred = JSON.parse(await fsp.readFile(path.join(CLAUDE_DIR, ".credentials.json"), "utf8"));
  const tok = cred.claudeAiOauth && cred.claudeAiOauth.accessToken;
  if (!tok) throw new Error("Not signed in to Claude");
  const r = await fetch("https://api.anthropic.com/api/oauth/usage", { headers: { Authorization: "Bearer " + tok, "anthropic-beta": "oauth-2025-04-20" } });
  if (r.status === 401) throw new Error("Sign-in expired. Send Claude any message, then refresh.");
  if (!r.ok) throw new Error("Usage unavailable (" + r.status + ")");
  return r.json();
}

// ---------- git activity ----------
function fetchCommits(repo) {
  return new Promise((resolve) => {
    if (!repo) return resolve({ days: [], last: "" });
    execFile("git", ["-C", repo, "log", "--since=14.days", "--format=%ad|%s", "--date=short"], { timeout: 8000, windowsHide: true }, (err, out) => {
      const m = {}; let last = "";
      if (!err) out.split("\n").filter(Boolean).forEach((l, i) => { const [d, s] = l.split("|"); m[d] = (m[d] || 0) + 1; if (i === 0) last = s; });
      const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toLocaleDateString("en-CA"); days.push(m[d] || 0); }
      resolve({ days, last: last || "" });
    });
  });
}

// ---------- review inbox (count only; media stays on disk) ----------
async function reviewCount(pr) {
  if (!pr.review) return 0;
  try { const fl = await fsp.readdir(pr.review); let n = 0;
    for (const f of fl) { if (!/\.md$/i.test(f)) continue; const t = await fsp.readFile(path.join(pr.review, f), "utf8").catch(() => ""); if (!/^status:\s*(approved|rejected|changes)/im.test(t)) n++; }
    return n; } catch (e) { return 0; }
}

// Every project's Agent Activity board, for the agent tracker (rows tagged with the project name).
async function allBoards(projects) {
  const out = [];
  for (const p of projects) for (const r of await readBoard(p)) out.push(Object.assign({ proj: p.name }, r));
  return out;
}

module.exports = { allBoards, loadSettings, saveSettings, listProjects, readTodo, toggleTodo, addTodo, readBoard, scanAgents, fetchUsage, fetchCommits, reviewCount, clean };
