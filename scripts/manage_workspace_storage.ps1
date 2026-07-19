param(
  [switch]$CleanEphemeral,
  [switch]$CleanCargo
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$tmpRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "tmp"))
$cargoTarget = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "src-tauri\target"))
$performanceProfileRoot = [System.IO.Path]::GetFullPath((Join-Path $tmpRoot "ui-performance-edge-profile"))

function Assert-WorkspaceChild {
  param([Parameter(Mandatory = $true)][string]$Path)

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $prefix = $repoRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $fullPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to manage a path outside the workspace: $fullPath"
  }
  return $fullPath
}

function Get-TreeStats {
  param([Parameter(Mandatory = $true)][string]$Path)

  $fullPath = Assert-WorkspaceChild $Path
  if (-not (Test-Path -LiteralPath $fullPath)) {
    return [pscustomobject]@{ Bytes = [int64]0; Files = [int64]0 }
  }
  if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
    $file = Get-Item -LiteralPath $fullPath -Force
    return [pscustomobject]@{ Bytes = [int64]$file.Length; Files = [int64]1 }
  }

  $probeDestination = Join-Path ([System.IO.Path]::GetTempPath()) "providence-storage-probe-$PID"
  $output = & robocopy $fullPath $probeDestination /L /E /BYTES /NFL /NDL /NJH /XJ /R:0 /W:0 2>&1
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy could not audit ${fullPath}: exit code $LASTEXITCODE"
  }
  $summary = $output -join "`n"
  $bytesMatch = [regex]::Match($summary, '(?m)^\s*Bytes\s*:\s*(\d+)')
  $filesMatch = [regex]::Match($summary, '(?m)^\s*Files\s*:\s*(\d+)')
  if (-not $bytesMatch.Success -or -not $filesMatch.Success) {
    throw "Could not parse storage totals for $fullPath"
  }
  return [pscustomobject]@{
    Bytes = [int64]$bytesMatch.Groups[1].Value
    Files = [int64]$filesMatch.Groups[1].Value
  }
}

function Format-GiB {
  param([int64]$Bytes)
  return "{0:N2} GiB" -f ($Bytes / 1GB)
}

function Show-TreeStats {
  param([string]$Label, [string]$Path)

  $stats = Get-TreeStats $Path
  Write-Host ("{0,-38} {1,11}  {2,10:N0} files" -f $Label, (Format-GiB $stats.Bytes), $stats.Files)
  return $stats
}

function Remove-ManagedDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)

  $fullPath = Assert-WorkspaceChild $Path
  if (-not (Test-Path -LiteralPath $fullPath)) { return }
  $item = Get-Item -LiteralPath $fullPath -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing to recursively remove a reparse point: $fullPath"
  }

  for ($attempt = 1; $attempt -le 12; $attempt += 1) {
    try {
      Remove-Item -LiteralPath $fullPath -Recurse -Force -ErrorAction Stop
      return
    } catch {
      if ($attempt -eq 12) { throw }
      Start-Sleep -Milliseconds 250
    }
  }
}

