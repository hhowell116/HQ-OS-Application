# HQ OS on the work PC (ThreatLocker)

For the admin (Hayden). One installer, one admin prompt, nothing else downloaded at runtime. No Node, npm, Python or PowerShell scripts needed.

## Build the installer (GitHub Actions, the default)
`.github/workflows/build-installer.yml` builds it on a GitHub-hosted Windows runner, so the work PC never runs the unsigned build tools. It takes about 7 minutes.
```
gh workflow run build-installer.yml -R hhowell116/HQ-OS-Application      # or push a v<version> tag
gh run watch <run id> -R hhowell116/HQ-OS-Application --exit-status
gh run download <run id> -R hhowell116/HQ-OS-Application -n HQ-OS-Setup -D "%USERPROFILE%\Downloads\exes\HQ OS"
```
The artifact holds `HQ-OS-Setup-<version>.exe` and a `.sha256.txt`, and the hash is also in the run summary. Check the downloaded file against it (`Get-FileHash ... -Algorithm SHA256`) before approving. Bump `version` in package.json before a release build.

Workflow fixes learned on the first runs (already in the file): the speech-model step retries once, because a fresh runner can hit `system error number 13` opening the just-written Kokoro model. `npm run dist` also runs with `--publish never`, because electron-builder sees CI and otherwise tries to create a GitHub release (it fails without GH_TOKEN, after the installer is already built).

### Building on a home PC instead
```
cd app
npm install
npm run models      # one time: downloads Whisper + Kokoro into build\models (about 220 MB)
npm run dist        # dist\HQ-OS-Setup-<version>.exe  (about 440 MB)
Get-FileHash dist\HQ-OS-Setup-*.exe -Algorithm SHA256
```
`npm run pack:dir` makes an unpacked test build in `dist\win-unpacked` instead. Copy only the setup exe to the work PC.

### Why not run from source on the work PC
`npm start` works only while ThreatLocker is in learning mode. Electron's `electron.exe` and its DLLs are unsigned, and `npm run brand` changes the exe's hash, so it would need 13 separate hash approvals (electron.exe, 6 DLLs, 3 onnxruntime and 3 sharp files), redone after every `npm ci`. Approving `electron.exe` alone doesn't help, because ThreatLocker checks each DLL it loads separately. The installed app in `C:\Program Files` avoids all of that with one folder rule.

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

### Portal steps that worked (IT-LT-HHOWELL, 2026-11-23)
1. **Installer:** approve the blocked `HQ-OS-Setup-<version>.exe` request by hash. That creates an application named after the installer, with a one-time policy.
2. **App: a separate application, not the installer's.** A Full Path rule added to the installer's application did nothing ("no policies to deploy"), because that application's only policy is the one-time install approval.
   - **Application Control → Applications → Create Application**, named `HQ OS`.
   - On **Application Files**, set Condition **Full Path** with value `C:\Program Files\HQ OS\*`, then click **Add Rule** so it appears in the list. If you click Create first, it warns that the rule wasn't added and makes an empty application.
   - Use **Full Path** (the file being run or loaded), not **Process Path**, which would let `HQ OS.exe` load anything from anywhere.
3. **Policy:**
   - **Application Control → Policies → Add**: Conditions = the `HQ OS` application, applies to the computer, **Permit**, no expiration, elevation off, ringfencing off.
   - Choose **Add to top**. Policies are checked top to bottom and the first match wins, so a broader deny above it would keep blocking. Top is safe because the rule only matches that one folder.
4. **Deploy Policies.** The agent picked it up within about a minute. Until then, `ffmpeg.dll` (the first DLL `HQ OS.exe` loads) keeps showing the block pop-up.
5. **Shortcuts:** remove any old "HQ OS" shortcuts that point at `app\node_modules\electron\dist\electron.exe` from a source setup. They look identical and keep triggering electron/DLL blocks. The installer's shortcuts are in Public Desktop and in ProgramData's Start Menu.

Settings and chats in `%APPDATA%\HQ OS\` carry over from a source setup to the installed app unchanged (same `projectsRoot`, same chats).

## First run
1. Run the installer (UAC), keep the default folder. A Desktop and Start menu shortcut "HQ OS" are made.
2. Launch HQ OS. It asks for a projects folder (default `%USERPROFILE%\Projects`, created if missing) and starts empty: no teams, no projects, no personal data.
3. A "Sign in to Claude" card appears: **Sign in with Claude** opens the browser (Claude subscription), or paste an API key (kept encrypted for this Windows user in `%APPDATA%\HQ OS\settings.json`). Close it with Later and it stays out of the way.
4. Use **+** next to PROJECTS to make a project; it gets `Notes\` and a starter `<name>-team-builder` agent. In that project's chat say "build the <name> team".

## First run on a laptop with existing projects
1. Point the projects folder at the folder that already holds your project folders. Every top-level folder shows up as a project automatically (hidden, system, node_modules and -wt folders are skipped); a Notes folder is not required.
2. HQ OS offers "Build teams for N projects?" once. **Build teams** (or the **Build team** button on any project card, any time) creates Notes, a To-Do and Notes\Claude\Index.md if missing, plus a <name>-team-builder and <name>-cartographer agent in .claude\agents, then starts a chat that maps the project and builds its specialists. Teams from the offer map one project at a time.
3. Nothing existing is overwritten: files are only created when missing. Sign in to Claude first, or the mapping chat cannot run.

## What is not on the work PC
The music box needs `nowplaying.ps1` (PowerShell), so it stays empty there. The Trading floor needs a Stocks project, so it is also empty. Everything else works.

## Remove
Windows "Apps": uninstall HQ OS. Settings and chats stay in `%APPDATA%\HQ OS\` (delete by hand for a clean slate).
