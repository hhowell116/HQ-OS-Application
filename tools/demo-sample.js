// Builds a throwaway SAMPLE projects folder for the walkthrough demo (never touches real notes).
const fs = require("fs"), path = require("path");
const P = [
  { n: "Atlas", c: "Mapping app for hiking trails", team: ["planner", "builder", "tester"], now: ["Ship trail search", "Fix offline tiles"], next: ["Add elevation chart", "Dark map style", "Write onboarding copy", "Cache warm-up"], wait: ["Pick the launch date", "Approve the app icon"], rev: ["Trail search screen", "Onboarding copy v2"] },
  { n: "Beacon", c: "Newsletter and audience tools", team: ["writer", "editor"], now: ["Draft issue 12"], next: ["Subscriber import", "A/B subject lines", "Archive page"], wait: ["Choose the sponsor", "Sign off the welcome email"], rev: ["Issue 12 draft"] },
  { n: "Cinder", c: "Home automation dashboard", team: ["integrator", "designer", "tester"], now: ["Pair the new sensors"], next: ["Energy graph", "Night mode", "Voice scenes"], wait: ["Pick the hub model"], rev: [] },
  { n: "Harbor", c: "Small business bookkeeping helper", team: ["analyst", "builder"], now: [], next: ["Invoice templates", "Tax summary export"], wait: ["Approve the pricing page"], rev: ["Pricing page mock"] },
  { n: "Stocks", c: "Paper-trading practice", team: ["scout", "trader"], now: ["Backtest the breakout rule"], next: ["Add a risk cap", "Weekly report"], wait: [], rev: [] },
];
module.exports = function build(root) {
  const w = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const now = new Date().toISOString();
  for (const p of P) {
    const nd = path.join(root, p.n, "Notes");
    const L = ["# " + p.n + " To-Do", "", "## Next", ...p.now.concat(p.next).map((t, i) => (i + 1) + ". [ ] " + t), "", "## Waiting on you", ...p.wait.map((t) => "- [ ] " + t), ""];
    w(path.join(nd, p.n + " To-Do.md"), L.join("\n"));
    w(path.join(nd, "Claude", "Index.md"), "# Index\n\n" + p.c + ".\n\n- [[" + p.n + " Architecture]]\n- [[" + p.n + " Decisions]]\n");
    w(path.join(nd, "Claude", p.n + " Architecture.md"), "# " + p.n + " Architecture\n\nSee [[" + p.n + " Decisions]] and [[Index]].\n");
    w(path.join(nd, "Claude", p.n + " Decisions.md"), "# " + p.n + " Decisions\n\nBack to [[" + p.n + " Architecture]].\n");
    p.rev.forEach((t) => w(path.join(nd, "Review", t + ".md"), '---\ntitle: "' + t + '"\nstatus: "needs-review"\ncreated: "' + now + '"\n---\nSample item for the demo. Looks good, ready for a decision.\n'));
    p.team.forEach((r) => w(path.join(root, p.n, ".claude", "agents", p.n.toLowerCase() + "-" + r + ".md"), "---\nname: " + p.n.toLowerCase() + "-" + r + "\ndescription: Sample " + r + " for " + p.n + "\nmodel: sonnet\n---\nSample agent.\n"));
  }
  for (const r of ["researcher", "qa-engineer", "tech-lead", "docs-writer"]) w(path.join(root, "Agent Team", "Agents", r + ".md"), "---\nname: " + r + "\ndescription: Shared core " + r + "\nmodel: sonnet\n---\nSample.\n");
  // Stocks stub: a harmless engine + sample equity curve so the Trading floor shows tidy sample numbers (no real data).
  const sd = path.join(root, "Stocks");
  w(path.join(sd, "engine", "safety.js"), "exports.health=()=>({ok:true,why:[]});");
  w(path.join(sd, "engine", "steady.js"), "exports.book=()=>({capital:100000,equity:102400,totalEquity:102400,retPct:2.4,pnl:1850,unreal:550,winRate:62,vsSpy:0.9,trades:8,open:3,spy:{retPct:1.5},sleeves:{scanner:50000,steady:50000},safety:{status:\"ACTIVE\"},steady:{retPct:2.4,open:2,trades:5},positions:[]});");
  w(path.join(sd, "data", "equity.json"), JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ t: new Date(Date.now() - (30 - i) * 864e5).toISOString(), total: 100000 + i * 90 + Math.sin(i) * 300, scanner: 50000 + i * 40 + Math.sin(i) * 200, steady: 50000 + i * 50 + Math.cos(i) * 150 }))));
  w(path.join(root, "CLAUDE.md"), "# Sample rules\n\n- Be brief.\n- Stay in the project folder.\n");
  return root;
};
// Original synthesized track (soft arpeggio over pads) so the demo never plays anyone's music.
module.exports.music = function (file, secs = 90) {
  const sr = 22050, n = sr * secs, buf = Buffer.alloc(44 + n * 2), notes = [220, 261.63, 329.63, 392, 329.63, 261.63, 196, 246.94, 293.66, 392, 293.66, 246.94];
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sr, k = Math.floor(t * 4), nt = (t * 4) % 1, f = notes[k % notes.length] * (k % 24 >= 12 ? 1.1225 : 1), env = Math.exp(-nt * 3.2);
    const pad = 0.12 * Math.sin(2 * Math.PI * (notes[Math.floor(t / 3) % 4] / 2) * t) * (0.6 + 0.4 * Math.sin(t * 0.7));
    const kick = (t * 2) % 1 < 0.12 ? 0.35 * Math.sin(2 * Math.PI * (60 - 40 * ((t * 2) % 1)) * ((t * 2) % 1)) * (1 - ((t * 2) % 1) / 0.12) : 0;
    const v = 0.3 * env * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t)) + pad + kick;
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 0.7 * 32767))), 44 + i * 2);
  }
  fs.writeFileSync(file, buf); return file;
};
