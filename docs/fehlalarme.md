# Fehlalarme: Messung, Zielwerte, Stufen

Stand: 14.10.2026. Anlass: Hinweis eines Fachmanns, bei der Erkennung darauf zu achten, dass nicht jede zufällige Zahl als Bankkonto gemeldet wird. Messung: `node scripts/fehlalarm.mjs` (schnell: `--schnell`, maschinenlesbar: `--json`). Das Skript läuft ohne Netz und ohne Abhängigkeiten, erzeugt den Korpus mit festem Startwert selbst (nur erfundene Werte, Dokumentations-IPs nach RFC 5737) und endet mit Exit-Code 1, wenn ein Zielwert verfehlt wird.

## Stufen

| Stufe | Wann | Wirkung (Standard `uncertainFindings=hint`) |
|---|---|---|
| **sicher** | Prüfziffer, Länge und Präfix stimmen, Wert steht nicht in offensichtlichem Nicht-Kontext und – wo nötig – im Normformat oder mit Kontextwort | Dialog beim Senden/Einfügen, Regel (`warn`/`redact`/`block`) gilt |
| **unsicher** | Nur Format ohne Prüfziffer (Telefon, IPv4) ohne Kontextwort; Prüfziffer-Typ mit schwachem Präfix (Karten, AHV, NIR, BE-Nationalnummer) unformatiert ohne Kontextwort; Wert in Nicht-Kontext (siehe unten) oder in Query/Fragment einer URL | nur dezenter grauer Hinweis beim Tippen („möglicherweise …“), **hält das Senden nie an** |
| verworfen | Typ **ohne** Prüfziffer (Telefon, IPv4) in offensichtlichem Nicht-Kontext | keine Meldung |

Typen mit Prüfziffer werden nie ganz verworfen, höchstens unsicher. Typen, die schon bisher nur mit Kontextwort melden (z. B. Steuer-ID DE, SSN US, BSN NL), sind unverändert sicher, wenn sie melden.

**Offensichtlicher Nicht-Kontext** (je Fund nur ein kleines Fenster, linear): Teil einer längeren Ziffernfolge (Nachbar `. , : / -` mit Ziffer, z. B. Dezimalzahl `0.4242…`, Version, UUID-Gruppe), gruppierter Wert inmitten weiterer Zifferngruppen (eine einzelne Folgegruppe mit 3–4 Ziffern = CVV oder `MM/YY` gehört dazu), Hex-Hash/UUID-Token, Pfadsegment einer `http(s)`-URL, IPv4 direkt nach `v`/`Version`/`build`.

**Normformat**: Karten `4-4-4-4` bzw. `4-4-4-4-3` (Leerzeichen oder Bindestrich), Amex `4-6-5`; AHV `756.1234.5678.97`; NIR mit Leerzeichen; BE `85.07.30-033.28`.

**Richtlinie** `uncertainFindings`: `hint` (Standard), `warn` (unsichere Funde öffnen den Dialog, höchstens „Warnen“), `enforce` (Regeln gelten wie für sichere Funde – für Organisationen, die vorher `block`/`redact` für Telefon o. Ä. gesetzt hatten).

### Geänderte Wirkung (Release-Hinweis)
- Telefonnummern und öffentliche IPv4-Adressen **ohne Kontextwort** (z. B. „Tel.“, „Telefon“, „Server“) halten das Senden nicht mehr an; sie erscheinen nur als dezenter Hinweis. Bisheriges Verhalten: `uncertainFindings=enforce`.
- Unformatierte Karten-, AHV-, NIR- und BE-Nummern ohne Kontextwort ebenso. Mit Kontextwort („Karte“, „AHV“ …) oder im Normformat bleiben sie sicher.
- Neu erkannt: Karte mit nachfolgendem CVV oder Ablaufdatum in derselben Zifferngruppe (`4242 4242 4242 4242 123`), bisher eine Lücke.

## Zielwerte

| Ziel | Wert | Ergebnis 14.10.2026 |
|---|---|---|
| Reine Zufallsziffern, je sicher meldendem Typ und je Länge 6–24 (je 100 000 Werte) | < 1 : 100 000 | 0 bei allen Längen |
| Code-/Log-Korpus (Code, Logs, UUIDs, Hashes, Konfiguration, Fliesstext mit Vermerk-Wörtern; 120 000 Proben), sicher gemeldet | < 1 : 10 000 („nahe null“) | 0 / 120 000 |
| Trefferquote Testwerte (alle 230 Datentypen, dieselben Werte wie die Unit-Tests) | 100 %, davon sicher 100 % | 230/230, sicher 230/230 |

