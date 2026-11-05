<#
  soundtube — installation de l'agent de rendu (musique + vidéo, v1.17.0) sur Windows 11 (PC avec carte NVIDIA RTX, NVENC).
  À lancer dans PowerShell **en administrateur**, depuis le dossier décompressé :

    Set-ExecutionPolicy -Scope Process Bypass -Force
    .\install-windows.ps1                       # sans jeton
    .\install-windows.ps1 -GenerateToken        # avec un jeton partagé généré (à recopier dans soundtube > Admin)
    .\install-windows.ps1 -Token "monjeton" -CtAddress 192.168.1.20
    .\install-windows.ps1 -AllowFrom 192.168.0.0/24        # CT sur un autre sous-réseau (routé) que le PC

  Pare-feu : par défaut, accès autorisé depuis le sous-réseau local ET les plages privées
  (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), pour qu'un CT sur 192.168.0.x joigne un PC en 192.168.2.x.
  -AllowFrom <liste CIDR> restreint (ou élargit) ; -CtAddress <IP> (ancienne option) reste accepté.

  Ce que fait le script (relançable sans risque, conserve config.json) :
    1. installe Node.js LTS et ffmpeg (build Gyan, avec NVENC) via winget si absents ;
    2. copie l'agent dans C:\ProgramData\soundtube-node (ffmpeg.exe copié dans .\ffmpeg) ;
    3. écrit config.json, détecte les encodeurs (h264_nvenc attendu, sinon libx264) ;
    4. crée la tâche planifiée « soundtube-node » (au démarrage, compte SYSTEM, redémarrage auto) ;
    5. ouvre le pare-feu en profil Privé uniquement : TCP 8765 (+ UDP 47811 pour la découverte) ;
    6. démarre l'agent et affiche l'adresse à saisir dans la page Admin de soundtube.
