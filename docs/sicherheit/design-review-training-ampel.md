# Design-Review Training-Ampel (16.10.2026)

Urteil Sicherheits-Review vor dem Bauen: **FREIGEGEBEN MIT AUFLAGEN** (Variante A mit `activeTab` statt Auswahlliste, `declarativeContent` ebenfalls freigegeben). Grundlage war die Beschreibung des Vorhabens.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Nur `activeTab` und `declarativeContent` neu; kein `tabs`, keine `host_permissions`, kein `<all_urls>` | `scripts/build-aisites.mjs` (`manifestFor`), `tests/manifest.test.mjs` |
| 2 | Kein Einschleusen: `executeScript`, `captureVisibleTab` nirgends; `chrome.scripting` nur in `background.js` für die bestehende Registrierung | `tests/training.test.mjs` (Quelltext-Test) |
| 3 | Popup fragt den aktiven Tab genau einmal ab, behält nur die Seiten-ID; Adresse nie gespeichert, geloggt oder gesendet; ohne Adresse Auswahlliste | `extension/ui/popup.js` (`activeTab`), `tests/training.test.mjs` |
| 4 | Abgleich nur `https`, Host exakt, Pfad auf Segmentgrenze; Popup und Regeln entscheiden gleich | `DLX.aisites.find`, `DLX.training.conditions` (`pathEquals` + `pathPrefix` mit `/`), Test „Regeln wie find“ |
| 5 | Regeln bei Installation, Start und Richtlinienänderung erst entfernen, dann neu; nur `pageUrl`, kein `css`; bei `false` entfernen und Tab-Symbole zurücksetzen | `background.js` (`trainingSync`), `tests/training.test.mjs` |
| 6 | Symbol deterministisch aus festen Werten, je Farbe zwischengespeichert, gleiche Pixel-Funktion wie `scripts/make-icons.mjs`; Fehler → Standardsymbol | `extension/common/signet.js` (von beiden genutzt), Test „Icons unverändert“ |
| 7 | Tab-Symbol geht vor der Regel; bei neuer Seite zurück auf „unbekannt“, bis eine neue Meldung kommt; nie ein altes Grün | `background.js`: `cfg`-Abfrage eines neuen Dokuments setzt „unknown“; E2E-Schritt `training` (Titel je Tab nach Navigation) |
| 8 | Kontoart-Meldung nur vom eigenen Content Script (Tab, Hauptframe, einer der 7 Origins), nur Enum, sonst `unknown`, keine weiteren Felder | `background.js` (`fromContent`, `trainTab`), `tests/training.test.mjs` |
| 9 | `storage.session` nur Tab-ID → Enum, nur vertrauenswürdige Kontexte (Standard), Eintrag beim Schliessen gelöscht, bei Start/Installation alles geleert; fehlt er: `unknown` | `background.js`, `tests/training.test.mjs` |
| 10 | Links nur `https`, ohne Benutzer/Passwort, Host exakt aus der Liste je Eintrag; DOM-API mit `href` als Eigenschaft, `textContent`, `noopener noreferrer`; leer → Text statt Knopf | `DLX.training.safeLink`, `popup.js` (`link`), Tests |
| 11 | Jeder Eintrag mit Quelle und Stand; älter als 12 Monate oder unvollständig → gelb; grün nur bei ausdrücklichem „kein Training“; Hinweis „laut Herstellerangabe, Stand …, ohne Gewähr“; Knopf „Opt-out-Einstellung öffnen“, nie „erledigt“ | `DLX.training.ampel`, i18n `trainNote`/`trainOptOut`, Tests |
| 12 | `trainingAmpel` nur aus `storage.managed`, Standard `true`; Schema und ADMX/ADML aus derselben Quelle | `common/policy.js`, `managed_schema.json`, `npm run build`, `tests/admx.test.mjs` |
| 13 | Kein Netz: CSP `connect-src 'none'` bleibt, kein `fetch`/`import()`/`importScripts` in `training.js`; keine neuen Abhängigkeiten | `tests/quelltext.test.mjs`, `tests/training.test.mjs`, Netzwerk-Wache im E2E-Schritt `training` |
| 14 | Recherche nur mit Anbieter- und Produktnamen, Quellen nur Herstellerseiten | Recherche 16.10.2026, Quellen in [der Liste](../ki-training-liste.md) |
| 15 | Doku zu `activeTab`/`declarativeContent` und gespeicherten Daten; Tabelle erzeugt | [Training-Ampel](../ki-training.md), [Liste (erzeugt)](../ki-training-liste.md), `tests/training.test.mjs` |

## Restrisiken (aus dem Review)

| Risiko | Schwere | Gegenmassnahme |
|---|---|---|
| Herstellerangaben ändern sich zwischen zwei Releases (falsche Aussage über Fremdanbieter) | mittel | Auflage 11, Pflege je Release |
| Späterer Code-Fehler nutzt den `activeTab`-Zugriff | mittel | Auflage 2, Pflicht-Prüfung bei jeder Manifest-Änderung |
| Gefälschte Kontoart-Meldung einer Seite | tief | Auflage 8; wirkt nur auf den eigenen Tab |
| Kein `declarativeContent` in Firefox/Safari | tief | API-Prüfung, Rückfall Popup |
| Opt-out-Link im Repo ersetzt | tief | Auflage 10 (Host-Liste im Test) |

Manuell zu prüfen (nicht automatisierbar, weil der Test-Browser keinen Klick auf das Symbol auslöst): Popup über das echte Symbol auf einer KI-Seite öffnen (`activeTab`), Farbe des Symbols nach Neuladen, Navigation innerhalb der Seite und Wechsel auf einen fremden Host im selben Tab.
