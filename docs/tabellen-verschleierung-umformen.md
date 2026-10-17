# Tabellen, verschleierte Daten und „Sicher umformulieren“

Stand 16.10.2026. Alles läuft lokal im Browser, ohne Netz, nichts wird gespeichert. Sicherheitsauflagen und Belege: [Design-Review](sicherheit/design-review-tabellen-verschleierung-umformen.md). Schlüssel: [Einstellungen](einstellungen.md).

## 1. Tabellen mit Personendaten (Massenleck)

Eingefügte oder hochgeladene Tabellen gelten als Massenleck, wenn sie viele Personen-, Kunden- oder Mitarbeiterzeilen enthalten – auch ohne einzelne Nummern wie AHV oder IBAN.

- **Formate:** eingefügter Text mit Tabulator, Semikolon, Komma oder `|` (Excel, CSV, Markdown); hochgeladene `.csv`/`.tsv`/`.txt`, HTML-Tabellen, JSON-Listen von Objekten, Excel `.xlsx`.
- **Erkennung:** Spaltenköpfe (Name, Vorname, E-Mail, Telefon, Geburtsdatum, Kunde, Mitarbeiter, Personalnummer … in de/en/fr/it/es/pt/nl) und, ohne Kopf, die Wertform je Spalte (Mailadressen, Telefonnummern, Datumsangaben). Ein Leck braucht mindestens eine identifizierende Spalte (Name, Mail, Telefon, Nummer, Rolle) und mindestens `tableMinColumns` heikle Spalten bei mindestens `tableMinRows` Zeilen.
- **Meldung:** „Tabellenspalte mit Personendaten“ mit der Zeilenzahl, nie mit Zellwerten.
- **Schwärzen:** `tableRedaction: columns` ersetzt nur die Zellen der heiklen Spalten; `rows` behält Kopf und 3 Zeilen (heikle Zellen darin geschwärzt) und ersetzt den Rest durch „N Zeilen entfernt“. Hochgeladene Dateien werden nie umgeschrieben, nur angehalten.
- **Nicht prüfbar** (wie bisher, nach Richtlinie gesperrt oder gemeldet): beschädigte oder ungewöhnliche Excel-Dateien (ZIP64, verschlüsselt, Pfade mit `..`, mehr als 500 Einträge, mehr als 3 Blätter, Diagramme/Pivot/eingebettete Objekte), Zip-Bomben, DOCTYPE mit eigenem Teil, JSON über 64 Ebenen, Dateien über 2 Mio. Zeichen und harmlose Tabellen über den Obergrenzen (1000 Zeilen, 50 Spalten).

Harmlose Tabellen (Artikel/Preise, Termine, Kennzahlen, Lagerlisten) lösen nichts aus; die Fehlalarm-Tests stehen in `tests/tabellen-verschleierung-umformen.test.mjs` und im E2E-Schritt `tabellen`.

## 2. Verschleierte Daten

Vor der Prüfung bildet die Erweiterung Varianten des Textes, in denen typische Umgehungen aufgelöst sind. Funde zeigen immer auf die Stelle im Original; Schwärzen ersetzt das ganze verschleierte Stück.

- unsichtbare Zeichen (Zero-Width, Bidi-Steuerzeichen, weiches Trennzeichen), Vollbreite-Ziffern, mathematische und eingekreiste Zeichen, Ligaturen, Doppelgänger aus anderen Schriften (feste Tabelle im Code)
- Leerzeichen, Punkte, Bindestriche zwischen einzelnen Ziffern
- ausgeschriebene Ziffern (de, en, fr, it, es, pt)
- rückwärts geschrieben (nur Nummern mit Prüfziffer; jede Ziffernfolge mit mindestens 8 Ziffern und höchstens 64 Zeichen wird einzeln umgedreht)
- Base64, Hex, %-Kodierung, bis zu 2 Ebenen, je Stück 16–4096 Zeichen; mehr als 50 dekodierbare Stücke oder mehr als 500 neue Funde in den Varianten = „nicht prüfbar“
- **über mehrere Nachrichten verteilt:** die Enden der letzten 5 gesendeten Nachrichten im selben Chat (je 200 Zeichen) bleiben nur im Speicher des Tabs und werden beim Verlassen der Seite, bei Wechsel des Chats oder nach 10 Minuten verworfen.

