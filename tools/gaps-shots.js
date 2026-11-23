// Shots for the UI-gap fixes: HQ tab while booting, chat toolbar with the files panel open, home cards (Stocks stat), nebula without ghosts.
// Hidden window, temp userData, no dialogs. Run: node_modules/electron/dist/electron.exe tools/gaps-shots.js <outDir> [prefix]
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const out = process.argv[2] || path.join(__dirname, "shots"), pre = process.argv[3] || "g";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-"));
const real = path.join(process.env.APPDATA, "HQ OS");
if (fs.existsSync(path.join(real, "settings.json"))) fs.cpSync(path.join(real, "settings.json"), path.join(tmp, "settings.json"));
app.setPath("userData", tmp);
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let win; while (!(win = BrowserWindow.getAllWindows()[0])) await sleep(20);
  win.setOpacity(0); win.showInactive(); win.setBounds({ x: 0, y: 0, width: 1280, height: 720 });
  const wc = win.webContents; wc.setBackgroundThrottling(false);
  fs.mkdirSync(out, { recursive: true });
  const run = (js) => wc.executeJavaScript(js);
  const shot = async (name) => { await wc.capturePage(); await sleep(300); fs.writeFileSync(path.join(out, pre + "-" + name + ".png"), (await wc.capturePage()).toPNG()); console.log("saved", name); };
  const t0 = Date.now();
  for (const ms of [250, 600]) { await sleep(Math.max(0, ms - (Date.now() - t0))); try { console.log(ms + "ms tabs on:", await run(`[...document.querySelectorAll("#tabs button.on")].map(b=>b.dataset.view).join(",") || "none"`)); } catch (e) { console.log("err", e.message); } }
  await sleep(3500);
  await shot("home");
  console.log("cards:", await run(`[...document.querySelectorAll(".hm-card")].map(c=>c.textContent).join(" | ")`));
  console.log("ghost nodes:", await run(`(window.HQNebula && document.querySelector("#nb-count") || {}).textContent`));
  await run(`HQView("hq")`); await sleep(1200);
  await run(`HQFiles.toggle(true)`); await sleep(1200);
  console.log("toolbar:", await run(`(()=>{const h=document.querySelector("#console .console-h"),r=h.getBoundingClientRect();return JSON.stringify({w:r.width,h:r.height,over:[...h.children].filter(c=>c.getBoundingClientRect().right>r.right+1).length})})()`));
  await shot("toolbar-files-open");
  app.exit(0);
});
