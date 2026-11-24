// DATA VIEW ticker check: shoots at 1600x900 and 1920x1080, prints header/tape/banner rects. Hidden window.
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
const out = process.argv[2];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-dvt-"));
const real = path.join(process.env.APPDATA, "HQ OS");
if (fs.existsSync(path.join(real, "settings.json"))) fs.cpSync(path.join(real, "settings.json"), path.join(tmp, "settings.json"));
app.setPath("userData", tmp);
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(1500);
  const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.showInactive(); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  const wc = win.webContents; wc.setBackgroundThrottling(false); const run = (js) => wc.executeJavaScript(js);
  await sleep(2500); await run(`window.HQView("tower")`); await sleep(1500); await run(`HQTower.go("stonks")`); await sleep(3800);
  await run(`HQFloor.dataView()`); await sleep(2500);
  const rects = () => run(`(() => { document.title;  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), getComputedStyle(e).display]; }; return JSON.stringify({ win: innerWidth + "x" + innerHeight, flh: document.getElementById("tw-stonks").style.getPropertyValue("--flh"), bar: r("#tw-stonks .fl-bar"), tape: r("#fl-tape"), banner: r("#fl-banner"), strip: r("#fl-agstrip"), board: r("#tw-stonks .fl-board") }); })()`);
  for (const [w, h, n] of [[1600, 900, "stocks-dataview-ticker.png"], [1920, 1080, "stocks-dataview-ticker-1080.png"]]) {
    if (win.isMaximized()) win.unmaximize(); win.setFullScreen(false); win.setMinimumSize(100, 100); win.setContentSize(w, h); await sleep(1500);
    console.log(w, await rects()); await wc.capturePage(); await sleep(250); fs.writeFileSync(path.join(out, n), (await wc.capturePage()).toPNG());
  }
  app.exit(0);
});
