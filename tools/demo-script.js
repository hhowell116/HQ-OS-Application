// The walkthrough itself (human pacing). Skipped steps are noted in the log, never fatal.
const path = require("path");
module.exports = async (c) => {
  const { run, val, move, click, drag, wheel, pause, sleep, step, W, H } = c;
  const at = async (sel, i = 0) => JSON.parse(await val(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${i}];if(!e)return "null";const r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})})()`));
  const clickSel = async (sel, i = 0) => { const p = await at(sel, i); if (!p) { console.log("SKIP missing", sel); return false; } await click(p.x, p.y); return true; };
  const hoverSel = async (sel, i = 0) => { const p = await at(sel, i); if (p) await move(p.x, p.y, 700); return !!p; };
  const wav = require("./demo-sample.js").music(path.join(c.tmp, "demo-track.wav"));
  await c.sleep(2500);
  await run(`HQView("hq")`); await sleep(700); await run(`HQView("home")`); await sleep(5000);
  if (!c.PROBE) await c.startRec();
  // 1. Home: orbit the brain, click an orb, zoom back out
  step("1 home brain"); await move(W * 0.25, H * 0.5, 900); await pause(1500, 2000);
  await drag(380, -60, 1800); await pause(1200, 1800); await drag(-260, 90, 1600); await pause(1200, 1600);
  const orb = JSON.parse(await val(`(()=>{const g=HQNebula._state.g;const n=g.graphData().nodes.find(n=>n.kind==="project"&&/atlas/i.test(n.name))||g.graphData().nodes.find(n=>n.kind==="project");if(!n)return "null";const p=g.graph2ScreenCoords(n.x,n.y,n.z);const b=document.getElementById("nebula-view").getBoundingClientRect();return JSON.stringify({x:Math.round(p.x+b.left),y:Math.round(p.y+b.top)})})()`));
  if (orb) { await move(orb.x, orb.y, 1000); await sleep(500); await click(); await pause(2500, 3200); await run(`document.querySelector(".nb-x")&&document.querySelector(".nb-x").click()`); await sleep(600); await move(W / 2, H / 2, 800); await wheel(240, 14); await pause(1500, 2200); }
  else console.log("SKIP orb");
  // 2. HQ with the chat closed, projects, Needs Review
  step("2 hq"); await clickSel('.tabs button[data-view="hq"]'); await pause(2000, 2600);
  if ((await val(`document.getElementById("console").classList.contains("collapsed")`)) === false) { await clickSel("#btn-hide"); await pause(1500, 2000); }
  await hoverSel(".proj", 1); await sleep(900); await clickSel(".proj", 1); await pause(1800, 2400); await clickSel(".proj", 0); await pause(1800, 2400);
  await hoverSel("#p-rev .rev-item", 0); await sleep(800);
  await clickSel("#p-rev .rev-item", 0); await pause(1800, 2400); await clickSel("#rv-ok"); await pause(1800, 2400);
  await clickSel("#p-rev .rev-item", 0); await pause(1500, 2000); await clickSel("#rv-ok"); await pause(1800, 2400);
  await clickSel(".proj", 1); await pause(1500, 2000); await clickSel("#p-rev .rev-item", 0); await pause(1500, 2000); await clickSel("#rv-ok"); await pause(1800, 2200);
  await clickSel(".proj", 0); await pause(1200, 1600);
  // 3. chat: hidden above, now open
  step("3 chat open"); await clickSel("#btn-hide"); await pause(2500, 3200);
  // 4. music + visualizer
  step("4 music"); await clickSel("#btn-hide"); await sleep(1200);
  c.meta.musicStart = Date.now(); await run(`window.__a=new Audio(${JSON.stringify(require("url").pathToFileURL(wav).href)});window.__a.loop=true;window.__a.volume=0.7;window.__a.play().catch(e=>console.error("playerr "+e.message));renderMusic({title:"Neon Arpeggio",artist:"HQ OS Sample",playing:true,app:"HQ OS Demo",cover:""})`);
  await pause(2500, 3000); await clickSel("#viz"); await pause(3500, 4500); await clickSel("#viz"); await pause(3500, 4500);
  // 5. Tower exterior
  step("5 tower"); await clickSel('.tabs button[data-view="tower"]'); await sleep(1500); await move(W * 0.62, H * 0.35, 900); await pause(4500, 5500);
  // 6. lobby, select a floor, next floor, up again
  step("6 lobby"); await run(`HQTower.enter("__lobby")`); await pause(4500, 5500);
  await move(W * 0.4, H * 0.5, 1100); await sleep(1200);
  await run(`HQTower.hop("Atlas")`); await pause(4000, 4800);
  await run(`HQTower.hop("Beacon")`); await pause(4000, 4800);
  await run(`HQTower.hop("Cinder")`); await pause(4000, 4800);
  // 7. terminal, close chat
  step("7 terminal"); const t = JSON.parse(await val(`JSON.stringify(HQTower.termXY())`));
  if (t) { await move(t.x, t.y, 1100); await sleep(700); await click(); await pause(3500, 4500); await run(`HQTowerChat.close()`); await pause(2500, 3200); } else console.log("SKIP terminal");
  // 8. zoom out, hover every floor
  step("8 zoom out"); await run(`HQTower.exit()`); await pause(3500, 4200);
  const n = await val(`document.querySelectorAll("#tw-labels > *").length`);
  for (let i = n - 1; i >= 0; i--) { if (!(await hoverSel("#tw-labels > *", i))) continue; await pause(1100, 1500); }
  // 9. trading floor
  step("9 trading floor"); await run(`HQGoStonks()`); await pause(5000, 6000);
  await move(W * 0.7, H * 0.5, 1200); await pause(2500, 3000); await move(W * 0.3, H * 0.45, 1500); await pause(2500, 3200);
  await run(`HQTower.exit()`); await pause(3000, 3500); c.meta.musicEnd = Date.now(); await run(`window.__a&&window.__a.pause()`);
  if (!c.PROBE) await c.stopRec();
};
