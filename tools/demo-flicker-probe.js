// dev-only: run via SCRIPT=./demo-flicker-probe.js electron tools/demo-record.js x.webm (sample data). Measures frame-to-frame pixel change on the Trading floor.
module.exports = async (c) => {
  const { run, val, sleep, wc } = c;
  await sleep(2500); await run(`HQView("tower")`); await sleep(2000); await run(`HQGoStonks()`); await sleep(7000);
  const grab = async (n, gap) => { const out = []; for (let i = 0; i < n; i++) { const im = await wc.capturePage(); out.push({ b: im.toBitmap(), s: im.getSize() }); await sleep(gap); } return out; };
  const diff = (fr) => { const res = []; for (let i = 1; i < fr.length; i++) { const a = fr[i - 1], b = fr[i], w = a.s.width, h = a.s.height; let n = 0; const x0 = Math.round(w * 0.2), x1 = Math.round(w * 0.8), y0 = Math.round(h * 0.1), y1 = Math.round(h * 0.55); for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const k = (y * w + x) * 4; if (Math.abs(a.b[k] - b.b[k]) + Math.abs(a.b[k + 1] - b.b[k + 1]) + Math.abs(a.b[k + 2] - b.b[k + 2]) > 40) n++; } res.push(n); } return res; };
  const state = await val(`JSON.stringify({run:HQFloor.running&&HQFloor.running(), dv:HQFloor.dv&&HQFloor.dv()})`); console.log("state", state);
  console.log("diff pixels per frame (board region):", diff(await grab(14, 120)).join(" "));
  const info = await val(`(()=>{const I=HQTower.interior&&HQTower.interior();return "x"})()`).catch(() => "n/a");
};
// (appended) heat map of changed pixels between two frames
module.exports = ((orig) => async (c) => {
  await orig(c);
  const { wc, sleep } = c, { nativeImage } = require("electron"), fs = require("fs"), path = require("path");
  const a = await wc.capturePage(); await sleep(150); const b = await wc.capturePage(), s = a.getSize(), A = a.toBitmap(), B = b.toBitmap(), O = Buffer.alloc(A.length);
  for (let i = 0; i < A.length; i += 4) { const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); const v = d > 40 ? 255 : A[i] >> 2; O[i] = v; O[i + 1] = d > 40 ? 0 : A[i + 1] >> 2; O[i + 2] = d > 40 ? 0 : A[i + 2] >> 2; O[i + 3] = 255; }
  fs.writeFileSync(path.join(require("os").tmpdir(), "flk-heat.png"), nativeImage.createFromBitmap(O, { width: s.width, height: s.height }).toPNG());
  fs.writeFileSync(path.join(require("os").tmpdir(), "flk-a.png"), a.toPNG());
})(module.exports);
