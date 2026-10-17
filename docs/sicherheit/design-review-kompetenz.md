# Design-Review: Erklärungen und KI-Kompetenz-Nachweis (14.10.2026)

Urteil Sicherheits-Review vor dem Bauen: **FREIGEGEBEN MIT AUFLAGEN**. Kein neues Recht, kein Netz, keine Abhängigkeit, nur Zahlen, Löschung nach 13 Monaten. Anlass (14.10.2026): Erklärung je Warnung, Nachweis nach Art. 4 Verordnung (EU) 2024/1689).

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Zählen nur im Service Worker auf Nachrichten des erweiterungseigenen Meldungs-Frames (`ui/dialog.html`), nie direkt aus Content Scripts; je Eintrag höchstens einmal `seen` und einmal eine Entscheidung; Test gegen doppelte Nachrichten | `background.js` `kCount()`: `hello`/`decide` nur nach `fromExtPage(…,'/ui/dialog.html')`, Merker `p.kSeen`/`p.kDone` im Eintrag in `storage.session` (Arbeitsspeicher, nur vertrauenswürdige Kontexte); Test `tests/kompetenz-sw.test.mjs` |
| 2 | Lese-Nachricht `kompetenz` nur an `nachweis.html`, `popup.html` (nur Monatssummen), `options.html`; Zurücksetzen nur über eigene Nachricht von `options.html` | `background.js` `kompetenz`/`kompetenzReset`; Test |
| 3 | Strenge Validierung (Monatsschlüssel, Positivlisten, `Object.create(null)`, `__proto__`, `Number.isSafeInteger` 0..1e6, kappen, max. 13 Monate, Ungültiges ganz verwerfen) | `extension/common/kompetenz.js` `clean()`; Test `tests/kompetenz.test.mjs` |
| 4 | Bereinigung bei jedem Schreiben und beim Start des Service Workers | `kCount()` schreibt nur `clean()`-Ergebnisse; `onStartup`/`onInstalled` |
| 5 | Schalter `competenceRecord` (Benutzer + Richtlinie, bool); aus = sofort kein Zählen und Speicher gelöscht, auch bei Wechsel zur Laufzeit; in den Einstellungen sichtbar gesperrt; Schema und ADMX gleich; Test „Richtlinie aus → Speicher leer“ | `policy.js`, `managed_schema.json`, `build-admx.mjs`, `storage.onChanged`; Tests |
| 6 | `ui/wissen.html`, `ui/nachweis.html` nicht in `web_accessible_resources`, kein Inline-Script, CSP unverändert, nur `textContent`, Hash nur gegen Gruppen-Positivliste | Manifest-Test, Quelltext-Test |
| 7 | „Mehr erfahren“: `rel="noopener noreferrer"`, `href` aus fester Gruppe per `chrome.runtime.getURL`, keine Nachricht, keine Entscheidung | `dialog.js`; Test `tests/dialog.test.mjs` |
| 8 | Logo nur als `<img src>`, nur validierte `data:image/png` bzw. `svg+xml` mit Längengrenze | `DLX.dom.brand()` (bestehende Prüfung `LOGO`, Richtlinie `MAX_LOGO`) |
| 9 | Namensfeld ohne `autocomplete`, nie gespeichert, nicht in URL/Hash, keine Nachricht | `nachweis.js`; Quelltext-Test |
| 10 | Ehrlicher Text: Selbstauskunft, lokal gezählt, nicht manipulationsgeschützt, kein Beleg erfüllter Pflichten, kein Rechtsrat, ersetzt keine Schulung, AI Act für Schweizer Firmen nur bei EU-Bezug; nie „konform“/„erfüllt“ | `i18n.js` Nachweis-Texte, `docs/ki-kompetenz.md`; Test Wortfilter |
| 11 | Gruppen `gesundheit` und `id-national` im Export per Häkchen ausblendbar | `nachweis.js`; Test |
| 12 | `report()` rein, nur `schema`/`month`/feste Gruppen mit 4 Zahlen, Fremdschlüssel/`__proto__`/Strings/NaN/negativ fallen heraus, kein Aufrufer ausser Tests; kein `fetch`/XHR/`sendBeacon`/WebSocket/EventSource, keine externen URLs in neuen Dateien | `kompetenz.js`; Tests `kompetenz.test.mjs`, `quelltext.test.mjs` |
| 13 | Datenschutzhinweis und Doku um die lokalen Zähler ergänzen (was, wie lange, Schalter, Richtlinie) | `docs/statistik.md`, `docs/ki-kompetenz.md`, `docs/einstellungen.md` |
| 14 | Jede Übermittlung (CIPP, Admins) braucht neues Design-Review und Freigabe der Maintainer | `docs/ki-kompetenz.md` Abschnitt „Später: CIPP“ |

Restrisiken laut Review: spätere Übermittlung je Person wäre Verhaltensüberwachung (Art. 26 ArGV 3, DSG) → nur aggregiert über eine Mindestanzahl Personen und mit Information der Mitarbeitenden; Nachweis vom Benutzer fälschbar → als Selbstauskunft bezeichnet; Gruppenzahlen verraten Themen → Häkchen (Auflage 11), Popup nur Summen; geteiltes Browserprofil → Zurücksetzen und Hinweis in der Doku; kompromittiertes Content Script kann `storage.local` überschreiben → Validierung, Folge höchstens falsche Zahlen.
