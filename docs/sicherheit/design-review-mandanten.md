# Design-Review: Mandanten-Vorlagen und Firmenlogo (14.10.2026)

Vorhaben: `scripts/mandanten.mjs` erzeugt aus einer Basis-Richtlinie plus Abweichungen je Kunde
die Rollout-Dateien für Intune und GPO (nur Dateien, kein Netz, keine Tenant-Aufrufe);
`extension/common/policy.js` prüft das Logo zusätzlich nach dem Dekodieren.

Urteil Sicherheits-Review (vor dem Bauen, 14.10.2026): **FREIGEGEBEN MIT AUFLAGEN**.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | `__proto__`/`constructor`/`prototype` auf jeder Ebene ablehnen; nur echte Objekte tief zusammenführen, Listen/Werte ersetzen | `merge()` in `scripts/mandanten.mjs`, Test `mandanten.test.mjs` |
| 2 | Schema-Prüfung auf der fertigen Richtlinie je Kunde (nach companyName/Logo) | `kundeRichtlinie()` prüft zuletzt |
| 3 | Kunden-id `^[a-z0-9][a-z0-9-]{0,39}$`, Windows-Gerätenamen ablehnen; Erweiterungs-id `^[a-p]{32}$`; updateUrl per `new URL`: nur https, ohne Zugangsdaten und Fragment | `pruefeId()`, `pruefeUrl()` |
| 4 | Logo-Pfad: keine absoluten/UNC/Laufwerk-relativen Pfade, kein `:`, kein `..`; realpath unter dem Mandanten-Ordner (ohne Gross-/Kleinschreibung, mit Trenner); jedes Segment per lstat ohne Link/Junction; Grösse vor dem Einlesen | `logoPfad()` |
| 5 | SVG mit Tokenizer und Allowlist (Elemente/Attribute ohne Gross-/Kleinschreibung, Namensräume), ablehnen: xml-stylesheet, CDATA, style, Kodierung ≠ UTF-8, BOM/UTF-16; PNG: IHDR ≤ 512×512, Grösse vor dem Einlesen | `pruefeSvg()`, `pruefePng()` |
| 6 | .reg: `\` und `"` escapen, CR/LF/Steuerzeichen ablehnen; genau eine Löschzeile aus der geprüften Erweiterungs-id; Test mit Zeilenumbruch + `[HKEY_` | `regDatei()`, Test |
| 7 | Rollout-PS1: Schema, Richtlinie, Deploy-Skript nur Base64-kodiert; keine Eingabewerte im Skript-Code; Test mit `'@` + `$(calc)` | `rolloutPs1()`, Test |
| 8 | XML: `& < > " '` escapen, XML-1.0-unzulässige Zeichen ablehnen; ADMX-ids/Namen nur aus Schema-Schlüsseln `^[A-Za-z0-9_]+$` | `xmlAttr()`, `build-admx.mjs` prüft die Namen |
| 9 | Ausgabe im Repo nur, wenn per `git check-ignore` ignoriert (ohne Git: verweigern); `--force` überschreibt nur bekannte Dateinamen, löscht nichts, folgt keinen Links; atomar schreiben | `pruefeAusgabe()`, `schreibe()` |
| 10 | Konsole und Fehler nur Dateinamen, Feldpfade, Zahlen – nie Werte (auch kein Salz in Schema-Fehlern) | Schema-Prüfer meldet nur Pfade; eigene Fehler ohne Werte |
| 11 | Beispiel nur erfundene Namen, example.com/.test, synthetische Logos; Namen vor dem Commit gegen die Kunden-Blockliste geprüft; Tests und Beispiele nie mit echten Kundendaten | `enterprise/mandanten/beispiel.json` |
| 12 | Logo nur genau `data:image/png;base64,` bzw. `data:image/svg+xml;base64,`; Länge vor `atob`; wirft `atob` → abgelehnt | `logoOk()` in `policy.js` |
| 13 | SVG nach dem Dekodieren ohne Gross-/Kleinschreibung, Leerraum normalisiert: on…=, javascript:, ENTITY, xml-stylesheet, @import, style, `&#`, script, foreignObject, externe href/url(); fail-closed (kein Logo, Standardsignet, Fehler nur als Feldpfad) | `logoOk()` |
| 14 | Gemeinsame Testfälle für Werkzeug und `policy.js`: was das Werkzeug ablehnt, lehnt auch die Erweiterung ab | `tests/mandanten.test.mjs` (`BOESE_SVG`) |
| 15 | Logo nur als `img.src`, kein innerHTML/object/CSS-background; CSP unverändert | `DLX.dom.mark()` unverändert, CSP unverändert |
| 16 | E2E nur mit eigenem temporärem Profil; nie Registry schreiben, Rollout-PS1/.reg nie gegen die echte Registry ausführen | E2E nutzt Temp-Kopie der Erweiterung + Temp-Profil; PS1 nur per Parser geprüft |

Restrisiken: Ausgabedateien enthalten ggf. Salz/Prüfsummen unverschlüsselt beim Admin → Hinweis
in Anleitung/Konsole, nicht in Sync-Ordnern ablegen; Rollout-PS1 läuft mit Adminrechten → nur über
Intune/GPO verteilen oder signieren, vorher `-PlanOnly`; SVG-Sperrliste in der Erweiterung ist nur
Defense in Depth (im `img`-Kontext laufen keine Skripte); verwaltete Richtlinie im echten Browser
ist nicht E2E-geprüft → Test auf einer Test-VM, nie auf einem Arbeitsprofil.
