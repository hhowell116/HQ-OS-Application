// Verifies chat terminal items: Esc closes, Stocks data-view chat, busy glow, every floor screenshot. Hidden window, temp userData, sends no messages.
// Run: node_modules/electron/dist/electron.exe tools/tower-verify.js <outDir> [prefix]
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const out = process.argv[2] || path.join(__dirname, "shots"), pre = process.argv[3] || "v";
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
  wc.on("console-message", (e) => { const l = e.level; if (l === "error" || l === 3) console.log("CONSOLE", l, String(e.message).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  const run = (js) => wc.executeJavaScript(js);
  const key = async (k, mods) => { wc.sendInputEvent({ type: "keyDown", keyCode: k, modifiers: mods || [] }); wc.sendInputEvent({ type: "keyUp", keyCode: k, modifiers: mods || [] }); await sleep(500); };
  const shot = async (name) => { await wc.capturePage(); await sleep(300); fs.writeFileSync(path.join(out, pre + "-" + name + ".png"), (await wc.capturePage()).toPNG()); console.log("saved", name); };
  const st = () => run(`JSON.stringify({open: HQTowerChat.isOpen(), mode: HQTower.state.mode})`);
  await sleep(2500);
  await run(`HQView("tower")`); await sleep(1500);
  await run(`HQTower.demo(true)`); await sleep(1500);
  const floors = JSON.parse(await run(`JSON.stringify(HQTower.state.floors.map(f=>[f.name,f.kind,!!f.stonks]))`));
  console.log("floors", JSON.stringify(floors));
  // (a) Esc closes chat on a project floor
  await run(`HQTower.enter("Lumen")`); await sleep(2800);
  await key("c"); await sleep(600); console.log("A open", await st());
  await key("Escape"); await sleep(400); console.log("A after Esc", await st());
  // (c) busy glow: force busy on the terminal, compare screenshots
  await shot("lumen-idle");
  await run(`(() => { const t = HQTower.term(); window.__bz = setInterval(() => { t.busy = true; t.sig = ""; }, 100); 0 })()`); await sleep(900);
  await shot("lumen-busy");
  console.log("C term busy", await run(`HQTower.term().busy`));
  await run(`clearInterval(window.__bz); 0`);
  // (d) every floor
  for (const [name, kind, stonks] of floors) {
    if (kind === "lobby" || stonks) continue;
    await run(`HQTower.hop(${JSON.stringify(name)})`); await sleep(2300);
    console.log("floor", name, "agents", await run(`HQTower.state.cur && HQTower.state.cur.n`), "desks", await run(`(HQTower.state.interior||{}).nDesks`));
    await shot("floor-" + name.replace(/\W+/g, "_"));
  }
  await run(`HQTower.hop("LOBBY")`); await sleep(2300); await shot("floor-lobby");
  await run(`HQTower.exit()`); await sleep(1800);
  // (b) stocks data view chat
  const sn = (floors.find((f) => f[2]) || [])[0];
  if (sn) {
    await run(`HQTower.enter(${JSON.stringify(sn)})`); await sleep(3200); await shot("stonks");
    await run(`HQFloor.dataView(true)`); await sleep(1200);
    console.log("B dv", await run(`HQFloor.dv()`));
    await run(`document.getElementById("fl-chat").click()`); await sleep(1000); console.log("B chat click", await st());
    await shot("stonks-dataview-chat");
    await key("Escape"); console.log("B esc", await st(), await run(`HQFloor.dv()`));
    await run(`HQTowerChat.close(); 0`);
  }
  app.exit(0);
});
