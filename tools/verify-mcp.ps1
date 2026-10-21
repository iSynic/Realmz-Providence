param([Parameter(Mandatory = $true)][string]$Godot, [switch]$ControlsOnly)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'verification-process.ps1')
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$Native = Resolve-VerificationNativePaths -RepositoryRoot $RepositoryRoot
$Mcp = Join-Path (Split-Path -Parent $Native.Adapter) ('providence-mcp' + [IO.Path]::GetExtension($Native.Adapter))
if (-not (Test-Path -LiteralPath $Mcp -PathType Leaf)) { throw 'Build providence-mcp with the native adapter before this lane.' }
Invoke-Checked python @((Join-Path $PSScriptRoot 'generate-mcp-reference.py'), '--mcp', $Mcp)
Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-fixture-receipts.py'))
$TemporaryRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ('providence-mcp-' + [guid]::NewGuid().ToString('N'))))
Write-Host "MCP verification: $TemporaryRoot; disposable projects removed on success or failure. Retained investigations use explicit external roots."
New-Item -ItemType Directory -Path $TemporaryRoot | Out-Null
try {
    $Staging = & python (Join-Path $PSScriptRoot 'run-godot-workflow.py') '--timeout' '30' $Godot '--headless' '--path' (Join-Path $RepositoryRoot 'godot') '--script' 'res://tools/validate_collaboration_asset_staging.gd' 2>&1 | Out-String
    Write-Host $Staging
    if ($LASTEXITCODE -ne 0 -or $Staging -match 'SCRIPT ERROR|ERROR:' -or $Staging -notmatch 'PROVIDENCE_COLLABORATION_ASSET_STAGING_OK') { throw 'Staged Assets collaboration guard failed.' }
    $Mailbox = & python (Join-Path $PSScriptRoot 'run-godot-workflow.py') '--timeout' '15' $Godot '--headless' '--path' (Join-Path $RepositoryRoot 'godot') '--script' 'res://tools/validate_collaboration_mailbox.gd' '--' $TemporaryRoot 2>&1 | Out-String
    Write-Host $Mailbox
    if ($LASTEXITCODE -ne 0 -or $Mailbox -match 'SCRIPT ERROR|ERROR:' -or $Mailbox -notmatch 'PROVIDENCE_COLLABORATION_MAILBOX_OK') { throw 'Collaboration mailbox publication failed.' }
    $Arguments = @((Join-Path $PSScriptRoot 'run-godot-workflow.py'), '--timeout', '45', $Godot, '--headless', '--path', (Join-Path $RepositoryRoot 'godot'), '--script', 'res://tools/validate_collaboration_controls.gd', '--', $TemporaryRoot, $Mcp)
    $Output = & python @Arguments 2>&1 | Out-String
    Write-Host $Output
    if ($LASTEXITCODE -ne 0 -or $Output -match 'SCRIPT ERROR|ERROR:' -or $Output -notmatch 'PROVIDENCE_COLLABORATION_CONTROLS_OK') { throw 'Native collaboration controls failed.' }
    if (-not $ControlsOnly) {
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-authority.py'), '--adapter', $Native.Adapter, '--mcp', $Mcp, '--output', (Join-Path $TemporaryRoot 'authority'))
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-authoring-contracts.py'), '--adapter', $Native.Adapter, '--mcp', $Mcp, '--rules-root', (Join-Path $RepositoryRoot 'godot/bundled/realmz-reference'), '--output', (Join-Path $TemporaryRoot 'contracts'))
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-media.py'), '--adapter', $Native.Adapter, '--mcp', $Mcp, '--output', (Join-Path $TemporaryRoot 'media'))
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-repairs.py'), '--adapter', $Native.Adapter, '--mcp', $Mcp, '--output', (Join-Path $TemporaryRoot 'repairs'))
        $Application = Join-Path $TemporaryRoot 'application-media'
        Invoke-Checked python @((Join-Path $PSScriptRoot 'prepare-mcp-application-library.py'), '--adapter', $Native.Adapter, '--source', (Join-Path $RepositoryRoot 'godot/bundled/realmz-reference'), '--output', $Application)
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-reference-media.py'), '--adapter', $Native.Adapter, '--mcp', $Mcp, '--application-library', $Application, '--output', (Join-Path $TemporaryRoot 'reference-media'))
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-action-queries.py'), '--adapter', $Native.Adapter, '--mcp', $Mcp, '--application-library', $Application, '--output', (Join-Path $TemporaryRoot 'action-queries'))
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-local-paint.py'), '--adapter', $Native.Adapter, '--mcp', $Mcp, '--godot', $Godot, '--application-library', $Application, '--output', (Join-Path $TemporaryRoot 'local-paint'))
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-world.py'), '--adapter', $Native.Adapter, '--mcp', $Mcp, '--application-library', $Application, '--output', (Join-Path $TemporaryRoot 'world'))
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-exports.py'), '--adapter', $Native.Adapter, '--mcp', $Mcp, '--rules-root', (Join-Path $RepositoryRoot 'godot/bundled/realmz-reference'), '--application-library', $Application, '--output', (Join-Path $TemporaryRoot 'exports'))
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-classic-import.py'), '--adapter', $Native.Adapter, '--mcp', $Mcp, '--scenario', (Join-Path $TemporaryRoot 'exports/outputs/Crossroads'), '--application-data', (Join-Path $RepositoryRoot 'godot/bundled/realmz-reference'), '--application-library', $Application, '--native-menu-selection', '19', '--output', (Join-Path $TemporaryRoot 'import'))
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-exports.py'), '--land-only', '--adapter', $Native.Adapter, '--mcp', $Mcp, '--rules-root', (Join-Path $RepositoryRoot 'godot/bundled/realmz-reference'), '--application-library', $Application, '--output', (Join-Path $TemporaryRoot 'land-only'))
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-classic-import.py'), '--adapter', $Native.Adapter, '--mcp', $Mcp, '--scenario', (Join-Path $TemporaryRoot 'land-only/outputs/Crossroads'), '--application-data', (Join-Path $RepositoryRoot 'godot/bundled/realmz-reference'), '--application-library', $Application, '--native-menu-selection', '19', '--output', (Join-Path $TemporaryRoot 'land-import'))
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-export-jobs.py'), '--adapter', $Native.Adapter, '--mcp', $Mcp, '--rules-root', (Join-Path $RepositoryRoot 'godot/bundled/realmz-reference'), '--application-library', $Application, '--finalization-root', (Join-Path $RepositoryRoot 'support/rebuilt'), '--output', (Join-Path $TemporaryRoot 'export-jobs'))
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-replacement.py'), '--adapter', $Native.Adapter, '--mcp', $Mcp, '--rules-root', (Join-Path $RepositoryRoot 'godot/bundled/realmz-reference'), '--application-library', $Application, '--output', (Join-Path $TemporaryRoot 'replacement'))
        Invoke-Checked python @((Join-Path $PSScriptRoot 'verify-mcp-collaboration.py'), '--godot', $Godot, '--adapter', $Native.Adapter, '--mcp', $Mcp, '--output', (Join-Path $TemporaryRoot 'live'))
    }
}
finally {
    $Resolved = [IO.Path]::GetFullPath($TemporaryRoot)
    $Parent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
    if ((Split-Path -Parent $Resolved).TrimEnd('\') -ne $Parent -or (Split-Path -Leaf $Resolved) -notmatch '^providence-mcp-[a-f0-9]{32}$') { throw 'Refusing unsafe MCP verification cleanup.' }
    Remove-Item -LiteralPath $Resolved -Recurse -Force
}
