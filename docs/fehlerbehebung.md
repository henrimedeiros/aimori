# Fehlerbehebung und Testen

| Symptom | Ursache / Lösung |
|---|---|
| Rotes „!“ am Symbol | Eingabefeld oder Senden-Knopf der Seite nicht erkannt (Seitenumbau). Seitenadapter in `extension/content/adapters.js` nachführen. Mit `blockWhenInactive` sperrt die Erweiterung dann Senden/Einfügen. |
| Einstellung lässt sich nicht ändern | Per Richtlinie gesetzt (Schloss-Symbol). `edge://policy` → „Richtlinien neu laden“. |
| Richtlinie wirkt nicht | Erweiterungs-ID in ADMX/Registry passt nicht zur installierten ID (`edge://extensions`, Entwicklermodus zeigt die ID). Ungültige Felder werden einzeln verworfen – Werte mit `Deploy-Policy.ps1 -PlanOnly` gegen das Schema prüfen. |
| Logo fehlt | Nur `data:image/png` oder `data:image/svg+xml` als Base64, max. ca. 100 KB; URLs werden nicht geladen. |
| Fehlalarm | Datentyp per `rules` auf `off` oder `warn`; Typen ohne Prüfziffer melden ohnehin nur mit Kontextwort (z. B. „SSN“, „BSN“). Bitte Fehlalarme mit erfundenem Beispiel melden. |
| „Text konnte nicht geprüft werden“ | Eingabe über 200 000 Zeichen oder Prüfung länger als 150 ms → Warnung statt stillem Durchlassen. |
| „Trotzdem senden“ fehlt | `allowUserOverride=false` oder Aktion `redact`/`block`. Nach der Bestätigung innerhalb von 30 Sekunden erneut senden. |
| „Bereinigte Version hochladen“ fehlt | Aktion `block`, XLSX, Ganztext-Fund (Personentabelle, Fingerabdruck, versteckte Anweisung, nicht prüfbar), DOCX mit eingebetteten Objekten/Makros, oder ein Treffer steht ausserhalb des normalen Texts (nachverfolgte Änderungen, Feldcodes, Link-Ziele, Dokumenteigenschaften). Dann Datei selbst bereinigen (z. B. Änderungen annehmen) und neu hochladen. |
| Bereinigte PDF sieht anders aus | Gewollt: aus einer PDF entsteht eine reine Textfassung, Layout und Bilder gehen verloren. Wer das Layout braucht, bereinigt die Quelldatei (z. B. DOCX) und erzeugt die PDF neu. |
| PDF/DOCX „Text konnte nicht geprüft werden“ | Gescannte PDF ohne Textebene, verschlüsselte oder beschädigte Datei, über 20 MB, mehr als 5 Dateien oder Prüfung über 20 s. Die Datei wird nicht still durchgelassen; gescannte Seiten werden nicht per Texterkennung gelesen. |
| Bereinigte DOCX enthält noch Bilder/Schriften | Gewollt: nur Textstellen und Autor-Angaben werden geändert; Bilder (samt Bild-Metadaten) und eingebettete Schriften bleiben. Bilder vorher aus dem Dokument entfernen, wenn sie heikel sind. |

## Testen
- `npm test` – Unit-Tests (Erkenner mit offiziellen Testwerten, Richtlinie, Service Worker, Manifest, Quelltext-Wächter, ADMX, PowerShell-Trockenlauf).
- `npm run check` – Manifest, Schema, Beispiel-JSON, ADMX aktuell.
- `npm run build` – ADMX/ADML und `docs/datentypen.md` neu erzeugen.
- E2E in Edge ohne Netz: `scripts/e2e/README.md` (Dokumente: `E2E_NUR=dateien,bereinigen`).
- Testdaten nur offizielle Beispiele oder erfundene Werte – nie echte Personen-, Kunden- oder Firmendaten, auch nicht auf echten KI-Seiten.
