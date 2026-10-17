# Design-Review Marke AImori (16.10.2026)

Vorhaben: Umbenennung der Erweiterung auf die neue Marke (Name seit 17.10.2026 AImori, Review dazu unten) mit Signet „Helm-Schild“, Marken-Tokens, lokal mitgelieferten Schriften (Space Grotesk, Geist) und neuen Icons. Keine Funktionsänderung, keine Veröffentlichung, keine neue Domain; technische Kennungen bleiben.

Urteil Sicherheits-Review: **FREIGEGEBEN MIT AUFLAGEN** (vor dem Bauen).

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Schriften nur exakt `@fontsource-variable/space-grotesk@5.3.0` und `@fontsource-variable/geist@5.3.0`, `npm pack --ignore-scripts` gegen das Standard-Register, sha512 gegen `dist.integrity` prüfen und in `extension/fonts/PINS.json` festhalten; `.tmp` muss gitignoriert sein; nur `*.woff2` (latin, latin-ext) und OFL-Text kopieren, jede Datei beginnt mit `wOF2`; danach `.tmp` leeren; `package.json`/Lockfile unverändert | `extension/fonts/PINS.json`, Test `tests/marke.test.mjs` (SHA-256, `wOF2`, Lizenz), `package.json` und `package-lock.json` im Diff unverändert |
| 2 | CSP nur um `font-src 'self'` ergänzen (kein `data:`), `script-src`/`object-src` unverändert; keine `@font-face`/`url()` in Inhaltsskripten (Systemschrift-Rückfall), `fonts.css` nur in Erweiterungs-HTML | `manifest.json`, Tests `tests/marke.test.mjs` |
| 3 | Master-SVGs ohne `<script>`, `foreignObject`, `href`, `on*`, `<style>`, DOCTYPE/ENTITY, `url(` nur `url(#…)`; nicht in `web_accessible_resources` | Test `tests/marke.test.mjs` |
| 4 | Inline-Signet nur per `createElementNS`/`setAttribute`, Verlauf-IDs `dlx-` + Zähler, nur auf Erweiterungsseiten (dom.js ist kein Inhaltsskript), `primaryColor` erst nach `#rrggbb`-Prüfung | `extension/common/dom.js`, Tests `tests/marke.test.mjs` |
| 5 | Rasterer: feste Pfade, Eingaben nur `size`/`dot`, `size` auf Positivliste, `rgba`-API kompatibel, Ampel-Farben wie bisher | `extension/common/signet.js`, Tests `tests/marke.test.mjs` |
| 6 | Whitelabel-Prüfungen unverändert oder strenger; Tests für ungültige Farbe, Kontrast < 3:1, Steuerzeichen, > 40 Zeichen, Logo svg+xml ohne base64, Logo http(s) | Tests `tests/marke.test.mjs` |
| 7 | tokens.css mit eigenem SHA pinnen, Website-Vergleich ausdrücklich bedingt (Folgeschritt Website) | `tests/design.test.mjs` |
| 8 | Technische Kennungen unverändert (ID/`key`, Schema-Schlüssel, Registry/ADMX, Storage, `dlx-*`); in der ADML ändern sich nur Anzeigetexte | Diff-Prüfung im Commit-Text, Test `tests/marke.test.mjs` |
| 9 | Markenregel nur in `branding.js`, `_locales` und `docs/branding.md` | `docs/branding.md` |
| 10 | Screenshots nur mit Wegwerf-Profil, kein Netz ausser 127.0.0.1, nur Attrappen-/Demodaten; Einweg-Skript bleibt in `.tmp` | `docs/screenshots/aimori/` |
| 11 | Doku/Enterprise-Beispiele nur `example.com`, keine Aussage zum Hosting-Ort | Doku |

Restrisiken (tief): zusätzliche Parser-Angriffsfläche durch woff2 (gepinnt, Prüfsummen-Test, Updates nur mit neuem Review); eigener Rasterer (Positivliste, Tests); Website-Tokens laufen bis zum Website-Folgeschritt auseinander; Namensrechte der Marke sind vor einer Store-Veröffentlichung zu prüfen.

## Nachtrag 17.10.2026: Name AImori

Vorhaben: nur Anzeigename und Wortmarke wechseln auf AImori („AI“ vorn abgesetzt); Signet, Farben, Schriften, technische Kennungen, Rechte, CSP und Netz unverändert.

Urteil Sicherheits-Review: **FREIGEGEBEN MIT AUFLAGEN** (vor dem Bauen).

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Guard-Tests prüfen den Namen weiter | `tests/quelltext`, `ui-texte`, `background`, `marke` |
| 2 | Nach `npm run build` ADMX unverändert, in der ADML nur Anzeigetexte | `git diff` der `.admx` leer, Test „Technische Kennungen bleiben“ |
| 3 | `_locales` in allen Sprachen, Längen eingehalten, keine HTML-/Platzhalter-Injektion | alle sechs `messages.json` |
| 4 | „AI“ nur als Literal-Span, Whitelabel-Name nur als Text; Test mit `<img onerror>` | `extension/common/dom.js`, `tests/marke.test.mjs` |
| 5 | `aria-label` der Signets statisch | `extension/icons/signet*.svg` |
| 6 | Beispiel-`updateUrl` nur unter `updates.example.com` | `enterprise/mandanten/beispiel.json`, Tests |
| 7 | Screenshots nur per E2E-Skript, Wegwerfprofil, Attrappen, ohne Netz | `docs/screenshots/aimori/` |
| 8 | Alte Screenshots nur im versionierten alten Ordner löschen | per `git rm`, über Git wiederherstellbar |
| 9–10 | Keine Veröffentlichung; Commits über die Pflicht-Prüfung | – |
