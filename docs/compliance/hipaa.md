# Zuordnung USA: HIPAA (nur Zuordnung)

Vorlage `hipaa` des [Nachweis-Berichts](README.md). Stand 16.10.2026. Selbstauskunft, keine Rechtsberatung. Diese Seite ordnet Massnahmen den genannten Abschnitten zu; sie trifft **keine Aussage zur Eignung** der Erweiterung für HIPAA-pflichtige Umgebungen.

| Anforderung | Massnahme der Erweiterung | Beleg im Bericht |
|---|---|---|
| 45 CFR 164.308(a)(1)(ii)(D) – Information system activity review | Zahlen zu erkannten, geschwärzten und gestoppten Eingaben je KI-Seite | Treffer nach Aktion, nach KI-Seite |
| 45 CFR 164.308(a)(5) – Security awareness and training | Jede Warnung erklärt in einem Satz, warum der Wert heikel ist | Treffer nach Aktion |
| 45 CFR 164.312(e)(1) – Transmission security | Gesundheitsangaben werden vor der Übertragung an KI-Dienste erkannt | Treffer nach Datentyp |
| 45 CFR 164.502(b), 164.530(c) – Minimum necessary, safeguards | Schwärzen, Platzhalter und Sperren nach Richtlinie | Treffer nach Aktion, Aktive Regeln |

Hinweise:

- Die Erkennung von US-Gesundheitsdaten beruht auf den Datentypen der Erweiterung (u. a. Gesundheit, SSN, Paket `US`) und dem lokalen KI-Modell; sie ist nicht vollständig.
- Business Associate Agreements mit KI-Anbietern, Risikoanalyse (164.308(a)(1)(ii)(A)) und Dokumentation bleiben Aufgaben der Organisation.

Quelle: 45 CFR Part 164, https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164 (abgerufen 16.10.2026).
