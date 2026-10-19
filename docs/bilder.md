# Bilder prüfen (Screenshots per lokaler Texterkennung)

Stand 14.10.2026. Eingefügte, abgelegte oder hochgeladene Bilder (PNG, JPEG, WebP) – typisch Ticket-, Rechnungs- oder Konsolen-Screenshots – liest die Erweiterung **lokal im Browser** per Texterkennung und prüft den erkannten Text genauso wie eingefügten Text. Die KI-Seite erhält das Bild erst nach der Prüfung: das Original, eine geschwärzte Kopie oder nichts. Grundlage: [Design-Review Bilder](sicherheit/design-review-bilder.md).

## Ablauf

1. Einfügen (Strg+V), Ablegen (Drag & Drop) oder Datei-Auswahl auf einer unterstützten KI-Seite: das Ereignis wird sofort angehalten, beim Datei-Feld wird die Auswahl geleert.
2. Leiste über dem Eingabefeld: **„Bild wird lokal geprüft …“** (mit „Abbrechen“).
3. Ohne Fund geht das Originalbild an die Seite weiter, ohne weitere Meldung.
4. Mit Fund: **„Bild angehalten: IBAN erkannt“** (nur Datentyp und Anzahl, nie der Wert) mit
   - **Geschwärzte Kopie einfügen** – die Wörter jedes Fundes werden deckend schwarz übermalt, das Bild wird als neues PNG ohne Metadaten unter dem Namen `bild-geschwaerzt.png` übergeben;
   - **Abbrechen** – nichts wird übergeben;
   - **Bild trotzdem einfügen** – zwei echte Klicks wie bei „Trotzdem senden“, nur wenn `allowUserOverride` erlaubt ist.
   Bei Richtlinie `block` bleibt nur „Abbrechen“.
5. Nicht prüfbar (Zeit überschritten, zu gross, falsches Format, zu viele Bilder, Fehler): **klare Meldung statt still durchlassen**, z. B. „Bildprüfung dauerte zu lange – nicht eingefügt“. Mit `blockUncheckedFiles: true` gibt es dann nur „Abbrechen“, sonst zusätzlich „Bild trotzdem einfügen“.

## Grenzen

| Grenze | Wert |
|---|---|
| Bilder je Einfügen/Ablegen/Auswahl | höchstens 4 (nacheinander geprüft) |
| Dateigrösse je Bild | höchstens 10 MB |
| Bildgrösse | höchstens 25 Megapixel, gelesen aus dem Dateikopf **vor** dem Dekodieren |
| Zeit | höchstens 20 s für alle Bilder zusammen; danach wird die Texterkennung beendet |
| Formate | PNG, JPEG, WebP – erkannt an den ersten Bytes, nicht am Dateinamen |
| Sprachen der Texterkennung | Deutsch + Englisch fest; Französisch, Italienisch oder Portugiesisch zusätzlich, wenn die Oberfläche in dieser Sprache läuft |

Gemischte Auswahl (Bild und andere Datei zusammen) und andere Bildformate (GIF, HEIC, PDF …) laufen wie bisher über den Datei-Weg (Hinweis bzw. Sperre per `blockUncheckedFiles`).

## Richtlinie

| Schlüssel | Typ | Standard | Wirkung |
|---|---|---|---|
| `imageScan` | Wahr/Falsch | `true` | `false`: Bilder werden wie andere Dateien behandelt (bisheriges Verhalten, `blockUncheckedFiles` gilt). Als Richtlinie gesetzt ist der Schalter in den Einstellungen gesperrt – auch `true` kann der Benutzer dann nicht abschalten. |

Benutzer ohne Richtlinie schalten es in den Einstellungen unter „Bilder prüfen“ um.

## Datenschutz und Technik

