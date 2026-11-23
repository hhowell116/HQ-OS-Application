// Screenshots the Stonks floor inside the tower (3D room + HUD panels), the lit exterior, lobby and command deck, plus view sanity checks.
// Hidden (opacity 0) window, temp userData, no dialogs. Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/stonks-floor-shots.js <outDir>
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
  for (const v of ["home", "hq", "tower"]) { await run(`window.HQView("${v}")`); await sleep(1200); console.log("view", v, await run(`[...document.body.classList].join(" ")`)); }
  console.log("tabs", await run(`[...document.querySelectorAll("#tabs button")].map(b=>b.textContent).join(",")`), "| cards", await run(`[...document.querySelectorAll(".hm-card .hm-n")].map(b=>b.textContent).join(",")`));
  await sleep(1000); await shot("tower-exterior.png");
  // exterior lit by engine run state
  await run(`window.__r = HQFloor.running; HQFloor.running = () => true; 0`); await sleep(3500); await shot("tower-exterior-stonks-lit.png");
  console.log("lit floors", await run(`HQTower.state.floors.filter(f=>f.n>0).map(f=>f.name).join(",")`));
  await run(`HQFloor.running = window.__r; 0`);
  await run(`HQTower.go("stonks")`); await sleep(3200); await shot("tower-trading-floor.png");
  console.log("stonks", await run(`document.getElementById("tw-stonks").className + " | members " + (HQTower.state.interior ? HQTower.state.interior.members.size : -1) + " | alerts " + document.querySelectorAll("#fl-alerts .fl-card").length + " | log " + document.querySelectorAll("#fl-log .ln").length + " | eq " + document.getElementById("fl-eq").textContent + " | pill " + document.getElementById("fl-pill").textContent + " | resume hidden " + document.getElementById("fl-resume").classList.contains("hidden") + " | kill " + !!document.getElementById("fl-kill") + " | working " + [...HQTower.state.interior.members.values()].filter(o=>o.working).length`));
  if (process.env.SHOT_LIVE) { await run(`document.getElementById("fl-live").click()`); await sleep(500); }
  await run(`HQTower.exit()`); await sleep(1800);
  console.log("after exit", await run(`document.getElementById("tw-stonks").className + " | " + HQTower.state.mode`));
  await run(`HQTower.demo(true)`); await sleep(1500);
  await run(`HQTower.enter("COMMAND DECK")`); await sleep(2800); await shot("tower-command-deck.png");
  await run(`HQTower.exit()`); await sleep(1800);
  await run(`HQTower.enter("LOBBY")`); await sleep(2800); await shot("tower-lobby.png");
  await run(`HQTower.hop("Lumen")`); await sleep(2600); console.log("hop", await run(`document.getElementById("tw-htitle").textContent`));
  await run(`HQTower.go("stonks")`); await sleep(2600); console.log("hop-stonks", await run(`document.getElementById("tw-stonks").classList.contains("show")`));
  await run(`HQTower.exit()`); await sleep(1800);
  await run(`window.HQView("hq")`); await sleep(600);
  await run(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"F4"}))`); await sleep(3200);
  console.log("F4", await run(`document.body.classList.contains("in-tower") + " " + document.getElementById("tw-stonks").classList.contains("show")`));
  app.exit(0);
});
