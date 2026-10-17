# Lokale KI-Erkennung (Prototyp, 16.10.2026)

Die Regeln erkennen feste Formate (IBAN, Karten, AHV, Telefon, Mail …) und Namen nur mit Anrede oder Kontext. Ein lokales KI-Modell ergänzt sie um **Namen von Personen, Firmen- und Organisationsnamen, Postadressen, Gesundheitsangaben** und **besondere Kategorien** (Herkunft, Weltanschauung, Orientierung, Gewerkschaft, Strafsachen). Das Modell läuft im Browser auf dem Gerät; es gibt kein Netz (CSP `connect-src 'none'`), es wird nichts gespeichert oder protokolliert. Sicherheit: [Design-Review KI-Erkennung](sicherheit/design-review-ki.md).

## So funktioniert es

- Nach der Tipp-Pause schickt das Content Script höchstens die ersten 4000 Zeichen an den eigenen Service Worker, der sie an das Offscreen-Dokument weitergibt. Ein Worker rechnet dort das Modell (ONNX Runtime Web, WASM; WebGPU vorbereitet). Zurück kommen nur Typ, Position und Konfidenz.
- **Regeln gelten immer.** KI-Funde, die einen Regel-Fund überlappen, fallen weg; die KI kann nichts entschärfen.
- **Konfidenz und Kontext:** unter 0.6 verworfen; ab 0.9 sicher; dazwischen sicher nur mit Kontextwort (z. B. „Herr“, „Kundin“, „Patient“, „Firma“, Rechtsform „AG/GmbH/SA/Lda“, „wohnt“), sonst nur dezent (grauer Hinweis, hält das Senden mit der Standard-Richtlinie `uncertainFindings: hint` nicht an). Einzelne Vornamen ohne Kontext bleiben dezent.
- **Fehlalarme senken:** verworfen werden Orte ohne Hausnummer/PLZ, Namen von KI-Diensten und Tech-Produkten (ChatGPT, Microsoft, Excel …), klein geschriebene „Namen“ sowie Funde in Pfaden, URLs, Mailadressen und Code in Backticks. Wirkung auf dem Korpus: Fehlalarme in harmlosen Sätzen 9/44 → 0/44.
- **Platzhalter:** „Platzhalter“ ersetzt auch Namen und Firmen stabil (`[PERSON_1]`, `[COMPANY_1]`, `[ADDRESS_1]`, `[HEALTH_1]`), gleicher Name = gleicher Platzhalter, Rückübersetzung wie bisher nur in der eigenen Ansicht.
- **Lange Texte:** das Modell sieht 512 Token je Fenster; längere Eingaben werden in überlappende Fenster geteilt. Über 4000 Zeichen prüft die KI nur den Anfang und der Live-Hinweis zeigt dezent „Lokale KI hat nur den ersten Teil geprüft“.
- **Rückfall:** Lade- oder Laufzeitfehler, Zeitüberschreitung (3 s je Prüfung) oder ungültige Antwort → nur Regeln. Nach zwei Fehlern lädt die Erweiterung das Modell bis zum Browser-Neustart nicht mehr. Die Einstellungen zeigen den Zustand live, das Popup nur beim Laden und im Rückfall: „Lokale KI: lädt … 40 %“, „aktiv (WASM)“, „inaktiv – nur Regeln (Grund)“ oder „aus – nur Regeln“. Gründe: Modell-Datei fehlt im Paket, Modell nicht lesbar, Modell startet nicht, Laden dauerte zu lange (90 s).
- **Vorladen (16.10.2026):** das Modell lädt 3 s nach dem Browserstart bzw. nach Installation oder Update im Hintergrund (eigener Worker im Offscreen-Dokument, der Browser bleibt bedienbar), ebenso beim Einschalten der Erkennung und beim Öffnen von Popup oder Einstellungen. Vorher lud es erst beim ersten geprüften Text; bis dahin stand im Popup immer „noch nicht geladen“. Bei ausgeschalteter Erkennung wird nichts geladen ([Design-Review](sicherheit/design-review-ki-vorladen.md)).
- **Speicher:** nach 10 min ohne Prüfung wird das Modell wieder entladen; der Status bleibt „aktiv“, der nächste Text lädt es neu (ca. 1–4 s).

