// HQ OS console: Claude Code conversations driven over stream-json (ported from the plugin's HQChats).
// One long-lived `claude -p` process per conversation, resumed by session id, working in the project's folder.
const fs = require("fs"), path = require("path"), os = require("os");
const { spawn, execFile } = require("child_process");

const SECRET_RES = [[/\b(?:ak|sk|pk|rk)[-_][A-Za-z0-9_-]{8,}/g, "[redacted]"], [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, "[redacted]"], [/\bAIza[\w-]{16,}/g, "[redacted]"], [/\bxox[abprs]-[\w-]{8,}/g, "[redacted]"], [/\bAKIA[0-9A-Z]{12,}/g, "[redacted]"], [/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "Bearer [redacted]"], [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}/g, "[redacted]"], [/((?:key|token|secret|passw(?:or)?d|pwd|auth)\w*["']?\s*[:=]\s*["']?)[A-Za-z0-9+/_=-]{16,}/gi, "$1[redacted]"]];
const redact = (s) => SECRET_RES.reduce((t, [re, to]) => t.replace(re, to), String(s || ""));

function toolTarget(name, inp) {
  inp = inp || {};
  const v = inp.file_path || inp.path || inp.command || inp.pattern || inp.url || inp.query || inp.description || inp.prompt || "";
  let t = String(v).replace(/\s+/g, " ");
  if (inp.file_path || inp.path) t = t.split(/[\\/]/).slice(-2).join("/");
  return t.slice(0, 90);
}

const HANDOFF_PROMPT = "Write a handoff note so a brand-new chat can continue this work with no other context. Reply with ONLY the note in Markdown, under about 700 words, with these headings: ## Goal, ## Done so far (commits, files, results), ## Current state, ## Key decisions and why, ## Files and paths that matter, ## Next steps (in order), ## Waiting on Hayden / open questions. Be specific (exact paths, commands, names). Do not run tools or do any other work.";

class Chats {
  constructor(dir, getSettings, emit) {
    this.dir = dir; this.getSettings = getSettings; this.emitFn = emit; this.convs = new Map();
    this.logFile = path.join(dir, "..", "hq-chat.log");
    fs.mkdirSync(dir, { recursive: true }); this.imgDir = path.join(dir, "..", "chat-images");
    for (const f of fs.readdirSync(dir)) if (f.endsWith(".json")) {
      try { const c = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); if (c && c.id) { Object.assign(c, { proc: null, busy: false, cur: null }); this.convs.set(c.id, c); } } catch (e) {}
    }
    this.idle = setInterval(() => { for (const c of this.convs.values()) if (c.proc && !c.busy && Date.now() - (c.lastUse || 0) > 30 * 60000) this.kill(c, "idle"); }, 60000);
  }
  exe() { const s = this.getSettings(); return (s.claudePath || "").trim() || path.join(os.homedir(), ".local", "bin", "claude.exe"); }
  log(m) { try { fs.appendFileSync(this.logFile, new Date().toISOString() + " " + redact(String(m)).slice(0, 1500) + "\n"); } catch (e) {} }
  view(c) { const o = {}; for (const k of ["id", "title", "model", "proj", "projName", "created", "updated", "busy", "msgs", "ctx", "lastAt", "sessionId"]) o[k] = c[k]; o.queue = (c.queue || []).map((q) => ({ text: q.text, imgs: (q.files || []).map((f) => f.path) })); o.handingOff = !!c.handingOff; return o; }
  // Busy console chats, for the agent tracker.
  active() { return [...this.convs.values()].filter((c) => c.busy).map((c) => { const cur = c.cur, b = cur && cur.blocks[cur.blocks.length - 1]; const say = cur && [...cur.blocks].reverse().find((x) => x.k === "text" && x.text); return { id: c.id, title: c.title, proj: c.projName, model: c.model, start: cur ? cur.at : Date.now(), step: b ? (b.k === "tool" ? b.name + (b.target ? " · " + b.target : "") : b.k === "think" ? "thinking" : (b.text || "").slice(-140)) : "starting", say: say ? say.text.slice(-160) : "", files: cur ? cur.blocks.filter((x) => x.k === "tool" && /^(Edit|Write|Read|MultiEdit)$/.test(x.name) && x.target).map((x) => ({ p: x.target, op: x.name === "Read" ? "read" : "edit", t: Date.now() })).slice(-8) : [] }; }); }
  // Send a prompt and resolve with the reply text when the turn ends.
  ask(c, text) { return new Promise((res, rej) => { c._waiter = { res, rej }; this.send(c.id, text); }); }
  async handoff(id) {
    const c = this.convs.get(id);
    if (!c || !c.sessionId) throw new Error("Open a chat with some history first.");
    if (c.busy) throw new Error("Wait for Claude to finish, then hand off.");
    c.handingOff = true; this.emit(c, "turn");
    try {
      const note = await this.ask(c, HANDOFF_PROMPT);
      if (!/##\s*Goal/i.test(note)) throw new Error("No handoff note came back.");
      const n = this.create({ id: c.proj, name: c.projName, folder: c.cwd }, c.model);
      const nc = this.convs.get(n.id); nc.title = "Handoff: " + String(c.title).replace(/^Handoff: /, "").slice(0, 40); this.save(nc);
      this.send(nc.id, "Handoff from the previous chat “" + c.title + "”. Read this, then continue from ‘Next steps’. Don't redo finished work.\n\n" + note);
      return nc.id;
    } finally { c.handingOff = false; this.emit(c, "done"); }
  }
  compact(id) { const c = this.convs.get(id); if (!c || !c.sessionId) throw new Error("Nothing to compact yet."); if (c.busy) throw new Error("Wait for Claude to finish first."); this.send(id, "/compact"); }
  emit(c, what) { clearTimeout(c._em); const go = () => this.emitFn({ what, conv: this.view(c) }); if (what === "stream") c._em = setTimeout(go, 50); else go(); }
  list(proj) { return [...this.convs.values()].filter((c) => !proj || c.proj === proj).sort((a, b) => (b.updated || 0) - (a.updated || 0)).map((c) => ({ id: c.id, title: c.title, updated: c.updated, busy: c.busy, proj: c.proj })); }
  get(id) { const c = this.convs.get(id); return c ? this.view(c) : null; }
  save(c) {
    clearTimeout(c._st);
    c._st = setTimeout(() => { try { const o = {}; for (const k of ["id", "sessionId", "title", "model", "created", "updated", "proj", "projName", "cwd", "primed", "ctx", "lastAt"]) o[k] = c[k]; o.msgs = c.msgs.slice(-200); o.imgN = c.imgN; o.titleSet = c.titleSet; fs.writeFileSync(path.join(this.dir, c.id + ".json"), redact(JSON.stringify(o))); } catch (e) { this.log("save " + e.message); } }, 400);
  }
  create(pr, model) {
    const id = "hq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const c = { id, sessionId: "", title: "New conversation", model: model || "", created: Date.now(), updated: Date.now(), msgs: [], proj: pr ? pr.id : "", projName: pr ? pr.name : "", cwd: pr ? pr.folder : os.homedir(), primed: false, proc: null, busy: false, cur: null, lastUse: Date.now() };
    this.convs.set(id, c); this.save(c); this.emit(c, "list"); return this.view(c);
  }
  remove(id) { const c = this.convs.get(id); if (!c) return; this.kill(c, "delete"); this.convs.delete(id); clearTimeout(c._st); try { fs.unlinkSync(path.join(this.dir, id + ".json")); } catch (e) {} this.emitFn({ what: "list" }); }

  spawnProc(c) {
    const exe = this.exe(); if (!fs.existsSync(exe)) throw new Error("Claude Code was not found at " + exe + ". Install it or set claudePath in settings.");
    const s = this.getSettings();
    const args = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--permission-mode", s.permissionMode || "bypassPermissions"];
    if (c.model) args.push("--model", c.model);
    if (c.sessionId) args.push("--resume", c.sessionId);
    const cwd = c.cwd && fs.existsSync(c.cwd) ? c.cwd : os.homedir();
    this.log("spawn " + args.join(" ") + " cwd=" + cwd + " (conv " + c.id + ")");
    const p = spawn(exe, args, { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: Object.assign({}, process.env) });
    c.proc = p; c.procModel = c.model; c.buf = ""; c.err = ""; c.idx = {};
    p.stdout.on("data", (d) => { c.buf += d.toString("utf8"); let i; while ((i = c.buf.indexOf("\n")) >= 0) { const line = c.buf.slice(0, i).trim(); c.buf = c.buf.slice(i + 1); if (line) this.onLine(c, line); } });
    p.stderr.on("data", (d) => { c.err = (c.err + d.toString("utf8")).slice(-4000); });
    p.on("error", (e) => { this.log("proc error " + e.message); if (c.proc === p) { c.proc = null; this.finish(c, "Could not start Claude Code: " + e.message); } });
    p.on("exit", (code) => { this.log("exit " + code + " (conv " + c.id + ") " + c.err.slice(-300)); if (c.proc === p) { c.proc = null; if (c.busy) this.finish(c, c.stopping ? "" : "Claude Code stopped unexpectedly (code " + code + "). " + redact(c.err.trim().split("\n").slice(-2).join(" ")).slice(0, 300)); } });
    p.stdin.on("error", () => {});
    return p;
  }
  kill(c, why) {
    const p = c.proc; if (!p) return; c.proc = null; this.log("kill " + why + " pid " + p.pid);
    try { p.stdin.end(); } catch (e) {}
    execFile("taskkill", ["/PID", String(p.pid), "/T", "/F"], { windowsHide: true }, () => {});
  }
  killAll() { for (const c of this.convs.values()) this.kill(c, "shutdown"); clearInterval(this.idle); }

  // Images arrive as [{mediaType, data(base64)}]; they are saved under userData/chat-images/<conv>/ and only paths are kept.
  saveImages(c, images) {
    const out = [], dir = path.join(this.imgDir, c.id.replace(/[^\w-]/g, "_"));
    for (const im of (images || []).slice(0, 6)) {
      const mt = String((im && im.mediaType) || ""); if (!/^image\/(png|jpeg|gif|webp)$/.test(mt) || !im.data) continue;
      try { fs.mkdirSync(dir, { recursive: true }); const n = c.imgN = (c.imgN || 0) + 1; const p = path.join(dir, n + "." + (mt === "image/jpeg" ? "jpg" : mt.slice(6))); fs.writeFileSync(p, Buffer.from(im.data, "base64")); out.push({ mediaType: mt, path: p }); } catch (e) { this.log("saveImages " + e.message); }
    }
    return out;
  }
  rename(id, title) {
    const c = this.convs.get(id); title = String(title || "").replace(/\s+/g, " ").trim().slice(0, 80); if (!c || !title) return;
    c.title = title; c.titleSet = true; this.save(c); this.emitFn({ what: "list" });
  }
  send(id, text, images) {
    const c = this.convs.get(id); if (!c) return;
    text = String(text || "").trim();
    const files = Array.isArray(images) && images.length && images[0] && images[0].data ? this.saveImages(c, images) : (images || []);
    if (!text && !files.length) return;
    if (c.busy) { (c.queue = c.queue || []).push({ text, files }); this.emit(c, "queue"); return; }
    if (c.proc && c.procModel !== c.model) this.kill(c, "model changed");
    let p = c.proc;
    if (!p) { try { p = this.spawnProc(c); } catch (e) { c.msgs.push({ r: "user", text }, { r: "asst", blocks: [{ k: "error", text: e.message }] }); this.save(c); this.emit(c, "done"); return; } }
    const slash = /^\/\S/.test(text) && !files.length;
    if (c.title === "New conversation" && !c.titleSet && !slash) c.title = (text || "Image").replace(/\s+/g, " ").slice(0, 48);
    let wire = text;
    if (!c.primed && c.proj && !slash) { wire = "[Project context] Project: " + c.projName + ", folder " + c.cwd + ". Notes live in its Notes\\ folder.\n\n" + text; c.primed = true; }
    const um = { r: "user", text: redact(text) }; if (files.length) um.imgs = files.map((f) => f.path); c.msgs.push(um); c.cur = { r: "asst", blocks: [], at: Date.now() }; c.msgs.push(c.cur);
    c.idx = {}; c.busy = true; c.stopping = false; c.lastUse = Date.now(); c.updated = Date.now();
    let content = wire;
    if (files.length) {
      const parts = [];
      for (const f of files) { try { parts.push({ type: "image", source: { type: "base64", media_type: f.mediaType, data: fs.readFileSync(f.path).toString("base64") } }); } catch (e) { this.log("read image " + e.message); } }
      parts.push({ type: "text", text: wire || "(see attached image" + (files.length > 1 ? "s" : "") + ")" }); content = parts;
    }
    try { p.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n"); }
    catch (e) { this.finish(c, "Could not write to Claude Code: " + e.message); return; }
    this.save(c); this.emit(c, "turn");
  }
  stop(id) {
    const c = this.convs.get(id); if (!c || !c.busy || !c.proc) return; c.stopping = true;
    try { c.proc.stdin.write(JSON.stringify({ type: "control_request", request_id: "hq-int-" + Date.now(), request: { subtype: "interrupt" } }) + "\n"); } catch (e) {}
    const p = c.proc; setTimeout(() => { if (c.busy && c.proc === p) { this.kill(c, "stop timeout"); this.finish(c, ""); } }, 4000);
  }
  setModel(id, model) { const c = this.convs.get(id); if (c) { c.model = model || ""; this.save(c); } }
  finish(c, err) {
    const cur = c.cur;
    if (cur) { if (err) cur.blocks.push({ k: "error", text: err }); cur.blocks.forEach((b) => { if (b.k === "tool") b.open = false; }); if (c.stopping) cur.stopped = true; }
    c.busy = false; c.stopping = false; c.cur = null; c.lastUse = Date.now(); c.lastAt = Date.now(); this.save(c); this.emit(c, "done");
    if (c._waiter) { const w = c._waiter; c._waiter = null; const t = cur ? cur.blocks.filter((b) => b.k === "text").map((b) => b.text).join("\n").trim() : ""; err && !t ? w.rej(new Error(err)) : w.res(t); }
    if (c.queue && c.queue.length) setTimeout(() => { if (!c.busy && c.queue.length) { const q = c.queue.shift(); this.send(c.id, q.text, q.files); } }, 300);
  }
  onLine(c, line) {
    let j; try { j = JSON.parse(line); } catch (e) { return; }
    const t = j.type; c.lastUse = Date.now();
    if (t === "system") { if (j.subtype === "init" && j.session_id) { c.sessionId = j.session_id; this.save(c); } return; }
    if (j.parent_tool_use_id) return;
    const cur = c.cur;
    if (t === "stream_event" && cur) {
      const e = j.event || {};
      if (e.type === "message_start") { c.idx = {}; const u = e.message && e.message.usage; if (u) c.ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); }
      else if (e.type === "content_block_start") {
        const b = e.content_block || {}; let nb;
        if (b.type === "text") nb = { k: "text", text: "" };
        else if (b.type === "thinking" || b.type === "redacted_thinking") nb = { k: "think" };
        else if (b.type === "tool_use") nb = { k: "tool", id: b.id, name: b.name, json: "", target: "", result: "", open: true };
        else return;
        cur.blocks.push(nb); c.idx[e.index] = nb; this.emit(c, "stream");
      } else if (e.type === "content_block_delta") {
        const b = c.idx[e.index], d = e.delta || {}; if (!b) return;
        if (d.type === "text_delta" && b.k === "text") b.text += d.text;
        else if (d.type === "input_json_delta" && b.k === "tool") b.json += d.partial_json || "";
        this.emit(c, "stream");
      } else if (e.type === "content_block_stop") {
        const b = c.idx[e.index];
        if (b && b.k === "tool") { let inp = {}; try { inp = JSON.parse(b.json || "{}"); } catch (x) {} b.target = toolTarget(b.name, inp); b.json = ""; this.emit(c, "stream"); }
      }
    } else if (t === "user" && cur) {
      const ct = j.message && j.message.content; if (!Array.isArray(ct)) return;
      for (const r of ct) if (r.type === "tool_result") {
        const b = cur.blocks.find((x) => x.k === "tool" && x.id === r.tool_use_id);
        if (b) { b.open = false; b.result = redact(typeof r.content === "string" ? r.content : Array.isArray(r.content) ? r.content.map((x) => x.text || "").join("\n") : "").slice(0, 1500); if (r.is_error) b.isErr = true; this.emit(c, "stream"); }
      }
    } else if (t === "result") {
      let err = "";
      if (j.is_error) { const r = String(j.result || ""); err = /login|log in|authenticat|401|credential/i.test(r) ? "Claude Code is not logged in. Open a terminal, run `claude`, then /login." : (r || "Claude Code reported an error.").slice(0, 400); }
      if (j.session_id) c.sessionId = j.session_id;
      if (cur && typeof j.total_cost_usd === "number") cur.cost = j.total_cost_usd;
      this.finish(c, c.stopping ? "" : err);
    }
  }
}

module.exports = { Chats };
