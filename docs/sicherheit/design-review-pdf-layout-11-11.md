# Design-Review: PDF bereinigen mit erhaltenem Layout, genauerer PDF-Leser (11.11.2026)

Urteil: **AUSSTEHEND** (Entwurf zur Sicherheitsprüfung; vor einer Veröffentlichung einzuholen). Grundlage: „Bereinigte Version hochladen“ vom 19.10.2026 (`design-review-datei-bereinigen-19-10.md`, Auflage 7 zu PDF), Datei-Uploads vom 17.10.2026.

Vorhaben: (A) „Bereinigte Version hochladen“ lässt eine PDF, wie sie ist, und überdeckt nur die Zeichen der Treffer in der Datei selbst. Die bisherige reine Textfassung bleibt als Rückfall. (B) Der PDF-Leser entscheidet nach Zeichenbreiten, ob zwischen zwei Textstücken eine Lücke ist, und liest die Seiten in der Reihenfolge des Seitenbaums. Alles in `extension/engine/datei.js`; keine neuen Rechte, kein Netz, keine Abhängigkeit, keine neue Nachrichtenart.

## A. Überdecken in der Originaldatei (`datei.pdfMask`)

| Nr. | Punkt | Umsetzung | Tests (`tests/pdf-layout.test.mjs`) |
|---|---|---|---|
| 1 | Herkunft jedes Zeichens | Der Leser merkt je gezeigter Zeichenkette Lage im Text, Token, Schrift und Strom (`rec`); Fundbereiche werden auf Zeichencodes zurückgeführt | „Überdecken: …“ (5 Arten von Dateien) |
| 2 | Ersatz | Code des Deckzeichens derselben Schrift (`X`, sonst `x * • # - _ .`); Leerraum bleibt; ohne passendes Zeichen Fehler | „Schrift ohne ein Deckzeichen“ |
| 3 | Kein alter Inhalt in der Datei | Betroffene Ströme werden ganz ersetzt (unkomprimiert, nie als Nachtrag ans Ende); Dateien mit älteren Fassungen desselben Objekts werden abgelehnt | „Ältere Fassung desselben Objekts“; Prüfung „Wert nirgends mehr in der Datei“ über Rohbytes und entpackte Ströme |
| 4 | Metadaten | Info-Objekt und XMP-Metadaten geleert; der neue Querverweis nennt kein `/Info` | „Info und XMP-Metadaten werden geleert“ |
| 5 | Layout | Breitenunterschied zwischen Deckzeichen und Original wird als Zahl im `TJ`-Feld ausgeglichen (aus `Tj` wird `TJ`); ohne Breitenangabe kein Ausgleich | „Breite ausgeglichen“ |
| 6 | Selbstkontrolle | Der normale Leser liest die neue Datei: nicht „partial“, Text ohne Leerraum genau wie erwartet | in allen Tests |
| 7 | Restprüfung | Alle Zeichenketten aller Objekte, nicht gezeigte Zeichenketten in Inhaltsströmen (`/ActualText`), Erscheinungsbilder von Anmerkungen, übrige lesbare Ströme laufen durch die Erkenner; ein Fund = Fehler | „Anmerkung“, „/ActualText“, „Erscheinungsbild“ |
| 7a | Nichts Ungeprüftes bleibt | Alles zwischen den Objekten und nach dem letzten (Kommentare, alte Querverweise, Anhängsel) geht in die Restprüfung; Binäres dort = Fehler. Ein Objekt, das sich nicht lesen lässt, bricht ab, statt übersprungen zu werden | „Kommentar zwischen Objekten“, „Kommentar nach %%EOF“, „Binäres nach dem Dateiende“, „unlesbares Objekt“ |
| 7b | Kein ungeprüfter Strom | Zwischen Objektwert bzw. `endstream` und `endobj` darf nur Leerraum stehen. Jeder Strom muss lesbar sein; binär bleiben dürfen nur Bilder, Querverweise und Ströme, die als Schriftprogramm (`FontFile*`, `CIDSet`, `CIDToGIDMap`) oder Farbprofil (`ICCBased`) eingebunden sind. Unbekannter Filter oder sonstiges Binäres = Fehler (betrifft z. B. linearisierte Dateien mit Hinweis-Strom: dort Textfassung) | „Text hinter dem Objektwert“, „unbekannter Filter“, „binärer Strom ohne bekannte Rolle“, „Schriftprogramm bleibt erlaubt“ |
| 7c | Objektströme | Ein unlesbares Objekt in einem Objektstrom bricht ab; ein Objekt, das von einem gleich nummerierten verdeckt wird, gilt als ältere Fassung (Fehler); der Rohtext jedes Objektstroms geht in die Restprüfung | „unlesbares Objekt im Objektstrom“, „verdecktes Objekt im Objektstrom“, „gewöhnlicher Objektstrom bleibt erlaubt“ |
| 8 | Fail-closed | Jeder Fehler oder Zweifel (anderer Text als bei der Prüfung, Bereich nicht getroffen, Generation ≠ 0, externer Strom, Zeitbudget, Grösse) = fester Code; `content.js` `cleanDocs` nimmt dann die Textfassung und meldet `loss` | „im Zweifel Fehler“; `docFixLoss` in 6 Sprachen |
| 9 | Nachprüfung wie bisher | Nach dem Klick liest das Hintergrunddokument die bereinigte Datei erneut und prüft sie vollständig (`checkDocs(…, again)`), nie das Original | unverändert |

