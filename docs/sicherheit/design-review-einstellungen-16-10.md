# Design-Review Einstellungsseite mit Menü (16.10.2026)

Vorhaben: Neubau nur der Oberfläche `extension/ui/options.*` (Seitenmenü, Statuskarte, Suche, Hell/Dunkel), Texte in `common/i18n.js`. Funktionen, Nachrichten und Speicherformat unverändert; `manifest.json` und `background.js` unverändert.

Urteil Sicherheits-Review (16.10.2026): **FREIGEGEBEN MIT AUFLAGEN**.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Hash nur gegen feste Liste der Bereichs-IDs, Element per ID, unbekannt → Übersicht ohne Ausgabe | Strenger umgesetzt: **keine Hash-Navigation**. Der Service Worker nimmt `userTerms` und `ignoreReset` nur von genau `ui/options.html` an (ohne Hash); ein Hash hätte diese Funktionen gebrochen. Menü als Knöpfe, `zeige()` nimmt nur Werte aus `BEREICHE`; Test `tests/einstellungen.test.mjs` (kein `location.hash`/`hashchange`/`pushState`), E2E prüft unveränderte Adresse und Eigene Begriffe nach Menü-Klick |
| 2 | Suche nur `textContent` klein + `includes`, keine Regex/HTML, nirgends gespeichert, max. ~100 Zeichen | `options.js` `suche()`, `maxlength=100`; Test |
| 3 | Suche blendet nur ein/aus, hebt keine Sperre auf | nur `hidden`, kein Zugriff auf `disabled`; E2E `einstellungen` prüft Sperren vor/nach der Suche |
| 4 | Theme: ein `localStorage`-Schlüssel, nur `system`/`hell`/`dunkel`, sonst `system`; nur `data-theme` am Root; kein `chrome.storage` | `options.js` `THEMA_KEY`, `thema()`; Test |
| 5 | Statuskarte nur feste i18n-Schlüssel, nie Rohtexte; leere/ungültige Antwort → „Status unbekannt“ | `options.js`: Prüfung der `state`-Antwort am Anfang (sonst nur Karte „Status unbekannt“), KI-Zustand nur aus `KI_ZUSTAENDE`, sonst „unbekannt“; Test |
| 6 | Texte nur per `textContent`/`h()`, kein HTML in Übersetzungen, alle Sprachen gleiche Schlüssel | `tests/einstellungen.test.mjs` (kein `<` in i18n-Werten), `tests/ui-texte.test.mjs` |
| 7 | `permissions.request` bleibt in der Klick-Kette mit `isTrusted`, nur geprüfte Origins; jeder Handler einmal gebunden | Handler unverändert übernommen (Quelltext-Tests `aisites`, `antwort-quelle-ui`); Menü bindet nur Navigation |
| 8 | Zwei-Klick-Löschen beim Bereichswechsel zurücksetzen | `options.js` `entschaerfen` (Statistik, Kompetenz, eigene Begriffe); E2E |
| 9 | Kein Inline-Skript, keine `on*`, kein eval, keine fremden Ressourcen; kein `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` | Test `tests/einstellungen.test.mjs` |
| 10 | Statistik nur Zählwerte; eigene Begriffe ohne Klartext | unverändert übernommen |
| 11 | Screenshots nur mit Attrappen-Daten, nur im Projekt | E2E-Wegwerfprofil, Ablage `docs/screenshots/aimori/einstellungen/` |
