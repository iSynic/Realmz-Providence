param(
    [Parameter(Mandatory = $true)][string]$Godot,
    [switch]$UseEditorConfiguration,
    [ValidateSet('debug', 'release')][string]$BuildProfile = 'debug',
    [string]$ReceiptPath,
    [string]$ApplicationLibrary = '',
    [string]$SmartCapturePath = '',
    [ValidateSet('stroke', 'workflow', 'workspace', 'area', 'resources', 'stamp_input', 'behavior', 'custom', 'smart', 'smart_input', 'smart_combinations', 'magic', 'brush_cancel', 'brush_states', 'mapping', 'chrome', 'creation', 'cells', 'special', 'inline', 'scenario', 'links', 'themes')][string[]]$Check = @('stroke', 'workflow', 'workspace', 'area', 'resources', 'stamp_input', 'behavior', 'custom', 'smart', 'smart_input', 'smart_combinations', 'magic', 'brush_cancel', 'brush_states', 'mapping', 'chrome', 'creation', 'cells', 'special', 'inline', 'links', 'themes')
)

$ErrorActionPreference = 'Stop'
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$PaintSystemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$PaintTemp = Join-Path $PaintSystemTemp ('providence-ui-paint-' + [Guid]::NewGuid().ToString('N'))
$OriginalAdapter = $env:PROVIDENCE_ADAPTER_PATH
$OriginalCli = $env:PROVIDENCE_CLI_PATH
$OriginalPaintLibrary = $env:PROVIDENCE_APPLICATION_LIBRARY_ROOT
$PaintReceipts = [Collections.Generic.List[string]]::new()
Write-Host "Map paint checks use $PaintTemp; disposable projects are removed after the run."
try {
    if ($ApplicationLibrary) { $env:PROVIDENCE_APPLICATION_LIBRARY_ROOT = [IO.Path]::GetFullPath($ApplicationLibrary) }
    if ($UseEditorConfiguration) {
        $env:PROVIDENCE_ADAPTER_PATH = $null
        $env:PROVIDENCE_CLI_PATH = $null
        Write-Host 'Using the native paths selected by the Godot project configuration, without test-runner binary overrides.'
    }
    else {
        . (Join-Path $PSScriptRoot 'verification-process.ps1')
        $Native = Resolve-VerificationNativePaths -RepositoryRoot $RepositoryRoot -BuildProfile $BuildProfile
        $env:PROVIDENCE_ADAPTER_PATH = $Native.Adapter
        $env:PROVIDENCE_CLI_PATH = $Native.Cli
    }
    foreach ($PaintCheck in $Check) {
        $Arguments = @('--headless', '--path', (Join-Path $RepositoryRoot 'godot'), '--script', "res://tools/validate_map_paint_$PaintCheck.gd")
        $PaintCapture = $PaintCheck -in @('smart_input', 'smart_combinations', 'magic', 'stamp_input', 'brush_states', 'brush_cancel', 'mapping') -and $SmartCapturePath
        if ($PaintCapture) {
            $SmartCaptureRoot = [IO.Path]::GetFullPath($SmartCapturePath)
            [IO.Directory]::CreateDirectory($SmartCaptureRoot) | Out-Null
            $Arguments = @('--path', (Join-Path $RepositoryRoot 'godot'), '--script', "res://tools/validate_map_paint_$PaintCheck.gd")
        }
        if ($PaintCheck -ne 'stroke') { $Arguments += @('--', $PaintTemp) }
        if ($PaintCapture) { $Arguments += $SmartCaptureRoot }
        $PaintErrorPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $Output = & python (Join-Path $PSScriptRoot 'run-godot-workflow.py') '--timeout' '600' $Godot @Arguments 2>&1 | Out-String
            $PaintExitCode = $LASTEXITCODE
        }
        finally { $ErrorActionPreference = $PaintErrorPreference }
        Write-Host $Output
        $PaintReceipts.Add($Output)
        $Marker = 'PROVIDENCE_MAP_PAINT_' + $PaintCheck.ToUpperInvariant() + '_OK'
        if ($PaintExitCode -ne 0 -or $Output -match 'SCRIPT ERROR|ERROR:' -or $Output -notmatch $Marker) {
            throw "Godot map paint $PaintCheck check failed."
        }
    }
}
finally {
    if ($ReceiptPath) { $PaintReceipts | Set-Content -LiteralPath $ReceiptPath -Encoding utf8 }
    $env:PROVIDENCE_ADAPTER_PATH = $OriginalAdapter
    $env:PROVIDENCE_CLI_PATH = $OriginalCli
    $env:PROVIDENCE_APPLICATION_LIBRARY_ROOT = $OriginalPaintLibrary
    $Resolved = [IO.Path]::GetFullPath($PaintTemp).TrimEnd('\')
    if ([IO.Path]::GetDirectoryName($Resolved) -ne $PaintSystemTemp -or -not [IO.Path]::GetFileName($Resolved).StartsWith('providence-ui-paint-', [StringComparison]::Ordinal)) {
        throw "Refusing to remove unverified paint test directory: $Resolved"
    }
    if ([IO.Directory]::Exists($Resolved)) { [IO.Directory]::Delete($Resolved, $true) }
}
