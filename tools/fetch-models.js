// Build time only: downloads the Whisper (STT) and Kokoro (TTS) models into build/models so the installer carries them.
// The installed app loads them from resources\models with remote access disabled. Run: npm run models
const path = require("path"), fs = require("fs");
const out = path.join(__dirname, "..", "build", "models");
(async () => {
  fs.mkdirSync(out, { recursive: true });
  console.log("whisper...");
  await require("../stt-worker.js").load(path.join(out, "whisper-cache"));
  console.log("kokoro...");
  await require("../tts-worker.js").load(path.join(out, "kokoro-cache"));
  const size = (d) => fs.readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).reduce((a, e) => a + fs.statSync(path.join(e.parentPath, e.name)).size, 0);
  console.log("done:", Math.round(size(out) / 1048576), "MB in", out);
  process.exit(0);
})().catch((e) => { console.error("fetch-models failed:", e.message); process.exit(1); });
