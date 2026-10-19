# Design-Review: Warnung beim Bildschirmteilen – 17.10.2026

Urteil des Sicherheits-Reviews vor dem Bau: **FREIGEGEBEN MIT AUFLAGEN** (12 Auflagen). `world: MAIN` auf den Meeting-Seiten ist vertretbar: Das Skript liest nur den Status, greift auf keine Medien zu, steht nur auf fest erteilten Origins, und Missbrauch wirkt nur lokal (ein Hinweis zu viel oder zu wenig). Einen Weg ohne MAIN gibt es in MV3 nicht. Doku: [Warnung beim Bildschirmteilen](../bildschirm-teilen.md).

| Nr. | Auflage (Kurzfassung) | Umsetzung (Ort) | Beleg |
|---|---|---|---|
| 1 | MAIN-Hülle ändert nichts: Original in Closure, keine Globalen, kein `toString`-Tarnen; `const p = Reflect.apply(orig, this, args); p.then(onStream, () => {}); return p;`; eigener Code wirft nie | `extension/content/teilen-seite.js` | `tests/quelltext.test.mjs` „Bildschirmteilen: Hülle ohne Medienzugriff …“; E2E `teilen` (Seite erhält Stream und Fläche) |
| 2 | Ende sicher erkennen: `ended` + 1-s-Abfrage + `inactive`; mehrere Freigaben zählen; Timer beenden, Tracks nur solange festhalten | `teilen-seite.js` `sweep()`/`onStream()` | E2E `teilen` (Ende per `track.stop()` ohne `ended`) |
| 3 | Nur Strings, Regex `^(an:(browser\|window\|monitor)\|aus)$`; Drossel 2/s im Skript, Service Worker verwirft Spam je Tab | `content/teilen.js` (2/s, letztes Signal nachgereicht), `background.js` `shareSignal()` (3/s) | `tests/quelltext.test.mjs`, `tests/background.test.mjs` „Drossel je Tab …“ |
| 4 | Kein Rückkanal: nie Nachrichten an Meeting-Tabs; KI-Tab erhält nur `{on, mode}` | `background.js` `shareTell()` nur an KI-Tabs, die gefragt haben; Meeting-Tab wird aus den Empfängern gestrichen | `tests/background.test.mjs` „… nie Rückkanal“ |
| 5 | Exakter Host, `*.zoom.us` nur als Endung, Port leer, `https:` | `background.js` `shareHostOk()`, `shareSignal()` | `tests/background.test.mjs` (Fremd-Hosts, Port, http, Unterframe, Lebenszyklus, Zusatzfelder) |
| 6 | Registrieren nur bei Richtlinie nicht off UND erteiltem Recht; beim Zurückgeben nur, was keine andere Funktion braucht; breites `https://*/*` löst ohne Richtlinie nichts aus | `background.js` `srcSyncNow()` (gemeinsamer Bedarf `wanted`), `shareRegister()` | `tests/background.test.mjs` „Skripte nur für erteilte …“, „off gibt nur die Meeting-Origins zurück …“ |
| 7 | Zustand in `storage.session`, nach Neustart wiederherstellen, verschwundene Tabs verwerfen, keine URLs/Titel | `background.js` `shareLoad()`/`shareEdit()` | `tests/background.test.mjs` „… Neustart stellt Zustand …“ |
| 8 | Verdecken wirksam: hohe `priority`, Pixeltest, Fälle Textfüllfarbe/`::selection`/Emoji prüfen und dokumentieren | `content/content.js` `shareMask()` (`priority` 1000, `color`/`-webkit-text-fill-color: transparent`) | E2E `teilen` (Pixeltest, Textfüllfarbe geprüft, Markierung gemessen und in der Doku genannt) |
| 9 | Hinweis nur Typ und Anzahl, keine Konsole, entfernter Host erst im nächsten 1,5-s-Takt | `content/content.js` `shareShow()` | `tests/quelltext.test.mjs` (kein `console`), E2E (kein Wert, neutrales Element) |
| 10 | Doku: Unterdrücken, Fingerprinting, iframe ohne Hülle, `preferCurrentTab` | `docs/bildschirm-teilen.md` „Was nicht zuverlässig geht“ | – |
| 11 | Test-Flags nur im Wegwerf-Profil; Paket ohne feste Hostrechte; Netzwerk-Wache ohne echte Meeting-Hosts | `scripts/e2e/e2e.mjs` (`--auto-select-tab-capture-source-by-title` nur dort), `scripts/pack-store.mjs` `manifestProblems()` | `tests/pack-store.test.mjs`, E2E Netzwerk-Sperrtest |
| 12 | Store-Begründung und Datenschutztext; Folge-Review des Diffs | `docs/bildschirm-teilen.md` „Store-Begründung“; Sicherheits-Review beim Commit | – |

Restrisiken (tief bis mittel): Erkennung von AImori durch die Meeting-Seite, gefälschte oder unterdrückte Signale, Lücken beim Verdecken (Tippen, `textarea`, Markierung). Gegenmassnahme: ehrliche Doku und Hinweistext „Hilfe, kein Schutz“.
