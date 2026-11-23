// Screenshots the real war room (unfolded + folded) at two sizes. Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/floor-shots.js <outDir>
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
  const win = BrowserWindow.getAllWindows()[0];
  win.showInactive();
  const wc = win.webContents;
  fs.mkdirSync(out, { recursive: true });
  await wc.executeJavaScript(`window.HQView("floor")`);
  win.setBounds({ x: 0, y: 0, width: 1600, height: 900 }); await sleep(3000);
  console.log(JSON.stringify(await wc.executeJavaScript(`({proj:S.cur,opts:[...document.querySelectorAll("#conv-pick option")].map(o=>o.textContent),conv:S.conv&&S.conv.id,msgs:S.conv&&S.conv.msgs&&S.conv.msgs.length,dis:/not financial advice/i.test(document.getElementById("floor-view").innerText),inDock:!!document.querySelector("#fl-chat #console")})`)));
  fs.writeFileSync(path.join(out, "trading-floor-chat.png"), (await wc.capturePage()).toPNG());
  app.exit(0);
});
