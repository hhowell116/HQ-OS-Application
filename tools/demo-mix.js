// Muxes the recorded webm + the synthesized sample track (synced via <webm>.json) into an H.264/AAC mp4.
// Run: node tools/demo-mix.js <in.webm> <out.mp4> <path to ffmpeg.exe>
const { spawnSync } = require("child_process"), fs = require("fs");
const [inp, outp, ff] = process.argv.slice(2), wav = require("path").join(require("os").tmpdir(), "hqos-demo-track.wav"); require("./demo-sample.js").music(wav);
const m = JSON.parse(fs.readFileSync(inp + ".json", "utf8"));
const off = Math.max(0, (m.musicStart - m.recStart) / 1000), dur = (m.musicEnd - m.musicStart) / 1000;
const a = `[1:a]atrim=0:${dur.toFixed(2)},adelay=${Math.round(off * 1000)}|${Math.round(off * 1000)},afade=t=out:st=${(off + dur - 1.5).toFixed(2)}:d=1.5[a]`;
const r = spawnSync(ff, ["-y", "-loglevel", "error", "-i", inp, "-stream_loop", "-1", "-i", wav, "-filter_complex", a, "-map", "0:v", "-map", "[a]", "-shortest", "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outp], { stdio: "inherit" });
process.exit(r.status);
