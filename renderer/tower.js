// TOWER: a procedural neon-noir glass skyscraper, one floor per project (original art, no external assets).
// Exterior: slow orbit, hover a floor, click or scroll in to fly through the glass. Interior: that project's specialists at desks.
// Live activity (HQActivity) lights floors up from outside. Uses the three.js instance bundled in vendor/nebula-lib.js.
(function () {
  "use strict";
  const view = document.getElementById("tower-view");
  if (!view || !window.NebulaLib || !window.HQActivity) return;
  const { THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = window.NebulaLib;
  const $ = (s) => view.querySelector(s);
  const stage = $("#tw-stage"), labelsEl = $("#tw-labels"), svg = $("#tw-lines"), tagsEl = $("#tw-tags"), hud = $("#tw-hud"), rosterEl = $("#tw-roster"), subEl = $("#tw-sub"), hintEl = $("#tw-hint");
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const hueOf = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const FH = 3.2, LH = 4.6, SPIRE = 8, MAXD = 10;
  let accRgb = [25, 227, 208]; if (window.HQTheme) HQTheme.onAccent((rgb) => (accRgb = rgb));

  // ---------- state ----------
  const T = { on: false, ready: false, floors: [], sig: "", projects: [], teams: { projects: {}, core: [] }, hover: null, cur: null, mode: "ext", flight: null, e: 0, drag: null, az: 0.7, el: 0.17, k: 1, autoAz: true, groups: { byProj: new Map(), deck: [], total: 0 }, lastFrame: 0, demo: false, feed: [], fseen: new Map(), feedPaint: "" };
  let renderer, composer, bloom, scene, camera, tower, city, rain, rainMat, win, winMirror, deskLights, interior = null, clock0 = performance.now();
  let winData = [], R0 = 50, lookY = 18, totalH = 40;
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(-9, -9), tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), ONE = new THREE.Vector3(1, 1, 1);

  const phrase = (s) => { if (!s) return ""; const t = s.kind === "tool" ? s.text.replace(/^(\w+) · /, (m, n) => ({ Bash: "Running ", PowerShell: "Running ", Read: "Reading ", Edit: "Editing ", Write: "Writing ", Grep: "Searching ", Glob: "Looking for ", WebFetch: "Fetching ", WebSearch: "Searching the web for ", Agent: "Briefing a sub-agent: ", TodoWrite: "Updating the plan " }[n] || n + ": ")) : s.text; return t.length > 110 ? t.slice(0, 107) + "…" : t; };
  const stepOf = (it) => (it.steps && it.steps.length ? phrase(it.steps[it.steps.length - 1]) : it.step ? phrase({ kind: "say", text: it.step }) : "working");

  // ---------- data from the app ----------
  function projectList() {
    if (typeof S === "undefined" || typeof activeProjects !== "function") return [];
    return activeProjects().map((p) => ({ id: p.id, name: p.name, accent: p.accent, folder: p.folder, next: p.next || 0, wait: p.wait || 0, review: p.review || 0, hasTodo: p.hasTodo }));
  }
  // bottom to top: remembered order, new projects go on top
  function ordered(list) {
    let saved = []; try { saved = JSON.parse(localStorage.getItem("twOrder") || "[]"); } catch (e) {}
    const ids = list.map((p) => p.id), order = saved.filter((id) => ids.includes(id));
    for (const id of ids) if (!order.includes(id)) order.push(id);
    try { localStorage.setItem("twOrder", JSON.stringify(order)); } catch (e) {}
    return order.map((id) => list.find((p) => p.id === id));
  }
  const slugOf = (p) => norm(p.name);
  const shortName = (name, proj) => { const s = String(name), pre = slugOf(proj); const parts = s.split("-"); return parts.length > 1 && norm(parts[0]) === pre ? parts.slice(1).join("-") : s; };
  const teamOf = (pid) => (T.teams.projects[pid] || []);

  function refreshTeams() { if (window.hq && hq.teams) hq.teams().then((t) => { if (t) { T.teams = t; if (interior) syncInterior(); } }).catch(() => {}); }

  // ---------- scene setup ----------
  function ensure() {
    if (T.ready) return; T.ready = true;
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setClearColor(0x03040a, 1);
    stage.appendChild(renderer.domElement); renderer.domElement.style.display = "block";
    scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x080a1a, 0.0105);
    camera = new THREE.PerspectiveCamera(38, 1.6, 0.1, 900);
    composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.62, 0.55, 0.3); composer.addPass(bloom); composer.addPass(new OutputPass());
    buildSky(); buildGround(); buildCity(); buildRain();
    tower = new THREE.Group(); scene.add(tower);
    new ResizeObserver(resize).observe(view); resize();
    bindInput();
  }
  function resize() {
    if (!renderer) return; const b = view.getBoundingClientRect(), w = Math.max(2, Math.floor(b.width)), h = Math.max(2, Math.floor(b.height));
    renderer.setSize(w, h, false); renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
    composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); bloom.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); fit();
  }
  function fit() { // camera distance so the whole tower fills ~74% of the height (and fits the width)
    if (!camera) return; const f = THREE.MathUtils.degToRad(38), vh = (totalH / 0.74) / 2 / Math.tan(f / 2), hw = (17 * 1.9) / 2 / (Math.tan(f / 2) * camera.aspect);
    R0 = Math.max(vh, hw); lookY = totalH * 0.46;
  }

  function buildSky() {
    const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 top=vec3(.006,.009,.03), mid=vec3(.035,.018,.10), hor=vec3(.26,.045,.22); vec3 c = mix(hor, mid, smoothstep(0.0,.22,h)); c = mix(c, top, smoothstep(.18,.85,h)); c = mix(c, vec3(.012,.014,.035), smoothstep(0.0,-.12,h)); gl_FragColor = vec4(c,1.0); }" });
    const s = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), m); s.renderOrder = -10; scene.add(s);
  }
  function buildGround() {
    const g = new THREE.Mesh(new THREE.CircleGeometry(420, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x03050b })); scene.add(g);
    const grid = new THREE.GridHelper(300, 75, 0x0e4a5c, 0x07202c); grid.position.y = 0.02; grid.material.transparent = true; grid.material.opacity = 0.55; scene.add(grid);
    const ring = new THREE.Mesh(new THREE.RingGeometry(12.5, 12.9, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x19e3d0).multiplyScalar(1.4) })); ring.position.y = 0.05; scene.add(ring);
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function buildCity() {
    const N = 150, bg = new THREE.BoxGeometry(1, 1, 1), bm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), im = new THREE.InstancedMesh(bg, bm, N);
    const palette = [0x19e3d0, 0xff2e93, 0xf5b83d, 0x8a5cff, 0x4dabf7].map((c) => new THREE.Color(c)), wins = [];
    let seed = 7; const sr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < N; i++) {
      const a = sr() * Math.PI * 2, r = 34 + Math.pow(sr(), 0.8) * 110, w = 4 + sr() * 7, d = 4 + sr() * 7, h = (5 + sr() * 24) * (0.25 + r / 75), x = Math.cos(a) * r, z = Math.sin(a) * r;
      tmpM.compose(tmpV.set(x, h / 2, z), tmpQ.identity(), new THREE.Vector3(w, h, d)); im.setMatrixAt(i, tmpM);
      const sh = 0.003 + sr() * 0.006; im.setColorAt(i, tmpC.setRGB(sh * 0.8, sh, sh * 1.6));
      const nw = Math.floor(10 + h * 0.9);
      for (let k = 0; k < nw; k++) {
        const f = Math.floor(sr() * 4), u = (sr() - 0.5) * 0.8, y = 1 + sr() * (h - 2), q = new THREE.Vector3(), rot = f * Math.PI / 2, off = 0.02;
        const lw = f % 2 ? d : w, hx = (f % 2 ? w : d) / 2;
        q.set(Math.sin(rot) * (hx + off) + Math.cos(rot) * u * lw, y, Math.cos(rot) * (hx + off) - Math.sin(rot) * u * lw);
        wins.push({ p: [x + q.x, y, z + q.z], rot, c: palette[Math.floor(sr() * palette.length)], v: 0.45 + sr() * 1.1 });
      }
    }
    city = new THREE.Group(); city.add(im);
    const wm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.FrontSide }), wi = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.55, 0.8), wm, wins.length);
    wins.forEach((w, i) => { tmpM.compose(tmpV.set(w.p[0], w.p[1], w.p[2]), tmpQ.setFromEuler(tmpE.set(0, w.rot, 0)), ONE); wi.setMatrixAt(i, tmpM); wi.setColorAt(i, tmpC.copy(w.c).multiplyScalar(w.v)); });
    city.add(wi); city.userData.mats = [bm, wm]; city.children.forEach((c) => (c.renderOrder = -5)); scene.add(city);
  }
  function buildRain() {
    const N = 1100, pos = new Float32Array(N * 6), aT = new Float32Array(N * 2), spd = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { const x = rnd(-80, 80), y = rnd(0, 80), z = rnd(-80, 80), s = rnd(34, 52); for (let v = 0; v < 2; v++) { pos.set([x, y, z], i * 6 + v * 3); aT[i * 2 + v] = v; spd[i * 2 + v] = s; } }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aT", new THREE.BufferAttribute(aT, 1)); g.setAttribute("aS", new THREE.BufferAttribute(spd, 1));
    rainMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uA: { value: 0.16 } },
      vertexShader: "uniform float uTime; attribute float aT; attribute float aS; void main(){ float y = mod(position.y - uTime * aS, 80.0); vec3 p = vec3(position.x + (80.0 - y) * 0.06, y + aT * 1.5, position.z); gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }",
      fragmentShader: "uniform float uA; void main(){ gl_FragColor = vec4(0.45,0.7,1.0,uA); }" });
    rain = new THREE.LineSegments(g, rainMat); rain.frustumCulled = false; rain.renderOrder = -4; scene.add(rain);
  }

  // ---------- tower build ----------
  function floorColor(p) { if (p && p.accent) { try { return new THREE.Color(p.accent); } catch (e) {} } return new THREE.Color(`hsl(${hueOf(p ? p.name : "x")},85%,58%)`); }
  const disposeGroup = (g) => { g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); }); };

  function rebuild(list) {
    if (!T.ready) return;
    for (const c of [...tower.children]) { tower.remove(c); disposeGroup(c); }
    if (win) { win.dispose && win.dispose(); }
    T.floors = []; winData = []; labelsEl.textContent = ""; svg.textContent = "";
    const defs = [{ kind: "lobby", id: "__lobby", name: "LOBBY", color: new THREE.Color(0x19e3d0) }].concat(list.map((p) => ({ kind: "project", id: p.id, name: p.name, p, color: floorColor(p) })), [{ kind: "deck", id: "__deck", name: "COMMAND DECK", color: new THREE.Color(`rgb(${accRgb[0]},${accRgb[1]},${accRgb[2]})`) }]);
    const n = defs.length; let y = 0;
    const edgeG = [];
    defs.forEach((d, i) => {
      const h = d.kind === "lobby" ? LH : FH, t = i / Math.max(1, n - 1), w = d.kind === "lobby" ? 17 : 14.2 - 3.2 * t, g = new THREE.Group(); g.position.y = y; tower.add(g);
      const f = Object.assign(d, { i, y0: y, h, w, group: g, act: 0, hov: 0, n: 0, fade: 1, mats: [], pulse: 0 });
      const add = (m, base) => { m.transparent = true; f.mats.push({ m, base }); return m; };
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.22, w), add(new THREE.MeshBasicMaterial({ color: f.color.clone().multiplyScalar(0.35), opacity: 0.09, depthWrite: false, side: THREE.DoubleSide }), 0.09)); glass.position.y = h / 2 + 0.11; g.add(glass); f.glass = glass;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.22, w + 0.3), add(new THREE.MeshBasicMaterial({ color: 0x080d16 }), 1)); slab.position.y = 0.11; g.add(slab);
      f.edge = new THREE.MeshBasicMaterial({ color: f.color.clone() }); add(f.edge, 1);
      for (const [sx, sz, rw, rd] of [[0, 1, w + 0.36, 0.07], [0, -1, w + 0.36, 0.07], [1, 0, 0.07, w + 0.36], [-1, 0, 0.07, w + 0.36]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.08, rd), f.edge); b.position.set(sx * (w + 0.3) / 2, 0.23, sz * (w + 0.3) / 2); g.add(b); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14), add(new THREE.MeshBasicMaterial({ color: 0x0a1018 }), 1)); m.position.set(sx * w / 2, h / 2, sz * w / 2); g.add(m); }
      f.glowMat = add(new THREE.MeshBasicMaterial({ color: f.color.clone(), opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(w - 0.5, h - 0.5, w - 0.5), f.glowMat); glow.position.y = h / 2 + 0.11; g.add(glow); f.glow = glow;
      f.ringMat = add(new THREE.MeshBasicMaterial({ color: f.color.clone().multiplyScalar(1.6), opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0);
      f.ring = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.16, w + 0.5), f.ringMat); f.ring.position.y = 0.25; g.add(f.ring);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, h, w + 0.4), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = h / 2; hit.userData.floor = f; g.add(hit); f.hit = hit;
      // windows: one row of tall panes on every face
      const cols = Math.max(4, Math.floor((w - 1) / 1.55)), ww = (w - 1.2) / cols - 0.32;
      for (let side = 0; side < 4; side++) for (let c = 0; c < cols; c++) winData.push({ f, side, c, cols, ww, base: Math.random() < 0.35 ? 0.02 : 0.06 + Math.random() * 0.13, ph: Math.random() * 6.28, warm: Math.random() < 0.25 });
      if (d.kind === "deck") {
        const m1 = add(new THREE.MeshBasicMaterial({ color: 0x0a1018 }), 1), m2 = new THREE.MeshBasicMaterial({ color: f.color.clone().multiplyScalar(1.5) }); add(m2, 1);
        const crown = new THREE.Mesh(new THREE.BoxGeometry(w - 2.4, 1.0, w - 2.4), m1); crown.position.y = h + 0.5; g.add(crown);
        const cr2 = new THREE.Mesh(new THREE.BoxGeometry(w - 5, 0.9, w - 5), m1); cr2.position.y = h + 1.45; g.add(cr2);
        const band = new THREE.Mesh(new THREE.BoxGeometry(w - 2.3, 0.07, w - 2.3), m2); band.position.y = h + 1.0; g.add(band);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, SPIRE, 8), m2); mast.position.y = h + 1.9 + SPIRE / 2; g.add(mast);
        f.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), add(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2e93).multiplyScalar(2) }), 1)); f.beacon.position.y = h + 1.9 + SPIRE; g.add(f.beacon);
      }
      T.floors.push(f); y += h;
    });
    totalH = y + 1.9 + SPIRE; fit();
    // all tower windows in one instanced mesh (+ a faint mirrored copy in the wet street)
    const wg = new THREE.PlaneGeometry(1, 1), wm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, side: THREE.FrontSide });
    win = new THREE.InstancedMesh(wg, wm, winData.length); win.frustumCulled = false; win.instanceMatrix.setUsage(THREE.StaticDrawUsage); win.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(winData.length * 3), 3);
    winMirror = new THREE.InstancedMesh(wg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false }), winData.length); winMirror.frustumCulled = false; winMirror.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(winData.length * 3), 3);
    winData.forEach((d, i) => {
      const f = d.f, half = f.w / 2 + 0.03, u = (d.c - (d.cols - 1) / 2) * ((f.w - 1.2) / d.cols), rot = d.side * Math.PI / 2, wh = f.h - 1.1;
      const px = Math.sin(rot) * half + Math.cos(rot) * u, pz = Math.cos(rot) * half - Math.sin(rot) * u, py = f.y0 + f.h / 2 + 0.11;
      tmpM.compose(tmpV.set(px, py, pz), tmpQ.setFromEuler(tmpE.set(0, rot, 0)), new THREE.Vector3(d.ww, wh, 1)); win.setMatrixAt(i, tmpM);
      tmpM.compose(tmpV.set(px, -py, pz), tmpQ.setFromEuler(tmpE.set(0, rot, 0)), new THREE.Vector3(d.ww, -wh, 1)); winMirror.setMatrixAt(i, tmpM); d.idx = i;
    });
    tower.add(win); tower.add(winMirror);
    // little monitor glows inside each floor (visible through the glass): one per team member / worker
    deskLights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.34, 0.06), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), T.floors.length * MAXD); deskLights.frustumCulled = false; deskLights.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(T.floors.length * MAXD * 3), 3); tower.add(deskLights);
    T.floors.forEach((f) => {
      f.dl = []; const k = MAXD; for (let j = 0; j < k; j++) { const a = (j / k) * Math.PI * 2 + f.i, r = f.w / 2 - 1.5; f.dl.push({ idx: f.i * MAXD + j, x: Math.cos(a) * r, z: Math.sin(a) * r, a }); }
      f.lbl = makeLabel(f);
    });
    labelsEl.dataset.n = String(T.floors.length);
  }

  function makeLabel(f) {
    const b = el("div", "tw-lab " + f.kind), n = el("div", "tw-ln"), s = el("div", "tw-ls"), bd = el("div", "tw-badge hidden");
    const fl = f.kind === "project" ? "F" + f.i : f.kind === "deck" ? "TOP" : "G"; n.append(el("span", "tw-fl", fl), el("span", "tw-nm", f.name.toUpperCase())); n.append(bd); b.append(n, s);
    b.style.setProperty("--fc", "#" + f.color.getHexString());
    b.onmouseenter = () => (T.hover = f); b.onmouseleave = () => { if (T.hover === f) T.hover = null; }; b.onclick = () => activate(f);
    labelsEl.append(b); const ln = document.createElementNS("http://www.w3.org/2000/svg", "line"); svg.append(ln); return { box: b, stat: s, badge: bd, line: ln, h: 46 };
  }
  function paintLabels() {
    const lst = projectList(), by = new Map(lst.map((p) => [p.id, p]));
    for (const f of T.floors) {
      const l = f.lbl; if (!l) continue; let st = "";
      if (f.kind === "project") { const p = by.get(f.id); if (p) st = (p.hasTodo ? p.next + " next" : "no to-do") + " · " + p.wait + " need you · " + p.review + " review"; }
      else if (f.kind === "deck") st = "HQ host · " + T.teams.core.length + " core agents · command deck";
      else st = "entrance · open HQ";
      l.stat.textContent = st;
      l.badge.classList.toggle("hidden", !f.n); l.badge.textContent = "● " + f.n + " working";
      l.box.classList.toggle("act", f.n > 0);
    }
  }

  // ---------- activity -> floors ----------
  function applyActivity() {
    const projs = T.floors.filter((f) => f.kind === "project").map((f) => ({ id: f.id, name: f.name, folder: f.p.folder }));
    T.groups = HQActivity.groups(projs); let total = 0;
    for (const f of T.floors) { f.n = f.kind === "project" ? (T.groups.byProj.get(f.id) || []).length : f.kind === "deck" ? T.groups.deck.length : 0; total += f.n; }
    paintLabels(); trackFeed();
    // monitor glows
    if (deskLights) for (const f of T.floors) { const team = f.kind === "project" ? Math.min(MAXD, Math.max(teamOf(f.id).length + 0, f.n)) : f.kind === "deck" ? Math.min(MAXD, T.teams.core.length + 1) : 0; f.nDesk = team; }
    subEl.textContent = (T.floors.length - 2) + " floors · " + total + " working" + (HQActivity.isDemo() ? " · DEMO (Ctrl+D to exit)" : "");
    if (interior) syncInterior();
  }
  HQActivity.on(() => { if (T.ready) applyActivity(); });

  const fadeEl = document.getElementById("tw-fade");
  // ---------- command deck feed: newest agent steps first (6 lines, fading) ----------
  const feedEl = document.getElementById("tw-feed");
  function trackFeed() {
    let ch = false;
    for (const it of HQActivity.list()) {
      const s = stepOf(it); if (!s || s === "working" || T.fseen.get(it.id) === s) continue; T.fseen.set(it.id, s); ch = true;
      T.feed.unshift({ n: String(it.name).replace(/^C--Users-Hhowe-(Projects-)?/i, "").slice(0, 26), t: s, hue: hueOf(it.name) }); if (T.feed.length > 6) T.feed.pop();
    }
    if (T.fseen.size > 200) T.fseen.clear();
    if (ch || T.feedPaint !== T.feed.length + "|" + (T.feed[0] ? T.feed[0].t : "")) paintFeed();
  }
  function paintFeed() {
    if (!feedEl) return; T.feedPaint = T.feed.length + "|" + (T.feed[0] ? T.feed[0].t : ""); feedEl.textContent = "";
    if (!T.feed.length) feedEl.append(el("div", "tw-fe", "All quiet. Standing by."));
    T.feed.forEach((f, i) => { const r = el("div", "tw-fe"); r.style.setProperty("--c", `hsl(${f.hue},85%,64%)`); r.style.opacity = (1 - i * 0.15).toFixed(2); r.append(el("b", "", f.n + ": "), document.createTextNode(f.t)); feedEl.append(r); });
  }

  // ---------- per-frame floor + window animation ----------
  function animateFloors(t, dt) {
    const e = T.e, cur = T.cur;
    for (const f of T.floors) {
      const target = f.n > 0 ? 1 : 0; f.act += (target - f.act) * Math.min(1, dt * 3);
      f.hov += ((T.hover === f && e < 0.2 ? 1 : 0) - f.hov) * Math.min(1, dt * 10);
      f.fade = cur && f !== cur ? 1 - e : 1; const inFloor = cur === f ? 1 - e : 1;
      const pulse = Math.sin(t * 3.2 + f.i) * 0.5 + 0.5;
      f.edge.color.copy(f.color).multiplyScalar((0.5 + 1.0 * f.act + 0.5 * pulse * f.act + 0.9 * f.hov) * (f.kind === "lobby" ? 1.3 : 1));
      f.glowMat.opacity = (f.act * (0.06 + 0.05 * pulse) + f.hov * 0.06) * f.fade * inFloor;
      const ph = (t * 0.7 + f.i * 0.37) % 1; f.ring.scale.set(1 + ph * 0.1, 1, 1 + ph * 0.1); f.ringMat.opacity = f.act * (1 - ph) * 0.55 * f.fade * inFloor;
      for (const o of f.mats) if (o.base > 0) o.m.opacity = o.base * f.fade * (o === f.mats[0] ? (cur === f ? 1 - e * 0.85 : 1) : 1);
      f.group.visible = f.fade > 0.01; if (f.lbl) f.lbl.box.style.setProperty("--hv", f.hov.toFixed(2));
      if (f.beacon) { f.beacon.material.color.setRGB(2.2 * (0.5 + 0.5 * Math.sin(t * 2.4)) + 0.2, 0.2, 0.7); }
    }
    // windows
    const col = win.instanceColor.array, mc = winMirror.instanceColor.array;
    for (let i = 0; i < winData.length; i++) {
      const d = winData[i], f = d.f; let v = d.base + (1.3 + 0.4 * Math.sin(t * 2.7 + d.ph) - d.base) * f.act;
      v += f.hov * 0.3; if (f.kind === "lobby") v = Math.max(v, 0.55); v *= f.fade;
      const c = f.color, wr = d.warm && f.act < 0.5 ? 0.45 : 0, r = c.r + (1 - c.r) * wr + 0.0, g = c.g + (0.8 - c.g) * wr, b = c.b + (0.45 - c.b) * wr;
      col[i * 3] = r * v; col[i * 3 + 1] = g * v; col[i * 3 + 2] = b * v; mc[i * 3] = col[i * 3]; mc[i * 3 + 1] = col[i * 3 + 1]; mc[i * 3 + 2] = col[i * 3 + 2];
    }
    win.instanceColor.needsUpdate = true; winMirror.instanceColor.needsUpdate = true;
    // monitor glows (through the glass)
    const dc = deskLights.instanceColor.array; let upd = false;
    for (const f of T.floors) {
      const items = f.kind === "project" ? T.groups.byProj.get(f.id) || [] : [], team = f.kind === "project" ? teamOf(f.id).length : 0;
      const cnt = f.kind === "lobby" ? 0 : Math.min(MAXD, Math.max(team, items.length, f.kind === "deck" ? 3 : 0));
      for (let j = 0; j < MAXD; j++) {
        const s = f.dl[j], on = j < f.n, show = j < cnt;
        tmpM.compose(tmpV.set(Math.cos(s.a) * (f.w / 2 - 1.6), f.y0 + 1.1, Math.sin(s.a) * (f.w / 2 - 1.6)), tmpQ.setFromEuler(tmpE.set(0, -s.a + Math.PI / 2, 0)), show ? ONE : tmpV.set(0.0001, 0.0001, 0.0001)); deskLights.setMatrixAt(s.idx, tmpM);
        const v = (on ? 1.6 + 0.5 * Math.sin(t * 5 + j * 2) : 0.18) * f.fade * (cur === f ? 1 - e : 1);
        dc[s.idx * 3] = f.color.r * v; dc[s.idx * 3 + 1] = f.color.g * v; dc[s.idx * 3 + 2] = f.color.b * v; upd = true;
      }
    }
    deskLights.instanceMatrix.needsUpdate = true; deskLights.instanceColor.needsUpdate = upd;
    for (const m of city.userData.mats) m.opacity = 1 - e * 0.45;
  }

  // ---------- camera ----------
  const orbitPos = (az, el, r, ly) => new THREE.Vector3(Math.sin(az) * Math.cos(el) * r, ly + Math.sin(el) * r, Math.cos(az) * Math.cos(el) * r);
  function intCam(f) { const fy = f.y0 + 0.22, hw = f.w / 2 - 0.35;
    if (f.kind === "lobby") return { pos: new THREE.Vector3(0.2, fy + 2.4, 5.6), look: new THREE.Vector3(0.2, fy + 1.7, -4), fov: 54 };
    if (f.kind === "deck") return { pos: new THREE.Vector3(0, fy + 2.5, hw - 0.3), look: new THREE.Vector3(0, fy + 1.15, -1.3), fov: 58 };
    return { pos: new THREE.Vector3(0, fy + 2.55, hw - 0.4), look: new THREE.Vector3(0, fy + 0.85, -hw * 0.3), fov: 54 }; }
  function updateCamera(t, dt) {
    const fl = T.flight;
    if (T.mode === "ext" && !fl) {
      if (T.autoAz && !T.drag) T.az += dt * 0.05;
      camera.fov = 38; camera.position.copy(orbitPos(T.az, T.el, R0 * T.k, lookY)); camera.lookAt(0, lookY, 0); camera.updateProjectionMatrix(); return;
    }
    if (T.mode === "int" && !fl) {
      const ic = intCam(T.cur); camera.fov = ic.fov; camera.position.copy(ic.pos); camera.position.x += Math.sin(t * 0.18) * 0.28; camera.lookAt(ic.look); camera.updateProjectionMatrix(); return;
    }
    if (fl.dir === "enter") {
      const k = clamp((performance.now() - fl.t0) / fl.dur, 0, 1), L = interior && interior.lobby, e = ease(k);
      if (L) L.open = clamp(k / 0.35, 0, 1);
      const tgt = new THREE.Vector3(fl.look.x, 1.7, fl.look.z + 1.2); camera.position.lerpVectors(fl.from, tgt, ease(clamp((k - 0.12) / 0.88, 0, 1))); camera.lookAt(fl.look); camera.fov = 54; camera.updateProjectionMatrix();
      fadeEl.style.opacity = clamp((k - 0.62) / 0.38, 0, 1);
      if (k >= 1) { T.flight = null; if (window.HQView) window.HQView("hq"); setTimeout(() => (fadeEl.style.opacity = 0), 250); }
      return;
    }
    if (fl.dir === "hop") { // lobby directory click: elevator ride straight to another floor (no trip outside)
      const k = clamp((performance.now() - fl.t0) / fl.dur, 0, 1), e = ease(k), a = intCam(fl.from), b = intCam(fl.floor);
      if (k >= 0.5 && !fl.swapped) { fl.swapped = true; T.cur = fl.floor; buildInterior(fl.floor); paintHud(); }
      T.e = 1 - 0.55 * Math.sin(Math.PI * k);
      camera.position.lerpVectors(a.pos, b.pos, e); camera.lookAt(new THREE.Vector3().lerpVectors(a.look, b.look, e)); camera.fov = 54; camera.updateProjectionMatrix();
      if (k >= 1) { T.flight = null; T.e = 1; }
      return;
    }
    const k = clamp((performance.now() - fl.t0) / fl.dur, 0, 1), e = ease(k), ic = intCam(fl.floor), tz = fl.dir === "in" ? e : 1 - e;
    T.e = tz;
    const azT = fl.azT, az = fl.az0 + (azT - fl.az0) * clamp(tz * 1.5, 0, 1), r = R0 * fl.k0, op = orbitPos(az, fl.el0 + (0.05 - fl.el0) * tz, r, lookY);
    camera.position.lerpVectors(op, ic.pos, ease(tz)); const lk = new THREE.Vector3(0, lookY, 0).lerp(ic.look, ease(tz)); camera.lookAt(lk);
    camera.fov = 38 + (ic.fov - 38) * ease(tz); camera.updateProjectionMatrix();
    if (k >= 1) { T.flight = null; if (fl.dir === "in") { T.mode = "int"; T.e = 1; } else { T.mode = "ext"; T.e = 0; destroyInterior(); T.cur = null; hud.classList.add("hidden"); } }
  }
  function flyIn(f) {
    if (T.flight || T.mode !== "ext") return; T.cur = f; T.hover = null;
    buildInterior(f); const a = T.az, azT = Math.round(a / (Math.PI * 2)) * Math.PI * 2;
    T.flight = { t0: performance.now(), dur: 1200, dir: "in", floor: f, az0: a, azT, el0: T.el, k0: T.k };
    labelsEl.classList.add("gone"); hud.classList.remove("hidden"); hintEl.textContent = "Esc or scroll out · back to the tower"; paintHud();
  }
  function flyOut() {
    if (T.flight || T.mode !== "int") return; const f = T.cur;
    T.flight = { t0: performance.now(), dur: 1200, dir: "out", floor: f, az0: T.az, azT: Math.round(T.az / (Math.PI * 2)) * Math.PI * 2, el0: T.el, k0: T.k }; T.mode = "ext2"; T.autoAz = true;
    labelsEl.classList.remove("gone"); hintEl.textContent = HINT; hud.classList.add("hidden");
  }
  const HINT = "hover a floor · click or scroll in to enter · drag to orbit · Ctrl+D demo · Esc back";
  function activate(f) {
    if (T.flight) return;
    flyIn(f);
  }

  // ---------- interior ----------
  function gridTex(color) {
    const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"); x.fillStyle = "#0a1119"; x.fillRect(0, 0, 128, 128); x.strokeStyle = color; x.globalAlpha = 0.5; x.lineWidth = 2; x.strokeRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function codeTex() {
    const c = document.createElement("canvas"); c.width = 64; c.height = 128; const x = c.getContext("2d"); x.fillStyle = "#0b1a1f"; x.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 7) { const w = 8 + Math.random() * 44, o = Math.random() * 10; x.fillStyle = ["#7ff", "#fc5", "#f6a", "#9f8", "#9cf"][Math.floor(Math.random() * 5)]; x.globalAlpha = 0.85; x.fillRect(4 + o * 0.5, y, w, 3); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function signTex(text, color) {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 160; const x = c.getContext("2d"); x.clearRect(0, 0, 1024, 160);
    x.font = "700 92px 'Segoe UI', Consolas, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.shadowColor = color; x.shadowBlur = 28; x.fillStyle = color; x.fillText(text.toUpperCase().slice(0, 22), 512, 84); x.shadowBlur = 8; x.fillStyle = "#ffffff"; x.fillText(text.toUpperCase().slice(0, 22), 512, 84);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  let codeT = null;

  function box(g, w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; }
  function buildInterior(f) {
    destroyInterior(); const g = new THREE.Group(); g.position.y = f.y0 + 0.22; scene.add(g);
    const hw = f.w / 2 - 0.35, col = "#" + f.color.getHexString(), I = { f, g, hw, members: new Map(), desks: [], tags: [], nDesks: -1, shared: [] };
    codeT = codeT || codeTex();
    const dark = new THREE.MeshStandardMaterial({ color: 0x141d27, roughness: 0.8 }), metal = new THREE.MeshStandardMaterial({ color: 0x0c131b, roughness: 0.5, metalness: 0.4 });
    const floorM = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.2, map: gridTex(col) }); floorM.map.repeat.set(hw, hw);
    const fl = box(g, hw * 2, 0.04, hw * 2, floorM, 0, 0, 0); fl.position.y = 0.01;
    const light = new THREE.HemisphereLight(0x9fc4ff, 0x3a1a55, f.kind === "project" ? 2.2 : 1.7); g.add(light); I.light = light;
    const pl = new THREE.PointLight(f.color.clone(), f.kind === "project" ? 40 : 9, 22, 2); pl.position.set(0, 2.6, 0); g.add(pl);
    const pl2 = new THREE.PointLight(0xffffff, f.kind === "project" ? 26 : 8, 16, 2); pl2.position.set(0, 2.7, -hw * 0.3); g.add(pl2);
    const stripM = new THREE.MeshBasicMaterial({ color: f.color.clone().multiplyScalar(0.9) }); if (f.kind === "project") for (const z of [-hw * 0.65, -hw * 0.15]) box(g, hw * 1.6, 0.05, 0.1, stripM, 0, FH - 0.4, z);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.15), new THREE.MeshBasicMaterial({ map: signTex(f.name, col), transparent: true, depthWrite: false, toneMapped: false })); sign.position.set(0, 2.15, -hw + 0.2); if (f.kind === "project") g.add(sign);
    if (f.kind === "project") { // lounge: sofa, table, plant, coffee machine
    const sofaM = new THREE.MeshStandardMaterial({ color: 0x23304a, roughness: 0.9 });
    box(g, 2.5, 0.42, 0.95, sofaM, -3.3, 0.24, 0.6); box(g, 2.5, 0.62, 0.22, sofaM, -3.3, 0.55, 0.1); box(g, 0.22, 0.55, 0.95, sofaM, -4.6, 0.4, 0.6); box(g, 0.22, 0.55, 0.95, sofaM, -2.0, 0.4, 0.6);
    box(g, 1.3, 0.05, 0.7, metal, -3.3, 0.4, 2.0); box(g, 0.08, 0.38, 0.08, metal, -3.3, 0.2, 2.0); box(g, 1.2, 0.01, 0.6, new THREE.MeshBasicMaterial({ color: f.color.clone().multiplyScalar(0.7) }), -3.3, 0.435, 2.0);
    const pot = box(g, 0.45, 0.5, 0.45, dark, hw - 0.9, 0.25, hw - 1.3); for (let k = 0; k < 3; k++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x1c6b4a, roughness: 0.8 })); leaf.position.set(hw - 0.9 + (k - 1) * 0.14, 0.95, hw - 1.3); leaf.rotation.z = (k - 1) * 0.25; g.add(leaf); }
    box(g, 0.9, 1.7, 0.7, metal, hw - 0.7, 0.85, 0.4); box(g, 0.6, 0.5, 0.02, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2e93).multiplyScalar(0.7) }), hw - 0.7, 1.2, 0.76);
    } I.dark = dark; I.metal = metal; T.interior = I; interior = I; I.hostAt = null;
    if (f.kind === "deck") buildDeck(I); else if (f.kind === "lobby") buildLobby(I);
    syncInterior();
  }
  // ---------- command deck: holographic round table ----------
  const TABLE_R = 1.7, SEAT_R = 2.85;
  function seatsFor(n) { // host at the back (theta 0 = -z), the rest alternate left/right, leaving the camera side open
    const out = [{ x: 0, z: -SEAT_R, yaw: 0 }], m = Math.max(0, n - 1), step = Math.min(0.55, (Math.PI * 0.62) / Math.max(1, Math.ceil(m / 2)));
    for (let k = 0; k < m; k++) { const th = (k % 2 ? 1 : -1) * (Math.floor(k / 2) + 1) * step, x = Math.sin(th) * SEAT_R, z = -Math.cos(th) * SEAT_R; out.push({ x, z, yaw: Math.atan2(-x, -z) }); }
    return out.slice(0, n);
  }
  function makeSeats(I, n) {
    const D = I.deck; if (D.seatG) { I.g.remove(D.seatG); disposeGroup(D.seatG); } D.n = n; D.pads = []; I.seats = seatsFor(n);
    const sg = new THREE.Group(); I.g.add(sg); D.seatG = sg;
    I.seats.forEach((sp) => {
      const g = new THREE.Group(); g.position.set(sp.x, 0, sp.z); g.rotation.y = sp.yaw; sg.add(g);
      box(g, 0.55, 0.08, 0.55, I.dark, 0, 0.48, 0); box(g, 0.5, 0.6, 0.08, I.dark, 0, 0.82, -0.26); box(g, 0.08, 0.46, 0.08, I.metal, 0, 0.23, 0);
      const rr = TABLE_R - 0.32, pg = new THREE.Group(); pg.position.set(Math.sin(Math.atan2(sp.x, -sp.z)) * rr, 0.79, -Math.cos(Math.atan2(sp.x, -sp.z)) * rr); pg.rotation.y = sp.yaw; sg.add(pg);
      const m = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }); box(pg, 0.62, 0.012, 0.3, m, 0, 0, 0); D.pads.push(m);
    });
  }
  function buildDeck(I) {
    const g = I.g, col = I.f.color, c2 = col.clone().multiplyScalar(1.5), D = (I.deck = { n: -1, pads: [], seatG: null }); I.seats = [];
    const addM = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; g.add(m); return m; };
    addM(new THREE.CylinderGeometry(TABLE_R, TABLE_R - 0.08, 0.1, 56), I.metal, 0.72); addM(new THREE.CylinderGeometry(0.55, 0.95, 0.68, 20), I.dark, 0.35);
    addM(new THREE.TorusGeometry(TABLE_R, 0.03, 6, 72).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: c2, toneMapped: false }), 0.775);
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false };
    for (const [r, o] of [[0.75, 0.3], [1.15, 0.2], [1.55, 0.14]]) addM(new THREE.RingGeometry(r, r + 0.035, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial(Object.assign({ color: col, opacity: o }, add)), 0.785);
    D.sweep = addM(new THREE.RingGeometry(1.2, 1.26, 32, 1, 0, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial(Object.assign({ color: col, opacity: 0.4 }, add)), 0.79);
    // hologram: wireframe globe + inner core + two tilted orbit rings, with a light cone down to the table
    const wf = (o) => new THREE.MeshBasicMaterial(Object.assign({ color: col, wireframe: true, opacity: o }, add));
    D.globe = addM(new THREE.SphereGeometry(0.62, 18, 12), wf(0.5), 1.7); D.core = addM(new THREE.IcosahedronGeometry(0.3, 1), wf(0.7), 1.75);
    D.rings = [0.55, -0.7].map((tilt, i) => { const m = addM(new THREE.TorusGeometry(0.95 + i * 0.14, 0.012, 6, 64), new THREE.MeshBasicMaterial(Object.assign({ color: c2, opacity: 0.7 }, add)), 1.7); m.rotation.x = Math.PI / 2 + tilt; return m; });
    D.cone = addM(new THREE.CylinderGeometry(1.0, 0.28, 1.75, 32, 1, true), new THREE.MeshBasicMaterial(Object.assign({ color: col, opacity: 0.05, side: THREE.DoubleSide }, add)), 1.67);
    const pl = new THREE.PointLight(col.clone(), 6, 9, 2); pl.position.set(0, 1.8, 0); g.add(pl); D.pl = pl;
    I.anim = (t) => {
      D.globe.rotation.y = t * 0.45; D.core.rotation.y = -t * 0.8; D.core.rotation.x = t * 0.3; D.sweep.rotation.y = -t * 0.9;
      D.rings[0].rotation.z = t * 0.5; D.rings[1].rotation.z = -t * 0.38; D.cone.material.opacity = 0.03 + 0.01 * Math.sin(t * 1.6); pl.intensity = 5 + 1.5 * Math.sin(t * 2.1);
      for (const o of I.members.values()) { const m = D.pads[o.idx]; if (m) m.color.copy(o.col).multiplyScalar(o.working ? 0.9 + 0.25 * Math.sin(t * 5 + o.ph) : 0.08); }
    };
  }

  // ---------- lobby: reception, directory board, elevators ----------
  const CW = 1820, CH = 700;
  function lobbyLine() { const ps = projectList(), w = T.groups.total, need = ps.reduce((a, x) => a + x.wait, 0); return w ? "Welcome back. " + w + " agent" + (w === 1 ? "" : "s") + " working across the tower." : "Welcome. All quiet" + (need ? ", " + need + " item" + (need === 1 ? "" : "s") + " need you." : "."); }
  function dirRows() {
    const by = new Map(projectList().map((p) => [p.id, p])), rows = [];
    for (let i = T.floors.length - 1; i >= 0; i--) { const f = T.floors[i]; if (f.kind === "lobby") continue; const p = f.kind === "project" ? by.get(f.id) : null; rows.push({ f, fl: f.kind === "deck" ? "TOP" : "F" + f.i, name: f.name, n: f.n, wait: p ? p.wait : 0, deck: f.kind === "deck" }); }
    return rows;
  }
  function drawDir(L) {
    const x = L.ctx, rows = L.rows, hdr = 122, rh = Math.min(78, (CH - hdr - 20) / Math.max(1, rows.length)), acc = "rgb(" + accRgb.join(",") + ")";
    x.clearRect(0, 0, CW, CH); x.fillStyle = "rgba(2,8,13,0.95)"; x.fillRect(0, 0, CW, CH); x.strokeStyle = acc; x.lineWidth = 4; x.globalAlpha = 0.9; x.strokeRect(6, 6, CW - 12, CH - 12); x.globalAlpha = 1;
    x.textBaseline = "middle"; x.shadowColor = acc; x.shadowBlur = 22; x.fillStyle = acc; x.font = "700 56px Consolas, monospace"; x.textAlign = "left"; x.fillText("DIRECTORY", 54, 48);
    x.shadowBlur = 0; x.font = "600 26px Consolas, monospace"; x.fillStyle = "#8fb0c2"; x.fillText("click a floor to ride up", 54, 92);
    x.textAlign = "right"; x.fillText("WORKING", 1330, 100); x.fillText("NEED YOU", 1730, 100);
    L.rh = rh; L.hdr = hdr;
    rows.forEach((r, i) => {
      const y = hdr + i * rh, cy = y + rh / 2, c = "#" + r.f.color.getHexString(), hv = L.hover === i;
      if (hv) { x.fillStyle = "rgba(" + accRgb.join(",") + ",0.16)"; x.fillRect(24, y + 2, CW - 48, rh - 4); }
      x.fillStyle = c; x.fillRect(30, y + 6, 8, rh - 12);
      const fs = Math.round(rh * 0.64); x.font = "700 " + fs + "px Consolas, monospace"; x.shadowColor = c; x.shadowBlur = hv ? 18 : 8; x.fillStyle = c; x.textAlign = "left";
      x.fillText(r.fl, 60, cy); x.fillText(r.name.toUpperCase().slice(0, 22), 175, cy); x.shadowBlur = 0;
      x.textAlign = "right"; x.font = "700 " + Math.round(fs * 0.9) + "px Consolas, monospace";
      x.fillStyle = r.n ? "#ffb02e" : "#4d6678"; x.fillText(r.n ? "● " + r.n + " working" : "idle", 1330, cy);
      x.fillStyle = r.wait ? "#ff5d8f" : "#4d6678"; x.fillText(r.deck ? "core " + T.teams.core.length : r.wait ? r.wait + " need you" : "—", 1730, cy);
    });
    L.tex.needsUpdate = true;
  }
  function buildLobby(I) {
    const g = I.g, hw = I.hw, col = I.f.color, c2 = col.clone().multiplyScalar(1.6), L = (I.lobby = { rows: [], hover: -1, sig: "", btnHov: false, doors: [], rh: 60, hdr: 122 });
    const cv = document.createElement("canvas"); cv.width = CW; cv.height = CH; L.ctx = cv.getContext("2d"); L.tex = new THREE.CanvasTexture(cv); L.tex.colorSpace = THREE.SRGBColorSpace; L.tex.anisotropy = 4;
    const BW = 10.2, BH = 4.2, bx = -2.8, by = 2.35, bz = -hw + 0.15;
    L.board = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: L.tex, transparent: true, depthWrite: false, toneMapped: false })); L.board.position.set(bx, by, bz); g.add(L.board);
    const fm = new THREE.MeshBasicMaterial({ color: col }); for (const [w, h, x, y] of [[BW + 0.1, 0.06, 0, BH / 2], [BW + 0.1, 0.06, 0, -BH / 2], [0.06, BH, -BW / 2, 0], [0.06, BH, BW / 2, 0]]) box(g, w, h, 0.05, fm, bx + x, by + y, bz - 0.02);
    // reception desk + host
    const dg = new THREE.Group(); dg.position.set(3.6, 0, -1.3); g.add(dg);
    box(dg, 3.0, 1.0, 0.7, I.metal, 0, 0.5, 0); box(dg, 3.2, 0.07, 1.0, I.dark, 0, 1.03, 0.05); box(dg, 2.8, 0.04, 0.04, new THREE.MeshBasicMaterial({ color: col }), 0, 0.72, 0.36); box(dg, 2.8, 0.04, 0.04, new THREE.MeshBasicMaterial({ color: col }), 0, 0.18, 0.36);
    box(dg, 0.5, 0.04, 0.3, I.metal, -1.2, 1.09, -0.1); const scr = box(dg, 0.5, 0.3, 0.03, new THREE.MeshBasicMaterial({ map: codeT, color: 0x9fe, toneMapped: false }), -1.2, 1.28, -0.2); scr.rotation.x = -0.2;
    // the glowing HQ door: sliding glass doors under a neon ENTER HQ sign. The door is the button.
    const DX = 6.0, DZ = -hw + 0.2, dgrp = new THREE.Group(); dgrp.position.set(DX, 0, DZ); g.add(dgrp); L.dgrp = dgrp;
    const nm = new THREE.MeshBasicMaterial({ color: c2, toneMapped: false }); L.neon = nm;
    for (const [w, h, x, y] of [[2.9, 0.1, 0, 3.05], [0.1, 3.05, -1.4, 1.52], [0.1, 3.05, 1.4, 1.52]]) box(dgrp, w, h, 0.12, nm, x, y, 0);
    L.glowMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); const gl = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 3.0), L.glowMat); gl.position.set(0, 1.52, -0.05); dgrp.add(gl);
    const gm = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.5), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    L.dl = box(dgrp, 1.32, 3.0, 0.04, gm, -0.67, 1.52, 0.04); L.dr = box(dgrp, 1.32, 3.0, 0.04, gm, 0.67, 1.52, 0.04); box(dgrp, 0.04, 3.0, 0.05, nm, 0, 1.52, 0.06);
    const sg2 = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.56), new THREE.MeshBasicMaterial({ map: signTex("ENTER HQ", "#" + col.getHexString()), color: 0xaaaaaa, transparent: true, depthWrite: false, toneMapped: false })); sg2.position.set(0, 3.55, 0.05); dgrp.add(sg2);
    L.door = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.8), new THREE.MeshBasicMaterial({ visible: false })); L.door.position.set(0, 1.9, 0.1); dgrp.add(L.door); L.glow = 0; L.open = 0; L.doorX = DX; L.doorZ = DZ;
    // elevator bank on the right wall: three cars with sliding doors and a floor-travel marker
    const eg = new THREE.Group(); eg.position.set(hw - 0.25, 0, 0); eg.rotation.y = -Math.PI / 2; g.add(eg);
    const dm = new THREE.MeshStandardMaterial({ color: 0x1a2733, roughness: 0.35, metalness: 0.7 }), sm = new THREE.MeshBasicMaterial({ color: c2 });
    [-6.9, -4.9, -2.9].forEach((z, i) => {
      const cg = new THREE.Group(); cg.position.set(z, 0, 0); eg.add(cg); // the group is turned: local x = world z
      box(cg, 1.5, 2.9, 0.12, I.metal, 0, 1.45, -0.06); box(cg, 1.0, 0.07, 0.05, sm, 0, 2.75, 0.03);
      const a = box(cg, 0.56, 2.4, 0.06, dm, -0.28, 1.2, 0.02), b = box(cg, 0.56, 2.4, 0.06, dm, 0.28, 1.2, 0.02);
      box(cg, 0.05, 0.9, 0.03, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.5) }), 0.88, 1.45, 0.02); const mk = box(cg, 0.09, 0.09, 0.05, sm, 0.88, 1.0, 0.04);
      L.doors.push({ a, b, mk, ph: i * 2.1 });
    });
    const es = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.53), new THREE.MeshBasicMaterial({ map: signTex("ELEVATORS", "#" + col.getHexString()), transparent: true, depthWrite: false, toneMapped: false })); es.position.set(-4.9, 3.5, 0.02); eg.add(es);
    // seating, plants, floor emblem
    const sofaM = new THREE.MeshStandardMaterial({ color: 0x23304a, roughness: 0.9 });
    box(g, 3.0, 0.42, 0.95, sofaM, -6.0, 0.24, 2.4); box(g, 3.0, 0.62, 0.22, sofaM, -6.0, 0.55, 1.9); box(g, 0.22, 0.55, 0.95, sofaM, -7.4, 0.4, 2.4); box(g, 0.22, 0.55, 0.95, sofaM, -4.6, 0.4, 2.4);
    box(g, 1.4, 0.05, 0.8, I.metal, -6.0, 0.4, 3.7); box(g, 0.08, 0.38, 0.08, I.metal, -6.0, 0.2, 3.7);
    for (const [px, pz] of [[hw - 1.0, 3.2], [-hw + 0.7, 1.0]]) { box(g, 0.5, 0.55, 0.5, I.dark, px, 0.27, pz); for (let k = 0; k < 3; k++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.95, 6), new THREE.MeshStandardMaterial({ color: 0x1c6b4a, roughness: 0.8 })); leaf.position.set(px + (k - 1) * 0.15, 1.0, pz); leaf.rotation.z = (k - 1) * 0.25; g.add(leaf); } }
    const em = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.78, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.7), toneMapped: false })); em.position.set(0.5, 0.045, 1.2); g.add(em);
    const em2 = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.95, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.45), toneMapped: false })); em2.position.copy(em.position); g.add(em2);
    const pl3 = new THREE.PointLight(col.clone(), 8, 16, 2); pl3.position.set(-2, 3.4, -4); g.add(pl3);
    let last = 0;
    I.anim = (t, dt) => {
      if (t - last > 0.25 || L.hoverPaint !== L.hover) { last = t; L.rows = dirRows(); const sig = L.rows.map((r) => r.name + r.n + r.wait).join("|") + "#" + L.hover + accRgb.join(","); if (sig !== L.sig) { L.sig = sig; drawDir(L); } L.hoverPaint = L.hover; }
      const tgt = (L.btnHov || L.open > 0 ? 1 : 0); L.glow += (tgt - L.glow) * Math.min(1, dt * 8); L.glowMat.opacity = 0.35 + 0.5 * L.glow + 0.08 * Math.sin(t * 2); L.neon.color.copy(c2).multiplyScalar(1 + 0.8 * L.glow); const sl = L.open * 1.1; L.dl.position.x = -0.67 - sl; L.dr.position.x = 0.67 + sl;
      for (const d of L.doors) { const o = 0.5 * (1 - Math.cos(Math.max(0, Math.sin(t * 0.5 + d.ph) * 2 - 1) * Math.PI)) * 0.5; d.a.position.x = -0.28 - o * 0.45; d.b.position.x = 0.28 + o * 0.45; d.mk.position.y = 0.55 + (0.5 + 0.5 * Math.sin(t * 0.5 + d.ph + 1.2)) * 1.8; }
    };
  }
  function pickLobby() {
    const L = interior && interior.lobby; if (!L) return null;
    ray.setFromCamera(mouse, camera); const h = ray.intersectObjects([L.door, L.board], false)[0]; if (!h) return null;
    if (h.object === L.door) return { type: "hq" };
    const y = (1 - h.uv.y) * CH, i = Math.floor((y - L.hdr) / L.rh); return i >= 0 && L.rows[i] ? { type: "row", i, f: L.rows[i].f } : null;
  }
  function enterHQ() { // push through the glass doors, fade, then switch to HQ
    const L = interior && interior.lobby; if (!L || T.flight || T.mode !== "int") return;
    T.flight = { t0: performance.now(), dur: 1500, dir: "enter", floor: T.cur, from: camera.position.clone(), look: new THREE.Vector3(L.doorX, 1.6, L.doorZ) }; hintEl.textContent = "";
  }
  function hopTo(f) {
    if (T.flight || T.mode !== "int" || !T.cur || f === T.cur) return;
    T.flight = { t0: performance.now(), dur: 1500, dir: "hop", from: T.cur, floor: f, swapped: false }; hintEl.textContent = "riding to " + f.name.toLowerCase();
  }

  function destroyInterior() {
    if (!interior) return; for (const t of interior.tags) t.remove(); tagsEl.textContent = ""; scene.remove(interior.g); disposeGroup(interior.g); interior = null; T.interior = null;
  }

  function makeDesks(I, n) {
    for (const d of I.desks) { I.g.remove(d.g); disposeGroup(d.g); } I.desks = []; I.nDesks = n;
    const rows = n > 5 ? 2 : 1, cols = Math.ceil(n / rows), sp = Math.min(2.5, (I.hw * 2 - 1.8) / cols);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols), c = i % cols, inRow = row === 0 ? Math.min(n, cols) : n - cols, x = (c - (inRow - 1) / 2) * sp, seatZ = -I.hw + (rows === 1 ? 1.9 : 1.2) + row * 3.1;
      const g = new THREE.Group(); g.position.set(x, 0, seatZ); I.g.add(g);
      const top = new THREE.MeshStandardMaterial({ color: 0x33475c, roughness: 0.4, metalness: 0.3 }), edge = new THREE.MeshBasicMaterial({ color: I.f.color.clone() });
      box(g, 1.75, 0.06, 0.8, top, 0, 0.78, 0.95); box(g, 1.75, 0.04, 0.05, edge, 0, 0.77, 1.35);
      for (const sx of [-0.82, 0.82]) { box(g, 0.06, 0.78, 0.06, I.metal, sx, 0.39, 0.62); box(g, 0.06, 0.78, 0.06, I.metal, sx, 0.39, 1.3); }
      box(g, 0.5, 0.02, 0.2, I.metal, 0.1, 0.82, 0.7);
      // chair
      box(g, 0.55, 0.08, 0.55, I.dark, 0, 0.48, 0); box(g, 0.5, 0.6, 0.08, I.dark, 0, 0.82, -0.26); box(g, 0.08, 0.46, 0.08, I.metal, 0, 0.23, 0);
      // angled monitor (screen turned toward the camera so activity reads)
      const mon = new THREE.Group(); mon.position.set(-0.5, 0.81, 0.98); mon.rotation.y = 0.5; g.add(mon);
      box(mon, 0.08, 0.2, 0.08, I.metal, 0, 0.1, 0); box(mon, 1.0, 0.62, 0.05, I.metal, 0, 0.5, 0);
      const sm = new THREE.MeshBasicMaterial({ map: codeT, color: 0x020608, toneMapped: false }); const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.54), sm); scr.position.set(0, 0.5, 0.03); mon.add(scr);
      I.desks.push({ g, x, seatZ, edge, screen: sm, mon });
    }
  }

  function makeFigure(hue, generic) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${hue},45%,${generic ? 46 : 40}%)`), roughness: 0.7 }), skin = new THREE.MeshStandardMaterial({ color: 0x55687a, roughness: 0.6 });
    const visor = new THREE.MeshBasicMaterial({ color: new THREE.Color(`hsl(${hue},95%,60%)`), toneMapped: false });
    const torso = new THREE.Mesh(generic ? new THREE.BoxGeometry(0.5, 0.78, 0.34) : new THREE.CapsuleGeometry(0.22, 0.5, 4, 10), suit); torso.position.y = 1.15; body.add(torso);
    const head = new THREE.Mesh(generic ? new THREE.BoxGeometry(0.34, 0.3, 0.3) : new THREE.SphereGeometry(0.2, 14, 10), skin); head.position.y = 1.72; body.add(head);
    const vz = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.06), visor); vz.position.set(0, 1.74, 0.17); body.add(vz);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), visor); chest.position.set(0, 1.2, 0.23); body.add(chest);
    if (generic) { const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), visor); ant.position.set(0.1, 2.0, 0); body.add(ant); }
    const legs = new THREE.Group(), sitLegs = new THREE.Group(); body.add(legs); body.add(sitLegs);
    for (const sx of [-0.11, 0.11]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), suit); l.position.set(sx, 0.4, 0); legs.add(l);
      const th = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.55), suit); th.position.set(sx, 0.55, 0.26); sitLegs.add(th); const sh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), suit); sh.position.set(sx, 0.27, 0.55); sitLegs.add(sh); }
    const arms = []; for (const sx of [-0.3, 0.3]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.55), suit); a.position.set(sx, 1.0, 0.32); body.add(a); arms.push(a); }
    return { g, body, legs, sitLegs, arms, visor, chest, suit, torso };
  }

  // members of the open floor: team agents (from .claude/agents) + generic workers for unmatched running items
  function members(f) {
    if (f.kind === "lobby") return [{ key: "hq", label: "HQ", full: "HQ", host: true, item: { step: lobbyLine() } }];
    const deck = f.kind === "deck", team = deck ? T.teams.core : teamOf(f.id), items = (deck ? T.groups.deck : T.groups.byProj.get(f.id) || []).slice(), out = [], used = new Set();
    if (deck) { // HQ himself speaks for the general console chat / the lead; core agents match their own running work
      const coreN = new Set(team.map((a) => norm(a.name))), h = items.find((it) => (it.kind === "chat" || /^claude/.test(norm(it.name))) && !coreN.has(norm(it.name)));
      if (h) used.add(h.id); out.push({ key: "hq", label: "HQ", full: "HQ", host: true, desc: "host of the command deck", item: h || null });
    }
    for (const a of team) {
      const an = norm(a.name); let hit = null;
      for (const it of items) { if (used.has(it.id)) continue; const rn = norm(it.role), nn = norm(it.name); if ((rn && rn === an) || (nn && (nn === an || nn.includes(an) || (an.length > 5 && an.includes(nn) && nn.length > 5)))) { hit = it; break; } }
      if (hit) used.add(hit.id);
      out.push({ key: "a:" + a.name, label: shortName(a.name, f), full: a.name, desc: a.desc, model: a.model, item: hit });
    }
    for (const it of items) if (!used.has(it.id)) out.push({ key: "w:" + it.id, label: shortName(it.kind === "agent" ? it.role || it.name : it.name, f).slice(0, 24), full: it.name, worker: true, item: it });
    return out;
  }

  function syncInterior() {
    const I = interior; if (!I) return; let list = members(I.f);
    if (I.f.kind === "deck" && list.length > 14) { const keep = list.filter((m) => m.host || m.item), idle = list.filter((m) => !m.host && !m.item); list = list.filter((m) => keep.includes(m) || idle.indexOf(m) < Math.max(0, 14 - keep.length)).slice(0, 14); }
    list = list.slice(0, 16); const nd = I.f.kind === "project" ? Math.min(MAXD, list.length) : 0;
    if (I.f.kind === "deck" && I.deck && I.deck.n !== list.length) makeSeats(I, list.length);
    if (nd !== I.nDesks) makeDesks(I, nd);
    const seen = new Set(); let idleK = 0;
    list.forEach((m, i) => {
      seen.add(m.key); let o = I.members.get(m.key);
      if (!o) {
        const hue = m.worker ? 38 : m.host ? 176 : hueOf(m.full), fig = makeFigure(hue, !!m.worker); I.g.add(fig.g);
        const tag = el("div", "tw-tag"), bub = el("div", "tw-bub hidden"); tag.style.setProperty("--hc", `hsl(${hue},90%,62%)`); bub.style.setProperty("--hc", `hsl(${hue},90%,62%)`); tagsEl.append(tag, bub); I.tags.push(tag, bub);
        o = { key: m.key, col: new THREE.Color(`hsl(${hue},90%,60%)`), fig, tag, bub, x: 0, z: 0, sit: false, yaw: 0, tx: 0, tz: 0, ph: Math.random() * 6, hue, fresh: true }; I.members.set(m.key, o);
      }
      o.m = m; o.working = !!m.item; o.text = m.item ? stepOf(m.item) : ""; o.idx = i;
      if (I.f.kind === "deck") { const sp = I.seats[i] || { x: 0, z: -3, yaw: 0 }; o.tx = sp.x; o.tz = sp.z; o.sit = true; o.yawT = sp.yaw; }
      else if (I.f.kind === "lobby") { o.tx = 3.6; o.tz = -2.2; o.sit = false; o.yawT = -0.12; }
      else if (o.working && i < nd) { const d = I.desks[i]; o.tx = d.x; o.tz = d.seatZ; o.sit = true; o.yawT = 0; }
      else { const k = idleK++; if (k < 3) { o.tx = -4.0 + k * 0.7; o.tz = 0.63; o.sit = true; } else { const kk = k - 3; o.tx = -1.0 + (kk % 4) * 1.1; o.tz = 1.5 + Math.floor(kk / 4) * 1.0; o.sit = false; } o.yawT = (o.hue % 7 - 3) * 0.12; }
      o.tag.textContent = ""; const nm = el("b", "", m.label), st = el("span", "", o.working ? "working" : m.worker ? "worker" : "idle"); o.tag.append(nm, st); o.tag.classList.toggle("on", o.working); o.tag.classList.toggle("wk", !!m.worker);
      o.bub.textContent = o.text; o.bub.classList.toggle("hidden", !o.working || !o.text);
      if (o.fresh) { o.x = o.tx; o.z = o.tz; o.fresh = false; }
    });
    for (const [k, o] of [...I.members]) if (!seen.has(k)) { I.g.remove(o.fig.g); disposeGroup(o.fig.g); o.tag.remove(); o.bub.remove(); I.members.delete(k); }
    list.forEach((m, i) => { const o = I.members.get(m.key); if (!o) return; const d = I.desks[i]; if (d) d.owner = o; });
    if (I.f.kind === "lobby") rosterEl.textContent = ""; else paintRoster(list, I.f.kind === "deck");
    paintHud();
  }
  function paintHud() {
    if (!interior) return; const f = interior.f, lst = [...interior.members.values()], w = lst.filter((o) => o.working).length, p = projectList().find((x) => x.id === f.id) || {};
    $("#tw-openhq").classList.toggle("hidden", f.kind !== "lobby");
    if (f.kind === "lobby") { const ps = projectList(); $("#tw-htitle").textContent = "G · LOBBY"; $("#tw-hstat").textContent = ps.length + " floors · " + T.groups.total + " working · " + ps.reduce((a, x) => a + x.wait, 0) + " need you · click a row to ride up"; return; }
    if (f.kind === "deck") { $("#tw-htitle").textContent = "TOP · COMMAND DECK"; $("#tw-hstat").textContent = T.teams.core.length + " core agents · " + w + " working · " + T.groups.deck.length + " general or unmapped"; return; }
    $("#tw-htitle").textContent = "F" + f.i + " · " + f.name.toUpperCase();
    $("#tw-hstat").textContent = lst.length + " in the room · " + w + " working · " + (p.next || 0) + " next · " + (p.wait || 0) + " need you · " + (p.review || 0) + " review";
  }
  function paintRoster(list, deck) {
    rosterEl.textContent = ""; rosterEl.append(el("div", "tw-rh", deck ? "CORE AGENTS · Agent Team/Agents" : "TEAM · <project>/.claude/agents"));
    if (!list.length) rosterEl.append(el("div", "tw-rn", "No specialist team yet. Running work shows up here as a worker."));
    list.forEach((m) => { const on = !!m.item, r = el("div", "tw-r" + (on ? " on" : "")); r.append(el("div", "tw-rt", m.label), el("em", "", on ? "WORKING" : m.worker ? "WORKER" : "IDLE"), el("div", "tw-rs", on ? stepOf(m.item) : m.desc ? m.desc.slice(0, 70) : "waiting for a task")); rosterEl.append(r); });
  }

  function animateInterior(t, dt) {
    const I = interior; if (!I) return;
    codeT.offset.y = -t * 0.35; if (I.anim) I.anim(t, dt);
    for (const d of I.desks) { const w = d.owner && d.owner.working && d.owner.sit && d.owner.arrived; d.screen.color.setRGB(w ? 1.5 : 0.01, w ? 1.5 : 0.015, w ? 1.5 : 0.02); d.edge.color.copy(I.f.color).multiplyScalar(w ? 1.8 : 0.25); }
    for (const o of I.members.values()) {
      const dx = o.tx - o.x, dz = o.tz - o.z, dist = Math.hypot(dx, dz), walking = dist > 0.04; o.arrived = !walking;
      if (walking) { const s = Math.min(dist, 2.6 * dt); o.x += (dx / dist) * s; o.z += (dz / dist) * s; o.yaw = Math.atan2(dx, dz); }
      else o.yaw += ((o.yawT || 0) - o.yaw) * Math.min(1, dt * 6);
      const sit = !walking && o.sit, f = o.fig;
      f.g.position.set(o.x, 0, o.z); f.g.rotation.y = o.yaw; f.legs.visible = !sit; f.sitLegs.visible = sit;
      f.body.position.y = (sit ? -0.18 : 0) + (walking ? Math.abs(Math.sin(t * 9 + o.ph)) * 0.06 : Math.sin(t * 1.6 + o.ph) * 0.012);
      const wk = o.working, vv = wk ? 1.7 + 0.4 * Math.sin(t * 6 + o.ph) : 0.28; f.visor.color.set(`hsl(${o.hue},95%,${wk ? 62 : 45}%)`).multiplyScalar(vv); f.chest.material = f.visor;
      f.arms.forEach((a, k) => { a.visible = sit && wk; a.rotation.x = Math.sin(t * 15 + k * 2 + o.ph) * 0.09; });
      f.g.position.z += 0; o.tag.style.opacity = wk ? 1 : 0.55;
    }
  }
  function placeTags() {
    const I = interior; if (!I) return; const w = view.clientWidth, h = view.clientHeight, p = new THREE.Vector3();
    const proj = (x, y, z) => { p.set(x, y + I.g.position.y, z).project(camera); return p.z > 1 ? null : [(p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h]; };
    for (const o of I.members.values()) {
      const base = proj(o.x, 0.05, o.z + (o.sit ? 1.45 : 0.45)), head = proj(o.x, o.sit ? 1.95 : 2.2, o.z);
      if (base) { o.tag.style.transform = `translate(${clamp(base[0], 70, w - 70)}px,${clamp(base[1], 60, h - 30)}px) translate(-50%,0)`; o.tag.style.display = ""; } else o.tag.style.display = "none";
      if (head && o.working && o.text) { o.bub.style.transform = `translate(${clamp(head[0], 100, w - 100)}px,${head[1] - (o.idx % 2) * 46}px) translate(-50%,-100%)`; o.bub.classList.remove("hidden"); o.bub.style.setProperty("--tx", (head[0] - clamp(head[0], 100, w - 100)).toFixed(0) + "px"); } else o.bub.classList.add("hidden");
    }
    tagsEl.style.opacity = T.e > 0.7 ? 1 : T.e > 0.4 ? (T.e - 0.4) / 0.3 : 0;
  }

  // ---------- labels (exterior) ----------
  function placeLabels() {
    if (T.e > 0.02 && T.mode !== "ext") { if (T.e > 0.3) return; }
    const w = view.clientWidth, h = view.clientHeight, p = new THREE.Vector3(), right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), arr = [];
    for (const f of T.floors) {
      if (!f.lbl) continue; const ym = f.y0 + f.h / 2;
      p.set(0, ym, 0).project(camera); const sy = (-p.y * 0.5 + 0.5) * h;
      p.set(0, ym, 0).addScaledVector(right, -(f.w / 2) * 0.96).project(camera); arr.push({ f, sy, ex: (p.x * 0.5 + 0.5) * w, ey: (-p.y * 0.5 + 0.5) * h });
    }
    arr.sort((a, b) => b.sy - a.sy); let lim = Infinity; const gap = clamp(h * 0.056, 40, 62);
    for (const a of arr) { a.ly = Math.min(a.sy, lim - gap); lim = a.ly; }
    const x0 = 28, lw = 252;
    for (const a of arr) {
      const l = a.f.lbl; l.box.style.transform = `translate(${x0}px,${(a.ly - 22).toFixed(1)}px)`; l.line.setAttribute("x1", x0 + lw); l.line.setAttribute("y1", a.ly.toFixed(1)); l.line.setAttribute("x2", a.ex.toFixed(1)); l.line.setAttribute("y2", a.ey.toFixed(1));
      l.line.style.stroke = "#" + a.f.color.getHexString(); l.line.style.opacity = (0.28 + a.f.hov * 0.6 + a.f.act * 0.3).toFixed(2);
    }
    const o = clamp(1 - T.e * 3, 0, 1); labelsEl.style.opacity = o; svg.style.opacity = o;
  }

  // ---------- input ----------
  function pick() {
    ray.setFromCamera(mouse, camera); const hits = ray.intersectObjects(T.floors.map((f) => f.hit), false);
    return hits.length ? hits[0].object.userData.floor : null;
  }
  function bindInput() {
    const cv = renderer.domElement; let moved = 0;
    cv.addEventListener("pointermove", (e) => { const b = cv.getBoundingClientRect(); mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      if (T.drag) { const dx = e.clientX - T.drag.x, dy = e.clientY - T.drag.y; moved += Math.abs(dx) + Math.abs(dy); T.az -= dx * 0.006; T.el = clamp(T.el + dy * 0.004, 0.02, 0.9); T.drag.x = e.clientX; T.drag.y = e.clientY; } });
    cv.addEventListener("pointerdown", (e) => { if (T.mode !== "ext" || T.flight) return; T.drag = { x: e.clientX, y: e.clientY }; moved = 0; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointerup", (e) => { if (T.mode === "int" && !T.flight && interior && interior.lobby) { const h = pickLobby(); if (h && h.type === "row") hopTo(h.f); else if (h && h.type === "hq") enterHQ(); return; } const was = T.drag; T.drag = null; try { cv.releasePointerCapture(e.pointerId); } catch (x) {} if (was && moved < 6 && T.mode === "ext") { const f = pick(); if (f) activate(f); } });
    $("#tw-openhq").onclick = () => (T.mode === "int" && interior && interior.lobby ? enterHQ() : window.HQView && window.HQView("hq"));
    cv.addEventListener("pointerleave", () => { mouse.set(-9, -9); });
    cv.addEventListener("wheel", (e) => { e.preventDefault(); if (T.flight) return;
      if (T.mode === "int") { if (e.deltaY > 0) flyOut(); return; }
      if (e.deltaY < 0) { const f = pick(); if (f) return activate(f); } T.k = clamp(T.k * (e.deltaY > 0 ? 1.08 : 0.92), 0.55, 1.4); }, { passive: false });
    addEventListener("keydown", (e) => {
      if (!T.on) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); if (T.mode === "int") flyOut(); else if (!T.flight && window.HQView) window.HQView("home"); }
      else if (e.ctrlKey && e.key.toLowerCase() === "d") { e.preventDefault(); toggleDemo(); }
    }, true);
    $("#tw-back").onclick = () => (T.mode === "int" ? flyOut() : window.HQView && window.HQView("hq"));
  }

  // ---------- demo (Ctrl+D): fake running work so the lighting can be seen ----------
  function demoItems() {
    const out = [], ps = T.floors.filter((f) => f.kind === "project"), pick2 = [ps.find((f) => /lumen/i.test(f.name) && !/ads|wt/i.test(f.name)) || ps[0], ps.find((f) => /hq/i.test(f.name)) || ps[1]].filter(Boolean);
    const lines = ["Reviewing the apply-flow PR.", "Patching the job-pull dedupe.", "Running e2e suite 14/32.", "Drafting the next TikTok script.", "Editing renderer/tower.js", "Checking the bundle size."];
    pick2.forEach((f, pi) => { const team = teamOf(f.id), k = pi === 0 ? 3 : 2; for (let i = 0; i < k; i++) { const a = pi === 0 && i === 2 ? null : team[i]; out.push({ id: "demo-" + f.id + i, kind: a ? "board" : "chat", name: a ? a.name : "DEMO worker " + (i + 1), role: a ? a.name : "worker", proj: f.name, status: "running", steps: [{ kind: "say", text: lines[(pi * 3 + i) % lines.length] }] }); } });
    out.push({ id: "demo-deck", kind: "chat", name: "General chat", role: "HQ console", proj: "General", status: "running", steps: [{ kind: "say", text: "Planning the week." }] });
    return out;
  }
  function toggleDemo() { T.demo = !T.demo; HQActivity.setDemo(T.demo ? demoItems() : null); }

  // ---------- main loop ----------
  function frame(now) {
    if (!T.on) { T.raf = 0; return; } T.raf = requestAnimationFrame(frame);
    if (document.hidden || now - T.lastFrame < 15) return; const dt = Math.min(0.1, (now - (T.lastFrame || now - 16)) / 1000); T.lastFrame = now;
    const t = (performance.now() - clock0) / 1000;
    updateCamera(t, dt); view.classList.toggle("inside", T.mode === "int"); view.dataset.fl = T.cur ? T.cur.kind : "";
    if (T.mode === "ext" && !T.flight && !T.drag) { const f = pick(); if (f !== T.hover && !(T.hover && T.hover.lbl && T.hover.lbl.box.matches(":hover"))) T.hover = f; renderer.domElement.style.cursor = T.hover ? "pointer" : "grab"; }
    if (T.mode === "int" && interior && interior.lobby && !T.flight) { const h = pickLobby(); interior.lobby.hover = h && h.type === "row" ? h.i : -1; interior.lobby.btnHov = h && h.type === "hq"; renderer.domElement.style.cursor = h ? "pointer" : "default"; }
    camera.updateMatrixWorld(); animateFloors(t, dt); rainMat.uniforms.uTime.value = t; rainMat.uniforms.uA.value = 0.17 - T.e * 0.07;
    animateInterior(t, dt); placeLabels(); placeTags();
    composer.render();
    // the camera left the orbit pose when flight ended: autoAz is paused while inside
  }
  function sync() {
    const lst = projectList(), ord = ordered(lst), sig = ord.map((p) => p.id + "|" + p.name + "|" + (p.accent || "")).join(";");
    if (sig !== T.sig && !T.cur) { T.sig = sig; rebuild(ord); }
    paintLabels(); applyActivity();
  }
  function show(on) {
    T.on = on; view.classList.toggle("on", on);
    if (!on) { clearInterval(T.poll); if (T.mode === "int" || T.flight) { T.flight = null; T.mode = "ext"; T.e = 0; destroyInterior(); T.cur = null; hud.classList.add("hidden"); labelsEl.classList.remove("gone"); hintEl.textContent = HINT; } return; }
    ensure(); hintEl.textContent = HINT; refreshTeams(); sync(); resize();
    clearInterval(T.poll); T.poll = setInterval(() => { if (T.on) { sync(); } }, 2500);
    if (!T.raf) T.raf = requestAnimationFrame(frame);
  }
  window.HQTower = { show, demo: (on) => { if (on !== T.demo) toggleDemo(); }, state: T, enter: (id) => { const f = T.floors.find((x) => x.id === id || x.name.toLowerCase() === String(id).toLowerCase()); if (f) flyIn(f); }, exit: flyOut, hop: (id) => { const f = T.floors.find((x) => x.id === id || x.name.toLowerCase() === String(id).toLowerCase()); if (f) hopTo(f); }, enterHQ, setAz: (a) => { T.az = a; T.autoAz = false; }, summary: () => ({ floors: T.floors.map((f) => ({ name: f.name, kind: f.kind, n: f.n, act: +f.act.toFixed(2) })), total: T.groups.total }) };
  hq.on("todo-changed", () => { if (T.on) setTimeout(sync, 400); });
})();
