// Tests the chat panel inside tower floors (console re-parenting, Esc/C/Ctrl+K keys, unread dot) and screenshots it.
// Hidden (opacity 0) window, temp userData, no dialogs, sends NO messages. Not part of the app.
// Run: node_modules/electron/dist/electron.exe tools/tower-chat-shots.js <outDir>
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
dialog.showErrorBox = () => {};
process.on("uncaughtException", (e) => console.log("UNCAUGHT", e && e.message));
const out = process.argv[2] || path.join(__dirname, "shots");
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
  wc.on("console-message", (e) => { const l = e.level, m = e.message; if (l === "error" || l === 3 || l === "warning") console.log("CONSOLE", l, String(m).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  const run = (js) => wc.executeJavaScript(js);
  const key = async (k, mods) => { wc.sendInputEvent({ type: "keyDown", keyCode: k, modifiers: mods || [] }); wc.sendInputEvent({ type: "keyUp", keyCode: k, modifiers: mods || [] }); await sleep(450); };
  const shot = async (name) => { await wc.capturePage(); await sleep(300); fs.writeFileSync(path.join(out, name), (await wc.capturePage()).toPNG()); console.log("saved", name); };
  const st = () => run(`JSON.stringify({open: HQTowerChat.isOpen(), par: document.getElementById("console").parentElement.id || document.getElementById("console").parentElement.className, cur: S.cur, title: document.getElementById("twc-t").textContent, btn: !document.getElementById("tw-chatbtn").classList.contains("hidden"), dot: !document.querySelector(".twc-dot").classList.contains("hidden"), conv: document.getElementById("conv-pick").options.length, focus: document.activeElement.id})`);
  await sleep(2500);
  await run(`HQView("tower")`); await sleep(1500);
  console.log("ext", await st());
  await run(`HQTower.demo(true)`);
  await run(`HQTower.enter("Lumen")`); await sleep(2600);
  console.log("in Lumen", await st());
  await key("c"); console.log("after C", await st());
  await sleep(600); await shot("tower-floor-chat.png");
  // typing then Esc: panel stays
  await run(`document.getElementById("input").value="hello"; document.getElementById("input").focus(); 0`);
  await key("Escape"); console.log("Esc with text", await st());
  await run(`document.getElementById("input").value=""; 0`);
  await key("Escape"); console.log("Esc empty", await st());
  await key("k", ["control"]); console.log("Ctrl+K", await st());
  await key("Escape"); console.log("Esc again", await st());
  // 'c' while typing must not toggle
  await key("c"); await run(`document.getElementById("input").focus(); 0`); await key("c"); console.log("c typed in input", await st(), await run(`document.getElementById("input").value`));
  await run(`document.getElementById("input").value=""; 0`);
  // hop to another floor keeps panel open and switches the project
  await run(`HQTower.hop("Clips")`); await sleep(2200); console.log("hop Clips", await st());
  // back to HQ: console returns
  await run(`HQTower.exit()`); await sleep(1800); console.log("exit", await st());
  await run(`HQView("hq")`); await sleep(1000);
  console.log("HQ", await st(), await run(`JSON.stringify({sib: [...document.getElementById("console").parentElement.children].map(c=>c.id||c.className).join(","), send: !!document.getElementById("btn-send"), log: document.getElementById("log").childElementCount})`));
  await run(`document.getElementById("input").focus(); 0`); await key("k", ["control"]); console.log("HQ ctrl+k focus", await run(`document.activeElement.id`));
  // unread dot
  await run(`HQView("tower")`); await sleep(1200);
  await run(`HQTower.enter("Lumen")`); await sleep(2600);
  await run(`HQTowerChat.unread.add(S.projects.find(p=>p.name==="Lumen").id); HQTowerChat.paintBtn(); 0`); await sleep(500);
  console.log("unread", await st()); await shot("tower-floor-unread.png");
  await key("c"); console.log("open clears dot", await st());
  await run(`HQTowerChat.close(); HQTower.exit(); 0`); await sleep(1800);
  // deck + lobby
  await run(`HQTower.enter("COMMAND DECK")`); await sleep(2600); console.log("deck", await st());
  await key("c"); console.log("deck open", await st()); await shot("tower-deck-chat.png");
  await run(`HQTower.hop("LOBBY")`); await sleep(2200); console.log("lobby", await st());
  await run(`HQTower.exit()`); await sleep(1800);
  // stonks
  await run(`HQTower.enter("stonks")`); await sleep(3200); console.log("stonks", await st()); await shot("tower-stonks-nochat.png");
  await run(`document.getElementById("tw-chatbtn").click()`); await sleep(900); console.log("stonks open", await st()); await shot("tower-stonks-chat.png");
  await run(`HQTowerChat.close(); 0`); await sleep(400);
  await key("Escape"); console.log("esc stonks", await run(`HQTower.state.mode`));
  app.exit(0);
});
