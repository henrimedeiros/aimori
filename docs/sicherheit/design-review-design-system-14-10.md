# Design-Review: Erweiterung an das Design-System der Website angleichen (14.10.2026)

Vorhaben: Popup, Einstellungen, Hinweis-Leiste und Vollbild-Hinweis optisch an das Design-System der Website (Website-Repo, `design-system.md`, Stand 14.10.2026) angleichen. Nur Optik/UX: keine Funktionsänderung, keine neuen Rechte, `tokens.css` bleibt byte-gleich, geändert wird nur `extension/ui/ui.css` (dazu Tests und Bilder).

Urteil Sicherheits-Review (vor dem Bauen, 14.10.2026): **freigegeben mit Auflagen**.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Keine externen Quellen in ui.css (`@import`, `url(`, `image-set(`, `@font-face`, `src:`); `content:` nur feste Texte, nie `attr()`; Regex-Test | `tests/design.test.mjs` „Stylesheets laden nichts nach“ (erweitert um `image-set(`, `src:`, `attr(`); einziges neues `content:` ist der feste Pfeil am Link „Mehr erfahren“ (mit leerem Alternativtext) und eine leere Tippfläche |
| 2 | tokens.css byte-gleich (SHA-Test), Farben nur per `var(--…)`, keine Farbwerte, auch nicht als Rückfallwert in `var()` | `tokens.css` unverändert; Tests „SHA-256 passt“, „Farben nur aus den Tokens“, neu „keine Token- oder Fokusfarben neu“ (verbietet `var(--x, …)`) |
| 3 | Leiste und Dialog nie verstecken oder nach hinten schieben (`opacity` < 1, `visibility`, `display:none`, `pointer-events:none`, `z-index`, `clip`, Verschiebungen) | keine solchen Regeln; Test „Leiste und Dialog werden von ui.css nie versteckt“; Host-Element und iframe-Stile (`content.js`) unverändert |
| 4 | „Trotzdem“ nur Zweit-Stil, nie `--redact`/Marken-/Whitelabel-Farbe; sicherer Hauptknopf mindestens so gross und so weit vorne | `.dlx-trotzdem` erbt den Zweit-Stil (Fläche `--raised`, Rand `--line`) und setzt keine eigene Grösse; Hauptknopf `--dlx-brand` = `--redact`; Reihenfolge der Knöpfe (`dialog.js`) unverändert; Test „Trotzdem nur im Zweit-Stil“ |
| 5 | Whitelabel nur über die bestehenden, kontrollierten Variablen; keine neuen Variablen, die `--redact` oder die Fokusfarbe überschreiben | ui.css definiert nur `--dlx-*` (Test); `applyBranding()` in `common/dom.js` unverändert |
| 6 | `:focus-visible` 2 px Akzent, 3 px Abstand, nie `outline:none`; Kontrast AA; Startfokus, Enter/Esc unverändert | `:focus-visible` wie Website (Felder 1 px Abstand); Test verbietet `outline: none/0`; Farben nur Website-Tokens (dort AA in Hell/Dunkel geprüft); keine JS-Änderung |
| 7 | Fundstelle zeigt nur Art, nie den erkannten Wert | nur Stil von `mark.dlx-fund` geändert (Rundung/Innenabstand wie Website-`mark`), Inhalt unverändert aus `dialog.js` |
| 8 | Falls JS angefasst wird: nur feste Klassennamen | kein JS geändert; Diff von manifest.json, background.js, Content Script leer |
| 9 | Screenshots nur gegen lokale Attrappen, frisches Profil, erfundene Testwerte, keine echten Domains; Metadaten prüfen; `.tmp/` gitignoriert | Bilder aus `scripts/e2e/e2e.mjs` mit `E2E_BILDER` (Wegwerf-Profil, Attrappe auf 127.0.0.1, SWIFT-Muster-IBAN); PNG-Chunks geprüft: keine `tEXt`/`iTXt`/`zTXt`/`eXIf`/`tIME` |
| 10 | Nur eigene Pfade committen, `npm test` und E2E vorher grün, nie `--no-verify` | `npm test` und `node scripts/e2e/e2e.mjs` grün vor dem Commit |

Restrisiken: CSS kann die Gewichtung im Dialog verschieben (Gegenmittel Auflagen 3/4 und Tests); später hinzukommendes `url()`/`@import` (Regex-Test); echte Daten in Doku-Bildern (Auflage 9).

## Was sich optisch ändert

- Knöpfe wie die Website: Standard `knopf-zweit` (Fläche mit 1 px Rand) 38 px, gross 44 px, Hauptknopf dunkel (`--redact`), in der Leiste 30 px wie die Website-Leiste mit Tippfläche über die volle Leistenhöhe.
- Fokus 2 px Akzent mit 3 px Abstand; Links mit Unterstrich-Abstand wie die Website; „Mehr erfahren“ als Textlink mit Pfeil.
- Popup: Status-Karte mit `--shadow`, Status-Symbol als Symbol-Kachel (40 × 40, `--r2`), Hinweis-Kasten mit `--r2`.
- Einstellungen: Auswahl-Chips und Auswahlfelder 38 px; Produktname wie die Wortmarke der Website.
- `prefers-reduced-motion: reduce`: keine Übergänge, kein Druck-Effekt.
