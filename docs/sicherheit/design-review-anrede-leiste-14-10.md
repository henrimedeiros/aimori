# Design-Review: Anrede + einzelner Name, grössere Warnleiste (14.10.2026)

Anlass: Handtest vom 14.10.2026 – „Herr XY …“ löste keine Warnung aus; die Leiste über dem Chat-Feld war zu klein, die Marke nicht sichtbar.

Ursache Erkennung (belegt per Probe gegen `engine.scan`): Der Namensbaustein `CAP` in `extension/engine/packs-context.js` verlangt nach dem Grossbuchstaben einen Kleinbuchstaben. „Herr Mustermann“ wurde schon erkannt, „Herr XY“ und „Herr MÜLLER“ nicht. Kleingeschriebenes („Herr xy“) bleibt bewusst ohne Fund (sonst Fehlalarme wie „Frau sein“).

Vorhaben: (1) Nach einer Anrede auch GANZ GROSS geschriebene Namen, „Dr.“ als Anrede, Titelzusätze, kleine Sperrliste. Ein Name allein bleibt ohne Fund. (2) Leiste 56 px (zweizeilig 100 px), Schrift 15 px, Knöpfe 36 px, Signet 28 px und Produktname aus dem Branding; nichts an Manifest, CSP, Service Worker, Nonce, Entscheidungslogik.

Urteil Sicherheits-Review (vor dem Bauen, 14.10.2026): **freigegeben mit Auflagen**.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Feste Grenzen in der Regex, keine verschachtelten offenen Quantoren; Umlaute als ein Zeichen; 100k-Eingaben < 50 ms | `UPPER = UP(?:[-'’]?UP){1,29}`, `UP = \p{Lu}\p{M}{0,2}`, Zusätze `{0,3}`, Titel `{0,2}`. Statt NFC-Umschreiben (würde die Offsets der Fundstellen verschieben) zählen kombinierende Zeichen `\p{M}` im Namen mit – „Müller“ wird erkannt (Test). Test „Anrede-Muster: 100k-Eingaben … < 50 ms“ (GROSS-Folgen, Bindestrich-Ketten, „Dr. Dr. …“, „Herr Dr. med. …“) in `tests/kontext.test.mjs` |
| 2 | Name beginnt und endet mit Buchstabe; „XY-“, „-XY“, „--“ kein Name | Bindestrich/Apostroph nur zwischen Buchstaben, danach Abschluss `(?![\p{L}\p{N}_'’-])`; Negativtests |
| 3 | Sperrliste fest, ohne Gross/klein, auch für GROSS; Titelzusätze (med, phil, iur, rer, sc, h.c.) und Kettentitel; kann nur unterdrücken | `NOT_NAME` (klein verglichen), führende Sperrwörter werden übersprungen („Herr Doktor Muster“ → „Muster“, „Herr Doktor“ → nichts); Zusätze in `ZUS`, Kettentitel in `ACAD`; Tests „FRAU DOKTOR“, „Frau CEO“, „Herr HR“, „Fr. CHF“ |
| 4 | Keine Ausweitung der Meldelogik; Name allein ohne Fund, auch „Dr. XY“; bestehende Positivtests unverändert grün | Ableitung unverändert (Name nur als Personenbezug); Tests „Herr XY ruft morgen an.“, „Dr. XY ruft an.“ ohne Fund; `npm test` 554 grün |
| 5 | Messung vorher/nachher nur als Zahlen, nicht schlechter | `node scripts/fehlalarm.mjs` vorher/nachher: Zufallsziffern 0 sicher / 19 683 unsicher → unverändert; Code/Log/Arten 389 / 9 068 → unverändert; Kontext-Arten je 0 → 0; Trefferquote 236/236 → 236/236; Grenzfälle 0 Abweichungen; neue Art `anrede_ohne_namen` 0 von 20 000; Ziel erreicht |
| 6 | Nur erfundene Namen | Mustermann, Muster, Beispiel, Example, Exemple, Esempio, Ejemplo, XY |
| 7 | Produktname geprüft: String, getrimmt, ≤ 40 Zeichen, ohne Steuer-/Bidi-Zeichen, sonst Standardname; nur `textContent` über `h()`; Signet nur aus dem Paket | `DLX.dom.productName()` in `extension/common/dom.js` (entfernt `\p{Cc}`/`\p{Cf}`, darin U+202A–202E und U+2066–2069), genutzt in Leiste und Karte; Logo weiter nur über `mark()` (data:-PNG/SVG der Richtlinie oder Signet); Test in `tests/dialog.test.mjs` |
| 8 | Prüfpunkte decken die ganze Leiste ab (Ecken, Mitte, Knöpfe, Signet, Name); Takt unverändert | `probePoints()` in `extension/content/content.js`: Signet, Produktname, Mitte, drei Knopfpositionen, vier Ecken; Takt (`GUARD_MS`, `PLACE_MS`) unverändert; iframe, Shadow Root, z-index, pointer-events unverändert |
| 9 | Verdeckt Feld und Senden-Knopf nicht; 200 % Zoom und 360 px ohne Überlauf, zweizeilig bedienbar; im E2E | Leiste sitzt weiter über dem Eingabe-Behälter. Neu je Art: Live-Hinweis einzeilig ab 700 px, sonst zweizeilig, unter 420 px kein Live-Hinweis (Sende-Prüfung bleibt); Senden (bis 5 Knöpfe) zweizeilig unter 1100 px, unter 680 px Vollbild-Karte – vorher verschwand der Text bei vielen Knöpfen ganz. E2E-Schritt `leiste` (1280/640/360 px, tippen und senden): 19 Prüfpunkte OK |
| 10 | Manifest, CSP, web_accessible_resources, Service Worker, Nonce, Entscheidungslogik unverändert; nur Systemschrift | Diff berührt nur `packs-context.js`, `content.js` (Masse, Prüfpunkte), `dialog.js` (Darstellung), `dom.js`, `ui.css`, Tests, Messung, Doku |
| 11 | Screenshots nur Attrappe, erfundene Inhalte, ohne Profil/Tabs | Ausschnitte per CDP aus der lokalen Attrappe, nur Leiste und Feld |


Restrisiken: Abkürzungen nach einer Anrede („Herr SVP“) gelten als Name – folgenlos ohne Stichwort, Sperrliste bei Bedarf nachpflegen; irreführender Produktname über die Richtlinie (Admin) – Auflage 7; grössere Fläche für Überlagerung – Auflage 8.
