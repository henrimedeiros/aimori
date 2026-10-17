# Design-Review: Fehlerbehebung nach dem Live-Test vom 13.10.2026

Urteil Sicherheits-Review vor dem Code (13.10.2026): **FREIGEGEBEN MIT AUFLAGEN**. Die Auflagen B1–B22 ([MVP](design-review-mvp.md)) und A1–A12 ([Live-Hinweis](design-review-live-hinweis.md)) gelten unverändert weiter; der Dialog bleibt ein erweiterungseigenes iframe.

## Befund und Ursache

Live-Test in Chrome: Auf claude.ai erschien der Live-Hinweis, Enter mit Test-IBAN ging aber ohne Dialog durch; nach Neuladen war der Tab gesperrt. Echte KI-Seiten werden nicht automatisiert; nachgestellt mit der claude.ai-Attrappe (`scripts/e2e/fake-site.mjs`, Aufbau aus dem Live-Test), vor der Änderung reproduziert:

1. **Dialog verschwand sofort.** Die Dialog-Wache verglich die Host-Grösse mit `innerWidth`. Ein `position: fixed; inset: 0`-Host ist auf Windows um die Scrollleiste schmaler → Wache meldete „manipuliert“ → fail-closed ohne sichtbaren Dialog (E2E: „Dialog bleibt sichtbar (Scrollleiste)“ rot).
2. **Senden ausserhalb von keydown/click.** Sendet eine Seite erst auf `keyup` (bzw. `keypress`) oder der Knopf auf `pointerdown`, kam die Nachricht trotz gestopptem keydown/click durch (E2E-Varianten `claude-keyup`, `claude-pointerdown` rot, IBAN „gesendet“).
3. **Neuladen:** Mit wiederhergestelltem Entwurf (mit und ohne Fund) und leerem Feld erschien in Attrappe und Fake-DOM kein Dialog ohne Sende-Geste; eine dritte Ursache war nicht nachstellbar. Der gesperrte Tab passt zu einem Dialog, dessen Host im Moment des Anzeigens noch intakt war und später (Scrollleiste/Neuaufbau) verworfen wurde – behoben durch 1. Regressionstest mit Gegentest bleibt.
4. **Microsoft 365 Copilot** (`copilot.cloud.microsoft`, `m365.cloud.microsoft`) fehlte ganz.

## Auflagen und Umsetzung

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Nur genau `https://copilot.cloud.microsoft/*` und `https://m365.cloud.microsoft/*`, keine Wildcard, `all_frames` unverändert; `frame-ancestors` exakt; Service Worker prüft `sender.origin` exakt; auf m365.cloud.microsoft nur im Chat-Feld reagieren | `manifest.json`, `background.js` (`SITE_ORIGINS`, `Object.hasOwn`), `adapters.js` (`m365copilot`, `onlyComposer`), `content.js` (`passive`, `passiveFiles`); Tests `manifest.test.mjs` (Origins, frame-ancestors), `content.test.mjs` „M365 Copilot“, E2E „Einfügen ausserhalb des Chat-Felds unberührt“ |
| 2 | `m365copilot` gleiche Standard-Semantik; unbekannte Site-ID nur einzeln ignorieren, nie „alles offen“; ADMX erzeugt | `policy.js` (leere Liste statt Standard bei nur unbekannten IDs), Test „allowedSites: unbekannte Site-ID“; ADMX/ADML per `npm run build` |
| 3 | Folgeereignisse nur stoppen, wenn das Auslöse-Ereignis gesendet hätte (Enter ohne Shift, ohne IME, im Feld); `insertLineBreak` nie; Merker bis keyup bzw. 1 s; Knopf mit `pointer*`/`mouse*`/`touch*`/`click`/`submit` im Window-Capture, immer aktueller Text; Labels nur per `getAttribute`; Vorfahren-Suche lockert nichts | `content.js` (`sendEnter`, `enterHeld`, Gesten-Schleife), `adapters.js` (`SEND_LABELS`, `boxOf`); Tests „Enter-Folgeereignisse …“, „claude.ai de-DE …“ |
| 4 | `clientWidth` nur bei `CSS1Compat` und 0–40 px Abzug, sonst `innerWidth`; Tests für Quirks-Mode und schmales html | `content.js` (`viewport`); Test „Dialog-Wache …“ (Scrollleiste intakt, BackCompat und `clientWidth` 10 fail-closed) |
| 5 | Leerer/wiederhergestellter Entwurf ohne Geste → kein Dialog; Gegentest mit Fund + Geste → Dialog | Test „Fall 2 (Neuladen)“; E2E „Neuladen mit Entwurf …“, „Gegentest“, „Neuladen leer …“ |
| 6 | E2E: `MAP * ~NOTFOUND` plus nur Attrappen-Hosts; Zertifikat nur per `--ignore-certificate-errors-spki-list`; Profil/Schlüssel im Temp-Ordner, gelöscht; installierter Browser, keine Abhängigkeiten | `scripts/e2e/e2e.mjs` |
| 7 | Keine Tests auf echten KI-Seiten, nie mit Arbeitgeber- oder Kunden-M365-Konto; Live-Test M365 nur durch den Inhaber | `docs/installation.md` (Prüfen) |
| 8 | Commit nur über die Pflicht-Prüfung | Git-Hook |
| P1 | Pflicht-Prüfung 13.10.2026 (MIT AUFLAGEN): `onlyComposer` nur für `m365.cloud.microsoft`, copilot.cloud.microsoft voll prüfen | `adapters.js`: zwei Einträge mit derselben ID `m365copilot`; Test „… copilot.cloud.microsoft voll geprüft“, E2E „Einfügen auf copilot.cloud.microsoft auch ausserhalb des Felds geprüft“ |
| P2 | Gesperrte Seite (`allowedSites`) und `blockWhenInactive` vor der Passivität auswerten (fail-closed) | `content.js` (`blockKind` in Datei-Klick, `onFiles`, `onInsert` nach `gate`); Tests „allowedSites ohne m365copilot …“, „M365 ohne erkanntes Chat-Feld und blockWhenInactive …“ |

Mutationsprobe: Jede der Änderungen (Fensterbreite, Quirks-Rückfall, Folgeereignisse, Merker, Knopf-Gesten, Passivität) einzeln zurückgedreht lässt `tests/content.test.mjs` rot werden.

Restrisiken (unverändert ehrlich): Eine Seite, die ohne DOM-Geste sendet, umgeht die Sperre – die Erweiterung schützt vor versehentlichem Senden, ist kein DLP gegen bösartige Seiten. Selektoren müssen bei Seitenumbauten nachgeführt werden.
