# KI-Antworten prüfen und Zwischenablage-Schutz

Zwei Funktionen gegen Datenlecks, die nicht beim Tippen entstehen: heikle Daten **in KI-Antworten** (z. B. generierter Code mit Zugangsschlüsseln) und **kopierte Firmendaten** aus vertraulichen Systemen (Banking, HR, Lohn), die in eine KI eingefügt werden. Beides läuft vollständig lokal im Browser: kein Netz, keine Inhalte gespeichert oder protokolliert.

## KI-Antworten prüfen (`answerCheck`)

- Die **letzte Antwort** auf den unterstützten KI-Seiten (ChatGPT, Claude, Gemini, Copilot, Microsoft 365 Copilot) wird alle 3 Sekunden lokal mit den Regeln und dem Katalog geprüft – nur wenn sie sich geändert hat, höchstens 20 000 Zeichen, mit eigenem Zeitbudget von 50 ms je Durchlauf (sonst nächster Versuch).
- Gezählt werden nur **sichere Funde** (gleiche Stufen wie bei der Eingabe, siehe [Fehlalarme](fehlalarme.md)); die lokale KI-Erkennung wird für Antworten nicht verwendet.
- **Markierung:** Fundstellen werden dezent gepunktet unterstrichen (CSS Custom Highlight API). Am Text der Seite ändert sich nichts; der Name der Markierung ist zufällig je Seitenaufruf.
- **Hinweis-Leiste** über dem Eingabefeld: „KI-Antwort enthält 1× AWS-Zugangsschlüssel – vor dem Kopieren prüfen“. Sie nennt nur Typ und Anzahl, nie Werte, und lässt sich ausblenden (gilt bis zur nächsten Änderung der Antwort).
- **Kopieren:** Wird Text auf der KI-Seite kopiert, der heikle Daten enthält, erscheint die Leiste erneut: „Kopierter Text enthält …“. Kopieren wird **nie gesperrt**, die Zwischenablage nie verändert.
- Hinweise werden nicht gezählt und nicht gespeichert.

Richtlinie: `answerCheck` = `hint` (Standard) oder `off`. Ein ungültiger Wert gilt als `hint`; ein per Richtlinie gesetzter Wert sperrt den Schalter in den Einstellungen.

## Zwischenablage-Schutz (`sensitiveSources`, `sensitiveSourceAction`)

1. Die Organisation (oder der Benutzer, wenn nichts verwaltet ist) legt **vertrauliche Quellen** fest, z. B. `bank.example.com` oder `*.hr.example.com`. Standard: leer. Die Einstellungen bieten eine kleine Vorschlagsliste bekannter HR-/Lohn-Anbieter; ein Klick fügt den Eintrag nur hinzu.
2. Der Browser verlangt **einmal die Erlaubnis** für genau diese Seiten (Knopf „Zugriff auf diese Seiten erlauben“ in den Einstellungen). Angefordert werden nur die Seiten der Liste, nie „alle Seiten“.
3. Wird auf einer Quelle Text kopiert oder ausgeschnitten, bildet die Erweiterung eine **Prüfsumme** des normalisierten Texts (SHA-256, dann mit einem zufälligen Sitzungs-Salz). Gespeichert wird nur diese gesalzene Prüfsumme, **30 Minuten**, im Arbeitsspeicher des Browsers (`storage.session`, nicht auf der Festplatte), höchstens 20 Merkmale. Kein Text, kein Host, keine Uhrzeit.
4. Wird **derselbe Text** in eine KI-Seite eingefügt oder abgelegt, stoppt die Erweiterung das Einfügen und zeigt eine deutliche Warnung „Text aus vertraulicher Quelle“:
   - `warn` (Standard): Verwerfen oder – nur mit `allowUserOverride` und zweitem Klick – trotzdem einfügen.
   - `block`: Einfügen in KI-Seiten gesperrt, nur „OK“.
   Enthält der Text zusätzlich erkannte Datentypen, gelten deren Regeln wie gewohnt (z. B. Schwärzen).
5. Gezählt wird nur die Kategorie „Vertrauliche Quelle“ in der lokalen Statistik – nie Host, Prüfsumme oder Zeitpunkt.

Regeln für Quellen: nur `https`, nur Hostname ohne Pfad und Port, höchstens ein führendes `*.`, danach mindestens zwei Teile; keine IP-Adressen, kein `localhost`, keine öffentlichen Endungen wie `*.co.uk`; KI-Seiten (und Wildcards, die eine KI-Seite treffen würden, z. B. `*.google.com`) und `*.cloud.microsoft` sind ausgeschlossen. Ist die Liste per Richtlinie gesetzt, können Benutzer nichts ergänzen oder entfernen. Wird eine Quelle entfernt oder die Erlaubnis entzogen, meldet die Erweiterung das Skript ab, gibt nicht mehr benötigte Rechte zurück und verwirft alle Merkmale.

### Grenzen (ehrlich)

- Erkannt wird nur **exakt derselbe Text** (nach Vereinheitlichung von Leerraum und Unicode-Schreibweisen). Ein Ausschnitt, ein umformulierter oder ergänzter Text wird nicht erkannt.
- Erst ab **8 Zeichen** ohne Leerzeichen – kurze Werte wie „OK“ werden nie markiert (vermeidet Fehlalarme und erschwert das Durchprobieren kurzer Werte).
- Nicht erkannt wird Kopieren per Skript-Schnittstelle der Seite (`navigator.clipboard.writeText`, z. B. „Kopieren“-Knöpfe ohne Kopier-Ereignis), aus eingebetteten Frames, aus anderen Programmen (Excel, Mail-Programm) und nach Ablauf der 30 Minuten.
- Ein Einfügen innerhalb weniger Millisekunden nach dem Kopieren kann durchrutschen, bevor das Merkmal bei der KI-Seite angekommen ist (die KI-Seite holt die Merkmale zusätzlich beim Fokuswechsel).
- **Verwaltete Installationen** (Intune, GPO) erhalten optionale Rechte nicht vorab: Jeder Benutzer muss den Zugriff einmal per Klick erlauben. Bis dahin zeigen die Einstellungen „Zugriff erteilt für 0 von n Quellen“.
- Es ist eine Sensibilisierung, kein vollständiges DLP-System.

## Richtlinie (Beispiel)

```json
{
  "answerCheck": "hint",
  "sensitiveSources": ["bank.example.com", "*.hr.example.com"],
  "sensitiveSourceAction": "warn"
}
```

Gleiche Werte per ADMX (Gruppenrichtlinie, Ordner der Erweiterung: „KI-Antworten pruefen“, „Vertrauliche Quellen (Zwischenablage)“, „Einfuegen aus vertraulichen Quellen“) oder Intune, siehe [Gruppenrichtlinie](deployment/gpo.md) und [Intune](deployment/intune.md). Alle Schlüssel: [Einstellungen](einstellungen.md).

## Rechte

Das Manifest führt `https://*/*` **nur als optionales Recht**; es wird bei der Installation nicht erteilt und nie als Ganzes angefordert, sondern nur für die Origins der Quellenliste. Das Skript auf den Quellen (`content/quelle.js`) läuft isoliert im Hauptframe, liest nur die Auswahl beim Kopieren, schreibt nichts ins Dokument, empfängt keine Nachrichten und hat keinen Netzzugriff. Auflagen und Umsetzung: [Design-Review](sicherheit/design-review-antwort-zwischenablage.md).

Stand: 16.10.2026
