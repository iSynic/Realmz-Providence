function Invoke-WithProvidenceEditorHarnessLock {
  param(
    [scriptblock]$ScriptBlock,
    [int]$TimeoutSeconds = 600
  )

  $mutexName = "Local\RealmzProvidenceEditorHarness"
  $mutex = [System.Threading.Mutex]::new($false, $mutexName)
  $acquired = $false
  try {
    $acquired = $mutex.WaitOne([TimeSpan]::FromSeconds($TimeoutSeconds))
    if (-not $acquired) {
      throw "Timed out waiting for Providence editor harness lock '$mutexName' after $TimeoutSeconds second(s)."
    }
    & $ScriptBlock
  } finally {
    if ($acquired) {
      $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
  }
}

function Invoke-ProvidenceEditorHarness {
  param(
    [string]$ExePath,
    [string]$ScriptPath,
    [string]$ResultPath,
    [int]$LockTimeoutSeconds = 600
  )

  Invoke-WithProvidenceEditorHarnessLock -TimeoutSeconds $LockTimeoutSeconds -ScriptBlock {
    $env:PROVIDENCE_HARNESS = "1"
    $env:PROVIDENCE_HARNESS_SCRIPT = $ScriptPath
    $env:PROVIDENCE_HARNESS_RESULT = $ResultPath
    try {
      Start-Process -FilePath $ExePath -Wait -PassThru -WindowStyle Hidden
    } finally {
      Remove-Item Env:\PROVIDENCE_HARNESS -ErrorAction SilentlyContinue
      Remove-Item Env:\PROVIDENCE_HARNESS_SCRIPT -ErrorAction SilentlyContinue
      Remove-Item Env:\PROVIDENCE_HARNESS_RESULT -ErrorAction SilentlyContinue
    }
  }
}
