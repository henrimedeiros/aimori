# Design-Review: Tastenkürzel und Pause (17.10.2026)

Grundlage ist das Design-Review „Alltag“ vom 14.10.2026 (Urteil **FREIGEGEBEN MIT AUFLAGEN**, nie umgesetzt). Dieser Stand übernimmt daraus nur Tastenkürzel und Pause, neu aufgebaut auf dem aktuellen Code; Pause-Knopf im Popup, Monatsrückblick und Kopier-Hinweis sind nicht enthalten. Das Platzhalter-Kürzel (im Review vom 14.10.2026 mit Alt+Shift+L freigegeben) kam am 19.10.2026 dazu, unter denselben Auflagen.

Kürzel (`manifest.json` `commands`, Standard, im Browser änderbar):

| Befehl | Standard | Wirkung |
|---|---|---|
| `redact-all` | Alt+Shift+S | Text im Eingabefeld vor dem Senden schwärzen (bei offener Meldung wie „Schwärzen“) |
| `placeholder-all` | Alt+Shift+L | Werte im Eingabefeld durch Platzhalter wie `[IBAN_1]` ersetzen (bei offener Meldung wie „Platzhalter“); nur mit `allowPlaceholders` |
| `toggle-pause` | Alt+Shift+O | Schutz 15 Minuten pausieren / wieder einschalten |
| `_execute_action` | Alt+Shift+K | Popup öffnen (macht der Browser selbst, kein Code) |

Edge vergibt Alt+Shift+P und Alt+Shift+X nicht an Erweiterungen (E2E 14.10.2026).

| Nr | Auflage (14.10.2026) | Umsetzung |
|---|---|---|
| 1 | `onCommand`: ohne Tab nichts tun; Seiten-Erlaubnis und KI-Sperre prüfen | `background.js` `onCommand` (ohne gültige Tab-ID nichts); das Content Script prüft bei `cmd` `siteAllowed()`, `aiBlocked` und offene Meldung; andere Seiten haben keinen Empfänger |
| 2 | Offene Meldung nur zu Tab und aktuellem Dokument; `choice` nur aus fester Zuordnung, `ALLOWED` gilt | `background.js` `COMMANDS` (nur `redact` und `pseudonym`; `pseudonym` nur mit `allowPlaceholders`, ohne Richtlinie kein Auftrag ans Content Script), `decisionAllowed()`, Nachricht mit `documentId` der Meldung, gezählt erst nach `{ok:true}` des Content Scripts; Tests `tests/background.test.mjs` |
| 3 | `{t:'cmd'}` nur vom Service Worker | `content/content.js` Listener (bestehende Absenderprüfung: eigene ID, ohne `sender.tab`); Test `tests/content.test.mjs` |
| 4 | Kürzel-Seite nur feste Konstante je Browser; Anzeige per `textContent` | `ui/options.js` (Abschnitt Tastenkürzel, `edge://`- bzw. `chrome://extensions/shortcuts`) |
| 5 | Pause setzt nur der Service Worker | `background.js` `togglePause()`, nur aus `chrome.commands.onCommand`; keine Nachricht kann sie setzen |
| 6 | `until > now + 15 min` = ungültig, löschen | `background.js` `readPause()`; Test „manipulierte oder zu lange Werte“ |
| 7 | `allowPause` bei jedem `cfg` frisch; bei `false`/Richtlinienwechsel Pause löschen; block/KI-Sperre/`blockWhenInactive` gelten weiter | Richtlinie `allowPause` (nur verwaltet, Standard `true`, Schema/ADMX); in der Pause fallen nur Funde mit `warn` bei `allowUserOverride: true` weg (`content.js` `check()`), „Nur schwärzen“, `block` und alle Funde bei `allowUserOverride: false` bleiben; Tests in `tests/content.test.mjs` |
| 8 | Badge „II“ beim Ablauf per `chrome.alarms` entfernen | Recht `alarms` (ohne Installationswarnung), Alarm `dlx-pause`; `scripts/check.mjs` lässt nur genau diese Rechte und genau die vier Befehle zu |

Restrisiko (Sicherheits-Review 14.10.2026): Wiederholtes Pausieren umgeht Warnungen, die der Benutzer ohnehin übergehen darf; nur `allowPause: false` verhindert es. Pausen werden nicht gezählt. Keine Daten verlassen den Browser; es gibt keinen Netzwerkzugriff.
