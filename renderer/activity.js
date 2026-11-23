// Live activity per project: maps every running subagent, busy console chat and Agent Activity board row (the "crew" list
// from main) onto a project. Used by the HQ sidebar dot and the Tower floors. Loaded before app.js.
(function () {
  "use strict";
  const enc = (s) => String(s || "").replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const nz = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  let real = [], demo = null, last = "", teams = { projects: {}, core: [] };
  const subs = new Set(), subCounts = new Set();

  const list = () => (demo ? demo.concat(real) : real).filter((a) => a.status === "running");
  // subagents carry the encoded cwd of their Claude project dir ("C--Users-Hhowe-Projects-HQ-OS-app"): longest folder prefix wins.
  // chats and board rows carry the project name.
  function projOf(it, projects) {
    if (it.kind === "agent") {
      const key = enc(it.proj); let best = null;
      for (const p of projects) { const pk = enc(p.folder); if (pk && (key === pk || key.startsWith(pk + "-")) && (!best || pk.length > best.k)) best = { id: p.id, k: pk.length }; }
      return best ? best.id : null;
    }
    if (it.kind === "board") {
      // every agent logs to the Lumen board, so the row's board is not its project: use the agent's own name first
      const n = nz(it.name);
      for (const p of projects) if ((teams.projects[p.id] || []).some((a) => nz(a.name) === n)) return p.id;
      let best = null; for (const p of projects) { const k = nz(p.name); if (k.length >= 3 && n.startsWith(k) && (!best || k.length > best.k)) best = { id: p.id, k: k.length }; }
      if (best) return best.id;
      if (teams.core.some((a) => nz(a.name) === n) || /^claude/.test(n)) return null;
    }
    const nm = String(it.proj || "").toLowerCase(), p = projects.find((x) => x.name.toLowerCase() === nm || x.id === it.proj);
    return p ? p.id : null;
  }
  // -> { byProj: Map(projectId -> items[]), deck: items[] (everything not mapped to a given project), total }
  function groups(projects) {
    const byProj = new Map(), deck = [], all = list();
    for (const it of all) { const id = projOf(it, projects); if (id) { if (!byProj.has(id)) byProj.set(id, []); byProj.get(id).push(it); } else deck.push(it); }
    return { byProj, deck, total: all.length };
  }
  const fire = () => {
    subs.forEach((f) => { try { f(); } catch (e) {} });
    const sig = list().map((a) => a.id).sort().join("|");
    if (sig !== last) { last = sig; subCounts.forEach((f) => { try { f(); } catch (e) {} }); }
  };
  window.HQActivity = {
    groups, projOf, list,
    total: () => list().length,
    on: (f) => subs.add(f), onCounts: (f) => subCounts.add(f),
    setDemo(items) { demo = items; fire(); },
    isDemo: () => !!demo,
  };
  hq.on("crew", (c) => { real = c || []; fire(); });
  const loadTeams = () => hq.teams && hq.teams().then((t) => { if (t) { teams = t; fire(); } }).catch(() => {});
  loadTeams(); setInterval(loadTeams, 60000);
  hq.crew().then((c) => { real = c || []; fire(); }).catch(() => {});
})();
