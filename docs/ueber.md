# Was die Erweiterung tut – und was nicht

## Tut
- Prüft auf **chatgpt.com, claude.ai, gemini.google.com, Microsoft Copilot (copilot.com; copilot.microsoft.com leitet dorthin um und ist in Edge für Erweiterungen gesperrt) und Microsoft 365 Copilot (copilot.cloud.microsoft, m365.cloud.microsoft; dort nur im Chat-Feld)** jede Eingabe, bevor sie gesendet oder eingefügt wird (Enter, Senden-Knopf, Formular, Einfügen, Ziehen).
- Erkennt über 200 Datentypen: Sozialversicherungs-, Steuer-, Ausweis- und Firmennummern vieler Länder, EU-USt-Nummern, IBAN, Kreditkarten, Passzeilen (MRZ), Zugangsdaten/Schlüssel (auch in eingefügtem Code), Kontaktdaten, Geburtsdaten, Gesundheits- und Personaldaten im Zusammenhang – mit Prüfziffern, wo es sie gibt ([Liste](datentypen.md)). Optional zusätzlich Namen, Firmen und Adressen per [lokaler KI](ki-erkennung.md) und Text in eingefügten Bildern per [lokaler Texterkennung](bilder.md).
- Zeigt bei einem Fund einen Dialog: **Schwärzen**, **Abbrechen** oder – falls erlaubt und nach ausdrücklicher Bestätigung – **Trotzdem senden**. Je Datentyp wählbar: aus, warnen, nur schwärzen, blockieren.
- Statt zu schwärzen auf Wunsch **Platzhalter** wie `[IBAN_1]`: die KI arbeitet damit weiter, die Antwort lässt sich in einer Ansicht der Erweiterung mit den echten Werten anzeigen und kopieren – nie auf der KI-Seite selbst ([Platzhalter](platzhalter.md)).
- **Eigene Begriffe** (Kundennamen, Projekt-Codenamen, interne Domains, Mitarbeiterkürzel): von der Organisation per Richtlinie `customTerms` und von Nutzern in den Einstellungen – immer nur als gesalzene Prüfsummen, nie im Klartext ([Eigene Begriffe](eigene-begriffe.md)). Das ältere Firmen-Wörterbuch (`dictionary`) wirkt weiter.
- Zentral verwaltbar per Gruppenrichtlinie, Intune oder Registry; Whitelabel (Name, Logo, Farben, Support).

## Tut nicht
- **Kein Netzwerk:** Die Erweiterung hat keinen Netzwerkzugriff (CSP `connect-src 'none'`, kein Netzwerkcode – per Test erzwungen). Keine Telemetrie, kein Server, keine Lizenzprüfung.
- **Speichert keine Eingaben:** Lokal gespeichert werden nur Tageszahlen je Seite, Kategorie und Entscheidung (90 Tage). Keine Texte, Ausschnitte, Hashes von Treffern oder Dateinamen. Auch Admins können keine Inhalte abrufen – diese Funktion gibt es nicht.
- **Ist kein DLP-System:** Hilfsmittel gegen Versehen, keine Garantie. Nicht geschützt sind u. a. Desktop- und Handy-Apps der KI-Anbieter, andere KI-Seiten, andere Browser, Dateien ausser Textdokumenten und Bildern, gezielt umschriebene oder verschleierte Daten. Bilder werden nach bestem Bemühen geprüft (unscharfe, gedrehte oder handschriftliche Inhalte können durchrutschen). Getippter Text kann von der KI-Seite schon vor dem Senden gelesen werden (Entwürfe).
- Meldungen an einen Server (z. B. CIPP über `reportingUrl`) gibt es nicht; der Schlüssel ist nur reserviert.
