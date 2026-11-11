# Design-Review: Lange Texte beim Senden und weitere Dateiformate (11.11.2026)

Urteil: **AUSSTEHEND** (Entwurf zur Sicherheitsprüfung; vor einer Veröffentlichung einzuholen). Grundlage: MVP-Review (Auflage B13), Datei-Uploads vom 17.10.2026 (`design-review-datei-uploads-17-10.md`), Dokumente A–D vom 16.10.2026.

Vorhaben: (A) Senden und Einfügen prüfen Texte bis 1 Million Zeichen statt 200 000. (B) Der Datei-Leser `extension/engine/datei.js` liest zusätzlich PowerPoint (PPTX), OpenDocument (ODT/ODS/ODP) und PDF-Ströme mit weiteren Kompressionen; Zeilenumbruch und Tab in Word-Dateien gehen nicht mehr verloren. Keine neuen Rechte, kein Netz, keine Abhängigkeit, kein Speicher.

## A. Lange Texte (ändert Auflage B13)

| Punkt | Bisher | Neu | Umsetzung |
|---|---|---|---|
| Höchstlänge | 200 000 Zeichen überall | Senden/Einfügen 1 000 000 (`cfg.long`), sonst 200 000 | `engine/engine.js` `MAX_LONG`, `content/content.js` `scanLong` in `check()` und `redactIn()` |
| Zeitbudget | 150 ms je Prüfung | 150 ms je angefangene 200 000 Zeichen, höchstens 750 ms; Live-Hinweis, Antworten, Zwischenablage weiter 150 ms | `engine.budgetFor` |
| Varianten (verschleierte Daten) | zusammen höchstens 1 Mio. Zeichen | bei `long` 5 Mio. Zeichen; darüber weiter „nicht prüfbar“ | `engine/entschleiern.js` `LIMITS.totalLong` |
| Dokument-Fingerabdrücke | 150 ms | wächst wie das Engine-Budget; über 1 Mio. Zeichen festes Budget (Sperre bleibt Sperre) | `engine/fingerabdruck.js` `scan(…, ms)`, `content.js` `check()` |

| Über 1 Mio. bis 5 Mio. Zeichen | „nicht prüfbar“ | Senden bzw. Einfügen wird angehalten und der Text wie ein Dokument in Zeitscheiben geprüft (10 000 Zeichen je Stück, höchstens 120 s, Warte-Leiste mit Abbrechen); Fingerabdrücke und versteckte Anweisungen mit ihren Lang-Fassungen. Ohne Fund: genau ein `click()` auf den gemerkten Senden-Knopf über den bestehenden Weg (`clickRemembered`, Ausnahme nur für genau diesen Text), ohne Knopf Hinweis „noch einmal senden“; beim Einfügen wird der Text eingesetzt. Fehler, Abbruch oder geänderter Text: nichts geht weiter | `content/content.js` `checkLongText`, `veryLong`; Tests „Sehr langer Text …“ in `tests/content.test.mjs` |

Neu gegenüber den Auflagen zum Senden-Knopf: Der eine Klick folgt hier ohne Entscheidung in der Leiste, weil die Prüfung nichts gefunden hat (wie bei Dateien, die nach der Prüfung weitergereicht werden). In Zeitscheiben sieht die Kontextprüfung jeweils nur ein Stück: Listen und Kombinationen über Stückgrenzen hinweg zählen nicht zusammen (wie bei Dokumenten).

Fail-closed bleibt: über der Grenze, bei Zeitüberschreitung und bei weggelassenen Varianten gilt der Text als „nicht prüfbar“. Gemessen (Entwicklungs-PC): 1 Mio. Zeichen Fliesstext 90 ms, Tabelle 250 ms, Zahlenkolonnen 240 ms, Text mit unsichtbarem Zeichen (Variante über den ganzen Text) 370 ms.

Restrisiko: Der Seiten-Thread blockiert beim Senden eines sehr langen Texts bis 750 ms (nur Bedienbarkeit). Varianten belegen kurzzeitig mehr Speicher.

Tests: `tests/engine.test.mjs` („lange Texte“), `tests/content.test.mjs` (Senden über 200 000 Zeichen, über 1 Mio. Zeichen, Fingerabdruck-Sperre), `tests/entschleiern-grenzen.test.mjs` (Variante länger als das Original).

## B. Datei-Leser (ändert den byte-gleichen Stand aus Auflage 1 des Reviews vom 17.10.)

