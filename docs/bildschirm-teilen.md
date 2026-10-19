# Warnung beim Bildschirmteilen

Stand: 17.10.2026 · Richtlinie `screenShareGuard` · Design-Review: [Bildschirmteilen](sicherheit/design-review-bildschirmteilen.md)

Wer in einer Besprechung den Bildschirm teilt, zeigt oft mehr als gewollt – zum Beispiel einen KI-Chat, in dem gerade eine IBAN oder ein Schlüssel steht. AImori warnt in diesem Fall auf der KI-Seite und bietet an, die erkannten Treffer **auf dem Bildschirm** zu verdecken.

## Was passiert

1. Sie teilen im Browser Ihren Bildschirm, ein Fenster oder einen Tab in **Google Meet, Microsoft Teams oder Zoom** (jeweils die Webfassung).
2. Ist ein KI-Tab (ChatGPT, Claude, Gemini, Copilot, Microsoft 365 Copilot) sichtbar und enthält das Eingabefeld oder die letzte Antwort erkannte sensible Daten, erscheint oben rechts ein Hinweis: „Bildschirm geteilt: sensible Daten sichtbar – IBAN (1)“. Genannt werden nur die Arten und die Anzahl, nie Werte.
3. „Treffer verdecken“ legt eine dunkle Fläche über die Treffer. Das ändert **nur die Darstellung**: Der Text im Feld bleibt unverändert und wird so gesendet, wie er ist; das Senden prüft AImori wie immer separat.
4. Endet das Teilen (Knopf in der Besprechung, Tab geschlossen, Seite verlassen), verschwinden Hinweis und Abdeckung von selbst.

| Wert | Wirkung |
|---|---|
| `off` | Kein Hinweis, die Meeting-Seiten werden nicht beobachtet, das Recht wird zurückgegeben. |
| `warn` (Standard) | Hinweis mit Knopf „Treffer verdecken“. |
| `mask` | Treffer werden während des Teilens sofort verdeckt, der Hinweis zeigt „Treffer zeigen“. |

Ein ungültiger Wert in der Richtlinie gilt als `mask`.

## Einschalten

In den Einstellungen unter **Warnung beim Bildschirmteilen** auf „Auf Meet, Teams und Zoom erlauben“ klicken. Der Browser fragt nach dem Zugriff auf genau diese Seiten: `meet.google.com`, `teams.microsoft.com`, `teams.live.com`, `teams.cloud.microsoft`, `zoom.us` und `*.zoom.us`. Wer schon den Zugriff auf alle https-Seiten erteilt hat (Hinweis beim Kopieren), braucht nichts weiter.

Admins können `screenShareGuard` per Richtlinie setzen (GPO/Intune, ADMX „Warnung beim Bildschirmteilen“), den Zugriff auf die Meeting-Seiten aber **nicht vorab erteilen** – das muss jede Person einmal selbst bestätigen. Ohne diesen Zugriff bleibt die Funktion still.

## Was AImori dafür liest

- Auf den Meeting-Seiten läuft ein kleines Skript, das die Browser-Funktion zum Bildschirmteilen umhüllt. Es erfährt nur, **ob** geteilt wird und welche Art Fläche (Bildschirm, Fenster, Tab). Bild und Ton werden nie gelesen, nichts wird aufgezeichnet, gespeichert oder gesendet.
- Der Service Worker merkt sich nur die Tab-Nummern der teilenden Meeting-Tabs und der KI-Tabs (Sitzungsspeicher, weg beim Schliessen des Browsers), nie Adressen oder Titel.
- Die KI-Seite erfährt nur „es wird geteilt: ja/nein“ und den Modus. Die Prüfung der Treffer läuft wie immer lokal in der KI-Seite.

## Was nicht zuverlässig geht

Diese Funktion ist eine **Hilfe, kein Schutz**. Nicht abgedeckt:

