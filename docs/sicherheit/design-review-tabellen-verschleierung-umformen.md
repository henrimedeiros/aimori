# Design-Review: Tabellen-Erkennung, verschleierte Daten, „Sicher umformulieren“ (16.10.2026)

Urteil des Sicherheits-Reviews vor dem Bau: **FREIGEGEBEN MIT AUFLAGEN** (20 Auflagen). Der erste Review-Text ging verloren; das Review wurde am 16.10.2026 neu durchgeführt, die Nummern 1–20 blieben gleich, Ergänzungen des zweiten Reviews sind mit **[+]** markiert. Bedienung, Laufzeit und Grenzen: [Tabellen, verschleierte Daten, Umformulieren](../tabellen-verschleierung-umformen.md).

## A: Tabellen-Erkennung (`extension/engine/tabelle.js`)

| Nr. | Auflage (Kurzfassung) | Umsetzung (Ort) | Beleg |
|---|---|---|---|
| 1 | XLSX nur eigener ZIP-Leser über das Zentralverzeichnis; ZIP64, verschlüsselt, Methode ≠ 0/8, doppelte Namen = nicht prüfbar. [+] lokaler Kopf ≠ Verzeichnis (Name, Methode, Grössen ohne Datendeskriptor, Offset), Pfade mit `..` oder `/` am Anfang, über 500 Einträge | `zipEntries()` (`LIMITS.zipEntries` 500) | `tests/tabellen-verschleierung-umformen.test.mjs` „XLSX: ungewoehnliche ZIPs …“ |
| 2 | Entpacken nur `DecompressionStream('deflate-raw')`; 4 MB/Eintrag, 8 MB gesamt, Verhältnis 100, 3 Blätter, 2 s. [+] Bytes beim Streamen zählen, sofort `reader.cancel()`, `sharedStrings.xml` zählt mit, Methode 0 gleiche Grenzen | `inflate()` (gemeinsames `budget`, `max` aus Eintrag/Rest/Verhältnis), `xlsx()` | Zip-Bombe mit gelogener Grösse, ohne `DecompressionStream` |
| 3 | „Nicht prüfbar“ über den bisherigen Pfad, nie still durchlassen. [+] auch Zeitlimit, Obergrenze und jede Ausnahme | `checkText()`/`xlsx()` fangen jede Ausnahme (`unscannable: true`); `content/content.js` `tabOver` → bisherige Datei-Sperre | Tests „Review-Ergaenzungen …“ (`null`-Eingabe), `xlsx(null)` |
| 4 | Eigener linearer Tokenizer, kein `DOMParser`/`innerHTML`, 5 Standard-Entities + numerische, DOCTYPE mit internem Teil = nicht prüfbar. [+] in XLSX jede DOCTYPE; Kommentare/CDATA begrenzt; HTML nie dargestellt | `tokenize()` (`LIMITS.markup` 1 Mio. Zeichen), `htmlTables()` liefert nur Text | Entity-Bombe, langer Kommentar, DOCTYPE in XML, `tests/quelltext.test.mjs` (kein `innerHTML`) |
| 5 | CSV-Anführungszeichen ≤ 10 000, JSON-Fehler/Stapelüberlauf = nicht prüfbar, Tabellensuche bis Tiefe 6. [+] Tiefe linear vor `JSON.parse` (über 64 Ebenen nicht prüfbar), Zellen auf 10 000 Zeichen begrenzt | `parse()` (`LIMITS.quoted`), `nesting()` (`LIMITS.jsonNest`), `jsonTables()` (`LIMITS.jsonDepth`), `analyze()` (`LIMITS.cell`) | JSON-Test (64/65 Ebenen, Klammern in Zeichenketten), grosse Zellen < 1,5 s |
| 6 | Schwellen nur verwaltet; ausserhalb der Grenzen oder falscher Typ = Standard | `common/policy.js` (`tableMinRows` 3–1000, `tableMinColumns` 1–10, nicht in `USER_KEYS`) | `tests/kontext-richtlinie.test.mjs` |
| 7 | Gekürzte Zeilen ersetzen ihren ganzen Bereich. [+] heikle Zellen in den 3 behaltenen Zeilen geschwärzt, danach neu geprüft | `findings()` (Zeilen-Modus), `engine/engine.js` (Grundfunde im gekürzten Bereich entfallen); Neuprüfung nach dem Schwärzen wie bisher in `content.js` | Test „Zeilen-Modus …“ |
| 8 | Ein Ganztext-Fund mit Zeilenzahl, keine Zellwerte/Spaltenköpfe in Meldung, Statistik, Bericht; feste Obergrenzen. [+] über einer Obergrenze ohne Leck = nicht prüfbar statt still abgeschnitten | `verdict()` (`over` aus Zeilen, Spalten, Textlänge), `background.js`/`dialog.js` nur Art + Zahl | Tests „Grosse Tabelle …“, „Review-Ergaenzungen …“ (1200 Artikelzeilen = nicht prüfbar, 1500 Personenzeilen = Leck mit 1500) |