#>
#Requires -RunAsAdministrator
[CmdletBinding()]
param(
  [string]$InstallDir = (Join-Path $env:ProgramData 'soundtube-node'),
  [int]$Port = 8765,
  [string]$Token = '',
  [switch]$GenerateToken,
  [string]$Name = $env:COMPUTERNAME,
  [string]$FfmpegPath = '',
  [string]$CtAddress = '',
  [string[]]$AllowFrom = @(),
  [ValidateSet('', 'h264_nvenc', 'hevc_nvenc', 'h264_videotoolbox', 'libx264')][string]$Encoder = '',
  [switch]$NoDiscovery,
  [switch]$NoAudio,
  [int]$AudioSlots = 0,
  [switch]$SkipWinget
)
$ErrorActionPreference = 'Stop'
$TaskName = 'soundtube-node'
$FwGroup = 'soundtube-node'
$DiscoveryPort = 47811
function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Info($m) { Write-Host "    $m" }
function Warn($m) { Write-Host "    ATTENTION : $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "`nÉCHEC : $m" -ForegroundColor Red; exit 1 }

$src = $PSScriptRoot
foreach ($f in 'agent.mjs', 'render-core.mjs', 'audio.mjs', 'audio-worker.mjs', 'engine-id.mjs', 'package.json', 'core\ENGINE.json') { if (-not (Test-Path (Join-Path $src $f))) { Fail "fichier $f introuvable à côté du script (décompressez tout le zip)" } }

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Winget-Install($id, [switch]$Machine) {
  if ($SkipWinget) { return }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Fail "winget introuvable : installez « Programme d'installation d'application » (App Installer) depuis le Microsoft Store, ou passez -SkipWinget avec Node.js et ffmpeg déjà installés" }
  $a = @('install', '--id', $id, '-e', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity')
  if ($Machine) { $a += @('--scope', 'machine') }
  Info "winget $($a -join ' ')"
  & winget @a | Out-Host
  $code = $LASTEXITCODE
  if ($code -ne 0 -and $Machine) {
    Warn "winget (portée machine) a renvoyé $code, nouvel essai sans --scope"
    & winget @($a | Select-Object -First 7) | Out-Host
    $code = $LASTEXITCODE
  }
  if ($code -ne 0) { Warn "winget a renvoyé le code $code (déjà installé ou à jour ?) — on continue" }
  Refresh-Path
}
function Find-Node {
  $c = @()
  $g = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($g) { $c += $g.Source }
  $c += (Join-Path $env:ProgramFiles 'nodejs\node.exe')
  foreach ($p in $c) {
    if ($p -and (Test-Path $p)) {
      $v = (& $p -v) 2>$null
      if ($v -match '^v(\d+)\.' -and [int]$Matches[1] -ge 20) { return @{ Path = $p; Version = $v } }
    }
  }
  return $null
}
function Find-Ffmpeg {
  if ($FfmpegPath) { if (Test-Path $FfmpegPath) { return (Resolve-Path $FfmpegPath).Path } else { Fail "-FfmpegPath $FfmpegPath introuvable" } }
  $roots = @((Join-Path $env:ProgramFiles 'WinGet\Packages'), (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'))
  foreach ($r in $roots) {
    if (Test-Path $r) {
      $hit = Get-ChildItem -Path $r -Directory -Filter 'Gyan.FFmpeg*' -ErrorAction SilentlyContinue |
        ForEach-Object { Get-ChildItem -Path $_.FullName -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if ($hit) { return $hit.FullName }
    }
  }
  $g = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
  if ($g) { return $g.Source }
  return $null
}

# --- 1. Node.js LTS ------------------------------------------------------------------------------
Step 'Node.js LTS'
$node = Find-Node
if (-not $node) { Winget-Install 'OpenJS.NodeJS.LTS' -Machine; $node = Find-Node }
if (-not $node) { Fail 'Node.js ≥ 20 introuvable après installation (rouvrez PowerShell en administrateur et relancez le script)' }
Info "$($node.Version) : $($node.Path)"

# --- 2. ffmpeg (avec NVENC) ----------------------------------------------------------------------
Step 'ffmpeg'
$bundled = Join-Path $InstallDir 'ffmpeg\ffmpeg.exe'
$ff = Find-Ffmpeg
if (-not $ff -and -not $FfmpegPath) { Winget-Install 'Gyan.FFmpeg' -Machine; $ff = Find-Ffmpeg }
if (-not $ff -and (Test-Path $bundled)) { $ff = $bundled }
if (-not $ff) { Fail "ffmpeg introuvable : installez-le (winget install Gyan.FFmpeg) ou passez -FfmpegPath C:\chemin\ffmpeg.exe" }
Info "source : $ff"

# --- 3. Copie de l'agent -------------------------------------------------------------------------
Step "Copie dans $InstallDir"
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) { Info 'agent déjà installé : arrêt pour mise à jour'; Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
New-Item -ItemType Directory -Force -Path $InstallDir, (Join-Path $InstallDir 'ffmpeg'), (Join-Path $InstallDir 'work') | Out-Null
foreach ($f in 'agent.mjs', 'render-core.mjs', 'audio.mjs', 'audio-worker.mjs', 'engine-id.mjs', 'package.json', 'config.example.json', 'README.md', 'uninstall-windows.ps1', 'start-agent.cmd') {
  $p = Join-Path $src $f
  if ((Test-Path $p) -and ((Resolve-Path $p).Path -ne (Join-Path $InstallDir $f))) { Copy-Item $p -Destination $InstallDir -Force }
}
# v1.16.0 : moteur audio (copie exacte de celui du CT) — remplacé en entier à chaque installation
$coreDst = Join-Path $InstallDir 'core'
if ((Resolve-Path (Join-Path $src 'core')).Path -ne $coreDst) {
  if (Test-Path $coreDst) { Remove-Item $coreDst -Recurse -Force }
  Copy-Item (Join-Path $src 'core') -Destination $coreDst -Recurse -Force
}
$eng = Get-Content (Join-Path $coreDst 'ENGINE.json') -Raw | ConvertFrom-Json
Info "moteur audio : $($eng.version) · $($eng.hash)"
if ((Resolve-Path $ff).Path -ne $bundled) {
  Copy-Item $ff -Destination $bundled -Force
  $probe = Join-Path (Split-Path $ff) 'ffprobe.exe'
  if (Test-Path $probe) { Copy-Item $probe -Destination (Join-Path $InstallDir 'ffmpeg') -Force }
}
Info "ffmpeg : $bundled"

# --- 4. config.json ------------------------------------------------------------------------------
Step 'Configuration'
$cfgPath = Join-Path $InstallDir 'config.json'
$old = $null
if (Test-Path $cfgPath) { try { $old = Get-Content $cfgPath -Raw | ConvertFrom-Json } catch { Warn 'config.json illisible : recréé' } }
if ($GenerateToken) { $Token = -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }) }
elseif (-not $Token -and $old -and $old.token) { $Token = [string]$old.token; Info 'jeton existant conservé' }
$cfg = [ordered]@{
  port          = $Port
  name          = $Name
  token         = $Token
  ffmpeg        = $bundled
  workDir       = (Join-Path $InstallDir 'work')
  logFile       = (Join-Path $InstallDir 'agent.log')
  encoder       = $Encoder
  slots         = 0
  discovery     = (-not $NoDiscovery)
  discoveryPort = $DiscoveryPort
  maxUploadGB   = 8
  audio         = (-not $NoAudio)
  audioSlots    = $AudioSlots
  samplesDir    = (Join-Path $InstallDir 'work\samples')
}
if ($old -and $old.slots) { $cfg.slots = [int]$old.slots }
if ($old -and $old.audioSlots -and -not $AudioSlots) { $cfg.audioSlots = [int]$old.audioSlots }
[IO.File]::WriteAllText($cfgPath, ($cfg | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
Info $cfgPath

# --- 5. Détection des encodeurs ------------------------------------------------------------------
Step 'Encodeurs vidéo'
$detJson = (& $node.Path (Join-Path $InstallDir 'agent.mjs') --detect) -join "`n"
try { $det = $detJson | ConvertFrom-Json } catch { $det = $null }
if (-not $det -or -not $det.best) { Write-Host $detJson; Fail 'aucun encodeur utilisable (ffmpeg ne fonctionne pas ?)' }
Info "ffmpeg : $($det.version)"
Info "utilisables : $($det.working -join ', ')"
if ($det.best -like '*nvenc*') { Write-Host "    encodeur choisi : $($det.best) (carte NVIDIA)" -ForegroundColor Green }
else {
  Warn "NVENC indisponible, l'agent utilisera $($det.best) (processeur, plus lent)."
  if ($det.failed.h264_nvenc) { Info "raison NVENC : $($det.failed.h264_nvenc)" }
  Info 'RTX 50 (5070 Ti) : pilote NVIDIA ≥ 570 requis (GeForce Game Ready / Studio à jour), puis relancez ce script.'
}

# --- 6. Tâche planifiée (au démarrage, SYSTEM) ---------------------------------------------------
Step "Tâche planifiée « $TaskName »"
if ($existing) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
$action = New-ScheduledTaskAction -Execute $node.Path -Argument ('"' + (Join-Path $InstallDir 'agent.mjs') + '"') -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description 'soundtube — agent de rendu musique + vidéo (réseau local)' | Out-Null
Info 'créée : démarrage automatique avec Windows, relance en cas d''arrêt'

# --- 7. Pare-feu (profil Privé) ------------------------------------------------------------------
Step 'Pare-feu Windows (profil Privé)'
Get-NetFirewallRule -Group $FwGroup -ErrorAction SilentlyContinue | Remove-NetFirewallRule
# Sources autorisées : -AllowFrom (liste CIDR/IP, virgules acceptées) ; sinon -CtAddress seul (compatibilité) ;
# sinon sous-réseau local + plages privées RFC 1918 (CT et PC sur des sous-réseaux différents mais routés).
$DefaultAllow = @('LocalSubnet', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')
$list = @($AllowFrom | ForEach-Object { "$_" -split '[,;\s]+' } | Where-Object { $_ })
if ($list.Count -gt 0) { if ($CtAddress) { $list += $CtAddress } }
elseif ($CtAddress) { $list = @($CtAddress) }
else { $list = $DefaultAllow }
foreach ($a in $list) {
  if ($a -notmatch '^(LocalSubnet|LocalSubnet4|Any|\d{1,3}(\.\d{1,3}){3}(/\d{1,2})?|\d{1,3}(\.\d{1,3}){3}-\d{1,3}(\.\d{1,3}){3})$') {
    Fail "-AllowFrom : entrée invalide « $a » (attendu : 192.168.0.0/24, 192.168.0.20, LocalSubnet…)"
  }
}
$remote = @($list | Select-Object -Unique)
New-NetFirewallRule -DisplayName "soundtube-node (TCP $Port)" -Group $FwGroup -Direction Inbound -Protocol TCP -LocalPort $Port `
  -Action Allow -Profile Private -RemoteAddress $remote | Out-Null
Info "TCP $Port entrant autorisé depuis : $($remote -join ', ')"
if (-not $NoDiscovery) {
  New-NetFirewallRule -DisplayName "soundtube-node découverte (UDP $DiscoveryPort)" -Group $FwGroup -Direction Inbound -Protocol UDP `
    -LocalPort $DiscoveryPort -Action Allow -Profile Private -RemoteAddress $remote | Out-Null
  Info "UDP $DiscoveryPort (découverte) autorisé depuis : $($remote -join ', ')"
}
$pub = Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' }
foreach ($p in $pub) {
  Warn "le réseau « $($p.Name) » est en profil Public : les règles ne s'y appliquent pas."
  Info "  pour un réseau domestique de confiance : Set-NetConnectionProfile -InterfaceIndex $($p.InterfaceIndex) -NetworkCategory Private"
}

# --- 8. Démarrage et vérification ----------------------------------------------------------------
Step 'Démarrage'
Start-ScheduledTask -TaskName $TaskName
$headers = @{}; if ($Token) { $headers['Authorization'] = "Bearer $Token" }
$h = $null
for ($i = 0; $i -lt 30 -and -not $h; $i++) {
  Start-Sleep -Seconds 1
  try { $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -Headers $headers -TimeoutSec 3 } catch { }
}
if (-not $h) { Fail "l'agent ne répond pas sur le port $Port — voir $(Join-Path $InstallDir 'agent.log')" }
Write-Host "    agent en ligne : $($h.name) v$($h.version) — encodeur $($h.bestLabel), $($h.slots) rendu(s) en parallèle" -ForegroundColor Green
if ($h.audio -and $h.audio.ok) { Write-Host "    musique : oui — moteur $($h.audio.engine.version) · $($h.audio.engine.hash) (doit être identique à Admin > Répartition)" -ForegroundColor Green }
elseif ($NoAudio) { Info 'musique : désactivée (-NoAudio)' }
else { Warn "musique indisponible : $($h.audio.reason)" }

$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -ExpandProperty IPAddress
Write-Host "`nTerminé. Dans soundtube > Admin > Nœuds de rendu vidéo, ajoutez :" -ForegroundColor Cyan
foreach ($ip in $ips) { Write-Host "    http://$($ip):$Port" -ForegroundColor White }
if ($Token) { Write-Host "    jeton : $Token  (champ « jeton » du nœud, ou SOUNDTUBE_NODE_TOKEN sur le CT)" -ForegroundColor White }
Write-Host "    journal : $(Join-Path $InstallDir 'agent.log')"
Write-Host "    désinstaller : $(Join-Path $InstallDir 'uninstall-windows.ps1')"
