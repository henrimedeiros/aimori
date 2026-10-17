# Design-Review: Nachweis-Bericht für Gesetze und Normen (16.10.2026)

Urteil Sicherheits-Review vor dem Bauen: **FREIGEGEBEN MIT AUFLAGEN**. Kein neues Recht, kein Netz, keine Abhängigkeit, nur Zahlen aus den bestehenden Tageszählern (90 Tage). Anlass (15.10.2026): Nachweise für revDSG, DSGVO, HIPAA, EU AI Act Art. 4, ISO 27001 Anhang A; für Admins per Richtlinie sammelbar).

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Export ohne Benutzer-/Gerätename und Uhrzeit, nur Tag und Zeitraum, Dateiname ohne Personenbezug | `common/bericht.js` `data()`, `fileName()` (`<produkt>-bericht-JJJJ-MM-TT.html`); Test `tests/bericht.test.mjs` |
| 2 | Zufalls-`exportId` je Export, nie an Gerät/Person gebunden; Sammel-Skript zählt jede Id einmal, Grenze 5 nur für eindeutige, gültige, nicht leere Exporte | `ui/bericht.js` (`crypto.getRandomValues`), `scripts/bericht-sammeln.mjs` `collect()`; Test |
| 3 | Ungültige Datei ganz verwerfen, nur Anzahl ausgeben; unter 5 Abbruch ohne Teilsummen | `collect()`, `main()`; Test |
| 4 | Untergrenze nur nach oben (`--min` ≥ 5), keine Werte je Datei | `main()`; Test |
| 5 | Admin-Hinweise: Dateien nach dem Zählen löschen, nur Nachweis (Art. 26 ArGV 3), Information (Art. 19 revDSG) und Anhörung (Art. 48 ArG), Erweiterung legt nie selbst Dateien ab | `docs/compliance/README.md`, Schema- und ADMX-Erklärtext `complianceReport` |
| 6 | Sammel-Skript robust: ≤ 1 MB je Datei, nur der eine JSON-Block per `JSON.parse`, Schema `dlx-bericht/1`, unbekannte Schlüssel/`__proto__` → verworfen, `Number.isSafeInteger`, Ausgabe nur stdout oder neue Datei (nie überschreiben) | `bericht.js` `extract()`/`validate()`, `bericht-sammeln.mjs` (`flag: 'wx'`, Eingabe ≠ Ausgabe); Test |
| 7 | Richtlinie mit fester Auswahl, unbekannte Werte → Standard, für Benutzer gesperrt | `policy.js` `complianceReport`/`complianceFrameworks`/`complianceReportDays` (nur verwaltet), `managed_schema.json` (enum), ADMX; Test |
| 8 | Nachricht `bericht` nur von `ui/bericht.html` (Absender-Id + genaue URL), Antwort mit fester Schlüsselliste | `background.js` (`fromExtPage`), Richtlinien nur über Positivliste `POLICY_KIND` mit Zustandswort; Test |
| 9 | Export: JSON-Block mit `<`/`>`/`&`/U+2028/U+2029, Meta-CSP `default-src 'none'; img-src data:; style-src 'unsafe-inline'`, Logo nur PNG/JPEG/WebP geprüft, kein SVG, Blob-URL sofort freigeben | `bericht.js` `jsonSafe()`, `exportHtml()`, `logoOk()`; `ui/bericht.js` `revokeObjectURL`; Test mit `</script>`, `"><img onerror>`, U+2028 |
| 10 | „Selbstauskunft, keine Rechtsberatung“ auf Seite und im Druck; Wortfilter konform/erfüllt/compliant/certified; HIPAA nur Zuordnung | `bericht.js` Texte, `docs/compliance/*.md`; Test Wortfilter |
| 11 | Tests: Netzwerk-Sperrtest, Manifest (keine neuen Rechte, Seite nicht `web_accessible`), Escaping, Sammel-Skript | `tests/bericht.test.mjs`, `tests/manifest.test.mjs` (unverändert grün), E2E-Schritt `bericht` mit Netzwerk-Wache auf den 4 Attrappen |

Restrisiken laut Review: Die IT kann einzelne Dateien lesen oder per Lauf-Vergleich herausrechnen (mittel; organisatorisch über Auflagen 1 und 5); Dateien sind von Hand veränderbar (tief; als Selbstauskunft dokumentiert, bewusst keine Signatur); Zählung je KI-Seite zeigt genutzte Dienste (tief; gewollt, nur Summen).
