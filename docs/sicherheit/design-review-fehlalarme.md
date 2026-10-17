# Design-Review: Fehlalarme, Stufen, „Kein sensibler Wert“ (14.10.2026)

Anlass 14.10.2026 (Hinweis aus der Praxis: nicht jede zufällige Zahl als Bankkonto melden). Sicherheits-Review vor dem Bauen: **FREIGEGEBEN MIT AUFLAGEN** (PBKDF2 nicht verlangt, stattdessen HMAC; Ein-Klick nicht freigegeben). Umsetzungsorte je Auflage:

| Nr | Auflage (gekürzt) | Umsetzung |
|----|-------------------|-----------|
| 1 | Richtlinie `uncertainFindings` = `hint` (Standard) / `warn` / `enforce` in Schema und ADMX; geänderte Wirkung (Telefon ohne Kontextwort stoppt nicht mehr) dokumentieren | `extension/managed_schema.json`, `scripts/build-admx.mjs` (+ `npm run build`), `policy.js`, `content.js` (`counted`, `loud`); `docs/fehlalarme.md` „Geänderte Wirkung“, `docs/einstellungen.md`; Tests `tests/fehlalarme.test.mjs`, `tests/content.test.mjs` (enforce) |
| 2 | Verwerfen nur bei Typen ohne Prüfziffer und IPv4; Prüfziffer-Typen höchstens „unsicher“ | `engine.js` (`fmtOnly`, `around`); Test „Auflage 2“ |
| 3 | Keine Lücke bei Karte + CVV (3–4 Ziffern) oder `MM/YY`; Unit-Tests positiv und negativ | `engine.js` (`around`), `packs-global.js` (`card` liefert die längste gültige Nummer an einer Gruppengrenze – schliesst eine vorbestehende Lücke); Test „Auflage 3“, Grenzfälle in `scripts/fehlalarm.mjs` |
| 4 | Nur Pfadsegmente verwerfen; Query/Fragment höchstens „unsicher“ | `engine.js` (`around` → `query`); Test „Auflage 4“ |
| 5 | Linear: ein kleines Fenster je Fund, Längengrenze bleibt; Laufzeittest 1 MB Ziffern- und Hex-Text | `around` liest höchstens ±300 Zeichen; `MAX_LEN` unverändert; Test „Auflage 5“ (1 MB in Blöcken der Scan-Grenze, innerhalb des Zeitbudgets) |
| 6 | SW prüft selbst: `warn`, send/paste, `allowNotSensitive` + `allowUserOverride`; Nonce gebunden an Tab, Frame 0 und `documentId`; `ignoreAdd` nur aus genau diesem Content Script; jede Nonce nur einmal | `background.js` (`decisionAllowed`, Freigabe in `storage.session` `dlx.grants` 60 s, `ignoreAdd` nur über `fromContent`, Freigabe wird beim ersten Versuch verbraucht); Tests in `tests/background.test.mjs` |
| 7 | „Liste löschen“ nur bei exakter `options.html`-URL; beim Lesen Abgelaufenes/Falschformatiges verwerfen; Richtlinie aus → Liste löschen und ignorieren | `background.js` (`ignoreReset`, `loadIgnore`); Tests „Pruefung beim Lesen …“, „nur bei warn …“ |
| 8 | Hashes, Schlüssel, Werte nie in Zähler, Logs, Fehlermeldungen; Zähler nur `notsensitive` als Zahl | `stats.js` (neue Entscheidung), `state` liefert nur die Anzahl; Tests prüfen, dass weder Hash noch Schlüssel in `state` bzw. Nachrichten stehen |
| 9 | Kein Ein-Klick: Haken mit Text „… 30 Tage nicht mehr gemeldet …“; betroffene Werte maskiert mit Typ und Anzahl | `ui/dialog.js` (Haken + Knopf, erst nach Haken aktiv), Texte in 6 Sprachen. **Abweichung:** Der Dialog zeigt Typ und Anzahl, aber keine maskierten Werte – die strengere MVP-Auflage (Dialog und Service Worker kennen nie Werte, `docs/sicherheit/design-review-mvp.md`) geht vor; auch eine Maske gäbe Teile des Werts an das iframe. |
| 10 | HMAC-SHA-256(Schlüssel, Typ + ":" + normalisierter Wert); kein Ignorieren für Telefon/IPv4; Schlüssel nur im Arbeitsspeicher des Content Scripts, nie ins DOM/iframe/postMessage | `dictionary.js` (`hmacHex`, RFC-4231-Test), `engine.js` (`ignoreHash`, `ignorable`), `content.js` (`ignoreValues`), `policy.js` (`engineConfig`); Schlüssel nur in der `cfg`-Antwort an das Content Script |
| 11 | Messung auch der „sicher“-Quote auf Testwerten (100 %); Umgehungs-Testfälle (Karte mit CVV, Wert in Query, `v` davor); nur erfundene/Doku-Werte | `scripts/fehlalarm.mjs` (Trefferquote sicher 61/61, Grenzfälle 7/7), `tests/helpers/testwerte.mjs` (gemeinsam mit `tests/engine.test.mjs`) |
| 12 | Keine neuen Rechte | `manifest.json` unverändert; `npm run check` prüft `permissions = ["storage"]` |

## Restrisiken
- Mittel: absichtliches Tarnen (Version-Präfix, Pfadsegment, angehängte Ziffern) – bei einem Werkzeug gegen versehentliche Lecks hinnehmbar; strenge Organisationen setzen `uncertainFindings=enforce`.
- Mittel: Telefonnummern ohne Kontextwort stoppen nicht mehr – dokumentiert, `enforce` stellt das alte Verhalten her.
- Tief: Durchprobieren der HMAC-Werte mit Zugriff aufs Browserprofil (AHV ~10⁹) – Ablauf 30 Tage, 500 Einträge.
- Tief: `storage.local` ist für Content Scripts schreibbar – Prüfung beim Lesen, Richtlinie aus = Liste gelöscht.
- Tief: Liste gilt auf allen Seiten – im Bestätigungstext genannt.
