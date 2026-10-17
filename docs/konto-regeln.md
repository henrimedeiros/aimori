# Regeln je Konto (Firmen- und Privatkonto derselben KI)

Stand: 14.10.2026 · Richtlinie `accountRules` · Design-Review: [Regeln je Konto](sicherheit/design-review-konto-regeln.md)

Viele Firmen erlauben interne Daten im **Firmen-Arbeitsbereich** einer KI (z. B. ChatGPT Team/Enterprise, Claude Team, Microsoft 365 Copilot), aber nicht im **privaten Konto** derselben Seite. Mit `accountRules` legt die Firma je Seite und Kontoart eine eigene Stufe fest.

## Wie die Kontoart erkannt wird

Nur aus **sichtbaren Signalen der Seite**, bei jeder Prüfung neu, nichts wird gespeichert. Die Erweiterung liest **keine** Cookies, Tokens, Seitenspeicher, Netzwerkdaten, Mailadressen, kein Eingabefeld und keinen Chatverlauf.

| Kontoart | Bedingung |
|---|---|
| Firmenkonto (`business`) | Ein hinterlegter Workspace-Name steht als **ganzer Text** im sichtbaren **Arbeitsbereich-Wechsler**, oder ein hinterlegtes Kennzeichen ist vorhanden (siehe unten). Der Profil-Knopf mit dem frei wählbaren Anzeigenamen zählt dafür nie. |
| Privatkonto (`personal`) | Kontobereich sichtbar, aber kein Firmensignal. |
| Nicht erkannt (`unknown`) | Kein sichtbarer Kontobereich (Seite noch nicht geladen, Seitenleiste zu, Seitenumbau). Es gilt die **strengste** der drei Stufen. |

- Vergleich nach Unicode-Normalisierung (NFKC), ohne unsichtbare Steuerzeichen, Gross-/Kleinschreibung egal, nur ganzer Text – „Beispiel AG“ trifft nicht „Beispiel AG Holding“.
- Es zählen nur sichtbare Elemente; versteckte Auswahllisten und Menüs (dort stehen oft **alle** Arbeitsbereiche eines Benutzers) zählen nie.
- Kennzeichen (`markers`), je Seite fest:

| Seite (`accountRules`-Schlüssel) | Kennzeichen | Bedeutung |
|---|---|---|
| `chatgpt` | `plan` | Plan-Etikett Team/Enterprise/Business/Edu im Kontobereich |
| `claude` | `plan` | Plan-Etikett Team/Enterprise im Kontobereich |
| `copilot` (copilot.com) | `shield` | Schild „Enterprise data protection“ |
| `m365copilot` | `host`, `shield` | `host`: Seite ist copilot.cloud.microsoft oder m365.cloud.microsoft (nur exakter Hostname) |

Gemini wird bewusst nicht unterstützt: Das einzige Kontosignal dort ist die Mailadresse.

## Stufen

| Stufe | Wirkung | Erlaubt bei |
|---|---|---|
| `normal` | bisherige Regeln (`rules`) | allen |
| `allow` | Funde werden nicht gemeldet | nur `business`, und nur mit Workspace-Namen oder Kennzeichen `host` |
| `hint` | nur dezenter grauer Hinweis beim Tippen, Senden wird nie angehalten | allen |
| `block` | jeder Fund sperrt das Senden/Einfügen (kein „Trotzdem senden“) | allen |

- Datentypen, die per `rules` (oder Standard) auf `block` stehen, bleiben in **jeder** Stufe gesperrt.
- Wird ein Firmenkonto nur über `plan` oder `shield` erkannt, gilt höchstens `hint` („Team“ hat jede Firma, auch ein privat gekauftes Team-Abo).
- Die Leiste zeigt die Kontoart: „Firmenkonto erkannt“, „Privatkonto“ oder „Konto nicht erkannt“ – nie den Workspace-Namen.
- Ungültige Seiteneinträge (z. B. `allow` beim Privatkonto, unbekanntes Kennzeichen, Name über 80 Zeichen) werden ganz verworfen: für diese Seite gilt dann `normal`. Fehlermeldungen nennen nur Seite, Feld und Index.
- Ist **irgendeine** Richtlinie gesetzt, werden lokale Konto-Regeln nicht gelesen.

## Richtlinienbeispiel

```json
{
  "accountRules": {
    "chatgpt": {
      "workspaces": ["Beispiel AG"],
      "business": "hint",
      "personal": "block"
    },
    "claude": {
      "workspaces": ["Beispiel AG"],
      "markers": ["plan"],
      "business": "hint",
      "personal": "block",
      "unknown": "block"
    },
    "m365copilot": {
      "markers": ["host"],
      "business": "allow"
    }
  }
}
```

**Empfehlung und Restrisiko:** Für `business` `hint` statt `allow` verwenden – ausser beim Kennzeichen `host` (Microsoft 365 Copilot), das nicht aus dem Seiteninhalt kommt. Die Erkennung beruht nur auf sichtbaren, teils vom Benutzer beeinflussbaren Seitensignalen, und die Selektoren sind auf den echten Seiten noch nicht live geprüft (siehe Grenzen).

Bedeutung: In ChatGPT im Arbeitsbereich „Beispiel AG“ nur Hinweis, im privaten Konto gesperrt, ohne erkennbares Konto ebenfalls gesperrt (strengste Stufe). Microsoft 365 Copilot ist immer Firmenkonto; dort werden nur harte Sperren gemeldet. Per GPO: ADMX-Richtlinie „Regeln je Konto“ (ein Unterschlüssel je Seite).

## Grenzen (bitte beachten)

- **Fälschbar:** Die Erkennung beruht auf dem Seiteninhalt. Die Seite selbst oder ein Benutzer mit Entwicklerwerkzeugen kann den Kontobereich verändern und ein Firmenkonto vortäuschen. Deshalb `hint` statt `allow` bevorzugen und harte Sperren über `rules` setzen.
- **Gleichnamige Firma:** Ein Arbeitsbereich einer fremden Firma mit genau demselben Namen gilt als Firmenkonto. Eindeutige Workspace-Namen verwenden.
- **Workspace-Namen statt Kennzeichen:** `plan`/`shield` erkennen jede Firma, nicht nur Ihre.
- **Seitenumbau:** Die Selektoren des Kontobereichs (z. B. `[data-testid="workspace-switcher-button"]`, `[data-testid="accounts-profile-button"]`) sind auf den echten Seiten noch nicht live geprüft. Ohne Treffer gilt „nicht erkannt“ = strengste Stufe – das behindert höchstens, es öffnet nichts.
- Unprüfbares (z. B. zu langer Text) bleibt in jeder Stufe eine Warnung; Datei-Uploads steuert weiter `blockUncheckedFiles`.

