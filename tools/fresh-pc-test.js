// Fresh-PC check: empty Projects folder + empty settings. Expect a tower with only Lobby + Command Deck,
// then each project made with + adds a floor. Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/fresh-pc-test.js <outDir>
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const out = process.argv[2] || path.join(__dirname, "shots");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-fresh-"));
const proj = path.join(tmp, "Projects"); fs.mkdirSync(proj);
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ projectsRoot: proj, person: "Tester", projects: [] }));
app.setPath("userData", tmp);
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(1500);
  const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.showInactive(); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  const wc = win.webContents, errs = []; wc.on("console-message", (e, lvl, msg) => { if (lvl >= 3) errs.push(msg); });
  await sleep(3000);
  fs.mkdirSync(out, { recursive: true });
  const floors = () => wc.executeJavaScript(`HQTower.summary().floors.map(f=>f.kind+":"+f.name).join(", ")`);
  await wc.executeJavaScript(`HQView("tower")`); await sleep(2500);
  console.log("empty:", await floors());
  fs.writeFileSync(path.join(out, "fresh-empty.png"), (await wc.capturePage()).toPNG());
  for (const n of ["Alpha", "Beta Site"]) { const r = await wc.executeJavaScript(`hq.projectCreate(${JSON.stringify(n)}).then(async (r) => { await loadProjects(); return r; })`); console.log("create", n, JSON.stringify(r)); await sleep(2500); }
  console.log("after:", await floors());
  console.log("agents file:", fs.existsSync(path.join(proj, "Alpha", ".claude", "agents", "alpha-team-builder.md")), "index:", fs.existsSync(path.join(proj, "Alpha", "Notes", "Claude", "Index.md")));
  fs.writeFileSync(path.join(out, "fresh-two.png"), (await wc.capturePage()).toPNG());
  console.log("errors:", errs.length, errs.slice(0, 4).join(" | "));
  app.exit(0);
});