## Einstellung und Richtlinie

`detection` (siehe [Einstellungen](einstellungen.md)): `ki` (Standard) = Regeln plus lokale KI; `regeln` = nur Regeln. In den Optionen: „Lokale KI zusätzlich zu den Regeln nutzen“. Eine gesetzte Richtlinie sperrt den Schalter; ungültige Werte gelten als Standard, nie als „keine Erkennung“.

## Bauen

Das Modell ist nicht im Git. `npm ci --ignore-scripts && node scripts/build-ki.mjs` lädt das Original (ca. 279 MB) einmal am gepinnten Commit von Hugging Face (nur HTTPS, nur Hugging-Face-Hosts), prüft SHA-256 gegen `extension/vendor/ki/PINS.json`, **kürzt das Vokabular** (siehe unten, `scripts/lib/ki-konvert.mjs`), prüft das Ergebnis gegen `modell.erzeugt` und legt Modell, ONNX-WASM und Tokenizer als base64-Stücke (je 16 MB) nach `extension/vendor/ki/`. Ohne diesen Schritt fehlt die KI und die Erweiterung arbeitet nur mit Regeln. Paketgrösse seit 16.10.2026: ca. 226 MB unkomprimiert (base64), ca. 147 MB gepackt (vorher 410 / 268 MB).

## Messung (16.10.2026)

Synthetischer Korpus `tests/helpers/ki-korpus.mjs`: je Sprache 12 Sätze mit 22 erfundenen Personen/Firmen/Adressen/Gesundheits- und Art.-9-Angaben und 11 harmlose Sätze (davon 3 schwierige: KI-Produktnamen, Städte, Pfade). Node: `node scripts/ki-messung.mjs`; Browser: E2E-Schritt `ki` (`E2E_NUR=ki node scripts/e2e/e2e.mjs`).

| Sprache | Soll | nur Regeln | Regeln + KI (sicher) | inkl. dezent | Präzision sicher | Fehlalarme sicher | ohne Kontext-Filter | P50 / P95 |
|---|---|---|---|---|---|---|---|---|
| DE | 22 | 27 % | 82 % | 86 % | 100 % | 0/11 | 3/11 | 43 / 62 ms |
| EN | 22 | 18 % | 95 % | 95 % | 100 % | 0/11 | 2/11 | 37 / 53 ms |
| FR | 22 | 18 % | 95 % | 95 % | 96 % | 0/11 | 2/11 | 40 / 51 ms |
| PT | 22 | 14 % | 86 % | 86 % | 100 % | 0/11 | 2/11 | 35 / 54 ms |

Node, WASM, 1 Thread. Je Typ (sicher): Personen 40/40, Firmen 20/20, Adressen 7/8, Gesundheit 11/16, besondere Kategorien 1/4 – Gesundheit und Art. 9 bleiben zusätzlich bei den Kontext-Regeln.

Browser (Edge headless, Offscreen-Worker, ganzer Weg Service Worker → Offscreen → Worker):

| Pfad | Laden (kalt) | je Satz P50 / P95 | Treffer sicher | Fehlalarme | Speicher-Spitze / danach |
|---|---|---|---|---|---|
| WASM (Standard) | ca. 1–4 s | 40 / 55 ms | 77/88 | 0/44 | ca. 1.6 GB / ca. 1.05 GB |
| WebGPU | ca. 4–5 s | 341 / 366 ms | 78/88 | 1/44 | ca. 1.9 GB |