**Erweiterung Geheimnisse und Vermerke (14.10.2026, Design-Review `docs/sicherheit/design-review-geheimnisse-vermerke.md`):** zwei neue Korpus-Arten im Code-/Log-Ziel – `konfig` (Code und Konfiguration ohne echte Geheimnisse: Platzhalter wie `changeme`, `<your-key>`, `${SECRET}`, Variablen-Verweise, Namen mit Geheimnis-Wort für Längen/Dateien/URLs, npm-Integrity-Hashes, öffentliche SSH-Schlüssel, Zertifikatsköpfe, JWT-artige Zeichenketten ohne gültige Struktur, Code-Enums mit CONFIDENTIAL) und `prosa_vermerk` (Fliesstext mit „vertraulich“, „intern“, „confidential“, „NDA“, „riservato“ u. a. ausserhalb der Vermerk-Stellung, sechs Sprachen). Vorher/nachher je Korpus-Art: alle bisherigen Arten und alle Zufallsziffern-Längen unverändert (zeilengleiche Ausgabe); `konfig` 0 sicher / 0 unsicher, `prosa_vermerk` 0 / 0 (je 20 000 Proben). Trefferquote 194/194 → 230/230 (36 neue Datentypen). Laufzeit der Engine auf 200 000 Zufallsziffern gleich wie vorher (kalt 93–96 ms, warm 82 ms; neue Muster mit Literal-Vorprüfung `pre`).
| Grenz- und Umgehungsfälle (Karte mit CVV/Ablauf sicher; Wert in Query, nach „Version“, als Dezimalzahl unsicher, nicht verworfen) | alle wie erwartet | 7/7 |

**Erweiterung Kontext-Risiken (14.10.2026, Design-Review `docs/sicherheit/design-review-kontext.md`, Doku [Kontext-Risiken](kontext-risiken.md)):** fünf neue Korpus-Arten, jede Probe einzeln geprüft (Listen würden sonst über Probengrenzen zählen), je 20 000 Proben: `fragen_gesundheit`, `fragen_personal`, `fragen_glaube` (allgemeine Fragen ohne Person in 7 Sprachen, auch „Kann eine Frau Krebs bekommen?“) – Ziel 0 Funde des Pakets `context`, auch nicht unsicher; `prosa_namen` (Fliesstext mit Namen ohne heikle Stichwörter) und `listen_klein` (bis 9 Adressen, immer dieselbe Support-Adresse, Produkt-CSV mit Spalte „Name“, Code mit wenigen Mails, Logs) – Ziel 0 sichere Funde. Ergebnis: alle fünf 0 sicher / 0 unsicher. Alle bisherigen Zeilen (Zufallsziffern je Länge, Korpus-Arten, je Paket, Code/Log 0/120 000) zeilengleich wie vorher; Trefferquote 230/230 → 236/236 (6 neue Datentypen, alle sicher). 7 neue Grenzfälle (Adresse allein unsicher, in der Kombi sicher; „Mein Mitarbeiter hat Krebs“ unsicher; mit Name sicher; allgemeine Fragen kein Fund) wie erwartet. Fallstrick: unsichere Telefonnummern zählen für Listen nur mit „+“ oder einem Telefon-Wort im Text – sonst machten 400 gruppierte Lager- und Seriennummern eine „Telefonliste“.

## Ergebnis vorher/nachher

Gleicher Korpus, alle Pakete aktiv. Vorher = Engine aus `main` vor dieser Änderung (kannte keine Stufen, jeder Fund zählte als sicher). Rate = Anteil Proben mit mindestens einem Fund.

### Reine Zufallsziffern (100 000 je Länge)

| Länge | vorher sicher | Typen vorher | nachher sicher | nachher unsicher |
|---|---|---|---|---|
| 6–9 | 0 | – | 0 | 0 |
| 10 | 8,8 % | CH-Telefon 7 848, Telefon intl. 930 | 0 | 8,8 % |
| 11 | 1,1 % | Telefon intl. 938, BE-Nationalnummer 145 | 0 | 1,1 % |
| 12 | 0,9 % | Telefon intl. 881 | 0 | 0,9 % |
| 13 | 1,9 % | Visa 1 024, Telefon intl. 902, AHV 21 | 0 | 1,9 % |
| 14 | 0,9 % | Telefon intl. 916 | 0 | 0,9 % |
| 15 | 1,3 % | Telefon intl. 906, Amex 228, NIR 181 | 0 | 1,3 % |
| 16 | 2,9 % | Mastercard 1 000, Visa 991, Telefon intl. 889 | 0 | 2,9 % |
| 17 | 0,9 % | Telefon intl. 875 | 0 | 0,9 % |
| 18 | 0 | – | 0 | 0 |
| 19 | 1,0 % | Visa 1 008 | 0 | 1,0 % |
| 20–24 | 0 | – | 0 | 0 |

