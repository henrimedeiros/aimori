<#
.SYNOPSIS
  Entfernt die verwaltete Richtlinie der Erweiterung und ihren eigenen Forcelist-Eintrag.
.DESCRIPTION
  Loescht nur ...\3rdparty\extensions\<ExtensionId> und Forcelist-Werte, deren Daten mit
  "<ExtensionId>;" beginnen. Fremde Eintraege bleiben unberuehrt. Vorher .reg-Sicherung.
  Unterstuetzt -WhatIf.
.EXAMPLE
  .\Remove-Policy.ps1 -ExtensionId hfgcdbigpgpdoegkhfbbbnibnkpdjkbb -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [ValidateSet('Edge', 'Chrome')][string[]]$Browser = @('Edge', 'Chrome'),
  [string]$BackupDir = (Join-Path $env:ProgramData 'DlxPolicyBackup')
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$BrowserRoot = @{ Edge = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'; Chrome = 'HKLM:\SOFTWARE\Policies\Google\Chrome' }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $WhatIfPreference -and -not $isAdmin) { throw 'Bitte als Administrator ausfuehren (HKLM).' }

# Sicherungsordner absichern: kein Junction/Symlink, Besitzer Administratoren oder
# SYSTEM; neu angelegt nur mit Vollzugriff fuer Administratoren und SYSTEM
# (Vererbung aus), damit Benutzer Sicherungen (inkl. Woerterbuch-Salz) nicht lesen
# und den Ordner nicht umbiegen koennen.
function Initialize-BackupDir([string]$dir) {
  $admins = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')
  $system = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @($admins, $system)) {
      $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    }
    $acl.SetOwner($admins)
    Set-Acl -LiteralPath $dir -AclObject $acl
  }
  $item = Get-Item -LiteralPath $dir -Force
  if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw "Sicherungsordner ist ein Link (Junction/Symlink): $dir" }
  $owner = (Get-Acl -LiteralPath $dir).GetOwner([System.Security.Principal.SecurityIdentifier]).Value
  if ($owner -ne $admins.Value -and $owner -ne $system.Value) { throw "Sicherungsordner gehoert nicht Administratoren/SYSTEM: $dir" }
}

function Backup-Key([string]$psPath, [string]$label) {
  if (-not (Test-Path $psPath)) { return }
  Initialize-BackupDir $BackupDir
  $file = Join-Path $BackupDir ("{0}-{1}.reg" -f $label, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  & reg.exe export ($psPath -replace '^HKLM:\\', 'HKLM\') $file /y | Out-Null
}

foreach ($b in $Browser) {
  $root = $BrowserRoot[$b]
  $extKey = "$root\3rdparty\extensions\$ExtensionId"
  if ((Test-Path $extKey) -and $PSCmdlet.ShouldProcess($extKey, 'Richtlinie entfernen')) {
    Backup-Key $extKey "$b-$ExtensionId"
    Remove-Item -Path $extKey -Recurse -Force
  }
  $fl = "$root\ExtensionInstallForcelist"
  if (Test-Path $fl) {
    foreach ($name in (Get-Item $fl).Property) {
      $data = [string](Get-ItemPropertyValue -Path $fl -Name $name)
      if ($data -like "$ExtensionId;*" -and $PSCmdlet.ShouldProcess("$fl\$name", 'Forcelist-Eintrag entfernen')) {
        Backup-Key $fl "$b-Forcelist"
        Remove-ItemProperty -Path $fl -Name $name
      }
    }
  }
}