## B: Verschleierte Daten (`extension/engine/entschleiern.js`)

| Nr. | Auflage (Kurzfassung) | Umsetzung (Ort) | Beleg |
|---|---|---|---|
| 9 | Varianten nur bei Bedarf und nur starke Format-Typen. [+] Varianten fügen nur hinzu, gesendet wird nie eine Variante | `variants()` (erst bei Bedarf), `engine.js` `deobf()` (`strongOnly`), Variantenfund nur ohne überlappenden Grundfund | Fehlalarm-Test Verschleierung, „kein Grundfund verloren“ |
| 10 | Normalisierung je Codepoint aus fester Tabelle, Surrogates richtig, kein NFKC; Schwärzen ersetzt das ganze kodierte Token | `normChars()` + `fold()` (feste Bereiche statt NFKC, `codePointAt`), Ursprungsbereiche `a[]`/`b[]` | Test „feste Zeichentabelle …“ (mathematische Ziffern, eingekreist, Vollbreite, Ligatur), „Verschleierte Werte …“ |
| 11 | Alle Regex linear, im Zeitbudget des Scans, ReDoS-Tests. [+] Budget aufgebraucht = nicht prüfbar; kein `eval`/`new Function`/Regex aus Eingaben | `engine.js` `deobf()` (Zeitbudget **oder jeder Fehler** → nicht prüfbar); Zeitüberschreitung im Paket `context` (dort läuft die Tabellenprüfung) jetzt ebenfalls nicht prüfbar statt nur `contextIncomplete` | Test „ReDoS …“, „Fehler = nicht pruefbar“, `tests/kontext.test.mjs` (Timeout → `unscannable`) |
| 12 | Über Nachrichten verteilt: 5 gesendete Texte, je 200 Endzeichen, nur im Speicher je Tab, bei `pagehide` und SPA-Navigation verworfen. [+] nie `chrome.storage`, nie an den Service Worker | `content/content.js` `tails` (Chat-Pfad-Vergleich `sameChat`, 10 min), `dropTails()` bei `pagehide` und Richtlinie aus; `entschleiern.across()` | `tests/content.test.mjs` (pagehide verwirft), Test „Ueber mehrere Nachrichten verteilt …“ |

Zusatz Bidi: die Isolate-Steuerzeichen U+2066–U+2069 werden seit dieser Neuauflage ebenfalls entfernt (fiel beim Test der Auflage 19 auf).

Auflagen der Pflicht-Prüfung (16.10.2026): Grenzen der Varianten (Textmenge, 50 dekodierte Stücke, 12 000 Kandidaten) machen den Text nicht prüfbar (`too_long`) statt die Variante still wegzulassen; „rückwärts“ dreht jede Ziffernfolge mit 8+ Ziffern (bis 64 Zeichen) einzeln um, für jede Textlänge. Runde 2: getrennt geschriebene Gruppen und Ziffernwörter ohne Stückzahl-Grenze (linear, Zeitbudget → nicht prüfbar), mehr als 500 neue Variantenfunde (ohne Grundfunde) → `too_long`. Runde 3: ersetzt ein Tabellenfund Grundfunde, übernimmt er deren strengste Aktion (nie milder als ohne Tabellen-Erkennung). Runde 4: überlappt ein Variantenfund oder ein nicht übernommener abgeleiteter Fund andere Funde, hebt er deren Aktion an (`raise()` in `engine.js`). Beleg: `tests/entschleiern-grenzen.test.mjs`.

