// Stocks floor DATA VIEW: click the 3D wall button, shoot mid-transition, the data view, and back in desk view. Hidden window, temp userData.
// Run: node_modules/electron/dist/electron.exe tools/stocks-dataview-shots.js <outDir>
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const out = process.argv[2] || path.join(__dirname, "shots");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-dv-"));
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
  const shot = async (name) => { await wc.capturePage(); await sleep(250); fs.writeFileSync(path.join(out, name), (await wc.capturePage()).toPNG()); console.log("saved", name); };
  await sleep(2500);
  await run(`window.HQView("tower")`); await sleep(1500);
  await run(`HQTower.go("stonks")`); await sleep(3800);
  const state = () => run(`(() => { const t = document.getElementById("tw-stonks"); return t.className + " | dv=" + HQFloor.dv() + " | focus=" + !!HQTower.state.focus + " | ss=" + sessionStorage.getItem("hqStocksDV") + " | agents=" + document.querySelectorAll(".fl-agstrip .dvag").length + " | ctrls=" + ["fl-go","fl-score","fl-kill","fl-resume","fl-pill","fl-banner","fl-drawer","fl-range","fl-play","fl-view"].filter(i => document.getElementById(i)).length + "/10 | chat=" + !!document.querySelector("#tw-chat, .tw-chatbtn, [id*=chat]"); })()`);
  console.log("desk0", await state()); await shot("tower-stocks-desk.png");
  // project the wall button to screen and click it with real pointer events (raycast path)
  const pt = await run(`(() => { const I = HQTower.state.interior, S = I.stonks, m = S.dvBtn.m, v = m.getWorldPosition(new (m.position.constructor)()); v.project(S.cam); const b = S.cv.getBoundingClientRect(); return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height, w: b.width, h: b.height }; })()`);
  const z = wc.getZoomFactor(); pt.x *= z; pt.y *= z; console.log("btn px", JSON.stringify(pt), "zoom", z);
  wc.sendInputEvent({ type: "mouseMove", x: Math.round(pt.x), y: Math.round(pt.y) }); await sleep(500);
  console.log("hover cursor", await run(`HQTower.state.interior.stonks.hov + " | " + HQTower.state.interior.stonks.cv.style.cursor`)); await shot("dv-hover.png");
  wc.sendInputEvent({ type: "mouseDown", x: Math.round(pt.x), y: Math.round(pt.y), button: "left", clickCount: 1 }); wc.sendInputEvent({ type: "mouseUp", x: Math.round(pt.x), y: Math.round(pt.y), button: "left", clickCount: 1 });
  await sleep(700); await shot("dv-mid-push.png");
  await sleep(380); await shot("dv-mid-fade.png");
  await sleep(1500); await run(`(document.querySelector("#fl-alerts .fl-fold")||{click(){}}).click()`); await sleep(300); console.log("dv", await state()); await shot("tower-stocks-dataview.png");
  if (process.env.DV_SAMPLE) { await run(`HQFloor.preview([{action:"BUY",ticker:"NVDA",strategy:"Scanner",px:125.5,chg:2.1,confidence:78,thesis:"Breakout above resistance on 1.8x volume, analysts raised targets after the earnings beat and sentiment is turning positive",plan:{shares:2,entry:125.5,stop:118,t1:140}},{action:"SELL",ticker:"HUT",strategy:"Steady",px:45.9,chg:-3.4,confidence:64,thesis:"Momentum failure, closed under the 20 day average",plan:{shares:1,entry:45,stop:40,t1:60}},{action:"WATCH",ticker:"AAPL",strategy:"Mirror",px:210,chg:0.3,confidence:52,thesis:"Interesting setup, waiting for confirmation on volume",vetoWhy:[]}], null)`); await sleep(500); await shot("dv-sample.png"); }
  // chat button + escape
  console.log("chatbtn", await run(`[...document.querySelectorAll(".tw-bar button")].map(b => b.id + ":" + b.textContent.trim().slice(0, 12)).join(" ")`));
  await run(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); 0`); await sleep(1800);
  console.log("after esc", await state()); await shot("dv-back-desk.png");
  // remembered across leaving and returning
  await run(`HQFloor.dataView(true)`); await sleep(2200); console.log("re-enter", await state());
  await run(`HQTower.exit()`); await sleep(2200); console.log("exited", await run(`HQTower.state.mode + " dv=" + HQFloor.dv() + " focus=" + !!HQTower.state.focus`));
  await run(`HQTower.go("stonks")`); await sleep(4200); console.log("restored", await state()); await shot("dv-restored.png");
  app.exit(0);
});
