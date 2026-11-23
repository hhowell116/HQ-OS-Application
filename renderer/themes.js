// Shared by every HQ OS window: colour themes, album-art accent, desktop-audio analyser.
(function () {
  const hex = (h) => { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  // Each theme: primary accent (acc), a contrasting secondary (sec) and a highlight (hl), so screens aren't one flat hue.
  // mono: one colour everywhere (Cyan). Others: the accent is the opposite colour of the main one.
  const THEMES = [
    { id: "cyan", name: "Cyan", acc: "#19e3d0", mono: true, bg: "#03080c", panel: "#081820", tx2: "#8fb6ba" },
    { id: "midnight", name: "Midnight", acc: "#748ffc", bg: "#04061a", panel: "#0d1230", tx2: "#9fa8cc" },
    { id: "ocean", name: "Ocean", acc: "#3bc9db", bg: "#020d18", panel: "#071c2e", tx2: "#9cb8cc" },
    { id: "graphite", name: "Graphite", acc: "#4dabf7", bg: "#08090a", panel: "#16181b", tx2: "#a8adb2" },
    { id: "music", name: "Music (album art)", acc: "#19e3d0", bg: "#04080b", panel: "#0a161c", tx2: "#9fb4b8", dynamic: true },
  ];
  // Accent swatches (same set as the old HQ OS picker)
  const ACCENTS = [["Amber", "#f5b83d"], ["Orange", "#ff8a3d"], ["Coral", "#ff6b6b"], ["Rose", "#f06595"], ["Orchid", "#e599f7"], ["Violet", "#9775fa"], ["Indigo", "#748ffc"], ["Sky", "#4dabf7"], ["Cyan", "#3bc9db"], ["Mint", "#38d9a9"], ["Green", "#69db7c"], ["Lime", "#c0eb75"]];
  let curTheme = "cyan", musicRGB = null, musicSec = null, accentOverride = "";
  const subs = new Set();
  // rotate a colour's hue (used to derive a secondary when the cover has only one strong colour)
  function hueRot(rgb, deg) { const [r, g, b] = rgb.map((x) => x / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn; let h = 0, s = 0; if (dd) { s = dd / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h *= 60; } h = (h + deg + 360) % 360; const c2 = (1 - Math.abs(2 * l - 1)) * Math.max(s, 0.7), x = c2 * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c2 / 2; const [a, b2, c3] = h < 60 ? [c2, x, 0] : h < 120 ? [x, c2, 0] : h < 180 ? [0, c2, x] : h < 240 ? [0, x, c2] : h < 300 ? [x, 0, c2] : [c2, 0, x]; return [a, b2, c3].map((v) => Math.max(0, Math.min(255, Math.round((v + m) * 255)))); }
  function apply(id) {
    curTheme = id || curTheme; const t = THEMES.find((x) => x.id === curTheme) || THEMES[0];
    const mix = (a, b, k) => a.map((v, i) => Math.round(v * (1 - k) + b[i] * k));
    const art = t.dynamic && musicRGB;
    const acc = art ? musicRGB : hex(accentOverride || t.acc), r = document.documentElement.style;
    // Album theme: the whole palette comes from the cover. Background and panels are dark tints of its main colour, text is tinted too.
    const bg = art ? mix([2, 4, 6], acc, 0.09) : hex(t.bg), pn = art ? mix([6, 9, 12], acc, 0.17) : hex(t.panel);
    const tx2Hex = art ? "#" + mix([150, 165, 170], acc, 0.3).map((v) => v.toString(16).padStart(2, "0")).join("") : t.tx2, bgHex = "#" + bg.map((v) => v.toString(16).padStart(2, "0")).join("");
    // accent = the opposite colour (or the cover's own second colour for the album theme); mono themes stay one colour
    // album theme: the cover's own second colour, or a lighter shade of its main colour (never an invented opposite)
    const sec = t.mono ? acc : art ? (musicSec || mix(acc, [255, 255, 255], 0.45)) : hueRot(acc, 180);
    const hl = t.mono ? mix(acc, [255, 255, 255], 0.35) : mix(sec, [255, 255, 255], 0.3);
    r.setProperty("--sec", `rgb(${sec})`); r.setProperty("--sec-rgb", sec.join(","));
    r.setProperty("--hl", `rgb(${hl})`); r.setProperty("--hl-rgb", hl.join(","));
    r.setProperty("--acc", `rgb(${acc})`); r.setProperty("--acc-rgb", acc.join(","));
    r.setProperty("--acc2", `rgb(${mix(acc, [0, 0, 0], 0.25)})`); r.setProperty("--acc-glow", `rgba(${acc},.45)`);
    r.setProperty("--line", `rgba(${acc},.18)`); r.setProperty("--line2", `rgba(${acc},.4)`);
    r.setProperty("--bg", bgHex); r.setProperty("--bg-rgb", bg.join(",")); r.setProperty("--bg2", `rgb(${mix(bg, pn, 0.6)})`);
    r.setProperty("--panel-rgb", pn.join(",")); r.setProperty("--tx2", tx2Hex); r.setProperty("--tx", `rgb(${mix(hex(tx2Hex), [240, 250, 250], 0.6)})`);
    r.setProperty("--tx3", `rgb(${mix(hex(tx2Hex), bg, 0.45)})`);
    subs.forEach((f) => f(acc, sec, hl));
  }
  // Pick a vivid, common colour from the cover; brighten it so it reads as an accent on dark panels.
  function coverColour(src) {
    return new Promise((res) => {
      if (!src) return res(null);
      const im = new Image(); im.onload = () => {
        const c = document.createElement("canvas"); c.width = c.height = 40; const x = c.getContext("2d"); x.drawImage(im, 0, 0, 40, 40);
        const d = x.getImageData(0, 0, 40, 40).data, buckets = new Map();
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, s = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
          if (s < 0.3 || l < 0.12 || l > 0.9) continue;
          let h = 0; const dd = mx - mn; h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h = Math.round(((h * 60 + 360) % 360) / 20);
          const e = buckets.get(h) || { n: 0, s: 0, r: 0, g: 0, b: 0 }; e.n++; e.s += s; e.r += r; e.g += g; e.b += b; buckets.set(h, e);
        }
        const ranked = [...buckets.entries()].map(([h, e]) => Object.assign({ h, score: e.n * (0.5 + e.s / e.n) }, e)).sort((a, b) => b.score - a.score);
        if (!ranked.length) return res(null);
        const lift = (e) => { const rgb = [e.r / e.n, e.g / e.n, e.b / e.n], m = Math.max(...rgb), k = 235 / Math.max(1, m); return rgb.map((v) => Math.min(255, Math.round(v * k))); };
        // secondary: the strongest colour at least ~60 degrees away from the main one (if the cover has one)
        const best = ranked[0], other = ranked.find((e) => { const dh = Math.abs(e.h - best.h) * 20; return Math.min(dh, 360 - dh) >= 60 && e.n >= best.n * 0.08; });
        res({ main: lift(best), sec: other ? lift(other) : null });
      }; im.onerror = () => res(null); im.src = src;
    });
  }
  async function setMusic(cover) { const r = cover ? await coverColour(cover) : null; musicRGB = r ? r.main : null; musicSec = r ? r.sec : null; if ((THEMES.find((x) => x.id === curTheme) || {}).dynamic) apply(); }

  // Desktop audio: loopback capture through getDisplayMedia (main process supplies the screen + loopback audio).
  const Audio = {
    on: false, busy: false, err: "", bands: new Float32Array(32), level: 0, bass: 0, failAt: 0,
    async start() {
      if (this.on || this.busy || Date.now() - this.failAt < 30000) return; this.busy = true; this.err = "";
      try {
        const st = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { width: 1, height: 1, frameRate: 1 } });
        st.getVideoTracks().forEach((t) => t.stop());
        const at = st.getAudioTracks(); if (!at.length) throw new Error("no desktop audio track");
        this.stream = st; this.ctx = new AudioContext(); this.an = this.ctx.createAnalyser(); this.an.fftSize = 1024; this.an.smoothingTimeConstant = 0.75;
        this.ctx.createMediaStreamSource(new MediaStream(at)).connect(this.an); this.buf = new Uint8Array(this.an.frequencyBinCount); this.on = true;
      } catch (e) { this.err = String((e && e.message) || e); this.failAt = Date.now(); this.stop(); }
      this.busy = false;
    },
    stop() { this.on = false; try { this.stream && this.stream.getTracks().forEach((t) => t.stop()); } catch (e) {} try { this.ctx && this.ctx.close(); } catch (e) {} this.stream = this.ctx = this.an = null; },
    read() {
      if (!this.on || !this.an) { this.level *= 0.9; this.bass *= 0.9; for (let i = 0; i < 32; i++) this.bands[i] *= 0.9; return; }
      const d = this.buf, n = d.length; this.an.getByteFrequencyData(d); let tot = 0;
      for (let i = 0; i < 32; i++) { const a = Math.floor(Math.pow(n * 0.6, i / 32)), b = Math.max(a + 1, Math.floor(Math.pow(n * 0.6, (i + 1) / 32))); let m = 0; for (let j = a; j < b; j++) m = Math.max(m, d[j]); this.bands[i] = m / 255; tot += m / 255; }
      this.level = tot / 32; this.bass = (this.bands[1] + this.bands[2] + this.bands[3] + this.bands[4]) / 4;
    },
  };
  function setAccent(h) { accentOverride = /^#[0-9a-f]{6}$/i.test(h || "") ? h : ""; apply(); }
  window.HQTheme = { THEMES, ACCENTS, apply, setMusic, setAccent, get accent() { return accentOverride; }, onAccent: (f) => subs.add(f), get id() { return curTheme; } };
  window.HQAudio = Audio;
})();
