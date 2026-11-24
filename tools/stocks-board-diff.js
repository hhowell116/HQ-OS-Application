// dev-only: capture N frames of the Stocks floor and pixel-diff them (flicker check). Not part of the app.
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const out = process.argv[2], tag = process.argv[3] || "a";
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-")); const real = path.join(process.env.APPDATA, "HQ OS");
for (const n of ["settings.json", "chats"]) if (fs.existsSync(path.join(real, n))) fs.cpSync(path.join(real, n), path.join(tmp, n), { recursive: true });
app.setPath("userData", tmp); require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(1500); const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.showInactive(); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  const wc = win.webContents; await sleep(2500);
  await wc.executeJavaScript(`window.HQView && window.HQView("tower")`); await sleep(2500);
  await wc.executeJavaScript(`HQTower.enter("stocks")`); await sleep(6500);
  await wc.executeJavaScript(`(() => { const b = document.querySelector("#fl-play"); if (b && b.textContent === "PAUSE") b.click(); })()`); await sleep(3000);
  if (process.argv[4] === "work") await wc.executeJavaScript(`(() => { const d = HQFloor.desks; HQFloor.desks = () => { const v = d(); const st = {}; for (const k in v.st) st[k] = Object.assign({}, v.st[k], { status: "working" }); return Object.assign({}, v, { st, running: true }); }; })()`); await sleep(1500);
  const imgs = [];
  for (let i = 0; i < 12; i++) { imgs.push(await wc.capturePage()); await sleep(80); }
  const { width, height } = imgs[0].getSize(), R = { x: Math.round(width * 0.553), y: Math.round(height * 0.254), width: Math.round(width * 0.115), height: Math.round(height * 0.075) };
  const C = imgs.map((i) => i.crop(R)); fs.writeFileSync(path.join(out, tag + "-board0.png"), C[0].toPNG()); fs.writeFileSync(path.join(out, tag + "-full.png"), imgs[0].toPNG());
  const B = C.map((i) => i.toBitmap()), res = [];
  for (let k = 1; k < B.length; k++) { let s = 0, ch = 0; for (let o = 0; o < B[k].length; o += 4) { const d = Math.abs(B[k][o] - B[k - 1][o]) + Math.abs(B[k][o + 1] - B[k - 1][o + 1]) + Math.abs(B[k][o + 2] - B[k - 1][o + 2]); s += d; if (d > 24) ch++; } res.push({ meanAbs: +(s / (B[k].length / 4)).toFixed(3), changedPx: ch }); }
  fs.writeFileSync(path.join(out, tag + "-board-diff.json"), JSON.stringify({ region: R, frames: res }, null, 1)); console.log("BOARD", tag, JSON.stringify(R), JSON.stringify(res));
  app.exit(0);
});
