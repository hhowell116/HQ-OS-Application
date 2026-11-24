// Tower HQ panels: terminal tabs (review/next/waiting), lobby summary, exterior badge. Hidden window, temp userData, SAMPLE data via window.__twApi (never touches real review items or To-Do files).
// Run: node_modules/electron/dist/electron.exe tools/tower-panels-shots.js <outDir> [prefix]
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const out = process.argv[2] || path.join(__dirname, "shots"), pre = process.argv[3] || "p";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-shot-"));
const real = path.join(process.env.APPDATA, "HQ OS");
for (const n of ["settings.json"]) if (fs.existsSync(path.join(real, n))) fs.cpSync(path.join(real, n), path.join(tmp, n), { recursive: true });
app.setPath("userData", tmp);
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(1500);
  const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.showInactive(); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  const wc = win.webContents; wc.setBackgroundThrottling(false);
  wc.on("console-message", (e) => { const l = e.level; if (l === "error" || l === 3) console.log("CONSOLE", l, String(e.message).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  const run = (js) => wc.executeJavaScript(js);
  const shot = async (name) => { await wc.capturePage(); await sleep(300); fs.writeFileSync(path.join(out, pre + "-" + name + ".png"), (await wc.capturePage()).toPNG()); console.log("saved", name); };
  await sleep(2500);
  await run(`HQView("tower")`); await sleep(1500);
  const names = JSON.parse(await run(`JSON.stringify(HQTower.state.floors.filter(f=>f.kind==="project"&&!f.stonks).map(f=>f.name))`));
  const A = names[0], B = names[1] || names[0]; console.log("floors", names.join(","));
  // sample data: stubs for the four IPC calls the panels use + fake counts on the sidebar list
  await run(`(() => {
    const cv = document.createElement("canvas"); cv.width = 192; cv.height = 120; const x = cv.getContext("2d"); const g = x.createLinearGradient(0,0,192,120); g.addColorStop(0,"#0ff"); g.addColorStop(1,"#f0a"); x.fillStyle = g; x.fillRect(0,0,192,120); x.fillStyle="#04070d"; x.font="bold 22px sans-serif"; x.fillText("SAMPLE UI", 36, 66);
    const img = cv.toDataURL("image/png");
    const mkT = () => ({ live: "Live = sample build 1.2 (test data)", missing: false,
      next: [1,2,3,4].map((n) => ({ line: n, raw: "- [ ] sample next " + n, num: String(n), text: "Sample next item " + n + ": wire the thing and check it", done: false })),
      wait: [1,2].map((n) => ({ line: 10 + n, raw: "- [ ] sample wait " + n, text: "Sample waiting-on item " + n, done: false })) });
    let todo = mkT(), rev = [
      { key: "a", title: "Tower floor terminal tabs", status: "needs-review", created: new Date(Date.now() - 3600e3).toISOString(), note: "sample", video: false, media: [img] },
      { key: "b", title: "Lobby summary", status: "needs-review", created: new Date(Date.now() - 86400e3).toISOString(), note: "sample", video: false, media: [img] }];
    window.__calls = [];
    window.__twApi = {
      project: async () => ({ todo }), reviewList: async () => JSON.parse(JSON.stringify(rev)),
      reviewSet: async (a) => { window.__calls.push(["reviewSet", a.key, a.status, a.comment]); rev = rev.map((i) => i.key === a.key ? Object.assign(i, { status: a.status }) : i); return true; },
      todoToggle: async (a) => { window.__calls.push(["todoToggle", a.line, a.on]); for (const k of ["next","wait"]) todo[k] = todo[k].map((i) => i.line === a.line ? Object.assign(i, { done: a.on }) : i); return { todo }; } };
    window.loadProjects = async () => {}; window.loadReview = async () => {}; // keep the fake counts for the test
    for (const p of S.projects) { p.review = 2; p.wait = 2; p.next = 4; p.hasTodo = true; }
    S.projects.slice(2).forEach((p) => { p.review = 0; });
    0; })()`);
  await sleep(3500);
  await run(`HQTower.exit()`); await sleep(1500);
  await shot("exterior-badge");
  console.log("badges", await run(`[...document.querySelectorAll(".tw-rbadge:not(.hidden)")].map(e=>e.textContent).join("|")`));
  // lobby summary
  await run(`HQTower.enter("LOBBY")`); await sleep(3200);
  console.log("lobsum", await run(`document.getElementById("tw-lobsum").className + " :: " + document.getElementById("tw-lobsum").textContent`));
  await shot("lobby-summary");
  // click first line -> flies to floor and opens review tab
  await run(`document.querySelector("#tw-lobsum .l").click(); 0`); await sleep(5500);
  console.log("after click", await run(`JSON.stringify({open: HQTowerChat.isOpen(), tab: HQTowerChat.tab(), floor: HQTower.state.cur && HQTower.state.cur.name})`));
  await sleep(500); await shot("terminal-review");
  console.log("review cards", await run(`document.querySelectorAll("#twp-review .twc-rv").length`));
  // changes with comment
  await run(`document.querySelector("#twp-review .twc-rv .chg").click(); 0`); await sleep(300);
  await run(`(() => { const t = document.querySelector("#twp-review .twc-rv textarea"); t.value = "Make the badge smaller"; t.dispatchEvent(new Event("input")); 0 })()`); await sleep(300);
  await shot("terminal-review-changes");
  await run(`document.querySelector("#twp-review .twc-rv .chg").click(); 0`); await sleep(600);
  await run(`document.querySelector("#twp-review .twc-rv .ok").click(); 0`); await sleep(600);
  console.log("calls", await run(`JSON.stringify(window.__calls)`), "cards left", await run(`document.querySelectorAll("#twp-review .twc-rv").length`));
  // next tab + toggle
  await run(`HQTowerChat.setTab("next")`); await sleep(700);
  await run(`document.querySelector("#twp-next .twc-it .box").click(); 0`); await sleep(500);
  console.log("next items", await run(`document.querySelectorAll("#twp-next .twc-it").length`), JSON.stringify(await run(`window.__calls.slice(-1)`)));
  await shot("terminal-next");
  await run(`HQTowerChat.setTab("wait")`); await sleep(500); await shot("terminal-waiting");
  console.log("wait items", await run(`document.querySelectorAll("#twp-wait .twc-it").length`));
  await run(`HQTowerChat.setTab("chat")`); await sleep(500); await shot("terminal-chat");
  await run(`HQTowerChat.close(); 0`);
  app.exit(0);
});