### Korpus-Arten (20 000 Proben je Art)

| Art | vorher sicher | nachher sicher | nachher unsicher |
|---|---|---|---|
| Programmcode | 0,69 % | 0 | 0,45 % |
| Logs | 0,29 % | 0 | 0,31 % |
| UUIDs | 0,60 % | 0 | 0,41 % |
| Hashes (MD5/SHA/Git) | 0,065 % | 0 | 0,065 % |
| Zeitstempel/Daten | 0,12 % | 0 | 0 |
| Bestell-/Rechnungs-/Sendungs-/Ticketnummern | 0,19 % | 0 | 0,13 % |
| Artikelnummern/EAN/ISBN | 2,5 % | 0 | 2,5 % |
| Versionsnummern | 12 % | 0 | 12 % |
| IP-artige Zahlen (privat, Doku-Netze, Abschnitte) | 25 % | 0 | 25 % |
| Mathe/Tabellen/Excel | 0,39 % | 0 | 0,20 % |
| Telefon-ähnliche Zahlen | 1,9 % | 0 | 1,9 % |
| Postleitzahlen | 0 | 0 | 0 |
| Preise | 0 | 0 | 0 |
| Texte DE/EN/FR/IT/PT | 0,09–0,15 % | 0 | 0,05–0,15 % |
| *Info: Zufallszahlen im Kartenformat 4-4-4-4* | 2,9 % | 1,8 % | 0,8 % |
| *Info: harmlose Sätze mit Kontextwörtern* | 0,14 % | 0,13 % | 0,015 % |

Die zwei Info-Zeilen haben keinen Zielwert: Eine Zahl im Kartenformat mit gültigem Präfix und Luhn-Prüfziffer oder eine Zahl mit gültiger Prüfziffer direkt nach „Visa“/„Karte“ meldet die Erweiterung bewusst – das ist genau die Form einer echten Kartennummer.

### Je Paket (Funde, sicher/unsicher, alle Arten zusammen)

| Paket | vorher sicher | nachher sicher | nachher unsicher |
|---|---|---|---|
| CH | 8 286 | 0 | 8 229 |
| contact | 7 983 | 0 | 7 742 |
| finance | 5 122 | 389 (nur Info-Zeilen) | 4 818 |
| secrets (IPv4) | 7 590 | 0 | 7 588 |
| BE | 166 | 0 | 166 |
| FR | 195 | 0 | 195 |
| travel | 13 | 0 | 13 |
| DE, AT, IT, NL, US, BR, EU | 0 | 0 | 0 |

## Kein sensibler Wert
Im Dialog (erweiterungseigenes iframe) gibt es nach Bestätigung per Häkchen die Aktion **„Kein sensibler Wert“**: Die gemeldeten Werte werden danach 30 Tage lang auf allen Seiten nicht mehr gemeldet.
- Gespeichert wird nur `HMAC-SHA-256(Schlüssel, Typ + ":" + normalisierter Wert)` mit Ablaufdatum in `chrome.storage.local` (höchstens 500 Einträge), nie der Wert. Der 256-Bit-Schlüssel entsteht zufällig je Installation im Service Worker und geht nur an das Content Script (Arbeitsspeicher).
- Nur bei Aktion „Warnen“, nur wenn `allowNotSensitive` und `allowUserOverride` gelten; nicht für Telefonnummern und IPv4 (zu kleiner Wertebereich).
- Einstellungen zeigen nur die Anzahl und „Liste löschen“; Statistik zählt die Entscheidung `notsensitive` als Zahl.
- Grenze: Wer Zugriff auf das Browserprofil hat, kann Werte mit kleinem Wertebereich (z. B. AHV, rund 10⁹ Möglichkeiten) mit dem lokalen Schlüssel durchprobieren. Darum Ablauf 30 Tage und Begrenzung auf 500 Einträge; dieselbe Person sähe mit Profilzugriff ohnehin Verlauf und Chat-Inhalte.

