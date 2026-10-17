# Branding (Whitelabel)

Richtlinien-Objekt `branding` – alle Felder optional:

| Feld | Regel | Wirkung |
|---|---|---|
| `productName` | 1–40 Zeichen | Name im Popup, Dialog, in Einstellungen und Texten (`{product}`); Standard „AImori“ (Wortmarke mit abgesetztem „AI“ und Serifen-I, Bilder `docs/screenshots/aimori/serifen-i/`); ein eigener Name erscheint als reiner Text |
| `companyName` | max. 80 Zeichen | „Verwaltet von …“-Hinweis und Untertitel |
| `logo` | `data:image/png;base64,…` oder `data:image/svg+xml;base64,…`, max. ca. 100 KB | Logo in Popup, Warnleiste und Nachweis (nur als `<img>` angezeigt); PNG nur mit PNG-Signatur, SVG ohne Skripte, Ereignis-Attribute, `style`, eingebettete Inhalte und Verweise nach aussen – sonst Standardsymbol |
| `primaryColor` | `#rrggbb` | Signet (dann einfarbig) und Hauptknopf (statt Marken-Verlauf, Schwärzen); bei zu wenig Kontrast (< 3:1 zur Fläche) gilt die Standardfarbe. «Trotzdem senden» bleibt immer neutral. |
| `accentColor` | `#rrggbb` | Markierung der Fundstelle (Unterstrich); gleiche Kontrastregel |
| `supportUrl` | nur `https://` | Link „Support“ (öffnet nur auf Klick, ohne Referrer) |
| `supportText` | max. 200 Zeichen | Hinweis unter dem Dialog |
| `aiNoticeText` | max. 200 Zeichen, nur Text | Satz auf nicht freigegebenen KI-Seiten (`aiSiteMode`), z. B. „Bitte nutzen Sie unseren Firmen-Copilot.“; leer = Standardtext |
| `aiNoticeUrl` | nur `https://`, ohne Benutzer/Passwort, max. 2000 Zeichen | Knopf zum freigegebenen KI-Tool (öffnet nur auf Klick, neuer Tab, ohne Referrer); ungültig = kein Knopf |
| `aiNoticeLinkText` | max. 60 Zeichen | Text des Knopfs; leer = „Freigegebenes KI-Tool öffnen“ |

**Logo als URL geht bewusst nicht:** die Erweiterung hat keinen Netzwerkzugriff. Logo umwandeln:
```powershell
'data:image/png;base64,' + [Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\Pfad\logo.png'))
```

Was sich **nicht** per Richtlinie ändern lässt: Name im Erweiterungs-Menü des Browsers und im Store (kommt aus `_locales`), Symbol in der Symbolleiste. Für ein vollständig eigenes Paket: `extension/branding.js`, `extension/_locales/*/messages.json` und `extension/icons/` anpassen, dann `npm run build`.

Beispiel: `enterprise/example-policy.json` (fiktive Firma, example.com). Mehrere Kunden mit eigenem Logo: [Für Unternehmen](fuer-unternehmen.md) (`scripts/mandanten.mjs` prüft Logos strenger und erzeugt die Rollout-Dateien).
