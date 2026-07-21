param(
  [switch]$SkipWindows,
  [switch]$SkipLinux
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$expectedBinary = "realmz-providence"
$unexpectedBinary = "realmz-remake-converter"
$package = Get-Content -Raw -LiteralPath "package.json" | ConvertFrom-Json
$version = [string]$package.version

function Assert-FileExists {
  param(
    [string]$Path,
    [int64]$MinimumBytes = 1
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Expected packaged entrypoint file is missing: $Path"
  }
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -lt $MinimumBytes) {
    throw "Packaged entrypoint file is suspiciously small ($($item.Length) bytes): $Path"
  }
}

function Assert-TextMatch {
  param(
    [string]$Path,
    [string]$Pattern,
    [string]$Description
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Expected packaging metadata is missing: $Path"
  }
  $content = Get-Content -Raw -LiteralPath $Path
  if ($content -notmatch $Pattern) {
    throw "$Description is not configured in $Path"
  }
}

function Assert-TextDoesNotMatch {
  param(
    [string]$Path,
    [string]$Pattern,
    [string]$Description
  )

  $content = Get-Content -Raw -LiteralPath $Path
  if ($content -match $Pattern) {
    throw "$Description is incorrectly configured in $Path"
  }
}

$metadataJson = cargo metadata --manifest-path "src-tauri\Cargo.toml" --no-deps --format-version 1
if ($LASTEXITCODE -ne 0) {
  throw "Unable to read Cargo package metadata."
}
$metadata = $metadataJson | ConvertFrom-Json
$cargoPackage = $metadata.packages | Where-Object { $_.name -eq "realmz-providence" } | Select-Object -First 1
if (-not $cargoPackage) {
  throw "Cargo metadata does not contain the realmz-providence package."
}
if ($cargoPackage.default_run -ne $expectedBinary) {
  throw "Cargo default-run must be '$expectedBinary'; found '$($cargoPackage.default_run)'."
}

if (-not $SkipWindows) {
  $releaseExe = "src-tauri\target\release\$expectedBinary.exe"
  $nsisScript = "src-tauri\target\release\nsis\x64\installer.nsi"
  $offlineNsisScript = "src-tauri\target\release\nsis\x64\installer-offline.nsi"
  $wixSource = "src-tauri\target\release\wix\x64\main.wxs"

  Assert-FileExists -Path $releaseExe -MinimumBytes 10485760
  Assert-TextMatch -Path $nsisScript -Pattern ('!define MAINBINARYNAME "' + [regex]::Escape($expectedBinary) + '"') -Description "The NSIS GUI entrypoint"
  Assert-TextDoesNotMatch -Path $nsisScript -Pattern ('!define MAINBINARYNAME "' + [regex]::Escape($unexpectedBinary) + '"') -Description "The NSIS converter entrypoint"
  Assert-TextMatch -Path $offlineNsisScript -Pattern ('!define MAINBINARYNAME "' + [regex]::Escape($expectedBinary) + '"') -Description "The offline NSIS GUI entrypoint"
  Assert-TextDoesNotMatch -Path $offlineNsisScript -Pattern ('!define MAINBINARYNAME "' + [regex]::Escape($unexpectedBinary) + '"') -Description "The offline NSIS converter entrypoint"
  Assert-TextMatch -Path $wixSource -Pattern ('<Component Id="Path"[^>]*>[\s\S]*?<File Id="Path" Source="[^"]*' + [regex]::Escape($expectedBinary) + '\.exe"') -Description "The MSI GUI entrypoint"
  Assert-TextMatch -Path $wixSource -Pattern '<Shortcut[^>]*Target="\[!Path\]"' -Description "The MSI GUI shortcut target"
}

if (-not $SkipLinux) {
  $appDir = "src-tauri\target\release\bundle\appimage\Realmz Providence.AppDir"
  $appDesktop = Join-Path $appDir "usr\share\applications\Realmz Providence.desktop"
  $debRoot = "src-tauri\target\release\bundle\deb\Realmz Providence_${version}_amd64\data"
  $debDesktop = Join-Path $debRoot "usr\share\applications\Realmz Providence.desktop"
  $rpmRoot = "src-tauri\target\release\bundle\rpm\Realmz Providence-${version}-1.x86_64"
  $rpmDesktop = Join-Path $rpmRoot "usr\share\applications\Realmz Providence.desktop"
  $rpmPackage = "src-tauri\target\release\bundle\rpm\Realmz Providence-${version}-1.x86_64.rpm"

  Assert-FileExists -Path (Join-Path $appDir "usr\bin\$expectedBinary") -MinimumBytes 10485760
  Assert-TextMatch -Path $appDesktop -Pattern ('(?m)^Exec=' + [regex]::Escape($expectedBinary) + '$') -Description "The AppImage GUI entrypoint"
  Assert-TextDoesNotMatch -Path $appDesktop -Pattern ('(?m)^Exec=' + [regex]::Escape($unexpectedBinary) + '$') -Description "The AppImage converter entrypoint"
  Assert-FileExists -Path (Join-Path $debRoot "usr\bin\$expectedBinary") -MinimumBytes 10485760
  Assert-TextMatch -Path $debDesktop -Pattern ('(?m)^Exec=' + [regex]::Escape($expectedBinary) + '$') -Description "The Debian GUI entrypoint"
  Assert-TextDoesNotMatch -Path $debDesktop -Pattern ('(?m)^Exec=' + [regex]::Escape($unexpectedBinary) + '$') -Description "The Debian converter entrypoint"
  Assert-FileExists -Path $rpmPackage -MinimumBytes 10485760
  Assert-TextMatch -Path $rpmDesktop -Pattern ('(?m)^Exec=' + [regex]::Escape($expectedBinary) + '$') -Description "The RPM GUI entrypoint"
  Assert-TextDoesNotMatch -Path $rpmDesktop -Pattern ('(?m)^Exec=' + [regex]::Escape($unexpectedBinary) + '$') -Description "The RPM converter entrypoint"
}

Write-Host "Release bundle entrypoints target $expectedBinary for v$version." -ForegroundColor Green
