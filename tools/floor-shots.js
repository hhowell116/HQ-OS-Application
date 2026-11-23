// Screenshots the one-screen Trading Floor (offscreen window, throwaway profile). Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/floor-shots.js <outDir>   (env: SHOT_REPLAY=<sec into the idle replay>, SHOT_GO=<sec after clicking GO>, SHOT_EVAL=<js>)
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const out = process.argv[2] || path.join(__dirname, "shots");
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
  const shot = async (n) => fs.writeFileSync(path.join(out, n), (await wc.capturePage()).toPNG());
  await wc.executeJavaScript('window.HQView("floor")');
  if (process.env.SHOT_GO) {
    await sleep(3000); await wc.executeJavaScript('document.querySelector("#fl-go").click()');
    const secs = process.env.SHOT_GO.split(",").map(Number); let last = 0;
    for (let i = 0; i < secs.length; i++) { await sleep((secs[i] - last) * 1000); last = secs[i]; await shot("trading-floor-office-live" + (i || "") + ".png"); }
    for (let i = 0; i < 120; i++) { if (await wc.executeJavaScript('!document.querySelector("#fl-go").disabled')) break; await sleep(5000); }
    await sleep(3000);
  }
  if (process.env.SHOT_REPLAY) { await wc.executeJavaScript('window.HQView("hq"); window.HQView("floor")'); await sleep(+process.env.SHOT_REPLAY * 1000); await shot("trading-floor-office-replay.png"); }
  await wc.executeJavaScript('document.querySelector("#fl-live").click()'); await sleep(2500); await shot("trading-floor-office.png");
  await wc.executeJavaScript('document.querySelector("#fl-tr").click()'); await sleep(700); await shot("trading-floor-office-transcript.png"); await wc.executeJavaScript('document.querySelector("#fl-chbtn").click()'); await sleep(700); await shot("trading-floor-office-chat.png");
  await wc.executeJavaScript('document.querySelector("#fl-chbtn").click()');
  if (process.env.SHOT_EVAL) console.log(JSON.stringify(await wc.executeJavaScript(process.env.SHOT_EVAL)));
  app.exit(0);
});
