# HQ OS installer security audit

Current installer (2026-11-23, GitHub Actions run 45321445159 on main 72a2918, windows-latest, `npm ci` from the same lockfile): `HQ-OS-Setup-2.0.0.exe`, 437,705,328 bytes, unsigned, SHA-256 `dba888b81cd46a06db1abeecbb5f4713c78068641ec01ad0ebe983854ddfffeb` (runner hash matches the downloaded file). Installed on IT-LT-HHOWELL under ThreatLocker Full Path rule `C:Program FilesHQ OS*`.

Audited 2026-11-23 on main d37049f (re-run after the Build team change: npm audit unchanged, same 3 sharp highs; lockfile 410 entries, all on registry.npmjs.org). Installer: `dist\HQ-OS-Setup-2.0.0.exe` (440,194,359 bytes, unsigned, SHA-256 `30b58bd21bb8eb40624ed9ee6c7b8dd041a6d87e8d712d6cc1031803bf9670d5`; changes every build). Previous build (b9b5694): 440,185,950 bytes.

## Dependencies shipped
- Production top-level (package.json `dependencies`): `3d-force-graph@1.80.2` (vasturiano, 3D graph), `kokoro-js@1.2.1` (Hugging Face / Xenova, TTS), `three@0.187.0` (three.js org). Spelling checked, all well-known names. 90 production packages total (`npm ls --omit=dev --all --parseable`, minus root).
- Bundled, build-time only: `electron@45.4.1` (OpenJS/Electron), `electron-builder@26.18.0`, `esbuild@0.28.2` (Evan Wallace), `rcedit@4.0.1` (electron org), `@anthropic-ai/claude-code@2.1.331` (author Anthropic) and its platform package `@anthropic-ai/claude-code-win32-x64@2.1.331`.
- `package-lock.json`: 410 entries, all `resolved` URLs on registry.npmjs.org, all have `integrity` hashes, none missing.

## npm audit --omit=dev
3 high, all one chain: `sharp` (libvips/libheif/librsvg CVEs, no fix) <- `@huggingface/transformers` <- `kokoro-js`. Not reachable: these are image decoders (HEIF, SVG) and HQ never passes images to transformers (voice only: audio in, audio out). Removing sharp breaks both Whisper and Kokoro (tested: STT and TTS self-test checks fail, transformers imports sharp at load), so it stays. No critical.

## Models (build/models, from official Hugging Face repos)
- `Xenova/whisper-base.en`: encoder_model.onnx 3af4d8b7...5f6e, decoder_model_merged_quantized.onnx a25afc58...0325 (match HF LFS sha256).
- `onnx-community/Kokoro-82M-v1.0-ONNX`: model_quantized.onnx fbae9257...1478 (matches HF LFS sha256).
- Small config/tokenizer JSONs come from the same repos.

## Claude Code binary
Official `@anthropic-ai/claude-code-win32-x64@2.1.331`, claude.exe SHA-256 `db6a1c2506ce797e842028fb75f38f023a712ccbf9322497652510f0a179c806`, from registry.npmjs.org (lock integrity sha512-bCT94qVL...Cw7Bw==). Run with DISABLE_AUTOUPDATER=1 and CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1.

## Network at runtime
Static scan of all app JS (main, chat, data, graph, system, files-ipc, installer, workers, renderer): the only outbound call is `https://api.anthropic.com/api/oauth/usage` (usage rings, only when signed in to Claude). No auto-updater, crash reporter or analytics. Voice workers run with HQ_OFFLINE=1 (remote model access disabled). Renderer CSP is `default-src 'self'`. Claude Code itself talks to Anthropic only. Self-test (PATH stripped, signed out) passes with no model download.

## Git for Windows
Claude Code 2.1.331 needs Git for Windows (bash) OR PowerShell on Windows; PowerShell ships with Windows, so Git is not required for chat.
