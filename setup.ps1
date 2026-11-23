# HQ OS one-step setup for a new computer.
# Run from this folder:  pwsh -NoProfile -File .\setup.ps1
# Installs dependencies (local to this folder only) and creates Desktop + Start menu shortcuts.
$ErrorActionPreference = "Stop"
$app = $PSScriptRoot

foreach ($cmd in "node", "npm.cmd", "claude") {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Warning "$cmd not found on PATH. Install it first (see README)." }
}

Push-Location $app
try { npm.cmd install --no-fund --no-audit } finally { Pop-Location }

$exe = Join-Path $app "node_modules\electron\dist\electron.exe"
if (-not (Test-Path $exe)) { throw "Electron didn't install: $exe is missing." }

$shell = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "HQ OS.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Programs")) "HQ OS.lnk")
)
foreach ($lnk in $targets) {
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = $exe
  $s.Arguments = '"' + $app + '"'
  $s.WorkingDirectory = $app
  $s.IconLocation = (Join-Path $app "renderer\icon.ico") + ",0"
  $s.Save()
  Write-Host "Shortcut: $lnk"
}

$projects = Join-Path $env:USERPROFILE "Projects"
if (-not (Test-Path $projects)) { New-Item -ItemType Directory $projects | Out-Null; Write-Host "Created $projects" }
Write-Host "Done. Open HQ OS from the Desktop or Start menu."
