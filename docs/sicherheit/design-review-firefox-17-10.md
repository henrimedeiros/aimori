# Design-Review Firefox-Paket (17.10.2026)

Urteil Sicherheits-Review: **FREIGEGEBEN MIT AUFLAGEN** (vor dem ersten Code, nach Beschreibung). Vorhaben: AImori zusätzlich als Firefox-Paket bauen (gleicher Code, abgeleitetes Manifest), Prüfung mit addons-linter, Firmen-Rollout per `policies.json`. Nichts wird eingereicht, signiert oder veröffentlicht.

Empfehlung Linter: **addons-linter** (Engine von `web-ext lint`) statt web-ext – weniger Pakete, kein Update-Notifier, ohne Netz nutzbar; Signieren, Hochladen und Starten von web-ext werden nicht gebraucht.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Test fürs Firefox-Manifest: Rechte, Host-Rechte, `matches` höchstens wie im Repo; `web_accessible_resources` nicht breiter; CSP Byte für Byte gleich; keine neuen Schlüssel ausser `browser_specific_settings`; unbekannte Felder brechen ab | `firefoxProblems()` und `firefoxManifest()` in `scripts/pack-firefox.mjs`, Tests in `tests/pack-firefox.test.mjs` (je Ausweitung ein Gegentest) |
| 2 | `importScripts`-Liste nur per festem Regex, nur vorhandene relative Dateien, sonst Abbruch | `backgroundScripts()`; Gegentests mit `..`, URL, Ausdruck, Template-String, fehlender Datei |
| 3 | Fallback auf `sender.url` nur wenn `sender.origin` fehlt; nur `https:`/`http:` oder genau die eigene Herkunft; `null`, `about:`, `blob:`, `data:`, Fehler abweisen; `sender.id` bleibt Pflicht; Test für beide Wege | `originOf()` in `extension/background.js` (einmal am Nachrichteneingang); Tests „Firefox: Herkunft …“ in `tests/background.test.mjs`, auch gefälschtes `sender.url` bei vorhandenem `origin` |
| 4 | Kopierwarnung nach vorhandenem `sender.documentId` schalten, nicht nach User-Agent; sonst nichts überspringen | unverändert: `copyScan()` verlangt `documentId` und `documentLifecycle` – in Firefox fehlt `documentLifecycle`, die Kopierwarnung ausserhalb der KI-Seiten ist dort aus (bekannte Einschränkung, [Firefox](../firefox.md)) |
| 5 | OCR-Seite: Nachrichtentypen nur von genau `OWN_ORIGIN + '/ui/ocr.html'` ohne `sender.tab`; Content Scripts nie; `ui/ocr.html` nie `web_accessible` | bestehende Prüfung `fromExtPage(sender, '/' + OCR_DOC) && !sender.tab`; iframe-Weg in `ocrDoc()`/`ocrClose()`; Test „Firefox: Texterkennung/KI in unsichtbarem iframe …“ und Manifest-Test |
| 6 | Laufzeit-Prüfsumme der zusammengesetzten Teile; Reihenfolge/Anzahl fest; `--pins` nur mit gepinntem Modell; `pack-store.mjs` läuft weiter | `checked()` in `extension/ui/ki-lader.js` (SHA-256 je Teil gegen `inhalt.js`); `build-ki.mjs --pins` bricht ab, wenn `modell.erzeugt` abweicht; Cache wird schon beim Lesen gegen PINS geprüft |
| 7 | Linter exakt gepinnt mit Lockfile (`integrity`), nur `npm ci --ignore-scripts`, nicht im Root-`package.json`; `npm audit` einmal; nur gegen das ZIP, ohne Netzoptionen | `tools/firefox-lint/` (addons-linter 10.14.0, 190 Pakete mit `integrity`); `npm audit` am 17.10.2026: 0 Schwachstellen |
| 8 | Gecko-ID vor einer Einreichung unter eigener Domain prüfen; nach der ersten Signatur unveränderbar; `data_collection_permissions: none` nur solange `connect-src 'none'` | [Firefox](../firefox.md), Abschnitt „Kennung“; `firefoxProblems()` verlangt `connect-src 'none'` |
| 9 | Host-Zugriff in Firefox ist Opt-in: beim Start und im Popup mit `permissions.contains` prüfen und deutlich warnen; im Handtest-Plan, auch per Richtlinie | `hostCheck()` (Symbol „!“ und Titel), Popup-Hinweis, Einstellungen „Zugriff auf KI-Seiten erlauben“ (nur Content-Script-Seiten, nur auf echten Klick); Handtest-Plan Punkt 2 |
| 10 | Beispiel `policies.json` nur synthetisch, `install_url` als https-Platzhalter; Doku: `force_installed` braucht signierte XPI; Test mit dem Laufzeit-Validierungscode | `enterprise/firefox/policies.json` (erzeugt aus `enterprise/example-policy.json`), Test mit `managed_schema.json` und `DLX.policy.validate`; [Deployment Firefox](../deployment/firefox.md) |
| 11 | Kein Upload zu AMO, auch nicht „unlisted“ zum Signieren – braucht die Freigabe der Maintainer | nichts eingereicht; Doku nennt es als offenen Schritt |
| 12 | Website-Hinweis nur im Repo, kein Deploy; ehrlich „gebaut, noch nicht getestet/nicht im Store“ | Doku-Texte so formuliert; die Website liegt in einem eigenen Repo (Folgeschritt) |

## Restrisiken
- Mittel: In Firefox ist der Schutz ohne Host-Freigabe still aus → Auflage 9.
- Mittel: Keine E2E-Tests in Firefox; Unterschiede bei Absenderfeldern oder Lebenszyklus der Hintergrundseite können unentdeckt bleiben → Handtest-Plan vor jeder Freigabe nach aussen, später E2E mit gepinntem Firefox.
- Tief: Kopierwarnung fehlt in Firefox → als Einschränkung dokumentiert.
- Tief: Lieferkette addons-linter, nur in der Entwicklung → Auflage 7, bei Updates erneut prüfen.
