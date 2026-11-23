// NEBULA tab: 3D force graph of every note and its links (3d-force-graph + three + bloom, bundled in vendor/nebula-lib.js).
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const view = $("#nebula-view"), stage = $("#nb-stage");
  if (!view || !window.NebulaLib) return;
  const { ForceGraph3D, THREE, UnrealBloomPass } = window.NebulaLib;

  const N = { data: null, g: null, objs: new Map(), hidden: new Set(), ghosts: false, sel: null, hover: null, on: false, scanAt: 0, rotTimer: 0, nb: new Map(), loading: false, mode: null, tw: null, dust: null, dustA: 0, raf: 0, gather: 0 };
  const saveMode = (m) => { try { localStorage.setItem("nbMode", m); } catch (e) {} try { hq.set({ nebulaMode: m }); } catch (e) {} };
  N.mode = (() => { try { return localStorage.getItem("nbMode") === "graph" ? "graph" : "brain"; } catch (e) { return "brain"; } })();
  const hue = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h * 137.508) % 360; };
  const col = (n) => n.kind === "core" ? new THREE.Color("#ffffff") : n.kind === "ghost" ? new THREE.Color("#6a7a92") : new THREE.Color().setHSL(hue(n.project) / 360, 0.85, n.kind === "project" ? 0.62 : 0.58);
  const accCol = () => new THREE.Color((getComputedStyle(document.documentElement).getPropertyValue("--acc") || "#19e3d0").trim() || "#19e3d0");

  // soft radial glow texture, shared by every sprite
  const glowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.18, "rgba(255,255,255,.85)"); g.addColorStop(.45, "rgba(255,255,255,.22)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  })();
  function labelSprite(text, color) {
    const c = document.createElement("canvas"), x = c.getContext("2d"); x.font = "600 44px Consolas, monospace";
    const w = Math.ceil(x.measureText(text).width) + 20; c.width = w; c.height = 64; x.font = "600 44px Consolas, monospace";
    x.textBaseline = "middle"; x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 14; x.fillText(text, 10, 34);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    s.scale.set(w / 64 * 7, 7, 1); return s;
  }
  function radius(n) { return n.kind === "core" ? 11 : n.kind === "project" ? 9 + Math.sqrt(n.size || 0) * 0 + Math.min(10, (n.notes || 0) * 0.12) : n.kind === "ghost" ? 2.2 : 2.6 + Math.sqrt(n.deg || 0) * 1.7; }

  function makeObj(n) {
    const grp = new THREE.Group(), color = col(n), r = radius(n);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: n.kind === "ghost" ? 0.3 : n.kind === "note" ? 0.55 : 0.85 }));
    sp.scale.set(r * 3.4, r * 3.4, 1); grp.add(sp);
    const core = new THREE.Mesh(new THREE.SphereGeometry(r * (n.kind === "note" || n.kind === "ghost" ? 0.34 : 0.5), 16, 12), new THREE.MeshBasicMaterial({ color: n.kind === "ghost" ? color : color.clone().lerp(new THREE.Color("#ffffff"), 0.6), transparent: true, opacity: n.kind === "ghost" ? 0.5 : 1 }));
    grp.add(core);
    if (n.kind === "project" || n.kind === "core") { const l = labelSprite(n.kind === "core" ? "RULES" : n.name.toUpperCase(), "#" + color.getHexString()); l.position.set(0, -(r * 1.1 + 4), 0); grp.add(l); }
    N.objs.set(n.id, { grp, sp, core, base: sp.material.opacity, cbase: core.material.opacity });
    return grp;
  }

  function build() {
    const d = N.data; if (!d || !N.g) return;
    const vis = (n) => !N.hidden.has(n.project) || n.kind === "core";
    const old = new Map(); (N.g.graphData().nodes || []).forEach((n) => old.set(n.id, n));
    const notesBy = {}; d.nodes.forEach((n) => { if (n.kind === "note") notesBy[n.project] = (notesBy[n.project] || 0) + 1; });
    const nodes = d.nodes.filter((n) => vis(n) && (N.ghosts || n.kind !== "ghost")).map((n) => {
      const o = old.get(n.id); const c = Object.assign({}, n, { notes: notesBy[n.project] || 0 });
      if (o) { c.x = o.x; c.y = o.y; c.z = o.z; } return c;
    });
    const ids = new Set(nodes.map((n) => n.id));
    const links = d.links.filter((l) => ids.has(l.source.id || l.source) && ids.has(l.target.id || l.target)).map((l) => ({ source: l.source.id || l.source, target: l.target.id || l.target, type: l.type }));
    N.nb = new Map(); links.forEach((l) => { if (l.type !== "link") return; (N.nb.get(l.source) || N.nb.set(l.source, new Set()).get(l.source)).add(l.target); (N.nb.get(l.target) || N.nb.set(l.target, new Set()).get(l.target)).add(l.source); });
    N.fitted = false; N.objs.clear();
    if (N.mode === "brain") { const gath = N.gather; N.gather = 0; brainPin(nodes, gath); }
    N.g.graphData({ nodes, links });
    if (N.tw) N.tw.nodes = nodes;
    N.g.d3ReheatSimulation();
    $("#nb-count").textContent = d.nodes.filter((n) => n.kind !== "ghost" && n.kind !== "project" && n.kind !== "core").length + " notes · " + d.links.filter((l) => l.type === "link").length + " links · " + d.nodes.filter((n) => n.kind === "ghost").length + " ghosts";
    N.sel && paintSel();
  }

  const linkColor = (l) => {
    const s = l.source.id || l.source, t = l.target.id || l.target;
    if (l.type === "orbit") return "rgba(120,160,220,0.06)";
    if (N.sel && (s === N.sel || t === N.sel)) { const a = accCol(); return "rgba(" + Math.round(a.r * 255) + "," + Math.round(a.g * 255) + "," + Math.round(a.b * 255) + ",0.8)"; }
    const c = col(l.source.kind ? l.source : { kind: "note", project: "x" }); return "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255) + "," + (N.sel ? 0.08 : 0.32) + ")";
  };
  function paintSel() {
    const nb = N.sel ? (N.nb.get(N.sel) || new Set()) : null, a = accCol();
    for (const [id, o] of N.objs) {
      const hot = !N.sel || id === N.sel || nb.has(id);
      o.sp.material.opacity = o.base * (hot ? 1 : 0.18); o.core.material.opacity = o.cbase * (hot ? 1 : 0.25);
      o.sp.material.color.copy(id === N.sel ? a : o.sp.userData.c || (o.sp.userData.c = o.sp.material.color.clone()));
    }
    N.g.linkColor(linkColor).linkDirectionalParticles((l) => (l.type === "orbit" ? 0 : N.sel && ((l.source.id || l.source) === N.sel || (l.target.id || l.target) === N.sel) ? 3 : 1));
  }

  // ---- brain layout: fixed targets on a brain, one lobe per project ----
  function brainTargets(nodes) {
    const by = {}; N.data.nodes.forEach((n) => { if (n.kind === "note") by[n.project] = (by[n.project] || 0) + 1; });
    const ids = N.data.projects.map((p) => p.id).sort((a, b) => (by[b] || 0) - (by[a] || 0) || (a < b ? -1 : 1));
    const key = ids.join("|"); if (!N.brain || N.brainKey !== key) { N.brain = HQBrain.layout(ids); N.brainKey = key; N.dustBuilt = false; }
    N.brain.reset(); const t = new Map();
    const ord = nodes.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const n of ord) t.set(n.id, n.kind === "core" ? N.brain.core() : n.kind === "project" ? N.brain.centroid(n.project) : N.brain.place(n.project));
    return t;
  }
  // pin nodes at their brain targets (scatter first when gathering for the welcome)
  function brainPin(nodes, gather) {
    const t = brainTargets(nodes);
    for (const n of nodes) {
      const to = t.get(n.id); n.__to = to;
      if (gather) { const a = Math.random() * 6.2832, b = Math.acos(2 * Math.random() - 1), r = 330 + Math.random() * 380; n.x = r * Math.sin(b) * Math.cos(a); n.y = r * Math.sin(b) * Math.sin(a); n.z = r * Math.cos(b); }
      if (n.x == null) { n.x = to[0]; n.y = to[1]; n.z = to[2]; }
      n.__from = [n.x, n.y, n.z]; n.fx = n.x; n.fy = n.y; n.fz = n.z;
    }
    N.tw = { nodes, t0: performance.now(), ms: gather || 2000 };
    if (!N.on || !gather) { /* tween only runs while visible; snap when hidden */ }
    buildDust();
  }
  function buildDust() {
    if (N.dust && N.dustBuilt) return; N.dustBuilt = true;
    if (N.dust) { N.g.scene().remove(N.dust); N.dust.geometry.dispose(); N.dust.material.dispose(); }
    const d = N.brain.dust(3600), colr = new Float32Array(3600 * 3), cs = d.ids.map((id) => new THREE.Color().setHSL(hue(id) / 360, 0.7, 0.55));
    for (let i = 0; i < 3600; i++) { const c = cs[d.lobe[i]] || new THREE.Color("#7aa6ff"); const k = 0.55 + Math.random() * 0.6; colr.set([c.r * k, c.g * k, c.b * k], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(d.pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(colr, 3));
    N.dust = new THREE.Points(g, new THREE.PointsMaterial({ size: 4, map: glowTex, alphaTest: 0.01, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    N.dust.visible = false; N.g.scene().add(N.dust);
  }
  function setMode(m, quiet) {
    if (m === N.mode && !quiet) return; N.mode = m; if (!quiet) saveMode(m);
    const b = $("#nb-mode"); if (b) { b.textContent = m === "brain" ? "◉ brain" : "✶ graph"; b.classList.toggle("on", m === "brain"); }
    if (!N.g || !N.data) return;
    const nodes = N.g.graphData().nodes;
    if (m === "brain") { brainPin(nodes, 0); for (const n of nodes) { n.fx = n.x; n.fy = n.y; n.fz = n.z; } }
    else { N.tw = null; for (const n of nodes) { n.fx = n.fy = n.fz = undefined; } N.g.d3ReheatSimulation(); N.fitted = false; }
  }
  // welcome: every star starts far out and gathers into the brain
  function gather(ms) {
    N.mode = "brain"; setMode("brain", true);
    if (N.g) N.g.cameraPosition({ x: 560, y: 300, z: 760 }, { x: 0, y: 0, z: 0 }, 0);
    if (N.data && N.g) { N.gather = ms; build(); } else N.gather = ms;
  }
  function loop(now) {
    if (!N.on) { N.raf = 0; return; }
    N.raf = requestAnimationFrame(loop);
    if (N.tw && N.tw.nodes) {
      const k = Math.min(1, (now - N.tw.t0) / N.tw.ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      for (const n of N.tw.nodes) if (n.__from) { const f = n.__from, t = n.__to; n.fx = f[0] + (t[0] - f[0]) * e; n.fy = f[1] + (t[1] - f[1]) * e; n.fz = f[2] + (t[2] - f[2]) * e; }
      N.g.d3ReheatSimulation(); if (k >= 1) { N.tw = null; N.fitted = false; }
    }
    if (N.dust) {
      N.dustA += ((N.mode === "brain" ? 1 : 0) - N.dustA) * 0.04; N.dust.visible = N.dustA > 0.01;
      N.dust.material.opacity = N.dustA * (0.5 + 0.2 * Math.sin(now * 0.0011)); const s = 1 + 0.008 * Math.sin(now * 0.0011); N.dust.scale.set(s, s, s);
    }
  }

  function fly(n, dist) {
    if (!n || n.x == null) return;
    const d = dist || (n.kind === "project" ? 160 : n.kind === "core" ? 260 : 110), r = Math.hypot(n.x, n.y, n.z) || 1;
    N.g.cameraPosition({ x: n.x + (n.x / r) * d, y: n.y + (n.y / r) * d * 0.4 + 8, z: n.z + (n.z / r) * d + 1 }, n, 1100);
    pauseRot();
  }
  function pauseRot() { const c = N.g && N.g.controls(); if (!c) return; c.autoRotate = false; clearTimeout(N.rotTimer); N.rotTimer = setTimeout(() => { if (c) c.autoRotate = !N.sel; }, 9000); }

  function select(id) {
    const gn = N.g.graphData().nodes.find((n) => n.id === id); if (!gn) return;
    N.sel = id; paintSel(); fly(gn); panel(gn);
  }
  function deselect() { N.sel = null; $("#nb-panel").classList.add("hidden"); paintSel(); }
  function panel(n) {
    const p = $("#nb-panel"), nb = [...(N.nb.get(n.id) || [])].map((id) => N.data.nodes.find((x) => x.id === id)).filter(Boolean);
    const projName = (N.data.projects.find((x) => x.id === n.project) || {}).name || n.project;
    p.classList.remove("hidden"); p.textContent = "";
    const h = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; p.append(e); return e; };
    const x = h("button", "nb-x ghost", "✕"); x.onclick = deselect;
    h("div", "nb-k", n.kind === "ghost" ? "UNRESOLVED LINK" : n.kind === "project" ? "PROJECT" : n.kind === "core" ? "SHARED RULES" : "NOTE · " + projName);
    h("div", "nb-t", n.name);
    if (n.path) h("div", "nb-p", n.path);
    if (n.tags && n.tags.length) h("div", "nb-tags", n.tags.map((t) => "#" + t).join("  "));
    if (n.path) { const b = h("button", "nb-open ghost", n.kind === "project" ? "open folder" : "open in editor"); b.onclick = () => hq.openPath(n.path); }
    if (n.kind === "project") nb.push(...N.data.nodes.filter((x) => x.project === n.id.slice(5) && x.kind === "note").sort((a, b) => b.deg - a.deg).slice(0, 12));
    h("div", "nb-k", (n.kind === "project" ? "TOP NOTES" : "LINKED (" + nb.length + ")"));
    const list = h("div", "nb-list");
    nb.slice(0, 80).forEach((m) => { const r = document.createElement("div"); r.className = "nb-item"; r.textContent = (m.kind === "ghost" ? "◌ " : "● ") + m.name; r.style.setProperty("--c", "#" + col(m).getHexString()); r.onclick = () => select(m.id); list.append(r); });
    if (!nb.length) h("div", "nb-p", "no links");
  }

  function chips() {
    const box = $("#nb-chips"); box.textContent = "";
    for (const p of N.data.projects) {
      const b = document.createElement("button"); b.className = "nb-chip" + (N.hidden.has(p.id) ? " off" : ""); b.textContent = p.name;
      b.style.setProperty("--c", "#" + new THREE.Color().setHSL(hue(p.id) / 360, 0.85, 0.6).getHexString());
      b.onclick = () => { N.hidden.has(p.id) ? N.hidden.delete(p.id) : N.hidden.add(p.id); b.classList.toggle("off"); build(); };
      box.append(b);
    }
  }

  function stars() {
    const n = 1800, pos = new Float32Array(n * 3), colr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 1800 + Math.random() * 1800, t = Math.random() * 6.2832, p = Math.acos(2 * Math.random() - 1);
      pos.set([r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p)], i * 3);
      const k = 0.35 + Math.random() * 0.65, w = Math.random(); colr.set([k * (0.8 + 0.2 * w), k * 0.9, k * (1 - 0.15 * w)], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(colr, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size: 7, map: glowTex, alphaTest: 0.01, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
  }

  function init() {
    if (N.g) return;
    const g = N.g = ForceGraph3D({ controlType: "orbit" })(stage)
      .backgroundColor("#000000").showNavInfo(false)
      .nodeThreeObject(makeObj).nodeThreeObjectExtend(false)
      .nodeLabel((n) => '<div class="nb-tip"><b>' + esc(n.name) + "</b><span>" + esc(((N.data.projects.find((p) => p.id === n.project) || {}).name) || (n.kind === "core" ? "shared rules" : "")) + (n.kind === "ghost" ? " · unresolved" : "") + "</span></div>")
      .linkColor(linkColor).linkOpacity(1).linkWidth((l) => (l.type === "orbit" ? 0 : 0.3))
      .linkDirectionalParticles((l) => (l.type === "orbit" ? 0 : 1)).linkDirectionalParticleSpeed(0.006).linkDirectionalParticleWidth(1.3)
      .linkDirectionalParticleColor((l) => { const a = accCol(); return "#" + a.getHexString(); })
      .d3VelocityDecay(0.3).cooldownTicks(260).onEngineStop(() => { if (!N.fitted && N.on) { N.fitted = true; N.g.zoomToFit(900, 60); } })
      .onNodeClick((n) => select(n.id)).onBackgroundClick(deselect)
      .onNodeHover((n) => { stage.style.cursor = n ? "pointer" : ""; });
    g.d3Force("link").distance((l) => (l.type === "orbit" ? ((l.source.id || l.source) === "core" ? 230 : 34) : 60)).strength((l) => (l.type === "orbit" ? ((l.source.id || l.source) === "core" ? 0.5 : 0.6) : 0.09));
    g.d3Force("charge").strength((n) => (n.kind === "project" ? -260 : n.kind === "core" ? -400 : -26));
    g.scene().add(stars());
    const comp = g.postProcessingComposer();
    N.bloom = new UnrealBloomPass(new THREE.Vector2(stage.clientWidth || 800, stage.clientHeight || 600), 0.6, 0.55, 0.3);
    comp.addPass(N.bloom);
    const c = g.controls(); c.autoRotate = true; c.autoRotateSpeed = 0.45; c.enableDamping = true; c.dampingFactor = 0.08;
    c.addEventListener("start", pauseRot);
    g.camera().far = 9000; g.camera().updateProjectionMatrix();
    g.cameraPosition({ x: 0, y: 160, z: 520 });
    fit();
    new ResizeObserver(fit).observe(stage);
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function fit() { if (!N.g) return; const w = stage.clientWidth, h = stage.clientHeight; if (w > 0 && h > 0) { N.g.width(w).height(h); N.bloom && N.bloom.setSize(w, h); } }

  async function scan(force) {
    if (N.loading) return; N.loading = true; $("#nb-refresh").classList.add("spin");
    try {
      const d = await hq.graphScan(!!force); N.data = d; N.scanAt = Date.now();
      if (d.err) $("#nb-count").textContent = "scan failed: " + d.err; else { chips(); build(); }
    } catch (e) { $("#nb-count").textContent = "scan failed: " + e.message; }
    N.loading = false; $("#nb-refresh").classList.remove("spin");
  }

  // visible tab = render loop running; hidden = paused so CPU stays low
  function show(on) {
    N.on = !!on;
    if (!on) { if (N.g) N.g.pauseAnimation(); return; }
    init(); fit(); N.g.resumeAnimation(); if (!N.raf) N.raf = requestAnimationFrame(loop);
    if (!N.data || Date.now() - N.scanAt > 60000) scan(false); else if (N.sel) paintSel();
  }

  // search
  const inp = $("#nb-search"), res = $("#nb-results");
  function find(q) { q = q.trim().toLowerCase(); if (!q || !N.data) return []; return N.data.nodes.filter((n) => n.name.toLowerCase().includes(q) && (N.ghosts || n.kind !== "ghost") && !N.hidden.has(n.project)).sort((a, b) => (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1) || b.deg - a.deg).slice(0, 8); }
  inp.oninput = () => { const r = find(inp.value); res.textContent = ""; res.classList.toggle("hidden", !r.length); r.forEach((n) => { const d = document.createElement("div"); d.className = "nb-item"; d.textContent = n.name + "  ·  " + n.project; d.style.setProperty("--c", "#" + col(n).getHexString()); d.onmousedown = () => { select(n.id); res.classList.add("hidden"); inp.value = ""; }; res.append(d); }); };
  inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") { const r = find(inp.value); if (r[0]) { select(r[0].id); inp.value = ""; res.classList.add("hidden"); } } else if (e.key === "Escape") { inp.value = ""; res.classList.add("hidden"); inp.blur(); } };
  inp.onblur = () => setTimeout(() => res.classList.add("hidden"), 150);
  $("#nb-ghosts").onclick = (e) => { N.ghosts = !N.ghosts; e.currentTarget.classList.toggle("on", N.ghosts); build(); };
  $("#nb-refresh").onclick = () => scan(true);
  $("#nb-mode").onclick = () => setMode(N.mode === "brain" ? "graph" : "brain");
  setMode(N.mode, true);
  $("#nb-back").onclick = () => window.HQView("hq");
  hq.on("todo-changed", () => { if (N.on) scan(true); else N.scanAt = 0; });

  window.HQNebula = { show, scan, gather, setMode, select: (id) => N.g && select(id), _state: N };
})();