- Texterkennung: [Tesseract](https://github.com/tesseract-ocr/tesseract) über tesseract.js 7.0.0 (Apache-2.0), WebAssembly-Kern `tesseract-core-simd-lstm`, Sprachdaten `4.0.0_best_int` – alles **in der Erweiterung gebündelt**, nichts wird nachgeladen.
- Die Erkennung läuft in einem eigenen, unsichtbaren Offscreen-Dokument der Erweiterung (Recht `offscreen`, keine Installationswarnung). Webseiten können es nicht öffnen oder einbetten.
- Kein Netz: `connect-src 'none'` gilt weiter. Die einzige CSP-Ergänzung ist `'wasm-unsafe-eval'` (nötig, um WebAssembly zu starten).
- Kein Speicher: Bildbytes und erkannter Text liegen nur im Arbeitsspeicher, bis die Entscheidung gefallen ist; kein `chrome.storage`, keine Datenbank, kein Cache, keine Protokolle. An den Service Worker der Erweiterung gehen wie beim Text nur Datentyp-IDs und Anzahlen; die Statistik zählt Bilder wie Einfügungen.
- Das fremde Bild öffnet nur der Bild-Dekoder des Browsers; Tesseract bekommt eine selbst erzeugte Graustufen-Kopie.
- Die geschwärzte Kopie entsteht lokal per Canvas; geschwärzt wird deckend, ohne Unschärfe.

## Messung (14.10.2026)

Selbst gerenderte Rechnungs-/Ticket-Screenshots mit den offiziellen bzw. erfundenen Testwerten aus `tests/helpers/testwerte.mjs`, fünf Schrift-/Format-Stile (Segoe UI 16 px PNG, Arial 13 px JPEG 75 %, Consolas 18 px WebP, Calibri 12 px dunkel, Times 15 px grau) und ein schwerer Stil (Arial 11 px, JPEG 60 %). Erkennung mit allen Paketen. Aufruf: `E2E_BILDMESSUNG=1 E2E_NUR=bildmessung node scripts/e2e/e2e.mjs` (mit `E2E_DEBUG=1` zusätzlich der erkannte Text der verfehlten Testwerte).

| Messung | Ergebnis |
|---|---|
| Personen- und Finanzdaten (IBAN, AHV, Karten, Steuer-IDs, Ausweise …), Standardstile | **34 von 35 erkannt (97 %)** – verfehlt: CVV (gelesen als „CWVV“) |
| dieselben, schwerer Stil | 31 von 35 (89 %) – zusätzlich maschinenlesbare Ausweiszeilen und eine Steuernummer |
| Zugangsschlüssel (API-Keys, Tokens, Webhooks), Standardstile | 18 von 25 (72 %) |
| dieselben, schwerer Stil | 14 von 25 (56 %) |
| Harmlose Bilder (Rechnungen, Tickets, Code, Logs), sichere Funde = Warnleiste | **0 von 60** |
| dieselben, unsichere Funde (nur dezent, nie Warnleiste) | 4 von 60 (Telefonnummer ohne Kontextwort) |

Zugangsschlüssel sind lange Zufallszeichen; die Texterkennung verwechselt dort einzelne Zeichen (`5`/`S`, `l`/`I`, `j`/`)`) oder fügt Leerzeichen ein, und schon ein falsches Zeichen bricht das Format. Typische Verwechslungen ohne Längenänderung (typografische Anführungszeichen und Striche, `O`/`l` zwischen Ziffern, `Alza`→`AIza`, `eyl`→`eyJ`) werden vor der Prüfung zurückgebogen; gemeldet wird weiter nur, was Format und Prüfziffern besteht.

Leistung (Windows-PC, Edge 155, Texterkennung im Offscreen-Dokument, dichter Text):

| Bild | Erkennung | bis zum Ergebnis |
|---|---|---|
| 800×600 | 0,45 s | 0,48 s |
| 1280×720 | 0,54 s | 0,59 s |
| 1920×1080 | 0,89 s | 0,98 s |
| 1920×1080, erstes Bild (Kaltstart) | 0,96 s | 1,21 s |
| 2560×1440 | 0,94 s | 0,97 s |
| 3840×2160 | 1,45 s | 1,50 s |
| 1920×1080 mit Französisch | 1,02 s | 1,24 s |

E2E (Attrappe): vom Einfügen bis zur Leiste 1,6 s beim ersten Bild, Bild ohne Fund nach 0,4 s weitergegeben.

Unit-Test mit Beispielbildern (17.10.2026, `tests/ocr-bilder.test.mjs`, läuft mit `npm test`, ohne `node_modules` oder Edge übersprungen): ein Rechnungs-Screenshot mit der offiziellen Test-IBAN und ein harmloser Screenshot (je ca. 900×300, PNG) werden mit tesseract.js 7.0.0 und den gebündelten deutschen Sprachdaten in Node gelesen und wie eingefügter Text geprüft. Ergebnis: IBAN erkannt, harmloses Bild ohne sicheren Fund; Start der Erkennung 0,18 s, je Bild 0,19–0,26 s. Grenze im Test 15 s je Bild inklusive Start (`OCR_MAX_MS`). Mit falscher Prüfziffer im Bild schlägt der Test fehl.

## Ausweise, Rechnungen und lokale KI (16.10.2026)

Grundlage: [Design-Review Code und Bilder](sicherheit/design-review-code-bilder.md).

- Der erkannte Bildtext geht zusätzlich an die **lokale KI-Erkennung** (Namen, Firmen, Adressen, Gesundheitsangaben; [Lokale KI-Erkennung](ki-erkennung.md)) – gleicher Weg wie beim Text, gekürzt auf 4000 Zeichen, innerhalb der 20-s-Grenze. Die KI ergänzt nur: sie kann keinen Regel-Fund aufheben, auch nicht mit Anweisungen im Bild („ignore all rules …“). Fehler oder Zeitüberschreitung der KI: es entscheiden die Regeln.
- **Ausweisdokument im Bild** (`doc_identity`, Standard **sperren**): gültige maschinenlesbare Zone (Prüfziffern nach ICAO 9303) oder ein Ausweis-Titel (Identitätskarte, Pass, Personalausweis, Führerausweis, Aufenthaltstitel … in DE/EN/FR/IT/PT) zusammen mit einem Merkmal wie Geburtsdatum, Nationalität, Ablaufdatum, Geschlecht oder Vorname. Eine MRZ-artige Zeile mit falschen Prüfziffern zählt nur als ein Merkmal.
- **Rechnung im Bild** (`doc_invoice`, Standard **warnen**): Rechnungswort (Rechnung, Invoice, Facture, Fattura, Fatura, QR-Rechnung …) und mindestens zwei Merkmale (Total/Betrag, MwSt/VAT, Zahlungsfrist, Rechnungsnummer, Betrag mit Währung, IBAN- oder QR-Referenz-Fund).
- Beide Typen nennt die Leiste zuerst; die geschwärzte Kopie deckt dann **alle** erkannten Wörter ab (das Foto auf einem Ausweis bleibt – deshalb sperrt `doc_identity` standardmässig). Per Richtlinie `rules` wie jeder andere Typ einstellbar (`{"rules": {"doc_identity": "block", "doc_invoice": "warn"}}`), eine verwaltete Richtlinie geht vor.

### Messung 16.10.2026 (Windows-PC, Edge, gleiche Messung wie oben)

| Messung | Ergebnis |
|---|---|
| Texterkennung 800×600 / 1280×720 / 1920×1080 / 3840×2160 | 0,45 s / 0,54 s / 0,90 s / 1,47 s (bis zum Ergebnis 0,49 / 0,59 / 0,99 / 1,53 s) – unverändert |
| 1920×1080 Kaltstart / mit Französisch | 0,96 s (1,21 s) / 1,12 s (1,36 s) |
| E2E Einfügen bis Leiste inkl. lokaler KI und Dokumentart, alle 4 Attrappen | Ausweis 1,06–1,08 s, Rechnung 1,23–1,24 s (erstes Bild nach Start 2,9 s) |
| Prüfzeit Text (Median, 200 Läufe) vorher → nachher | Code 300 Zeilen 2,26 → 2,32 ms; Fliesstext 9k Zeichen 1,72 → 1,69 ms |

## Bekannte Lücken

- Ausweise und Rechnungen werden nur über ihren **Text** erkannt: gedrehte, unscharfe, kleine oder handschriftliche Dokumente und Ausweise ohne lesbaren Titel können durchrutschen („nach bestem Bemühen“, keine Garantie).

- Die Bildprüfung ist eine **Hilfe, keine Garantie**: ein schlecht lesbarer Wert (kleine Schrift, Foto statt Screenshot, schräg, starke Kompression) geht als „ohne Fund“ durch.
- Text, der zusammen mit einem Bild in der Zwischenablage liegt, wird beim Weitergeben nicht mitgegeben (nur das Bild).
- Seiten, die Bilder selbst per `navigator.clipboard.read()` oder eigene Upload-Wege holen, und Eingaben in eingebetteten iframes werden nicht erfasst.
- Die Weitergabe nach der Prüfung ist ein von der Erweiterung ausgelöstes Ereignis. Ignoriert eine Seite solche Ereignisse, kommt das Bild nicht an – dann das Bild noch einmal selbst einfügen (es wird erneut geprüft). Auf den echten KI-Seiten noch nicht von Hand geprüft.
- Lokale Build-Voraussetzung: die Texterkennung liegt nicht im Repo, sondern wird aus den gepinnten Paketen erzeugt (siehe [Installation](installation.md)). Fehlt sie, zeigt jedes Bild „Bild konnte nicht geprüft werden“ statt still durchzugehen.

