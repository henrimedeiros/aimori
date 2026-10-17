<#
.SYNOPSIS
  Erkennungsskript (z. B. fuer Intune Win32-Apps/Remediations): prueft, ob die verwaltete
  Richtlinie der Erweiterung fuer die gewaehlten Browser gesetzt ist.
.DESCRIPTION
  Nur lesend. Exit 0 = vorhanden (Ausgabe "Installed"), Exit 1 = fehlt.
  Mit -RequireForcelist muss zusaetzlich ein eigener Forcelist-Eintrag vorhanden sein.
.EXAMPLE
  .\Detect-Policy.ps1 -ExtensionId hfgcdbigpgpdoegkhfbbbnibnkpdjkbb -Browser Edge
#>
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [ValidateSet('Edge', 'Chrome')][string[]]$Browser = @('Edge', 'Chrome'),
  [switch]$RequireForcelist
)

$BrowserRoot = @{ Edge = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'; Chrome = 'HKLM:\SOFTWARE\Policies\Google\Chrome' }
foreach ($b in $Browser) {
  $root = $BrowserRoot[$b]
  if (-not (Test-Path "$root\3rdparty\extensions\$ExtensionId\policy")) { exit 1 }
  if ($RequireForcelist) {
    $fl = "$root\ExtensionInstallForcelist"
    if (-not (Test-Path $fl)) { exit 1 }
    $found = $false
    foreach ($name in (Get-Item $fl).Property) { if ([string](Get-ItemPropertyValue -Path $fl -Name $name) -like "$ExtensionId;*") { $found = $true } }
    if (-not $found) { exit 1 }
  }
}
Write-Output 'Installed'
exit 0