## C: Sicher umformulieren (`extension/engine/umformen.js`)

| Nr. | Auflage (Kurzfassung) | Umsetzung (Ort) | Beleg |
|---|---|---|---|
| 13 | Nur wo Schwärzen erlaubt, nie bei Sperre, abschaltbar `allowRephrase`. [+] KI liefert nur Fundbereiche, nie Ersatztext | `background.js` `ALLOWED`/`allowed()` (`warn`/`redact` + `allowRephrase === true`), `ui/dialog.js`; `umformen.rephrase()` nur feste Vorlagen | `tests/background.test.mjs`, `tests/dialog.test.mjs`, Test „Funde der lokalen KI …“ |
| 14 | Feste Wörter/Altersgruppen, keine Initialen, Zahlen, Daten; Übernahme nur bei exakt gleichem Feldtext (ganzer Text) | `umformen.js` `T`, `content.js` `rephraseNow()` | Test „ohne Teile des Originals“, `tests/content.test.mjs` „nur der gepruefte Text“ |
| 15 | Danach sofort neu prüfen, Rest-Fund = normale Meldung. [+] höchstens einmal automatisch | `content.js` `rephraseNow()` (eine Neuprüfung, kein erneutes Umformen) | `tests/content.test.mjs` „Rest-Fund danach …“ |
| 16 | Beim Einfügen nie das Original merken | `content.js` (`reph.orig` nur beim Senden), Dialog ohne „Rückgängig“ beim Einfügen | `tests/content.test.mjs`, `tests/dialog.test.mjs` |
| 17 | Original beim Senden sofort verwerfen, ebenso bei Abbruch, Schliessen und `pagehide` | `content.js` `hideRephrased()` (Senden, Leiste schliessen, Zeitablauf, `pagehide`, Richtlinie aus) | `tests/content.test.mjs` |

## D: Richtlinie, Tests, Statistik

| Nr. | Auflage (Kurzfassung) | Umsetzung (Ort) | Beleg |
|---|---|---|---|
| 18 | Neue Schlüssel nur verwaltet (`managed_schema`, ADMX/ADML, nur `storage.managed`) | `extension/managed_schema.json`, `enterprise/admx/*`, `scripts/build-admx.mjs`, `common/policy.js` (Nutzerwerte → `unknown:`) | `tests/kontext-richtlinie.test.mjs`, ADMX-Tests |
| 19 | E2E mit Netzwerk-Sperrtest, Fehlalarm-Tests mit harmlosen Tabellen. [+] Unit-Tests Zip-Bombe, ZIP64, Entity-Bombe, tiefes JSON, ReDoS, Bidi/Zero-Width; keine neuen Berechtigungen, `host_permissions`, `web_accessible_resources`, CSP unverändert, kein WASM, keine neuen Abhängigkeiten, Testdaten synthetisch | `scripts/e2e/e2e.mjs` Schritt `tabellen` (alle Attrappen, Netzwerk-Sperrtest); `manifest.json` nur drei neue Content-Script-Dateien; `package-lock.json` unverändert | `tests/tabellen-verschleierung-umformen.test.mjs`, E2E |
| 20 | Statistik zählt Umformulieren nur als Anzahl je Art | `background.js` (`count(r.p, 'redact')`) | `tests/background.test.mjs` |

## Restrisiken (aus dem Review)

- Mittel: ausgefallene Verschleierungen (Bilder, eigene Kodierungen, mehr als 5 Nachrichten) – in der Doku als Grenze genannt.
- Mittel: Fehlalarme bei grossen harmlosen Tabellen – Fehlalarm-Tests, Schwellen per Richtlinie.
- Tief: Ressourcen-DoS im Content Script – Grenzen der Auflagen 2, 5, 11.
- Tief: umformulierte Fallbeschreibung in kleinen Gruppen erkennbar – nur grobe Altersgruppen, Hinweis „bitte prüfen“.
