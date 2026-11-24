// Screenshots every Nebula home shape. Hidden window, temp userData. Run: node_modules/electron/dist/electron.exe tools/shapes-shots.js <outDir>
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const out = process.argv[2] || path.join(__dirname, "shots");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-"));
const real = path.join(process.env.APPDATA, "HQ OS");
if (fs.existsSync(path.join(real, "settings.json"))) fs.cpSync(path.join(real, "settings.json"), path.join(tmp, "settings.json"));
app.setPath("userData", tmp);
BrowserWindow.prototype.show = function () {}; BrowserWindow.prototype.maximize = function () {};
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  wc.setBackgroundThrottling(false);
  wc.on("console-message", (e) => { const l = e.level; if (l === "error" || l === 3) console.log("CONSOLE", String(e.message).slice(0, 300)); });
  win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  fs.mkdirSync(out, { recursive: true });
  const shot = async (name) => { await wc.capturePage(); await sleep(300); await wc.capturePage(); await sleep(300); fs.writeFileSync(path.join(out, name), (await wc.capturePage()).toPNG()); };
  for (let i = 0; i < 80; i++) { if (await wc.executeJavaScript(`!!document.querySelector("#nebula-view.welcoming")`).catch(() => false)) break; await sleep(100); }
  await sleep(8000);
  for (const id of ["brain", "hole", "galaxy", "planet", "torus", "graph", "brain"]) {
    await wc.executeJavaScript(`document.querySelector('#nb-shapes button[data-shape="${id}"]').click()`);
    await sleep(5500);
    const st = await wc.executeJavaScript(`(()=>{const s=window.HQNebula._state;const n=s.g.graphData().nodes;return {mode:s.mode,ls:localStorage.getItem("nbMode"),nodes:n.length,pinned:n.filter(x=>x.fx!=null).length}})()`);
    console.log(id, JSON.stringify(st));
    await shot("shape-" + id + ".png");
  }
  app.exit(0);
});
