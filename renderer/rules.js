// Rules viewer: read-only, Obsidian-style reader for the shared CLAUDE.md. Text only; never follows paths mentioned inside it.
const RL = { open: false, doc: null, hits: [], at: -1 };
function rulesMd(src) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (raw) => {
    const codes = []; let s = esc(raw).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return "\u0001" + (codes.length - 1) + "\u0001"; });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/__(.+?)__/g, "<b>$1</b>")
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<i>$2</i>").replace(/(^|[^\w_])_([^_\s][^_]*?)_(?![\w_])/g, "$1<i>$2</i>")
      .replace(/~~(.+?)~~/g, "<s>$1</s>");
    return s.replace(/\u0001(\d+)\u0001/g, (_, i) => "<code>" + codes[+i] + "</code>");
  };
  const lines = String(src || "").replace(/\r/g, "").split("\n"), out = [], toc = [], used = {};
  let i = 0, para = [];
  const flush = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } };
  const slug = (t) => { const b = t.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "s"; let k = b, n = 2; while (used[k]) k = b + "-" + n++; used[k] = 1; return k; };
  const indentOf = (l) => l.match(/^\s*/)[0].replace(/\t/g, "    ").length;
  const itemRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  // nested lists: a stack of {type, ind}
  const list = () => {
    const st = []; let h = "";
    while (i < lines.length) {
      const l = lines[i], m = itemRe.exec(l);
      if (m) {
        const ind = indentOf(m[1]), type = /\d/.test(m[2]) ? "ol" : "ul";
        while (st.length && ind < st[st.length - 1].ind) h += "</li></" + st.pop().type + ">";
        if (st.length && ind === st[st.length - 1].ind) { if (st[st.length - 1].type !== type) h += "</li></" + st.pop().type + ">"; else h += "</li>"; }
        if (!st.length || ind > st[st.length - 1].ind) { st.push({ type, ind }); h += "<" + type + ">"; }
        h += "<li>" + inline(m[3]); i++;
      } else if (l.trim() && st.length && indentOf(l) > st[st.length - 1].ind && !/^\s*(#{1,6}\s|```)/.test(l)) { h += " " + inline(l.trim()); i++; } // wrapped continuation
      else if (!l.trim() && itemRe.test(lines[i + 1] || "")) i++; // blank line between items
      else break;
    }
    while (st.length) h += "</li></" + st.pop().type + ">";
    out.push(h);
  };
  while (i < lines.length) {
    const l = lines[i]; let m;
    if (/^\s*```/.test(l)) { flush(); const buf = []; i++; while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]); i++; out.push("<pre><code>" + esc(buf.join("\n")) + "</code></pre>"); }
    else if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) { flush(); const lv = m[1].length, plain = m[2].replace(/[*_`]/g, ""), id = slug(plain); if (lv === 2) toc.push({ id, text: plain }); out.push("<h" + lv + ' id="rl-' + id + '">' + inline(m[2]) + "</h" + lv + ">"); i++; }
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); out.push("<hr>"); i++; }
    else if (itemRe.test(l)) { flush(); list(); }
    else if (/^\s*>/.test(l)) { flush(); const buf = []; while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, "")); out.push("<blockquote>" + inline(buf.join(" ")) + "</blockquote>"); }
    else if (!l.trim()) { flush(); i++; }
    else { para.push(l.trim()); i++; }
  }
  flush();
  return { html: out.join("\n"), toc };
}
function rulesRender() {
  const d = RL.doc, box = $("#rl-doc"), keep = box.scrollTop;
  if (!d) return;
  if (d.err) { box.textContent = d.err; $("#rl-toc").textContent = ""; return; }
  const r = rulesMd(d.text); box.innerHTML = r.html;
  const t = $("#rl-toc"); t.textContent = ""; t.append(el("div", "rl-toch", "CONTENTS"));
  for (const h of r.toc) { const a = el("a", "", h.text); a.dataset.id = h.id; a.onclick = () => { const x = $("#rl-" + h.id); if (x) box.scrollTo({ top: x.offsetTop - 10, behavior: "smooth" }); }; t.append(a); }
  $("#rl-meta").textContent = "last updated " + new Date(d.mtime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  rulesSearch(); box.scrollTop = keep; rulesSpy();
}
function rulesSpy() {
  const box = $("#rl-doc"); let cur = null; const links = $("#rl-toc").querySelectorAll("a");
  for (const a of links) { const x = $("#rl-" + a.dataset.id); if (x && x.offsetTop - 30 <= box.scrollTop) cur = a; }
  for (const a of links) a.classList.toggle("on", a === cur);
}
function rulesSearch(jump) {
  const box = $("#rl-doc"), q = $("#rl-q").value.trim().toLowerCase();
  box.querySelectorAll("mark.rl-hit").forEach((m) => { const p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); });
  RL.hits = []; RL.at = -1; $("#rl-cnt").textContent = "";
  if (q.length < 2) return;
  const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT), nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) {
    const txt = n.nodeValue, low = txt.toLowerCase(); let p = 0, k, frag = null;
    while ((k = low.indexOf(q, p)) >= 0) {
      frag = frag || document.createDocumentFragment(); frag.append(txt.slice(p, k));
      const mk = el("mark", "rl-hit", txt.slice(k, k + q.length)); frag.append(mk); RL.hits.push(mk); p = k + q.length;
    }
    if (frag) { frag.append(txt.slice(p)); n.parentNode.replaceChild(frag, n); }
  }
  $("#rl-cnt").textContent = RL.hits.length ? "0/" + RL.hits.length : "no match";
  if (jump && RL.hits.length) rulesStep(1);
}
function rulesStep(dir) {
  if (!RL.hits.length) return;
  if (RL.hits[RL.at]) RL.hits[RL.at].classList.remove("cur");
  RL.at = (RL.at + dir + RL.hits.length) % RL.hits.length;
  const m = RL.hits[RL.at]; m.classList.add("cur");
  const box = $("#rl-doc"); box.scrollTo({ top: m.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - box.clientHeight / 3 });
  $("#rl-cnt").textContent = (RL.at + 1) + "/" + RL.hits.length;
}
async function rulesLoad() { try { RL.doc = await hq.rulesRead(); } catch (e) { RL.doc = { err: "Could not read the rules file", text: "", mtime: 0 }; } rulesRender(); }
async function rulesShow() { RL.open = true; $("#rules-ov").classList.remove("hidden"); await rulesLoad(); }
function rulesHide() { RL.open = false; $("#rules-ov").classList.add("hidden"); }
$("#rules-open").onclick = rulesShow; $("#room-rules").onclick = rulesShow;
$("#rl-close").onclick = rulesHide; $("#rules-ov").onclick = (e) => { if (e.target.id === "rules-ov") rulesHide(); };
$("#rl-edit").onclick = () => RL.doc && RL.doc.path && hq.openPath(RL.doc.path);
$("#rl-q").oninput = () => rulesSearch(true);
$("#rl-q").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); rulesStep(e.shiftKey ? -1 : 1); } };
$("#rl-doc").addEventListener("scroll", rulesSpy, { passive: true });
$("#rl-doc").addEventListener("click", (e) => { const a = e.target.closest("a[href]"); if (a) { e.preventDefault(); window.open(a.href); } });
document.addEventListener("keydown", (e) => {
  if (e.key === "F3") { e.preventDefault(); e.stopImmediatePropagation(); return RL.open ? rulesHide() : rulesShow(); }
  if (RL.open && e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); rulesHide(); }
  else if (RL.open && e.ctrlKey && e.key.toLowerCase() === "f") { e.preventDefault(); $("#rl-q").focus(); $("#rl-q").select(); }
}, true);
hq.on("rules-changed", () => { if (RL.open) rulesLoad(); });
