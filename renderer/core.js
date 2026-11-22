// The HQ core: an original HUD orb drawn on a 2D canvas. Segmented rings turn at different speeds around a
// glowing particle sphere. Moods change speed, colour and pulse: idle, think (Claude working), speak (reply streaming), alert.
(function () {
  const TAU = Math.PI * 2;
  class Core {
    constructor(cv) {
      this.cv = cv; this.ctx = cv.getContext("2d"); this.mood = "idle"; this.energy = 0; this.target = 0; this.small = false; this.t0 = performance.now();
      this.pts = Array.from({ length: 420 }, () => { const u = Math.random() * 2 - 1, th = Math.random() * TAU, r = Math.sqrt(1 - u * u); return { x: r * Math.cos(th), y: u, z: r * Math.sin(th), s: Math.random() }; });
      this.rings = [
        { r: 1.32, w: 2, segs: 3, gap: .5, spd: .22 }, { r: 1.5, w: 1, segs: 60, gap: .55, spd: -.08, tick: true },
        { r: 1.68, w: 3, segs: 5, gap: .35, spd: .12 }, { r: 1.9, w: 1, segs: 1, gap: .0, spd: 0, faint: true },
        { r: 2.05, w: 2, segs: 2, gap: 1.6, spd: -.3 },
      ];
      this.resize(); addEventListener("resize", () => this.resize());
      new ResizeObserver(() => this.resize()).observe(cv.parentElement);
      this.raf = requestAnimationFrame((t) => this.frame(t));
    }
    resize() { const d = devicePixelRatio || 1, b = this.cv.getBoundingClientRect(); this.cv.width = Math.max(1, b.width * d); this.cv.height = Math.max(1, b.height * d); this.dpr = d; }
    setMood(m) { this.mood = m; this.target = { idle: .15, think: .65, speak: 1, alert: .8 }[m] ?? .15; }
    colour(a) { return this.mood === "alert" ? `rgba(255,176,46,${a})` : `rgba(${this.rgb || "25,227,208"},${a})`; }
    setAccent(rgb, sec) { this.rgb = rgb.join(","); if (sec) this.rgb2 = sec.join(","); }
    colour2(a) { return this.mood === "alert" ? `rgba(255,176,46,${a})` : `rgba(${this.rgb2 || "255,95,168"},${a})`; }
    frame(now) {
      this.raf = requestAnimationFrame((t) => this.frame(t));
      if (document.hidden || !this.cv.offsetParent) return; // paused while the war room view is showing
      const c = this.ctx, W = this.cv.width, H = this.cv.height, d = this.dpr, t = (now - this.t0) / 1000;
      this.energy += (this.target - this.energy) * 0.04;
      // Audio is heavily smoothed and only drives glow + the equalizer ring, never the sphere's size (no shaking).
      const A = window.HQAudio; if (A) A.read();
      this.lvl = (this.lvl || 0) + (((A && A.level) || 0) - (this.lvl || 0)) * 0.05;
      if (!this.bars) this.bars = new Float32Array(32);
      for (let i = 0; i < 32; i++) { const v = A ? A.bands[i] : 0, b = this.bars[i]; this.bars[i] = v > b ? b + (v - b) * 0.18 : b + (v - b) * 0.06; }
      const lvl = this.lvl;
      const e = Math.min(1, this.energy + lvl * 0.35), speak = this.mood === "speak" ? (Math.sin(t * 9) * .5 + .5) * (Math.sin(t * 3.7) * .5 + .5) : 0;
      c.clearRect(0, 0, W, H);
      const small = this.cv.parentElement.classList.contains("small"), mus = !small && this.cv.parentElement.classList.contains("has-music");
      // with the now-playing bar centred on top, the orb sits a little lower and smaller
      const cx = small ? 60 * d : W / 2, cy = small ? H / 2 : mus ? H / 2 + 12 * d : H / 2 - 14 * d;
      const R = (small ? 22 : Math.min(W, H) * (mus ? 0.17 : 0.19)) * (1 + speak * 0.05) ;
      // glow
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * 2.4);
      g.addColorStop(0, this.colour(0.28 + e * 0.25)); g.addColorStop(0.35, this.colour(0.08 + e * 0.08)); g.addColorStop(1, this.colour(0));
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 2.4, 0, TAU); c.fill();
      // particle sphere
      const rotY = t * (0.25 + e * 0.9), rotX = Math.sin(t * 0.3) * 0.35, cyR = Math.cos(rotY), syR = Math.sin(rotY), cxR = Math.cos(rotX), sxR = Math.sin(rotX);
      for (const p of this.pts) {
        let x = p.x * cyR - p.z * syR, z = p.x * syR + p.z * cyR, y = p.y * cxR - z * sxR; z = p.y * sxR + z * cxR;
        const wob = 1 + Math.sin(t * 2 + p.s * 12) * 0.03 * (1 + e * 2) + speak * 0.08 * p.s;
        const k = (z + 2) / 3, a = 0.15 + k * 0.75;
        c.fillStyle = p.s < 0.22 ? this.colour2(a) : this.colour(a); c.beginPath(); c.arc(cx + x * R * wob, cy + y * R * wob, (0.6 + k * 1.3) * d * (small ? .7 : 1), 0, TAU); c.fill();
      }
      // core
      c.fillStyle = this.colour(0.9); c.shadowColor = this.colour(1); c.shadowBlur = (14 + e * 26) * d;
      c.beginPath(); c.arc(cx, cy, R * (0.16 + e * 0.05 + speak * 0.05), 0, TAU); c.fill(); c.shadowBlur = 0;
      if (small) return;
      // tell the page how far the rings reach, so the side text sits just outside them
      const reach = Math.round((R * 2.1) / d); if (reach !== this.reach) { this.reach = reach; this.cv.parentElement.style.setProperty("--orb", reach + "px"); }
      // audio equalizer: 64 radial bars (32 bands mirrored) just outside the sphere
      if (A && A.on && lvl > 0.005) {
        c.lineWidth = 2 * d; c.lineCap = "round";
        for (let i = 0; i < 64; i++) {
          const band = this.bars[i < 32 ? i : 63 - i], ang = (i / 64) * TAU - Math.PI / 2, r0 = R * 1.14, r1 = r0 + band * R * 0.4;
          c.strokeStyle = (i % 32) > 20 ? this.colour2(0.25 + band * 0.7) : this.colour(0.25 + band * 0.7);
          c.beginPath(); c.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); c.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); c.stroke();
        }
      }
      // rings
      this.rings.forEach((rg, ri) => {
        const rr = R * rg.r, rot = t * rg.spd * (1 + e * 2.2), al = rg.faint ? 0.12 : 0.35 + e * 0.35;
        c.strokeStyle = ri === 2 || ri === 4 ? this.colour2(al * 0.9) : this.colour(al); c.lineWidth = rg.w * d;
        if (rg.tick) { for (let i = 0; i < rg.segs; i++) { const a = rot + (i / rg.segs) * TAU, l = i % 5 === 0 ? 7 : 3; c.beginPath(); c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); c.lineTo(cx + Math.cos(a) * (rr + l * d), cy + Math.sin(a) * (rr + l * d)); c.stroke(); } return; }
        const seg = TAU / rg.segs;
        for (let i = 0; i < rg.segs; i++) { c.beginPath(); c.arc(cx, cy, rr, rot + i * seg, rot + (i + 1) * seg - rg.gap); c.stroke(); }
      });
      // scanning sweep
      const sw = t * (0.6 + e), rr = R * 1.9;
      const grd = c.createConicGradient ? c.createConicGradient(sw, cx, cy) : null;
      if (grd) { grd.addColorStop(0, this.colour(0.22 * (0.4 + e))); grd.addColorStop(0.08, this.colour(0)); grd.addColorStop(1, this.colour(0)); c.fillStyle = grd; c.beginPath(); c.arc(cx, cy, rr, 0, TAU); c.arc(cx, cy, R * 1.34, 0, TAU, true); c.fill(); }
      // (side readouts removed: the vitals and usage HUD panels sit beside the core instead)
    }
  }
  window.HQCore = Core;
})();
