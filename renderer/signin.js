// Claude sign-in card: shown once at startup when Claude Code has no login (fresh PC). Browser sign-in via the bundled CLI, or an API key.
(function () {
  const css = document.createElement("style");
  css.textContent = "#signin{position:fixed;inset:0;z-index:99;display:flex;align-items:center;justify-content:center;background:rgba(2,6,10,.78)}#signin .card{width:430px;max-width:92vw;padding:22px 24px;border:1px solid var(--line,#1c3a4a);border-radius:10px;background:#07131b;color:#cfe;font:13px/1.5 system-ui,sans-serif;box-shadow:0 0 40px rgba(0,200,255,.15)}#signin h2{margin:0 0 6px;font-size:16px;letter-spacing:.08em}#signin p{margin:6px 0 12px;color:#8fb}#signin button,#signin input{font:inherit;border-radius:6px;border:1px solid #1c5a70;background:#0b2230;color:#cfe;padding:7px 12px}#signin button{cursor:pointer}#signin button.pri{background:#0d4660;border-color:#2ab}#signin input{width:100%;box-sizing:border-box;margin:4px 0}#signin .row{display:flex;gap:8px;align-items:center;margin-top:8px}#signin .msg{min-height:18px;color:#fc8;font-size:12px}";
  document.head.appendChild(css);
  function open() {
    const box = document.createElement("div"); box.id = "signin";
    box.innerHTML = '<div class="card"><h2>SIGN IN TO CLAUDE</h2><p>HQ OS uses Claude Code. Sign in with your Claude account (opens your browser), or paste an API key.</p><div class="row"><button class="pri" id="si-login">Sign in with Claude</button><button id="si-skip">Later</button></div><p style="margin-top:14px">Or use an API key (stored encrypted on this PC):</p><input id="si-key" type="password" placeholder="sk-ant-..." autocomplete="off"><div class="row"><button id="si-save">Save key</button></div><div class="msg" id="si-msg"></div></div>';
    document.body.appendChild(box);
    const $ = (s) => box.querySelector(s), msg = (t) => ($("#si-msg").textContent = t), close = () => box.remove();
    $("#si-skip").onclick = close;
    $("#si-login").onclick = async () => { $("#si-login").disabled = true; msg("Finish signing in in your browser..."); const r = await hq.claudeLogin(); if (r.ok) { close(); } else { msg(r.err || "Sign-in failed"); $("#si-login").disabled = false; } };
    $("#si-save").onclick = async () => { const r = await hq.claudeApiKey($("#si-key").value); if (r.ok) { $("#si-key").value = ""; close(); } else msg(r.err); };
  }
  setTimeout(() => { if (window.hq && hq.claudeStatus) hq.claudeStatus().then((s) => { if (s && s.ok && !s.loggedIn) open(); }, () => {}); }, 2500);
})();
