$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$package = Get-Content -Raw -Path "package.json" | ConvertFrom-Json
$version = [string]$package.version
$bundleRoot = Join-Path $repoRoot "src-tauri\target\release\bundle"
$standardNsis = Join-Path $bundleRoot "nsis\Realmz Providence_${version}_x64-setup.exe"
$offlineNsis = Join-Path $bundleRoot "nsis\Realmz Providence_${version}_x64-offline-setup.exe"

if (Test-Path -LiteralPath $offlineNsis) {
  Remove-Item -LiteralPath $offlineNsis -Force
}

Write-Host "Building offline Windows NSIS fallback for v$version..." -ForegroundColor Cyan
npx tauri build --bundles nsis --config src-tauri/tauri.offline.conf.json
if ($LASTEXITCODE -ne 0) {
  throw "Offline Windows NSIS build failed with exit code $LASTEXITCODE"
}
if (-not (Test-Path -LiteralPath $standardNsis)) {
  throw "Offline Windows NSIS output is missing: $standardNsis"
}
Move-Item -LiteralPath $standardNsis -Destination $offlineNsis -Force

Write-Host "Building primary online Windows installers for v$version..." -ForegroundColor Cyan
npm run dist
if ($LASTEXITCODE -ne 0) {
  throw "Primary online Windows build failed with exit code $LASTEXITCODE"
}
if (-not (Test-Path -LiteralPath $standardNsis)) {
  throw "Primary online Windows NSIS output is missing: $standardNsis"
}

$onlineSize = (Get-Item -LiteralPath $standardNsis).Length
$offlineSize = (Get-Item -LiteralPath $offlineNsis).Length
if ($onlineSize -ge $offlineSize) {
  throw "Primary online installer is not smaller than the offline fallback. Check webviewInstallMode before publishing."
}

Write-Host "Windows release variants built:" -ForegroundColor Green
Write-Host ("  Online:  {0:n1} MB  {1}" -f ($onlineSize / 1MB), $standardNsis)
Write-Host ("  Offline: {0:n1} MB  {1}" -f ($offlineSize / 1MB), $offlineNsis)
