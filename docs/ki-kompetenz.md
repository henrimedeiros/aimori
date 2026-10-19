# Erklärungen und KI-Kompetenz-Nachweis

Stand 14.10.2026. Jede Warnung erklärt in einem Satz, warum der erkannte Wert heikel ist, und verlinkt „Mehr erfahren“ auf eine lokale Erklärseite der Erweiterung. Aus den lokal gezählten Erklärungen lässt sich eine **Selbstauskunft** drucken, die Firmen für ihre Massnahmen zur KI-Kompetenz verwenden können.

## Erklärungen

- Ein fester Satz je Datentyp-Gruppe (Finanzdaten, Sozialversicherung, Gesundheit, Firmendaten, Kontaktdaten, Steuernummer, Zugangsdaten, Ausweisdokument, Nationale ID) in allen Oberflächensprachen.
- **Lernmodus:** Für häufige Datentypen (z. B. IBAN, Kartenprüfcode, Mailadresse, AHV-Nummer, Sitzungstoken, privater Schlüssel) steht statt des Gruppensatzes ein eigener Satz, warum genau dieser Typ heikel ist (`why_<typ-id>` in `_locales`). Die Sätze sind fest und nennen nie den gefundenen Wert. Im Vollbild-Dialog höchstens vier Sätze.
- In der Leiste steht der Satz hinter dem erkannten Typ (bei wenig Platz gekürzt, ganz als Tooltip), im Vollbild-Dialog je Gruppe ein Absatz.
- „Mehr erfahren“ öffnet `ui/wissen.html#<gruppe>` in einem neuen Tab: längere Erklärung, erkannte Datentypen der Gruppe, was man tun kann. Die Seite liegt in der Erweiterung (keine Website, kein Netz) und ist für Webseiten nicht erreichbar.
- Die Texte sind allgemeine Information, keine Rechtsberatung.

## Lokale Zähler

Gespeichert in `chrome.storage.local` unter `dlx.kompetenz`, **nur Zahlen je Datentyp-Gruppe und Monat**:

| Feld | Gezählt wenn |
|---|---|
| `seen` | eine Meldung mit Erklärung angezeigt wurde (Senden, Einfügen, Hinweis beim Tippen; einmal je Meldung und Gruppe, ein erneuerter Tipp-Hinweis mit denselben Gruppen zählt nicht erneut) |
| `redacted` | danach geschwärzt oder Platzhalter verwendet wurde |
| `cancelled` | danach nicht gesendet bzw. nicht eingefügt wurde (Bearbeiten, Verwerfen, von der Richtlinie gesperrt) |
| `sent` | danach trotzdem gesendet bzw. eingefügt wurde |

- Keine Werte, Texte, Datentyp-IDs, KI-Seiten oder Zeitpunkte feiner als der Monat. „Kein sensibler Wert“ und „Ausblenden“ zählen nicht.
- Gezählt wird nur im Service Worker auf Rückmeldung des erweiterungseigenen Meldungs-Frames; Webseiten und Content Scripts können nicht zählen. Gelesene Daten werden streng geprüft, Ungültiges verwirft den ganzen Speicher.
- Aufbewahrung 13 Monate, ältere Monate werden beim Schreiben und beim Start gelöscht.
- Zurücksetzen: Einstellungen → „KI-Kompetenz-Nachweis“ → „Zähler zurücksetzen“. Teilen sich mehrere Personen ein Browserprofil, sehen alle dieselben Zahlen.

## Schalter und Richtlinie

| Schlüssel | Typ | Standard | Bedeutung |
|---|---|---|---|
| `competenceRecord` | Wahr/Falsch | `true` | `false`: nichts wird gezählt, die Zähler werden sofort gelöscht (auch bei Wechsel zur Laufzeit), der Nachweis entfällt. Als Richtlinie gesetzt ist der Schalter in den Einstellungen gesperrt. Die Erklärungen selbst steuert `learningMode`. |
| `learningMode` | Wahr/Falsch | `true` | `false`: Meldungen zeigen keine Erklärung und kein „Mehr erfahren“; `seen` zählt dann nicht. Benutzer dürfen abschalten (Einstellungen → Übersicht → Lernmodus); als Richtlinie gesetzt gesperrt. |

Ohne Richtlinie kann jede Person den Nachweis in den Einstellungen abschalten.

## Nachweis drucken

Einstellungen → „Nachweis öffnen“ öffnet `ui/nachweis.html`:

- Kopf mit Firmenname und Logo aus dem Whitelabel-Branding (`branding.companyName`, `branding.logo`), Zeitraum (letzte 12 Monate), Erstellungsdatum.
- Optionales Namensfeld: wird nie gespeichert und nirgends hin geschickt, nur gedruckt.
- Tabelle je Gruppe und je Monat mit den vier Zahlen; Gesundheit und Nationale ID lassen sich per Häkchen ausblenden (besonders schützenswerte Themen).
- „Drucken oder als PDF speichern“ nutzt den Druckdialog des Browsers (Ziel „Als PDF speichern“). Die Erweiterung erzeugt das PDF nicht selbst.

Der Nachweis ist eine **Selbstauskunft**: lokal gezählt und nicht gegen Veränderung geschützt. Er zeigt Lernmomente im Alltag, belegt nicht, dass Pflichten eingehalten sind, und ersetzt keine Schulung.

## Bezug zum EU AI Act

Art. 4 der Verordnung (EU) 2024/1689 (KI-Verordnung) verlangt von Anbietern und Betreibern von KI-Systemen Massnahmen, damit ihr Personal und weitere Personen, die in ihrem Auftrag mit KI-Systemen umgehen, nach besten Kräften über ausreichende KI-Kompetenz verfügen. Der Artikel gilt seit dem 2. Februar 2025 (Art. 113 Bst. a). Für Schweizer Firmen gilt die Verordnung nur bei EU-Bezug (z. B. KI-Systeme in der EU in Verkehr gebracht oder deren Ergebnisse in der EU verwendet).

Quelle: Verordnung (EU) 2024/1689, ABl. L vom 12.7.2024, https://eur-lex.europa.eu/eli/reg/2024/1689/oj (abgerufen 14.10.2026). Keine Rechtsberatung.

## Später: CIPP

`DLX.kompetenz.report(store, 'YYYY-MM')` liefert schon heute die Form für eine spätere Meldung: `{ schema: 'dlx-kompetenz/1', month, groups: { <gruppe>: { seen, redacted, cancelled, sent } } }` – nur Zahlen, feste Schlüssel. Es gibt keinen Aufrufer und keinen Netzzugang; `reportingUrl` bleibt reserviert. Jede Übermittlung (CIPP, Admins) braucht ein neues Design-Review und die ausdrückliche Freigabe; sinnvoll wäre nur eine aggregierte Meldung über eine Mindestanzahl Personen, ohne Personenbezug und mit Information der Mitarbeitenden (Verhaltensüberwachung am Arbeitsplatz ist in der Schweiz nach Art. 26 ArGV 3 unzulässig).

