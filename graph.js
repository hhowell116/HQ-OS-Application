// Nebula graph scan: notes of every project + wiki/markdown links. Read-only; never touches the Obsidian vault or personal folders.
const fs = require("fs"), path = require("path");
const SKIP = (p) => /node_modules|[\\/]\.git([\\/]|$)|personal|💀/i.test(p);
const MAXB = 400 * 1024;

function walk(dir, out, depth) {
  if (depth > 8 || SKIP(dir)) return;
  let es = []; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of es) {
    const f = path.join(dir, e.name);
    if (SKIP(f)) continue;
    if (e.isDirectory()) walk(f, out, depth + 1);
    else if (e.isFile() && /\.md$/i.test(e.name)) out.push(f);
  }
}

function parse(text) {
  const wiki = [], md = [], tags = new Set();
  const body = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  let m; const wre = /\[\[([^\]\n]+?)\]\]/g;
  while ((m = wre.exec(body))) { const t = m[1].split("|")[0].split("#")[0].trim().replace(/\.md$/i, ""); if (t && !/.(png|jpe?g|gif|webp|svg|bmp|mp4|webm|mov|mp3|wav|pdf)$/i.test(t)) wiki.push(t); }
  const mre = /\[[^\]\n]*\]\(([^)\s]+?\.md)(?:#[^)]*)?\)/gi;
  while ((m = mre.exec(body))) { if (!/^[a-z]+:/i.test(m[1])) md.push(m[1]); }
  const tre = /(?:^|\s)#([A-Za-z][\w/-]{1,30})/g;
  while ((m = tre.exec(body)) && tags.size < 8) tags.add(m[1]);
  return { wiki, md, tags: [...tags] };
}

function scan(settings, projects) {
  const root = settings.projectsRoot || path.join(require("os").homedir(), "Projects");
  const nodes = [], links = [], byId = new Map(), byName = new Map(); // byName: lower name -> [node]
  const add = (n) => { nodes.push(n); byId.set(n.id, n); const k = n.name.toLowerCase(); (byName.get(k) || byName.set(k, []).get(k)).push(n); return n; };
  const files = []; // {node, text}
  // core: the shared rules file
  const rules = path.join(root, "CLAUDE.md");
  const core = { id: "core", kind: "core", name: "Rules (CLAUDE.md)", project: "core", path: rules, size: 0, tags: [] };
  nodes.push(core); byId.set("core", core);
  try { const t = fs.readFileSync(rules, "utf8").slice(0, MAXB); core.size = t.length; files.push({ node: core, text: t }); } catch (e) {}
  const projNodes = [];
  for (const p of projects) {
    if (!p.exists || (settings.archived || []).includes(p.id)) continue;
    const pn = { id: "proj:" + p.id, kind: "project", name: p.name, project: p.id, path: p.folder, size: 0, tags: [] };
    nodes.push(pn); byId.set(pn.id, pn); projNodes.push(pn);
    const list = [];
    walk(path.join(p.folder, "Notes"), list, 0);
    for (const n of ["README.md", "CLAUDE.md"]) { const f = path.join(p.folder, n); if (fs.existsSync(f)) list.push(f); }
    for (const f of list) {
      let text; try { if (fs.statSync(f).size > MAXB) continue; text = fs.readFileSync(f, "utf8"); } catch (e) { continue; }
      const base = path.basename(f, ".md");
      const top = path.dirname(f) === p.folder;
      const n = add({ id: f, kind: "note", name: top ? base + " (" + p.name + ")" : base, alias: base, project: p.id, path: f, size: text.length, tags: [] });
      if (top) { const k = base.toLowerCase(); (byName.get(k) || byName.set(k, []).get(k)).push(n); }
      files.push({ node: n, text });
      links.push({ source: pn.id, target: n.id, type: "orbit" });
    }
  }
  for (const pn of projNodes) links.push({ source: "core", target: pn.id, type: "orbit" });
  const seen = new Set(), ghosts = new Map();
  const link = (s, t) => { const k = s + "\0" + t; if (s === t || seen.has(k)) return; seen.add(k); links.push({ source: s, target: t, type: "link" }); };
  for (const { node, text } of files) {
    const r = parse(text); node.tags = r.tags;
    for (const w of r.wiki) {
      const cand = byName.get(w.toLowerCase()) || byName.get(path.basename(w).toLowerCase());
      if (cand && cand.length) { link(node.id, (cand.find((c) => c.project === node.project) || cand[0]).id); continue; }
      let g = ghosts.get(w.toLowerCase());
      if (!g) { g = { id: "ghost:" + w.toLowerCase(), kind: "ghost", name: path.basename(w), project: node.project, path: "", size: 0, tags: [] }; ghosts.set(w.toLowerCase(), g); nodes.push(g); byId.set(g.id, g); }
      link(node.id, g.id);
    }
    for (const m of r.md) {
      let rel; try { rel = decodeURIComponent(m); } catch (e) { rel = m; }
      const t = path.resolve(path.dirname(node.path), rel);
      if (byId.has(t)) link(node.id, t);
    }
  }
  const deg = new Map();
  for (const l of links) if (l.type === "link") { deg.set(l.source, (deg.get(l.source) || 0) + 1); deg.set(l.target, (deg.get(l.target) || 0) + 1); }
  for (const n of nodes) n.deg = deg.get(n.id) || 0;
  return { nodes, links, projects: projNodes.map((n) => ({ id: n.project, name: n.name })), at: Date.now() };
}

module.exports = { scan };
