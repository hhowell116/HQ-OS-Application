// Nebula labels + open-file + explorer drawer screenshots. Hidden window, temp userData.
// Run: node_modules/electron/dist/electron.exe tools/fx-neb-shots.js <outDir>
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
  win.setOpacity(0); wc.setBackgroundThrottling(false); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  fs.mkdirSync(out, { recursive: true });
  const run = (js) => wc.executeJavaScript(js);
  const shot = async (n) => { await wc.capturePage(); await sleep(400); fs.writeFileSync(path.join(out, n + ".png"), (await wc.capturePage()).toPNG()); console.log("shot", n); };
  for (let i = 0; i < 80; i++) { if (await run(`!!document.querySelector("#nebula-view.welcoming")`).catch(() => false)) break; await sleep(100); }
  await sleep(9000);
  await run(`document.head.append(Object.assign(document.createElement("style"),{textContent:"#fx-panel,.layout{transition:none!important}"}))`);
  await shot("fxn-1-home-zoomedout"); console.log(await run(`(()=>{try{const s=HQNebula._state;const o=[...s.objs.values()].filter(o=>o.lab)[0];return JSON.stringify({n:s.objs.size,x:o.n.x,t:o.lab.style.transform,d:o.lab.style.display,W:document.querySelector("#nb-stage").clientWidth})}catch(e){return e.message}})()`));
  await run(`document.querySelector(".titlebar .fx-rb").click()`); await sleep(1200);
  await shot("fxn-2-home-explorer"); console.log(await run(`JSON.stringify({e:(document.elementFromPoint(100,300)||{}).id+"/"+(document.elementFromPoint(100,300)||{}).className,z:getComputedStyle(document.querySelector("#fx-panel")).zIndex+" "+getComputedStyle(document.querySelector("#fx-panel")).transform,c:document.body.className,r:document.querySelector("#fx-panel").getBoundingClientRect(),cs:getComputedStyle(document.querySelector("#fx-panel")).display+" "+getComputedStyle(document.querySelector("#fx-panel")).opacity,btn:!!document.querySelector(".titlebar .fx-rb")})`));
  await run(`document.querySelector(".titlebar .fx-rb").click()`); await sleep(600);
  const rules = await run(`(()=>{const n=HQNebula._state.g.graphData().nodes.find(n=>n.kind==="core");return n&&n.id})()`);
  await run(`HQNebula.select(${JSON.stringify(rules)})`); await sleep(2800);
  await shot("fxn-3-rules-focused");
  console.log("labels", await run(`document.querySelectorAll(".nb-lab").length`));
  // open file from panel
  const note = await run(`(()=>{const n=HQNebula._state.g.graphData().nodes.find(n=>n.kind==="note"&&/\.md$/i.test(n.path||""));return n&&n.id})()`);
  await run(`HQNebula.select(${JSON.stringify(note)})`); await sleep(2500);
  await run(`document.querySelector(".nb-view").click()`); await sleep(1200);
  await shot("fxn-4-file-from-nebula");
  await run(`document.querySelector("#fx-rc").click()`); await sleep(300);
  await run(`HQView("tower")`); await sleep(2500);
  await shot("fxn-5-tower-button");
  await run(`document.querySelector(".titlebar .fx-rb").click()`); await sleep(1200);
  await shot("fxn-6-tower-explorer");
  await run(`document.querySelector(".titlebar .fx-rb").click()`); await sleep(300);
  app.exit(0);
});
