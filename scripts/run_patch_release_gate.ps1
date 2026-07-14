param(
  [switch]$SkipDesktopGate,
  [switch]$RunDesktopSmokes,
  [switch]$RunPerformanceSmoke,
  [switch]$RunImportedCombatPerformanceSmoke,
  [switch]$RunRoundtripAudit
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

Write-Host "Realmz Providence patch release gate" -ForegroundColor Yellow
Write-Host "Started: $(Get-Date)"

Invoke-Step "Architecture boundaries" {
  npm run check:architecture
}

Invoke-Step "TypeScript" {
  npm run typecheck
}

Invoke-Step "Action Point gap gate" {
  npm run check:ap-action-gaps
}

Invoke-Step "Action Point coverage" {
  npm run check:ap-actions
}

Invoke-Step "Registration code checks" {
  npm run check:registration-codes
}

Invoke-Step "Divinity manual tool audit" {
  node scripts\report_divinity_manual_tool_audit.mjs --check
}

Invoke-Step "Combat command audit" {
  node scripts\check_combat_monster_commands.mjs
}

Invoke-Step "Script diagnostics" {
  npm run check:script-diagnostics
}

Invoke-Step "Scenario context registry" {
  npm run check:scenario-context
}

Invoke-Step "Frontend production build" {
  npm run build
}

Invoke-Step "Rust library tests" {
  cargo test --manifest-path src-tauri\Cargo.toml --lib
}

if ($RunRoundtripAudit) {
  Invoke-Step "No-edit scenario roundtrip audit" {
    npm run archaeology:roundtrip-audit
  }
}

if ($RunPerformanceSmoke) {
  Invoke-Step "UI performance smoke" {
    npm run smoke:ui:performance -- --combat-benchmark
  }
}

if ($RunImportedCombatPerformanceSmoke) {
  Invoke-Step "Imported-heavy Combat performance smoke" {
    npm run smoke:ui:performance -- --combat-imported-benchmark
  }
}

if (-not $SkipDesktopGate) {
  Invoke-Step "Desktop release gate" {
    $args = @("-ExecutionPolicy", "Bypass", "-File", "scripts\run_desktop_release_gate.ps1")
    if ($RunDesktopSmokes) {
      $args += "-RunEditorSmokes"
    }
    powershell @args
  }
}

Write-Host ""
Write-Host "Patch release gate passed." -ForegroundColor Green
