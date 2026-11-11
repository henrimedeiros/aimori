# Fehlerbehebung und Testen

| Symptom | Ursache / Lösung |
|---|---|
| Rotes „!“ am Symbol | Eingabefeld oder Senden-Knopf der Seite nicht erkannt (Seitenumbau). Seitenadapter in `extension/content/adapters.js` nachführen. Mit `blockWhenInactive` sperrt die Erweiterung dann Senden/Einfügen. |
| Einstellung lässt sich nicht ändern | Per Richtlinie gesetzt (Schloss-Symbol). `edge://policy` → „Richtlinien neu laden“. |
| Richtlinie wirkt nicht | Erweiterungs-ID in ADMX/Registry passt nicht zur installierten ID (`edge://extensions`, Entwicklermodus zeigt die ID). Ungültige Felder werden einzeln verworfen – Werte mit `Deploy-Policy.ps1 -PlanOnly` gegen das Schema prüfen. |
| Logo fehlt | Nur `data:image/png` oder `data:image/svg+xml` als Base64, max. ca. 100 KB; URLs werden nicht geladen. |
| Fehlalarm | Datentyp per `rules` auf `off` oder `warn`; Typen ohne Prüfziffer melden ohnehin nur mit Kontextwort (z. B. „SSN“, „BSN“). Bitte Fehlalarme mit erfundenem Beispiel melden. |
| „Text konnte nicht geprüft werden“ | Eingabe beim Senden oder Einfügen über 5 Millionen Zeichen, oder die Prüfung dauert länger als ihr Zeitbudget → Warnung statt stillem Durchlassen. Bis 1 Million Zeichen prüft die Erweiterung sofort (150 ms je angefangene 200 000 Zeichen, höchstens 750 ms). Darüber, bis 5 Millionen Zeichen, hält sie das Senden bzw. Einfügen kurz an und prüft in kleinen Schritten, damit die Seite bedienbar bleibt (höchstens 120 s, mit „wird lokal geprüft …“ und Abbrechen). Der Hinweis beim Tippen prüft bis 200 000 Zeichen; darüber erscheint er nicht, die Prüfung beim Senden läuft trotzdem. |
| Nach der Prüfung eines sehr langen Texts wird nicht gesendet | Ohne Fund klickt die Erweiterung einmal auf den erkannten Senden-Knopf. Erkennt sie keinen, erscheint „bitte jetzt noch einmal senden“; die nächste Sende-Geste geht dann durch (30 s lang, nur für genau diesen Text). Wurde der Text während der Prüfung geändert, wird nichts gesendet und neu geprüft. |
| „Trotzdem senden“ fehlt | `allowUserOverride=false` oder Aktion `redact`/`block`. Nach der Bestätigung innerhalb von 30 Sekunden erneut senden. |
| „Bereinigte Version hochladen“ fehlt | Aktion `block`, XLSX, Ganztext-Fund (Personentabelle, Fingerabdruck, versteckte Anweisung, nicht prüfbar), DOCX mit eingebetteten Objekten/Makros, oder ein Treffer steht ausserhalb des normalen Texts (nachverfolgte Änderungen, Feldcodes, Link-Ziele, Dokumenteigenschaften). Dann Datei selbst bereinigen (z. B. Änderungen annehmen) und neu hochladen. |
| Bereinigte PDF sieht anders aus | Normalerweise bleibt das Layout, nur die Treffer sind mit `X` überdeckt. Eine reine Textfassung ohne Layout entsteht nur, wenn die PDF sich nicht sicher an Ort und Stelle bearbeiten lässt (z. B. mehrfach gespeicherte Fassungen in der Datei, Treffer in Anmerkungen oder Formularfeldern); die Leiste nennt das vor dem Hochladen. Dann die Quelldatei (z. B. DOCX) bereinigen und die PDF neu erzeugen. |
| Wert in einer PDF nicht erkannt, weil Leerzeichen fehlen oder zu viel sind | Der Leser entscheidet nach den Zeichenbreiten der Schrift, ob zwischen zwei Textstücken eine Lücke ist. Ohne Breitenangabe in der Datei setzt er wie bisher ein Leerzeichen. |
| Dokument „zu lang für die vollständige Prüfung“ oder „konnte nicht vollständig geprüft werden“ | Gescannte PDF ohne Textebene, verschlüsselte oder beschädigte Datei, über 20 MB, PDF, Word oder Excel über 5 Millionen Zeichen, mehr als 5 Dateien oder Prüfung über 120 s. Die Datei wird nicht still durchgelassen; gescannte Seiten werden nicht per Texterkennung gelesen. |
| Bereinigte DOCX enthält noch Bilder/Schriften | Gewollt: nur Textstellen und Autor-Angaben werden geändert; Bilder (samt Bild-Metadaten) und eingebettete Schriften bleiben. Bilder vorher aus dem Dokument entfernen, wenn sie heikel sind. |

## Testen
- `npm test` – Unit-Tests (Erkenner mit offiziellen Testwerten, Richtlinie, Service Worker, Manifest, Quelltext-Wächter, ADMX, PowerShell-Trockenlauf).
- `npm run check` – Manifest, Schema, Beispiel-JSON, ADMX aktuell.
- `npm run build` – ADMX/ADML und `docs/datentypen.md` neu erzeugen.
- E2E in Edge ohne Netz: `scripts/e2e/README.md` (Dokumente: `E2E_NUR=dateien,bereinigen`).
- Testdaten nur offizielle Beispiele oder erfundene Werte – nie echte Personen-, Kunden- oder Firmendaten, auch nicht auf echten KI-Seiten.
