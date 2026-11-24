// dev-only: PAPER and LIVE tab screenshots (LIVE uses the real read-only account snapshot; a fake BUY card is injected in memory to show Approve). Not part of the app.
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const out = process.argv[2];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-")); const real = path.join(process.env.APPDATA, "HQ OS");
for (const n of ["settings.json", "chats"]) if (fs.existsSync(path.join(real, n))) fs.cpSync(path.join(real, n), path.join(tmp, n), { recursive: true });
app.setPath("userData", tmp); require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(1500); const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.showInactive(); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  const wc = win.webContents; await sleep(2500);
  wc.on("console-message", (e, l, m) => { if (l >= 2) console.log("CONSOLE", m); });
  await wc.executeJavaScript(`window.HQView && window.HQView("tower")`); await sleep(2500);
  await wc.executeJavaScript(`HQTower.go("stonks")`); await sleep(9000);
  await wc.executeJavaScript(`(() => { const b = document.querySelector("#fl-play"); if (b && b.textContent === "PAUSE") b.click(); window.confirm = () => true; })()`); await sleep(1500);
  fs.writeFileSync(path.join(out, "stocks-tabs-paper.png"), (await wc.capturePage()).toPNG());
  await wc.executeJavaScript(`document.querySelector("#fl-vtabs .vt-l").click()`); await sleep(9000);
  fs.writeFileSync(path.join(out, "stocks-tabs-live.png"), (await wc.capturePage()).toPNG());
  app.exit(0);
});
