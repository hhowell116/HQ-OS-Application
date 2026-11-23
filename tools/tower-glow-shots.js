// Lobby (normal + door hover) and Stocks floor (inside + exterior) screenshots. Hidden window, temp userData.
// Run: node_modules/electron/dist/electron.exe tools/tower-glow-shots.js <outDir>
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
  wc.on("console-message", (e) => { const l = e.level; if (l === "error" || l === 3 || l === "warning") console.log("CONSOLE", l, String(e.message).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  const run = (js) => wc.executeJavaScript(js);
  const shot = async (name) => { await wc.capturePage(); await sleep(300); fs.writeFileSync(path.join(out, name), (await wc.capturePage()).toPNG()); console.log("saved", name); };
  await sleep(2500);
  await run(`window.HQView("tower")`); await sleep(1500);
  await run(`HQTower.demo(true)`); await sleep(2000);
  console.log("floors", await run(`JSON.stringify(HQTower.state.floors.map(f=>[f.name,"#"+f.color.getHexString()]))`));
  await run(`HQTower.enter("LOBBY")`); await sleep(2800); await shot("tower-lobby.png");
  let hit = null; for (let x = 1100; x < 1260 && !hit; x += 20) for (const y of [380, 420, 460, 500]) { wc.sendInputEvent({ type: "mouseMove", x, y }); await sleep(80); if (await run(`[...document.querySelectorAll("canvas")].some(c=>c.style.cursor==="pointer")`)) { hit = [x, y]; break; } }
  console.log("hover at", JSON.stringify(hit)); await sleep(700); await shot("tower-lobby-door-hover.png");
  wc.sendInputEvent({ type: "mouseMove", x: 800, y: 850 });
  await run(`HQTower.exit()`); await sleep(1800);
  const sn = await run(`(HQTower.state.floors.find(f=>f.stonks)||{}).name||""`); console.log("stonks", sn);
  await shot("tower-exterior.png");
  if (sn) { await run(`HQTower.enter(${JSON.stringify(sn)})`); await sleep(2800); await shot("tower-trading-floor.png"); }
  wc.sendInputEvent({ type: "keyDown", keyCode: "/" }); wc.sendInputEvent({ type: "char", keyCode: "/" }); wc.sendInputEvent({ type: "keyUp", keyCode: "/" }); await sleep(1500);
  console.log("slash", await run(`(document.getElementById("tw-chat")||{}).className + " | active=" + (document.activeElement && document.activeElement.id) + " | val=" + (document.getElementById("input")||{}).value`));
  app.exit(0);
});