function Test-ProfileInUse {
  param([string]$ProfilePath, [object[]]$Processes)

  foreach ($process in $Processes) {
    if ($process.CommandLine -and $process.CommandLine.IndexOf($ProfilePath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
      return $true
    }
  }
  return $false
}

function Remove-KnownEphemeralLog {
  param([Parameter(Mandatory = $true)][string]$Path)

  $fullPath = Assert-WorkspaceChild $Path
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { return $false }
  $parent = [System.IO.Path]::GetDirectoryName($fullPath)
  $allowedNames = @("gui-dev-server.log", "gui-dev-server.err.log")
  if (-not $parent.Equals($tmpRoot, [System.StringComparison]::OrdinalIgnoreCase) -or [System.IO.Path]::GetFileName($fullPath) -notin $allowedNames) {
    throw "Unexpected ephemeral log path: $fullPath"
  }

  $file = Get-Item -LiteralPath $fullPath -Force
  if ($file.LastWriteTimeUtc -gt [DateTime]::UtcNow.AddMinutes(-5)) {
    Write-Warning "Leaving recently written development log in place: $fullPath"
    return $false
  }
  try {
    Remove-Item -LiteralPath $fullPath -Force -ErrorAction Stop
    return $true
  } catch {
    Write-Warning "Leaving development log that may still be open: $fullPath"
    return $false
  }
}

function Clean-EphemeralBrowserProfiles {
  if (-not (Test-Path -LiteralPath $tmpRoot)) { return }
  $processes = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine })
  $candidates = @(Get-ChildItem -LiteralPath $tmpRoot -Directory -Force | Where-Object { $_.Name -like "manual-gallery-edge-*" })

  $removed = 0
  $skipped = 0
  foreach ($candidate in $candidates) {
    $fullPath = Assert-WorkspaceChild $candidate.FullName
    $parent = [System.IO.Path]::GetDirectoryName($fullPath)
    $isManualProfile = $parent.Equals($tmpRoot, [System.StringComparison]::OrdinalIgnoreCase) -and $candidate.Name.StartsWith("manual-gallery-edge-", [System.StringComparison]::OrdinalIgnoreCase)
    $isPerformanceProfile = $parent.Equals($performanceProfileRoot, [System.StringComparison]::OrdinalIgnoreCase)
    if (-not ($isManualProfile -or $isPerformanceProfile)) {
      throw "Unexpected browser profile path: $fullPath"
    }
    if (Test-ProfileInUse $fullPath $processes) {
      Write-Warning "Leaving active browser profile in place: $fullPath"
      $skipped += 1
      continue
    }
    Remove-ManagedDirectory $fullPath
    $removed += 1
  }

  if (Test-Path -LiteralPath $performanceProfileRoot) {
    if (-not (Test-ProfileInUse $performanceProfileRoot $processes)) {
      $profileCount = @(Get-ChildItem -LiteralPath $performanceProfileRoot -Directory -Force).Count
      Remove-ManagedDirectory $performanceProfileRoot
      $removed += $profileCount
    } else {
      foreach ($candidate in @(Get-ChildItem -LiteralPath $performanceProfileRoot -Directory -Force)) {
        if (Test-ProfileInUse $candidate.FullName $processes) {
          Write-Warning "Leaving active browser profile in place: $($candidate.FullName)"
          $skipped += 1
        } else {
          Remove-ManagedDirectory $candidate.FullName
          $removed += 1
        }
      }
    }
  }
  foreach ($logName in @("gui-dev-server.log", "gui-dev-server.err.log")) {
    if (Remove-KnownEphemeralLog (Join-Path $tmpRoot $logName)) {
      $removed += 1
    }
  }
  Write-Host "Removed $removed ephemeral entries; skipped $skipped active browser profiles."
}

if ($CleanEphemeral) {
  Clean-EphemeralBrowserProfiles
}

if ($CleanCargo) {
  $activeRustProcesses = @(Get-Process -Name cargo, rustc -ErrorAction SilentlyContinue)
  if ($activeRustProcesses.Count -gt 0) {
    throw "Refusing to clean src-tauri/target while cargo or rustc is running."
  }
  if ((Assert-WorkspaceChild $cargoTarget) -ne [System.IO.Path]::GetFullPath((Join-Path $repoRoot "src-tauri\target"))) {
    throw "Unexpected Cargo target path."
  }
  Write-Host "Cleaning reproducible Rust build output in $cargoTarget"
  Remove-ManagedDirectory $cargoTarget
}

Write-Host ""
Write-Host "Providence workspace storage"
Write-Host "----------------------------"
$targetStats = Show-TreeStats "Rust/Tauri build output" $cargoTarget
$tmpStats = Show-TreeStats "Repository tmp" $tmpRoot
Show-TreeStats "  performance Edge profiles" $performanceProfileRoot | Out-Null
Show-TreeStats "  redirected GUI dev-server log" (Join-Path $tmpRoot "gui-dev-server.log") | Out-Null
Show-TreeStats "  oracle run evidence" (Join-Path $tmpRoot "oracle-runs") | Out-Null
Show-TreeStats "  editor smoke evidence" (Join-Path $tmpRoot "editor-smoke-runs") | Out-Null

$manualProfileCount = 0
if (Test-Path -LiteralPath $tmpRoot) {
  $manualProfileCount = @(Get-ChildItem -LiteralPath $tmpRoot -Directory -Force | Where-Object { $_.Name -like "manual-gallery-edge-*" }).Count
}
Write-Host ("{0,-38} {1,11}" -f "  manual-gallery Edge profiles", "$manualProfileCount dirs")

if ($targetStats.Bytes -gt 30GB) {
  Write-Warning "src-tauri/target exceeds 30 GiB. Run npm run clean:storage:deep when you no longer need incremental build output."
}
if ($tmpStats.Bytes -gt 20GB) {
  Write-Warning "tmp exceeds 20 GiB. Oracle and editor-smoke evidence are intentionally retained; review them before applying a retention policy."
}
