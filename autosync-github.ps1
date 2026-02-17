param(
  [string]$RepoPath = $PSScriptRoot,
  [int]$DebounceSeconds = 4
)

$ErrorActionPreference = "Stop"

function Write-Log {
  param([string]$Text)
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[$stamp] $Text"
}

function Invoke-GitSync {
  param([string]$Path)

  Push-Location $Path
  try {
    git add -A

    $staged = git diff --cached --name-only
    if (-not $staged) {
      return
    }

    $message = "auto-sync: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    git commit -m $message | Out-Null
    git push origin HEAD | Out-Null

    Write-Log "Synced to GitHub."
  }
  catch {
    Write-Log "Sync failed: $($_.Exception.Message)"
  }
  finally {
    Pop-Location
  }
}

if (-not (Test-Path (Join-Path $RepoPath ".git"))) {
  throw "Not a git repository: $RepoPath"
}

Push-Location $RepoPath
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Pop-Location

Write-Log "Git autosync started."
Write-Log "Repo: $RepoPath"
Write-Log "Branch: $branch"
Write-Log "Debounce: $DebounceSeconds second(s)"
Write-Log "Press Ctrl+C to stop."

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $RepoPath
$watcher.Filter = "*.*"
$watcher.IncludeSubdirectories = $true
$watcher.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite, DirectoryName, CreationTime'
$watcher.EnableRaisingEvents = $true

$script:pending = $false
$script:lastChange = Get-Date

$onChange = {
  param($sender, $eventArgs)
  $fullPath = $eventArgs.FullPath

  if ($fullPath -match "\\\.git\\") { return }
  if ($fullPath -match "\\data\\.*\.sqlite") { return }

  $script:pending = $true
  $script:lastChange = Get-Date
}

$subs = @(
  Register-ObjectEvent $watcher Changed -Action $onChange,
  Register-ObjectEvent $watcher Created -Action $onChange,
  Register-ObjectEvent $watcher Deleted -Action $onChange,
  Register-ObjectEvent $watcher Renamed -Action $onChange
)

try {
  while ($true) {
    Start-Sleep -Seconds 1

    if ($script:pending) {
      $elapsed = (Get-Date) - $script:lastChange
      if ($elapsed.TotalSeconds -ge $DebounceSeconds) {
        $script:pending = $false
        Invoke-GitSync -Path $RepoPath
      }
    }
  }
}
finally {
  foreach ($sub in $subs) {
    Unregister-Event -SubscriptionId $sub.Id -ErrorAction SilentlyContinue
    Remove-Job -Id $sub.Id -Force -ErrorAction SilentlyContinue
  }
  $watcher.Dispose()
}
