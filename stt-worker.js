// Whisper STT worker (Electron utilityProcess or plain node). Messages: {type:"init",cache} | {id, type:"transcribe", audio:Float32Array(16kHz mono), cache}
const send = (m) => (process.parentPort ? process.parentPort.postMessage(m) : process.send && process.send(m));
const MODEL = "Xenova/whisper-base.en";
let asr = null, loading = null, lastP = "";
async function load(cache) {
  if (asr) return asr;
  if (!loading) loading = (async () => {
    const tf = await import("@huggingface/transformers");
    if (cache) tf.env.cacheDir = cache;
    if (process.env.HQ_OFFLINE && cache) { tf.env.localModelPath = cache; tf.env.allowLocalModels = true; tf.env.allowRemoteModels = false; } // bundled models: never touch the network
    asr = await tf.pipeline("automatic-speech-recognition", MODEL, {
      dtype: { encoder_model: "fp32", decoder_model_merged: "q8" }, device: "cpu",
      progress_callback: (p) => { if (p && p.status === "progress") { const pct = Math.round(p.progress || 0), k = p.file + ":" + pct; if (k !== lastP) { lastP = k; send({ type: "progress", pct, file: p.file }); } } },
    });
    return asr;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}
let chain = Promise.resolve();
async function transcribe(m) {
  try {
    const p = await load(m.cache);
    const audio = m.audio instanceof Float32Array ? m.audio : new Float32Array(m.audio.buffer ? m.audio.buffer.slice(m.audio.byteOffset, m.audio.byteOffset + m.audio.byteLength) : m.audio);
    const r = await p(audio, { chunk_length_s: 30, stride_length_s: 5 });
    send({ type: "text", id: m.id, text: String((r && r.text) || "").trim() });
  } catch (e) { send({ type: "error", id: m.id, error: String((e && e.message) || e) }); }
}
const onMsg = (m) => { if (m.type === "init") load(m.cache).then(() => send({ type: "ready" }), (e) => send({ type: "error", error: String(e.message || e) })); else if (m.type === "transcribe") chain = chain.then(() => transcribe(m)); };
if (process.parentPort) process.parentPort.on("message", (e) => onMsg(e.data)); else process.on("message", onMsg);
module.exports = { load };
