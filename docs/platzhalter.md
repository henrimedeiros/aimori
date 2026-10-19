# Platzhalter statt Schwärzen

Statt einen erkannten Wert nur zu schwärzen, kann die Leiste ihn durch einen **Platzhalter** ersetzen, z. B. `[IBAN_1]`, `[EMAIL_2]`. Die KI arbeitet mit den Platzhaltern weiter; ihre Antwort lässt sich anschliessend **mit den echten Werten** anzeigen und kopieren – nur in einer Ansicht der Erweiterung, nie auf der KI-Seite selbst.

## So funktioniert es

1. Beim Senden, Einfügen oder im Hinweis beim Tippen erscheint neben **Schwärzen** der Knopf **Platzhalter** (unter „Weitere Optionen“). Schneller geht das Tastenkürzel **Alt+Shift+L**: es ersetzt alle erkannten Werte im Eingabefeld, auch ohne offene Meldung (im Browser änderbar).
2. Jeder erkannte Wert wird zu `[TYP_n]`: `TYP` ist die Datentyp-ID in Grossbuchstaben ([Liste](datentypen.md)), `n` zählt je Typ in Leserichtung hoch. Derselbe Wert bekommt im ganzen Tab immer denselben Platzhalter; anders geschriebene Werte (z. B. mit Leerzeichen gruppiert) zählen als eigener Wert.
3. Enthält eine Antwort der KI bekannte Platzhalter, erscheint über dem Eingabefeld die Leiste **„Antwort enthält Platzhalter für …“** mit dem Knopf **Mit echten Werten anzeigen**. Die Leiste nennt nur Arten und Anzahl, nie Werte. **Ausblenden** gilt für diese Antwort.
4. Die Ansicht zeigt die Antwort mit echten Werten als reinen Text, dazu **Kopieren** und **Schliessen** und den Hinweis, echte Werte nicht zurück in den Chat einzufügen.

## Wo die Zuordnung liegt

- Nur im Arbeitsspeicher des Content Scripts dieses Tabs (isolierte Welt der Erweiterung, für Skripte der KI-Seite nicht lesbar). Nie in `chrome.storage` (auch nicht `storage.session`), nie auf der Platte, kein Export.
- Verworfen beim Verlassen oder Neuladen der Seite, beim Schliessen des Tabs und sobald die Richtlinie `allowPlaceholders` auf `false` steht.
- Höchstens **500 Zuordnungen** je Tab. Danach werden neue Werte wie bisher geschwärzt (`[Finanzdaten]` …); bekannte Werte behalten ihren Platzhalter.
- Der Rücktausch ersetzt in einem Durchgang nur bekannte Platzhalter (festes Muster `[TYP_n]`); unbekannte bleiben stehen, ein Wert, der selbst wie ein Platzhalter aussieht, wird nicht nochmals ersetzt.

## Warum die echten Werte nie ins Seiten-DOM kommen

Skripte der KI-Seite können alles lesen und senden, was in ihrem DOM steht. Deshalb:

- Die Ansicht ist eine eigene Seite der Erweiterung (`ui/view.html`) in einem iframe in einer geschlossenen Shadow Root; die KI-Seite kann ihren Inhalt nicht lesen.
- Den Text holt die Ansicht beim Service Worker nur mit einer **einmal gültigen Kennung** aus ihrer eigenen Adresse (60 Sekunden, gebunden an Tab, Frame und Dokument). Der Service Worker fragt das Content Script, reicht den Text nur im Speicher weiter und speichert ihn nirgends. Eine von der KI-Seite selbst eingebettete Ansicht bekommt nichts.
- Kopieren nur auf einen echten Klick in der Ansicht (Zwischenablage-Recht nur für dieses iframe; Rückfall über ein kurzlebiges Textfeld, das sofort geleert wird).

## Richtlinie

| Schlüssel | Typ | Standard | Wirkung |
|---|---|---|---|
| `allowPlaceholders` | Wahr/Falsch | `true` | `false`: kein Knopf „Platzhalter“, keine Antwort-Leiste, keine Ansicht; der Service Worker weist beides ab und die Zuordnung wird sofort verworfen |

Siehe auch [Einstellungen](einstellungen.md) und die Gruppenrichtlinie „Platzhalter erlauben“.

## Restrisiken

- **Die KI-Seite kennt Art und Anzahl** der ersetzten Werte (sie sieht `[IBAN_1]`, `[IBAN_2]`), nie die Werte selbst.
- **Getippte Werte hat die Seite schon gesehen:** Beim Tippen steht der Wert im Eingabefeld, bevor er ersetzt wird; Seiten können Tastenanschläge mitlesen. Sicherer ist **Einfügen**: dort wird ersetzt, bevor der Text ins Feld kommt. Der Hinweis beim Tippen warnt früh.
- **Zurückkopieren:** Wer echte Werte aus der Ansicht wieder in den Chat einfügt, sendet sie – die Prüfung schlägt dann erneut an.
- Eine Seite kann Platzhalter-Text fälschen oder durchzählen; die echten Werte sieht trotzdem nur der Nutzer in der Ansicht der Erweiterung.
- Verbietet die Seite per Permissions-Policy die Zwischenablage, greift der Rückfall; sonst von Hand markieren und kopieren.

Sicherheits-Auflagen: [Design-Review Platzhalter](sicherheit/design-review-platzhalter.md).
