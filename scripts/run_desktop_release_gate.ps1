param(
  [switch]$SkipLinux,
  [switch]$SkipWindows,
  [switch]$RunEditorSmokes,
  [switch]$KeepSmokeArtifacts,
  [string]$SmokeSourceScenarioDir = "F:\Realmz\base\Realmz\Scenarios\Tutorial",
  [string]$SmokeLargeScenarioDir = "F:\Realmz\base\Realmz\Scenarios\Wrath of the Mind Lords"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "== $Name ==" -ForegroundColor Cyan
  $global:LASTEXITCODE = 0
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Get-PackageVersion {
  $package = Get-Content -Raw -Path "package.json" | ConvertFrom-Json
  return [string]$package.version
}

function Assert-FreshArtifact {
  param(
    [string]$Path,
    [datetime]$StartedAt,
    [int64]$MinimumBytes = 1048576
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Expected release artifact is missing: $Path"
  }

  $item = Get-Item -LiteralPath $Path
  if ($item.Length -lt $MinimumBytes) {
    throw "Release artifact is suspiciously small ($($item.Length) bytes): $Path"
  }

  if ($item.LastWriteTime -lt $StartedAt) {
    throw "Release artifact was not rebuilt during this gate run: $Path"
  }

  Write-Host ("OK {0:n1} MB  {1}" -f ($item.Length / 1MB), $Path) -ForegroundColor Green
}

$startedAt = Get-Date
$version = Get-PackageVersion

Write-Host "Realmz Providence desktop release gate v$version" -ForegroundColor Yellow
Write-Host "Started: $startedAt"

Invoke-Step "TypeScript" {
  npm run typecheck
}

Invoke-Step "Rust library tests" {
  cargo test --manifest-path src-tauri/Cargo.toml --lib
}

Invoke-Step "Frontend production build" {
  npm run build
}

if (-not $SkipWindows) {
  Invoke-Step "Windows desktop build" {
    npm run dist
  }

  Invoke-Step "Windows artifacts" {
    Assert-FreshArtifact -Path "src-tauri\target\release\bundle\nsis\Realmz Providence_${version}_x64-setup.exe" -StartedAt $startedAt
    Assert-FreshArtifact -Path "src-tauri\target\release\bundle\msi\Realmz Providence_${version}_x64_en-US.msi" -StartedAt $startedAt
  }

  if ($RunEditorSmokes) {
    Invoke-Step "Windows editor smoke matrix" {
      $args = @(
        "-ExecutionPolicy", "Bypass",
        "-File", "scripts\run_editor_smoke_matrix.ps1",
        "-SourceScenarioDir", $SmokeSourceScenarioDir,
        "-LargeSourceScenarioDir", $SmokeLargeScenarioDir,
        "-ExePath", "src-tauri\target\release\realmz-providence.exe"
      )
      if ($KeepSmokeArtifacts) {
        $args += "-KeepArtifacts"
      }
      powershell @args
    }
  }
}

if (-not $SkipLinux) {
  Invoke-Step "Linux desktop build under WSL" {
    $repoForWsl = $repoRoot.Path -replace "\\", "/"
    if ($repoForWsl -match "^([A-Za-z]):/(.*)$") {
      $repoForWsl = "/mnt/$($matches[1].ToLower())/$($matches[2])"
    }
    wsl bash -lc "cd '$repoForWsl' && npm run dist"
  }

  Invoke-Step "Linux artifacts" {
    Assert-FreshArtifact -Path "src-tauri\target\release\bundle\appimage\Realmz Providence_${version}_amd64.AppImage" -StartedAt $startedAt
    Assert-FreshArtifact -Path "src-tauri\target\release\bundle\deb\Realmz Providence_${version}_amd64.deb" -StartedAt $startedAt
    Assert-FreshArtifact -Path "src-tauri\target\release\bundle\rpm\Realmz Providence-${version}-1.x86_64.rpm" -StartedAt $startedAt
  }
}

Write-Host ""
Write-Host "Desktop release gate passed for v$version." -ForegroundColor Green
if (-not $RunEditorSmokes) {
  Write-Host "For desktop smoke coverage, rerun with -RunEditorSmokes or run npm run smoke:editor against the freshly built release exe."
}
Write-Host "Do a final manual desktop pass before publishing: install a fresh artifact, import/open a scenario, then spot-check Combat, Economy, Linter, and Export."
