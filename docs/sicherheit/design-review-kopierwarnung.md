# Design-Review: Hinweis beim Kopieren (KI-Seitenleisten) – 16.10.2026

Urteil des Sicherheits-Reviews vor dem Bau: **FREIGEGEBEN MIT AUFLAGEN** (14 Auflagen). Das optionale Recht
`https://*/*` nur auf Klick ist mit der früheren Auflage „kein `<all_urls>`“ vereinbar (die richtete sich gegen ein
Pflichtrecht); die Engine per `executeScript` erst beim Kopieren nachzuladen ist die bessere Variante (weniger Code auf
fremden Seiten). Hier nur Ort und Art der Umsetzung. Doku: [Für Unternehmen, Kapitel 7](../fuer-unternehmen.md#7-ki-seitenleisten-und-ki-erweiterungen-sperren).

| Nr. | Auflage (Kurzfassung) | Umsetzung (Ort) | Beleg |
|---|---|---|---|
| 1 | Mit erteiltem `https://*/*` dürfen Formularwache, Quellen und Rückgabe fremder Rechte nicht still aktiv werden | `background.js` `srcSyncNow()` registriert Formularwache/Quellen weiter nur für exakt erteilte Origins der eigenen Liste; `fromForm()`/`srcMark()` prüfen zuerst die Liste | `tests/background.test.mjs` „Breitbandrecht erteilt -> Formularwache und Quellen bleiben …“ |
| 2 | Recht nur gewollt, solange `copySidebarHint` effektiv an ist (Richtlinie vor Benutzer); sonst zurück und Skript ab; Abgleich bei Start, Installation, Rechte-Änderung | `background.js` `COPY_ALL` in `wanted` nur bei `copyOn`; bestehende Auslöser `onStartup`/`onInstalled`/`permissions.onAdded`/`onRemoved`/`storage.onChanged` | `tests/background.test.mjs` (ausgeschaltet, Richtlinie, onAdded), E2E `kopierwarnung` |
| 3 | Anfrage nur per Knopf mit erklärendem Text vorher, kein Drängen | `ui/options.js` (Abschnitt „Hinweis beim Kopieren“, `copyGrant` nur bei `isTrusted`), `ui/popup.js` nur Status | `tests/antwort-quelle-ui.test.mjs` (Popup fragt nie, genau eine Anfrage) |
| 4 | Recht nie für `fetch`, `webRequest`, `tab.url`; CSP `connect-src` eng | kein solcher Code; Manifest-CSP `connect-src 'none'` unverändert | E2E Netzwerk-Wache (keine Anfrage nach aussen) |
| 5 | `executeScript` nur mit `{tabId, documentIds}`, ohne `frameIds`; Fehler still | `background.js` `copyScan()` | `tests/training.test.mjs` (genau zwei Aufrufe, Ziel fest, keine `frameIds`), `tests/background.test.mjs` (Fehler -> `null`) |
| 6 | Absender: https, `sender.origin` passt zu `sender.url`; Engine je Dokument einmal (Markierung + `documentId` im Speicher); Rate | `background.js` `copyScan()` (Prüf-Funktion `DLX.engine` im Dokument, `copyDocs`, 1 je 2 s je Tab) | `tests/background.test.mjs` (alle Absender-Fälle, einmal je Dokument, Rate) |
| 7 | Nur das Nötigste ausliefern, keine eigenen Begriffe | `background.js` `COPY_CFG_KEYS` (ohne Wörterbuch, eigene/Firmen-Begriffe, Fingerabdrücke, Listen) | `tests/background.test.mjs` |
| 8 | Text nur in der Closure, nach Prüfung bzw. 5 s verworfen, überschreiben statt anhängen, keine Passwortfelder, kein `navigator.clipboard`/`clipboardRead` | `content/kopierwache.js` | `tests/background.test.mjs` (Quelltext-Test) |
| 9 | Neutrales Host-Element (keine id/Klasse/Marke), keine Felder, keine Links | `content/kopierwache.js` `show()` (closed Shadow Root, nur CSSOM) | Quelltext-Test, E2E (Seite sieht nur `DIV` ohne Attribute, `shadowRoot === null`) |
| 10 | `excludeMatches` exakt = Muster des statischen Content Scripts | `background.js` `copyExclude()` aus dem Manifest | `tests/background.test.mjs` (Listen gleich) |
| 11 | „Nicht abgedeckt“ nennt http, iframes, andere Programme, Lage ohne Recht; Admins: Richtlinie kann einschalten, aber nicht erteilen | `common/i18n.js` `notCoveredText`, `optCopyNote`, `copyInactive`; `managed_schema.json`, ADMX, `docs/einstellungen.md`, `docs/fuer-unternehmen.md` | Texte in 6 Sprachen (`tests/ui-texte.test.mjs`) |
| 12 | Richtliniennamen gegen Herstellerlisten, Stand und Quelle; Unbelegtes weglassen; Warnungen zu `"*"`/`debugger`, eigene Erweiterung erlauben; keine Firmennamen | `docs/fuer-unternehmen.md` Kapitel 7 (unbelegte Richtlinien und IDs weggelassen) | Quellen mit Abrufdatum |
| 13 | Store-Begründung und Datenschutz als Entwurf, nichts hochladen | Entwurf unten | – |
| 14 | Tests: `copyScan` genau `{t}`, ausgeschaltete Richtlinie, Pflicht-Prüfung | `tests/background.test.mjs`; Commit über die Pflicht-Prüfung | – |

Restrisiken (vom Review angenommen): R1 eine Seite kann das neutrale Host-Element sehen (weiss dann, dass etwas
Sensibles kopiert wurde, nicht was); R2 breites optionales Recht vergrössert den Schaden einer künftigen Lücke;
R3 Teilschutz (Einfügen in Seitenleisten bleibt ungeprüft); R4 Store-Rückfragen zum breiten optionalen Recht.

## Entwurf Store-Begründung (nicht eingereicht)

> **Optionales Host-Recht `https://*/*`:** Nur auf Klick des Benutzers in den Einstellungen und nur, solange die
> Einstellung „Hinweis beim Kopieren“ an ist. Beim Kopieren auf einer https-Seite wird der markierte Text lokal im
> Browser auf sensible Daten geprüft, um daran zu erinnern, dass KI-Seitenleisten und KI-Erweiterungen nicht geprüft
> werden. Der Text wird nicht gespeichert, nicht gesendet und nach der Prüfung verworfen; die Erweiterung hat keinen
> Netzwerkzugriff (`connect-src 'none'`). Ausschalten gibt das Recht sofort zurück.

## Entwurf Ergänzung Datenschutzerklärung (nicht veröffentlicht)

> Hinweis beim Kopieren (optional): Erteilen Sie den Zugriff auf alle https-Seiten, liest AImori beim Kopieren den
> markierten Text lokal in Ihrem Browser und zeigt bei sensiblen Daten einen Hinweis. Der Text verlässt Ihren Browser
> nie, wird nicht gespeichert und nicht gezählt.
