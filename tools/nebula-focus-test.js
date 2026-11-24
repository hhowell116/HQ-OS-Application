// Focus the top hub nodes (and Rules.md) in each Nebula shape and assert the frame never whites out.
// Hidden window, temp userData. Run: node_modules/electron/dist/electron.exe tools/nebula-focus-test.js <outDir>
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
  win.setOpacity(0); wc.setBackgroundThrottling(false);
  win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  fs.mkdirSync(out, { recursive: true });
  const grab = async () => { await wc.capturePage(); await sleep(300); return wc.capturePage(); };
  const bright = async () => {
    const img = await grab(), b = img.toBitmap(); let sum = 0, n = 0, wh = 0;
    for (let i = 0; i < b.length; i += 4 * 37) { const l = (b[i] + b[i + 1] + b[i + 2]) / 3; sum += l; n++; if (l > 240) wh++; }
    return { mean: +(sum / n).toFixed(1), white: +(wh / n).toFixed(3) };
  };
  for (let i = 0; i < 80; i++) { if (await wc.executeJavaScript(`!!document.querySelector("#nebula-view.welcoming")`).catch(() => false)) break; await sleep(100); }
  await sleep(8000);
  const SH = process.env.SHAPES ? process.env.SHAPES.split(",") : ["brain", "hole", "galaxy", "planet", "torus", "graph"];
  let bad = 0;
  for (const id of SH) {
    await wc.executeJavaScript(`window.HQNebula.setMode('${id}')`);
    await sleep(5500);
    const ids = await wc.executeJavaScript(`(()=>{const a=window.HQNebula._state.g.graphData().nodes;const top=a.filter(n=>n.kind!=="ghost").sort((x,y)=>(y.deg||0)-(x.deg||0)).slice(0,3).map(n=>n.id);const r=a.filter(n=>/^rules(\\.md)?$/i.test(n.name)||n.kind==="core").map(n=>n.id);return top.concat(r)})()`);
    for (const nid of [...new Set(ids)]) {
      await wc.executeJavaScript(`window.HQNebula.select(${JSON.stringify(nid)})`);
      await sleep(2200);
      const r = await bright();
      const cam = await wc.executeJavaScript(`(()=>{const s=window.HQNebula._state,n=s.g.graphData().nodes.find(x=>x.id===${JSON.stringify(nid)}),c=s.g.camera().position;return {d:+Math.hypot(c.x-n.x,c.y-n.y,c.z-n.z).toFixed(1),deg:n.deg,name:n.name,kind:n.kind}})()`);
      const ok = r.mean < 100 && r.white < 0.2; if (!ok) bad++;
      console.log(id, ok ? "ok " : "BAD", JSON.stringify(cam), JSON.stringify(r));
      if (id === (process.env.SHOT_SHAPE || "brain") && /rules/i.test(cam.name)) fs.writeFileSync(path.join(out, "nebula-focus-rules.png"), (await grab()).toPNG());
    }
    await wc.executeJavaScript(`(()=>{const x=document.querySelector("#nb-panel .nb-x");x&&x.click()})()`);
  }
  console.log("BAD COUNT", bad);
  app.exit(bad ? 1 : 0);
});