- **Desktop-Apps** (Teams, Zoom, Meet als Programm), andere Browser, Bildschirmaufnahme-Programme und Teilen über das Betriebssystem. Eine Erweiterung sieht davon nichts.
- **Andere Meeting-Seiten** (z. B. Webex, Jitsi) und Teilen, das eine Seite aus einem iframe oder einem neu erzeugten Fenster ohne Hülle startet.
- **Welcher Tab** geteilt wird: Der Browser verrät das nicht. AImori warnt, sobald irgendetwas geteilt wird und der KI-Tab sichtbar ist – auch wenn nur ein anderer Tab geteilt wird. Teilen des KI-Tabs selbst und „diesen Tab teilen“ (`preferCurrentTab`) sind nicht unterscheidbar.
- **Die Meeting-Seite** kann die Hülle erkennen (und damit, dass AImori installiert ist) und die Meldung unterdrücken oder fälschen. Folge ist nur ein Hinweis zu viel oder zu wenig auf diesem Gerät.
- **Eingabefelder ohne Formatierung** (`textarea`): nur Hinweis, Verdecken ist dort technisch nicht möglich.
- **Beim Tippen** kann ein neuer Treffer bis zu 1,5 Sekunden sichtbar sein, bevor er verdeckt wird.
- **Markierter Text**: Wer den verdeckten Wert markiert, macht ihn im Bild wieder sichtbar (die Markierungsfarbe des Browsers liegt darüber; im E2E-Test gemessen). Eine eigene Textfüllfarbe der Seite hebt das Verdecken dagegen nicht auf (geprüft).
- **Farbige Emoji** werden nicht verdeckt (sie haben keine Textfarbe); für Werte wie IBAN, Schlüssel oder Namen spielt das keine Rolle.
- Ältere Treffer weiter oben im Verlauf: geprüft werden das Eingabefeld und die letzte Antwort.

## Prüfung

- Unit-Tests: `tests/background.test.mjs` (Absenderprüfung, Rechte-Abgleich, kein Rückkanal, Drossel, Neustart), `tests/quelltext.test.mjs` (Hülle ohne Medienzugriff, gleiches Promise, feste Signale), `tests/antwort-quelle-ui.test.mjs` (Anfrage nur der festen Origins per Klick), `tests/pack-store.test.mjs` (Store-Paket ohne feste Hostrechte).
- E2E: `E2E_NUR=teilen node scripts/e2e/e2e.mjs` – Attrappe von meet.google.com startet echtes `getDisplayMedia`, Edge wählt nur im Wegwerf-Profil den Test-Tab per Startparameter; Hinweis ohne Wert, Verdecken per Pixeltest, Ende ohne `ended`-Ereignis, Modus `mask`, Netzwerk-Sperrtest. Echte Meeting-Dienste werden nie angesprochen.

## Store-Begründung und Datenschutztext (Vorschlag)

> **Optionaler Zugriff auf meet.google.com, teams.microsoft.com, teams.live.com, teams.cloud.microsoft, zoom.us:** Nur nach Klick in den Einstellungen. Liest nur, ob in diesen Webseiten der Bildschirm geteilt wird, und die Art der Fläche (Bildschirm, Fenster, Tab) – kein Bild, kein Ton, keine Inhalte der Besprechung. Nichts wird gespeichert oder gesendet. Zweck: Warnung, wenn ein KI-Chat mit sensiblen Daten im geteilten Bild sichtbar ist.

## Website (Vorschlag, nicht übernommen)

Satzvorschläge für die Produkt-Website; übernehmen erst nach Freigabe:

- „Bildschirm geteilt? AImori merkt es in Meet, Teams und Zoom im Browser und verdeckt IBAN, Schlüssel und Namen im KI-Chat – bevor alle mitlesen.“
- „Nur Darstellung: Der Text bleibt, wie er ist. AImori sieht weder Bild noch Ton der Besprechung.“
- „Ehrlich: Desktop-Apps von Teams und Zoom erkennt keine Browser-Erweiterung. Dort hilft nur, den KI-Tab vor dem Teilen zu schliessen.“
