param(
  [string]$ProvidenceRoot = "",

  [Parameter(Mandatory = $true)]
  [string]$RemakeRoot,

  [string]$Godot = "godot",

  [string]$BundlePath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProvidenceRoot)) {
  $ProvidenceRoot = Split-Path -Parent $PSScriptRoot
}

function Resolve-Directory([string]$PathValue, [string]$Label) {
  if (-not (Test-Path -LiteralPath $PathValue -PathType Container)) {
    throw "$Label directory was not found at $PathValue."
  }
  return (Resolve-Path -LiteralPath $PathValue).Path
}

$providenceRootPath = Resolve-Directory $ProvidenceRoot "Providence"
$remakeRootPath = Resolve-Directory $RemakeRoot "Realmz Remake"
$remakeSource = Join-Path $remakeRootPath "src"
if (-not (Test-Path -LiteralPath (Join-Path $remakeSource "project.godot") -PathType Leaf)) {
  if (Test-Path -LiteralPath (Join-Path $remakeRootPath "project.godot") -PathType Leaf) {
    $remakeSource = $remakeRootPath
  } else {
    throw "Realmz Remake project.godot was not found under $remakeRootPath or its src directory."
  }
}

$validator = Join-Path $remakeSource "scripts\classic_runtime\tests\validate_classic_bundle.gd"
if (-not (Test-Path -LiteralPath $validator -PathType Leaf)) {
  throw "The Realmz Remake Classic bundle validator was not found at $validator."
}

if (Test-Path -LiteralPath $Godot -PathType Leaf) {
  $godotCommand = (Resolve-Path -LiteralPath $Godot).Path
} else {
  $godotCommand = (Get-Command $Godot -ErrorAction Stop).Source
}

if ([string]::IsNullOrWhiteSpace($BundlePath)) {
  $bundle = Join-Path $providenceRootPath "tmp\authoritative-scenario-proof\remake-classic-a"
} elseif ([System.IO.Path]::IsPathRooted($BundlePath)) {
  $bundle = [System.IO.Path]::GetFullPath($BundlePath)
} else {
  $bundle = [System.IO.Path]::GetFullPath((Join-Path $providenceRootPath $BundlePath))
}

$remakeStatusBefore = @(& git -C $remakeRootPath status --porcelain=v1)
if ($LASTEXITCODE -ne 0) {
  throw "Could not inspect the Realmz Remake checkout before validation."
}

$gateError = $null
try {
  Push-Location $providenceRootPath
  try {
    $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
    & $npm run check:authoritative-scenario-proof
    if ($LASTEXITCODE -ne 0) {
      throw "Providence's authoritative scenario proof failed with exit code $LASTEXITCODE."
    }

    if (-not (Test-Path -LiteralPath (Join-Path $bundle "campaign.json") -PathType Leaf)) {
      throw "The Providence proof did not generate a Classic bundle at $bundle."
    }

    & $godotCommand --headless --path $remakeSource --script res://scripts/classic_runtime/tests/validate_classic_bundle.gd -- $bundle
    if ($LASTEXITCODE -ne 0) {
      throw "Realmz Remake rejected the generated Classic bundle with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
} catch {
  $gateError = $_
}

$remakeStatusAfter = @(& git -C $remakeRootPath status --porcelain=v1)
if ($LASTEXITCODE -ne 0) {
  throw "Could not inspect the Realmz Remake checkout after validation."
}
if (($remakeStatusBefore -join "`n") -ne ($remakeStatusAfter -join "`n")) {
  throw "Realmz Remake working-tree state changed while running the read-only validator."
}
if ($null -ne $gateError) {
  throw $gateError
}

Write-Output "Providence bundle: $bundle"
Write-Output "Realmz Remake validator: accepted"
Write-Output "Repeated Providence output: byte-identical"
