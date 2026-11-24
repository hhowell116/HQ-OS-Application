/* Brain shape for the Nebula "brain" layout.
 *
 * brainPoint() is adapted from Flora 3D (src/flora3d.js, brainPoint) by ParanoaiDev,
 * https://github.com/ParanoaiDev/obsidian-flora, MIT License.
 *
 * MIT License - Copyright (c) ParanoaiDev
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and
 * this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED
 * "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 *
 * The other shapes live in shapes.js. Everything else here (lobes per project, dust, layout) is HQ OS's own code.
 * Unit coordinates: x right, y up, z forward (frontal lobe at +z).
 */
(function () {
  "use strict";
  const SCALE = 240;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // returns the part: 0 cortex/temporal, 1 cerebellum, 2 stem, 3 inner volume
  function brainPoint(rnd, out) {
    const pick = rnd();
    if (pick < 0.6) {
      for (let tries = 0; tries < 14; tries++) {
        const y = rnd() * 2 - 1, a = rnd() * 6.2832, q = Math.sqrt(1 - y * y);
        const dx = Math.cos(a) * q, dy = y, dz = Math.sin(a) * q;
        if (dy < -0.6) continue;
        // gyri: wavy ridges, almost no points in the sulci
        const f1 = Math.sin(dx * 10 + Math.sin(dz * 7 + dy * 4) * 1.9 + dy * 6), f2 = Math.cos(dz * 9 + Math.sin(dx * 7 - dy * 3) * 1.6);
        const fold = Math.abs(f1 * f2);
        if (rnd() > 0.08 + 0.92 * Math.pow(fold, 0.8)) continue;
        if (Math.abs(dx) > 0.42 && dz > -0.5 && dz < 0.5 && Math.abs(dy - (-0.02 - 0.3 * dz)) < 0.03) continue; // lateral sulcus
        if (dy > 0.15 && Math.abs(dz - (-0.02 - 0.32 * (1 - dy))) < 0.022) continue; // central sulcus
        let r = 1 + 0.04 * fold;
        r *= 1 - 0.24 * Math.exp(-(dx * dx) / 0.01) * clamp((dy + 0.15) / 0.5, 0, 1); // fissure between the hemispheres
        r *= 1 + 0.07 * clamp(dz, 0, 1) * clamp(dy + 0.2, 0, 1); // forehead a little higher
        r *= 1 - 0.09 * clamp(-dz - 0.5, 0, 1); // occiput narrower
        r *= 1 - 0.09 * rnd() * rnd(); // cortex thickness
        out[0] = dx * 0.84 * r; out[1] = dy * (dy > 0 ? 0.74 : 0.5) * r + 0.08; out[2] = dz * 1.1 * r;
        return 0;
      }
    }
    if (pick < 0.7) { // temporal lobes: two elongated ovals underneath, at the sides
      const y = rnd() * 2 - 1, a = rnd() * 6.2832, q = Math.sqrt(1 - y * y), side = rnd() < 0.5 ? -1 : 1, r = 1 - 0.1 * rnd() * rnd();
      out[0] = side * 0.5 + Math.cos(a) * q * 0.3 * r; out[1] = -0.3 + y * 0.2 * r; out[2] = 0.18 + Math.sin(a) * q * 0.56 * r;
      return 0;
    }
    if (pick < 0.78) { // sparse inner volume so the shape is not an empty shell
      const y = rnd() * 2 - 1, a = rnd() * 6.2832, q = Math.sqrt(1 - y * y), r = Math.cbrt(rnd()) * 0.9;
      out[0] = Math.cos(a) * q * 0.8 * r; out[1] = y * (y > 0 ? 0.7 : 0.46) * r + 0.08; out[2] = Math.sin(a) * q * 1.04 * r;
      return 3;
    }
    if (pick < 0.92) { // cerebellum folia
      for (let tries = 0; tries < 8; tries++) {
        const y = rnd() * 2 - 1, a = rnd() * 6.2832, q = Math.sqrt(1 - y * y);
        if (rnd() > 0.2 + 0.8 * Math.abs(Math.sin(y * 30))) continue;
        const r = 1 - 0.08 * rnd() * rnd();
        out[0] = Math.cos(a) * q * 0.52 * r; out[1] = y * 0.24 * r - 0.5; out[2] = Math.sin(a) * q * 0.34 * r - 0.68;
        return 1;
      }
    }
    const t = rnd(), a = rnd() * 6.2832, r = (0.13 - 0.06 * t) * (0.9 + 0.1 * rnd()); // brain stem
    out[0] = Math.cos(a) * r; out[1] = -0.42 - t * 0.78; out[2] = Math.sin(a) * r - 0.24 - t * 0.16;
    return 2;
  }

  // projectIds ordered biggest first. Each project gets a lobe = Voronoi cell around a spread-out seed on the cortex.
  function layout(projectIds, shape) {
    const SH = window.HQShapes && window.HQShapes[shape], pt = SH ? SH.fn : brainPoint;
    const rnd = mulberry(20261123), tmp = [0, 0, 0], pool = [];
    for (let i = 0; i < 9000; i++) { const part = pt(rnd, tmp); if (part !== 3) pool.push([tmp[0] * SCALE, tmp[1] * SCALE, tmp[2] * SCALE]); }
    const K = Math.max(1, projectIds.length), seeds = [];
    let first = pool[0]; for (const p of pool) if (p[2] > first[2]) first = p; seeds.push(first);
    const dmin = pool.map((p) => 1e9);
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    while (seeds.length < K) {
      const s = seeds[seeds.length - 1]; let best = -1, bi = 0;
      for (let i = 0; i < pool.length; i++) { dmin[i] = Math.min(dmin[i], d2(pool[i], s)); if (dmin[i] > best) { best = dmin[i]; bi = i; } }
      seeds.push(pool[bi]);
    }
    const nearest = (p) => { let b = 0, bd = 1e12; for (let k = 0; k < seeds.length; k++) { const d = d2(p, seeds[k]); if (d < bd) { bd = d; b = k; } } return b; };
    const lobes = seeds.map(() => ({ pts: [], c: [0, 0, 0], i: 0 }));
    for (const p of pool) lobes[nearest(p)].pts.push(p);
    for (const l of lobes) { for (const p of l.pts) { l.c[0] += p[0]; l.c[1] += p[1]; l.c[2] += p[2]; } const n = l.pts.length || 1; l.c = l.c.map((v) => v / n); l.pts.sort(() => rnd() - 0.5); }
    const idx = new Map(projectIds.map((id, i) => [id, i]));
    const lobeOf = (pid) => lobes[idx.has(pid) ? idx.get(pid) : 0];
    return {
      centroid: (pid) => lobeOf(pid).c.slice(),
      core: () => (SH ? SH.core.map((v) => v * SCALE) : [0, 0.2 * SCALE, 0]),
      // next free cortex point inside the project's lobe (wraps with jitter when the lobe is full)
      place(pid) { const l = lobeOf(pid), p = l.pts[l.i % l.pts.length], j = l.i >= l.pts.length ? 4 : 0; l.i++; return [p[0] + (rnd() - 0.5) * j, p[1] + (rnd() - 0.5) * j, p[2] + (rnd() - 0.5) * j]; },
      reset() { lobes.forEach((l) => (l.i = 0)); },
      // dust filling the brain volume: positions + the lobe index of each (so it can take the project's colour)
      dust(n) {
        const r2 = mulberry(77), pos = new Float32Array(n * 3), lobe = new Uint8Array(n), o = [0, 0, 0];
        for (let i = 0; i < n; i++) { pt(r2, o); const p = [o[0] * SCALE + (r2() - 0.5) * 7, o[1] * SCALE + (r2() - 0.5) * 7, o[2] * SCALE + (r2() - 0.5) * 7]; pos.set(p, i * 3); lobe[i] = nearest(p); }
        return { pos, lobe, ids: projectIds };
      },
    };
  }
  window.HQBrain = { layout, brainPoint, SCALE };
})();
