// Mockup screenshots of alternative war-room console layouts. Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/mock-shots.js <outDir>
// Uses a temp userData copy (settings + chats) so it never clashes with a running instance.
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const out = process.argv[2] || path.join(__dirname, "shots");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-mock-"));
const real = path.join(process.env.APPDATA, "HQ OS");
for (const n of ["settings.json", "chats"]) if (fs.existsSync(path.join(real, n))) fs.cpSync(path.join(real, n), path.join(tmp, n), { recursive: true });
app.setPath("userData", tmp);
require("../main.js");

const R = ".room-view";
const OFFS = `${R} .detail,${R} .legend{right:12px}`;
const SMALLCARD = `${R} .rleft{left:auto;right:12px;width:300px;bottom:auto}`;
const FLOAT = `${R} .comms{top:auto;bottom:16px;left:calc(50% - min(380px,27.5%));right:auto;width:min(760px,55%)}`;
const L = {
  A: ``,
  B1: OFFS + SMALLCARD + FLOAT + `${R} .comms{height:auto}${R} .comms .console{flex:none;box-shadow:0 8px 40px rgba(0,0,0,.6)}${R} .comms .log{display:none}`,
  B2: OFFS + SMALLCARD + FLOAT + `${R} .comms{height:55vh}${R} .comms .console{box-shadow:0 8px 40px rgba(0,0,0,.6)}`,
  C: OFFS + SMALLCARD + `${R} .comms{top:auto;bottom:12px;left:12px;right:12px;width:auto;height:32vh}`,
};
// make every declaration win over the app's own rules
const imp = (c) => c.replace(/([^;{}\s])\s*(?=[;}])/g, "$1 !important");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(1500);
  const win = BrowserWindow.getAllWindows()[0];
  win.setBounds({ x: 0, y: 0, width: 1600, height: 900 }); win.showInactive();
  const wc = win.webContents;
  await wc.executeJavaScript(`window.HQView("room")`);
  await sleep(4000);
  const names = { A: "War room A current", B1: "War room B1 command bar idle", B2: "War room B2 command bar open", C: "War room C bottom strip" };
  fs.mkdirSync(out, { recursive: true });
  for (const k of Object.keys(L)) {
    const key = await wc.insertCSS(imp(L[k]));
    await sleep(900);
    fs.writeFileSync(path.join(out, names[k] + ".png"), (await wc.capturePage()).toPNG());
    await wc.removeInsertedCSS(key);
  }
  app.exit(0);
});
