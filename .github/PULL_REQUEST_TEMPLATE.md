## Neues oder geändertes Erkennungsmuster

**Was erkennt das Muster?** (Datentyp, Land/Anbieter, warum es sensibel ist)

**Spezifikation / Quelle:** (öffentliche Formatbeschreibung oder „eigene Arbeit“ – keine Links zu Personen- oder Kundendaten)

### Pflicht – bitte abhaken
- [ ] Alle Testwerte sind **synthetisch** (erfunden, offizielle Beispiel-/Testnummern oder generiert) – keine echten Personen-, Kunden-, Firmen- oder Arbeitgeberdaten, keine echten Schlüssel oder Tokens.
- [ ] Domains in Tests nur `example.com/.org/.net`, `.test`, `.invalid` (oder der Dienst-Host aus dem Muster selbst), IP-Adressen nur `192.0.2.x`, `198.51.100.x`, `203.0.113.x`.
- [ ] Mein Beitrag steht unter **Apache-2.0** (Feld `lizenz`) oder MIT/BSD; ich habe das Recht, ihn so beizusteuern.
- [ ] Nur `muster/katalog.json` geändert (Schlüssel, Signatur, Skripte und `.github/` ändern nur Maintainer).
- [ ] `node scripts/muster.mjs pruefen` lokal grün (Schema, Tests, Fehlalarme, Lasttest).
- [ ] Mindestens 3 Positiv- und 3 Negativ-Beispiele, darunter knapp daneben liegende Werte.
- [ ] `version` im Katalog erhöht.

Hinweis: Neue Muster erreichen Nutzerinnen und Nutzer erst mit dem nächsten Erweiterungs-Update. Die Erweiterung lädt nichts nach.
