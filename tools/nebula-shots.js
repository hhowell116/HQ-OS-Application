// Screenshots the Nebula tab (plain + node selected) in a separate Electron with a temp userData. Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/nebula-shots.js <outDir>
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const out = process.argv[2] || path.join(__dirname, "shots");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-"));
const real = path.join(process.env.APPDATA, "HQ OS");
for (const n of ["settings.json"]) if (fs.existsSync(path.join(real, n))) fs.cpSync(path.join(real, n), path.join(tmp, n), { recursive: true });
app.setPath("userData", tmp);
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(1500);
  const win = BrowserWindow.getAllWindows()[0];
  const wc = win.webContents;
  wc.on("console-message", (e) => { const l = e.level, m = e.message; if (l === "error" || l === 3 || l === "warning") console.log("CONSOLE", l, String(m).slice(0, 300)); });
  win.showInactive();
  fs.mkdirSync(out, { recursive: true });
  if (win.isMaximized()) win.unmaximize(); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  await sleep(800);
  await wc.executeJavaScript(`window.HQView("nebula")`);
  await sleep(9000);
  console.log("state", JSON.stringify(await wc.executeJavaScript(`(()=>{const s=window.HQNebula._state;const d=s.data||{};const gd=s.g?s.g.graphData():{nodes:[],links:[]};return {err:d.err||null,nodes:(d.nodes||[]).length,links:(d.links||[]).length,ghosts:(d.nodes||[]).filter(n=>n.kind==="ghost").length,wikiLinks:(d.links||[]).filter(l=>l.type==="link").length,shown:gd.nodes.length,count:document.getElementById("nb-count").textContent,win:[innerWidth,innerHeight]}})()`)));
  fs.writeFileSync(path.join(out, "nebula.png"), (await wc.capturePage()).toPNG());
  const pick = await wc.executeJavaScript(`(()=>{const s=window.HQNebula._state;const d=s.data.nodes.filter(n=>n.kind==="note").sort((a,b)=>b.deg-a.deg)[0];window.HQNebula.select(d.id);return d.name})()`);
  console.log("selected", pick);
  await sleep(3000);
  fs.writeFileSync(path.join(out, "nebula-selected.png"), (await wc.capturePage()).toPNG());
  await wc.executeJavaScript(`window.HQView("hq")`);
  await sleep(500);
  console.log("paused ok");
  app.exit(0);
});
