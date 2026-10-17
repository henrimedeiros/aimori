# Design-Review: Länderwahl genauer, Paket Brasilien, copilot.com (14.10.2026)

Überarbeitung 14.10.2026. Sicherheits-Review vor dem Bauen: **FREIGEGEBEN MIT AUFLAGEN**. Umsetzungsorte je Auflage:

| Nr | Auflage (gekürzt) | Umsetzung |
|----|-------------------|-----------|
| 1 | Zeitzone nur über `Intl…resolvedOptions().timeZone` in try/catch, nur im Speicher, nicht in Storage/Logs/cfg | unverändert `extension/background.js`; Test `tests/laender.test.mjs` „cfg … enthält weder Zeitzone noch Sprachen“ |
| 2 | „Erste Sprache“ eindeutig: erster parsbarer Eintrag; hat er keine Region, kein Ausweichen auf Folgesprachen (ausser Zeitzone liefert kein Land) | `detectCountries` in `extension/common/policy.js`; Tests „Folgesprachen“ |
| 3 | US aus Folgesprachen hart ausgeschlossen, auch bei UTC/unbekannter Zone | `policy.js` (`FOLLOW_SKIP`); eigener Test |
| 4 | Mehrdeutige Zonen nur über feste Liste, kein Präfix | `TZ_TABLE` (Einträge mit mehreren Kürzeln); Test „mehrdeutige Zonen“ |
| 5 | Richtlinie `countryPacks` behält Vorrang, globale Pakete bleiben aktiv | bestehende Tests „Richtlinie …“, neu mit BR |
| 6 | Pflichtfälle: CH+`de-CH,en-US` → CH ohne US; UTC+`de-CH,en-US` → CH ohne US; US-Zone → US; Ausnahme → Rückfall; Busingen+`de-CH` → CH | `tests/laender.test.mjs` |
| 7 | Regex begrenzt (Wortgrenzen, feste Längen), Lasttest | `extension/engine/packs-country.js` (BR); `tests/brasilien.test.mjs` Lasttest |
| 8 | CNPJ: Gewichte 5…2/9…2 bzw. 6…2/9…2, Rest < 2 → 0; 12 Stellen `[0-9A-Z]`, 2 Ziffern; Wert = ASCII − 48; keine Kleinbuchstaben; alphanumerisch/unformatiert nur mit Kontext; Receita-Beispiel `12.ABC.345/01DE-35` | `brCnpj` + Detektor `br_cnpj`; Tests |
| 9 | Gleiche Ziffern/Zeichen bei CPF und CNPJ verworfen | `brCpf`, `brCnpj`; Tests |
| 10 | Telefon: feste DDD-Positivliste, mobil 9 Stellen mit 9, Festnetz 8 Stellen mit 2–5, weak | `brTelValid`; Tests |
| 11 | Gegenproben: falsche Prüfziffer, Wiederholungsziffern, 11/14 Ziffern ohne Kontext, CEP ohne Kontext, 14-stellige Hex/Base36 | `tests/brasilien.test.mjs` |
| 12 | Trefferwerte nie gespeichert/geloggt; Testdaten nur dokumentierte Beispielwerte | keine Änderung an Statistik/Logs; Testwerte siehe `docs/datentypen-quellen.md` |
| 13 | ADMX nur per Generator; Test enum = COUNTRY = ADMX | `npm run build`; Test in `tests/brasilien.test.mjs` |
| 14 | Genau `https://copilot.com/*` (content_scripts, web_accessible_resources), frame-ancestors genau `https://copilot.com`; Test exakt | `extension/manifest.json`; `tests/manifest.test.mjs` |
| 15 | Ohne Selektor-Treffer sichtbar „Schutz nicht aktiv“ | bestehendes Verhalten `content.js`; E2E/Content-Test |
| 16 | E2E: frisches Profil, `MAP * ~NOTFOUND`, Server nur 127.0.0.1, keine echte Seite | `scripts/e2e/e2e.mjs` (unverändertes Gerüst) |
| 17 | Release-Hinweis: neuer Host = Rechte-Erweiterung, Browser kann deaktivieren bis Zustimmung (nicht bei Richtlinien-Installation); Hosts in einem Release bündeln | `docs/installation.md` |

`www.copilot.com` bewusst **nicht** aufgenommen (Least Privilege); erst, wenn nachgewiesen ist, dass www die App ohne Umleitung ausliefert.

Restrisiken (tief): weniger Pakete aktiv (wer in der Schweiz US-Daten verarbeitet, setzt US selbst oder per Richtlinie), Selektoren auf copilot.com können abweichen (Meldung „Schutz nicht aktiv“), copilot.com kann die Erweiterung über web_accessible_resources erkennen (`use_dynamic_url` gesetzt), Fehlalarme bei CEP/Telefon (Kontextpflicht, weak/tief).
