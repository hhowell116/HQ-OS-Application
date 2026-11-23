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
  for (let i = 0; i < 8; i++) { const im = await wc.capturePage(); imgs.push(im); fs.writeFileSync(path.join(out, tag + "-f" + i + ".png"), im.toPNG()); await sleep(80); }
  const R = { sig: { x: 1060, y: 235, width: 270, height: 120 }, ring: { x: 560, y: 380, width: 800, height: 520 } };
  for (const k in R) for (const i of [0, 3, 6]) fs.writeFileSync(path.join(out, tag + "-" + k + i + ".png"), imgs[i].crop(R[k]).toPNG());
  const { width, height } = imgs[0].getSize(), B = imgs.map((i) => i.toBitmap()), rows = [];
  const G = 40, gw = Math.ceil(width / G), gh = Math.ceil(height / G), cnt = new Array(gw * gh).fill(0), amp = new Array(gw * gh).fill(0);
  for (let k = 1; k < B.length; k++) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const o = (y * width + x) * 4, d = Math.abs(B[k][o] - B[k - 1][o]) + Math.abs(B[k][o + 1] - B[k - 1][o + 1]) + Math.abs(B[k][o + 2] - B[k - 1][o + 2]); if (d > 30) { const c = ((y / G) | 0) * gw + ((x / G) | 0); cnt[c]++; amp[c] = Math.max(amp[c], d); } }
  const hot = cnt.map((c, i) => ({ x: (i % gw) * G, y: ((i / gw) | 0) * G, c: c, a: amp[i] })).filter((h) => h.c > 20).sort((a, b) => b.c - a.c);
  const tot = cnt.reduce((a, b) => a + b, 0);
  fs.writeFileSync(path.join(out, tag + "-diff.json"), JSON.stringify({ total: tot, hot: hot.slice(0, 40) }, null, 1));
  console.log("DIFF total", tot, "hotcells", hot.length, JSON.stringify(hot.slice(0, 12)));
  app.exit(0);
});
