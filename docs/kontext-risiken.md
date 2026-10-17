# Kontext-Risiken: Identität, besonders schützenswerte Daten, Kundenlisten

Stand: 14.10.2026 · Paket `context` (global, standardmässig an) · Code `extension/engine/packs-context.js` · Design-Review: [design-review-kontext.md](sicherheit/design-review-kontext.md)

Manche Texte sind nicht wegen einer einzelnen Nummer heikel, sondern wegen des Zusammenhangs: Name und Geburtsdatum zusammen mit einer Adresse, eine Diagnose zu einer bestimmten Person oder eine Liste mit hundert Kundenadressen. Das Paket `context` erkennt solche Fälle lokal im Browser, mit denselben Regeln wie alle anderen Datentypen (keine neuen Rechte, kein Netz, nichts gespeichert, an den Service Worker gehen nur Datentyp, Kategorie und Anzahl).

## Datentypen

| ID | Anzeige | Kategorie | Wann gemeldet |
|---|---|---|---|
| `identity_combo` | Identität: Name + Geburtsdatum + Adresse/Telefon/Ausweis | Personendaten | Name und Geburtsdatum und mindestens ein weiterer Teil (Postadresse, Telefon, Mail, Ausweis-/Sozialversicherungs-/nationale Nummer) im Umkreis von 400 Zeichen um den Namen. Schwelle per Richtlinie `identityMinParts`. Die Teile werden zusätzlich einzeln (sicher) gemeldet und beim Schwärzen ersetzt. |
| `art9_health` | Gesundheitsdaten zu einer Person | Gesundheit | Diagnosewörter, Krankheiten, Medikamente, ICD-10-Code direkt nach „ICD“/„Diagnose“ – nur mit Personenbezug. |
| `hr_record` | Personaldaten zu einer Person | Personendaten | Kündigung, Abmahnung, Lohn/Gehalt, Leistungsbeurteilung, Arbeitszeugnis, Krankmeldung – nur mit Personenbezug. |
| `art9_belief` | Religion, politische Ansicht oder Gewerkschaft einer Person | Personendaten | Konfession, Religionszugehörigkeit, Parteimitgliedschaft, politische Einstellung, Gewerkschaft – nur mit Personenbezug. |
| `mass_list` | Kundenliste/Export (viele Einträge) | Personendaten | Mindestens `massListMin` (Standard 10) **verschiedene** Mailadressen, Telefonnummern, IBANs oder Zeilen einer Tabelle mit Vor-/Nachname-Spalte (CSV mit `;` `,` Tab, Markdown-Tabelle, JSON). Die Leiste zeigt die Anzahl („37× Kundenliste/Export“). |
| `postal_address` | Postadresse | Kontaktdaten | Strasse + Hausnummer + PLZ + Ort (DE/CH/AT, FR, IT, ES, PT, NL, EN-Form). **Allein nur unsicher** (grauer Hinweis), sicher nur als Teil von `identity_combo`. |

Sprachen der Wortlisten: Deutsch, Englisch, Französisch, Italienisch, Spanisch, Portugiesisch, Niederländisch. Andere Sprachen werden nicht erkannt.

## Personenbezug

Gesundheit, Personaldaten und Religion/Politik/Gewerkschaft werden **nur** gemeldet, wenn im selben Absatz (bis zur nächsten Leerzeile) und höchstens 300 Zeichen entfernt eine Person erkennbar ist:

- **sicher** (Warnleiste): Anrede + Name („Herr Max Mustermann“, „Frau Mustermann“, „Herr XY“, „Herr Dr. med. MÜLLER-BEISPIEL“, „Mrs Jane Example“, „Sig.ra Chiara Esempio“; ein einzelner Name genügt, auch ganz gross geschrieben; nicht als Name gelten Rollen und Abkürzungen direkt nach der Anrede wie „Herr Doktor“, „Frau CEO“, „Fr. CHF“), Schlüssel + Name („Patient: …“, „Name: …“), verbreiteter Vorname + Nachname, Name direkt vor „geb./born/née …“, Geburtsdatum oder ein sicherer Fund der Kategorien Kontakt, Sozialversicherung, nationale ID, Ausweis;
- **unsicher** (nur grauer Hinweis beim Tippen): Possessiv + Rolle („mein Mitarbeiter“, „my employee“, „notre salarié“), Anrede + Initiale („Herr M.“), Personal-/Patienten-/Versichertennummer.

