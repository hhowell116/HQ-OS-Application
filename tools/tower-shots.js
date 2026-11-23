// Screenshots the TOWER (exterior with demo activity, a floor interior) and the HQ sidebar activity dot.
// Hidden window, temp userData, no dialogs. Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/tower-shots.js <outDir>
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const out = process.argv[2] || path.join(__dirname, "shots");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-"));
const real = path.join(process.env.APPDATA, "HQ OS");
for (const n of ["settings.json"]) if (fs.existsSync(path.join(real, n))) fs.cpSync(path.join(real, n), path.join(tmp, n), { recursive: true });
app.setPath("userData", tmp);
BrowserWindow.prototype.show = function () {}; BrowserWindow.prototype.maximize = function () {};
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  wc.setBackgroundThrottling(false);
  wc.on("console-message", (e) => { const l = e.level, m = e.message; if (l === "error" || l === 3 || l === "warning") console.log("CONSOLE", l, String(m).slice(0, 300)); });
  win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  fs.mkdirSync(out, { recursive: true });
  const run = (js) => wc.executeJavaScript(js);
  const shot = async (name) => { await wc.capturePage(); await sleep(400); await wc.capturePage(); await sleep(400); fs.writeFileSync(path.join(out, name), (await wc.capturePage()).toPNG()); console.log("saved", name); };
  await sleep(2500);
  await run(`window.HQView("tower")`); await sleep(2500);
  console.log("floors", JSON.stringify(await run(`HQTower.summary()`)));
  await run(`HQTower.setAz(0.55)`);
  await shot("tower-exterior-idle.png");
  await run(`HQTower.demo(true)`); await sleep(2500);
  console.log("floors", JSON.stringify(await run(`HQTower.summary()`)));
  await shot("tower-live-exterior.png");
  await run(`HQTower.enter("Lumen")`); await sleep(500); await shot("tower-flight.png"); await sleep(2200);
  await shot("tower-live-floor.png");
  await run(`HQTower.exit()`); await sleep(1800);
  await run(`window.HQView("hq")`); await sleep(1200);
  await shot("hq-active-dot.png");
  app.exit(0);
});
