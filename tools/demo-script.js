// The walkthrough itself (quick pacing). Skipped steps are noted in the log, never fatal.
// Flow: brain (fast, camera mostly pulled back, click two nodes) -> cursor to HQ tab -> show chat (sample chat) -> tower tour.
const path = require("path");
module.exports = async (c) => {
  const { run, val, move, click, drag, wheel, pause, sleep, step, W, H } = c;
  const at = async (sel, i = 0) => JSON.parse(await val(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${i}];if(!e)return "null";const r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})})()`));
  const clickSel = async (sel, i = 0) => { const p = await at(sel, i); if (!p) { console.log("SKIP missing", sel); return false; } await click(p.x, p.y); return true; };
  const hoverSel = async (sel, i = 0) => { const p = await at(sel, i); if (p) await move(p.x, p.y, 450); return !!p; };
  await c.sleep(2500);
  await run(`S.person="";window.greet=()=>"Welcome back.";document.getElementById("greet").textContent=greet()`);
  await run(`HQView("hq")`); await sleep(700); await run(`HQView("home")`); await sleep(5500); await run(`document.getElementById("hm-greet").textContent=greet()`);
  // visible fake cursor (sendInputEvent does not move the OS cursor): follows page mouse events, ring pulse on click
  await run(`(()=>{const d=document.createElement("div");d.id="fakecur";d.style.cssText="position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 0 4px #000)";d.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l16 10-7 1.5L8.5 21z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';document.body.append(d);const ring=document.createElement("div");ring.style.cssText="position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #0ff;z-index:2147483646;pointer-events:none;opacity:0";document.body.append(ring);addEventListener("mousemove",e=>{d.style.transform="translate("+e.clientX+"px,"+e.clientY+"px)"},true);addEventListener("mousedown",e=>{ring.style.transition="none";ring.style.transform="translate("+e.clientX+"px,"+e.clientY+"px) scale(.6)";ring.style.opacity="1";requestAnimationFrame(()=>requestAnimationFrame(()=>{ring.style.transition="opacity .45s, transform .45s";ring.style.transform="translate("+e.clientX+"px,"+e.clientY+"px) scale(1.5)";ring.style.opacity="0"}))},true)})()`);
  // sample chat (fake text only); chat starts hidden
  await run(`S.conv={id:"demo",title:"Plan the Atlas launch",proj:"Atlas",model:"",msgs:[{r:"user",text:"Can you outline the launch checklist for Atlas?"},{r:"asst",blocks:[{k:"tool",name:"Read",target:"Notes/Launch Plan.md",result:"12 lines"},{k:"text",text:"Here is a short checklist:\\n\\n1. Freeze the feature list\\n2. Run the full test pass\\n3. Draft the release notes\\n4. Schedule the announcement\\n\\nWant me to turn this into tasks on the board?"}]},{r:"user",text:"Yes, add them as Next items."},{r:"asst",blocks:[{k:"text",text:"Done. Four items added under Next in the Atlas To-Do."}]}]};S.hideChat=true;S.follow=true;renderLog()`);
  // sample agents working (fake board rows, shown on their floors) + simulated visualizer levels (no audio at all)
  await run(`(()=>{const now=Date.now(),L=["Planning the sprint tasks.","Writing the trail search module.","Drafting issue 12.","Pairing the sensor driver.","Running the test pass 14/32.","Reviewing the pricing page."],mk=(n,p,i,k)=>({id:"smp-"+n,kind:"board",name:n,role:n,proj:p,status:"running",steps:[{kind:"tool",text:"Read · Notes/Plan.md",t:now-90000},{kind:"tool",text:"Edit · src/"+n.split("-")[1]+".js",t:now-40000+i*500},{kind:"say",text:L[i%L.length],t:now-8000-i*1500}],files:[{p:"src/a.js",op:"edit"}]});HQActivity.setDemo([mk("atlas-planner","Atlas",0),mk("atlas-builder","Atlas",1),mk("beacon-writer","Beacon",2),mk("cinder-integrator","Cinder",3),mk("cinder-tester","Cinder",4),mk("harbor-analyst","Harbor",5),{id:"smp-gen",kind:"chat",name:"General chat",role:"HQ console",proj:"General",status:"running",steps:[{kind:"say",text:"Planning the week.",t:now-5000}]}]);const A=window.HQAudio;A.on=true;A.read=function(){const t=performance.now()/1000;let tot=0;for(let i=0;i<32;i++){const v=Math.max(0,Math.min(1,0.45+0.3*Math.sin(t*2.6+i*0.55)+0.2*Math.sin(t*5.1+i*1.3)))*(1-i/60);this.bands[i]=v;tot+=v}this.level=tot/32;this.bass=(this.bands[1]+this.bands[2]+this.bands[3]+this.bands[4])/4};window.HQViz&&HQViz.wake()})()`);
  const cam0 = await val(`JSON.stringify(HQNebula._state.g.cameraPosition())`);
  const nodeXY = async (re) => JSON.parse(await val(`(()=>{const g=HQNebula._state.g;const ns=g.graphData().nodes.filter(n=>n.kind==="project");const n=ns.find(n=>${re}.test(n.name))||ns[0];if(!n)return "null";const p=g.graph2ScreenCoords(n.x,n.y,n.z);const b=document.getElementById("nebula-view").getBoundingClientRect();return JSON.stringify({x:Math.round(p.x+b.left),y:Math.round(p.y+b.top)})})()`));
  const pickNode = async (re) => {
    const o = await nodeXY(re); if (!o) { console.log("SKIP node", re); return; }
    await move(o.x, o.y, 450); const o2 = await nodeXY(re); if (o2) await move(o2.x, o2.y, 120);
    await click(); await pause(1700, 2000);
    await run(`document.querySelector(".nb-x")&&document.querySelector(".nb-x").click()`);
    await run(`HQNebula._state.g.cameraPosition(${cam0},{x:0,y:0,z:0},900)`); await pause(1200, 1500);
  };
  if (!c.PROBE) await c.startRec();
  // 1. Brain: quick orbit, click a node, back out, click another, back out
  step("1 home brain"); await move(W * 0.3, H * 0.5, 500); await pause(500, 700);
  await drag(300, -50, 900); await pause(400, 600); await drag(-200, 70, 800); await pause(400, 600);
  await pickNode(/atlas/i); await pickNode(/beacon/i);
  // 2. cursor to the HQ tab, click; 3. show chat, nothing else
  step("2 hq"); await clickSel('.tabs button[data-view="hq"]'); await pause(1500, 1800);
  step("3 show chat"); await clickSel("#btn-hide"); await pause(3500, 4200);
  // 4. Tower exterior (same tour, quicker)
  step("5 tower"); await clickSel('.tabs button[data-view="tower"]'); await sleep(1200); await move(W * 0.62, H * 0.35, 600); await pause(2200, 2600);
  step("6 lobby"); await run(`HQTower.enter("__lobby")`); await pause(2200, 2600);
  await move(W * 0.4, H * 0.5, 700); await sleep(600);
  await run(`HQTower.hop("Atlas")`); await pause(2000, 2400);
  step("agent detail"); if (await clickSel(".tw-r.on")) { await pause(2600, 3000); if (c.PROBE) await c.shot("agent-card"); await clickSel(".tw-cx"); await pause(500, 700); }
  await run(`HQTower.hop("Beacon")`); await pause(2000, 2400);
  await run(`HQTower.hop("Cinder")`); await pause(2000, 2400);
  step("7 terminal"); const t = JSON.parse(await val(`JSON.stringify(HQTower.termXY())`));
  if (t) { await move(t.x, t.y, 700); await sleep(400); await click(); await pause(1800, 2200); await run(`HQTowerChat.close()`); await pause(1300, 1600); } else console.log("SKIP terminal");
  step("8 zoom out"); await run(`HQTower.exit()`); await pause(1800, 2100);
  const n = await val(`document.querySelectorAll("#tw-labels > *").length`);
  for (let i = n - 1; i >= 0; i--) { if (!(await hoverSel("#tw-labels > *", i))) continue; await pause(550, 750); }
  step("9 trading floor"); await run(`HQGoStonks()`); await pause(2600, 3000);
  await move(W * 0.7, H * 0.5, 800); await pause(1000, 1200);
  step("data view"); if (!(await clickSel("#fl-dvbtn"))) await run(`HQFloor.dataView()`); await pause(3000, 3500); if (c.PROBE) await c.shot("data-view"); await run(`HQFloor.dataView(false)`); await pause(2200, 2600);
  await run(`HQTower.exit()`); await pause(1600, 1900); 
  if (!c.PROBE) await c.stopRec();
};
