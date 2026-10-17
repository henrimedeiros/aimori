# Design-Review: Lokale KI vorladen, Live-Status, KI-Seite automatisch erkennen (16.10.2026)

Urteil Sicherheits-Review (vor dem Bauen, 16.10.2026): **FREIGEGEBEN MIT AUFLAGEN**. Keine neuen Rechte, keine neuen Abhängigkeiten, kein Netz, Modell bleibt lokal.

Anlass (16.10.2026): Die Anzeige zeigte immer „Lokale KI: noch nicht geladen“, weil das Modell absichtlich erst beim ersten geprüften Text geladen wurde (`kiRun` im Service Worker, `start()` in `ui/ki.js` nur bei `run`); der Status wurde erst nach einer erfolgreichen Prüfung auf „aktiv“ gesetzt. Die Training-Ampel im Popup zeigte die Auswahl aller Seiten immer, auch wenn die aktive Seite erkannt war.

| Nr | Auflage | Umsetzung |
|---|---|---|
| 1 | Offscreen `load` nur vom eigenen Service Worker (id, kein tab, exakte SW-URL), gemeinsame Prüfung mit `run`; `gpu` nur `=== true`; Rest ignoriert, fail-closed | `ui/ki.js` `fromSw()` für `run`, `load`, `stop` |
| 2 | Laden per Zustandsabfrage nur von `popup.html`/`options.html` der eigenen Erweiterung (exakte URL, kein tab); Content Scripts lösen weder Laden noch `kiFortschritt` aus | `background.js`: `state` nur über `fromExtPage(...)` (prüft `sender.origin` = eigene Erweiterung, Content Scripts haben die Seiten-Origin) |
| 3 | `kiFortschritt` nur bei `state === 'laedt'`, nur steigend, 5-%-Takt prüft der SW selbst | `background.js` `kiProgress()` |
| 4 | Nie `storage.session.setAccessLevel(...)`; `kiStatus` nur über eine Funktion nach Positivliste neu zusammengesetzt | `kiSetStatus()` baut das Objekt aus Enums/Zahlen neu; Quelltext-Test |
| 5 | Erkennung aus → kein Vorladen (auch nicht bei Start); vor dem Senden `fails < 2` und `state === 'inaktiv'`; Lauf als Promise gesperrt | `kiPreload()` mit `kiLoading` |
| 6 | Startzeit in `kiStatus`, bei Aufwachen/Abfrage gegen jetzt prüfen; abgelaufen → `fehler/zeit` | Feld `t0`, `kiStatus()` prüft `Date.now() - t0 > KI_LOAD_MS` |
| 7 | Offscreen vorher per `getContexts` prüfen, genau eines, Grund/URL wie bisher, CSP `connect-src 'none'` unverändert, kein `fetch` | bestehendes `ocrDoc()` unverändert genutzt |
| 8 | `ui/auswahl.js` nur `textContent`/`createElement`, kein `innerHTML`/`insertAdjacentHTML`/`outerHTML`, keine Stil-Strings aus Daten, keine URLs, kein `<img>` | `ui/auswahl.js` über `DLX.dom.h`; Quelltext-Test |
| 9 | Seitenerkennung nur über den exakten Hostnamen, nie `includes`/Regex auf der URL; Tab-URL nie gespeichert/geloggt/an den SW; manuelle Wahl höchstens als Dienst-Id | `DLX.aisites.find()` (exakter Host aus `URL.origin`, Map-Abfrage); Wahl nicht gespeichert |
| 10 | `auswahl.js` nur in `popup.html` per `<script src>`, CSP bleibt | `ui/popup.html` |
| 11 | DevTools im Test nur Pipe oder Zufallsport auf 127.0.0.1, Wegwerf-Profil im Temp-Ordner, `openPopup`/CDP nicht im Erweiterungscode | `scripts/e2e/e2e.mjs` (bestehender Aufbau) |
| 12 | Attrappen nur lokal, keine echten KI-Dienste, keine echten Prompt-Texte | Attrappen in `scripts/e2e/fake-site.mjs` |
| 13 | Kopiertes Vendor-Modell: `git check-ignore`, `git status` sauber, gleicher Pfad, Modell unverändert | `extension/vendor/ki/*` ist gitignoriert |

Restrisiken (tief): Vorladen belegt Speicher auch ohne Prüfung (Entladen nach 10 Min Leerlauf bleibt, bei ausgeschalteter Erkennung kein Vorladen); nach dem Entladen bleibt der Status „aktiv“, der nächste Text lädt das Modell neu.
