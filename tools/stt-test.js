// Generates speech with Kokoro, then transcribes it with stt-worker. Run: node tools/stt-test.js (plain node)
const path = require("path"), os = require("os");
const cache = path.join(process.env.APPDATA, "HQ OS", "kokoro-cache"), scache = path.join(os.tmpdir(), "hq-whisper-test");
(async () => {
  const tts = require("../tts-worker.js"), stt = require("../stt-worker.js");
  const k = await tts.load(cache);
  const a = await k.generate("Testing the microphone in HQ.", { voice: "af_heart", speed: 1 });
  // 24k -> 16k linear resample
  const f = a.audio, ratio = a.sampling_rate / 16000, out = new Float32Array(Math.floor(f.length / ratio));
  for (let i = 0; i < out.length; i++) { const x = i * ratio, j = Math.floor(x), t = x - j; out[i] = f[j] * (1 - t) + (f[j + 1] ?? f[j]) * t; }
  let t0 = Date.now(); const p = await stt.load(scache); console.log("load ms", Date.now() - t0);
  t0 = Date.now(); const r = await p(out); console.log("TEXT:", JSON.stringify(r.text), "ms", Date.now() - t0);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
