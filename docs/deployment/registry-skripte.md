# Registry-Skripte (ohne GPO/Intune, z. B. RMM) und Entfernen

Ordner `enterprise/`. Windows PowerShell 5.1, als Administrator. Ausführungsrichtlinie: lokale Skripte müssen erlaubt sein (Standard auf Windows Server: `RemoteSigned`); RMM-Werkzeuge und Intune führen Skripte selbst aus.

| Skript | Zweck |
|---|---|
| `Deploy-Policy.ps1 -ExtensionId <ID> -PolicyJson <datei> [-Browser Edge,Chrome] [-UpdateUrl https://…]` | Richtlinie schreiben; mit `-UpdateUrl` zusätzlich **einen** eigenen Forcelist-Eintrag an der nächsten freien Nummer anhängen |
| `Detect-Policy.ps1 -ExtensionId <ID> [-RequireForcelist]` | nur lesen, Exit 0/1 |
| `Remove-Policy.ps1 -ExtensionId <ID>` | eigenen Richtlinien-Schlüssel und eigene Forcelist-Einträge entfernen |

Immer zuerst mit `-WhatIf` (zeigt, was geändert würde) bzw. `-PlanOnly` (listet alle geplanten Registry-Werte, ohne Adminrechte):
```powershell
.\Deploy-Policy.ps1 -ExtensionId lefajbhockjgdhaohnacgaggfepianjh -PolicyJson .\example-policy.json -PlanOnly
.\Deploy-Policy.ps1 -ExtensionId lefajbhockjgdhaohnacgaggfepianjh -PolicyJson .\example-policy.json -WhatIf
```

Beispiel nur für die KI-Lenkung (freigegebene KI vorschlagen, Hinweis bzw. Sperre auf anderen KI-Seiten): `example-ki-lenkung.json`, siehe [Erlaubte KI-Tools](../ki-seiten.md#powershell-ohne-gpointune-zb-per-rmm).

Schutzmassnahmen: Validierung gegen `managed_schema.json` vor jedem Schreiben; `.reg`-Sicherung nach `%ProgramData%\DlxPolicyBackup` (Ordner nur Administratoren/SYSTEM, Abbruch bei Junction/Symlink oder fremdem Besitzer); fremde Forcelist-Einträge werden nie geändert oder gelöscht.

Registry-Format (wie Chrome/Edge es für Erweiterungs-Richtlinien erwarten): Objekt = Unterschlüssel, Liste = Unterschlüssel mit Werten `1`…`n`, Wahr/Falsch = `REG_DWORD` 0/1, Text = `REG_SZ`.

## Entfernen von Hand
Erweiterung im Browser entfernen (bei Forcelist zuerst den Eintrag löschen), dann `Remove-Policy.ps1`. Lokale Zähler verschwinden mit der Erweiterung.
