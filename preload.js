// Narrow bridge: pages get named calls only, never Node or ipcRenderer itself.
const { contextBridge, ipcRenderer } = require("electron");
const FILES_OPS = ["list", "search", "read", "resolve", "open", "reveal", "rename", "new", "watch", "pref", "state"];
const inv = (ch) => (arg) => ipcRenderer.invoke(ch, arg);
const EVENTS = ["chat", "agents", "crew", "usage", "todo-changed", "win-state", "vitals", "music", "settings", "code-changed", "tts", "stt", "rules-changed", "tf", "files-changed"];
contextBridge.exposeInMainWorld("hq", {
  init: inv("init"), settings: inv("settings"), projects: inv("projects"), project: inv("project"),
  needs: inv("needs"), todoToggle: inv("todo-toggle"), todoAdd: inv("todo-add"),
  reviewList: inv("review-list"), reviewSet: inv("review-set"),
  restart: inv("restart"), codePending: inv("code-pending"), busy: inv("busy"),
  agents: inv("agents"), crew: inv("crew"), teams: inv("team-list"), usage: inv("usage"), music: inv("music"), musicCtl: inv("music-ctl"),
  ttsSpeak: inv("tts-speak"), ttsStop: inv("tts-stop"), ttsLog: inv("tts-log"), sttTranscribe: inv("stt-transcribe"), projectCreate: inv("project-create"), projectRename: inv("project-rename"),
  rulesRead: inv("rules-read"), rulesOpen: inv("rules-open"), set: inv("set"), openPath: inv("open-path"), graphScan: inv("graph-scan"),
  chatList: inv("chat-list"), chatGet: inv("chat-get"), chatNew: inv("chat-new"), chatSend: inv("chat-send"), chatRename: inv("chat-rename"),
  chatStop: inv("chat-stop"), chatModel: inv("chat-model"), chatDelete: inv("chat-delete"), chatHandoff: inv("chat-handoff"), chatCompact: inv("chat-compact"),
  tfState: inv("tf-state"), tfGo: inv("tf-go"), tfScore: inv("tf-score"), tfStop: inv("tf-stop"), tfResume: inv("tf-resume"), tfKill: inv("tf-kill"), tfEvents: inv("tf-events"), tfLive: inv("tf-live"), tfCmd: inv("tf-cmd"), tfUsage: inv("tf-usage"), knList: inv("kn-list"), knIngest: inv("kn-ingest"), knOpen: inv("kn-open"),
  files: (op, arg) => FILES_OPS.includes(op) ? ipcRenderer.invoke("files-" + op, arg) : Promise.reject(new Error("bad op")),
  win: (a) => ipcRenderer.send("win", a),
  on: (ch, fn) => { if (!EVENTS.includes(ch)) return () => {}; const h = (_, d) => fn(d); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); },
});
