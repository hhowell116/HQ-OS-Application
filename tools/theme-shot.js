// Screenshot the album theme with a synthetic cover (red/orange). Not part of the app.
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
  const win = BrowserWindow.getAllWindows()[0]; win.showInactive(); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  const wc = win.webContents; fs.mkdirSync(out, { recursive: true }); await sleep(2000);
  await wc.executeJavaScript(`(async()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,64,64);g.addColorStop(0,'#c0262d');g.addColorStop(.6,'#7a1218');g.addColorStop(1,'#f2a33a');x.fillStyle=g;x.fillRect(0,0,64,64);HQTheme.apply('music');await HQTheme.setMusic(c.toDataURL());})()`);
  await sleep(1500); fs.writeFileSync(path.join(out, "theme-hq.png"), (await wc.capturePage()).toPNG());
  await wc.executeJavaScript(`window.HQView("tower")`); await sleep(2000); fs.writeFileSync(path.join(out, "theme-room.png"), (await wc.capturePage()).toPNG());
  app.exit(0);
});
