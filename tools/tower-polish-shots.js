// Tower polish shots: exterior, floors, deck, lobby, stonks, chat terminal. Hidden window (opacity 0), temp userData, no dialogs.
// Run: node_modules/electron/dist/electron.exe tools/tower-polish-shots.js <outDir> [prefix] [steps]
// steps (comma list, default all): ext,floor,deck,lobby,stonks,term,home,hq
const { app, BrowserWindow, dialog, nativeImage } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const out = process.argv[2] || path.join(__dirname, "shots"), pre = process.argv[3] || "p", steps = (process.argv[4] || "ext,floor,deck,lobby,stonks,term,home,hq").split(",");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-"));
const real = path.join(process.env.APPDATA, "HQ OS");
for (const n of ["settings.json"]) if (fs.existsSync(path.join(real, n))) fs.cpSync(path.join(real, n), path.join(tmp, n), { recursive: true });
app.setPath("userData", tmp);
BrowserWindow.prototype.show = function () {}; BrowserWindow.prototype.maximize = function () {};
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  win.setOpacity(0); wc.setBackgroundThrottling(false);
  wc.on("console-message", (e) => { const l = e.level, m = e.message; if (l === "error" || l === 3 || l === "warning") console.log("CONSOLE", l, String(m).slice(0, 300)); });
  win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  fs.mkdirSync(out, { recursive: true });
  const run = (js) => wc.executeJavaScript(js);
  const key = async (k) => { await run(`document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:${JSON.stringify(k)},bubbles:true,cancelable:true}))`); await sleep(450); };
  const shot = async (name, crop) => { await wc.capturePage(); await sleep(400); let img = await wc.capturePage(); if (crop) { img = img.crop(crop.r); if (crop.z) img = img.resize({ width: crop.r.width * crop.z, quality: "best" }); } fs.writeFileSync(path.join(out, pre + "-" + name), img.toPNG()); console.log("saved", pre + "-" + name); };
  const has = (s) => steps.includes(s);
  await sleep(2500);
  await run(`window.HQView("tower")`); await sleep(2200);
  if (has("ext")) {
    await run(`HQTower.setAz(0.55)`); await sleep(600);
    await shot("ext.png"); await shot("ext-crop.png", { r: { x: 560, y: 200, width: 400, height: 300 }, z: 3 });
  }
  const names = await run(`JSON.stringify(HQTower.summary().floors.map(f=>f.name))`); console.log("floors", names);
  if (has("floor")) {
    await run(`HQTower.demo(true)`);
    for (const n of JSON.parse(names).filter((x) => x !== "LOBBY" && x !== "COMMAND DECK")) {
      await run(`HQTower.enter(${JSON.stringify(n)})`); await sleep(2800); await shot("floor-" + n.replace(/\W+/g, "_") + ".png");
      if (n === "Lumen" || n === "HQ OS") await shot("floor-crop-" + n.replace(/\W+/g, "_") + ".png", { r: { x: 500, y: 150, width: 400, height: 300 }, z: 3 });
      await run(`HQTower.exit()`); await sleep(1700);
    }
  }
  if (has("deck")) { await run(`HQTower.enter("COMMAND DECK")`); await sleep(2800); await shot("deck.png"); await run(`HQTower.exit()`); await sleep(1700); }
  if (has("lobby")) { await run(`HQTower.enter("LOBBY")`); await sleep(2800); await shot("lobby.png"); await run(`HQTower.exit()`); await sleep(1700); }
  if (has("stonks")) {
    await run(`HQTower.enter("Stocks")`); await sleep(3500); await shot("stonks.png");
    const dv = await run(`(()=>{try{HQFloor.dataView(true);return "dv"}catch(e){return String(e)}})()`); console.log(dv); await sleep(1800); await shot("stonks-dv.png");
    await key("Escape"); await sleep(1200); await key("Escape"); await sleep(1800);
  }
  if (has("term")) {
    await run(`HQTower.demo(true)`);
    for (const n of (process.argv[5] || "Lumen,COMMAND DECK,Stocks").split(",")) {
      await run(`HQTower.enter(${JSON.stringify(n)})`); await sleep(3200); console.log("state", n, await run(`JSON.stringify({m: HQTower.state.mode, f: !!HQTower.state.flight, c: HQTower.state.cur && HQTower.state.cur.name})`)); await shot("term-" + n.replace(/\W+/g, "_") + ".png");
      const px = await run(`JSON.stringify(HQTower.termXY())`); console.log("termXY", n, px);
      const p = JSON.parse(px);
      if (p) {
        wc.sendInputEvent({ type: "mouseMove", x: Math.round(p.x), y: Math.round(p.y) }); await sleep(300);
        wc.sendInputEvent({ type: "mouseDown", x: Math.round(p.x), y: Math.round(p.y), button: "left", clickCount: 1 }); wc.sendInputEvent({ type: "mouseUp", x: Math.round(p.x), y: Math.round(p.y), button: "left", clickCount: 1 });
        await sleep(450); await shot("term-push-" + n.replace(/\W+/g, "_") + ".png"); await sleep(3200); await shot("term-open-" + n.replace(/\W+/g, "_") + ".png");
        console.log("open?", await run(`HQTowerChat.isOpen()`), "xy", await run(`JSON.stringify(HQTower.termXY())`), "focus", await run(`JSON.stringify(HQTower.state.focus)`), "fk", await run(`HQTower.state.fk`));
        await run(`HQTowerChat.close(); 0`); await sleep(2500); await shot("term-closed-" + n.replace(/W+/g, "_") + ".png"); console.log("closed?", await run(`HQTowerChat.isOpen()`), "mode", await run(`HQTower.state.mode`));
      }
      await run(`HQTower.exit()`); await sleep(5000);
    }
  }
  if (has("home")) { await run(`window.HQView("home")`); await sleep(2500); await shot("home.png"); }
  if (has("hq")) { await run(`window.HQView("hq")`); await sleep(1500); await shot("hq.png"); }
  app.exit(0);
});
