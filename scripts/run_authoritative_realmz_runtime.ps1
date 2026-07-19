param(
  [string]$OracleRoot = "F:\Realmz - Oracle",
  [string]$SupportScenarioPath = "F:\Realmz\base\Realmz\Scenarios\City of Bywater",
  [string]$ExePath = "",
  [switch]$SkipCompile,
  [int]$GameplayTimeoutSeconds = 120,
  [int]$ProcessTimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"

function Require-Path {
  param(
    [string]$Path,
    [string]$Label,
    [ValidateSet("Any", "Leaf", "Container")]
    [string]$PathType = "Any"
  )

  if (-not (Test-Path -LiteralPath $Path -PathType $PathType)) {
    throw "$Label was not found: $Path"
  }
  return (Resolve-Path -LiteralPath $Path).Path
}

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$proofRoot = Join-Path $repositoryRoot "tmp\authoritative-scenario-proof"
$scenarioName = "Providence Ownership Proof"
$scenarioPath = Join-Path $proofRoot "native-windows-a\$scenarioName"
$gameplayScriptPath = Join-Path $repositoryRoot "fixtures\scenario-seeds\authoritative-ownership-proof.gameplay.json"
$proofSummaryPath = Join-Path $proofRoot "proof-summary.json"
$runtimeStamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
$profileRoot = Join-Path $proofRoot "realmz-runtime-profile-$runtimeStamp"
$logDir = Join-Path $proofRoot "realmz-runtime-logs"
$oracleScriptPath = Join-Path $OracleRoot "scripts\run_providence_oracle.ps1"

if ([string]::IsNullOrWhiteSpace($ExePath)) {
  $ExePath = Join-Path $OracleRoot "out_win_clang\Realmz.exe"
}

Push-Location $repositoryRoot
try {
  if (-not $SkipCompile) {
    & node (Join-Path $repositoryRoot "scripts\run_authoritative_scenario_proof.mjs")
    if ($LASTEXITCODE -ne 0) {
      throw "The authoritative scenario compiler proof failed with exit code $LASTEXITCODE."
    }
  }

  $scenarioPath = Require-Path $scenarioPath "Generated native scenario" "Container"
  $gameplayScriptPath = Require-Path $gameplayScriptPath "Gameplay proof script" "Leaf"
  $proofSummaryPath = Require-Path $proofSummaryPath "Compiler proof summary" "Leaf"
  $oracleScriptPath = Require-Path $oracleScriptPath "Realmz Oracle runner" "Leaf"
  $SupportScenarioPath = Require-Path $SupportScenarioPath "City of Bywater support scenario" "Container"
  $ExePath = Require-Path $ExePath "Realmz executable" "Leaf"

  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $runStartedUtc = [DateTime]::UtcNow
  $oracleArguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $oracleScriptPath,
    "-ScenarioPath", $scenarioPath,
    "-ScenarioName", $scenarioName,
    "-SupportScenarioPath", $SupportScenarioPath,
    "-SupportScenarioName", "City of Bywater",
    "-ExePath", $ExePath,
    "-ProfileRoot", $profileRoot,
    "-LogDir", $logDir,
    "-GameplayScriptPath", $gameplayScriptPath,
    "-GameplayTimeoutSeconds", $GameplayTimeoutSeconds,
    "-TimeoutSeconds", $ProcessTimeoutSeconds,
    "-SeedProfile",
    "-TraceLevel", "verbose"
  )

  & powershell.exe @oracleArguments
  if ($LASTEXITCODE -ne 0) {
    throw "The Realmz runtime proof failed with exit code $LASTEXITCODE. Inspect $logDir."
  }

  $runtimeSummaryFile = Get-ChildItem -LiteralPath $logDir -Filter "providence-oracle-*-summary.json" -File |
    Where-Object { $_.LastWriteTimeUtc -ge $runStartedUtc.AddSeconds(-2) } |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if ($null -eq $runtimeSummaryFile) {
    throw "The Oracle runner succeeded but did not create a runtime summary in $logDir."
  }

  $runtimeSummary = Get-Content -Raw -LiteralPath $runtimeSummaryFile.FullName | ConvertFrom-Json
  if (-not $runtimeSummary.Ok -or -not $runtimeSummary.GameplayResult.Ok -or $runtimeSummary.GameplayResult.Stage -ne "complete") {
    throw "Realmz did not complete the authoritative gameplay proof. Inspect $($runtimeSummaryFile.FullName)."
  }

  $actionMarkers = @($runtimeSummary.ActionMarkers)
  $stepNames = @($runtimeSummary.GameplayResult.Steps | ForEach-Object { $_.Name })
  $messageActionVerified = @($actionMarkers | Where-Object { $_ -match "raw=1 opcode=1 id=0" }).Count -gt 0
  $questActionVerified = @($actionMarkers | Where-Object { $_ -match "raw=47 opcode=47 id=1" }).Count -gt 0
  foreach ($requiredStep in @("start", "trigger-message", "save-triggered-position", "move-away", "load-triggered-position")) {
    if ($stepNames -notcontains $requiredStep) {
      throw "Runtime result omitted required gameplay step '$requiredStep'."
    }
  }
  if (-not $messageActionVerified -or -not $questActionVerified) {
    throw "Runtime result did not contain both authored Action Point markers."
  }
  $customAtlasLoaded = @(
    Select-String -LiteralPath $runtimeSummary.RuntimeLog -SimpleMatch "type=PICT id=306"
  ).Count -gt 0
  $renderMarkerCount = @($runtimeSummary.RenderMarkers).Count
  $fatalResourceMarkerCount = @($runtimeSummary.FoundBadMarkers).Count
  if (-not $customAtlasLoaded) {
    throw "Runtime result did not load the authored Custom 1 PICT 306 atlas."
  }
  if ($renderMarkerCount -eq 0) {
    throw "Runtime result did not contain completed map-render markers."
  }
  if ($fatalResourceMarkerCount -ne 0) {
    throw "Runtime result contained $fatalResourceMarkerCount fatal/bad marker(s)."
  }

  $proofSummary = Get-Content -Raw -LiteralPath $proofSummaryPath | ConvertFrom-Json
  $proofSummary.runtime = [ordered]@{
    realmzStarted = $true
    automatedRuntime = "existing Oracle-instrumented modern Realmz build"
    realmzSourceChangesRequired = $false
    ok = $true
    stage = $runtimeSummary.GameplayResult.Stage
    scenarioSelected = $true
    customLandlook = 6
    customLandlookPict306Loaded = $customAtlasLoaded
    renderMarkerCount = $renderMarkerCount
    fatalResourceMarkerCount = $fatalResourceMarkerCount
    movementVerified = $true
    messageActionVerified = $messageActionVerified
    questActionVerified = $questActionVerified
    saveReloadVerified = $true
    restoredPosition = [ordered]@{ x = 11; y = 12; landLevel = 0 }
    restoredQuestFlags = @(1)
    gameplayScript = "fixtures/scenario-seeds/authoritative-ownership-proof.gameplay.json"
    runtimeSummary = $runtimeSummaryFile.FullName
    gameplayResult = $runtimeSummary.GameplayResultPath
    runtimeLog = $runtimeSummary.RuntimeLog
    note = "Automated ownership proof loaded and rendered canonical Custom 1 metadata plus PICT 306 without Realmz changes or fatal resource markers; stock Classic-Mac execution remains a separate compatibility check."
  }
  $proofSummary | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $proofSummaryPath -Encoding UTF8

  Write-Output "Authoritative Realmz runtime proof passed."
  Write-Output "- Scenario: $scenarioPath"
  Write-Output "- Gameplay: start, movement, message Action Point, quest state, save, and reload"
  Write-Output "- Runtime summary: $($runtimeSummaryFile.FullName)"
  Write-Output "- Combined proof summary: $proofSummaryPath"
}
finally {
  Pop-Location
}