In den Varianten zählen nur starke Funde (Prüfziffer, Geheimnisse, Mailadressen, IBAN), damit normale Texte, Hashes oder Bilddaten keine Fehlalarme auslösen. Varianten können Funde nur hinzufügen oder die Aktion eines überlappenden Funds verschärfen, nie abschwächen. Abschalten: `deobfuscation: false`.

## 3. „Sicher umformulieren“

Bei einer Meldung (Senden oder Einfügen) bietet der Dialog neben „Schwärzen“ den Knopf **Sicher umformulieren**. Er ersetzt heikle Details durch feste, allgemeine Beschreibungen; die Frage bleibt gleich:

> „Herr Meier, 45, Diabetes – welche Ernährung hilft?“ → „ein Patient mittleren Alters mit chronischer Erkrankung – welche Ernährung hilft?“

- regelbasiert, dazu die Funde der lokalen KI-Erkennung (Personen, Firmen, Adressen, Gesundheit), falls aktiv; die KI liefert nur Fundstellen, nie Ersatztext
- Ersatztexte enthalten nie Teile des Originals (keine Initialen, keine genauen Zahlen oder Daten, nur Altersgruppen)
- **Vorschau vor Übernahme:** der umformulierte Text steht im Eingabefeld und wird nicht gesendet; eine Leiste bittet um Prüfung. Beim Senden gibt es „Rückgängig“, beim Einfügen nicht (das Original wird dort nie gemerkt)
- danach wird sofort neu geprüft; bleibt ein Fund, kommt die normale Meldung
- nur wo Schwärzen erlaubt ist, nie bei „Sperren“; abschaltbar mit `allowRephrase: false`

## Laufzeit (gemessen 16.10.2026)

Median aus 7 Läufen, Node 24 auf dem Entwicklungs-PC, Einwegmessung über `engine.scan` (ohne / mit den neuen Prüfungen):

| Fall | ohne | mit |
|---|---|---|
| Prompt, 600 Zeichen | 2,2 ms | 2,1 ms |
| Verschleierter Text, 100 Zeichen | 1,5 ms | 5,5 ms |
| Personen-Tabelle, 200 Zeilen | 8,9 ms | 9,2 ms |
| Artikel-Tabelle, 900 Zeilen | 4,6 ms | 5,4 ms |
| Ziffernblock 200 000 Zeichen (Höchstlänge) | 94,8 ms | 89,4 ms |
| Excel-Datei, 1000 Zeilen (nur Tabellenprüfung) | – | 7,1 ms |
| Umformulieren eines Satzes | – | 2,8 ms |

Streuung zwischen Läufen etwa ±10 %; die Zeitbudget-Tests laufen mit `npm test` (8 Testdateien parallel).

Alle Prüfungen laufen im bestehenden Zeitbudget; wird es überschritten, ist der Text „nicht prüfbar“ (nie still „sauber“). ReDoS- und Laufzeittests: `tests/tabellen-verschleierung-umformen.test.mjs`.

## Grenzen (ehrlich)

- Die Erkennung ist nicht lückenlos: Text in Bildern ohne Texterkennung, eigene Kodierungen, Umschreibungen in Worten oder Teile über mehr als 5 Nachrichten bzw. aus anderen Chats kommen durch.
- Grosse harmlose Tabellen über 1000 Zeilen sind „nicht prüfbar“ und werden je nach Richtlinie angehalten; die Schwellen sind per Richtlinie anpassbar.
- Eine umformulierte Fallbeschreibung kann in sehr kleinen Gruppen trotzdem auf eine Person schliessen lassen. Deshalb nur grobe Altersgruppen und der Hinweis, den Text vor dem Senden zu prüfen.
- Excel: als Tabelle gelesen wird nur `.xlsx`; ältere `.xls` und `.ods` laufen nur über die bisherigen Datei-Regeln, `.xlsx` mit Diagrammen oder Pivot-Daten ist nicht prüfbar.
