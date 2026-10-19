# Design-Review: Hinweis-Leiste oberhalb des Eingabefelds (14.10.2026)

Vorhaben: Meldungen (Tippen, Senden, Einfügen, Datei, Seite gesperrt) erscheinen nicht mehr als Vollbild-Dialog, sondern als schmale Leiste direkt oberhalb des Eingabefelds; Erweiterung im Look der Website (Tokens, Signet, Hell/Dunkel). Vorgabe 13.10.2026: Website und Erweiterung sehen gleich aus, Warnmeldungen immer klein oberhalb des Chat-Eingabefelds, damit sie nicht stören.

Urteil Sicherheits-Review (vor dem Bauen, 14.10.2026): **freigegeben mit Auflagen**.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Senden-Klick nach Override nur an das beim Anhalten erkannte Element (Referenz, kein neuer Selektor); vor dem Klick verbunden, sichtbar, nicht deaktiviert, im selben Behälter wie das Feld – sonst kein Klick, Nutzer drückt Enter | `content.js` `clickRemembered()` |
| 2 | Vor dem Klick Text-Hash neu berechnen = bestätigter Hash, sonst kein Klick und neu prüfen; Bypass genau einmal, 30 s, nur dieser Tab/Frame, nie Einfügen/Datei | `content.js` `clickRemembered()`, `onSend()` |
| 3 | Kein künstliches Enter/Keyboard-Event, kein `form.submit()`; nur der eine `click()` | `content.js` |
| 4 | Override erst nach bestätigter Entscheidung des Service Workers (Nonce, `confirmed=true`, `allowUserOverride`, B3); nie auf Nachricht aus dem Frame selbst | `background.js` `decisionAllowed()`, Content Script nimmt nur `decision` vom Service Worker |
| 5 | „Trotzdem“: nur `click` mit `isTrusted`, keine Tastenwiederholung, Startfokus nie auf „Trotzdem“; zweiter Klick frühestens 400 ms, spätestens 4 s, derselbe Knopf, Knopf verschiebt sich nicht | `dialog.js` `armOverride()` |
| 6 | Override-Knopf immer neutral; Whitelabel-Farben färben nur Signet, Schwärzen, Markierung; strenge `#rrggbb`-Prüfung, bei zu wenig Kontrast Standardfarbe | `dom.js` `applyBranding()`, `ui.css` |
| 7 | Zusätzlich IntersectionObserver v2 im Frame (`trackVisibility`, `delay 100`); „Trotzdem“ nur, wenn `isVisible` seit ≥ 400 ms; Verlust: Senden/Einfügen fail-closed, Live-Hinweis ausblenden | `dialog.js` `watchVisibility()` |
| 8 | Host-Stile inline `!important` (transform/filter/clip-path none, opacity 1); Wache prüft berechnete transform/filter/clip-path und Vorfahren; Host direkt an `documentElement` | `content.js` `HOST_BASE`, `hostIntact()` |
| 9 | Prüfpunkte über den Knöpfen; Nachführen höchstens alle 100 ms; nach dem Nachführen Knöpfe 400 ms gesperrt | `content.js` `probePoints()`, `follow()`/`placeHost()`, Meldung `moved`; `background.js` `nudge()`; `dialog.js` (`nudge` → Knöpfe 400 ms gesperrt) |
| 10 | Art des Eintrags (`send`/`paste`/`live` …) legt nur der Service Worker fest; Live-Nonce erlaubt nur `redact`/`hide`; feste Liste erlaubter Entscheidungen je Art | `background.js` `ALLOWED`, `decisionAllowed()` |
| 11 | Schlüssel mit `frameId` oder Live nur im Top-Frame; Eintrag löschen bei `tabs.onRemoved`, neuem `hello` eines anderen Frames, Entladen der Seite | Content Script läuft nur im Top-Frame (`all_frames:false`, `fromContent` verlangt `frameId 0`) → ein Eintrag je Tab; Frame wird beim ersten `hello` gebunden; `tabs.onRemoved`, `pagehide` → `cancelPending` |
| 12 | `refresh` ohne Daten, gedrosselt (≤ 4/s); `hello` nur Typ-IDs, Anzahlen, Layout, Thema aus festen Listen | `background.js` `nudge()` |
| 13 | Bei offener Sende-Leiste wird jeder Enter-/Senden-Versuch erneut gestoppt; jede Eingabe im Feld (auch von der Seite) = Abbrechen | `content.js` `gate()`, `input`-Listener |
| 14 | Rückfall-Kette Leiste → Vollbild → Popupfenster vollständig, Test je Stufe | `content.js` `showDialog()`; Tests `content.test.mjs`, E2E |
| 15 | Test: `tokens.css` ohne `@import`, `url(`, externe Fonts; Icon-Skript nur Build-Skript, Wegwerf-Profil, ohne Netz, Edge-Version vermerkt | `tests/design.test.mjs`; Icons ohne Edge in reinem Node gerechnet (`scripts/make-icons.mjs`, nur Build-Skript), damit entfällt der Browser-Teil |
| 16 | Screenshots/Attrappen nur synthetische Testwerte | `scripts/e2e/` |
| 17 | E2E: `pointer-events:none`-Attrappe über der Leiste (kein Override), Textänderung zwischen Override und Klick (kein Senden), vertauschter Senden-Knopf (kein Klick), Override mit Live-Nonce (abgewiesen) | `scripts/e2e/e2e.mjs` (Schritte 6–8), `tests/background.test.mjs`, `tests/dialog.test.mjs` |

Restrisiken: Eine bösartige Seite kann Text über eigenes JS verschicken (Grenze jeder Erweiterung, Gegenmittel: Seite per Richtlinie sperren); programmatischer `click()` wird von manchen Seiten ignoriert (dann Enter, sicher); Host-Element verrät die aktive Erweiterung (wie bisher); IntersectionObserver v2 nur in Chromium – ohne `isVisible` kein Override.

Sicherheits-Review beim Commit: Auflagen der ersten Versuche (Aufrufer im selben Commit, Logo nur data:image base64, Beobachter beim Neuzeichnen trennen, Whitelist- und nudge-Tests im selben Commit) umgesetzt in 16e8930.
