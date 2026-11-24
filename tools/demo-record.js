// HQ OS walkthrough recorder. Runs the app on SAMPLE data (temp folder, temp userData, never the real notes),
// hidden (opacity 0, unfocused, ignores OS mouse), driven only by sendInputEvent, frames from paint events piped to ffmpeg (video only, no audio).
// Run: FFMPEG=<ffmpeg.exe> electron.exe tools/demo-record.js out.mp4  (PROBE=1 -> no recording, screenshots only)
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const PROBE = !!process.env.PROBE, out = process.argv[2] || path.join(os.tmpdir(), "hqos-demo.webm");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-demo-")), root = path.join(tmp, "Projects");
require("./demo-sample.js")(root);
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ projectsRoot: root, person: "", voice: false, projects: [], last: "Atlas", music: true, audio: true, startView: "home", theme: "cyan" }));
process.env.STONKS_DIR = path.join(root, "Stocks");
app.setPath("userData", tmp);
require("../main.js");
const D = require("../data.js"), SYS = require("../system.js"); D.scanAgents = async () => []; SYS.NowPlaying.prototype.start = function () {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const meta = {}; let rec = null, tick = null;
const shotDir = path.join(tmp, "shots");
app.whenReady().then(async () => {
  await sleep(2000);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents; wc.setBackgroundThrottling(false);
  // Immune to the real mouse/keyboard: transparent (opacity 0), never focused, ignores OS mouse input. Only sendInputEvent drives it; frames come from paint events.
  win.setOpacity(0); win.setFocusable(false); win.setIgnoreMouseEvents(true); win.unmaximize(); win.setFullScreen(false); win.setContentSize(1600, 900); win.setPosition(0, 0); win.showInactive(); await sleep(2000);
  wc.on("console-message", (e) => { if (e.level === "error" || e.level === 3) console.log("CONSOLE", String(e.message).slice(0, 200)); });
  const run = (js) => wc.executeJavaScript(js + "; 0").catch((e) => console.log("RUNERR", String(e.message).slice(0, 120)));
  const val = (js) => wc.executeJavaScript(js);
  const [W, H] = win.getContentSize(); let mx = W / 2, my = H / 2;
  const ev = (o) => wc.sendInputEvent(o);
  const move = async (x, y, ms = 800) => { const n = Math.max(8, Math.round(ms / 16)), x0 = mx, y0 = my; for (let i = 1; i <= n; i++) { const t = i / n, e = t * t * (3 - 2 * t); ev({ type: "mouseMove", x: Math.round(x0 + (x - x0) * e), y: Math.round(y0 + (y - y0) * e) }); await sleep(16); } mx = x; my = y; };
  const click = async (x, y) => { if (x != null) await move(x, y, 700); ev({ type: "mouseDown", x: mx, y: my, button: "left", clickCount: 1 }); await sleep(90); ev({ type: "mouseUp", x: mx, y: my, button: "left", clickCount: 1 }); };
  const drag = async (dx, dy, ms = 1400) => { ev({ type: "mouseDown", x: mx, y: my, button: "left", clickCount: 1 }); const n = Math.round(ms / 16), x0 = mx, y0 = my; for (let i = 1; i <= n; i++) { const t = i / n, e = t * t * (3 - 2 * t); ev({ type: "mouseMove", x: Math.round(x0 + dx * e), y: Math.round(y0 + dy * e), button: "left", modifiers: ["leftButtonDown"] }); await sleep(16); } ev({ type: "mouseUp", x: mx + dx, y: my + dy, button: "left", clickCount: 1 }); mx += dx; my += dy; };
  const wheel = async (dy, steps = 8) => { for (let i = 0; i < steps; i++) { ev({ type: "mouseWheel", x: mx, y: my, deltaX: 0, deltaY: dy, canScroll: true }); await sleep(70); } };
  const pause = (a = 1500, b = 2800) => sleep(a + Math.random() * (b - a));
  const shot = async (n) => { fs.mkdirSync(shotDir, { recursive: true }); await wc.capturePage(); await sleep(250); fs.writeFileSync(path.join(shotDir, n + ".png"), (await wc.capturePage()).toPNG()); console.log("shot", path.join(shotDir, n + ".png")); };
  const step = (s) => { console.log("STEP", s); try { require("child_process").spawnSync("pwsh", ["-NoProfile", "-File", "C:\Users\Hhowe\Projects\Agent Team\log.ps1", "hq-os-demo", "recording: " + s]); } catch (e) {} };
  const script = require(process.env.SCRIPT || "./demo-script.js");
  await script({ meta, win, wc, run, val, W, H, move, click, drag, wheel, pause, shot, sleep, step, PROBE, getPos: () => [mx, my], tmp, root,
    // frame capture: paint events -> raw BGRA -> ffmpeg (constant 30 fps, latest frame repeated). out must end in .mp4. No audio.
    startRec: async () => {
      const [w, h] = win.getContentSize(), ff = process.env.FFMPEG; let last = null;
      rec = require("child_process").spawn(ff, ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", w + "x" + h, "-framerate", "30", "-i", "-", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
      rec.stdin.on("error", () => {});
      wc.beginFrameSubscription(false, (img) => { const sz = img.getSize(); last = sz.width === w && sz.height === h ? img.toBitmap() : img.resize({ width: w, height: h }).toBitmap(); });
      let busy = false, n = 0; const t0 = Date.now();
      tick = setInterval(() => { if (!last || busy) return; const due = Math.min(4, Math.floor((Date.now() - t0) * 30 / 1000) - n); for (let k = 0; k < due; k++) { n++; if (!rec.stdin.write(last)) { busy = true; rec.stdin.once("drain", () => (busy = false)); break; } } }, 15);
      await sleep(800); console.log("frame capture", w + "x" + h);
    },
    stopRec: async () => { clearInterval(tick); wc.endFrameSubscription(); await new Promise((r) => { rec.on("close", r); rec.stdin.end(); }); console.log("wrote", out, fs.statSync(out).size); },
  });
  await sleep(300); app.exit(0);
});
