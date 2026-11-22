const path = require("path"), fs = require("fs");
const w = require("../tts-worker.js");
(async () => {
  const out = process.argv[2], voice = process.argv[3] || "am_michael";
  const cache = path.join(process.env.TEMP, "hq-kokoro-cache");
  let t0 = Date.now(); const k = await w.load(cache); console.log("model load ms", Date.now() - t0);
  t0 = Date.now(); const a = await k.generate("Good evening, Hayden. All systems are online, and the build passed every test.", { voice, speed: 1.1 });
  console.log("first audio ms", Date.now() - t0, "seconds", (a.audio.length / a.sampling_rate).toFixed(2));
  const b = w.wav(a); fs.writeFileSync(out, b); console.log("wav bytes", b.length, b.toString("ascii", 0, 4), b.toString("ascii", 8, 12));
})().catch((e) => { console.error(e); process.exit(1); });
