// Screenshots the TOWER command deck + lobby interiors (demo activity), hop + enter-door checks, and the other views still opening.
// Hidden (opacity 0) window, temp userData, no dialogs. Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/tower-interiors-shots.js <outDir>
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
  const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.showInactive(); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  const wc = win.webContents; wc.setBackgroundThrottling(false);
  wc.on("console-message", (e) => { const l = e.level, m = e.message; if (l === "error" || l === 3 || l === "warning") console.log("CONSOLE", l, String(m).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  const run = (js) => wc.executeJavaScript(js);
  const shot = async (name) => { await wc.capturePage(); await sleep(300); fs.writeFileSync(path.join(out, name), (await wc.capturePage()).toPNG()); console.log("saved", name); };
  await sleep(2500);
  const views = {};
  for (const v of ["home", "hq", "floor", "tower"]) { await run(`window.HQView("${v}")`); await sleep(1200); views[v] = await run(`[...document.body.classList].join(" ")`); }
  console.log("views", JSON.stringify(views));
  await run(`HQTower.demo(true)`); await sleep(2000);
  await run(`HQTower.enter("COMMAND DECK")`); await sleep(2600); await shot("tower-command-deck.png");
  console.log("deck", await run(`document.getElementById("tw-feed").innerText.slice(0,300) + " | " + document.getElementById("tw-htitle").textContent + " | " + document.getElementById("tw-hstat").textContent`));
  await run(`HQTower.exit()`); await sleep(1800);
  await run(`HQTower.enter("LOBBY")`); await sleep(2600); await shot("tower-lobby.png");
  console.log("lobby", await run(`document.getElementById("tw-htitle").textContent + " | " + document.getElementById("tw-hstat").textContent`));
  await run(`HQTower.hop && HQTower.hop("Lumen")`); await sleep(900); await shot("tower-hop.png"); await sleep(1400);
  console.log("after hop", await run(`document.getElementById("tw-htitle").textContent`));
  await run(`HQTower.exit()`); await sleep(1800);
  await run(`HQTower.enter("LOBBY")`); await sleep(2400);
  await run(`HQTower.enterHQ()`); await sleep(900); await shot("tower-enter.png"); await sleep(1400);
  console.log("after enter", await run(`[...document.body.classList].join(" ")`));
  app.exit(0);
});
