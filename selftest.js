// Packaged-app self test (only when HQ_SELFTEST=<report file> is set). Hidden-window run: checks boot, home, + project, bundled claude, offline voice models.
const fs = require("fs"), path = require("path");
const { execFile } = require("child_process");
const INS = require("./installer");
module.exports = (ctx) => {
  const rep = { startedAt: new Date().toISOString(), packaged: ctx.app.isPackaged, consoleErrors: [], checks: {} };
  const done = () => { try { fs.writeFileSync(process.env.HQ_SELFTEST, JSON.stringify(rep, null, 1)); } catch (e) {} ctx.app.exit(0); };
  const w = ctx.win();
  w.webContents.on("console-message", (...a) => { const e = a[0] || {}, lvl = e.level !== undefined ? e.level : a[1], msg = e.message !== undefined ? e.message : a[2]; if (lvl === 2 || lvl === "error") rep.consoleErrors.push(String(msg).slice(0, 200)); });
  const js = (code) => w.webContents.executeJavaScript(code, true);
  const ok = (k, v, extra) => { rep.checks[k] = Object.assign({ pass: !!v }, extra || {}); };
  w.webContents.once("did-finish-load", async () => {
    try {
      await new Promise((r) => setTimeout(r, 5000));
      ok("claudeExe", INS.claudeExe(ctx.settings), { path: INS.claudeExe(ctx.settings), bundled: INS.bundledClaude() });
      rep.checks.claudeExe.pass = fs.existsSync(rep.checks.claudeExe.path);
      await new Promise((r) => execFile(INS.claudeExe(ctx.settings), ["--version"], { windowsHide: true, timeout: 20000, env: INS.claudeEnv(ctx.settings) }, (err, out) => { ok("claudeVersion", !err && /Claude Code/.test(out), { out: String(out).trim(), err: err && err.message }); r(); }));
      const auth = await INS.authStatus(ctx.settings); ok("authStatus", auth.ok, { loggedIn: auth.loggedIn });
      ok("homeRendered", await js("document.body.classList.contains('in-nebula') && !!document.querySelector('canvas') && typeof HQNebula==='object'"), { body: await js("document.body.className") });
      ok("projectsRoot", fs.existsSync(ctx.settings.projectsRoot), { root: ctx.settings.projectsRoot });
      const pr = await js("hq.projectCreate('Selftest Project')");
      const folder = path.join(ctx.settings.projectsRoot, "Selftest Project");
      ok("newProject", pr && pr.ok && fs.existsSync(path.join(folder, "Notes", "Selftest Project To-Do.md")) && fs.existsSync(path.join(folder, ".claude", "agents", "selftest-project-team-builder.md")), { r: pr });
      ok("modelsBundled", ctx.WHISPER.offline && ctx.KOKORO.offline, { whisper: ctx.WHISPER.dir, kokoro: ctx.KOKORO.dir });
      const t0 = Date.now();
      const stt = await js("hq.sttTranscribe(new Float32Array(32000)).then(function(t){return {ok:true,t:t}},function(e){return {ok:false,e:String(e.message||e)}})");
      ok("sttLoadsOffline", stt && stt.ok, { r: stt, ms: Date.now() - t0 });
      const t1 = Date.now();
      const tts = await js("new Promise(function(res){var off=hq.on('tts',function(m){if(m.type==='chunk'||m.type==='error'){off();res({type:m.type,e:m.error||'',bytes:m.wav?m.wav.length:0});}});hq.ttsSpeak({text:'Self test.',voice:'af_heart',speed:1.1});setTimeout(function(){res({type:'timeout'});},120000);})");
      ok("ttsLoadsOffline", tts && tts.type === "chunk" && tts.bytes > 1000, { r: tts, ms: Date.now() - t1 });
      ok("noModelDownload", !fs.existsSync(path.join(ctx.USER, "whisper-cache")) && !fs.existsSync(path.join(ctx.USER, "kokoro-cache")));
    } catch (e) { rep.fatal = String(e && e.stack || e).slice(0, 500); }
    rep.allPass = !rep.fatal && Object.values(rep.checks).every((c) => c.pass);
    done();
  });
};
