# Design-Review: Bereinigte Version von Dokumenten hochladen (19.10.2026)

Urteil: **FREIGEGEBEN MIT AUFLAGEN** (Sicherheitsprüfung vor dem Bauen, Urteil ohne Dateieinsicht). Grundlage: Datei-Uploads vom 17.10.2026 (`design-review-datei-uploads-17-10.md`).

Vorhaben: TXT/CSV/MD, DOCX und PDF mit Funden bekommen in der Leiste „Bereinigte Version hochladen“. Neues Content Script `extension/engine/bereinigen.js` (keine neuen Rechte, kein Netz, keine Abhängigkeit). Zeitscheibe in `engine/stuecke.js`. Leiste nennt Datentyp, Anzahl, Zeilennummern.

| Nr. | Auflage | Umsetzung |
|---|---|---|
| 1 | Zeitscheibe: Frist/Abbruch = immer „nicht prüfbar“, Dedup nach Typ+Position, Test gleiche Funde mit/ohne Zeitscheibe | `engine/stuecke.js` (Frist nach jedem Stück, 40 ms); Test „Zeitscheibe“ in `tests/bereinigen.test.mjs` |
| 2 | Nachprüfung mit Mindestinhalt; Platzhalter lösen keinen Erkenner aus | `content.js` `tooShort` (leer oder unter 90 % der erwarteten Zeichen ohne Leerraum = nicht prüfbar); Test „Platzhalter“ in allen Sprachen |
| 3 | Restprüfung über alle Text- und Attributwerte jeder `.xml`/`.rels`; Fund ausserhalb `w:t` oder `altChunk` = kein Knopf | `bereinigen.js` `allValues` + Fehler `rest`/`partial`; Tests delText, Link-Ziel, customXml, instrText, altChunk, vbaProject |
| 4 | Autor-Metadaten leeren | `dc:creator`, `cp:lastModifiedBy`, `Company`, `Manager`, `w:author`/`w:initials`; Test |
| 5 | ZIP-Strenge (Doppelnamen, Header ≠ Verzeichnis, Bit 3, mehrere EOCD, Daten davor, Methode), 60 MB auch beim Schreiben, Leser liest neue ZIP | `zipList`/`zipWrite`; Tests; `engine/datei.js` liest jede erzeugte DOCX im Test und im E2E |
| 6 | XML: Entities dekodieren/escapen, CDATA/DOCTYPE/unbekannte Entities = nicht prüfbar, Fund über Absatzgrenzen leert alle Stücke, Trenner verschieben nichts | `xmlOk`, `segments`, `rewrite`; Tests |
| 7 | PDF: Escaping, kein `/Info`/XMP, erst schwärzen, dann CP1252, dann Nachprüfung der fertigen Bytes | `bereinigen.js` `pdf`; Test; Nachprüfung über den normalen Leser im Offscreen-Dokument |
| 8 | Übergabe ohne Rückfall auf das Original; Fehler = Meldung | `checkDocs(…, again)`: Fehler bei der Übergabe = Meldung „nicht prüfbar“; keine Object-URLs |
| 9 | SW: `fix` nur echter Boolean, `redact` nur mit `fix===true` und ohne `block`; `lines` höchstens 5 | `background.js` ALLOWED.doc, `decisionAllowed`, `found`; Quelltext-Test |
| 10 | Tests zu 3, Doppelnamen, leerer Nachprüfung | `tests/bereinigen.test.mjs`, E2E-Schritt `bereinigen` |

Restrisiken (dokumentiert in `docs/einstellungen.md` und `docs/fehlerbehebung.md`): Regeln erkennen keine Namen/Freitext-Geheimnisse („bereinigt nach erkannten Datentypen“); Bilder und eingebettete Schriften in DOCX bleiben; Seiten können synthetisch übergebene Dateien ablehnen (dann Meldung). Gescannte PDF-Seiten werden nicht per Texterkennung gelesen.