Live-Hinweis nach Tipp-Ende auf den Attrappen von ChatGPT, claude.ai, Gemini und M365 Copilot: ca. 520 ms (davon 400 ms Tipp-Pause), seit dem Vorladen auch beim ersten Mal (E2E 16.10.2026: 517 ms; vorher ca. 1 s). Status im Popup nach dem Öffnen (E2E-Schritt `kiseite`): „lädt … %“ sofort, „aktiv (WASM)“ nach rund 1–2 s Ladezeit. Der Netzwerk-Sperrtest im selben Lauf zeichnet alle Anfragen von Seiten, Service Worker, Offscreen-Dokument und Workern auf: keine Anfrage ausser Erweiterung und Attrappen, auch nicht im Fehlerpfad (beschädigtes Modell-Stück → Status „inaktiv – nur Regeln“ mit Grund, IBAN weiter erkannt).

**Entscheid:** WASM ist Standard – das INT8-Modell ist auf WebGPU rund 8× langsamer (quantisierte Operatoren laufen dort nicht beschleunigt) und braucht mehr Speicher. WebGPU bleibt für ein späteres fp16-Modell vorbereitet.

## Kleiner machen (16.10.2026)

Ziel: Paket deutlich kleiner (möglichst unter 100 MB), Speicher beim Laden unter ca. 1 GB, gleich gute Erkennung in allen heutigen Sprachen, erweiterbar für weitere Sprachen. Design-Review: [Vokabular kürzen](sicherheit/design-review-ki.md#design-review-vokabular-kürzen-16102026), freigegeben mit Auflagen.

**Gewählt: Vokabular kürzen, INT8 bleibt.** Das Modell ist zu 69 % Einbettungs-Matrix (250 002 Teilwörter × 768, 192 MB); der eigentliche Rechenteil (Encoder, 86 MB) bleibt byte-gleich. Behalten werden die Sondertoken, alle Einzelzeichen und die laut Tokenizer wahrscheinlichsten Teilwörter der Unicode-Bereiche in `PINS.json` (`modell.vokabular`: heute lateinische Schrift mit Latin-1 und Latin Extended A/B, Satzzeichen, Währungszeichen), bis 80 000 Teilwörter. Wörter, deren Teilwörter fehlen, zerlegt der Tokenizer in kleinere vorhandene Stücke – kein Zeichen lateinischer Schrift wird „unbekannt“.

**Weitere Sprachen nachrüsten:** Sprachen in lateinischer Schrift (z. B. NL, PL, CS, RO, DA, SV) brauchen nichts – das Modell ist auf 24 EU-Sprachen trainiert, die Teilwörter sind schon in der Auswahl. Für eine neue Schrift (z. B. Griechisch `0370-03FF`, Kyrillisch `0400-04FF`) den Bereich in `modell.vokabular.bereiche` ergänzen und `groesse` passend erhöhen (etwa +10 000 je Schrift ≈ +7,3 MB), Korpus der Sprache in `tests/helpers/ki-korpus.mjs` ergänzen, `node scripts/ki-messung.mjs --original` gegen `node scripts/ki-messung.mjs` vergleichen, dann `node scripts/build-ki.mjs --pins` (neue Pins, Review). Ohne neue Pins bricht der Build ab.

Messung (Node 24, onnxruntime-web WASM, 1 Thread, Korpus `tests/helpers/ki-korpus.mjs` jetzt mit IT/ES: je Sprache 22 Soll-Angaben, 11 harmlose Sätze; `node scripts/ki-messung.mjs [--original]`; Varianten mit Wegwerf-Skripten in `.tmp`, nicht im Repo). Treffer = „Regeln + KI sicher“ über alle 6 Sprachen (132 Soll-Angaben); Zeilen 20 000 und 35 000 mit der ersten, engeren Zeichenauswahl (nur Latin-1), alle anderen mit der gewählten:

| Variante | Modell | Paket gepackt | Speicher-Spitze Node | Laden | je Satz P50 | Treffer sicher (inkl. dezent) | Fehlalarme sicher / dezent | Urteil |
|---|---|---|---|---|---|---|---|---|
| Heute: INT8, 250 002 Teilwörter | 265.8 MB | 268 MB | 1443 MB | 724 ms | 37 ms | 114 (120) | 0 / 0 | Ausgangswert |
| fp32 (zum Vergleich) | 1058.8 MB | – | 4318 MB | 1592 ms | 71 ms | 120 (124) | 0 / 1 | zu gross |
| INT8, 20 000 Teilwörter | 97.4 MB | ca. 103 MB | 469 MB | 314 ms | 44 ms | 108 (110) | 0 / 1 | schlechter |
| INT8, 35 000 | 108.4 MB | – | 527 MB | 345 ms | 41 ms | 112 (115) | 0 / 0 | schlechter |
| INT8, 50 000 | 119.3 MB | – | 589 MB | 347 ms | 39 ms | 113 (117) | 0 / 0 | EN −1, FR −1 |
| INT8, 60 000 | 126.7 MB | – | 632 MB | 362 ms | 39 ms | 116 (119) | 0 / 0 | 1 Gesundheitsangabe (EN, dezent) fehlt |
| **INT8, 80 000 (gewählt)** | **141.3 MB** | **147 MB** | **799 MB** | **397 ms** | **38 ms** | **114 (120)** | **0 / 0** | **dieselben Treffer und Fehltreffer je Typ und Sprache wie heute** |
| INT4-Encoder (MatMulNBits, Block 32, aus fp32) + 35 000 | 80.1 MB | ca. 85 MB | 437 MB | 324 ms | **229 ms** | 120 (124) | **3 / 10** | 6× langsamer, Fehlalarme |
| INT4-Encoder, Block 16 + 35 000 | 91.5 MB | – | 470 MB | 306 ms | 248 ms | 117 (122) | 1 / 6 | 6× langsamer |
| INT8-Encoder + INT4-Einbettung (Block 64) + 60 000 | 107.4 MB | – | 550 MB | 354 ms | 42 ms | 113 (116) | 0 / 0 | 1 Treffer weniger, mehr Graph-Umbau |

Gewählte Variante je Sprache (sicher / inkl. dezent von 22, Fehlalarme sicher): DE 18/19, EN 20/21, FR 20/21, PT 19/19, IT 18/20, ES 19/20, Fehlalarme 0/11 in jeder Sprache – genau wie das Original (gleiche verfehlte Angaben). Ohne Kontext-Filter (Rohfunde) 1 Fehlalarm weniger (PT 1/11 statt 2/11, IT 2/11 statt 3/11). Wie oft ein Wort anders zerlegt wird: 2.8–7.7 % der verschiedenen Wörter im Korpus, 11 % in den deutschen Fachtexten unter `docs/` (viele englische Fachwörter); die Erkennung blieb dabei gleich.

Browser (Edge headless, ganzer Weg Service Worker → Offscreen → Worker, E2E-Schritt `ki`, Speicher = grösster Edge-Prozess; Live-Hinweis nach Tipp-Ende weiter ca. 500 ms inkl. 400 ms Tipp-Pause; KI-Netzwerk-Sperrtest ohne Anfrage nach aussen):

| Pfad | Laden (kalt) | je Satz P50 / P95 | Treffer sicher | Fehlalarme | Speicher-Spitze |
|---|---|---|---|---|---|
| WASM, Original (Messung oben, 4 Sprachen) | ca. 1–4 s | 40 / 55 ms | 77/88 | 0/44 | ca. 1.6 GB |
| **WASM, gekürzt (16.10.2026, 6 Sprachen)** | **2.7 s** | **41 / 58 ms** | **114/132** | **0/66** | **1038 MB** |
| WebGPU, gekürzt | 3.9 s | 351 / 375 ms | 116/132 | 0/66 | 1116 MB |

**Verworfen:**
- *INT4 (MatMulNBits):* das kleinste Paket, aber auf WASM rund 6× langsamer (229 statt 37 ms je Satz; 4000 Zeichen würden die 3-s-Grenze sprengen) und neue Fehlalarme. `accuracy_level 4` brachte im WASM-Build keine Beschleunigung.
- *fp16:* 2 Byte je Gewicht – grösser als INT8, nur für WebGPU sinnvoll (das hier 8× langsamer ist).
- *INT4 nur für die Einbettung:* spart 34 MB, verliert aber einen Treffer und braucht 17 neue Graph-Knoten statt eines ersetzten Tensors.
- *Kleineres mehrsprachiges NER-Modell:* laut Modellvergleich (Recherche 15.10.2026) gibt es kein kleineres Modell mit Gesundheits- und Art.-9-Klassen in allen sechs Sprachen; kleine Modelle (29–46 MB) sind nur englisch.
- *Je Sprache nachladbare Pakete ohne Netz* (zweite Erweiterung oder lokales Zusatzpaket): der Encoder (86 MB) ist für alle Sprachen gleich und müsste in jedem Paket stecken; je Sprache liesse sich nur ein Teil der Einbettung abtrennen (wenige MB), dafür bräuchte es Nachrichten zwischen Erweiterungen und eine zweite Lieferkette. Lohnt erst bei vielen Schriften.

**Unter 100 MB** erreicht die gewählte Variante nicht: Encoder (86 MB) + ONNX-WASM (26 MB) liegen schon darüber. Erreichbar wäre es nur mit INT4 (zu langsam, siehe oben) oder einem viel kleineren Vokabular (20 000: −6 Treffer). Möglicher nächster Hebel ohne Qualitätsverlust: das WASM ohne WebGPU-Unterstützung (`ort-wasm-simd-threaded.wasm`, 14 MB statt 26 MB) – WebGPU ist im Produkt ohnehin aus (eigener Auftrag, weil er den vorbereiteten WebGPU-Pfad entfernt).

**Grenze:** Namen und Angaben in nicht-lateinischer Schrift (Kyrillisch, Griechisch, Arabisch, CJK) erkennt die KI nicht mehr (unbekannte Token); die Regeln gelten weiter.

### Paketgrenzen der Stores (Stand 16.10.2026)

| Store | Grenze | Quelle |
|---|---|---|
| Chrome Web Store | ZIP höchstens 2 GB („The maximum supported file size for an extension package is 2GB“) | https://developer.chrome.com/docs/webstore/publish (abgerufen 16.10.2026) |
| Firefox AMO | höchstens 200 MB („The maximum file size accepted is 200 MB“) – das alte Paket (268 MB gepackt) lag darüber, das neue (147 MB) darunter | https://extensionworkshop.com/documentation/publish/submitting-an-add-on/ (abgerufen 16.10.2026) |
| Edge Add-ons | keine Grenze in der offiziellen Anleitung genannt (Stand der Seite 02.09.2026) | https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension (abgerufen 16.10.2026) |

Hinweis ohne offizielle Quelle: in Foren wird berichtet, dass AMO grosse einzelne JS-Dateien (über ca. 4 MB) nicht prüft bzw. beanstandet – vor einer Firefox-Einreichung mit den 16-MB-Stücken testen.

## Grenzen und nächste Schritte

- Speicher: siehe „Kleiner machen“; die Spitze sinkt mit dem gekürzten Vokabular in Node von 1443 auf 799 MB, im Browser von ca. 1.6 GB auf ca. 1.04 GB (grösster Edge-Prozess) – das Ziel von ca. 1 GB ist damit knapp erreicht.
- Senden direkt nach dem Tippen (vor Ablauf der Tipp-Pause und der KI-Antwort) prüft nur mit den Regeln.
- Der Korpus ist klein (132 Soll-Angaben, seit 16.10.2026 mit IT/ES); vor einem Entscheid über den Store-Einsatz mit grösserem, synthetischem Korpus messen.
- Kein Ersatz für Sorgfalt: die KI ist eine Hilfe, keine Garantie.
