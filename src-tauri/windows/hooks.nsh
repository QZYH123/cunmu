; Installer hooks for 存目 (Tauri 2 NSIS, bundle.windows.nsis.installerHooks). Keep the UTF-8 BOM: makensis
; reads an included file without one in the system code page, and the paths below are Chinese.

; Test builds before the Latin folder name installed to %LOCALAPPDATA%\存目 with the uninstall key 存目.
; Run that uninstaller quietly first (it keeps the library: app data sits under the identifier, and a quiet
; uninstall never ticks "delete app data"), then clear what it leaves behind.
!macro NSIS_HOOK_PREINSTALL
  ${If} ${FileExists} "$LOCALAPPDATA\存目\uninstall.exe"
    DetailPrint "Removing the earlier install in $LOCALAPPDATA\存目"
    ExecWait '"$LOCALAPPDATA\存目\uninstall.exe" /S _?=$LOCALAPPDATA\存目'
    Delete "$LOCALAPPDATA\存目\uninstall.exe"
    RMDir "$LOCALAPPDATA\存目"
  ${EndIf}
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\存目"
  DeleteRegKey HKCU "Software\存目\存目"
  DeleteRegKey /ifempty HKCU "Software\存目"
!macroend
