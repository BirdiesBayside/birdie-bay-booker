; Birdies Bay Controller - NSIS hooks for the silent watchdog task.
; NOTE: NSIS escapes quotes with $\" - a plain \" silently breaks /TR and the
; task is never created. Do not "fix" the escaping.

!macro customInstall
  ; Remove legacy visible-console tasks from older setups.
  nsExec::ExecToLog 'schtasks /Delete /F /TN "Bay Controller Watchdog"'
  nsExec::ExecToLog 'schtasks /Delete /F /TN "Birdies Bay Controller Watchdog"'

  ReadEnvStr $0 USERNAME
  nsExec::ExecToLog 'schtasks /Create /F /SC MINUTE /MO 1 /TN "Birdies Bay Controller Watchdog Silent" /TR "wscript.exe //B //Nologo $\"$INSTDIR\resources\watchdog.vbs$\"" /RU "$0" /IT'
  Pop $1
  ${If} $1 != 0
    ; Fallback without /RU (defaults to installing user)
    nsExec::ExecToLog 'schtasks /Create /F /SC MINUTE /MO 1 /TN "Birdies Bay Controller Watchdog Silent" /TR "wscript.exe //B //Nologo $\"$INSTDIR\resources\watchdog.vbs$\""'
  ${EndIf}
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'schtasks /Delete /F /TN "Birdies Bay Controller Watchdog Silent"'
  nsExec::ExecToLog 'schtasks /Delete /F /TN "Birdies Bay Controller Watchdog"'
  nsExec::ExecToLog 'schtasks /Delete /F /TN "Bay Controller Watchdog"'
!macroend
