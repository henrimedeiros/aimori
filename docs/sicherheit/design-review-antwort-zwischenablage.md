# Design-Review: KI-Antworten prüfen und Zwischenablage-Schutz (16.10.2026)

Urteil des Sicherheits-Reviews vor dem Bau: **FREIGEGEBEN MIT AUFLAGEN** (25 Auflagen). Hier nur Ort und Art der Umsetzung. Beschreibung der Funktionen: [KI-Antworten und Zwischenablage](../antworten-und-zwischenablage.md).

| Nr. | Auflage (Kurzfassung) | Umsetzung (Ort) | Beleg |
|---|---|---|---|
| 1 | Antwort nur bei geänderter Länge/Prüfsumme neu prüfen, Zeitbudget je Durchlauf, ReDoS-Test 20 000 Zeichen | `content/content.js` `answerCheck()` (Signatur Länge + SHA-256), `scanQuiet()` mit 50 ms über verkürzte Engine-Uhr | `tests/antwort-quelle-ui.test.mjs` (36 Angriffstexte à 20 000 Zeichen), `tests/content.test.mjs` (kein Neuscan) |
| 2 | Highlight-Name zufällig je Seitenladen, fremde Registrierung nie lesen/überschreiben, nur Fundbereiche | `content/content.js` `mark()`: Name `h` + 16 Hex aus `crypto.getRandomValues`, Abbruch bei belegtem Namen, Ranges nur `start..end` | E2E-Schritt `antwortquelle` |
| 3 | Kein Abfluss von Text/Werten/Ranges; Leiste nur Typ und Anzahl, nur als Text | `content/content.js` (`summaryOf` nur id/cat/n), `ui/dialog.js` (Text per `h()`/textContent) | `tests/content.test.mjs`, `tests/dialog.test.mjs` |
| 4 | copy: nur Auswahl lesen, clipboardData nie ändern, nie preventDefault | `content/content.js` `onCopy()` | Quelltext-Test, E2E (Kopie unverändert) |
| 5 | `answerCheck` ungültig = hint, verwaltet schlägt lokal | `common/policy.js` `validate()` | `tests/antwort-quelle.test.mjs` |
| 6 | Quellenmuster identisch in Einstellungen und Service Worker, nur Host, ein `*.`, ≥ 2 Labels, Sperrliste mehrteiliger Endungen, keine IP/localhost | `common/quellen.js` `parse()` (von `ui/options.js`, `common/policy.js`, `background.js` gemeinsam genutzt) | `tests/antwort-quelle.test.mjs` |
| 7 | `permissions.request` nur mit geprüften Origins, nie `https://*/*` | `ui/options.js` `srcMissing()` → `DLX.quellen.originsOf()` | Quelltext-Test in `tests/antwort-quelle-ui.test.mjs` |
| 8 | Ausschlüsse KI-Hosts, statische Hosts, `*.cloud.microsoft`, Nicht-https im Service Worker | `common/quellen.js` (Wildcard trifft KI-Host = ungültig), `background.js` `srcMark()` (https, kein Port) und `srcSyncNow()` (feste Origins nie angefasst) | `tests/antwort-quelle.test.mjs`, `tests/background.test.mjs` |
| 9 | Feste id, ISOLATED, allFrames false, Schnittmenge erteilt ∩ konfiguriert, beim Start abmelden/neu, bei Entzug Merkmale löschen, Rest-Rechte zurückgeben | `background.js` `srcSyncNow()` (id `dlx-quelle`, `permissions.remove`, `srcClear()`) | `tests/background.test.mjs` |
| 10 | quelle.js ohne onMessage/Netz/DOM-Schreiben; abweichender Seitentext: beide hashen (max. 2) | `content/quelle.js` | Quelltext-Test (fetch, XMLHttpRequest, WebSocket, sendBeacon, storage, console, innerHTML, postMessage, onMessage) |
| 11 | Mindestlänge vor dem Hashen, in der Doku genannt | `common/quellen.js` `hashable()` (8 Nicht-Leerzeichen) | `tests/antwort-quelle.test.mjs`, `tests/content.test.mjs`, E2E |
| 12 | Senderprüfung (id, Tab, frameId 0, documentLifecycle active, Origin konfiguriert + erteilt), Schema genau `{t, hash}`, Hex-64, Rate 10/min | `background.js` `srcMark()` | `tests/background.test.mjs` |
| 13 | Abruf `{salz, hashes}` nur vom KI-Content-Script im Hauptframe | `background.js` (`srcMarks` nur im `fromContent`-Zweig) | `tests/background.test.mjs` |
| 14 | Nie `setAccessLevel`; Ablauf bei jedem Zugriff, Salz neu bei leerer Liste | `background.js` `srcLoad()` | Quelltext-Test, `tests/background.test.mjs` (Fake-Uhr 31 min) |
| 15 | Push per `tabs.query({url: KI-Muster})`, Fehler still, Versionszähler | `background.js` `srcPush()`, `content/content.js` `srcApply()` (ältere Version verworfen). Befund E2E: ohne Host-Recht liefert `tabs.query({url})` die statischen KI-Seiten nicht (0 Tabs), der Push erreicht sie also nur mit erteiltem Recht. Darum holt das KI-Content-Script die Merkmale zusätzlich selbst ab (gleicher geprüfter Abruf wie Auflage 13): beim Laden, bei Fokus/Sichtbarkeit, beim Drücken von Strg/Cmd/Umschalt/Einfg (vor dem V), beim Kontextmenü und beim Ziehen; höchstens alle 200 ms. Kein `query({})`, kein `tabs`-Recht | `tests/background.test.mjs`, `tests/content.test.mjs`, E2E (KI-Tab vor dem Kopieren geöffnet, Einfügen nach Strg) |
| 16 | paste/drop in Capture-Phase vor Seitenlogik, gemeinsame Normalisierung, „Trotzdem“ nur über bestehenden Weg mit `allowUserOverride` | `content/content.js` `onInsert()` + `fromSource()`, `common/quellen.js` `normalize()` | `tests/content.test.mjs`, `tests/background.test.mjs` |
| 17 | `sensitiveSourceAction` ungültig verwaltet = block, lokal = warn; verwaltete Liste sperrt | `common/policy.js` | `tests/antwort-quelle.test.mjs` |
| 18 | Vorschlagsliste fest, nur bekannte HR-/Lohn-Anbieter, Klick fügt nur hinzu | `common/quellen.js` `SUGGESTIONS`, `ui/options.js` | Code |
| 19 | Statistik nur Kategorie `source` | `background.js` `count()` (Kategorie aus dem Ganztext-Fund) | `tests/background.test.mjs` |
| 20 | Beispiele nur `example.com`; XML maskiert; Schema/ADMX/Beispiel deckungsgleich | `enterprise/example-policy.json`, `scripts/build-admx.mjs` | `npm run check`, `tests/admx.test.mjs`, `tests/policy.test.mjs` |
| 21 | Doku nennt Grenzen ehrlich | [KI-Antworten und Zwischenablage](../antworten-und-zwischenablage.md#grenzen-ehrlich) | – |
| 22 | Dieses Dokument nur Ort und Art; kein Hooking der Clipboard-API in der MAIN-World | nur ISOLATED-Skripte | Quelltext |
| 23 | Wegwerf-Manifest nur im Temp; Release-Manifest ohne `host_permissions`, `https://*/*` nur optional | `scripts/e2e/e2e.mjs`, `scripts/check.mjs` | `tests/manifest.test.mjs`, `npm run check` |
| 24 | Netzwerk-Wache: null Anfragen der Erweiterung, auch nach copy auf der Testquelle | E2E-Schritt `antwortquelle` | E2E |
| 25 | Pflicht-E2E: Treffer warn/block, Mindestlänge, Entzug, Ablauf mit Fake-Uhr | E2E-Schritt `antwortquelle`; Ablauf per Fake-Uhr im Unit-Test (Service Worker) | E2E, `tests/background.test.mjs` |
