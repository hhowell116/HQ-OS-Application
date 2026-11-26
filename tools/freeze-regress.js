// Regression: (1) Home must finish scanning on every boot, (2) entering/leaving the Trading floor must not hang the renderer.
// Run: node_modules/electron/dist/electron.exe tools/freeze-regress.js [boots=10] [cycles=30] [--real]
// Hidden window (opacity 0), temp userData. --real reads the real Projects folder (read-only use; nothing is written to it).
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const nums = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const BOOTS = nums[0] || 10, CYCLES = nums[1] || 30, REAL = process.argv.includes("--real");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-freeze-"));
app.setPath("userData", tmp);
process.env.HQ_TEST_HIDDEN = "1"; process.env.HQ_TEAM_NORUN = "1";
if (!REAL) { const proj = path.join(tmp, "Projects"); fs.mkdirSync(proj); process.env.HQ_PROJECTS_ROOT = proj; }
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const document_view_is_tower_ok = (so) => so.dv && so.paused; // data-view class left on after leaving the floor = tower loop paused forever
let hung = false;
app.whenReady().then(async () => {
  await sleep(1200);
  const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.setIgnoreMouseEvents(true); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  const wc = win.webContents, errs = [];
  wc.on("console-message", (e, lvl, msg) => { if (lvl >= 3) errs.push(msg); });
  wc.on("unresponsive", () => { hung = true; console.log("UNRESPONSIVE event"); });
  // delay the big late-loading script so the boot IPC resolves BEFORE nebula.js/home.js/tower.js run (slow-disk case); --fast disables
  if (!process.argv.includes("--fast")) wc.session.webRequest.onBeforeRequest((d, cb) => { if (/vendor\/nebula-lib\.js/.test(d.url)) setTimeout(() => cb({}), 1500); else cb({}); });
  const ev = (s) => wc.executeJavaScript(s);
  const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rj) => setTimeout(() => rj(new Error("timeout " + what)), ms))]);

  // ---- scenario 1: boot x BOOTS (fresh session = start on Home) ----
  let ok1 = 0;
  for (let i = 0; i < BOOTS; i++) {
    try {
      await ev(`sessionStorage.clear()`);
      wc.reload();
      const t0 = Date.now(); let txt = "";
      while (Date.now() - t0 < 25000) { await sleep(300); try { txt = await withTimeout(ev(`document.querySelector("#nb-count").textContent + "|" + (window.HQNebula && HQNebula._state.g ? HQNebula._state.g.graphData().nodes.length : -1)`), 3000, "poll"); } catch (e) { txt = "poll-fail"; } if (!/^scanning/.test(txt) && !txt.endsWith("|-1") && !txt.endsWith("|0")) break; }
      if (/^scanning|poll-fail/.test(txt) || txt.endsWith("|0") || txt.endsWith("|-1")) { fails.push("boot " + i + ": " + txt); console.log("boot", i, "FAIL", txt); } else { ok1++; console.log("boot", i, "ok", txt, (Date.now() - t0) + "ms"); }
    } catch (e) { fails.push("boot " + i + ": " + e.message); }
  }
  console.log("BOOT", ok1 + "/" + BOOTS);

  // ---- scenario 2: Trading floor enter/leave x CYCLES with data-view toggles, heartbeat watchdog ----
  await ev(`sessionStorage.clear()`); wc.reload(); await sleep(4000);
  await ev(`window.__hb = performance.now(); (function b(){ window.__hb = performance.now(); requestAnimationFrame(b); })()`);
  let ok2 = 0, maxGap = 0;
  const beat = async () => { const t = Date.now(); const r = await withTimeout(ev(`performance.now() - window.__hb`), 8000, "heartbeat"); return r; };
  for (let i = 0; i < CYCLES; i++) {
    try {
      await ev(`HQGoStonks()`);
      await sleep(i % 3 === 0 ? 100 : 700 + (i % 5) * 150);
      if (i % 2 === 0) await ev(`(document.querySelector("#fl-dvbtn")||{click(){}}).click()`);
      await sleep(250);
      await ev(`HQView("hq")`);
      await sleep(i % 4 === 0 ? 50 : 300);
      if (i % 4 === 1) { await ev(`HQView("tower")`); await sleep(200); await ev(`HQView("home")`); await sleep(200); }
      await sleep(1300); const st = await ev(`JSON.stringify({dv: document.querySelector("#tower-view").classList.contains("stk-dv"), paused: !!HQTower.state.paused, raf: !!HQTower.state.raf, mode: HQTower.state.mode})`); const so = JSON.parse(st); if (document_view_is_tower_ok(so)) throw new Error("stale pause: " + st);
      const gap = await beat(); maxGap = Math.max(maxGap, gap);
      if (gap > 3000) throw new Error("rAF stalled " + Math.round(gap) + "ms");
      ok2++;
    } catch (e) { fails.push("cycle " + i + ": " + e.message); console.log("cycle", i, "FAIL", e.message); if (/timeout/.test(e.message)) break; }
  }
  console.log("TRADING", ok2 + "/" + CYCLES, "max rAF gap", Math.round(maxGap) + "ms", "unresponsive:", hung);
  console.log("console errors:", errs.length, errs.slice(0, 4).join(" | ").slice(0, 400));
  console.log(fails.length || hung ? "FAILED" : "PASSED", fails.slice(0, 6).join(" ; "));
  const code = fails.length || hung ? 1 : 0;
  app.exit(code);
});
