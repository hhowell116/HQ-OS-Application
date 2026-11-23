// Shots of every project floor pinned to N desks (default 10) to check the chat terminal clears the desks. Hidden window, temp userData.
// Run: node_modules/electron/dist/electron.exe tools/desk10-shots.js <outDir> [prefix] [n]
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const out = process.argv[2] || path.join(__dirname, "shots"), pre = process.argv[3] || "d", N = +(process.argv[4] || 10);
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
  fs.mkdirSync(out, { recursive: true });
  const run = (js) => wc.executeJavaScript(js);
  const shot = async (name) => { await wc.capturePage(); await sleep(300); fs.writeFileSync(path.join(out, pre + "-" + name + ".png"), (await wc.capturePage()).toPNG()); console.log("saved", name); };
  await sleep(2500);
  await run(`HQView("tower")`); await sleep(1500);
  await run(`HQTower.demo(true)`); await sleep(1500);
  const floors = JSON.parse(await run(`JSON.stringify(HQTower.state.floors.map(f=>[f.name,f.kind,!!f.stonks,f.w]))`));
  console.log("floors", JSON.stringify(floors));
  for (const [name, kind, stonks, w] of floors) {
    if (kind === "lobby" || stonks || kind === "deck") continue;
    await run(`HQTower.state.interior ? HQTower.hop(${JSON.stringify(name)}) : HQTower.enter(${JSON.stringify(name)})`); await sleep(3000);
    await run(`HQTower.debugDesks(${N})`); await sleep(900);
    console.log("floor", name, "w", w, "hw", await run(`HQTower.state.interior && HQTower.state.interior.hw`));
    await shot(name.replace(/\W+/g, "_"));
  }
  app.exit(0);
});
