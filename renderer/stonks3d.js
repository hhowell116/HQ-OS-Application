// STONKS FLOOR 3D interior (the old Trading Floor, now a floor of the tower). Built by tower.js (buildInterior / syncInterior) through HQTowerKit.
// Central trading roundtable with the 12 desk agents at their real seat angles (HQFloor.ANG), big wall screens (equity, scoreboard, signals, ticker),
// side desks for the project's specialists. Live state comes from HQFloor.desks() (tf events); panels are HTML in #tw-stonks (floor.js).
(function () {
  "use strict";
  const SEAT_R = 3.05, TABLE_R = 1.95, CANDLES = 24;
  const F = () => window.HQFloor;
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
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex, toneMapped: false })); m.position.set(x, y, z); m.rotation.y = rotY || 0; I.g.add(m);
    const fm = new T.MeshBasicMaterial({ color: frame, toneMapped: false });
    for (const [bw, bh, bx, by] of [[w + 0.12, 0.05, 0, h / 2], [w + 0.12, 0.05, 0, -h / 2], [0.05, h, -w / 2, 0], [0.05, h, w / 2, 0]]) { const b = new T.Mesh(new T.BoxGeometry(bw, bh, 0.04), fm); b.position.set(bx, by, -0.03); m.add(b); }
    return { m, tex, ctx, cw, ch: chh, sig: "" };
  }
  function lineChart(c, x, y, w, h, vals, col) {
    if (vals.length < 2) { c.strokeStyle = "rgba(255,255,255,.18)"; c.setLineDash([8, 8]); c.beginPath(); c.moveTo(x, y + h / 2); c.lineTo(x + w, y + h / 2); c.stroke(); c.setLineDash([]); return; }
    const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1; c.strokeStyle = col; c.lineWidth = 5; c.shadowColor = col; c.shadowBlur = 16; c.beginPath();
    vals.forEach((v, i) => { const px = x + (i / (vals.length - 1)) * w, py = y + h - ((v - lo) / sp) * h; i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke(); c.shadowBlur = 0;
  }

  function build(I, K) {
    const T = K.THREE, g = I.g, hw = I.hw, col = I.f.color, f = F(), S = (I.stonks = { seat: {}, side: [], pads: {}, rings: {}, screens: {}, last: 0 });
    const add = { transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false };
    // table
    const mesh = (geo, mat, y) => { const m = new T.Mesh(geo, mat); m.position.y = y; g.add(m); return m; };
    mesh(new T.CylinderGeometry(TABLE_R, TABLE_R - 0.1, 0.1, 64), I.metal, 0.72); mesh(new T.CylinderGeometry(0.6, 1.0, 0.68, 20), I.dark, 0.35);
    mesh(new T.TorusGeometry(TABLE_R, 0.035, 6, 80).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.5), toneMapped: false }), 0.775);
    for (const [r, o] of [[0.55, 0.3], [1.5, 0.18]]) mesh(new T.RingGeometry(r, r + 0.03, 64).rotateX(-Math.PI / 2), new T.MeshBasicMaterial(Object.assign({ color: col, opacity: o }, add)), 0.785);
    // holographic candles: equity history (or an idle wave) as a ring of glowing bars
    S.candles = []; const cg = new T.Group(); cg.position.y = 0.78; g.add(cg);
    for (let i = 0; i < CANDLES; i++) { const a = (i / CANDLES) * Math.PI * 2, m = new T.Mesh(new T.BoxGeometry(0.11, 1, 0.11), new T.MeshBasicMaterial(Object.assign({ color: 0x34d399, opacity: 0.8 }, add))); m.position.set(Math.cos(a) * 1.0, 0.1, Math.sin(a) * 1.0); m.scale.y = 0.2; cg.add(m); S.candles.push({ m, h: 0.2 }); }
    S.globe = mesh(new T.SphereGeometry(0.42, 16, 10), new T.MeshBasicMaterial(Object.assign({ color: col, wireframe: true, opacity: 0.5 }, add)), 1.5);
    S.ring = mesh(new T.TorusGeometry(0.62, 0.012, 6, 56).rotateX(Math.PI / 2 + 0.5), new T.MeshBasicMaterial(Object.assign({ color: col.clone().multiplyScalar(1.5), opacity: 0.7 }, add)), 1.5);
    const pl = new T.PointLight(col.clone(), 6, 9, 2); pl.position.set(0, 1.8, 0); g.add(pl); S.pl = pl;
    // seats at the real desk angles: chair, table pad, floor ring
    deskMembers(K).forEach((d) => {
      const p = seatPos(d.desk), sg = new T.Group(); sg.position.set(p.x, 0, p.z); sg.rotation.y = p.yaw; g.add(sg); S.seat[d.desk] = p;
      K.box(sg, 0.55, 0.08, 0.55, I.dark, 0, 0.48, 0); K.box(sg, 0.5, 0.6, 0.08, I.dark, 0, 0.82, -0.26); K.box(sg, 0.08, 0.46, 0.08, I.metal, 0, 0.23, 0);
      const c = new T.Color(d.hex), a = Math.atan2(p.x, -p.z), pg = new T.Group(); pg.position.set(Math.sin(a) * (TABLE_R - 0.32), 0.79, -Math.cos(a) * (TABLE_R - 0.32)); pg.rotation.y = p.yaw; g.add(pg);
      const pm = new T.MeshBasicMaterial({ color: 0x000000, toneMapped: false }); K.box(pg, 0.62, 0.012, 0.3, pm, 0, 0, 0); S.pads[d.desk] = { m: pm, c };
      const rm = new T.MeshBasicMaterial(Object.assign({ color: c, opacity: 0 }, add)); const rg = new T.Mesh(new T.RingGeometry(0.5, 0.58, 32).rotateX(-Math.PI / 2), rm); rg.position.set(p.x, 0.03, p.z); g.add(rg); S.rings[d.desk] = { m: rm };
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
    sc.tick = screen(K, I, Math.min(hw * 2 - 0.6, 11), 0.42, 2048, 96, 0, 3.0, z, 0, fc); sc.tick.tex.wrapS = T.RepeatWrapping; sc.tick.tex.repeat.x = 0.5; sc.tick.m.material.needsUpdate = true;
    const stripM = new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.8), toneMapped: false }); for (const x of [-hw + 0.1, hw - 0.1]) K.box(g, 0.06, 3.0, 0.06, stripM, x, 1.5, -hw + 0.12);
    I.anim = (t, dt) => anim(I, K, t, dt);
  }

  function drawScreens(I, K) {
    const S = I.stonks, f = F(), D = f.data(), V = f.desks(), st = D.stats || {}, sf = st.safety || {}, paused = sf.status === "PAUSED", run = V.running, eq = (D.equity || []).map((p) => p.total).filter((v) => v != null);
    const sg = (name, sig, fn) => { const s = S.screens[name]; if (s.sig === sig) return; s.sig = sig; const c = s.ctx; c.clearRect(0, 0, s.cw, s.ch); c.fillStyle = "rgba(3,9,14,.96)"; c.fillRect(0, 0, s.cw, s.ch); fn(c, s.cw, s.ch); s.tex.needsUpdate = true; };
    const head = (c, w, txt, col) => { c.textBaseline = "middle"; c.textAlign = "left"; c.font = "700 34px Consolas, monospace"; c.shadowColor = col; c.shadowBlur = 14; c.fillStyle = col; c.fillText(txt, 28, 38); c.shadowBlur = 0; c.fillStyle = "rgba(255,255,255,.1)"; c.fillRect(24, 68, w - 48, 2); };
    sg("eq", "e" + eq.length + "|" + (eq[eq.length - 1] || 0), (c, w, h) => { head(c, w, "EQUITY CURVE", amb); lineChart(c, 40, 100, w - 80, h - 150, eq, up); c.font = "600 24px Consolas, monospace"; c.fillStyle = "#8fa3b0"; c.textAlign = "right"; c.fillText(eq.length ? usd(eq[eq.length - 1]) : "no ledger yet", w - 30, h - 24); });
    const total = st.totalEquity != null ? st.totalEquity : st.equity, ret = st.retPct, label = paused ? "PAUSED" : run ? "RUNNING" : "IDLE", lc = paused ? dn : run ? amb : "#5eead4";
    sg("main", label + "|" + total + "|" + ret + "|" + (run ? Math.floor(performance.now() / 700) % 2 : 0), (c, w, h) => {
      c.textAlign = "center"; c.textBaseline = "middle"; c.shadowColor = lc; c.shadowBlur = 24; c.fillStyle = lc; c.font = "800 64px Consolas, monospace"; c.fillText("STONKS FLOOR", w / 2, 78); c.shadowBlur = 0;
      c.font = "700 44px Consolas, monospace"; c.fillStyle = lc; c.fillText((run && Math.floor(performance.now() / 700) % 2 ? "● " : "○ ") + label, w / 2, 160);
      c.font = "800 92px Consolas, monospace"; c.fillStyle = "#e6edf3"; c.shadowColor = "#5eead4"; c.shadowBlur = 18; c.fillText(total != null ? usd(total) : "--", w / 2, 292); c.shadowBlur = 0;
      c.font = "700 46px Consolas, monospace"; c.fillStyle = ret > 0 ? up : ret < 0 ? dn : "#8fa3b0"; c.fillText(ret != null ? (ret > 0 ? "+" : "") + ret + "% since start" : "paper book", w / 2, 392);
      c.font = "600 24px Consolas, monospace"; c.fillStyle = "#6b7d8a"; c.fillText("PAPER TRADING · research only", w / 2, 462);
    });
    const al = (D.alerts || []).slice().sort((a, b) => ({ BUY: 0, SELL: 1, WATCH: 2 }[a.action] - { BUY: 0, SELL: 1, WATCH: 2 }[b.action]) || b.confidence - a.confidence).slice(0, 6);
    sg("sig", "s" + al.map((a) => a.ticker + a.action + a.confidence).join(","), (c, w, h) => {
      head(c, w, "SIGNAL BOARD", amb); if (!al.length) { c.font = "600 26px Consolas, monospace"; c.fillStyle = "#6b7d8a"; c.fillText("no alerts yet", 40, 140); }
      al.forEach((a, i) => { const y = 112 + i * 52, cc = a.action === "BUY" ? up : a.action === "SELL" ? dn : amb; c.fillStyle = cc; c.fillRect(30, y - 18, 6, 38); c.textAlign = "left"; c.font = "700 32px Consolas, monospace"; c.shadowColor = cc; c.shadowBlur = 10; c.fillText(a.action, 50, y); c.fillStyle = "#e6edf3"; c.shadowBlur = 0; c.fillText(a.ticker, 190, y); c.textAlign = "right"; c.fillStyle = "#8fa3b0"; c.fillText(String(a.confidence != null ? a.confidence : ""), w - 30, y); });
    });
    const tp = D.tape && D.tape.length ? D.tape : [{ s: "SPY", px: 0, chg: 0 }], tsig = "t" + tp.map((x) => x.s + x.chg).join(",");
    const s = S.screens.tick; if (s.sig !== tsig) { s.sig = tsig; const c = s.ctx; c.fillStyle = "rgba(3,9,14,.97)"; c.fillRect(0, 0, s.cw, s.ch); c.textBaseline = "middle"; c.font = "700 44px Consolas, monospace";
      const half = s.cw / 2; let x = 24; const items = []; while (x < half - 120 && items.length < 60) for (const q of tp) { if (x >= half - 120) break; const txt = q.s + " " + (q.chg > 0 ? "▲" : q.chg < 0 ? "▼" : "") + (q.px ? " " + q.px : "") + " " + (q.chg > 0 ? "+" : "") + q.chg + "%"; items.push([x, txt, q.chg]); x += c.measureText(txt).width + 70; }
      for (const off of [0, half]) for (const [ix, txt, chg] of items) { c.fillStyle = chg > 0 ? up : chg < 0 ? dn : "#a8b8c4"; c.fillText(txt, ix + off, s.ch / 2); }
      s.tex.needsUpdate = true; }
  }

  function anim(I, K, t, dt) {
    const S = I.stonks, f = F(); if (!S || !f) return; const V = f.desks(), D = f.data();
    if (t - S.last > 0.4) { S.last = t; drawScreens(I, K); }
    S.screens.tick.tex.offset.x = (t * 0.018) % 1;
    S.globe.rotation.y = t * 0.5; S.ring.rotation.z = t * 0.6; S.pl.intensity = 5 + 1.5 * Math.sin(t * 2.1) + (V.running ? 2 : 0);
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
      const lvl = st === "working" ? 0.95 + 0.25 * Math.sin(t * 5 + (o ? o.ph : 0)) : st === "error" ? 0.8 : st === "done" ? 0.3 : 0.05;
      pad.m.color.copy(st === "error" ? K.red : pad.c).multiplyScalar(lvl); ring.m.opacity = st === "working" ? 0.55 + 0.25 * Math.sin(t * 5) : st === "done" ? 0.1 : 0;
    }
  }

  // tower.js calls this each ~0.3s and after syncInterior: set working/text on the desk-agent members from the live events
  function applyDesks(I, K) {
    const f = F(); if (!f || !I.stonks) return; const V = f.desks(), curAg = V.cur && V.cur.text ? V.cur.agent : "";
    for (const o of I.members.values()) {
      const id = o.m && o.m.desk; if (!id) continue; const s = V.st[id] || { status: "idle", text: "" }, isCur = !!curAg && (curAg === id || (curAg === "debate" && (id === "bull" || id === "bear")));
      const working = s.status === "working", done = s.status === "done", text = working || isCur ? short(s.text, 110) : "", sig = s.status + "|" + text + "|" + (f.selected() === id);
      o.working = working; o.done = done; o.text = text; o.sel = f.selected() === id;
      if (o.sig !== sig) { o.sig = sig; o.tag.classList.toggle("on", working); o.tag.classList.toggle("sel", o.sel); o.tag.classList.toggle("done", done); o.bub.textContent = text; o.bub.classList.toggle("hidden", !text); const st = o.tag.querySelector("span"); if (st) st.textContent = s.status; }
    }
  }
  window.HQStonks3D = { build, deskMembers, seatPos, sidePos, applyDesks, SEAT_R };
})();
