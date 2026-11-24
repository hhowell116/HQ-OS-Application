// Transcodes the recorded video-only webm into an H.264 mp4 (no audio track).
// Run: node tools/demo-mix.js <in.webm> <out.mp4> <path to ffmpeg.exe>
const { spawnSync } = require("child_process");
const [inp, outp, ff] = process.argv.slice(2);
const r = spawnSync(ff, ["-y", "-loglevel", "error", "-i", inp, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", outp], { stdio: "inherit" });
process.exit(r.status);
