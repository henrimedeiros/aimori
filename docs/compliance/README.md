# Nachweise für Gesetze und Normen

Stand 16.10.2026. Die Erweiterung erzeugt lokal einen **Nachweis-Bericht** nur mit Zahlen, den Firmen bei einem Audit, einer Kundenanfrage oder der Cyber-Versicherung als Beleg für ihre technischen Massnahmen bei der KI-Nutzung vorlegen können. Der Bericht ist eine **Selbstauskunft, keine Rechtsberatung**; er zeigt, worauf sich die Massnahmen beziehen, und sagt nicht, dass Pflichten eingehalten sind.

## Inhalt des Berichts

| Teil | Inhalt | Quelle |
|---|---|---|
| Kopf | Organisation (Branding `companyName`), Logo (nur PNG/JPEG/WebP), Zeitraum, Erstellungsdatum (Tag) | Richtlinie `branding` |
| Treffer nach Aktion | geschwärzt (Schwärzen, Platzhalter) · gestoppt (nicht gesendet, blockiert, Seite gesperrt, Schutz inaktiv, Datei-Hinweis) · erlaubt (trotzdem gesendet, „kein sensibler Wert“) | lokale Tageszähler `dlx.stats` ([Statistik](../statistik.md)) |
| Treffer nach Datentyp | Summen je Datentyp-Gruppe (Finanzdaten, Gesundheit, Zugangsdaten …) | dito |
| Treffer nach KI-Seite | ChatGPT, Claude, Gemini, Copilot, Microsoft 365 Copilot | dito |
| Aktive Regeln | Name jeder per Richtlinie gesetzten Regel mit festem Zustandswort (`an`/`aus`, Stufe wie `block`, Anzahl Einträge oder „gesetzt“) | `chrome.storage.managed` |
| Vorlagen | je gewähltem Gesetz/Norm eine Tabelle Anforderung → Massnahme → Beleg im Bericht | `extension/common/bericht.js` |

**Nie enthalten:** eingegebene Texte, erkannte Werte, Prüfsummen, Wörterbuch- oder Label-Inhalte, Workspace-Namen, Personen- oder Gerätenamen, Uhrzeiten, Einzelereignisse. Die Zähler sind Tageszahlen mit **90 Tagen Ablauf** und lassen sich in den Einstellungen zurücksetzen.

## Vorlagen

| ID | Gesetz / Norm | Dokument |
|---|---|---|
| `revdsg` | Schweiz: revDSG (SR 235.1) und DSV | [revdsg.md](revdsg.md) |
| `dsgvo` | EU: DSGVO (Verordnung (EU) 2016/679) | [dsgvo.md](dsgvo.md) |
| `hipaa` | USA: HIPAA (45 CFR Part 160/164), nur Zuordnung | [hipaa.md](hipaa.md) |
| `euaiact` | EU: KI-Verordnung (EU) 2024/1689, Art. 4 KI-Kompetenz | [euaiact.md](euaiact.md) |
| `iso27001` | ISO/IEC 27001:2022 Anhang A | [iso27001.md](iso27001.md) |

## Bedienung

- Popup → „Nachweis-Bericht (Gesetze und Normen)“ oder Einstellungen → Statistik → derselbe Knopf öffnet `ui/bericht.html`.
- Zeitraum 7, 30 oder 90 Tage und Vorlagen wählen (per Richtlinie fest).
- **Drucken oder als PDF speichern** nutzt den Druckdialog des Browsers (Ziel „Als PDF speichern“).
- **HTML herunterladen** speichert eine eigenständige Datei `<produkt>-bericht-JJJJ-MM-TT.html` (ohne Personen- oder Gerätebezug). Die Datei enthält kein ausführbares Skript, eine strenge Content-Security-Policy und zusätzlich einen maschinenlesbaren Datenblock (`dlx-bericht/1`, nur Zahlen und feste Schlüssel, je Export eine neue Zufalls-Id).
- Kein neues Browser-Recht, kein Netzwerkzugriff: Der Download läuft als Link aus der Erweiterungsseite.

## Für Admins: Richtlinie und Sammeln

Richtlinien (siehe [Einstellungen](../einstellungen.md)): `complianceReport` (an/aus), `complianceFrameworks` (feste Vorlagen), `complianceReportDays` (7/30/90).

Die Erweiterung legt **nie selbst Dateien ab** und sendet nichts. Wer einen Firmenbericht braucht, sammelt die von den Mitarbeitenden exportierten Dateien mit eigenen Mitteln (z. B. Ablage im Teams-Kanal) und fasst sie lokal zusammen:

```
node scripts/bericht-sammeln.mjs [--min 5] [--out firmenbericht.md] <ordner|dateien>
```

- Liest je Datei nur den einen Datenblock (höchstens 1 MB, kein HTML-Parser), prüft ihn streng und verwirft ungültige Dateien ganz (Ausgabe nur der Anzahl).
- Jede Export-Id zählt einmal, leere Exporte zählen nicht. Unter **5** gültigen Exporten bricht das Skript ohne Teilsummen ab; `--min` lässt sich nur erhöhen.
- Ausgabe nur als Summe, nie je Datei; `--out` schreibt nur eine neue Datei und überschreibt nie.

**Pflichten der Organisation (Design-Review 16.10.2026, Auflage 5):**

- Die einzelnen Dateien nach dem Zusammenzählen löschen.
- Die Zahlen dienen nur dem Nachweis von Massnahmen, nicht der Leistungs- oder Verhaltenskontrolle (Art. 26 ArGV 3).
- Mitarbeitende vorher informieren (Art. 19 revDSG) und anhören (Art. 48 ArG).
- Auch mit Mindestanzahl kann, wer die einzelnen Dateien hat, Rückschlüsse auf Personen ziehen; das lässt sich technisch nicht ausschliessen und ist organisatorisch zu regeln.

## Grenzen

- Selbstauskunft: lokal gezählt, nicht gegen Veränderung geschützt (bewusst keine Signatur, sonst bräuchte es Schlüssel).
- Die Erweiterung prüft Text, eingefügte Bilder und Uploads nur auf den unterstützten KI-Seiten; andere Kanäle (Mail, Dateiablagen, Apps) deckt der Bericht nicht ab.
- Die Zuordnungen sind allgemeine Information, keine Rechtsberatung; die Beurteilung im Einzelfall bleibt bei der Organisation.
