// War room: agents seated around a holographic table. Each character speaks its real latest step in a speech bubble;
// speakers take turns, so the room reads like a conversation. All drawn on one 2D canvas (original art, no assets).
(function () {
  const TAU = Math.PI * 2, cv = document.getElementById("scene"), c = cv.getContext("2d");
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const hue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const dur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m ? m + "m" : s + "s"; };
  let W = 0, H = 0, d = 1, acc = [25, 227, 208], crew = [], usage = null, selected = null, hits = [];
  const chars = new Map(); // id -> character state
  const queue = []; let lastSpeakAt = 0, speaker = null;
  const HOST = { id: "hq", name: "HQ", role: "host", kind: "host", status: "running", steps: [], files: [] };

  const view = document.getElementById("room-view");
  const visible = () => !view.classList.contains("hidden");
  function resize() { d = devicePixelRatio || 1; const b = cv.getBoundingClientRect(); W = cv.width = Math.max(1, b.width * d); H = cv.height = Math.max(1, b.height * d); }
  new ResizeObserver(resize).observe(view); resize();
  HQTheme.onAccent((rgb) => (acc = rgb));
  const A = (a) => `rgba(${acc},${a})`;

  const phrase = (s) => { if (!s) return ""; const t = s.kind === "tool" ? s.text.replace(/^(\w+) · /, (m, n) => ({ Bash: "Running ", PowerShell: "Running ", Read: "Reading ", Edit: "Editing ", Write: "Writing ", Grep: "Searching ", Glob: "Looking for ", WebFetch: "Fetching ", WebSearch: "Searching the web for ", Agent: "Briefing a sub-agent: ", TodoWrite: "Updating the plan " }[n] || n + ": ")) : s.text; return t.length > 170 ? t.slice(0, 167) + "…" : t; };

  // ---------- crew sync ----------
  function sync(list) {
    crew = list.slice(0, 11);
    const ids = new Set(crew.map((a) => a.id)); ids.add("hq");
    for (const id of [...chars.keys()]) if (!ids.has(id)) { chars.delete(id); if (selected === id) closeDetail(); }
    for (const a of [HOST, ...crew]) {
      let ch = chars.get(a.id);
      if (!ch) { ch = { id: a.id, hue: a.id === "hq" ? null : hue(a.name), phase: Math.random() * TAU, bubble: null, talk: 0, last: "", born: performance.now() }; chars.set(a.id, ch); if (a.id !== "hq") say("hq", greetLine(a)); }
      ch.a = a;
      const latest = a.steps && a.steps.length ? phrase(a.steps[a.steps.length - 1]) : a.step || "";
      if (a.id !== "hq" && latest && latest !== ch.last) { ch.last = latest; say(a.id, latest); }
    }
    $("#sub").textContent = (demo ? "DEMO MODE (Ctrl+D to exit) · " : "") + crew.filter((x) => x.status === "running").length + " working · " + crew.length + " seated" + (usage ? " · session " + Math.round(usage) + "%" : "");
    if (selected) showDetail(selected);
  }
  function greetLine(a) { return (a.kind === "chat" ? "Console session joined: " : a.kind === "board" ? (a.proj || "Team") + " · " : "New agent on deck: ") + a.name + "."; }
  function say(id, text) { if (!text) return; const i = queue.findIndex((q) => q.id === id); if (i >= 0) queue.splice(i, 1); queue.push({ id, text }); if (queue.length > 14) queue.shift(); }

  function feed(ch, text) {
    const f = $("#feed"), row = el("div"); row.style.setProperty("--c", ch.hue === null ? `rgb(${acc})` : `hsl(${ch.hue},80%,65%)`);
    row.append(el("b", "", (ch.a ? ch.a.name : "HQ").slice(0, 28) + ": "), document.createTextNode(text)); f.append(row);
    while (f.children.length > 12) f.firstChild.remove();
  }
  function tick(now) {
    // next speaker every ~2.6 s; idle chatter after 14 s of quiet
    if (now - lastSpeakAt > 2600 && queue.length) {
      const q = queue.shift(), ch = chars.get(q.id);
      if (ch) { ch.bubble = { text: q.text, t0: now, until: now + Math.max(4500, q.text.length * 55) }; ch.talk = now + Math.min(3500, q.text.length * 40); speaker = ch; lastSpeakAt = now; feed(ch, q.text); }
    } else if (now - lastSpeakAt > 14000) {
      const live = crew.filter((a) => a.status === "running");
      if (live.length) { const a = live[Math.floor(Math.random() * live.length)], ch = chars.get(a.id); if (ch && ch.last) say(a.id, "Still on it: " + ch.last.replace(/^Still on it: /, "")); }
      else say("hq", usage !== null ? "All quiet. Session usage at " + Math.round(usage) + "%." : "All quiet. Standing by.");
      lastSpeakAt = now - 1500;
    }
  }

  // ---------- drawing ----------
  function roundRect(x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function wrap(text, maxW) { const words = text.split(/\s+/), lines = []; let cur = ""; for (const w of words) { const t = cur ? cur + " " + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; }

  function drawRoom(t) {
    const g = c.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.75);
    g.addColorStop(0, `rgba(${acc},0.045)`); g.addColorStop(0.5, "rgba(4,10,14,1)"); g.addColorStop(1, "#010203"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    // floor grid in perspective
    const hz = H * 0.42; c.lineWidth = 1 * d;
    for (let i = -14; i <= 14; i++) { c.strokeStyle = A(0.05); c.beginPath(); c.moveTo(W / 2 + i * W * 0.012, hz); c.lineTo(W / 2 + i * W * 0.16, H); c.stroke(); }
    for (let k = 0; k < 14; k++) { const y = hz + (H - hz) * Math.pow(k / 14, 2.1); c.strokeStyle = A(0.04 + k * 0.004); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    // back wall panels
    for (let i = 0; i < 9; i++) { const x = W * (0.06 + i * 0.11), w = W * 0.08, h = H * 0.18, y = H * 0.1 + Math.sin(i) * 4 * d; c.strokeStyle = A(0.07); c.strokeRect(x, y, w, h); c.fillStyle = A(0.015 + 0.01 * Math.sin(t / 1300 + i)); c.fillRect(x, y, w, h);
      c.fillStyle = A(0.12); for (let k = 0; k < 5; k++) c.fillRect(x + 6 * d, y + 10 * d + k * 9 * d, (w - 12 * d) * (0.3 + 0.7 * Math.abs(Math.sin(t / 2200 + i * 2 + k))), 2 * d); }
  }
  // centred on the window; sized so the seats clear the chat column on the right (460px incl. margin)
  const ZOOM = 1.25; // table + agents 25% bigger (Hayden 2026-11-23)
  const table = () => { const fit = Math.max(120 * d, (W / 2 - 100 * d) / 1.05); return { x: W / 2, y: H * 0.64, rx: Math.min(W * 0.3, H * 0.62, fit) * ZOOM, ry: Math.min(H * 0.13, W * 0.07) * ZOOM }; };
  function seats(n) { // host at the head (top centre), others spread along the back arc
    // others split left/right of the host, leaving a gap around the head seat
    const T = table(), out = [{ ang: -Math.PI / 2 }], others = n - 1, gap = 0.36, edge = Math.PI * 0.43;
    const L = Math.ceil(others / 2), Rn = others - L;
    for (let i = 0; i < L; i++) out.push({ ang: -Math.PI / 2 - gap - (edge - gap) * (L === 1 ? 0.5 : i / (L - 1)) });
    for (let i = 0; i < Rn; i++) out.push({ ang: -Math.PI / 2 + gap + (edge - gap) * (Rn === 1 ? 0.5 : i / (Rn - 1)) });
    return out.map((s) => ({ x: T.x + Math.cos(s.ang) * T.rx * 1.05, y: T.y + Math.sin(s.ang) * T.ry * 1.25 - 8 * d, ang: s.ang }));
  }
  function drawTable(t) {
    const T = table();
    c.save(); c.translate(T.x, T.y);
    // shadow + body
    c.fillStyle = "rgba(0,0,0,.55)"; c.beginPath(); c.ellipse(0, T.ry * 0.9, T.rx * 1.02, T.ry * 0.9, 0, 0, TAU); c.fill();
    const side = c.createLinearGradient(0, 0, 0, T.ry * 0.7); side.addColorStop(0, A(0.14)); side.addColorStop(1, "rgba(2,6,8,1)");
    c.fillStyle = side; c.beginPath(); c.ellipse(0, T.ry * 0.35, T.rx, T.ry, 0, 0, Math.PI); c.lineTo(-T.rx, 0); c.ellipse(0, 0, T.rx, T.ry, 0, Math.PI, 0, true); c.fill();
    const top = c.createRadialGradient(0, 0, 0, 0, 0, T.rx); top.addColorStop(0, A(0.05)); top.addColorStop(0.7, "rgba(6,16,20,.96)"); top.addColorStop(1, "rgba(4,10,13,1)");
    c.fillStyle = top; c.beginPath(); c.ellipse(0, 0, T.rx, T.ry, 0, 0, TAU); c.fill();
    c.strokeStyle = A(0.8); c.lineWidth = 2 * d; c.shadowColor = A(1); c.shadowBlur = 16 * d; c.stroke(); c.shadowBlur = 0;
    // concentric rings on the surface
    for (let k = 1; k <= 3; k++) { c.strokeStyle = A(0.12 + 0.05 * Math.sin(t / 900 + k)); c.lineWidth = 1 * d; c.beginPath(); c.ellipse(0, 0, T.rx * k * 0.22, T.ry * k * 0.22, 0, 0, TAU); c.stroke(); }
    // rotating sweep
    const sw = (t / 2400) % TAU; c.strokeStyle = A(0.35); c.beginPath(); c.ellipse(0, 0, T.rx * 0.72, T.ry * 0.72, 0, sw, sw + 0.6); c.stroke();
    c.restore();
  }
  function drawHolo(t) {
    const T = table(), cx = T.x, cy = T.y - T.ry * 0.2; let R = T.ry * 1.25;
    // light cone
    const cone = c.createLinearGradient(0, cy - R * 1.9, 0, cy); cone.addColorStop(0, A(0)); cone.addColorStop(1, A(0.07));
    c.fillStyle = cone; c.beginPath(); c.moveTo(cx - R * 0.3, cy); c.lineTo(cx - R * 0.9, cy - R * 1.9); c.lineTo(cx + R * 0.9, cy - R * 1.9); c.lineTo(cx + R * 0.3, cy); c.fill();
    // wireframe globe (hovers low over the table, in front of the host)
    const gy = cy - R * 0.95, rot = t / 3000; R *= 0.8;
    c.lineWidth = 1 * d;
    for (let i = 0; i < 8; i++) { const a = rot + (i / 8) * Math.PI; c.strokeStyle = A(0.18 + 0.12 * Math.abs(Math.cos(a))); c.beginPath(); c.ellipse(cx, gy, Math.abs(Math.cos(a)) * R * 0.75 + 0.5, R * 0.75, 0, 0, TAU); c.stroke(); }
    for (let k = -2; k <= 2; k++) { const yy = gy + k * R * 0.28, rr = Math.sqrt(Math.max(0, 1 - Math.pow(k * 0.37, 2))) * R * 0.75; c.strokeStyle = A(0.2); c.beginPath(); c.ellipse(cx, yy, rr, rr * 0.22, 0, 0, TAU); c.stroke(); }
    // orbiting project tags
    const projs = [...new Set(crew.map((a) => a.proj).filter(Boolean))].slice(0, 6);
    c.font = `${10 * d}px Consolas, monospace`; c.textAlign = "center";
    projs.forEach((p, i) => { const a = rot * 1.6 + (i / projs.length) * TAU, x = cx + Math.cos(a) * R * 1.15, y = gy + Math.sin(a) * R * 0.3, front = Math.sin(a) > 0; c.fillStyle = A(front ? 0.9 : 0.35); c.fillText(String(p).replace(/^C--Users-Hhowe-(Projects-)?/i, "").slice(0, 18).toUpperCase(), x, y); });
    // beam from the current speaker
    if (speaker && speaker.pos && performance.now() < speaker.talk + 600) {
      const p = speaker.pos; c.strokeStyle = speaker.hue === null ? A(0.5) : `hsla(${speaker.hue},90%,65%,.5)`; c.lineWidth = 1.5 * d; c.setLineDash([6 * d, 8 * d]); c.lineDashOffset = -t / 30;
      c.beginPath(); c.moveTo(p.x, p.y - 30 * d); c.quadraticCurveTo((p.x + cx) / 2, gy - R, cx, gy); c.stroke(); c.setLineDash([]);
    }
  }
  function drawChar(ch, p, t) {
    const a = ch.a, s = (0.85 + 0.3 * ((p.y - H * 0.5) / (H * 0.2))) * (H / 560) * ZOOM, host = ch.id === "hq";
    const col = host ? `rgb(${acc})` : `hsl(${ch.hue},85%,62%)`, colA = (al) => (host ? A(al) : `hsla(${ch.hue},85%,62%,${al})`);
    const stalled = a.status === "stalled", talking = t < ch.talk, bob = Math.sin(t / 900 + ch.phase) * 2.2 * s, intro = Math.min(1, (t - ch.born) / 700);
    c.save(); c.translate(p.x, p.y + (1 - intro) * 30 * s); c.globalAlpha = intro;
    // chair back
    c.fillStyle = "rgba(10,18,22,.95)"; roundRect(-30 * s, -98 * s, 60 * s, 92 * s, 10 * s); c.fill(); c.strokeStyle = colA(0.25); c.lineWidth = 1.2 * d; c.stroke();
    // torso
    c.translate(0, bob);
    const tg = c.createLinearGradient(0, -70 * s, 0, 0); tg.addColorStop(0, "rgba(28,40,46,1)"); tg.addColorStop(1, "rgba(10,16,20,1)");
    c.fillStyle = tg; c.beginPath(); c.moveTo(-24 * s, 0); c.quadraticCurveTo(-27 * s, -52 * s, -14 * s, -62 * s); c.lineTo(14 * s, -62 * s); c.quadraticCurveTo(27 * s, -52 * s, 24 * s, 0); c.closePath(); c.fill();
    c.strokeStyle = colA(0.55); c.lineWidth = 1.4 * d; c.stroke();
    c.fillStyle = colA(stalled ? 0.25 : 0.7); c.beginPath(); c.arc(0, -40 * s, 4 * s, 0, TAU); c.fill(); // chest light
    // arms resting toward the table (typing when talking)
    const tap = talking ? Math.sin(t / 90) * 2 * s : 0;
    c.fillStyle = "rgba(20,30,36,1)"; roundRect(-30 * s, -30 * s + tap, 12 * s, 30 * s, 5 * s); c.fill(); roundRect(18 * s, -30 * s - tap, 12 * s, 30 * s, 5 * s); c.fill();
    // neck + head
    c.fillStyle = "rgba(16,24,28,1)"; c.fillRect(-5 * s, -70 * s, 10 * s, 9 * s);
    c.fillStyle = "rgba(24,36,42,1)"; roundRect(-17 * s, -100 * s, 34 * s, 32 * s, 11 * s); c.fill(); c.strokeStyle = colA(0.6); c.stroke();
    // visor
    const vg = talking ? 0.75 + 0.25 * Math.sin(t / 70) : stalled ? 0.25 : 0.55 + 0.1 * Math.sin(t / 700 + ch.phase);
    c.fillStyle = stalled ? "rgba(255,176,46,.35)" : colA(vg); c.shadowColor = col; c.shadowBlur = (talking ? 18 : 8) * d;
    roundRect(-13 * s, -91 * s, 26 * s, 9 * s, 4 * s); c.fill(); c.shadowBlur = 0;
    if (talking) { c.fillStyle = "rgba(255,255,255,.85)"; for (let i = 0; i < 5; i++) { const h = (2 + Math.abs(Math.sin(t / 60 + i * 1.7)) * 5) * s; c.fillRect((-9 + i * 4.5) * s, -86.5 * s - h / 2, 2 * s, h); } }
    // antenna
    c.strokeStyle = colA(0.6); c.beginPath(); c.moveTo(10 * s, -100 * s); c.lineTo(14 * s, -110 * s); c.stroke(); c.fillStyle = colA(talking ? 1 : 0.5); c.beginPath(); c.arc(14 * s, -111 * s, 2.2 * s, 0, TAU); c.fill();
    if (host) { c.strokeStyle = colA(0.8); c.lineWidth = 1.5 * d; c.beginPath(); c.arc(0, -84 * s, 26 * s, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); }
    if (stalled) { c.fillStyle = "rgba(255,176,46,.7)"; c.font = `${11 * s}px Consolas, monospace`; c.fillText("z", 20 * s, -104 * s + Math.sin(t / 500) * 3 * s); c.fillText("z", 27 * s, -114 * s + Math.sin(t / 500 + 1) * 3 * s); }
    c.restore();
    ch.pos = { x: p.x, y: p.y - 60 * s, s };
  }
  // Name plates go on top of the table (drawn after it), at each seat's table edge.
  function drawPlate(ch, p) {
    const a = ch.a, host = ch.id === "hq", s = ch.pos ? ch.pos.s : d, colA = (al) => (host ? A(al) : `hsla(${ch.hue},85%,62%,${al})`);
    const plateY = p.y + 6 * d;
    c.font = `600 ${12 * d}px Segoe UI, sans-serif`; c.textAlign = "center";
    const nm = (a.name || "").length > 26 ? a.name.slice(0, 25) + "…" : a.name, sub = host ? "HOST" : (a.kind === "chat" ? "CONSOLE" : a.kind === "board" ? (a.proj || "TEAM").toUpperCase() : (a.role || "AGENT").toUpperCase()) + (a.start ? " · " + dur(Date.now() - a.start) : "");
    const pw = Math.max(c.measureText(nm).width, 80 * d) + 16 * d;
    c.fillStyle = "rgba(4,10,13,.85)"; roundRect(p.x - pw / 2, plateY, pw, 30 * d, 4 * d); c.fill(); c.strokeStyle = colA(selected === ch.id ? 0.9 : 0.35); c.lineWidth = 1 * d; c.stroke();
    c.fillStyle = "#dff6f4"; c.fillText(nm, p.x, plateY + 13 * d);
    c.font = `${8.5 * d}px Consolas, monospace`; c.fillStyle = colA(0.85); c.fillText(sub.slice(0, 34), p.x, plateY + 24 * d);
    hits.push({ id: ch.id, x: p.x - Math.max(pw / 2, 34 * s), y: p.y - 115 * s, w: Math.max(pw, 68 * s), h: 115 * s + 40 * d });
  }
  function drawBubble(ch, t) {
    const b = ch.bubble; if (!b || t > b.until || !ch.pos) return;
    const fade = Math.min(1, (b.until - t) / 500, (t - b.t0) / 200), shown = b.text.slice(0, Math.floor((t - b.t0) / 18));
    c.font = `${12.5 * d}px Segoe UI, sans-serif`; const maxW = 250 * d, lines = wrap(shown || " ", maxW).slice(0, 4), lh = 16 * d;
    const w = Math.max(...lines.map((l) => c.measureText(l).width), 40 * d) + 20 * d, h = lines.length * lh + 14 * d;
    let x = ch.pos.x - w / 2, y = ch.pos.y - 75 * ch.pos.s - h - 14 * d; x = Math.max(10 * d, Math.min(W - w - 10 * d, x)); y = Math.max(46 * d, y);
    const col = ch.hue === null ? A(0.9) : `hsla(${ch.hue},85%,62%,.9)`;
    c.globalAlpha = fade; c.fillStyle = "rgba(6,14,18,.92)"; roundRect(x, y, w, h, 8 * d); c.fill(); c.strokeStyle = col; c.lineWidth = 1.2 * d; c.stroke();
    c.beginPath(); c.moveTo(ch.pos.x - 7 * d, y + h); c.lineTo(ch.pos.x, y + h + 10 * d); c.lineTo(ch.pos.x + 7 * d, y + h); c.fillStyle = "rgba(6,14,18,.92)"; c.fill();
    c.fillStyle = "#e6fbf8"; c.textAlign = "left"; lines.forEach((l, i) => c.fillText(l, x + 10 * d, y + 18 * d + i * lh));
    c.globalAlpha = 1;
  }
  function frame(t) {
    requestAnimationFrame(frame); if (document.hidden || !visible()) return;
    tick(t); hits = [];
    drawRoom(t);
    const list = [chars.get("hq"), ...crew.map((a) => chars.get(a.id))].filter(Boolean), ss = seats(list.length);
    list.forEach((ch, i) => (ch.seat = ss[i]));
    // characters sit behind the table: draw them first, then the table, then holo and bubbles on top
    list.slice().sort((a, b) => a.seat.y - b.seat.y).forEach((ch) => drawChar(ch, ch.seat, t));
    drawTable(t); drawHolo(t);
    list.forEach((ch) => drawPlate(ch, ch.seat));
    if (!crew.length) { const T = table(); c.font = `${12 * d}px Consolas, monospace`; c.textAlign = "center"; c.fillStyle = A(0.55); c.fillText("NO AGENTS RUNNING · SEATS OPEN", T.x, T.y + T.ry * 0.15); }
    list.forEach((ch) => drawBubble(ch, t));
  }
  requestAnimationFrame(frame);

  // ---------- detail panel ----------
  function showDetail(id) {
    const ch = chars.get(id); if (!ch) return closeDetail(); selected = id; const a = ch.a, p = $("#detail"); p.textContent = "";
    p.style.setProperty("--c", ch.hue === null ? `rgb(${acc})` : `hsl(${ch.hue},85%,65%)`);
    const x = el("button", "x", "✕"); x.onclick = closeDetail; p.append(x, el("h3", "", a.name));
    p.append(el("div", "meta", [a.kind === "chat" ? "HQ console chat" : a.kind === "board" ? "team board" : a.kind === "host" ? "HQ host" : a.role, a.proj, a.model, a.start ? "running " + dur(Date.now() - a.start) : "", a.status].filter(Boolean).join(" · ")));
    if (id === "hq") { p.append(el("div", "stp", crew.length + " seated, " + crew.filter((z) => z.status === "running").length + " working.")); if (usage !== null) p.append(el("div", "stp", "Session usage " + Math.round(usage) + "%.")); }
    if (a.steps && a.steps.length) { p.append(el("div", "sec", "RECENT STEPS")); a.steps.slice().reverse().forEach((s) => p.append(el("div", "stp " + (s.kind === "tool" ? "tool" : ""), phrase(s)))); }
    else if (a.step) { p.append(el("div", "sec", "NOW")); p.append(el("div", "stp", a.step)); }
    if (a.files && a.files.length) { p.append(el("div", "sec", "FILES")); a.files.slice().reverse().forEach((f) => p.append(el("div", "stp tool", (f.op === "edit" ? "✎ " : "◦ ") + String(f.p).replace(/\\/g, "/").split("/").slice(-3).join("/")))); }
    p.classList.remove("hidden");
  }
  function closeDetail() { selected = null; $("#detail").classList.add("hidden"); }
  cv.addEventListener("click", (e) => { const x = e.offsetX * d, y = e.offsetY * d; const h = hits.slice().reverse().find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); h ? showDetail(h.id) : closeDetail(); });
  cv.addEventListener("mousemove", (e) => { const x = e.offsetX * d, y = e.offsetY * d; cv.style.cursor = hits.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) ? "pointer" : "default"; });
  // Ctrl+D: demo crew (clearly labelled) to preview a full table when nothing is running.
  let demo = null, realCrew = [];
  function demoCrew() {
    const t0 = Date.now(), mk = (id, name, role, proj, lines) => ({ id: "demo-" + id, kind: "agent", name, role, proj, model: "sonnet", status: "running", start: t0 - Math.random() * 9e5, steps: [{ kind: "say", text: lines[Math.floor(Math.random() * lines.length)] }], files: [] });
    return [mk(1, "DEMO tech-lead", "tech-lead", "Lumen", ["Splitting the scorer fix into two tasks.", "Reviewing the plan before handing it out."]), mk(2, "DEMO worker-jobs", "worker", "Lumen", ["Running npm test: 212 passed.", "Editing src/sources/adzuna.js"]), mk(3, "DEMO researcher", "researcher", "Hustles", ["Searching the web for Etsy fee changes.", "Reading three sources on print-on-demand margins."]), mk(4, "DEMO qa-runner", "qa", "Health Tracker", ["Smoke test passed on the PWA.", "Checking the login flow on mobile size."]), mk(5, "DEMO writer", "writer", "LumenAds", ["Drafting a 20-second TikTok script.", "Waiting on the voice render."])];
  }
  function toggleDemo() { if (demo) { clearInterval(demo); demo = null; sync(realCrew); return; } const run = () => sync(demoCrew().concat(realCrew)); run(); demo = setInterval(run, 6000); }
  // Keys only act while the war room is the visible view. Esc closes the detail panel first, then goes back to HQ.
  addEventListener("keydown", (e) => {
    if (!visible()) return;
    const typing = /^(TEXTAREA|INPUT|SELECT)$/.test((e.target && e.target.tagName) || "");
    if (typing) { if (e.key === "Escape") { if (S_busy()) document.getElementById("btn-stop").click(); else e.target.blur(); } return; }
    if (e.ctrlKey && e.key.toLowerCase() === "d") { e.preventDefault(); toggleDemo(); }
    else if (e.key === "Escape") { if (selected) closeDetail(); else window.HQView && window.HQView("hq"); }
  });

  // ---------- wiring (theme + music are handled by app.js for the whole window) ----------
  hq.on("crew", (c) => { realCrew = c; if (!demo) sync(c); });
  hq.on("usage", (u) => { usage = u && u.usage && u.usage.five_hour ? u.usage.five_hour.utilization : null; });
  function S_busy() { const b = document.getElementById("btn-stop"); return b && !b.classList.contains("hidden"); }
  window.HQRoom = { shown() { resize(); lastSpeakAt = 0; }, focus(id) { if (chars.has(id)) showDetail(id); } };
  (async () => {
    hq.usage(false).then((u) => { usage = u && u.usage && u.usage.five_hour ? u.usage.five_hour.utilization : null; });
    sync(await hq.crew()); say("hq", "War room online. " + (crew.length ? crew.length + " seated." : "No agents running yet."));
  })();
})();
