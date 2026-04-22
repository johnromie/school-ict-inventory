Option Explicit

Dim shell, fso, projectPath, psCommand, fullCommand
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectPath = fso.GetParentFolderName(WScript.ScriptFullName)
projectPath = Replace(projectPath, "'", "''")

psCommand = "$wd='" & projectPath & "'; " & _
  "$node=(Get-Command node -ErrorAction SilentlyContinue).Source; " & _
  "$npm=(Get-Command npm -ErrorAction SilentlyContinue).Source; " & _
  "if(-not $node -or -not $npm){exit 1}; " & _
  "if(-not (Test-Path (Join-Path $wd 'node_modules'))){ Push-Location $wd; & $npm install | Out-Null; Pop-Location }; " & _
  "$pids=(netstat -ano | Select-String ':8000' | Select-String 'LISTENING' | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique); " & _
  "foreach($pid in $pids){Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue}; " & _
  "Start-Sleep -Milliseconds 500; " & _
  "Start-Process -FilePath $node -ArgumentList @('server.js') -WorkingDirectory $wd -WindowStyle Hidden; " & _
  "Start-Sleep -Milliseconds 900; " & _
  "Start-Process 'http://localhost:8000'"

fullCommand = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command """ & psCommand & """"
shell.Run fullCommand, 0, False
