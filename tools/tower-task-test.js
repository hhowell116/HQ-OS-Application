// Tower task tab + HUD rename + render pause. Hidden window, temp userData AND temp sample projects root; the chat IPC is stubbed (no task is really sent).
// Run: node_modules/electron/dist/electron.exe tools/tower-task-test.js <outDir>
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const out = process.argv[2] || path.join(os.tmpdir(), "tw-task"), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-tt-")), root = path.join(tmp, "Projects");
require("./demo-sample.js")(root);
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ projectsRoot: root, person: "", voice: false, projects: [], last: "Atlas", music: false, audio: false, startView: "home", theme: "cyan" }));
process.env.STONKS_DIR = path.join(root, "Stocks");
app.setPath("userData", tmp);
require("../main.js");
const D = require("../data.js"), SYS = require("../system.js"); D.scanAgents = async () => []; SYS.NowPlaying.prototype.start = function () {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(2000);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents; win.setOpacity(0); win.setFocusable(false); win.showInactive(); win.setContentSize(1600, 900); win.setPosition(0, 0); wc.setBackgroundThrottling(false);
  wc.on("console-message", (e) => { if (e.level === "error" || e.level === 3) console.log("CONSOLE", String(e.message).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  const run = (js) => wc.executeJavaScript(js + "; 0").catch((e) => console.log("RUNERR", String(e.message).slice(0, 200)));
  const val = (js) => wc.executeJavaScript(js);
  const shot = async (n) => { await wc.capturePage(); await sleep(300); fs.writeFileSync(path.join(out, n + ".png"), (await wc.capturePage()).toPNG()); console.log("shot", n); };
  await sleep(2500);
  await run(`window.__sent = []; window.__twApi = Object.assign({}, window.hq, { chatNew: async (a) => ({ id: "stub1", proj: a.proj }), chatRename: async () => ({}), chatSend: async (a) => { window.__sent.push(a); return {}; } })`);
  await run(`HQView("tower")`); await sleep(1500);
  console.log("floors", await val(`JSON.stringify(HQTower.state.floors.map(f=>f.name))`)); await run(`HQTower.enter("Atlas")`); await sleep(2800); console.log("mode", await val(`HQTower.state.mode`));
  // task tab
  await run(`HQTowerChat.open(false, "task")`); await sleep(900);
  await run(`const t = document.querySelector("#twc-task-in"); t.value = "Add the elevation chart to the trail page"; document.querySelector("#twc-task-go").click()`); await sleep(700);
  console.log("TASK sent", await val(`JSON.stringify({n: window.__sent.length, proj: window.__sent[0] && window.__sent[0].id, msg: document.querySelector("#twc-task-msg").textContent, log: document.querySelectorAll(".twc-sent-it").length})`));
  await shot("tower-task-input");
  await run(`HQTowerChat.close()`); await sleep(700);
  // HUD rename (real IPC, temp root only)
  console.log("pencil visible", await val(`!document.querySelector("#tw-hrename").classList.contains("hidden")`));
  await run(`document.querySelector("#tw-hrename").click()`); await sleep(400);
  await run(`document.querySelector(".tw-ren input").value = "Atlas Prime"`);
  await shot("tower-hud-rename");
  await run(`document.querySelector(".tw-ren input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`); await sleep(1500);
  console.log("RENAME", await val(`JSON.stringify({title: document.querySelector("#tw-htitle").textContent, floor: HQTower.state.cur.name, id: HQTower.state.cur.id, proj: S.projects.map(p => p.name).join(",")})`), "folders", fs.readdirSync(root).join(","));
  await run(`HQTower.exit()`); await sleep(1800);
  // pause
  console.log("raf running", await val(`!!HQTower.state.raf`));
  await run(`document.querySelector("#tower-view").classList.add("stk-dv")`); await sleep(500);
  console.log("raf while dv", await val(`!!HQTower.state.raf`), "paused", await val(`HQTower.state.paused`));
  await run(`document.querySelector("#tower-view").classList.remove("stk-dv")`); await sleep(500);
  console.log("raf resumed", await val(`!!HQTower.state.raf`), "paused", await val(`HQTower.state.paused`));
  await run(`HQView("home")`); await sleep(500); console.log("raf hidden tower", await val(`!!HQTower.state.raf`));
  await sleep(300); app.exit(0);
});
