# HQ OS v2 (standalone)

A desktop command center for the projects in your `%USERPROFILE%\Projects` folder (change it with `projectsRoot` in settings). It doesn't need Obsidian. This repo holds only the app: no projects, notes, chats or settings.

## Work PC (ThreatLocker): see `INSTALL-WORK-PC.md` for the single installer.

## Set up on a new computer (home PC)
1. Install [Node.js LTS](https://nodejs.org), Git, and [Claude Code](https://docs.claude.com/en/docs/claude-code). Run `claude` once and sign in.
2. `git clone https://github.com/hhowell116/HQ-OS-Application.git "%USERPROFILE%\Projects\HQ OS\app"`
3. In that folder run `pwsh -NoProfile -File .\setup.ps1`. It installs dependencies and makes Desktop and Start menu shortcuts.
4. Open **HQ OS**. Any folder in `Projects` with a `Notes\` folder shows up as a project; the **+** next to PROJECTS makes a new one.

The speech models (Kokoro voice, Whisper for the mic) download on first use into `%APPDATA%\HQ OS\`.

**Agent teams.** The shared rules (`Projects\CLAUDE.md`) and the shared core Agent Team are restored by the separate claude-team backup (`claude-team\setup.ps1` in the Lumen repo). Each project keeps its own specialist team in `<Project>\.claude\agents\` inside that project's repo, so cloning a project brings its team along. A project made with **+** gets `Notes\Claude\Index.md` and a starter `<project>-team-builder` agent (from `templates\team-builder.md`). In that project's chat, ask it to "build the <Project> team" and it writes the specialists.

## Launch
- Use the **HQ OS** shortcut on the Desktop or in the Start menu.
- Or run `npm start` in this folder.
- Press **Ctrl+Alt+H** anywhere to show or hide the window.

## What it shows
- **Projects** (left): every folder in `Projects` that has a `Notes\` folder. Each one shows its Next and Needs-you counts, unreviewed items, and a 14-day commit sparkline.
- **Core and console** (centre): a Claude Code chat that works inside the selected project's folder, with one conversation history per project. The core animates while Claude is thinking or replying. Turn on **voice** to hear replies read aloud.
- **Project panel** (right): the Live line, Needs you, Next up and the Team board. Tick a box to check off a task, or type in the box to add one. Changes are written straight to the project's To-Do note.
- **Usage rings**: your 5-hour and weekly Claude plan usage.
- **Live agents** (bottom): Claude subagents currently running in any project.

## v2.1 additions
- **HQ / WAR ROOM tabs** in the title bar (F1 / F2). The war room seats every working agent around a holographic table: Claude subagents, busy console chats, and Agent Activity board rows updated in the last 90 minutes. Each one says its real latest step in a speech bubble, taking turns. Click a seat to see its recent steps and files. Ctrl+D shows a labelled demo crew.
- **System vitals**: CPU and RAM with 2-minute graphs, plus how many Claude processes are running and their memory.
- **Console**: Handoff (Claude writes a handoff note and a new chat starts from it), Compact (`/compact`), and a cache chip that counts down the roughly one-hour prompt cache.
- **Files in play**: files the agents and console chats are reading or editing right now.
- **Themes**: nine colour themes, plus **Music**, which takes its accent colour from the album art.
- **Music box**: what's playing in Windows (Spotify, a browser and so on), with cover art and prev / play / next. The **viz** button turns on the audio equalizer ring around the core, which listens to desktop audio.

## Shortcuts
| Key | Action |
|---|---|
| Ctrl+K | Focus the console |
| Ctrl+N | New conversation |
| Ctrl+1 to 9 | Switch project |
| Enter / Shift+Enter | Send / new line |
| Esc | Stop Claude |
| F5 | Reload project list |
| F1 / F2 | HQ / war room |
| Ctrl+Shift+H | Handoff |

## Files
- Settings: `%APPDATA%\HQ OS\settings.json`. These were imported once from the old plugin's `..\data.json`. Change `projectsRoot`, `person`, `claudePath` or `permissionMode` here, then restart.
- Conversations: `%APPDATA%\HQ OS\chats\`.
- Code: `main.js` (window and polling), `data.js` (notes, agents, usage, git), `chat.js` (Claude CLI over stream-json), `renderer\` (interface).

## Notes
- The console runs Claude with `permissionMode: bypassPermissions`, the same as the old plugin. Claude can edit files and run commands in the project folder without asking first. To have it ask first, set `"permissionMode": "acceptEdits"` or `"default"` in settings.json, but this console can't answer permission prompts yet.
- Only project To-Do notes are watched. The app never scans `node_modules` or code trees.

## Taskbar icon
`npm install` runs `tools/brand-exe.js`, which writes the HQ OS icon and name into `node_modules/electron/dist/electron.exe` (an Electron reinstall resets it). Run `npm run brand` by hand with HQ OS closed if the Electron logo ever comes back.
