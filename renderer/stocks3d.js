// STOCKS FLOOR 3D interior (the old Trading Floor, now a floor of the tower). Built by tower.js (buildInterior / syncInterior) through HQTowerKit.
// Central trading roundtable with the 13 desk agents at their real seat angles (HQFloor.ANG), big wall screens (equity, scoreboard, signals, ticker),
// side desks for the project's specialists. Live state comes from HQFloor.desks() (tf events); panels are HTML in #tw-stonks (floor.js).
(function () {
  "use strict";
  const SEAT_R = 3.05, TABLE_R = 1.95, CANDLES = 24;
  const F = () => window.HQFloor;
  const emis = (K) => ((K.GLOW && K.GLOW.emis) || 0.7) * 0.6; // 40% softer: the amber floor glow was harsh
  const up = "#34d399", dn = "#fb7185", amb = "#f5b94a";
  const seatPos = (id) => { const a = (F().ANG[id] * Math.PI) / 180, x = Math.sin(a) * SEAT_R, z = -Math.cos(a) * SEAT_R; return { x, z, yaw: Math.atan2(-x, -z) }; };
  const short = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
  const usd = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

  function deskMembers(K) {
    const f = F(), c = {}; return Object.keys(f.ANG).map((id) => { const hex = f.HUE[id] || "#ffb02e"; new K.THREE.Color(hex).getHSL(c); return { key: "d:" + id, label: f.NAME[id], full: f.NAME[id], desk: id, hue: Math.round(c.h * 360), hex }; });
  }
  function sidePos(I, i) { // specialists: a row along the back wall, either side of the big screen
    const xs = [-4.5, -3.1, -1.7, 1.7, 3.1, 4.5], z = -I.hw + 1.15; return { x: xs[i % xs.length] * Math.min(1, (I.hw - 0.6) / 5), z, yaw: 0 };
  }

  // a canvas-textured wall screen; draw(ctx, w, h) is re-run only when sig() changes
  function screen(K, I, w, h, cw, chh, x, y, z, rotY, frame) {
    const cv = document.createElement("canvas"); cv.width = cw; cv.height = chh; const ctx = cv.getContext("2d"), T = K.THREE;
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 16; tex.generateMipmaps = true; tex.minFilter = T.LinearMipmapLinearFilter; tex.magFilter = T.LinearFilter;
    // linear x0.5 keeps the brightest text under the bloom threshold (0.55): glow halos on thin text flip on/off with the camera sway = shimmer
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0xbbbbbb })); m.position.set(x, y, z); m.rotation.y = rotY || 0; I.g.add(m);
    const fm = new T.MeshBasicMaterial({ color: frame, toneMapped: false });
    for (const [bw, bh, bx, by] of [[w + 0.12, 0.05, 0, h / 2], [w + 0.12, 0.05, 0, -h / 2], [0.05, h, -w / 2, 0], [0.05, h, w / 2, 0]]) { const b = new T.Mesh(new T.BoxGeometry(bw, bh, 0.04), fm); b.position.set(bx, by, -0.03); m.add(b); }
    return { m, tex, ctx, cw, ch: chh, sig: "" };
  }
  function lineChart(c, x, y, w, h, vals, col) {
    if (vals.length < 2) { c.strokeStyle = "rgba(255,255,255,.18)"; c.setLineDash([8, 8]); c.beginPath(); c.moveTo(x, y + h / 2); c.lineTo(x + w, y + h / 2); c.stroke(); c.setLineDash([]); return; }
    const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1; c.strokeStyle = col; c.lineWidth = 5; c.beginPath();
    vals.forEach((v, i) => { const px = x + (i / (vals.length - 1)) * w, py = y + h - ((v - lo) / sp) * h; i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke();
  }

  function build(I, K) {
    const T = K.THREE, g = I.g, hw = I.hw, col = I.f.color, f = F(), E = emis(K), S = (I.stonks = { seat: {}, side: [], pads: {}, rings: {}, screens: {}, last: 0 });
    const add = { transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }; // offset: flat decals never z-fight the floor slab (top y=0.03) or table/pit/kiosk tops
    // table
    const mesh = (geo, mat, y) => { const m = new T.Mesh(geo, mat); m.position.y = y; g.add(m); return m; };
    mesh(new T.CylinderGeometry(TABLE_R, TABLE_R - 0.1, 0.1, 64), I.metal, 0.72); mesh(new T.CylinderGeometry(0.6, 1.0, 0.68, 20), I.dark, 0.35);
    mesh(new T.TorusGeometry(TABLE_R, 0.035, 6, 80).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.5 * E), toneMapped: false }), 0.775);
    for (const [r, o] of [[0.8, 0.3], [1.5, 0.18]]) mesh(new T.RingGeometry(r, r + 0.03, 64).rotateX(-Math.PI / 2), new T.MeshBasicMaterial(Object.assign({ color: col, opacity: o * E }, add)), 0.785);
    // holographic candles: equity history (or an idle wave) as a ring of glowing bars
    S.candles = []; const cg = new T.Group(); cg.position.y = 0.78; g.add(cg);
    for (let i = 0; i < CANDLES; i++) { const a = (i / CANDLES) * Math.PI * 2, m = new T.Mesh(new T.BoxGeometry(0.11, 1, 0.11), new T.MeshBasicMaterial(Object.assign({ color: 0x34d399, opacity: 0.8 * E }, add))); m.position.set(Math.cos(a) * 1.0, 0.1, Math.sin(a) * 1.0); m.scale.y = 0.2; cg.add(m); S.candles.push({ m, h: 0.2 }); }
    S.globe = mesh(new T.SphereGeometry(0.3, 16, 10), new T.MeshBasicMaterial(Object.assign({ color: col, wireframe: true, opacity: 0.5 * E }, add)), 1.4);
    S.ring = mesh(new T.TorusGeometry(0.46, 0.012, 6, 56).rotateX(Math.PI / 2 + 0.5), new T.MeshBasicMaterial(Object.assign({ color: col.clone().multiplyScalar(1.5), opacity: 0.7 * E }, add)), 1.4);
    const pl = new T.PointLight(col.clone(), 6 * E, 9, 2); pl.position.set(0, 1.8, 0); g.add(pl); S.pl = pl;
    // seats at the real desk angles: chair, table pad, floor ring
    deskMembers(K).forEach((d) => {
      const p = seatPos(d.desk), sg = new T.Group(); sg.position.set(p.x, 0, p.z); sg.rotation.y = p.yaw; g.add(sg); S.seat[d.desk] = p;
      K.box(sg, 0.55, 0.08, 0.55, I.dark, 0, 0.48, 0); K.box(sg, 0.5, 0.6, 0.08, I.dark, 0, 0.82, -0.26); K.box(sg, 0.08, 0.46, 0.08, I.metal, 0, 0.23, 0);
      const c = new T.Color(d.hex), a = Math.atan2(p.x, -p.z), pg = new T.Group(); pg.position.set(Math.sin(a) * (TABLE_R - 0.32), 0.79, -Math.cos(a) * (TABLE_R - 0.32)); pg.rotation.y = p.yaw; g.add(pg);
      const pm = new T.MeshBasicMaterial({ color: 0x000000, toneMapped: false }); K.box(pg, 0.62, 0.012, 0.3, pm, 0, 0, 0); S.pads[d.desk] = { m: pm, c };
      const rm = new T.MeshBasicMaterial(Object.assign({ color: c, opacity: 0 }, add)); rm.userData = { id: d.desk }; const rg = new T.Mesh(new T.RingGeometry(0.5, 0.58, 32).rotateX(-Math.PI / 2), rm); rg.position.set(p.x, 0.055, p.z); rg.renderOrder = 2; g.add(rg); S.rings[d.desk] = { m: rm };
    });
    // side desks for the specialists (positions only; syncInterior seats the figures)
    for (let i = 0; i < 6; i++) {
      const p = sidePos(I, i); S.side.push(p); const sg = new T.Group(); sg.position.set(p.x, 0, p.z); g.add(sg);
      K.box(sg, 1.2, 0.05, 0.6, new T.MeshStandardMaterial({ color: 0x33475c, roughness: 0.4, metalness: 0.3 }), 0, 0.76, 0.75); K.box(sg, 1.2, 0.03, 0.04, new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.8) }), 0, 0.74, 1.05);
      for (const sx of [-0.55, 0.55]) K.box(sg, 0.05, 0.74, 0.05, I.metal, sx, 0.37, 0.75);
      K.box(sg, 0.5, 0.08, 0.5, I.dark, 0, 0.48, 0); K.box(sg, 0.46, 0.55, 0.07, I.dark, 0, 0.8, -0.24); K.box(sg, 0.07, 0.46, 0.07, I.metal, 0, 0.23, 0);
      const mon = K.box(sg, 0.62, 0.4, 0.04, new T.MeshBasicMaterial({ map: K.code(), color: 0x2c8c88, toneMapped: false }), 0, 1.1, 0.95); mon.rotation.x = -0.08;
    }
    // wall screens along the back
    const z = -hw + 0.1, fc = col.clone().multiplyScalar(1.4), sc = S.screens;
    sc.eq = screen(K, I, 3.5, 1.95, 768, 428, -hw * 0.62, 2.0, z, 0, fc);
    sc.main = screen(K, I, 4.2, 2.35, 896, 500, 0, 2.05, z, 0, fc);
    sc.sig = screen(K, I, 3.5, 1.95, 768, 428, hw * 0.62, 2.0, z, 0, fc);
    const stripM = new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.8), toneMapped: false }); for (const x of [-hw + 0.1, hw - 0.1]) K.box(g, 0.06, 3.0, 0.06, stripM, x, 1.5, -hw + 0.12);
    // DATA VIEW button on the back wall (below the big screen): raycast-clickable, gentle hover
    const bd = (S.dvBtn = screen(K, I, 1.8, 0.45, 384, 96, 0, 3.28, z + 0.03, 0, col.clone().multiplyScalar(0.55))); bd.hov = null;
    bd.draw = (h) => { if (bd.hov === h) return; bd.hov = h; const c = bd.ctx; c.clearRect(0, 0, 384, 96); c.fillStyle = h ? "rgba(26,20,8,.96)" : "rgba(5,9,14,.94)"; c.fillRect(0, 0, 384, 96); c.strokeStyle = h ? "#f5b94acc" : "#f5b94a66"; c.lineWidth = 3; c.strokeRect(6, 6, 372, 84); c.font = "700 36px Consolas, monospace"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = h ? "#f2d79a" : "#b8955a"; c.fillText("▤  DATA VIEW", 192, 50); bd.tex.needsUpdate = true; }; bd.draw(false);
    buildExtras(I, K); bd.m.userData.id = "dataview"; S.prox.push(bd.m);
    I.anim = (t, dt) => anim(I, K, t, dt);
  }

  // ======================= refinements: Lead hub, debate pit, ticker ring, handoffs, veto, Steady, focus =======================
  const HUB_Y = 1.4, SPOKE_N = 16, PADR = TABLE_R - 0.32;
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  const hueOf = (id) => { const h = F().HUE[id]; return h || (id === "debate" ? amb : id === "steady" ? "#4aa8ff" : "#8fa3b0"); };
  const wrap = (c, txt, w, max) => { const words = String(txt || "").split(/\s+/), lines = []; let l = ""; for (const wd of words) { const n = l ? l + " " + wd : wd; if (c.measureText(n).width > w && l) { lines.push(l); l = wd; if (lines.length >= max) break; } else l = n; } if (l && lines.length < max) lines.push(l); return lines; };
  function spriteOf(K, S, cw, ch, sw, sh) { // canvas-textured sprite; draw(key, fn) repaints only when key changes
    const T = K.THREE, cv = document.createElement("canvas"); cv.width = cw; cv.height = ch; const ctx = cv.getContext("2d"), tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; S.tex.push(tex);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })); sp.scale.set(sw, sh, 1);
    return { sp, ctx, tex, cw, ch, key: "", draw(key, fn) { if (this.key === key) return; this.key = key; ctx.clearRect(0, 0, cw, ch); fn(ctx, cw, ch); tex.needsUpdate = true; } };
  }
  function leg(a, b, out, o, n) { // quadratic arc a -> b written into out[(o..o+n)*3]
    const lift = 0.35 + a.distanceTo(b) * 0.12, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2 + lift, cz = (a.z + b.z) / 2;
    for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; out[(o + i) * 3] = v * v * a.x + 2 * u * v * cx + u * u * b.x; out[(o + i) * 3 + 1] = v * v * a.y + 2 * u * v * cy + u * u * b.y; out[(o + i) * 3 + 2] = v * v * a.z + 2 * u * v * cz + u * u * b.z; }
  }

  function buildExtras(I, K) {
    const T = K.THREE, g = I.g, S = I.stonks, f = F(), col = I.f.color, hw = I.hw, E = emis(K), V3 = T.Vector3;
    const add = { transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }; // offset: flat decals never z-fight the floor slab (top y=0.03) or table/pit/kiosk tops
    const basic = (c, o, extra) => new T.MeshBasicMaterial(Object.assign({ color: c, opacity: o }, add, extra || {}));
    Object.assign(S, { K, tex: [], node: {}, led: {}, spoke: {}, boost: {}, q: [], pk: [], shock: [], prox: [], seen: undefined, hov: "", focus: "", fk: 0, fgoal: 0, spk: "", spkAt: -9, spkText: "", spkTick: "", verd: null, stamp: null, steadyUntil: 0, hubFlash: 0, mouse: new V3(-9, -9, 0), md: false, hooks: [] });
    const grp = (x, y, z) => { const o = new T.Group(); o.position.set(x, y, z); g.add(o); return o; };
    // ---- node anchors (packet endpoints) ----
    for (const id of Object.keys(f.ANG)) { const a = (f.ANG[id] * Math.PI) / 180; S.node[id] = new V3(Math.sin(a) * PADR, 0.95, -Math.cos(a) * PADR); }
    const px = -Math.min(4.5, hw - 1.1), kx = -px, pz = 1.25; S.pit = { x: px, z: pz }; S.kiosk = { x: kx, z: pz };
    S.node.debate = new V3(px, 1.05, pz); S.node.steady = new V3(kx, 1.05, pz); S.node.hub = new V3(0, HUB_Y, 0);
    // ---- 1. Lead hub: raised glass command pod ----
    const hub = grp(0, 0.78, 0);
    const hm = (geo, mat, y) => { const m = new T.Mesh(geo, mat); m.position.y = y; hub.add(m); return m; };
    hm(new T.CylinderGeometry(0.74, 0.84, 0.15, 36), I.dark, 0.075); hm(new T.TorusGeometry(0.78, 0.022, 6, 64).rotateX(Math.PI / 2), basic(col.clone().multiplyScalar(1.5), E), 0.16);
    S.glass = hm(new T.CylinderGeometry(0.52, 0.6, 0.95, 40, 1, true), basic(col.clone(), 0.09 * E, { side: T.DoubleSide }), 0.63);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, r = hm(new T.CylinderGeometry(0.012, 0.012, 0.95, 4), basic(col.clone().multiplyScalar(1.3), 0.5 * E), 0.63); r.position.x = Math.cos(a) * 0.56; r.position.z = Math.sin(a) * 0.56; }
    hm(new T.TorusGeometry(0.52, 0.02, 6, 48).rotateX(Math.PI / 2), basic(col.clone().multiplyScalar(1.6), 0.8 * E), 1.11); S.hubTop = hm(new T.CircleGeometry(0.5, 32).rotateX(-Math.PI / 2), basic(col.clone(), 0.07 * E), 1.1);
    const hl = spriteOf(K, S, 256, 48, 0.9, 0.17); hl.draw("h", (c, w, h) => { c.font = "700 26px Consolas, monospace"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#" + col.clone().multiplyScalar(1.1).getHexString(); c.fillText("LEAD HUB", w / 2, h / 2); }); hl.sp.position.set(0, 2.25, 0); g.add(hl.sp); S.lbl = { hub: hl.sp };
    // spokes: every desk connects to the hub (faint; brighten when a packet uses them)
    for (const id of Object.keys(S.node)) { if (id === "hub") continue; const pts = new Float32Array((SPOKE_N + 1) * 3); leg(S.node[id], S.node.hub, pts, 0, SPOKE_N); const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.BufferAttribute(pts, 3));
      const m = new T.LineBasicMaterial(Object.assign({ color: new T.Color(hueOf(id)), opacity: 0.1 * E }, add)); g.add(new T.Line(geo, m)); S.spoke[id] = m; S.boost[id] = 0; }
    // desk status LEDs (idle dim / working pulse / done solid / error red)
    for (const id of Object.keys(f.ANG).concat("steady")) { const n = S.node[id], m = new T.MeshBasicMaterial({ color: 0x223040, toneMapped: false }), l = new T.Mesh(new T.SphereGeometry(0.045, 10, 8), m);
      if (id === "steady") l.position.set(n.x, 1.45, n.z); else { const a = Math.atan2(n.x, -n.z); l.position.set(Math.sin(a) * (TABLE_R - 0.12), 0.84, -Math.cos(a) * (TABLE_R - 0.12)); } g.add(l); S.led[id] = m; }
    // ---- 2. Bull vs Bear debate pit (left front) ----
    const pit = grp(px, 0, pz);
    const pm = (geo, mat, y) => { const m = new T.Mesh(geo, mat); m.position.y = y; pit.add(m); return m; };
    pm(new T.CylinderGeometry(0.88, 0.94, 0.07, 40), I.dark, 0.035);
    S.pitBull = pm(new T.RingGeometry(0.78, 0.86, 40, 1, Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), basic(new T.Color(f.HUE.bull), 0.5 * E), 0.075); S.pitBear = pm(new T.RingGeometry(0.78, 0.86, 40, 1, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), basic(new T.Color(f.HUE.bear), 0.5 * E), 0.075);
    S.fig = {}; for (const side of ["bull", "bear"]) {
      const dir = side === "bull" ? -1 : 1, c = new T.Color(f.HUE[side]), fg = new T.Group(); fg.position.set(dir * 0.42, 0.07, 0); pit.add(fg);
      const bm = basic(c, 0.55 * E), wm = basic(c, 0.7 * E, { wireframe: true }), body = T.CapsuleGeometry ? new T.CapsuleGeometry(0.13, 0.34, 4, 10) : new T.CylinderGeometry(0.13, 0.15, 0.6, 10);
      const b1 = new T.Mesh(body, bm); b1.position.y = 0.42; fg.add(b1); const b2 = new T.Mesh(body, wm); b2.position.y = 0.42; b2.scale.setScalar(1.12); fg.add(b2);
      const hd = new T.Mesh(new T.SphereGeometry(0.115, 12, 10), bm); hd.position.y = 0.9; fg.add(hd); const h2 = new T.Mesh(new T.SphereGeometry(0.115, 10, 8), wm); h2.position.y = 0.9; h2.scale.setScalar(1.1); fg.add(h2);
      for (const sx of [-1, 1]) { if (side === "bull") { const h = new T.Mesh(new T.ConeGeometry(0.03, 0.17, 6), bm); h.position.set(sx * 0.12, 1.0, 0); h.rotation.z = -sx * 0.7; fg.add(h); } else { const e = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), bm); e.position.set(sx * 0.1, 0.99, 0); fg.add(e); } }
      const ey = new T.Mesh(new T.BoxGeometry(0.16, 0.025, 0.02), new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); ey.position.set(0, 0.92, 0.11); fg.add(ey);
      fg.rotation.y = side === "bull" ? Math.PI / 2 : -Math.PI / 2; S.fig[side] = { g: fg, mats: [bm, wm] };
    }
    S.pitTxt = spriteOf(K, S, 640, 170, 2.5, 0.664); S.pitTxt.sp.position.set(0, 1.75, 0); pit.add(S.pitTxt.sp);
    const pl2 = spriteOf(K, S, 320, 48, 1.3, 0.2); pl2.draw("p", (c, w, h) => { c.font = "700 24px Consolas, monospace"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#c8d4de"; c.fillText("BULL vs BEAR PIT", w / 2, h / 2); }); pl2.sp.position.set(0, 0.2, 1.15); pit.add(pl2.sp); S.lbl.debate = pl2.sp;
    // ---- Steady desk (right front) ----
    const kio = grp(kx, 0, pz); S.kioG = kio; const kc = new T.Color("#4aa8ff");
    const km = (geo, mat, y) => { const m = new T.Mesh(geo, mat); m.position.y = y; kio.add(m); return m; };
    km(new T.CylinderGeometry(0.7, 0.76, 0.07, 6), I.dark, 0.035); S.kRing = km(new T.RingGeometry(0.64, 0.7, 6).rotateX(-Math.PI / 2), basic(kc, 0.5 * E), 0.075); km(new T.CylinderGeometry(0.07, 0.12, 0.62, 8), I.metal, 0.38);
    const kcv = document.createElement("canvas"); kcv.width = 320; kcv.height = 200; const ktex = new T.CanvasTexture(kcv); ktex.colorSpace = T.SRGBColorSpace; S.tex.push(ktex);
    const plane = new T.Mesh(new T.PlaneGeometry(0.96, 0.6), new T.MeshBasicMaterial({ map: ktex, toneMapped: false })); plane.position.set(0, 1.05, 0); plane.rotation.y = -Math.sign(kx) * 0.22; plane.rotation.x = -0.05; kio.add(plane);
    const fr = new T.Mesh(new T.PlaneGeometry(1.0, 0.64), basic(kc, 0.6 * E)); fr.position.z = -0.01; plane.add(fr); S.kscr = { ctx: kcv.getContext("2d"), tex: ktex, key: "" };
    const kl = spriteOf(K, S, 320, 48, 1.3, 0.2); kl.draw("k", (c, w, h) => { c.font = "700 24px Consolas, monospace"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#8ec3ff"; c.fillText("STEADY DESK", w / 2, h / 2); }); kl.sp.position.set(0, 0.2, 0.95); kio.add(kl.sp); S.lbl.steady = kl.sp; S.cm = 0;
    // ---- 4. packets, shockwaves, veto stamp ----
    for (let i = 0; i < 6; i++) { const g2 = new T.Group(); g2.visible = false; g.add(g2); const head = new T.Mesh(new T.SphereGeometry(0.075, 10, 8), basic(0xffffff, 1)); g2.add(head); const tails = []; for (let k = 1; k <= 6; k++) { const t2 = new T.Mesh(new T.SphereGeometry(0.075 * (1 - k / 8), 8, 6), basic(0xffffff, 0.6 * (1 - k / 7))); g2.add(t2); tails.push(t2); }
      const pts = new Float32Array((SPOKE_N * 2 + 1) * 3), geo = new T.BufferGeometry(); geo.setAttribute("position", new T.BufferAttribute(pts, 3)); const lm = new T.LineBasicMaterial(Object.assign({ color: 0xffffff, opacity: 0 }, add)), ln = new T.Line(geo, lm); ln.frustumCulled = false; ln.visible = false; g.add(ln);
      S.pk.push({ grp: g2, head, tails, pts, geo, lm, ln, t0: -9, dur: 1, on: false, to: "", arrived: false, hubHit: false }); }
    for (let i = 0; i < 5; i++) { const m = basic(0xffffff, 0), r = new T.Mesh(new T.RingGeometry(0.46, 0.5, 40).rotateX(-Math.PI / 2), m); r.position.y = 0.06; r.renderOrder = 2; r.visible = false; g.add(r); S.shock.push({ r, m, t0: -9, max: 1.5, dur: 0.9 }); }
    S.stampS = spriteOf(K, S, 512, 160, 2.3, 0.72); S.stampS.sp.position.set(0, 2.55, 0); S.stampS.sp.visible = false; g.add(S.stampS.sp);
    // ---- 5. hover/click proxies; camera + pointer hooks are installed on the first rendered frame (which hands us renderer + camera) ----
    const pxm = new T.MeshBasicMaterial({ visible: false });
    const prox = (id, geo, x, y, z) => { const m = new T.Mesh(geo, pxm); m.position.set(x, y, z); m.userData.id = id; g.add(m); S.prox.push(m); };
    for (const id of Object.keys(f.ANG)) { const p = S.seat[id]; prox(id, new T.CylinderGeometry(0.5, 0.5, 2, 8), p.x, 1, p.z); }
    prox("hub", new T.CylinderGeometry(0.68, 0.68, 1.3, 12), 0, 1.35, 0); prox("debate", new T.CylinderGeometry(0.95, 0.95, 1.5, 12), px, 0.75, pz); prox("steady", new T.CylinderGeometry(0.75, 0.75, 1.4, 8), kx, 0.7, pz);
    const probe = new T.Mesh(new T.PlaneGeometry(0.01, 0.01), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false })); probe.frustumCulled = false; probe.onBeforeRender = (rd, sc, cam) => { if (!S.cam) hookRenderer(I, K, rd, cam); }; g.add(probe);
    S.watch = setInterval(() => { if (!I.g.parent) cleanup(I); }, 1500);
  }

  function hookRenderer(I, K, rd, cam) {
    const S = I.stonks, T = K.THREE, cv = rd.domElement; S.cam = cam; S.cv = cv;
    S.ray = new T.Raycaster();
    const rel = (e) => { const b = cv.getBoundingClientRect(); S.mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1, 0); S.md = true; };
    let down = null; const on = (n, fn) => { cv.addEventListener(n, fn); S.hooks.push([n, fn]); };
    on("pointermove", rel); on("pointerleave", () => { S.mouse.set(-9, -9, 0); S.md = true; });
    on("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    on("pointerup", (e) => { if (!down || !I.g.parent) return; const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y); down = null; if (moved > 6) return; rel(e); const id = pick(I); if (id === "dataview") { if (F().dataView) F().dataView(true); } else if (id) { if (S.focus === id) unfocusI(I); else focusI(I, K, id); } else if (S.focus) unfocusI(I); });
  }
  function pick(I) { const S = I.stonks; if (!S.ray || !S.cam || S.mouse.x < -2) return ""; S.ray.setFromCamera(S.mouse, S.cam); const h = S.ray.intersectObjects(S.prox, false); return h.length ? h[0].object.userData.id : ""; }
  function cleanup(I) {
    const S = I.stonks; if (!S || S.dead) return; S.dead = true; clearInterval(S.watch);
    if (S.cv) { for (const [n, fn] of S.hooks) S.cv.removeEventListener(n, fn); S.cv.style.cursor = ""; }
    if (S.focus && window.HQTower && HQTower.clearFocus) HQTower.clearFocus();
    for (const t of S.tex) t.dispose(); S.tex.length = 0; if (window.HQFloor && HQFloor.agentClose) HQFloor.agentClose();
  }
  function focusI(I, K, id) {
    const S = I.stonks, T = K.THREE; if (!S || !S.cam) return; I.g.updateWorldMatrix(true, false); S.focus = id; S.fgoal = 1;
    let tx = 0, tz = 0, ty = 1.3, d = 0, cy = 0, side = false;
    if (id === "debate" || id === "steady") { const n = id === "debate" ? S.pit : S.kiosk; tx = n.x; tz = n.z; ty = id === "debate" ? 0.7 : 0.95; side = true; } else if (id !== "hub") { const p = S.seat[id]; tx = p.x; tz = p.z; ty = 1.1; d = 2.3; cy = 3.1; }
    const L = Math.hypot(tx, tz) || 1, ux = tx / L, uz = tz / L, cp = id === "hub" ? new T.Vector3(0, 3.7, 4.1) : side ? new T.Vector3(tx * 0.8, 2.9, tz + 3.1) : new T.Vector3(tx - ux * d, cy, tz - uz * d), lk = new T.Vector3(tx, ty, tz);
    const wp = I.g.localToWorld(cp), wl = I.g.localToWorld(lk); if (window.HQTower && HQTower.setFocus) HQTower.setFocus({ pos: { x: wp.x, y: wp.y, z: wp.z }, target: { x: wl.x, y: wl.y, z: wl.z }, fov: id === "hub" ? 62 : 56 });
    if (window.HQFloor && HQFloor.agentCard) HQFloor.agentCard(id);
  }
  function unfocusI(I) { const S = I.stonks; if (!S) return; S.focus = ""; S.fgoal = 0; if (window.HQTower && HQTower.clearFocus) HQTower.clearFocus(); if (window.HQFloor && HQFloor.agentClose) HQFloor.agentClose(); }

  // ---- event pump: packets / speech / verdict / veto, from the (replayed or live) event stream ----
  function packet(I, K, t, from, to, colHex) {
    const S = I.stonks, T = K.THREE; if (!S.node[from] || !S.node[to] || from === to) return; const p = S.pk.find((x) => !x.on) || S.pk.reduce((a, b) => (a.t0 < b.t0 ? a : b));
    leg(S.node[from], S.node.hub, p.pts, 0, SPOKE_N); leg(S.node.hub, S.node[to], p.pts, SPOKE_N, SPOKE_N); p.geo.attributes.position.needsUpdate = true;
    const c = new T.Color(colHex); p.head.material.color.copy(c).multiplyScalar(1.4); p.tails.forEach((x) => x.material.color.copy(c)); p.lm.color.copy(c);
    Object.assign(p, { t0: t, dur: 1.35, on: true, hubHit: false, arrived: false, to }); p.grp.visible = true; p.ln.visible = true; S.boost[from] = 1; S.boost[to] = 1;
  }
  function shock(I, t, x, z, colHex, max, dur) { const S = I.stonks, s = S.shock.reduce((a, b) => (a.t0 < b.t0 ? a : b)); s.r.position.x = x; s.r.position.z = z; s.m.color.set(colHex); s.t0 = t; s.max = max || 1.4; s.dur = dur || 0.9; s.r.visible = true; }
  function fire(I, K, t, e, quiet) {
    const S = I.stonks; if (!e) return; const ag = e.agent, txt = e.text || "";
    if (!quiet && e.to && (e.kind === "done" || e.kind === "say" || e.kind === "veto") && S.node[ag] && S.node[e.to]) packet(I, K, t, ag, e.to, e.kind === "veto" ? "#fb7185" : hueOf(ag));
    else if (!quiet && e.to && ag === "debate" && S.node.debate && S.node[e.to]) packet(I, K, t, "debate", e.to, amb);
    if (/steady/i.test(txt)) { S.steadyUntil = t + 5; if (!quiet && e.kind === "start" && S.node[ag]) packet(I, K, t, "steady", ag, "#4aa8ff"); }
    if (e.kind === "say" && (ag === "bull" || ag === "bear")) { S.spk = ag; S.spkAt = t; S.spkText = txt.replace(/^[A-Z.\-]+:\s*/, ""); S.spkTick = (txt.match(/^[A-Z.\-]+/) || [""])[0]; S.verd = null; if (!quiet) shock(I, t, S.pit.x + (ag === "bull" ? -0.42 : 0.42), S.pit.z, hueOf(ag), 0.7, 0.7); }
    if (ag === "debate" && e.kind === "say") { const m = txt.match(/^([A-Z.\-]+)\s+verdict\s+(\w+)\s*\((\d+)\)/i); if (m) { const w = m[2].toUpperCase(), c = /BUY|LONG|BULL/.test(w) ? up : /SELL|SHORT|BEAR/.test(w) ? dn : amb; S.verd = { t0: t, word: w, conv: m[3], tick: m[1], col: c }; S.spk = ""; if (!quiet) shock(I, t, S.pit.x, S.pit.z, c, 1.7, 1.2); } }
    if (e.kind === "veto") { const m = txt.match(/^([A-Z.\-]+)\s+VETOED/); S.stamp = { t0: t, tick: m ? m[1] : "" }; S.hubFlash = 1; const rp = S.seat.risk; if (!quiet && rp) shock(I, t, rp.x, rp.z, "#fb7185", 1.8, 1.1); }
  }
  function pump(I, K, t) {
    const S = I.stonks, f = F(), ev = f.events ? f.events() : [], cur = f.cur ? f.cur() : -1;
    if (S.seen === undefined) { S.seen = cur; if (ev[cur]) fire(I, K, t, ev[cur], true); return; }
    if (cur !== S.seen) {
      if (cur > S.seen && cur - S.seen <= 4) for (let i = S.seen + 1; i <= cur; i++) S.q.push({ at: t + (i - S.seen - 1) * 0.4, e: ev[i] });
      else { S.q.length = 0; S.stamp = null; S.verd = null; S.spk = ""; S.spkText = ""; if (ev[cur]) fire(I, K, t, ev[cur], true); }
      S.seen = cur;
    }
    while (S.q.length && S.q[0].at <= t) fire(I, K, t, S.q.shift().e, false);
  }

  function drawRing(I, tp) { // ticker ring texture: whole cycles of the tape so it wraps seamlessly
    const S = I.stonks, tk = S.tick, c = tk.ctx, cw = tk.cv.width, ch = tk.cv.height, sig = tp.map((x) => x.s + x.chg).join(","); if (tk.sig === sig) return; tk.sig = sig;
    c.clearRect(0, 0, cw, ch); c.font = "700 36px Consolas, monospace"; c.textBaseline = "middle";
    const items = tp.map((q) => ({ txt: q.s + " " + (q.chg > 0 ? "▲" : q.chg < 0 ? "▼" : "◆") + " " + (q.chg > 0 ? "+" : "") + q.chg + "%", chg: q.chg })), widths = items.map((it) => c.measureText(it.txt).width), sum = widths.reduce((a, b) => a + b, 0);
    const n = Math.max(1, Math.round(cw / (sum + items.length * 70))), cyc = cw / n, gap = Math.max(20, (cyc - sum) / items.length);
    for (let k = 0; k < n; k++) { let x = k * cyc + gap / 2; items.forEach((it, i) => { c.fillStyle = it.chg > 0 ? up : it.chg < 0 ? dn : "#a8b8c4"; c.fillText(it.txt, x, ch / 2); x += widths[i] + gap; }); }
    tk.tex.needsUpdate = true;
  }
  function drawKiosk(I, t) {
    const S = I.stonks, k = S.kscr, D = F().data(), st = (D.stats && D.stats.steady) || null, on = t < S.steadyUntil, key = (on ? 1 : 0) + "|" + (st ? st.retPct + "|" + st.open + "|" + st.trades : "-"); if (k.key === key) return; k.key = key; const c = k.ctx, w = 320, h = 200;
    c.fillStyle = "rgba(3,9,14,.96)"; c.fillRect(0, 0, w, h); c.textBaseline = "middle"; c.textAlign = "left"; c.font = "700 26px Consolas, monospace"; c.fillStyle = "#8ec3ff"; c.fillText("STEADY", 16, 28); c.fillStyle = on ? amb : "#5b6b78"; c.textAlign = "right"; c.fillText(on ? "WORKING" : "IDLE", w - 16, 28);
    c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(14, 48, w - 28, 2); c.textAlign = "left"; c.font = "600 20px Consolas, monospace"; c.fillStyle = "#8fa3b0";
    if (st) { c.fillText("RETURN", 16, 82); c.fillStyle = st.retPct > 0 ? up : st.retPct < 0 ? dn : "#e6edf3"; c.font = "800 38px Consolas, monospace"; c.fillText((st.retPct > 0 ? "+" : "") + st.retPct + "%", 16, 118); c.font = "600 20px Consolas, monospace"; c.fillStyle = "#8fa3b0"; c.fillText(st.open + " open · " + st.trades + " closed", 16, 160); } else c.fillText("no sleeve data", 16, 90);
    k.tex.needsUpdate = true;
  }

  function animExtras(I, K, t, dt) {
    const S = I.stonks, f = F(), V = f.desks(), D = f.data(), E = emis(K), T = K.THREE; if (!S.node || S.dead) return;
    pump(I, K, t);
    // calm by default: ticker ring, debate pit, spokes and desk names fade back unless a run is going or replaying
    S.cm += ((f.busy && f.busy() ? 1 : 0) - S.cm) * Math.min(1, dt * 2.5); const CM = S.cm, CK = 0.12 + 0.88 * CM, PK = 0.3 + 0.7 * CM;
    for (const id in S.lbl) S.lbl[id].material.opacity = Math.max(id === "hub" ? 1 : CM * 0.85, S.hov === id || S.focus === id ? 1 : 0);
    if (S.md && S.cam) { S.md = false; S.hov = I.g.parent ? pick(I) : ""; if (S.cv) { S.cv.style.cursor = S.hov ? "pointer" : ""; const tp = S.hov && F().tip ? F().tip(S.hov) : ""; if (S.cv.title !== tp) S.cv.title = tp; } }
    if (S.dvBtn) S.dvBtn.draw(S.hov === "dataview"); S.fk += (S.fgoal - S.fk) * Math.min(1, dt * 4.5); if (Math.abs(S.fgoal - S.fk) < 0.002) S.fk = S.fgoal;
    // hub: glass breathes, flashes on handoffs and vetoes
    S.hubFlash = Math.max(0, S.hubFlash - dt * 1.6); const vetoing = S.stamp && t - S.stamp.t0 < 1.2;
    S.glass.material.opacity = (0.08 + 0.02 * Math.sin(t * 1.6) + 0.12 * S.hubFlash + (V.running ? 0.03 : 0)) * E; S.hubTop.material.opacity = (0.06 + 0.1 * S.hubFlash) * E;
    S.glass.material.color.copy(vetoing ? K.red : I.f.color); S.globe.material.color.copy(vetoing ? K.red : S.hubFlash > 0.3 ? K.amber : I.f.color);
    for (const id in S.spoke) { S.boost[id] = Math.max(0, S.boost[id] - dt * 1.1); S.spoke[id].opacity = (0.04 * (0.4 + 0.6 * CM) + 0.7 * S.boost[id] + (S.hov === id ? 0.25 : 0)) * E; }
    for (const id in S.led) {
      const st = id === "steady" ? (t < S.steadyUntil ? "working" : "idle") : V.st[id] ? V.st[id].status : "idle", m = S.led[id];
      if (st === "working") m.color.set(amb).multiplyScalar(0.7 + 0.5 * Math.sin(t * 7 + id.length)); else if (st === "done") m.color.set(hueOf(id)).multiplyScalar(0.85); else if (st === "error") m.color.set(dn); else m.color.set(0x25323f);
    }
    for (const id in S.rings) if (S.hov === id) S.rings[id].m.opacity = Math.max(S.rings[id].m.opacity, 0.42 * E + 0.06 * Math.sin(t * 3));
    // packets
    const N = SPOKE_N * 2;
    for (const p of S.pk) {
      if (!p.on) continue; const u = (t - p.t0) / p.dur, a = p.pts;
      if (u > 1.7) { p.on = false; p.grp.visible = false; p.ln.visible = false; continue; }
      const at = (k, tgt) => { const q = Math.max(0, Math.min(1, k)) * N, i = Math.min(N - 1, Math.floor(q)), r = q - i; tgt.set(a[i * 3] + (a[(i + 1) * 3] - a[i * 3]) * r, a[i * 3 + 1] + (a[(i + 1) * 3 + 1] - a[i * 3 + 1]) * r, a[i * 3 + 2] + (a[(i + 1) * 3 + 2] - a[i * 3 + 2]) * r); };
      const head = Math.min(1, u); at(head, p.head.position); p.head.visible = u <= 1; p.head.scale.setScalar(1 + 0.25 * Math.sin(t * 30));
      p.tails.forEach((x, k) => { at(head - (k + 1) * 0.028, x.position); x.visible = u <= 1.1; });
      p.ln.geometry.setDrawRange(0, Math.max(2, Math.floor(head * N) + 1)); p.lm.opacity = (u < 1 ? 0.55 : Math.max(0, 0.55 - (u - 1) * 0.8)) * E;
      if (!p.hubHit && u >= 0.5) { p.hubHit = true; S.hubFlash = Math.max(S.hubFlash, 0.7); }
      if (!p.arrived && u >= 1) { p.arrived = true; const n = S.seat[p.to] || (p.to === "debate" ? S.pit : p.to === "steady" ? S.kiosk : null); if (n) shock(I, t, n.x, n.z, "#" + p.lm.color.getHexString(), 0.9, 0.7); }
    }
    for (const s of S.shock) { if (!s.r.visible) continue; const u = (t - s.t0) / s.dur; if (u >= 1) { s.r.visible = false; continue; } s.r.scale.setScalar(0.4 + (s.max - 0.4) * ease(u)); s.m.opacity = (1 - u) * 0.6 * E; }
    // debate pit: speakers alternate; verdict flash
    const pitOn = (V.st.bull && V.st.bull.status === "working") || (V.st.bear && V.st.bear.status === "working"), recent = t - S.spkAt < 3.2;
    const spk = recent ? S.spk : pitOn ? (Math.floor(t / 1.5) % 2 ? "bear" : "bull") : "", vd = S.verd && t - S.verd.t0 < 4 ? S.verd : null;
    for (const side of ["bull", "bear"]) {
      const fg = S.fig[side], talking = spk === side, lvl = talking ? 1.5 + 0.3 * Math.sin(t * 14) : pitOn ? 0.6 : V.st[side] && V.st[side].status === "done" ? 0.45 : 0.25, dir = side === "bull" ? 1 : -1;
      fg.mats[0].opacity = 0.55 * E * lvl * PK; fg.mats[1].opacity = 0.7 * E * lvl * PK; fg.g.position.y = 0.07 + (talking ? 0.03 * Math.abs(Math.sin(t * 9)) : 0); fg.g.rotation.z = talking ? -dir * 0.18 : 0; fg.g.scale.y = talking ? 1.04 : 1;
    }
    const hp = S.hov === "debate" ? 0.2 : 0; S.pitBull.material.opacity = (0.35 + (spk === "bull" ? 0.5 : 0) + hp) * E * PK; S.pitBear.material.opacity = (0.35 + (spk === "bear" ? 0.5 : 0) + hp) * E * PK;
    let head = "", body = "", hc = "#fff";
    if (vd) { head = "VERDICT " + vd.word + " (" + vd.conv + ")" + (vd.tick ? "  " + vd.tick : ""); hc = vd.col; } else if (spk) { head = spk.toUpperCase() + (recent && S.spkTick ? "  " + S.spkTick : ""); body = recent ? S.spkText : (V.st.bear && V.st.bear.text) || ""; hc = hueOf(spk); }
    S.pitTxt.sp.visible = !!head; if (head) S.pitTxt.draw(head + "|" + short(body, 110) + "|" + hc, (c, w, h) => { c.fillStyle = "rgba(4,9,15,.82)"; c.fillRect(0, 0, w, h); c.strokeStyle = hc; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4); c.textAlign = "left"; c.textBaseline = "middle"; c.font = "800 30px Consolas, monospace"; c.fillStyle = hc; c.fillText(head, 20, 32); c.font = "600 24px Consolas, monospace"; c.fillStyle = "#d3dde6"; wrap(c, short(body, 110), w - 40, 3).forEach((l, i) => c.fillText(l, 20, 72 + i * 30)); });
    // veto stamp over the hub
    const sp = S.stampS.sp, st = S.stamp;
    if (st && t - st.t0 < 3.8) {
      const a = t - st.t0; S.stampS.draw("v" + st.tick, (c, w, h) => { c.fillStyle = "rgba(40,4,12,.8)"; c.fillRect(0, 0, w, h); c.strokeStyle = dn; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16); c.shadowColor = dn; c.shadowBlur = 18; c.fillStyle = dn; c.textAlign = "center"; c.textBaseline = "middle"; c.font = "800 78px Consolas, monospace"; c.fillText("VETOED", w / 2, st.tick ? 66 : 80); c.shadowBlur = 0; if (st.tick) { c.font = "700 34px Consolas, monospace"; c.fillText(st.tick + "  ·  RISK MANAGER", w / 2, 126); } });
      const slam = a < 0.18 ? 3 - 2 * ease(a / 0.18) : 1, jit = a < 0.35 ? (1 - a / 0.35) * 0.06 : 0; sp.visible = true; sp.scale.set(2.3 * slam, 0.72 * slam, 1); sp.position.set((Math.random() - 0.5) * jit, 2.55 + (Math.random() - 0.5) * jit, 0); sp.material.rotation = -0.2; sp.material.opacity = a < 3 ? 1 : Math.max(0, 1 - (a - 3) / 0.8);
    } else sp.visible = false;
    drawKiosk(I, t); S.kRing.material.opacity = PK * (0.4 + (t < S.steadyUntil ? 0.4 : 0) + (S.hov === "steady" ? 0.25 : 0)) * E;

  }

  function drawScreens(I, K) {
    const S = I.stonks, f = F(), D = f.data(), V = f.desks(), st = D.stats || {}, sf = st.safety || {}, paused = sf.status === "PAUSED", run = V.running, LV = D.view === "live", LA = D.live || {}, eq = LV ? [] : (D.equity || []).map((p) => p.total).filter((v) => v != null);
    const sg = (name, sig, fn) => { const s = S.screens[name]; if (s.sig === sig) return; s.sig = sig; const c = s.ctx; c.clearRect(0, 0, s.cw, s.ch); c.fillStyle = "rgba(3,9,14,.96)"; c.fillRect(0, 0, s.cw, s.ch); fn(c, s.cw, s.ch); s.tex.needsUpdate = true; };
    const head = (c, w, txt, col) => { c.textBaseline = "middle"; c.textAlign = "left"; c.font = "700 34px Consolas, monospace"; c.fillStyle = col; c.fillText(txt, 28, 38); c.fillStyle = "rgba(255,255,255,.1)"; c.fillRect(24, 68, w - 48, 4); };
    sg("eq", "e" + eq.length + "|" + (eq[eq.length - 1] || 0), (c, w, h) => { head(c, w, LV ? "LIVE ACCOUNT" : "EQUITY CURVE", amb); lineChart(c, 40, 100, w - 80, h - 150, eq, up); c.font = "600 24px Consolas, monospace"; c.fillStyle = "#8fa3b0"; c.textAlign = "right"; c.fillText(LV ? "no live history yet" : eq.length ? usd(eq[eq.length - 1]) : "no ledger yet", w - 30, h - 24); });
    const total = LV ? LA.netValue : st.totalEquity != null ? st.totalEquity : st.equity, ret = LV ? null : st.retPct, label = paused ? "PAUSED" : run ? "RUNNING" : "IDLE", lc = paused ? dn : run ? amb : "#5eead4";
    sg("main", LV + "|" + (LA.dayChange || 0) + "|" + label + "|" + total + "|" + ret + "|" + (run ? Math.floor(performance.now() / 700) % 2 : 0), (c, w, h) => {
      c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = lc; c.font = "800 64px Consolas, monospace"; c.fillText("TRADING FLOOR", w / 2, 78);
      c.font = "700 44px Consolas, monospace"; c.fillStyle = lc; c.fillText((run && Math.floor(performance.now() / 700) % 2 ? "● " : "○ ") + label, w / 2, 160);
      c.font = "800 92px Consolas, monospace"; c.fillStyle = "#e6edf3"; c.fillText(total != null ? (LV ? "$" + total.toFixed(2) : usd(total)) : "--", w / 2, 292);
      c.font = "700 46px Consolas, monospace"; c.fillStyle = ret > 0 ? up : ret < 0 ? dn : "#8fa3b0"; c.fillText(LV ? (LA.dayChange > 0 ? "+" : "") + usd(LA.dayChange || 0) + " today" : ret != null ? (ret > 0 ? "+" : "") + ret + "% since start" : "paper book", w / 2, 392);
      c.font = "600 24px Consolas, monospace"; c.fillStyle = "#6b7d8a"; c.fillText(LV ? "LIVE · REAL MONEY · read-only" : "PAPER TRADING · research only", w / 2, 462);
    });
    const al = (D.alerts || []).slice().sort((a, b) => ({ BUY: 0, SELL: 1, WATCH: 2 }[a.action] - { BUY: 0, SELL: 1, WATCH: 2 }[b.action]) || b.confidence - a.confidence).slice(0, 5);
    // calm panel: per-signal text was ~8px on screen (5x minified) and crawled under any motion; the HTML signal board lists the details.
    sg("sig", "s" + al.map((a) => a.action + a.confidence).join(","), (c, w, h) => {
      c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = amb; c.font = "800 84px Consolas, monospace"; c.fillText("SIGNALS", w / 2, 78);
      c.fillStyle = "rgba(255,255,255,.1)"; c.fillRect(40, 140, w - 80, 6);
      c.fillStyle = "#e6edf3"; c.font = "800 150px Consolas, monospace"; c.fillText(String(al.length), w / 2, 250);
      const bw = 110, gap = 24, n = Math.max(al.length, 1), x0 = (w - (n * bw + (n - 1) * gap)) / 2;
      for (let i = 0; i < n; i++) { const a = al[i]; c.fillStyle = a ? (a.action === "BUY" ? up : a.action === "SELL" ? dn : amb) : "rgba(255,255,255,.12)"; c.fillRect(x0 + i * (bw + gap), 340, bw, 40); }
    });
  }

  function anim(I, K, t, dt) {
    const S = I.stonks, f = F(); if (!S || !f || S.dead || !I.g.parent || document.hidden || (f.dv && f.dv())) return; const V = f.desks(), D = f.data(), E = emis(K);
    if (t - S.last > 0.4) { S.last = t; drawScreens(I, K); }
    S.globe.rotation.y = t * 0.5; S.ring.rotation.z = t * 0.6; S.pl.intensity = (5 + 1.5 * Math.sin(t * 2.1) + (V.running ? 2 : 0)) * emis(K);
    S.globe.material.color.copy(V.running ? K.amber : I.f.color);
    // candle ring: last equity points, normalised; idle = slow wave
    const eq = (D.equity || []).map((p) => p.total).filter((v) => v != null).slice(-CANDLES), lo = Math.min(...eq), hi = Math.max(...eq), sp = hi - lo || 1;
    S.candles.forEach((c, i) => {
      const v = eq.length >= 2 ? eq[Math.max(0, eq.length - CANDLES + i)] : null, prev = eq.length >= 2 ? eq[Math.max(0, eq.length - CANDLES + i - 1)] : null;
      let tgt = v != null ? 0.15 + ((v - lo) / sp) * 0.75 : 0.25 + 0.12 * Math.sin(t * (V.running ? 3 : 1) + i * 0.6); if (V.running) tgt += 0.08 * Math.sin(t * 6 + i);
      c.h += (tgt - c.h) * Math.min(1, dt * 4); c.m.scale.y = Math.max(0.05, c.h); c.m.position.y = c.h / 2; c.m.material.color.set(v != null && prev != null && v < prev ? 0xfb7185 : 0x34d399);
    });
    for (const id in S.pads) {
      const o = I.members.get("d:" + id), st = V.st[id] ? V.st[id].status : "idle", pad = S.pads[id], ring = S.rings[id];
      const lvl = st === "working" ? 0.95 + 0.15 * Math.sin(t * 2.5 + (o ? o.ph : 0)) : st === "error" ? 0.8 : st === "done" ? 0.3 : 0.05;
      pad.m.color.copy(st === "error" ? K.red : pad.c).multiplyScalar(lvl); ring.m.opacity = (st === "working" ? 0.55 + 0.15 * Math.sin(t * 2.5) : st === "done" ? 0.1 : 0) * E;
    }
    animExtras(I, K, t, dt);
  }

  // tower.js calls this each ~0.3s and after syncInterior: set working/text on the desk-agent members from the live events
  function applyDesks(I, K) {
    const f = F(); if (!f || !I.stonks) return; const V = f.desks(), curAg = V.cur && V.cur.text ? V.cur.agent : "";
    for (const o of I.members.values()) {
      const id = o.m && o.m.desk; if (!id) continue; const s = V.st[id] || { status: "idle", text: "" }, isCur = !!curAg && (curAg === id || (curAg === "debate" && (id === "bull" || id === "bear")));
      const working = s.status === "working", done = s.status === "done", text = working || isCur ? short(s.text, 110) : "", sig = s.status + "|" + text + "|" + (f.selected() === id) + "|" + (I.stonks.hov === id);
      o.tag.classList.add("dk"); const hv = I.stonks.hov === id; o.working = working; o.done = done; o.text = text; o.sel = f.selected() === id;
      if (o.sig !== sig) { o.sig = sig; o.tag.classList.toggle("on", working); o.tag.classList.toggle("sel", o.sel); o.tag.classList.toggle("done", done); o.tag.classList.toggle("hov", hv); o.bub.textContent = text; o.bub.classList.toggle("hidden", !text); const st = o.tag.querySelector("span"); if (st) st.textContent = s.status; }
    }
  }
  const cur = () => { const I = window.HQTower && HQTower.state && HQTower.state.interior; return I && I.stonks && !I.stonks.dead ? I : null; };
  // camera pose that fills the view with the big back-wall screen (world coords, for HQTower.setFocus); null until the room exists
  function wallFocus() {
    const I = cur(); if (!I || !I.stonks.K) return null; const V = I.stonks.K.THREE.Vector3, z = -I.hw + 0.1; I.g.updateWorldMatrix(true, false);
    const p = I.g.localToWorld(new V(0, 2.05, z + 3.3)), q = I.g.localToWorld(new V(0, 1.95, z)); return { pos: { x: p.x, y: p.y, z: p.z }, target: { x: q.x, y: q.y, z: q.z }, fov: 50 };
  }
  window.HQStocks3D = window.HQStonks3D = { build, wallFocus, deskMembers, seatPos, sidePos, applyDesks, SEAT_R, focus: (id) => { const I = cur(); if (I && I.stonks.cam) focusI(I, I.stonks.K, id); }, unfocus: () => { const I = cur(); if (I) unfocusI(I); }, focused: () => { const I = cur(); return !!(I && I.stonks.focus); } };
})();
