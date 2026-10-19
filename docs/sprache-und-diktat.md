# Sprache und Diktat

Viele KI-Seiten nehmen Sprache an. Für den Schutz gibt es zwei grundverschiedene Wege:

| Weg | Was passiert | Prüfbar? |
|---|---|---|
| **Diktat** (Mikrofon im Eingabefeld) | Die Seite wandelt Sprache in Text um und schreibt ihn ins Eingabefeld. Gesendet wird erst mit Enter oder dem Senden-Knopf. | **Ja**, wie getippter Text. |
| **Sprachmodus** (Gespräch mit der KI) | Gesprochenes geht als Ton direkt an die KI, oft ohne Text im Eingabefeld; die Antwort kommt gesprochen zurück. | **Nein.** Die Erweiterung sieht keinen Text und nimmt bewusst keinen Ton auf. |

## Diktat: geprüft wie getippter Text
- **Beim Senden** liest die Erweiterung das Eingabefeld und prüft den Text wie immer – egal, ob er getippt, eingefügt oder diktiert wurde. Das gilt auch, wenn eine Seite nach dem Diktat selbst auf „Senden“ klickt: dieser Klick läuft durch dieselbe Prüfung.
- **Live-Hinweis:** Diktat schreibt den Text oft ohne Tastatur-Ereignis ins Feld. Darum vergleicht die Erweiterung alle 3 Sekunden Länge und Prüfsumme des Feldtextes (nur im Arbeitsspeicher, nie gespeichert) und startet bei einer Änderung die lokale Live-Prüfung. Ein Hinweis erscheint höchstens 3 Sekunden nach dem Diktat; bei verborgener Seite oder ohne erkanntes Eingabefeld wird nicht geprüft.
- Kein Mikrofonzugriff, keine Aufnahme, keine neuen Berechtigungen: die Erweiterung liest nur den Text, den die Seite selbst ins Feld geschrieben hat.
- **Seite sendet nach dem Diktat selbst:** Klickt die Seite ihren Senden-Knopf per Skript (`click()`, auch `pointerdown` + `click`), schickt sie das Formular per `requestSubmit()` ab oder löst sie ein Enter aus, prüft die Erweiterung den Feldtext in genau diesem Moment frisch – nicht den Stand aus dem 3-s-Takt – und hält das Senden bei einem Fund an. Das gilt auch, wenn die Seite ihren eigenen Sende-Handler als Capture-Listener auf `window` registriert. Geprüft im E2E-Schritt `diktatsenden` (`E2E_NUR=diktatsenden node scripts/e2e/e2e.mjs`) auf den Attrappen von ChatGPT, Claude, Gemini und Copilot mit einer Beispiel-IBAN, mit Gegenprobe (sauberes Diktat geht genau einmal durch) und Nachweis, dass der Wert weder in der Meldung, in `chrome.storage`, in der Konsole noch in DOM-Attributen landet und keine Anfrage das Gerät verlässt.

## Sprachmodus: Richtlinie `voiceMode`
Weil der Sprachmodus nicht prüfbar ist, kann die Organisation ihn melden oder sperren:

| Wert | Wirkung |
|---|---|
| `allow` | keine Meldung |
| `warn` (Standard) | Beim Druck auf den Sprachmodus-Knopf erscheint eine Meldung „Sprachmodus wird nicht geprüft …“. Mit „Sprachmodus trotzdem starten“ (zwei echte Klicks, nur wenn `allowUserOverride` gilt) ist der Knopf bis zum Neuladen der Seite frei. Ohne `allowUserOverride` wirkt `warn` wie `block`. |
| `block` | Der Knopf wird gestoppt (Zeiger, Maus, Touch und Klick, auch per Tastatur), Meldung „Sprachmodus gesperrt …“ mit dem Hinweis, stattdessen ins Eingabefeld zu diktieren. |

Nur per Richtlinie (GPO/Intune/Registry), nie lokal lockerbar; ein ungültiger Wert gilt als `block`. Die Statistik zählt nur die Tageszahl der Meldungen (Kategorie „Sprachmodus“).

