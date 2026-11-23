// HQ OS walkthrough recorder. Runs the app on SAMPLE data (temp folder, temp userData, never the real notes),
// fullscreen and visible, records the screen (VIDEO ONLY, so no stray system audio) via getDisplayMedia/MediaRecorder, writes a webm
// plus <out>.json with the time the sample track started; tools/demo-mix.js adds the sample track in post.
// Run: node_modules/electron/dist/electron.exe tools/demo-record.js <out.webm>      (PROBE=1 -> screenshots only, no recording)
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const PROBE = !!process.env.PROBE, out = process.argv[2] || path.join(os.tmpdir(), "hqos-demo.webm");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-demo-")), root = path.join(tmp, "Projects");
require("./demo-sample.js")(root);
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ projectsRoot: root, person: "Sam", voice: false, projects: [], last: "Atlas", music: true, audio: true, startView: "home", theme: "cyan" }));
process.env.STONKS_DIR = path.join(root, "Stocks");
app.setPath("userData", tmp);
require("../main.js");
const D = require("../data.js"), SYS = require("../system.js"); D.scanAgents = async () => []; SYS.NowPlaying.prototype.start = function () {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const meta = {};
const shotDir = path.join(tmp, "shots");
app.whenReady().then(async () => {
  await sleep(2000);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents; wc.setBackgroundThrottling(false);
  win.setFullScreen(true); win.show(); win.focus(); await sleep(2000);
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
    startRec: async () => { await run(`(async()=>{const st=await navigator.mediaDevices.getDisplayMedia({audio:true,video:{frameRate:30}});const rec=new MediaRecorder(new MediaStream(st.getVideoTracks()),{mimeType:"video/webm;codecs=vp9,opus",videoBitsPerSecond:6e6});window.__chunks=[];rec.ondataavailable=e=>e.data.size&&window.__chunks.push(e.data);rec.start(1000);window.__rec=rec;window.__st=st;window.__hasAudio=st.getAudioTracks().length;})()`); await sleep(1500); meta.recStart = Date.now(); console.log("video-only capture (system audio dropped); mixed in post"); },
    stopRec: async () => { await val(`new Promise(r=>{window.__rec.onstop=r;window.__rec.stop();window.__st.getTracks().forEach(t=>t.stop())})`); const n = await val("window.__chunks.length"); const fd = fs.openSync(out, "w"); for (let i = 0; i < n; i++) { const b64 = await val(`(async()=>{const b=await window.__chunks[${i}].arrayBuffer();let s="";const u=new Uint8Array(b);for(let k=0;k<u.length;k+=32768)s+=String.fromCharCode.apply(null,u.subarray(k,k+32768));return btoa(s)})()`); fs.writeSync(fd, Buffer.from(b64, "base64")); } fs.closeSync(fd); fs.writeFileSync(out + ".json", JSON.stringify(meta)); console.log("wrote", out, fs.statSync(out).size); },
  });
  win.setFullScreen(false); await sleep(500); app.exit(0);
});
