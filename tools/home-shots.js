// Screenshots the HOME screen (welcome, cards) and the Nebula in brain mode. Hidden window, temp userData, no dialogs. Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/home-shots.js <outDir>
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const out = process.argv[2] || path.join(__dirname, "shots");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-"));
const real = path.join(process.env.APPDATA, "HQ OS");
for (const n of ["settings.json"]) if (fs.existsSync(path.join(real, n))) fs.cpSync(path.join(real, n), path.join(tmp, n), { recursive: true });
app.setPath("userData", tmp);
// keep the window hidden: main.js calls maximize()/show() on ready-to-show
BrowserWindow.prototype.show = function () {}; BrowserWindow.prototype.maximize = function () {};
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  const wc = win.webContents;
  wc.setBackgroundThrottling(false);
  wc.on("console-message", (e) => { const l = e.level, m = e.message; if (l === "error" || l === 3 || l === "warning") console.log("CONSOLE", l, String(m).slice(0, 300)); });
  win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  fs.mkdirSync(out, { recursive: true });
  const shot = async (name) => { await wc.capturePage(); await sleep(300); await wc.capturePage(); await sleep(300); fs.writeFileSync(path.join(out, name), (await wc.capturePage()).toPNG()); };
  // wait for the boot welcome (fresh session has no saved view, so it starts on home with the welcome)
  const t0 = Date.now();
  for (let i = 0; i < 80; i++) { if (await wc.executeJavaScript(`!!document.querySelector("#nebula-view.welcoming")`).catch(() => false)) break; await sleep(100); }
  console.log("visible", win.isVisible(), "size", JSON.stringify(await wc.executeJavaScript("[innerWidth,innerHeight]")));
  await sleep(200);
  await shot("home-welcome.png");
  console.log("welcome shot at", Date.now() - t0, JSON.stringify(await wc.executeJavaScript(`document.getElementById("hm-greet").textContent`)));
  await sleep(7000);
  await shot("home-cards.png");
  console.log("state", JSON.stringify(await wc.executeJavaScript(`(()=>{const s=window.HQNebula._state;const gd=s.g.graphData();return {mode:s.mode,nodes:gd.nodes.length,links:gd.links.length,view:document.body.className,cards:[...document.querySelectorAll(".hm-card")].map(c=>c.textContent),tab:[...document.querySelectorAll("#tabs button")].map(b=>b.textContent+(b.classList.contains("on")?"*":"")),pinned:gd.nodes.filter(n=>n.fx!=null).length}})()`)));
  await shot("nebula-brain.png");
  await wc.executeJavaScript(`(()=>{const s=window.HQNebula._state;const n=s.data.nodes.filter(n=>n.kind==="note").sort((a,b)=>b.deg-a.deg)[0];window.HQNebula.select(n.id)})()`); await sleep(1500);
  // graph toggle and back
  await wc.executeJavaScript(`document.getElementById("nb-mode").click()`); await sleep(3000);
  console.log("graph mode", JSON.stringify(await wc.executeJavaScript(`(()=>{const s=window.HQNebula._state;return {mode:s.mode,pinned:s.g.graphData().nodes.filter(n=>n.fx!=null).length}})()`)));
  await shot("nebula-graph.png");
  await wc.executeJavaScript(`document.getElementById("nb-mode").click()`); await sleep(2500);
  // card click -> HQ, Esc -> home
  await wc.executeJavaScript(`document.querySelector('.hm-card[data-id="hq"]').click()`); await sleep(500);
  console.log("after card", await wc.executeJavaScript(`document.body.className`));
  await wc.executeJavaScript(`document.getElementById("input").blur(); document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))`); await sleep(500);
  console.log("after esc", await wc.executeJavaScript(`document.body.className`));
  console.log("done");
  app.exit(0);
});
