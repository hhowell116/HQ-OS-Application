// Screenshot the HQ view on a fresh start (temp user data). Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/hq-shot.js <outDir>
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const out = process.argv[2] || path.join(__dirname, "shots");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-"));
const real = path.join(process.env.APPDATA, "HQ OS");
for (const n of ["settings.json", "chats"]) if (fs.existsSync(path.join(real, n))) fs.cpSync(path.join(real, n), path.join(tmp, n), { recursive: true });
app.setPath("userData", tmp);
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(1500);
  const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.showInactive(); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  const wc = win.webContents; fs.mkdirSync(out, { recursive: true }); await sleep(2500);
  await wc.executeJavaScript(`window.HQView && window.HQView("hq")`); await sleep(1500);
  fs.writeFileSync(path.join(out, "hq-fresh.png"), (await wc.capturePage()).toPNG());
  if (process.argv[3] === "files") { await wc.executeJavaScript(`document.querySelector(".titlebar .fx-rb").click()`); await sleep(900); fs.writeFileSync(path.join(out, "hq-files.png"), (await wc.capturePage()).toPNG()); }
  app.exit(0);
});
