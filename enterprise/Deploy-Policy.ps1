<#
.SYNOPSIS
  Schreibt die verwaltete Richtlinie (Whitelabel und Einstellungen) der Browser-Erweiterung
  fuer Edge und/oder Chrome in die Registry (HKLM) - ohne Gruppenrichtlinien-Infrastruktur.

.DESCRIPTION
  - Validiert die JSON-Datei gegen extension\managed_schema.json (unbekannte Schluessel,
    Typen, erlaubte Werte, Muster) und bricht bei Fehlern ab.
  - Sichert vorhandene Werte vorher als .reg-Datei (reg.exe export).
  - Ersetzt nur den eigenen Schluessel ...\3rdparty\extensions\<ExtensionId>\policy.
  - Optional (-UpdateUrl): haengt EINEN eigenen Eintrag an ExtensionInstallForcelist an
    (naechste freie Nummer); fremde Eintraege werden nie geaendert oder geloescht.
  - Unterstuetzt -WhatIf. -PlanOnly gibt nur die geplanten Registry-Werte aus.
  Registry-Format wie von Chrome/Edge fuer 3rd-party-Richtlinien erwartet:
  Objekt = Unterschluessel, Liste = Unterschluessel mit Werten "1".."n",
  Wahrheitswert = REG_DWORD 0/1, Text = REG_SZ.

.EXAMPLE
  .\Deploy-Policy.ps1 -ExtensionId lefajbhockjgdhaohnacgaggfepianjh -PolicyJson .\example-policy.json -WhatIf
.EXAMPLE
  .\Deploy-Policy.ps1 -ExtensionId <id> -PolicyJson .\policy.json -Browser Edge
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [Parameter(Mandatory = $true)][string]$PolicyJson,
  [ValidateSet('Edge', 'Chrome')][string[]]$Browser = @('Edge', 'Chrome'),
  [ValidatePattern('^https://[^\s;]+$')][string]$UpdateUrl,
  [string]$SchemaPath,
  [string]$BackupDir = (Join-Path $env:ProgramData 'DlxPolicyBackup'),
  [switch]$PlanOnly
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$BrowserRoot = @{
  Edge   = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
  Chrome = 'HKLM:\SOFTWARE\Policies\Google\Chrome'
}

function Get-Kind($v) {
  if ($null -eq $v) { return 'null' }
  if ($v -is [bool]) { return 'boolean' }
  if ($v -is [string]) { return 'string' }
  if ($v -is [int] -or $v -is [long]) { return 'integer' }
  if ($v -is [System.Array]) { return 'array' }
  if ($v -is [System.Management.Automation.PSCustomObject]) { return 'object' }
  return 'unknown'
}

# Pruefung gegen die Teilmenge von JSON Schema, die managed_schema.json nutzt.
function Test-Schema($schema, $value, [string]$path) {
  $errors = @()
  $kind = Get-Kind $value
  if ($schema.type -and $schema.type -ne $kind) { return @("${path}: Typ $kind, erwartet $($schema.type)") }
  if ($schema.PSObject.Properties['enum'] -and -not ($schema.enum -ccontains $value)) { $errors += "${path}: Wert nicht erlaubt" }
  if ($schema.PSObject.Properties['pattern'] -and $kind -eq 'string' -and $value -notmatch $schema.pattern) { $errors += "${path}: Muster verletzt" }
  if ($kind -eq 'array' -and $schema.PSObject.Properties['items']) {
    for ($i = 0; $i -lt $value.Count; $i++) { $errors += Test-Schema $schema.items $value[$i] "$path[$i]" }
  }
  if ($kind -eq 'object') {
    foreach ($p in $value.PSObject.Properties) {
      if ($schema.PSObject.Properties['properties'] -and $schema.properties.PSObject.Properties[$p.Name]) {
        $errors += Test-Schema $schema.properties.($p.Name) $p.Value "$path.$($p.Name)"; continue
      }
      $matched = $false
      if ($schema.PSObject.Properties['patternProperties']) {
        foreach ($pp in $schema.patternProperties.PSObject.Properties) {
          if ($p.Name -cmatch $pp.Name) { $errors += Test-Schema $pp.Value $p.Value "$path.$($p.Name)"; $matched = $true; break }
        }
      }
      if (-not $matched) { $errors += "$path.$($p.Name): unbekannte Eigenschaft" }
    }
  }
  return $errors
}

