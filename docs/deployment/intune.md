# Deployment per Intune

Zwei Wege – beide setzen dieselben Registry-Werte wie die ADMX.

> **Microsoft Edge: nur Weg B.** Windows lässt importierte ADMX (und benutzerdefinierte OMA-URI-Profile, die eine ADMX laden) nicht unter `Software\Policies\Microsoft\…` schreiben. Die Werte der Erweiterung liegen für Edge unter `Software\Policies\Microsoft\Edge\3rdparty\…` – Intune meldet dann einen Fehler (Ereignisanzeige *DeviceManagement-Enterprise-Diagnostics-Provider*, „Blocked Registry Key“ bzw. 0x80070005), und `edge://policy` zeigt keine Werte der Erweiterung. Für Google Chrome (`Software\Policies\Google\Chrome\…`) gilt diese Sperre nicht.

## A) Importierte ADMX (nur Google Chrome, ohne Skript)
1. Intune Admin Center → Geräte → Konfiguration → „Importieren ADMX“: `dlx-chrome.admx` mit der passenden `en-US`-ADML hochladen (Intune nimmt je ADMX nur eine ADML; die Texte in fr-FR/it-IT/es-ES/pt-BR liegen für den Central Store bei).
2. Neues Profil → Windows 10 und höher → Vorlagen → **Importierte administrative Vorlagen** → Einstellungen unter „<Produktname> (Google Chrome)“ setzen.
3. Gerätegruppe zuweisen. Prüfen auf dem Gerät: `chrome://policy` → „Richtlinien neu laden“.

**Branding:** Felder, die leer bleiben, behalten den Standard. Ab Version 0.2.1 akzeptiert das Schema leere Felder; ältere Versionen haben das ganze Branding verworfen, wenn z. B. Logo oder Farben leer waren (`chrome://policy` zeigt dann „Fehler“ bzw. „Ungültig“ beim Branding).

## B) Plattform-Skript bzw. Win32-App mit Registry-Skript (Edge und Chrome)
- Paket: `enterprise/Deploy-Policy.ps1`, `extension/managed_schema.json` (Pfad per `-SchemaPath`) und die eigene `policy.json`.
- Installationsbefehl (als System): `powershell.exe -NoProfile -File Deploy-Policy.ps1 -ExtensionId <ID> -PolicyJson policy.json -SchemaPath managed_schema.json`
- Erkennung: `Detect-Policy.ps1 -ExtensionId <ID>` (Exit 0 = vorhanden).
- Deinstallation: `Remove-Policy.ps1 -ExtensionId <ID>`.
Das Skript prüft die JSON gegen das Schema und bricht bei Fehlern ab, sichert vorherige Werte nach `%ProgramData%\DlxPolicyBackup` (nur Administratoren/SYSTEM lesbar) und ändert nur den eigenen Schlüssel.

## Erweiterung installieren
Im Einstellungskatalog (Microsoft Edge bzw. Google Chrome) „Control which extensions are installed silently“ (`ExtensionInstallForcelist`) mit `<ID>;<Update-URL>`. Eine entpackte Entwicklungsfassung lässt sich nicht erzwingen – dafür braucht es Store-Veröffentlichung oder ein signiertes CRX mit Update-Server (Folgeschritt).

## Transparenz gegenüber Mitarbeitenden
Die Erweiterung zeigt „Verwaltet von <Firma>. Es werden keine Eingaben gespeichert oder gemeldet; diese Erweiterung hat keinen Netzwerkzugriff.“ Informieren Sie die Mitarbeitenden vor der Einführung (Art. 19 revDSG; bei Verhaltensüberwachung ArGV 3 Art. 26 beachten – diese Erweiterung meldet nichts).
