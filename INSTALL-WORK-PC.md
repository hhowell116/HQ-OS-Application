# HQ OS on the work PC (ThreatLocker)

For the admin (Hayden). One installer, one admin prompt, nothing else downloaded at runtime. No Node, npm, Python or PowerShell scripts needed.

## Build the installer (home PC)
```
cd app
npm install
npm run models      # one time: downloads Whisper + Kokoro into build\models (about 220 MB)
npm run dist        # dist\HQ-OS-Setup-<version>.exe  (about 440 MB)
Get-FileHash dist\HQ-OS-Setup-*.exe -Algorithm SHA256
```
`npm run pack:dir` makes an unpacked test build in `dist\win-unpacked` instead. Copy only the setup exe to the work PC.

## ThreatLocker approvals
The installer is unsigned (no certificate), so its hash is new on every build. Approve it once per build:
1. **Installer**: add `HQ-OS-Setup-<version>.exe` by SHA-256 (hash from the command above) as a one-time Installation/Elevation approval. Run it and accept the UAC prompt.
2. **App policy, scoped to the install folder** (do this once, so updates and rebuilds never need re-approval): allow everything under `C:\Program Files\HQ OS\` by path (`C:\Program Files\HQ OS\*`, including subfolders). The install path is fixed (per-machine, folder cannot be changed). Under it:
   - `HQ OS.exe`: the app. It also runs as its own GPU, renderer and utility processes (`hq-stt` speech-to-text, `hq-tts` voice), all the same exe.
   - `resources\claude\claude.exe`: bundled Claude Code (one process per open chat, plus short `auth status` / `auth login` / `--version` calls).
   - `resources\app.asar.unpacked\node_modules\onnxruntime-node\...` DLLs/.node files (speech models, loaded in-process).
3. **System tools it calls** (normally already allowed): `C:\Windows\System32\tasklist.exe`, `taskkill.exe` (count/stop Claude processes), `git.exe` (optional: 14-day commit sparkline; silently skipped if missing).
4. **Git for Windows**: Claude Code on Windows uses Git Bash for its shell tool. Install Git for Windows on the work PC (allow `git.exe`, `bash.exe`, `sh.exe` from `C:\Program Files\Git\`). Not tested on a PC without Git.
5. **Network** (allow from `claude.exe` and `HQ OS.exe`): `api.anthropic.com`, `claude.ai`, `console.anthropic.com`. Nothing else: the voice models are inside the installer and load with remote access disabled, Claude self-update is switched off.
6. If ThreatLocker learns "Ringfence": give `HQ OS.exe` access to the Projects folder and `%USERPROFILE%\.claude` (Claude Code's login and history).

Each unsigned update: run the new installer (approve its hash once), same folder, app policy already covers it. A certificate is the only way to stop re-approving the installer itself.

## First run
1. Run the installer (UAC), keep the default folder. A Desktop and Start menu shortcut "HQ OS" are made.
2. Launch HQ OS. It asks for a projects folder (default `%USERPROFILE%\Projects`, created if missing) and starts empty: no teams, no projects, no personal data.
3. A "Sign in to Claude" card appears: **Sign in with Claude** opens the browser (Claude subscription), or paste an API key (kept encrypted for this Windows user in `%APPDATA%\HQ OS\settings.json`). Close it with Later and it stays out of the way.
4. Use **+** next to PROJECTS to make a project; it gets `Notes\` and a starter `<name>-team-builder` agent. In that project's chat say "build the <name> team".

## What is not on the work PC
The music box needs `nowplaying.ps1` (PowerShell), so it stays empty there. The Trading floor needs a Stocks project, so it is also empty. Everything else works.

## Remove
Windows "Apps": uninstall HQ OS. Settings and chats stay in `%APPDATA%\HQ OS\` (delete by hand for a clean slate).
