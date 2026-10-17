# Zuordnung Schweiz: revDSG und DSV

Vorlage `revdsg` des [Nachweis-Berichts](README.md). Stand 16.10.2026. Selbstauskunft, keine Rechtsberatung.

| Anforderung | Massnahme der Erweiterung | Beleg im Bericht |
|---|---|---|
| Art. 7 revDSG – Datenschutz durch Technik und datenschutzfreundliche Voreinstellungen | Prüfung vor dem Senden ist ab Installation aktiv; Prüfung lokal im Browser, ohne Netzwerkzugriff | Aktive Regeln |
| Art. 8 revDSG, Art. 1–3 DSV – Datensicherheit | Personendaten werden vor der Weitergabe an KI-Dienste erkannt und je nach Regel geschwärzt, durch Platzhalter ersetzt oder gestoppt | Treffer nach Aktion, nach Datentyp |
| Art. 9 revDSG – Bearbeitung durch Auftragsbearbeiter | Weniger Personendaten gelangen an KI-Anbieter, die als Auftragsbearbeiter oder Dritte handeln | Treffer nach KI-Seite, nach Aktion |
| Art. 16–17 revDSG – Bekanntgabe ins Ausland | Daten bleiben auf dem Gerät, bis die Person entscheidet; nicht freigegebene KI-Seiten lassen sich per Richtlinie sperren (`aiSiteMode`, `allowedSites`) | Treffer nach KI-Seite, Aktive Regeln |
| Art. 5 Bst. c revDSG – besonders schützenswerte Personendaten | Eigene Erkennung für Gesundheit, Sozialversicherung, nationale ID und Kontext-Risiken | Treffer nach Datentyp |

Hinweise:

- Der Bericht belegt eine technische Massnahme. Bearbeitungsverzeichnis (Art. 12), Information (Art. 19) und gegebenenfalls Datenschutz-Folgenabschätzung (Art. 22) bleiben Aufgaben der Organisation.
- Sammelt die Organisation Berichte von Mitarbeitenden: siehe Pflichten im [README](README.md) (Art. 26 ArGV 3, Art. 48 ArG).

Quellen: Bundesgesetz über den Datenschutz (DSG), SR 235.1, https://www.fedlex.admin.ch/eli/cc/2022/491/de; Datenschutzverordnung (DSV), SR 235.11, https://www.fedlex.admin.ch/eli/cc/2022/568/de (abgerufen 16.10.2026).
