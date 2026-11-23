// HOME screen: greeting + navigation cards floating over the Nebula (nebula.js draws the brain behind them).
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s), view = $("#nebula-view"), greetEl = $("#hm-greet"), cardsEl = $("#hm-cards");
  if (!view || !greetEl || !cardsEl) return;
  const H = { typer: 0, settle: 0, needs: null, running: null };
  const CARDS = [
    { id: "hq", name: "HQ", sub: () => (H.needs == null ? "command center" : H.needs + (H.needs === 1 ? " item needs you" : " items need you")), hot: () => H.needs > 0 },
    { id: "tower", name: "TOWER", sub: () => (H.running == null ? "a floor per project" : H.running + " working"), hot: () => H.running > 0 },
    { id: "floor", name: "TRADING FLOOR", sub: () => "research desks" },
  ];
  CARDS.forEach((c) => {
    const b = document.createElement("button"); b.className = "hm-card" + (c.off ? " off" : ""); b.dataset.id = c.id; b.disabled = !!c.off;
    b.innerHTML = '<span class="hm-n"></span><span class="hm-s"></span>'; b.querySelector(".hm-n").textContent = c.name;
    if (!c.off) b.onclick = () => window.HQView(c.id); cardsEl.append(b); c.el = b;
  });
  function paint() { for (const c of CARDS) { c.el.querySelector(".hm-s").textContent = c.sub(); c.el.classList.toggle("hot", !!(c.hot && c.hot())); } }
  async function refresh() {
    try { const n = await hq.needs(); H.needs = n.reduce((a, p) => a + p.items.length, 0); } catch (e) {}
    try { const a = await hq.agents(); H.running = window.HQActivity ? HQActivity.total() : a.filter((x) => x.status === "running").length; } catch (e) {}
    paint();
  }
  hq.on("agents", (a) => { H.running = window.HQActivity ? HQActivity.total() : (a || []).filter((x) => x.status === "running").length; paint(); });
if (window.HQActivity) HQActivity.on(() => { H.running = HQActivity.total(); paint(); });
  hq.on("todo-changed", () => { if (view.classList.contains("home-on")) refresh(); });

  const text = () => (typeof greet === "function" ? greet() : "Welcome.");
  function welcome() {
    clearInterval(H.typer); clearTimeout(H.settle);
    const full = text(), t0 = performance.now();
    view.classList.remove("settled"); view.classList.add("welcoming"); greetEl.textContent = "";
    H.typer = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / 1500); greetEl.textContent = full.slice(0, Math.ceil(full.length * k)); if (k >= 1) clearInterval(H.typer); }, 40);
    H.settle = setTimeout(() => { view.classList.add("settled"); view.classList.remove("welcoming"); }, 3600);
    if (window.HQNebula) window.HQNebula.gather(3000);
  }
  function settled() { clearInterval(H.typer); clearTimeout(H.settle); greetEl.textContent = text(); view.classList.remove("welcoming"); view.classList.add("settled"); }
  window.HQHome = {
    show(on, doWelcome) {
      view.classList.toggle("home-on", on);
      if (!on) { clearInterval(H.typer); clearTimeout(H.settle); return; }
      refresh(); if (doWelcome) welcome(); else settled();
    },
  };
})();
