# Design-Review: kein eigenes Fenster, weniger KI-Fehlalarme (23.10.2026)

Anlass 23.10.2026: In Microsoft Edge öffnete sich ab und zu ein eigenes Fenster `ui/dialog.html` mit der Meldung „ist blockiert, ERR_BLOCKED_BY_CLIENT“ und blockierte die Arbeit; zudem meldete die lokale KI zu viele Fehlalarme in Alltags- und Geschäftstexten. Sicherheits-Review vor dem Bauen: **FREIGEGEBEN MIT AUFLAGEN**. Die Auflagen-Liste unten ist ein **Nachtrag vom 23.10.2026** (neu aufgestellt, nachdem der erste Wortlaut verloren ging); sie gilt ab diesem Tag.

## Ursache Fenster

Kam die Bereitmeldung des Hinweis-iframes nicht innert Frist oder passte die Leiste nicht, schickte `content.js` `t:'fallback'`, und `background.js` öffnete per `chrome.windows.create` ein Popup mit `ui/dialog.html`. Edge zeigte die Seite dort als blockiert; das Popup lag im Vordergrund und hielt die angehaltene Aktion fest.

## A – kein separates Fenster mehr

| Nr | Auflage (gekürzt) | Umsetzung |
|----|-------------------|-----------|
| A1 | Keine neuen Rechte, kein Netz, keine Abhängigkeiten; Manifest, `web_accessible_resources`, `matches` unverändert | `manifest.json` unverändert; `npm run check` |
| A2 | Kein `windows.create`/`tabs.create` auf eigene Seiten ausser der Formular-Wache; `'fallback'` → `null`; Quelltext-Test | `background.js` (Popup, `closePopup`, `windows.onRemoved` entfernt); Tests `tests/background.test.mjs`, `tests/fehlalarme-alltag.test.mjs` (Quelltext) |
| A3 | `'full'` nur für eine offene Leiste, nur mit aktueller Nonce, einmalig; danach neue Nonce, Frame-Bindung zurückgesetzt; Nicht-Warnmodus nie hochgestuft | `background.js` (`msg.t === 'full'`); Tests `tests/background.test.mjs` |
| A4 | Overlay nur im eigenen Erweiterungs-iframe in closed Shadow Root | `content.js` (gleicher Weg wie die Leiste, Layout `full`) |
| A5 | Fail-closed: ohne Bereitmeldung wird die angehaltene Aktion verworfen, nie trotzdem gesendet | `content.js` (Kette Leiste → Vollbild → Abbrechen); Test „Rueckfall-Kette“ in `tests/content.test.mjs` |
| A6 | Statusmeldung: fester Text aus der Sprachtabelle, keine Werte, kein Knopf, `pointer-events: none`, verschwindet von selbst | `content.js` (`failNote`), Text `noticeFailed` in 6 Sprachen und im englischen Mindestsatz (`common/i18n.js`) |
| A7 | `dialog.html` zeigt nur eingebettet etwas an | `ui/dialog.js` (`window.top === window` → keine Funktion) |
| A8 | Entscheidungsknöpfe nur auf echte Klicks im Erweiterungs-Frame; keine Freigabe per `postMessage` | bestehend: `ui/dialog.js` prüft `isTrusted`, Mindest-Sichtbarkeit und Sperrzeit; Entscheidungen gehen nur per `runtime.sendMessage` an den Service Worker; Test „Senden: Trotzdem nur mit zwei echten Klicks“ in `tests/dialog.test.mjs` |

## B – weniger Fehlalarme der lokalen KI

| Nr | Auflage (gekürzt) | Umsetzung |
|----|-------------------|-----------|
| B1 | Nur `engine/ki.js`, feste Konstanten, keine Richtlinie | `engine/ki.js`; Test „Schwellen sind feste Konstanten“ |
| B2 | Regeln für Passwörter, IBAN, Karten, Schlüssel unverändert; eigene geschützte Begriffe immer sicher | Regel-Engine unverändert; Test „Eigene geschuetzte Begriffe bleiben sicher“ |
| B3 | Herabgestufte Funde bleiben als dezenter Hinweis sichtbar | Firmenname ohne Kontextwort/Rechtsform und „nur PLZ + Ort“ → `sure: false` |
| B4 | Erkennung nicht schlechter: KI-Trefferkorpus bleibt bei 114/132 sicher | Messung vorher/nachher gleich (Personen 60/60, Firmen 30/30) |
| B5 | Korpora als Regressionstest in der Vollsuite, feste Modell-Ausgaben, nur synthetische Texte | `tests/fehlalarme-alltag.test.mjs`, `tests/helpers/alltag-korpus.mjs`, `tests/helpers/alltag-ki-ausgaben.json` (läuft mit `npm test`) |
| B6 | Bekannte Lücke dokumentiert | siehe Restrisiken |

## Messung (synthetischer Alltagskorpus, 96 Texte)

| | vorher | nachher |
|---|---|---|
| Texte mit sicherem KI-Fund (löst Meldung aus) | 14/96 | 0/96 |
| Regel-Engine (Passwörter, IBAN, Karten, Schlüssel …) | 0/96 | 0/96 |
| KI-Trefferkorpus, sichere Treffer | 114/132 | 114/132 |

## Restrisiken

- Mittel: Die Seite kann das iframe verdecken oder entfernen. Entfernen führt zum Verwerfen (A5); Klicks zählen erst nach Mindest-Sichtbarkeit und nur als echte Klicks (A8).
- Mittel: Firmennamen ohne Kontextwort oder Rechtsform erscheinen nur als dezenter Hinweis und können durchgehen. Gegenmassnahme: solche Namen als eigene geschützte Begriffe eintragen.
- Tief: Die Seite kann die kurze Statusmeldung verdecken – ohne Folgen, die Aktion ist bereits verworfen.