Geprüft mit einer von Edge gedruckten PDF (eingebettete Schriften, Tabelle, Farben): Das PDF-Modul von Windows öffnet die neue Datei, das Bild ist bis auf die überdeckten Werte gleich.

Restrisiken: Werte in Bildern bleiben (wie bei DOCX). Ein verwaister Strom mit hex- oder CID-kodiertem Text, den keine Seite zeichnet, wird nur als Rohtext geprüft. Das Überdecken läuft im Content Script (wie DOCX) und kann den Seiten-Thread bei grossen Dateien kurz belegen. Digitale Signaturen werden ungültig.

## B. PDF-Leser

| Punkt | Bisher | Neu | Tests |
|---|---|---|---|
| Waagrechter Versatz (`Td`, `Tm`) | immer ein Leerzeichen: Werte wie eine IBAN zerfielen („201 1“) und wurden nicht erkannt | Lücke ab einem Fünftel Schriftgrad = Leerzeichen, sonst Fortsetzung; Breiten aus `/Widths` bzw. `/W` und `/DW`; ohne Breiten wie bisher | „Leser: Fortsetzung ohne Lücke …“, „Leser: Tm …“ |
| Senkrechter Versatz | wurde nie als Zeilenwechsel erkannt | neue Zeile | dieselben |
| Seitenfolge | nach Objektnummer | nach Seitenbaum; nicht genannte Seiten folgen (nie weniger gelesen) | „Leser: Seiten in der Reihenfolge …“ |

| Textblöcke (`BT … ET`) | jeder Block eine eigene Zeile: in Word-PDF zerfielen Werte mit Bindestrich („2026 / - / 0417“) | ein Block auf derselben Grundlinie setzt die Zeile fort (Lücke nach Breiten); andere Grundlinie, `cm` dazwischen oder Block ohne Lage = neue Zeile | „Leser: Textblöcke derselben Grundlinie …“ |

Nachtrag aus der Prüfung mit echten Dateien (Word, Excel, PowerPoint, Edge; Bild mit dem PDF-Modul von Windows verglichen): Im `TJ`-Feld steht nach der Ausgleichszahl ein Leerzeichen (sonst klebte sie an der folgenden Zahl und die Seite brach beim Anzeigen ab); die Selbstkontrolle lehnt Felder mit anderem als Zeichenketten und Zahlen ab. Bei Teilschriften zählt als Deckzeichen nur eines mit Breite über 0 (sonst unsichtbar); ohne ein solches Fehler. Tests „Zahl direkt nach der Zeichenkette …“.

Neue Prüfsumme von `engine/datei.js` im Test „Quelltext: Leser byte-gleich“ (`tests/datei-upload.test.mjs`).
