param([string]$Godot, [switch]$NativeDisplay, [string]$MainPack)

$ErrorActionPreference = 'Stop'
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'verification-process.ps1')
if (-not $Godot) { $Godot = Resolve-Godot }
$ScaleTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$ScaleJobRoot = Join-Path $ScaleTempRoot ('providence-display-scaling-' + [Guid]::NewGuid().ToString('N'))
$PreviousSettings = $env:PROVIDENCE_DISPLAY_SETTINGS_PATH
$PreviousExpectedScale = $env:PROVIDENCE_EXPECT_UI_SCALE
Write-Host "Display-scaling job root: $ScaleJobRoot. Isolated preferences and logs removed on success/failure."

function Invoke-ScalingCheck([string]$Marker, [string]$ExpectedScale) {
    $env:PROVIDENCE_EXPECT_UI_SCALE = $ExpectedScale
    $Run = Start-Process -FilePath $Godot -ArgumentList $Arguments -WindowStyle Hidden -Wait -PassThru `
        -RedirectStandardOutput (Join-Path $ScaleJobRoot 'stdout.log') -RedirectStandardError (Join-Path $ScaleJobRoot 'stderr.log')
    $Output = [IO.File]::ReadAllText((Join-Path $ScaleJobRoot 'stdout.log')) + [IO.File]::ReadAllText((Join-Path $ScaleJobRoot 'stderr.log'))
    Write-Host $Output
    if ($Run.ExitCode -ne 0 -or $Output -match 'SCRIPT ERROR|ERROR:' -or $Output -notmatch $Marker) {
        throw 'Display scaling or isolated preference verification failed.'
    }
}

try {
    New-Item -ItemType Directory -Path $ScaleJobRoot | Out-Null
    $env:PROVIDENCE_DISPLAY_SETTINGS_PATH = Join-Path $ScaleJobRoot 'display.cfg'
    $Arguments = @('--path', ('"' + (Join-Path $RepositoryRoot 'godot') + '"'), '--script', 'res://tools/validate_display_scaling.gd')
    if (-not $NativeDisplay) { $Arguments = @('--headless') + $Arguments }
    if ($MainPack) { $Arguments += @('--main-pack', ('"' + [IO.Path]::GetFullPath($MainPack) + '"')) }
    Invoke-ScalingCheck 'PROVIDENCE_DISPLAY_SCALING_OK' ''
    Invoke-ScalingCheck 'PROVIDENCE_DISPLAY_SCALING_RESTART_OK' '150'
}
finally {
    $env:PROVIDENCE_DISPLAY_SETTINGS_PATH = $PreviousSettings
    $env:PROVIDENCE_EXPECT_UI_SCALE = $PreviousExpectedScale
    $ResolvedRoot = [IO.Path]::GetFullPath($ScaleJobRoot).TrimEnd('\')
    if ([IO.Path]::GetDirectoryName($ResolvedRoot) -ne $ScaleTempRoot -or -not [IO.Path]::GetFileName($ResolvedRoot).StartsWith('providence-display-scaling-')) {
        throw "Refusing unverified cleanup: $ResolvedRoot"
    }
    if (Test-Path -LiteralPath $ResolvedRoot) { Remove-Item -LiteralPath $ResolvedRoot -Recurse -Force }
}
