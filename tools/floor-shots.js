// Screenshots each Trading Floor sub-tab (offscreen window, throwaway profile). Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/floor-shots.js <outDir> [tabs,comma,separated]
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const out = process.argv[2] || path.join(__dirname, "shots"), tabs = (process.argv[3] || "agents,signals,book,know,chat").split(",");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-"));
const real = path.join(process.env.APPDATA, "HQ OS");
for (const n of ["settings.json", "chats"]) if (fs.existsSync(path.join(real, n))) fs.cpSync(path.join(real, n), path.join(tmp, n), { recursive: true });
app.setPath("userData", tmp);
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(1500);
  const win = BrowserWindow.getAllWindows()[0];
  win.setBounds({ x: -2400, y: 0, width: 1600, height: 900 }); win.showInactive();
  const wc = win.webContents; fs.mkdirSync(out, { recursive: true }); wc.on("console-message", (_, lvl, msg, line, src) => { if (lvl >= 2) console.log("PAGE", lvl, msg, src.split("/").pop() + ":" + line); });
  await wc.executeJavaScript('window.HQView("floor")'); await sleep(3000);
  if (process.env.SHOT_GO) { // click GO, grab the roundtable mid-run, wait for the run to finish
    await wc.executeJavaScript('document.querySelector("#fl-tabs button[data-t=agents]").click(); document.querySelector("#fl-go").click()');
    await sleep(+process.env.SHOT_GO * 1000); fs.writeFileSync(path.join(out, "trading-floor-agents-live.png"), (await wc.capturePage()).toPNG());
    for (let i = 0; i < 90; i++) { if (await wc.executeJavaScript('!document.querySelector("#fl-go").disabled')) break; await sleep(5000); }
    await sleep(1500);
  }
  for (const t of tabs) {
    await wc.executeJavaScript('document.querySelector("#fl-tabs button[data-t=' + t + ']").click()'); await sleep(1200);
    if (t === "signals") { await wc.executeJavaScript('(document.querySelector(".fl-card")||{click(){}}).click()'); await sleep(500); }
    fs.writeFileSync(path.join(out, "trading-floor-" + t + ".png"), (await wc.capturePage()).toPNG());
    if (t === "agents") { await wc.executeJavaScript('document.querySelector("#fl-tr").click()'); await sleep(700); fs.writeFileSync(path.join(out, "trading-floor-agents-transcript.png"), (await wc.capturePage()).toPNG()); await wc.executeJavaScript('document.querySelector("#fl-tr").click()'); }
    if (t === "signals") await wc.executeJavaScript('document.querySelector("#fl-drawer").classList.add("hidden")');
  }
  if (process.env.SHOT_EVAL) console.log(JSON.stringify(await wc.executeJavaScript(process.env.SHOT_EVAL)));
  app.exit(0);
});
