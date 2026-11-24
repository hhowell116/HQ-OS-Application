// Files explorer test + screenshots. Not part of the app.
// node_modules/electron/dist/electron.exe tools/files-test.js test            (temp projects root, rename/new-note/validation checks)
// node_modules/electron/dist/electron.exe tools/files-test.js shots <outDir>  (real projects root, read-only, screenshots)
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const mode = process.argv[2] || "test", out = process.argv[3] || path.join(__dirname, "shots");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hqos-fx-"));
const real = path.join(process.env.APPDATA, "HQ OS");
let s = {}; try { s = JSON.parse(fs.readFileSync(path.join(real, "settings.json"), "utf8")); } catch (e) {}
let root = s.projectsRoot || path.join(os.homedir(), "Projects");
if (mode === "test") {
  root = path.join(tmp, "Projects");
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), t); };
  w("Alpha/Notes/Alpha To-Do.md", "# Alpha\n\n## Now\n- [ ] see [[Beta Note]] and [[Missing]]\n"); w("Alpha/Notes/Beta Note.md", "# Beta\nback to [[Alpha To-Do]]\n");
  w("Alpha/src/x.js", "1"); w("Alpha/node_modules/z/i.js", "1"); w("Alpha/.env", "SECRET=1"); w("Alpha/data/d.json", "{}"); w("Alpha/personal stuff/p.md", "x"); w("Alpha/dist/a.js", "1");
  w("Beta/Notes/B.md", "# B"); w("Beta/readme.txt", "hi");
  s.theme = "cyan"; s.last = "";
}
s.projectsRoot = root; s.filesOpen = true; s.filesW = 280; s.projects = mode === "test" ? [] : s.projects;
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify(s));
for (const n of ["chats"]) if (mode !== "test" && fs.existsSync(path.join(real, n))) fs.cpSync(path.join(real, n), path.join(tmp, n), { recursive: true });
app.setPath("userData", tmp);
require("../main.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
app.whenReady().then(async () => {
  try {
    await sleep(2500);
    const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.setIgnoreMouseEvents(true); win.showInactive(); const wc = win.webContents; const ev = (c) => wc.executeJavaScript(c);
    if (win.isMaximized()) win.unmaximize(); win.setBounds({ x: 0, y: 0, width: 1600, height: 900 }); await sleep(1500);
    if (mode === "test") {
      const L = (d) => ev(`hq.files("list", ${JSON.stringify(d)})`);
      const top = await L(root); ok(top.entries.map((e) => e.name).join() === "Alpha,Beta", "top-level projects: " + top.entries.map((e) => e.name));
      const a = await L(path.join(root, "Alpha")); const names = a.entries.map((e) => e.name); ok(names.join() === "Notes,data,dist,src", "alpha listing hides tooling, shows data/dist, Notes first: " + names);
      ok((await L(path.join(root, "..")).then((r) => r.err)) === "outside projects folder", "outside root rejected");
      ok((await L(path.join(root, "Alpha", "personal stuff"))).err, "personal folder rejected");
      ok((await L(path.join(root, "Alpha", "node_modules"))).err, "node_modules rejected");
      ok((await ev(`hq.files("read", ${JSON.stringify(path.join(root, "Alpha", ".env"))})`)).err, ".env unreadable");
      ok((await ev(`hq.files("read", ${JSON.stringify("C:\\Users\\Hhowe\\Downloads\\MyVault\\x.md")})`)).err, "vault rejected");
      const f = path.join(root, "Alpha", "Notes", "Beta Note.md");
      ok((await ev(`hq.files("resolve", {from: ${JSON.stringify(f)}, link: "Alpha To-Do"})`)) === path.join(root, "Alpha", "Notes", "Alpha To-Do.md"), "wiki link resolves in project");
      ok((await ev(`hq.files("resolve", {from: ${JSON.stringify(f)}, link: "B"})`)) === null, "wiki link does not leak to other project");
      const nn = await ev(`hq.files("new", ${JSON.stringify(path.join(root, "Alpha", "Notes"))})`); ok(nn.ok && /Untitled\.md$/.test(nn.path), "new note: " + nn.path);
      const nn2 = await ev(`hq.files("new", ${JSON.stringify(path.join(root, "Alpha", "Notes"))})`); ok(nn2.ok && /Untitled 2\.md$/.test(nn2.path), "second new note does not overwrite");
      const R = (p, n) => ev(`hq.files("rename", ${JSON.stringify({ path: p, name: n })})`);
      ok((await R(nn.path, "Beta Note")).ok === false, "rename onto existing refused");
      ok((await R(nn.path, "a/b")).ok === false, "slash refused"); ok((await R(nn.path, "con")).ok === false, "reserved refused"); ok((await R(nn.path, "")).ok === false, "empty refused");
      ok((await R(nn.path, "node_modules")).ok === false, "hidden name refused"); ok((await R(path.join(root, "Alpha"), "X")).ok === false, "project folder rename refused");
      const rr = await R(nn.path, "Ideas"); ok(rr.ok && rr.path.endsWith("Ideas.md") && fs.existsSync(rr.path) && !fs.existsSync(nn.path), "rename ok, .md kept");
      ok((await ev(`hq.files("search", "beta")`)).map((h) => h.name).sort().join() === "Beta Note.md", "search finds names, excludes hidden");
      ok((await ev(`hq.files("search", "env")`)).length === 0 && (await ev(`hq.files("search", "p.md")`)).length === 0, "search excludes .env / personal");
      // renderer UI
      await ev(`document.getElementById("fx-panel")`); await sleep(500);
      ok(await ev(`document.body.classList.contains("fx-open") && document.querySelectorAll("#fx-tree .fx-row").length >= 2`), "panel open with rows");
      ok(await ev(`[...document.querySelectorAll("#fx-tree .fx-nm")].some(e=>e.textContent==="Notes") === false`), "projects collapsed at start");
      await ev(`document.querySelector('#fx-tree .fx-row[data-path$="Alpha"]').click()`); await sleep(700);
      const rows = await ev(`[...document.querySelectorAll("#fx-tree .fx-nm")].map(e=>e.textContent).join()`); ok(/Alpha,Notes,Alpha To-Do.md,Beta Note.md,Ideas.md,Untitled 2.md,data,dist,src,Beta/.test(rows), "expand: Notes opened first: " + rows);
      await ev(`document.getElementById("fx-rb")`); await ev(`document.querySelector('#fx-tree .fx-row[data-path$="Alpha To-Do.md"]').click()`); await sleep(600);
      ok(await ev(`!document.getElementById("fx-ov").classList.contains("hidden") && document.querySelectorAll("#fx-doc a.fx-wl").length === 2`), "reader open with 2 wiki links");
      await ev(`document.querySelector("#fx-doc a.fx-wl").click()`); await sleep(500);
      ok((await ev(`document.getElementById("fx-rt").textContent`)).includes("Beta Note"), "wiki link navigates");
      // toggle / pref
      await ev(`document.getElementById("fx-rc").click(); document.querySelector("#fx-rib .fx-rb").click()`); await sleep(500);
      ok(await ev(`!document.body.classList.contains("fx-open")`), "collapses");
      ok(JSON.parse(fs.readFileSync(path.join(tmp, "settings.json"), "utf8")).filesOpen === false, "open state persisted");
      // live update
      await ev(`document.querySelector("#fx-rib .fx-rb").click()`); await sleep(500);
      fs.writeFileSync(path.join(root, "Alpha", "Notes", "Live.md"), "x"); await sleep(1200);
      ok((await ev(`[...document.querySelectorAll("#fx-tree .fx-nm")].some(e=>e.textContent==="Live.md")`)), "fs.watch live update");
    } else {
      fs.mkdirSync(out, { recursive: true });
      const shot = async (n) => fs.writeFileSync(path.join(out, n), (await wc.capturePage()).toPNG());
      await ev(`window.HQView("hq")`); await sleep(800);
      // expand a few real projects, open a note
      const open = async (suffix) => { await ev(`(()=>{const r=[...document.querySelectorAll('#fx-tree .fx-row.dir')].find(e=>e.dataset.path.toLowerCase().endsWith(${JSON.stringify(suffix)}));if(r)r.click();})()`); await sleep(700); };
      await open("\\hq os"); await open("\\hq os\\notes\\claude"); await sleep(500);
      await ev(`(()=>{const r=[...document.querySelectorAll('#fx-tree .fx-row.file')].find(e=>/Index\\.md$/.test(e.dataset.path)&&/HQ OS/.test(e.dataset.path));if(r)r.click();})()`); await sleep(900);
      console.log("rows", await ev(`document.querySelectorAll("#fx-tree .fx-row").length`), "reader", await ev(`!document.getElementById("fx-ov").classList.contains("hidden")`));
      await shot("files-panel.png");
      await ev(`document.getElementById("fx-rc").click(); document.querySelector("#fx-rib .fx-rb").click()`); await sleep(900);
      await shot("files-collapsed.png");
    }
  } catch (e) { console.log("ERR", e.message); fails++; }
  console.log("fails", fails); app.exit(fails ? 1 : 0);
});
