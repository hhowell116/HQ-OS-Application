// Hidden render of chat turns that start with tools / only used tools. Usage: electron tools/chat-render-shot.js <out.png>
const { app, BrowserWindow } = require("electron"); const fs = require("fs"), path = require("path");
app.setPath("userData", path.join(require("os").tmpdir(), "hq-chat-shot-" + Date.now()));
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 760, height: 560, show: true, frame: false, webPreferences: { contextIsolation: false } }); w.setOpacity(0);
  const src = fs.readFileSync(path.join(__dirname, "..", "renderer", "app.js"), "utf8");
  const grab = (re) => (src.match(re) || [""])[0];
  const mdFn = src.slice(src.indexOf("function md(src)"), src.indexOf("\nfunction ", src.indexOf("function md(src)") + 10));
  const rm = src.slice(src.indexOf("function renderMsg(m)"), src.indexOf("\nasync function newConv"));
  const css = fs.readFileSync(path.join(__dirname, "..", "renderer", "style.css"), "utf8");
  const msgs = [
    { r: "user", text: "how's it going" },
    { r: "asst", blocks: [{ k: "tool", id: "1", name: "Bash", target: "log.ps1 status", result: "ok" }, { k: "tool", id: "2", name: "SendMessage", target: "worker", result: "sent" }, { k: "text", text: "Going well: the worker finished and **3 items** are done." }] },
    { r: "user", text: "and the other one?" },
    { r: "asst", blocks: [{ k: "tool", id: "3", name: "Agent", target: "qa-engineer", result: "done" }, { k: "tool", id: "4", name: "Bash", target: "npm test", result: "pass" }] },
  ];
  const html = `<html><head><style>${css}</style></head><body style="padding:20px"><div id="log" style="max-width:700px"></div><script>const $=(s)=>document.querySelector(s);const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e;};const S={person:"Hayden"};${grab(/const esc[^\n]*\n/)}${mdFn}\n${rm}\nconsole.log(1);${JSON.stringify(msgs)}.forEach(m=>document.getElementById("log").append(renderMsg(m)));</script></body></html>`;
  const f = path.join(app.getPath("userData"), "t.html"); fs.mkdirSync(app.getPath("userData"), { recursive: true }); fs.writeFileSync(f, html);
  w.webContents.on("console-message", (e, l, m) => console.log("CONSOLE", m));
  await w.loadFile(f); await new Promise((r) => setTimeout(r, 600));
  const img = await w.webContents.capturePage(); fs.writeFileSync(process.argv[2] || "chat-render.png", img.toPNG()); app.quit();
});
