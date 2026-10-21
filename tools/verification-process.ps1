function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

function Resolve-Godot {
    if ($env:PROVIDENCE_GODOT_PATH -and (Test-Path -LiteralPath $env:PROVIDENCE_GODOT_PATH)) {
        return $env:PROVIDENCE_GODOT_PATH
    }
    foreach ($Name in @('godot4', 'godot')) {
        $Command = Get-Command $Name -ErrorAction SilentlyContinue
        if ($Command) { return $Command.Source }
    }
    $PackageRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe'
    if (Test-Path -LiteralPath $PackageRoot) {
        $Candidate = Get-ChildItem -LiteralPath $PackageRoot -Filter 'Godot*_console.exe' -File |
            Sort-Object Name -Descending |
            Select-Object -First 1
        if ($Candidate) { return $Candidate.FullName }
    }
    throw 'Godot 4.7 was not found. Set PROVIDENCE_GODOT_PATH.'
}


function Resolve-VerificationNativePaths {
    param([string]$RepositoryRoot, [ValidateSet('debug', 'release')][string]$BuildProfile = 'debug')

    $MetadataJson = & cargo metadata --no-deps --format-version 1 --manifest-path (Join-Path $RepositoryRoot 'Cargo.toml')
    if ($LASTEXITCODE -ne 0) { throw 'Cargo could not resolve the verification build directory.' }
    $Metadata = $MetadataJson | ConvertFrom-Json
    $Suffix = if ($IsWindows -or $env:OS -eq 'Windows_NT') { '.exe' } else { '' }
    $Paths = @{}
    foreach ($Entry in @(@('Adapter', 'PROVIDENCE_ADAPTER_PATH', 'providence-native-adapter'), @('Cli', 'PROVIDENCE_CLI_PATH', 'providence-cli'))) {
        $Candidate = [Environment]::GetEnvironmentVariable($Entry[1])
        if ([string]::IsNullOrWhiteSpace($Candidate)) {
            $Candidate = Join-Path $Metadata.target_directory (Join-Path $BuildProfile ($Entry[2] + $Suffix))
        }
        $Resolved = [IO.Path]::GetFullPath($Candidate)
        if (-not (Test-Path -LiteralPath $Resolved -PathType Leaf)) {
            throw "Verification binary is missing: $Resolved. Build it or set $($Entry[1]) explicitly."
        }
        $Paths[$Entry[0]] = $Resolved
    }
    return [pscustomobject]$Paths
}
