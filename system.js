// System vitals (CPU, RAM, Claude processes) and Windows "now playing" (via the plugin's nowplaying.ps1 / nowcontrol.ps1).
const os = require("os"), fs = require("fs"), path = require("path");
const { spawn, execFile } = require("child_process");

// ---------- vitals ----------
let prevCpu = null;
function cpuPct() {
  const t = os.cpus().reduce((a, c) => { const tot = Object.values(c.times).reduce((x, y) => x + y, 0); a.idle += c.times.idle; a.tot += tot; return a; }, { idle: 0, tot: 0 });
  const p = prevCpu; prevCpu = t; if (!p) return 0;
  const dt = t.tot - p.tot; return dt > 0 ? Math.max(0, Math.min(100, 100 * (1 - (t.idle - p.idle) / dt))) : 0;
}
let claudeProcs = 0, claudeMem = 0, procAt = 0;
function countClaude() {
  if (Date.now() - procAt < 10000) return; procAt = Date.now();
  execFile("tasklist", ["/FI", "IMAGENAME eq claude.exe", "/FO", "CSV", "/NH"], { windowsHide: true, timeout: 5000 }, (err, out) => {
    if (err) return; const rows = out.split(/\r?\n/).filter((l) => /^"claude\.exe"/i.test(l));
    claudeProcs = rows.length; claudeMem = rows.reduce((a, l) => a + (parseInt((l.split('","')[4] || "").replace(/[^\d]/g, ""), 10) || 0), 0) / 1024;
  });
}
function vitals() {
  countClaude();
  const tot = os.totalmem(), free = os.freemem();
  return { cpu: Math.round(cpuPct()), ram: Math.round((100 * (tot - free)) / tot), ramUsed: (tot - free) / 1073741824, ramTot: tot / 1073741824, cores: os.cpus().length, claude: claudeProcs, claudeMem: Math.round(claudeMem), uptime: os.uptime() };
}

// ---------- now playing ----------
const SCRIPTS = path.join(__dirname, "..");
class NowPlaying {
  constructor(onData) { this.onData = onData; this.proc = null; this.failAt = 0; this.lastKey = ""; this.coverUrl = ""; }
  start() {
    const script = path.join(SCRIPTS, "nowplaying.ps1");
    if (this.proc || Date.now() - this.failAt < 60000 || !fs.existsSync(script)) return;
    const p = this.proc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let buf = "";
    p.stdout.on("data", (d) => { buf += d.toString("utf8"); let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l.startsWith("{")) { try { this.handle(JSON.parse(l)); } catch (e) {} } } });
    const dead = () => { if (this.proc === p) { this.proc = null; this.failAt = Date.now(); } };
    p.on("exit", dead); p.on("error", dead);
  }
  stop() { const p = this.proc; this.proc = null; if (p) execFile("taskkill", ["/PID", String(p.pid), "/T", "/F"], { windowsHide: true }, () => {}); }
  handle(d) {
    const ss = (d && d.sessions) || [];
    const pl = ss.filter((x) => x.status === "Playing" && x.title);
    const s = pl.find((x) => x.app === d.current) || pl[0] || ss.find((x) => x.title && x.app === d.current) || null;
    if (!s) { if (this.lastKey) { this.lastKey = ""; this.onData(null); } return; }
    const key = s.app + "|" + s.title + "|" + s.artist + "|" + s.status + "|" + (s.cover || "");
    if (key === this.lastKey) return; this.lastKey = key;
    let cover = "";
    if (s.cover) { try { const b = fs.readFileSync(s.cover); if (b.length < 3e6) { const mime = b[0] === 0x89 ? "image/png" : "image/jpeg"; cover = "data:" + mime + ";base64," + b.toString("base64"); } } catch (e) {} }
    this.onData({ title: s.title, artist: s.artist, playing: s.status === "Playing", app: appName(s.app), cover });
  }
  control(cmd) {
    if (!["next", "prev", "toggle"].includes(cmd)) return;
    const f = path.join(SCRIPTS, "nowcontrol.ps1"); if (!fs.existsSync(f)) return;
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", f, cmd], { windowsHide: true }, () => { this.lastKey = ""; });
  }
}
function appName(id) { const a = String(id || "").split("!").pop().replace(/\.exe$/i, ""); return /spotify/i.test(a) ? "Spotify" : /msedge/i.test(a) ? "Edge" : /chrome/i.test(a) ? "Chrome" : /brave/i.test(a) ? "Browser" : /firefox/i.test(a) ? "Firefox" : /zune|music/i.test(a) ? "Media Player" : a.charAt(0).toUpperCase() + a.slice(1); }

module.exports = { vitals, NowPlaying };
