// dev-only: actionable-board shots (closed market + simulated open) with in-memory fake cards. usage: electron tools/stocks-board-shot.js <outDir>
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const out = process.argv[2];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-")); const real = path.join(process.env.APPDATA, "HQ OS");
for (const n of ["settings.json"]) if (fs.existsSync(path.join(real, n))) fs.cpSync(path.join(real, n), path.join(tmp, n), { recursive: true });
app.setPath("userData", tmp); require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(1500); const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.showInactive(); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  const wc = win.webContents; await sleep(2500);
  await wc.executeJavaScript(`window.HQView && window.HQView("tower")`); await sleep(2500);
  await wc.executeJavaScript(`HQTower.go("stonks")`); await sleep(7000);
  const open = Date.UTC(2026, 10, 25, 19, 30), T = open - 1800000; // Wed 2:30 PM ET
  const mk = (id, tk, act, conf, px, o) => Object.assign({ id, ticker: tk, action: act, strategy: "Scanner", confidence: conf, ts: T, px, chg: 1.1, thesis: "Pullback to the 20-day average on rising volume; buy near the entry with the stop under support.", plan: act === "WATCH" ? null : { entry: px, stop: +(px * 0.96).toFixed(2), t1: +(px * 1.06).toFixed(2), shares: 2 }, validUntil: open + 3600000, vetoWhy: [] }, o || {});
  const al = [mk("a1", "AAPL", "BUY", 74, 228.4), mk("a2", "XLV", "BUY", 58, 142.1), mk("a3", "MSFT", "BUY", 71, 421.5, { positionId: "P1" }), mk("a4", "KO", "WATCH", 50, 61.2), mk("a5", "NVDA", "BUY", 66, 133.9, { sig: { state: "EXPIRED" } })];
  const sess = { start: open - 3600000 * 5 + 0, end: open + 5400000, bar: 60 };
  const board = (o) => Object.assign({ bar: 60 }, o);
  const run = async (name, b, now) => { await wc.executeJavaScript(`HQFloor.preview(${JSON.stringify(al)}, null, null, "paper", null, null, ${JSON.stringify(b)}, ${now})`); await sleep(1500);
    await wc.executeJavaScript(`[...document.querySelectorAll("#fl-alerts .fl-fold")].filter(b => /Watching|Paper-only/.test(b.textContent)).forEach(b => b.click())`); await sleep(800);
    fs.writeFileSync(path.join(out, name), (await wc.capturePage()).toPNG()); };
  await run("stocks-board-actionable.png", board({ start: Date.UTC(2026, 10, 25, 14, 30), end: Date.UTC(2026, 10, 25, 21, 0) }), open);
  const shut = Date.UTC(2026, 10, 25, 22, 0);
  await run("stocks-board-closed.png", board({ start: Date.UTC(2026, 10, 27, 14, 30), end: Date.UTC(2026, 10, 27, 18, 0) }), shut);
  app.exit(0);
});