Allgemeine Fragen ohne Person („Was ist Diabetes?“, „Wie schreibe ich eine Kündigung?“, „Was macht eine Gewerkschaft?“) lösen **nie** etwas aus – auch keinen grauen Hinweis. Das prüft die Fehlalarm-Messung (`node scripts/fehlalarm.mjs`, Arten `fragen_*`, Ziel 0).

**Bewusste Grenzen:** Aussagen in der ersten Person („Ich habe Diabetes“) und Pronomen („er wurde gekündigt“) ohne erkennbare Person werden nicht gemeldet. Ein Stichwort, das Teil eines Namens ist („Herr Max Parkinson“), gilt als Name. Wer gezielt umgehen will (Umschreibungen, Bilder, absichtlich zerstückelte Wörter), schafft es; unsichtbare Zeichen, Sonder-Leerzeichen, Vollbreite und häufige kyrillische/griechische Doppelgänger werden vor der Prüfung ausgeglichen. Die Erweiterung ist eine Hilfe, keine Garantie.

## Schwärzen, Platzhalter, „Kein sensibler Wert“

- `mass_list` ist ein Hinweis über den ganzen Block: beim Schwärzen bzw. mit Platzhaltern werden die einzelnen Mailadressen, Nummern und IBANs ersetzt, nicht der Block. Einzelfunde behalten ihre eigene Aktion (z. B. `block`).
- `identity_combo` liegt auf dem Namen; Geburtsdatum, Adresse und Telefon sind eigene Funde. Nach dem Schwärzen bleibt nichts Erkennendes stehen.
- „Kein sensibler Wert“ gilt nur für Einzelwerte; die abgeleiteten Typen (`identity_combo`, `art9_*`, `hr_record`, `mass_list`) lassen sich so nicht ausblenden, und ausgeblendete Einzelwerte zählen für die Liste weiter.

## Richtlinie

| Schlüssel | Typ | Standard | Wirkung |
|---|---|---|---|
| `globalPacks` | Liste | alle | ohne `context` ist das Paket aus |
| `rules` | Objekt | – | je Typ `off`/`warn`/`redact`/`block`, z. B. `{"art9_health": "block", "mass_list": "redact"}`; verwaltete Regeln kann der Benutzer nicht ändern |
| `massListMin` | Zahl 3–1000 | 10 | ab so vielen verschiedenen Einträgen gilt ein Text als Kundenliste |
| `identityMinParts` | Zahl 2–4 | 3 | 2 = Name + Geburtsdatum, 3 = dazu ein weiterer Teil, 4 = zwei weitere |
| `competenceHideSensitive` | ja/nein | nein | KI-Kompetenz-Nachweis zeigt Gesundheit, Personendaten und nationale ID nie |

`massListMin`, `identityMinParts` und `competenceHideSensitive` gibt es nur per Richtlinie (Benutzerwerte werden verworfen); Werte ausserhalb der Grenzen oder mit falschem Typ lassen den Standard stehen.

Beispiel (Ausschnitt):

```json
{
  "globalPacks": ["finance", "secrets", "contact", "travel", "marker", "context"],
  "rules": { "art9_health": "block", "mass_list": "redact" },
  "massListMin": 20,
  "identityMinParts": 3,
  "competenceHideSensitive": true
}
```

## KI-Kompetenz-Nachweis

Neue Gruppe „Personendaten“ (`person`). Die Monatszahlen bleiben lokal. Gesundheit, Personendaten und nationale ID gelten als sensibel: im Nachweis abwählbar, per `competenceHideSensitive` zwingend ausgeblendet, und in der vorbereiteten Meldungsform (`report()`, ohne Aufrufer) nur zusammengefasst als `sensitive`, nie je Gruppe – Zahlen je Person zu Gesundheit oder Gesinnung würden sonst Mitarbeiterüberwachung ermöglichen.

## Laufzeit

Die Kontextprüfung läuft nach allen anderen Datentypen im gemeinsamen Zeitbudget von 150 ms. Messung (14.10.2026, Entwicklungs-PC): typischer grosser Text mit Liste (~50 000 Zeichen) unter 45 ms (Test), 200 000 Zeichen dicht mit Namen und Stichwörtern ca. 25 ms für die Kontextprüfung. Bei Zeitüberschreitung oder Fehler entfällt nur die Kontextprüfung – alle anderen Funde bleiben genau wie ohne Paket. Mehr als 5000 Einzelfunde in einem Text gelten direkt als Liste.