# Plant Registry-Werte: Liste von @{ Key; Name; Type; Value }.
function ConvertTo-RegistryPlan($value, [string]$key) {
  $plan = @()
  foreach ($p in $value.PSObject.Properties) {
    $v = $p.Value
    switch (Get-Kind $v) {
      'boolean' { $plan += @{ Key = $key; Name = $p.Name; Type = 'DWord'; Value = [int]$v } }
      'integer' { $plan += @{ Key = $key; Name = $p.Name; Type = 'DWord'; Value = [int]$v } }
      'string'  { $plan += @{ Key = $key; Name = $p.Name; Type = 'String'; Value = $v } }
      'array'   {
        $sub = "$key\$($p.Name)"
        $plan += @{ Key = $sub; Name = $null; Type = 'Key'; Value = $null }
        for ($i = 0; $i -lt $v.Count; $i++) { $plan += @{ Key = $sub; Name = [string]($i + 1); Type = 'String'; Value = [string]$v[$i] } }
      }
      'object'  {
        $sub = "$key\$($p.Name)"
        $plan += @{ Key = $sub; Name = $null; Type = 'Key'; Value = $null }
        $plan += ConvertTo-RegistryPlan $v $sub
      }
      default { throw "Nicht unterstuetzter Wert: $($p.Name)" }
    }
  }
  return $plan
}

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
  $regPath = $psPath -replace '^HKLM:\\', 'HKLM\'
  & reg.exe export $regPath $file /y | Out-Null
  Write-Verbose "Sicherung: $file"
}

# --- Ablauf ---------------------------------------------------------------------
if (-not $SchemaPath) { $SchemaPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\extension\managed_schema.json' }
$schema = Get-Content -Raw -Encoding UTF8 -Path $SchemaPath | ConvertFrom-Json
$policy = Get-Content -Raw -Encoding UTF8 -Path $PolicyJson | ConvertFrom-Json
$errors = @(Test-Schema $schema $policy '$')
if ($errors.Count -gt 0) { throw ("Richtlinie ungueltig:`n" + ($errors -join "`n")) }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $PlanOnly -and -not $WhatIfPreference -and -not $isAdmin) { throw 'Bitte als Administrator ausfuehren (HKLM).' }

foreach ($b in $Browser) {
  $root = $BrowserRoot[$b]
  $extKey = "$root\3rdparty\extensions\$ExtensionId"
  $polKey = "$extKey\policy"
  $plan = @(ConvertTo-RegistryPlan $policy $polKey)

  if ($PlanOnly) {
    foreach ($e in $plan) {
      if ($e.Type -eq 'Key') { continue }
      $shown = [string]$e.Value
      if ($shown.Length -gt 60) { $shown = $shown.Substring(0, 60) + '...' }
      Write-Output ("{0} | {1} | {2} | {3}" -f $e.Key, $e.Name, $e.Type, $shown)
    }
    if ($UpdateUrl) { Write-Output ("{0}\ExtensionInstallForcelist | <naechste freie Nummer> | String | {1};{2}" -f $root, $ExtensionId, $UpdateUrl) }
    continue
  }

  if ($PSCmdlet.ShouldProcess($polKey, 'Richtlinie schreiben')) {
    Backup-Key $extKey "$b-$ExtensionId"
    if (Test-Path $polKey) { Remove-Item -Path $polKey -Recurse -Force }
    New-Item -Path $polKey -Force | Out-Null
    foreach ($e in $plan) {
      if ($e.Type -eq 'Key') { New-Item -Path $e.Key -Force | Out-Null; continue }
      New-ItemProperty -Path $e.Key -Name $e.Name -PropertyType $e.Type -Value $e.Value -Force | Out-Null
    }
  }

  if ($UpdateUrl) {
    $fl = "$root\ExtensionInstallForcelist"
    $entry = "$ExtensionId;$UpdateUrl"
    $existing = @()
    if (Test-Path $fl) { $existing = @((Get-Item $fl).Property | ForEach-Object { [pscustomobject]@{ Name = $_; Data = (Get-ItemPropertyValue -Path $fl -Name $_) } }) }
    if ($existing | Where-Object { [string]$_.Data -like "$ExtensionId;*" }) {
      Write-Verbose "Forcelist enthaelt die Erweiterung bereits ($b)."
    } elseif ($PSCmdlet.ShouldProcess($fl, "Eintrag anhaengen: $entry")) {
      Backup-Key $fl "$b-Forcelist"
      if (-not (Test-Path $fl)) { New-Item -Path $fl -Force | Out-Null }
      $n = 1
      while ($existing | Where-Object { $_.Name -eq [string]$n }) { $n++ }
      New-ItemProperty -Path $fl -Name ([string]$n) -PropertyType String -Value $entry -Force | Out-Null
    }
  }
}
