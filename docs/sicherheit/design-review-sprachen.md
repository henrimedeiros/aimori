# Design-Review Sprachen (17.10.2026)

Vorhaben: Erweiterung in sechs Sprachen (de, en, fr, it, es, pt-BR), einzige Textquelle `_locales/<ordner>/messages.json`, Laden aus dem eigenen Paket, Texte für Content Scripts über die bestehenden SW-Antworten `cfg`/`copyScan`, ADML in vier weiteren Sprachen, zusätzliche Senden-Labels. Urteil Sicherheits-Review: **FREIGEGEBEN MIT AUFLAGEN** (vor dem Bauen, ohne Dateien zu lesen).

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Ordner `pt_BR` statt `pt`, Einstellung `pt` → `pt_BR` | `extension/_locales/pt_BR`, `LOCALES.pt = 'pt_BR'` in `common/i18n.js`; Test `sprachen.test.mjs` |
| 2 | Feste Sprachliste zusätzlich zur Regex, Unbekanntes → `en`, auch Richtlinienwert | `LOCALES`/`LANGS` in `i18n.js`, `resolveLang`; Test: Liste = Ordner = Schema = Einstellungen |
| 3 | Tabellen ohne Prototyp, `__proto__`/`constructor`/`prototype` ablehnen, nur `message` als String | `parse()` mit `Object.create(null)`, Schlüssel-Regex + Sperrliste; Test „Lader“ |
| 4 | Platzhalter nur per Ersetzungsfunktion, nie ausgewertet | `t()` ersetzt per Funktion; Test `$&`/`$1`. Abweichung: nicht übergebene Platzhalter bleiben als Text stehen statt leer, weil `ui/dialog.js` den Text an `{types}` teilt; ausgewertet wird nie etwas |
| 5 | SW-Listener synchron registrieren, `ready()` nur im Handler | `background.js` unverändert synchron; `await DLX.i18n.ready()` nur in `cfg`, `copyScan` und vor dem Ampel-Titel |
| 6 | Schutz nie von Texten abhängig, englischer Mindestsatz | `MIN` in `i18n.js` (Kategorien, Zeilen-Platzhalter, Kopier-Hinweis), Datentyp-Namen fallen auf die Engine zurück; Test „ohne Tabelle“ |
| 7 | Grössenlimit je Datei und SW-Antwort, Content Scripts nur Texte der aufgelösten Sprache | 256 KB gesamt, 4000 Zeichen je Text; `contentTable()` nur `cat_`/`type_`/Kopier-Schlüssel; Test in `background.test.mjs` |
| 8 | Senden-Labels exakt, je Sprache Test, nichts entfernt | `labelled()` = `button[aria-label="…"]` (exakt); Test „Senden-Knopf“; E2E-Schritt `sprachen` stoppt auf der Attrappe in allen sechs Sprachen |
| 9 | ADML UTF-8, escaped, gleiche String-/Presentation-IDs wie ADMX | `scripts/build-admx.mjs` (bestehendes `esc`), Test „ADML“ in `sprachen.test.mjs` |
| 10 | Sicherheitsrelevante Texte rückübersetzen; fehlender Schlüssel → Test rot | Rückübersetzung je Sprache beim Übersetzen (u. a. Schwärzen ≠ Ausblenden korrigiert); Test „alle Schlüssel“ |
| 11 | Screenshots nur Attrappe/127.0.0.1, Store-Texte nur Entwurf | `docs/screenshots/aimori/sprachen/` aus dem E2E; `docs/store/*.md` als Entwurf, nichts eingereicht |
| 12 | Keine CSP-, `web_accessible_resources`- oder Rechte-Änderung, kein eval/innerHTML | Manifest unverändert (nur Ordner `pt` → `pt_BR`); Quelltext-Test erlaubt genau ein `fetch` auf `_locales` im Paket |

Restrisiken (Sicherheits-Review): missverständliche Warnübersetzungen (mittel, Muttersprachler-Durchsicht empfohlen), fehlende Senden-Labels nach Seiten-Updates (mittel), Tabelle lädt nicht → Englisch (tief), manipulierter Richtlinienwert → Englisch (tief).