| Nr. | Änderung | Grenzen und Verhalten | Tests (`tests/datei-formate.test.mjs`) |
|---|---|---|---|
| 1 | PPTX: `ppt/slides/slideN.xml`, Notizen, Kommentare, SmartArt (`ppt/diagrams/dataN.xml`); nur Inhalt von `<a:t>`, Absatz/Umbruch = Zeile | wie DOCX: ZIP-Prüfungen, Entpack-Zähler, 5 Mio. Zeichen, Zeitbudget; eingebettete Objekte/ActiveX und Diagramme (`ppt/charts/`, Werte nicht als `<a:t>`) = `partial`; ohne Folie `type`; verschlüsselt `encrypted` | „PPTX: …“ |
| 2 | OpenDocument: `content.xml` ab `office:body`, Kopf-/Fusszeilen aus `styles.xml`; Zeichendaten zwischen Tags, linear per `indexOf` | `office:binary-data` übersprungen; `manifest:encryption-data` = `encrypted`; eingebettete Objekte (`Object n/`) = `partial`; ohne `content.xml` `type` | „ODT/ODS/ODF: …“ |
| 3 | PDF-Filter ASCIIHex, ASCII85, RunLength, LZW (EarlyChange 0/1), auch verkettet und mit Flate | Ausgabe zählt gegen die Entpack-Grenze (60 MB) → `size`; ungültige Daten → `fail`; unbekannte Filter und LZW mit Prädiktor → Strom nicht gelesen (`partial` bzw. `empty`), nie „sauber“ | „PDF: …“, Normbeispiel ISO 32000-1 7.4.4.2, RunLength-Bombe |
| 4 | Word: `<w:br/>` und `<w:tab/>` in der Kurzform zählen als Trenner (vorher verklebten Werte mit dem nächsten Wort) | gleiches Muster in `engine/bereinigen.js` (`segments`), damit die bereinigte Fassung dieselben Textlagen nutzt | „DOCX: Zeilenumbruch und Tab …“ |
| 5 | Service Worker und Hintergrunddokument lassen die Arten `pptx` und `odf` zu | feste Liste, sonst `type` | `background.js` `DOC_KINDS`, `ui/dokument.js` `KINDS` |

| 6 | RTF: nur Text; Steuerwörter gelesen, nie ausgeführt; Schrift-, Farb-, Formatvorlagen- und Info-Tabellen, Bilder und alle `\*`-Ziele übersprungen; `\u` mit Ersatzzeichen, `\'hh` als Windows-1252, `\bin` übersprungen | linear, 5 Mio. Zeichen, Zeitbudget; eingebettetes Objekt = `partial`; ohne `{\rtf` am Anfang `type` | `tests/alte-formate.test.mjs` „RTF: …“ |
| 7 | Alte Office-Formate im Behälter Compound File Binary: `.doc` (Text über die Stücktabelle), `.xls` (BIFF8: gemeinsame Zeichenketten auch über CONTINUE, Zahlen, Formel-Ergebnisse), `.ppt` (Textatome) | Sektorketten mit Schleifenerkennung, Grössen gegen das Entpack-Budget, Tiefe der Behälter höchstens 32; verschlüsselt = `encrypted`; eingebettete Objekte, Excel-Kommentare und -Diagramme = `partial`; falscher Inhalt `type` | „DOC: …“, „XLS: …“, „PPT: …“ |

Die Leser 6 und 7 sind zusätzlich mit echten Dateien aus Word, Excel und PowerPoint geprüft (nicht im Repo, weil Office den Benutzernamen einträgt); in `.ppt` stehen auch die Platzhaltertexte der Vorlage im gelesenen Text.

Nicht geändert: nichts aus der Datei wird ausgeführt; kein „Bereinigte Version hochladen“ für PPTX, OpenDocument, RTF und die alten Formate. Neue Prüfsumme von `engine/datei.js` im Test „Quelltext: Leser byte-gleich“ (`tests/datei-upload.test.mjs`).

Restrisiken: OpenDocument-Kommentare mit `>` in Attributwerten können einzelne Zeichen verschieben (nur Lesetext, kein Ausführen). LZW ist gegen das Normbeispiel und einen eigenen Kodierer geprüft, nicht gegen fremde Dateien aus der Praxis. PDF-Seiten werden weiter in der Reihenfolge der Objekte gelesen, nicht des Seitenbaums.
