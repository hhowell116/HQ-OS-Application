// Capture the first seconds of startup to check nothing flashes before the start view. Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/boot-shots.js <outDir>
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const out = process.argv[2] || path.join(__dirname, "shots");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-"));
const real = path.join(process.env.APPDATA, "HQ OS");
if (fs.existsSync(path.join(real, "settings.json"))) fs.cpSync(path.join(real, "settings.json"), path.join(tmp, "settings.json"));
app.setPath("userData", tmp);
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let win; while (!(win = BrowserWindow.getAllWindows()[0])) await sleep(20);
  win.setOpacity(0); win.showInactive(); win.setBounds({ x: 0, y: 0, width: 1280, height: 720 });
  const wc = win.webContents, errs = []; wc.on("console-message", (e, lvl, msg) => { if (lvl >= 3) errs.push(msg); });
  fs.mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  for (const ms of [300, 700, 1200, 2500]) {
    await sleep(Math.max(0, ms - (Date.now() - t0)));
    try { const st = await wc.executeJavaScript(`[document.body.className, [...document.body.classList].filter(c=>/^in-|home|tower/.test(c)).join(" ")].join(" | ")`); console.log(ms + "ms", st); fs.writeFileSync(path.join(out, "boot-" + ms + ".png"), (await wc.capturePage()).toPNG()); } catch (e) { console.log(ms + "ms", "not ready", e.message); }
  }
  console.log("errors:", errs.length, errs.slice(0, 3).join(" | "));
  app.exit(0);
});
