Option Explicit

Dim shell, fso, projectPath, psCommand, fullCommand
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectPath = fso.GetParentFolderName(WScript.ScriptFullName)
projectPath = Replace(projectPath, "'", "''")

psCommand = "$wd='" & projectPath & "'; " & _
  "$php=(Get-Command php -ErrorAction SilentlyContinue).Source; " & _
  "if(-not $php){exit 1}; " & _
  "$pids=(netstat -ano | Select-String ':8000' | Select-String 'LISTENING' | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique); " & _
  "foreach($pid in $pids){Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue}; " & _
  "Start-Sleep -Milliseconds 500; " & _
  "Start-Process -FilePath $php -ArgumentList @('-S','0.0.0.0:8000') -WorkingDirectory $wd -WindowStyle Hidden; " & _
  "Start-Sleep -Milliseconds 900; " & _
  "Start-Process 'http://localhost:8000'"

fullCommand = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command """ & psCommand & """"
shell.Run fullCommand, 0, False
