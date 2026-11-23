// Screenshot the lobby interior (temp user data, invisible window). Not part of the app.
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
  await sleep(1500);
  const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.showInactive(); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  const wc = win.webContents, errs = []; wc.on("console-message", (e, lvl, msg) => { if (lvl >= 3) errs.push(msg); });
  await sleep(2500);
  await wc.executeJavaScript(`HQView("tower")`); await sleep(1200);
  await wc.executeJavaScript(`HQTower.enter("__lobby")`); await sleep(3500);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "lobby.png"), (await wc.capturePage()).toPNG());
  console.log("errors:", errs.length, errs.slice(0, 3).join(" | "));
  app.exit(0);
});
