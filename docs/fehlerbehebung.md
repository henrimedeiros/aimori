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

## Testen
- `npm test` – Unit-Tests (Erkenner mit offiziellen Testwerten, Richtlinie, Service Worker, Manifest, Quelltext-Wächter, ADMX, PowerShell-Trockenlauf).
- `npm run check` – Manifest, Schema, Beispiel-JSON, ADMX aktuell.
- `npm run build` – ADMX/ADML und `docs/datentypen.md` neu erzeugen.
- E2E in Edge ohne Netz: `scripts/e2e/README.md`.
- Testdaten nur offizielle Beispiele oder erfundene Werte – nie echte Personen-, Kunden- oder Firmendaten, auch nicht auf echten KI-Seiten.
