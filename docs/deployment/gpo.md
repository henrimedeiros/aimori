# Deployment per Gruppenrichtlinie (ADMX)

Vorlagen: `enterprise/admx/` – je eine ADMX für Edge und Chrome, Sprachen `en-US`, `de-DE`, `fr-FR`, `it-IT`, `es-ES` und `pt-BR`. Sie schreiben nach
`HKLM\Software\Policies\Microsoft\Edge\3rdparty\extensions\<ID>\policy` bzw. `HKLM\Software\Policies\Google\Chrome\3rdparty\extensions\<ID>\policy` – genau dort liest der Browser die verwaltete Richtlinie der Erweiterung (`chrome.storage.managed`).

## Schritte
1. `dlx-edge.admx` / `dlx-chrome.admx` in den Central Store kopieren (`\\<domäne>\SYSVOL\<domäne>\Policies\PolicyDefinitions`), die ADML-Dateien in die gleichnamigen Sprach-Unterordner (`en-US`, `de-DE`, `fr-FR`, `it-IT`, `es-ES` und `pt-BR`; mindestens `en-US`, die Gruppenrichtlinien-Verwaltung zeigt die Sprache des Admin-Rechners und fällt sonst auf `en-US` zurück). Lokal: `C:\Windows\PolicyDefinitions`.
2. GPO bearbeiten → Computerkonfiguration → Administrative Vorlagen → „<Produktname> (Microsoft Edge)“ bzw. „(Google Chrome)“.
3. Einstellungen setzen ([Bedeutung](../einstellungen.md)). Listen (Länderpakete, erlaubte Seiten, Wörterbuch-Prüfsummen) werden je Zeile eingetragen; „Regeln je Datentyp“ als Name (Datentyp-ID) und Wert (`off`/`warn`/`redact`/`block`).
4. Erweiterung erzwingen: mit den Browser-Vorlagen von Microsoft/Google die Richtlinie `ExtensionInstallForcelist` (oder `ExtensionSettings`) setzen – Eintrag `<ID>;<Update-URL>` (Store-URL nach Veröffentlichung oder eigener Update-Server mit signiertem CRX).
5. `gpupdate /force`, dann im Browser `edge://policy` bzw. `chrome://policy` prüfen; die Erweiterung zeigt „Verwaltet von …“.

## Empfohlen zusätzlich (Browser-Richtlinien)
- `DeveloperToolsAvailability` = 2 für Benutzer ohne Entwicklerbedarf (wer DevTools oder die Erweiterungsverwaltung bedienen kann, kann den Schutz umgehen).
- Die Erweiterung per Forcelist installieren, damit sie nicht deaktiviert werden kann.
- KI-Desktop-Apps per AppLocker/Intune sperren, wenn nur der geschützte Browser genutzt werden soll.

## Andere Erweiterungs-ID
Vorlagen enthalten die Store-ID `lefajbhockjgdhaohnacgaggfepianjh` fest. Für die Entwicklungsfassung oder eine eigene CRX-ID: `node scripts/build-admx.mjs --id <id>` und die neuen Dateien verteilen.
