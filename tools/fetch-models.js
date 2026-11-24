// Build time only: downloads the Whisper (STT) and Kokoro (TTS) models into build/models so the installer carries them.
// The installed app loads them from resources\models with remote access disabled. Run: npm run models
// Each model loads in a fresh child process with retries. On a fresh CI runner onnxruntime can open a file that is still being
// written ("system error 13") and leave a truncated .onnx behind ("Protobuf parsing failed"), so before retrying we delete the
// file named in the error and download it again. (The workers cache a failed load in-process, hence the child process.)
const path = require("path"), fs = require("fs"), { spawnSync } = require("child_process");
const out = path.join(__dirname, "..", "build", "models");
const MODELS = { whisper: ["../stt-worker.js", "whisper-cache"], kokoro: ["../tts-worker.js", "kokoro-cache"] };

if (MODELS[process.argv[2]]) { // child: load one model, print the error on failure
  const [mod, dir] = MODELS[process.argv[2]];
  require(mod).load(path.join(out, dir)).then(() => process.exit(0), (e) => { console.error("LOAD-ERROR " + e.message); process.exit(1); });
} else {
  fs.mkdirSync(out, { recursive: true });
  const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  for (const name of Object.keys(MODELS)) {
    for (let attempt = 1; ; attempt++) {
      console.log(name + "... (attempt " + attempt + ")");
      const r = spawnSync(process.execPath, [__filename, name], { encoding: "utf8", stdio: ["ignore", "inherit", "pipe"] });
      if (r.status === 0) break;
      const err = String(r.stderr || "").trim(); console.error(err.slice(-600));
      if (attempt >= 4) { console.error("fetch-models failed: " + name); process.exit(1); }
      const bad = /Load model from (.+?\.onnx) failed/.exec(err);
      if (bad && fs.existsSync(bad[1]) && path.resolve(bad[1]).startsWith(path.resolve(out))) { fs.rmSync(bad[1], { force: true }); console.log("removed partial file " + bad[1]); }
      sleep(5000 * attempt);
    }
  }
  const size = (d) => fs.readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).reduce((a, e) => a + fs.statSync(path.join(e.parentPath, e.name)).size, 0);
  console.log("done:", Math.round(size(out) / 1048576), "MB in", out);
}