## Abdeckung je Seite (Stand 16.10.2026)
Erkannt wird der Sprachmodus-Knopf über feste Merkmale je Seite (`extension/content/adapters.js`): zuerst `data-testid` und Markennamen, dann Beschriftungen in Englisch, Deutsch, Französisch und Italienisch. Die Merkmale stammen aus der öffentlichen Oberfläche und sind **nicht an angemeldeten Konten gemessen** – vor dem Einsatz mit `block` bitte im Handtest prüfen.

| Seite | Diktat ins Feld | Sprachmodus | Erkennung des Sprachmodus |
|---|---|---|---|
| ChatGPT | geprüft | ChatGPT Voice | `data-testid="composer-speech-button"`, Beschriftung „Start voice mode“/„Sprachmodus starten“ u. a. |
| Gemini | geprüft | Gemini Live | Beschriftung enthält „Gemini Live“ (sprachunabhängig) |
| Microsoft Copilot | geprüft | Sprachgespräch | Beschriftung „Talk to Copilot“/„Mit Copilot sprechen“ u. a. |
| Claude | geprüft | Sprachmodus | Beschriftung „Voice mode“/„Sprachmodus“ u. a. |
| Microsoft 365 Copilot | geprüft | im Browser kein eigener Sprachmodus bekannt | – |

## Grenzen (ehrlich)
- **Selektoren ändern sich:** Baut eine Seite den Knopf um, greift `voiceMode` nicht mehr, bis die Erweiterung nachgeführt ist. Es gibt keinen Rückfall, der jeden Mikrofon-Knopf sperrt – sonst wäre auch das prüfbare Diktat gesperrt.
- **Tastenkürzel und automatischer Start:** Startet eine Seite den Sprachmodus per Tastenkürzel oder von selbst, sieht die Erweiterung keinen Knopfdruck.
- **Apps:** Desktop- und Handy-Apps der KI-Anbieter laufen ohne Browser-Erweiterung. Wer den Sprachmodus wirklich ausschliessen muss, sperrt zusätzlich die Apps (z. B. per Intune-App-Schutz) oder die Ton-Endpunkte im Proxy.
- **Diktat mit sofortigem Senden ohne Ereignis:** Sendet eine Seite den diktierten Text direkt aus ihrem Code (`fetch`, WebSocket) ohne Klick-, Enter- oder `submit`-Ereignis, ist das wie bei getipptem Text nicht abfangbar (siehe [KI-Agenten](ki-agenten.md)). Dasselbe gilt für `form.submit()`, das kein `submit`-Ereignis auslöst. Dann bleibt nur der Live-Hinweis aus dem 3-s-Takt – sofern die Seite den Text vorher sichtbar ins Feld schreibt.
- **Felder in geschlossenen Shadow-DOMs oder fremden iframes:** Liegt das Eingabefeld in einer geschlossenen Shadow Root oder in einem iframe einer anderen Herkunft, sieht die Erweiterung den Text nicht und prüft ihn weder live noch beim Senden.
- Zwischen Diktat und Live-Hinweis liegen bis zu 3 Sekunden; beim Senden wird immer geprüft.

## Website-Satz (Vorschlag, nicht veröffentlicht)

„Diktieren Sie ruhig: AImori prüft auch diktierten Text, bevor er gesendet wird – selbst wenn die KI-Seite nach dem Diktat von selbst sendet. AImori nutzt dafür kein Mikrofon und nimmt nie Ton auf.“

Ergänzung klein darunter oder in der FAQ: „Sprachmodi, bei denen Ton direkt an die KI geht, kann AImori nicht prüfen – Unternehmen können sie per Richtlinie melden oder sperren.“ Kein Versprechen vollständigen Schutzes; veröffentlicht wird nur mit Freigabe der Maintainer.

Sicherheit: [Design-Review Diktat und Fingerabdrücke](sicherheit/design-review-diktat-fingerabdruck.md), [Design-Review Diktat-Senden](sicherheit/design-review-diktat-senden.md).
