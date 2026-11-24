// Kokoro TTS worker (runs in an Electron utilityProcess or plain node). Messages: {id, type:"speak", text, voice, speed} | {type:"stop"} | {type:"init"}
const send = (m) => (process.parentPort ? process.parentPort.postMessage(m) : process.send && process.send(m));
let tts = null, loading = null, gen = 0, lastP = "";
async function load(cache) {
  if (tts) return tts;
  if (!loading) loading = (async () => {
    const tf = await import("@huggingface/transformers");
    if (cache) tf.env.cacheDir = cache;
    if (process.env.HQ_OFFLINE && cache) { tf.env.localModelPath = cache; tf.env.allowLocalModels = true; tf.env.allowRemoteModels = false; } // bundled models: never touch the network
    const { KokoroTTS } = await import("kokoro-js");
    tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: "q8", device: "cpu",
      progress_callback: (p) => { if (p && p.status === "progress") { const pct = Math.round(p.progress || 0), k = p.file + ":" + pct; if (k !== lastP) { lastP = k; send({ type: "progress", pct, file: p.file }); } } },
    });
    return tts;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}
function wav(audio) { // Float32 -> 16-bit PCM WAV
  const f = audio.audio, sr = audio.sampling_rate, n = f.length, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(Math.max(-1, Math.min(1, f[i])) * 32767))), 44 + i * 2);
  return b;
}
function split(text) { return (String(text).replace(/\s+/g, " ").match(/[^.!?;:\n]+[.!?;:]*\s*/g) || [text]).map((s) => s.trim()).filter(Boolean); }
async function speak(m) {
  const my = ++gen;
  try {
    const k = await load(m.cache);
    for (const s of split(m.text)) {
      if (my !== gen) return;
      const a = await k.generate(s, { voice: m.voice || "af_heart", speed: m.speed || 1.1 });
      if (my !== gen) return;
      send({ type: "chunk", id: m.id, wav: wav(a) });
    }
    send({ type: "done", id: m.id });
  } catch (e) { send({ type: "error", id: m.id, error: String((e && e.message) || e) }); }
}
const onMsg = (m) => { if (m.type === "stop") gen++; else if (m.type === "init") load(m.cache).then(() => send({ type: "ready" }), (e) => send({ type: "error", error: String(e.message || e) })); else if (m.type === "speak") speak(m); };
if (process.parentPort) process.parentPort.on("message", (e) => onMsg(e.data)); else process.on("message", onMsg);
module.exports = { load, wav, split };
