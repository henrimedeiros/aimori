# Design-Review Datei-Uploads (17.10.2026)

Vorhaben: Dateien, die auf KI-Seiten hochgeladen, abgelegt oder eingefügt werden (TXT, CSV, PDF, DOCX, XLSX), lokal mit denselben Erkennern wie beim Tippen prüfen, bevor die Seite sie bekommt. Warnleiste mit Abbrechen / Datei trotzdem hochladen.

Urteil Sicherheits-Review: **FREIGEGEBEN MIT AUFLAGEN** (Auflagen 1–11), Nachfrage zum Leseort **JA, mit Zusatzauflagen 12–20**: PDF/DOCX werden im bestehenden Offscreen-Dokument gelesen statt im Content Script, damit der Seiten-Thread nie blockiert und der geprüfte Leser byte-gleich bleibt. Geurteilt ohne Dateien, nur nach Beschreibung.

## Ablauf

1. Content Script fängt Datei-Feld, Ablegen und Einfügen wie bisher im Capture-Modus ab (Datei-Feld wird sofort geleert).
2. TXT/CSV werden im Content Script als Text gelesen, XLSX über `engine/tabelle.js` (bestehende Grenzen: 8 MB entpackt, 2 s). PDF/DOCX gehen als Rohbytes an den Service Worker, der sie im Offscreen-Dokument (`ui/dokument.js` mit `engine/datei.js`) lesen lässt; zurück kommt nur `{ text, partial }` oder ein fester Fehlercode.
3. Der Text läuft in Stücken von 10 000 Zeichen (400 Überlappung, `engine/stuecke.js`) durch `DLX.engine.scan` mit derselben Konfiguration wie beim Tippen, zusätzlich wie bisher versteckte Anweisungen, Dokument-Fingerabdrücke und Personentabellen.
4. Kein Fund: die Originaldatei geht an die Seite. Fund: Leiste mit Typen und Anzahl (nie Werte); Abbrechen = nichts, Trotzdem (zwei Klicks) = genau die Originaldatei; Aktion `block` = nur Abbrechen.

## Auflagen und Umsetzung

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | `engine/datei.js` byte-gleich dem geprüften Stand vom 16.10. | Git-Blob `cc713456…` = Stand des Zweigs vom 16.10.; Test `Quelltext: Leser byte-gleich` |
| 2 | Thread höchstens ~50 ms am Stück | PDF/DOCX im Offscreen-Dokument (Nachfrage); Erkenner in Stücken mit `setTimeout(0)` dazwischen, Test misst längstes Stück < 100 ms am 200k-Ziffernblock |
| 3 | Gesamtgrenzen je Ablage/Auswahl | höchstens 5 Dateien, zusammen 20 MB Rohbytes, 20 s Gesamt-Zeitbudget; darüber gilt alles noch nicht Geprüfte als „nicht prüfbar“. Entpacken: je Datei 60 MB, Dateien nacheinander, Puffer nach jeder Datei frei (Speicherspitze 60 MB; der byte-gleiche Leser zählt nicht dateiübergreifend) |
| 4 | Abfangen vor der Seite, Originaldatei, Feld leeren | bestehender Capture-Weg; E2E `dateien`: Capture-Handler der Seite auf `window` sieht vor dem Urteil nichts, Trotzdem gibt dieselbe Datei weiter (Prüfsumme), Abbrechen = Feld leer |
| 5 | Lokale KI nur über bestehenden Weg | Dokumenttext geht nie an die lokale KI (keine neue Nachrichtenart); geprüft wird mit den Regel-Erkennern |
| 6 | fail-closed | Lesefehler, Zeitüberschreitung, verschlüsselt, teilweise, Ausnahme = Fund „nicht prüfbar“; bisherige Funde bleiben, `block` bleibt `block` (strengste Aktion); `blockUncheckedFiles` sperrt Dateien weiter ganz |
| 7 | Überlappung zusammenführen | nach Typ + Position; Test mit IBAN genau auf den Stückgrenzen und 10 gleichen Werten |
| 8 | nichts nach aussen | keine Konsole, kein Storage, nur feste Codes; Leiste/SW bekommen nur Typ, Kategorie, Anzahl |
| 9 | kein Aus-Schalter | keiner eingebaut |
| 10 | Manifest nur Content-Script-Einträge, synthetische Tests | `engine/datei.js`, `engine/stuecke.js` im bestehenden Eintrag; keine neuen Rechte, CSP unverändert; Beispieldateien `tests/helpers/beispieldateien.mjs` (Test-IBAN, Muster-AHV); E2E nur Attrappe 127.0.0.1 |
| 11 | Texte ohne HTML, alle Sprachen | `introDocData`, `uploadAnyway`, `reallyUpload` in de/en/fr/it/pt/es |
| 12 | 20 MB Rohbytes | Content Script prüft `file.size`, SW rechnet die Rohbytes aus dem Base64 nach |
| 13 | Zufalls-ID je Auftrag | SW-Nonce `id`, `ui/dokument.js` gibt sie zurück, fremde/fehlende ID = `fail`; Antwort nur per `sendResponse` an den Auftraggeber |
| 14 | Textmenge begrenzt | Leser bricht über 500 000 Zeichen mit `size` ab (strenger als Abschneiden), SW prüft erneut |
| 15 | Entpack-Bomben | Leser: 60 MB entpackt, 2000 Einträge, fester Code |
| 16 | kein Netz im Offscreen | eigener Leser ohne Worker/Bibliothek, CSP `default-src 'none'` unverändert (Test) |
| 17 | XLSX im Content Script mit Grenzen | bestehendes `tabelle.xlsx` (8 MB, 500 Einträge, 2 s) |
| 18 | Abbruch bei Tab zu/verlassen | `tabs.onRemoved`/`onUpdated` (loading/URL) → Offscreen-Dokument schliessen; Test |
| 19 | keine Inhalte in Protokollen | keine Konsole, nur feste Codes (Test „nur feste Codes“) |
| 20 | Zielmarke `dlx-doc` nur vom SW | `ui/dokument.js` prüft Absender = eigener SW, kein Tab |

## Grenzen (Restrisiken)

- Uploads in Unterframes werden nicht geprüft (nur Top-Frame).
- Bilder in PDF/DOCX/XLSX und gescannte PDFs ohne Text werden nicht per Texterkennung gelesen; ein PDF ohne Text gilt als „nicht prüfbar“.
- Seiten, die Dateien an den abgefangenen Ereignissen vorbei einlesen (z. B. `showOpenFilePicker`), umgehen die Prüfung.
- Während ein PDF/DOCX gelesen wird, meldet die Bildprüfung „beschäftigt“ (ein Auftrag gleichzeitig).

## Prüfung

- `node --test tests/datei-upload.test.mjs` (Beispieldateien, Stückgrenzen, Zeitbudget, SW-Weg), `tests/datei.test.mjs` (Leser, Bomben, Zyklen), `npm test` gesamt.
- E2E: `E2E_NUR=dateien node scripts/e2e/e2e.mjs` – je Format heikel angehalten, sauber durch, Ablegen + Trotzdem.
