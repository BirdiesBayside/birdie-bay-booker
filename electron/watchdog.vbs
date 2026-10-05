' Birdies Bay Controller - silent watchdog entry point.
' Task Scheduler runs: wscript.exe //B //Nologo "<resources>\watchdog.vbs"
' This launches watchdog.bat fully hidden (window style 0) so no console ever flashes.
Dim sh, fso, here
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & here & "\watchdog.bat""", 0, False
