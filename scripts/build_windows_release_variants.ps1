$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$package = Get-Content -Raw -Path "package.json" | ConvertFrom-Json
$version = [string]$package.version
$bundleRoot = Join-Path $repoRoot "src-tauri\target\release\bundle"
$standardNsis = Join-Path $bundleRoot "nsis\Realmz Providence_${version}_x64-setup.exe"
$offlineNsis = Join-Path $bundleRoot "nsis\Realmz Providence_${version}_x64-offline-setup.exe"
$nsisWorkDir = Join-Path $repoRoot "src-tauri\target\release\nsis\x64"
$generatedNsis = Join-Path $nsisWorkDir "installer.nsi"
$offlineGeneratedNsis = Join-Path $nsisWorkDir "installer-offline.nsi"
$webViewOfflineUrl = "https://go.microsoft.com/fwlink/?linkid=2124701"

function Resolve-WebViewOfflineInstaller {
  $curl = Get-Command curl.exe -ErrorAction Stop
  $headers = & $curl.Source -sS -I --connect-timeout 20 --max-time 120 $webViewOfflineUrl
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve the current WebView2 offline installer URL (curl exit $LASTEXITCODE)."
  }

  $locationMatch = [regex]::Match(
    ($headers -join "`n"),
    '(?im)^Location:\s*(https://msedge\.sf\.dl\.delivery\.mp\.microsoft\.com/filestreamingservice/files/([^/\r\n]+)/([^/\r\n]+))\s*$'
  )
  if (-not $locationMatch.Success) {
    throw "Microsoft WebView2 redirect did not contain the expected offline installer URL."
  }

  $resolvedUrl = $locationMatch.Groups[1].Value
  $guid = $locationMatch.Groups[2].Value
  $fileName = $locationMatch.Groups[3].Value
  $cacheDir = Join-Path $env:LOCALAPPDATA "tauri\x64\$guid"
  $installerPath = Join-Path $cacheDir $fileName
  $minimumBytes = 100MB

  if (-not (Test-Path -LiteralPath $installerPath) -or (Get-Item -LiteralPath $installerPath).Length -lt $minimumBytes) {
    New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
    $partialPath = "$installerPath.download"
    Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue
    Write-Host "Downloading the current WebView2 offline runtime..." -ForegroundColor Cyan
    & $curl.Source -fL --retry 3 --retry-delay 2 --retry-all-errors --connect-timeout 20 --max-time 900 --output $partialPath $resolvedUrl
    if ($LASTEXITCODE -ne 0) {
      Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue
      throw "WebView2 offline runtime download failed with exit code $LASTEXITCODE."
    }
    Move-Item -LiteralPath $partialPath -Destination $installerPath -Force
  }

  $installer = Get-Item -LiteralPath $installerPath
  if ($installer.Length -lt $minimumBytes) {
    throw "Cached WebView2 offline runtime is suspiciously small ($($installer.Length) bytes): $installerPath"
  }
  Write-Host ("Using WebView2 offline runtime: {0:n1} MB  {1}" -f ($installer.Length / 1MB), $installerPath)
  return $installer.FullName
}

function Build-OfflineNsisFromGeneratedScript {
  param([string]$WebViewInstallerPath)

  if (-not (Test-Path -LiteralPath $generatedNsis)) {
    throw "Tauri did not leave the generated NSIS script at: $generatedNsis"
  }

  $script = Get-Content -Raw -LiteralPath $generatedNsis
  $modeLine = '!define INSTALLWEBVIEW2MODE "downloadBootstrapper"'
  $pathLine = '!define WEBVIEW2INSTALLERPATH ""'
  if (-not $script.Contains($modeLine) -or -not $script.Contains($pathLine)) {
    throw "Generated NSIS script does not contain the expected WebView2 definitions."
  }

  $offlineScript = $script.Replace($modeLine, '!define INSTALLWEBVIEW2MODE "offlineInstaller"')
  $offlineScript = $offlineScript.Replace($pathLine, "!define WEBVIEW2INSTALLERPATH `"$WebViewInstallerPath`"")
  Set-Content -LiteralPath $offlineGeneratedNsis -Value $offlineScript -Encoding UTF8

  $makensis = Join-Path $env:LOCALAPPDATA "tauri\NSIS\makensis.exe"
  if (-not (Test-Path -LiteralPath $makensis)) {
    throw "Tauri's cached makensis executable is missing: $makensis"
  }

  $generatedOutput = Join-Path $nsisWorkDir "nsis-output.exe"
  Remove-Item -LiteralPath $generatedOutput -Force -ErrorAction SilentlyContinue
  & $makensis -INPUTCHARSET UTF8 -OUTPUTCHARSET UTF8 -V1 $offlineGeneratedNsis
  if ($LASTEXITCODE -ne 0) {
    throw "Offline Windows NSIS packaging failed with exit code $LASTEXITCODE."
  }
  if (-not (Test-Path -LiteralPath $generatedOutput)) {
    throw "Offline Windows NSIS output is missing: $generatedOutput"
  }
  Move-Item -LiteralPath $generatedOutput -Destination $offlineNsis -Force
}

if (Test-Path -LiteralPath $offlineNsis) {
  Remove-Item -LiteralPath $offlineNsis -Force
}

Write-Host "Building primary online Windows installers for v$version..." -ForegroundColor Cyan
npm run dist
if ($LASTEXITCODE -ne 0) {
  throw "Primary online Windows build failed with exit code $LASTEXITCODE"
}
if (-not (Test-Path -LiteralPath $standardNsis)) {
  throw "Primary online Windows NSIS output is missing: $standardNsis"
}

Write-Host "Building offline Windows NSIS fallback for v$version..." -ForegroundColor Cyan
$webViewInstaller = Resolve-WebViewOfflineInstaller
Build-OfflineNsisFromGeneratedScript -WebViewInstallerPath $webViewInstaller

$onlineSize = (Get-Item -LiteralPath $standardNsis).Length
$offlineSize = (Get-Item -LiteralPath $offlineNsis).Length
if ($onlineSize -ge $offlineSize) {
  throw "Primary online installer is not smaller than the offline fallback. Check webviewInstallMode before publishing."
}

Write-Host "Checking packaged Windows entrypoints..." -ForegroundColor Cyan
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check_release_bundle_entrypoint.ps1 -SkipLinux
if ($LASTEXITCODE -ne 0) {
  throw "Windows release entrypoint verification failed with exit code $LASTEXITCODE."
}

Write-Host "Windows release variants built:" -ForegroundColor Green
Write-Host ("  Online:  {0:n1} MB  {1}" -f ($onlineSize / 1MB), $standardNsis)
Write-Host ("  Offline: {0:n1} MB  {1}" -f ($offlineSize / 1MB), $offlineNsis)
