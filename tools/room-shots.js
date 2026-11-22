// Screenshots the real war room (unfolded + folded) at two sizes. Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/room-shots.js <outDir>
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
  await wc.executeJavaScript(`window.HQView("room")`);
  for (const [w, h] of [[1600, 900], [1280, 720]]) {
    if (win.isMaximized()) win.unmaximize(); win.setBounds({ x: 0, y: 0, width: w, height: h }); await sleep(2500); console.log("size", JSON.stringify(await wc.executeJavaScript("[innerWidth,innerHeight,devicePixelRatio]")));
    for (const fold of [false, true]) {
      await wc.executeJavaScript(`(()=>{const b=document.querySelector('.fold[data-fold="room-comms"]'),c=document.getElementById('room-comms');if(c.classList.contains('folded')!==${fold})b.click();})()`);
      await sleep(1200);
      fs.writeFileSync(path.join(out, `room-${w}${fold ? "-folded" : ""}.png`), (await wc.capturePage()).toPNG());
    }
  }
  app.exit(0);
});
