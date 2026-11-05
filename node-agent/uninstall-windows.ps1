<#
  soundtube — désinstallation de l'agent de rendu vidéo (PowerShell en administrateur).
    .\uninstall-windows.ps1              # retire la tâche, les règles de pare-feu et le dossier
    .\uninstall-windows.ps1 -KeepFiles   # garde C:\ProgramData\soundtube-node (config.json, journal)
  Node.js et ffmpeg installés par winget ne sont pas retirés :
    winget uninstall Gyan.FFmpeg ; winget uninstall OpenJS.NodeJS.LTS
#>
#Requires -RunAsAdministrator
[CmdletBinding()]
param(
  [string]$InstallDir = (Join-Path $env:ProgramData 'soundtube-node'),
  [switch]$KeepFiles
)
$ErrorActionPreference = 'Continue'
$TaskName = 'soundtube-node'
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "tâche « $TaskName » supprimée"
}
# processus restants (agent et ffmpeg lancés depuis le dossier d'installation)
$dir = [regex]::Escape($InstallDir)
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -match $dir -and ($_.Name -eq 'node.exe' -or $_.Name -eq 'ffmpeg.exe') } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host "processus $($_.Name) ($($_.ProcessId)) arrêté" }
Get-NetFirewallRule -Group 'soundtube-node' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-Host 'règles de pare-feu soundtube-node supprimées'
if (-not $KeepFiles -and (Test-Path $InstallDir)) {
  Start-Sleep -Seconds 1
  Set-Location $env:TEMP
  Remove-Item -Recurse -Force $InstallDir
  Write-Host "$InstallDir supprimé"
}
Write-Host 'Pensez à retirer le nœud dans soundtube > Admin.'
