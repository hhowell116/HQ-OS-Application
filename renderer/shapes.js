/* Extra Nebula shapes: black hole, galaxy, planet, torus (brain lives in brain.js).
 *
 * The galaxy arm formula and the planet (bands + C/B/A rings with Cassini and Encke gaps) are adapted from Flora 3D
 * (src/shapes.js) by ParanoaiDev, https://github.com/ParanoaiDev/obsidian-flora, MIT License.
 * The black hole is inspired by Flora's "Space Neurons" black hole theme; the point distribution is HQ OS's own.
 *
 * MIT License - Copyright (c) 2026 Paranoia Dev
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and
 * this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED
 * "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 *
 * Every function is fn(rnd, out) -> part: out = [x,y,z] in unit coordinates (about -1..1, y up, camera at +z).
 * part 3 = loose volume (dust only, never takes notes); 0/1/2 = figure points.
 */
(function () {
  "use strict";
  const TAU = 6.283185307179586;
  const gs = (r) => (r() + r() + r() + r() - 2) * 0.87;
  function dir(r, o) { const y = r() * 2 - 1, a = r() * TAU, q = Math.sqrt(1 - y * y); o[0] = Math.cos(a) * q; o[1] = y; o[2] = Math.sin(a) * q; }
  // tip the whole figure toward the camera so discs read as discs
  const tiltX = (o, ang) => { const c = Math.cos(ang), s = Math.sin(ang), y = o[1] * c - o[2] * s, z = o[2] * c + o[1] * s; o[1] = y; o[2] = z; };

  // dark void in the middle, glowing accretion disk, thin photon ring facing us, two faint jets, a few far stars
  function blackhole(r, o) {
    const k = r();
    if (k < 0.7) { // disk: denser toward the inside, spiral banding, thin
      const t = r(), R = 0.3 + 0.72 * t * t, a = r() * TAU;
      const band = 0.5 + 0.5 * Math.sin(a * 2 - 7 * Math.log(R));
      if (r() > 0.35 + 0.65 * band) return blackhole(r, o);
      o[0] = Math.cos(a) * R; o[1] = gs(r) * 0.018 * (0.4 + R); o[2] = Math.sin(a) * R; tiltX(o, 0.42);
      return R < 0.5 ? 2 : 0;
    }
    if (k < 0.82) { // photon ring: light bent over the top and under the bottom, faces the camera
      const a = r() * TAU, R = 0.285 + gs(r) * 0.012;
      o[0] = Math.cos(a) * R; o[1] = Math.sin(a) * R; o[2] = gs(r) * 0.01; return 2;
    }
    if (k < 0.9) { // jets along the spin axis (disk is tipped, so the axis leans a little)
      const s = r() < 0.5 ? -1 : 1, t = 0.12 + 0.9 * Math.pow(r(), 0.8), w = 0.015 + 0.06 * t;
      o[0] = gs(r) * w; o[1] = s * t; o[2] = gs(r) * w; tiltX(o, 0.42); return 1;
    }
    dir(r, o); const R = 0.95 + 0.35 * r(); o[0] *= R; o[1] *= R * 0.8; o[2] *= R; return 3;
  }

  // three log-spiral arms (Flora) with a thick bulge and a thin disc
  function galaxy(r, o) {
    if (r() < 0.16) { dir(r, o); const R = Math.pow(r(), 1.6) * 0.3; o[0] *= R; o[1] *= R * 0.7; o[2] *= R; tiltX(o, 0.5); return 2; }
    const t = r(), a = ((r() * 3) | 0) * TAU / 3 + 2.4 * Math.log(1 + t * 6) * 1.25, R = 0.12 + 0.88 * Math.sqrt(t);
    const sp = 0.025 + 0.07 * R;
    o[0] = Math.cos(a) * R + gs(r) * sp; o[2] = Math.sin(a) * R + gs(r) * sp; o[1] = gs(r) * 0.035 * (1.2 - R);
    tiltX(o, 0.5); return r() < 0.12 ? 3 : 0;
  }

  // planet with cloud bands and rings (Flora's saturn)
  const tilt = (o) => { const x = o[0], y = o[1], z = o[2], c = Math.cos(0.42), s = Math.sin(0.42), y1 = y * c - x * s, x1 = x * c + y * s, c2 = Math.cos(0.3), s2 = Math.sin(0.3); o[0] = x1; o[1] = y1 * c2 - z * s2; o[2] = z * c2 + y1 * s2; tiltX(o, 0.6); };
  function planet(r, o) {
    if (r() < 0.42) { for (;;) { dir(r, o); if (r() < 0.18 + 0.82 * (0.5 + 0.5 * Math.sin(o[1] * 19 + 0.6 * Math.sin(o[1] * 7)))) break; } o[0] *= 0.4; o[1] *= 0.365; o[2] *= 0.4; tilt(o); return 0; }
    let rr;
    for (;;) { rr = 0.5 + 0.5 * r(); if (rr > 0.742 && rr < 0.782) continue; if (rr > 0.878 && rr < 0.888) continue; if (rr > 0.925 && rr < 0.965) continue; if (rr < 0.58 && r() < 0.7) continue; if (rr > 0.975 && r() < 0.6) continue; break; }
    const a = r() * TAU; o[0] = rr * Math.cos(a); o[1] = gs(r) * 0.003; o[2] = rr * Math.sin(a); tilt(o);
    return rr < 0.58 ? 1 : rr < 0.742 ? 0 : rr > 0.965 ? 2 : 0;
  }

  // donut: ridged tube surface, a few points inside the hole's rim
  function torus(r, o) {
    const u = r() * TAU, v = r() * TAU, R = 0.68, rr = 0.3;
    const ridge = 0.5 + 0.5 * Math.sin(u * 18 + v * 3);
    if (r() > 0.2 + 0.8 * ridge) return torus(r, o);
    const q = rr * (1 + 0.05 * ridge) * (1 - 0.1 * r() * r());
    o[0] = (R + q * Math.cos(v)) * Math.cos(u); o[2] = (R + q * Math.cos(v)) * Math.sin(u); o[1] = q * Math.sin(v);
    tiltX(o, 1.1); return 0;
  }

  // core node position (unit coordinates); default is the middle
  const SHAPES = {
    hole: { name: "black hole", fn: blackhole, core: [0, 0.285, 0] },
    galaxy: { name: "galaxy", fn: galaxy, core: [0, 0, 0] },
    planet: { name: "planet", fn: planet, core: [0, 0, 0] },
    torus: { name: "torus", fn: torus, core: [0, 0, 0] },
  };
  window.HQShapes = SHAPES;
})();
