@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'powershell' -and $_.CommandLine -like '*autosync-github.ps1*' }; foreach($p in $procs){ Invoke-CimMethod -InputObject $p -MethodName Terminate | Out-Null }; Write-Host 'GitHub autosync stopped.'"
