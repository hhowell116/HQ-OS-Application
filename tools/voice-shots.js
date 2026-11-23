// Screenshots the chat with the mic button (hq + room views) and smoke-tests the record/transcribe path with a fake mic.
// Run: node_modules/electron/dist/electron.exe tools/voice-shots.js <outDir>
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
app.commandLine.appendSwitch("use-fake-device-for-media-stream");
const out = process.argv[2] || path.join(__dirname, "shots");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-"));
const real = path.join(process.env.APPDATA, "HQ OS");
for (const n of ["settings.json", "chats"]) if (fs.existsSync(path.join(real, n))) fs.cpSync(path.join(real, n), path.join(tmp, n), { recursive: true });
app.setPath("userData", tmp);
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.stack));
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(1500);
  const win = BrowserWindow.getAllWindows()[0]; win.setPosition(-4000, 0); win.showInactive(); const wc = win.webContents;
  const errs = []; wc.on("console-message", (e, lvl, msg) => { if (lvl >= 3) errs.push(msg); });
  fs.mkdirSync(out, { recursive: true });
  win.setBounds({ x: -4000, y: 0, width: 1600, height: 900 }); await sleep(1500);
  const info = await wc.executeJavaScript(`(()=>{const b=document.querySelector('#btn-mic');const r=b.getBoundingClientRect();return [r.width,r.height,b.offsetParent!==null]})()`);
  console.log("hq mic rect", JSON.stringify(info));
  fs.writeFileSync(path.join(out, "voice-input-hq.png"), (await wc.capturePage()).toPNG());
  // record 2s from the fake mic, then stop (exercises getUserMedia + resample + worker IPC)
  await wc.executeJavaScript(`document.querySelector('#btn-mic').click()`); await sleep(1200);
  console.log("state rec:", await wc.executeJavaScript(`document.querySelector('#btn-mic').className`));
  fs.writeFileSync(path.join(out, "voice-input-rec.png"), (await wc.capturePage()).toPNG());
  await sleep(1500); await wc.executeJavaScript(`document.querySelector('#btn-mic').click()`); await sleep(500);
  console.log("state after stop:", await wc.executeJavaScript(`document.querySelector('#btn-mic').className`));
  for (let i = 0; i < 40; i++) { if (!(await wc.executeJavaScript(`document.querySelector('#btn-mic').classList.contains('busy')`))) break; await sleep(1000); }
  console.log("toast/input:", JSON.stringify(await wc.executeJavaScript(`[document.querySelector('#toast').textContent, document.querySelector('#input').value]`)));
  await wc.executeJavaScript(`window.HQView("tower")`); await sleep(2000);
  console.log("room mic visible", await wc.executeJavaScript(`(()=>{const b=document.querySelector('#btn-mic');const r=b.getBoundingClientRect();return [r.width,r.height,r.bottom<innerHeight,b.offsetParent!==null]})()`));
  fs.writeFileSync(path.join(out, "voice-input-room.png"), (await wc.capturePage()).toPNG());
  await wc.executeJavaScript(`document.querySelector('#btn-vset').click()`); await sleep(400);
  console.log("vpop auto:", await wc.executeJavaScript(`!!document.querySelector('#vpop [data-auto]')`));
  console.log("console errors:", JSON.stringify(errs));
  app.exit(0);
});
