# Erlaubte KI-Tools (Schatten-KI-Kontrolle)

Firmen legen per Richtlinie fest, welche KI-Tools erlaubt sind, und lenken Schatten-KI auf das freigegebene Tool: Auf anderen bekannten KI-Seiten zeigt die Erweiterung einen freundlichen Hinweis mit Knopf zur freigegebenen KI (warnen) – oder eine Sperrseite mit demselben Knopf (sperren). Alles läuft lokal im Browser: keine Liste aus dem Netz, keine Meldung an Admins, keine Speicherung besuchter Seiten.

## Richtlinien

| Schlüssel | Werte | Wirkung |
|---|---|---|
| `aiSiteMode` | `off` (Standard), `hint`, `block` | `hint`: Hinweis-Leiste oben auf nicht freigegebenen KI-Seiten, schliessbar für diesen Seitenaufruf. `block`: Die Seite wird beim Laden angehalten und durch eine Sperrseite ersetzt, ohne Schliessen-Knopf. |
| `allowedAiSites` | IDs aus der [Liste](ki-seiten-liste.md) | Freigegebene Tools: dort nichts. |
| `blockedAiSites` | IDs aus der Liste | Immer gesperrt, solange der Modus nicht `off` ist – auch bei `hint`. Sperren schlägt Erlauben. |
| `suggestedAiSite` | eine ID aus der Liste | Vorgeschlagene freigegebene KI (z. B. `m365copilot`). Gilt als freigegeben. Hinweis und Sperrseite zeigen den Knopf „Zu <Name> wechseln“, der auf Klick die Startseite aus der eingebauten Liste öffnet (z. B. `https://copilot.cloud.microsoft/`). **Nur per Richtlinie** (Intune/GPO); ein lokaler Wert wird nie gelesen. Steht die ID in `blockedAiSites` oder ist sie unbekannt, entfällt der Vorschlag ganz. |
| `branding.aiNoticeText` | Text, max. 200 Zeichen | Eigener Satz, z. B. „Bitte nutzen Sie unseren Firmen-Copilot.“ |
| `branding.aiNoticeUrl` | `https://…` | Knopf zu einem eigenen Ziel (z. B. Intranet-Seite zum Firmen-Copilot). Hat Vorrang vor `suggestedAiSite`; es erscheint nie ein zweiter Knopf. |
| `branding.aiNoticeLinkText` | Text, max. 60 Zeichen | Beschriftung des Knopfs (Standard mit `suggestedAiSite`: „Zu <Name> wechseln“). |

Logo und Firmenname kommen aus dem übrigen [Branding](branding.md). Unbekannte IDs (z. B. aus einer neueren Liste) werden ignoriert. Ist eines der drei Felder `aiSiteMode`, `allowedAiSites`, `blockedAiSites` per Richtlinie gesetzt, gelten lokale Werte dazu nicht.

### Beispiel

```json
{
  "branding": {
    "companyName": "Example AG",
    "aiNoticeText": "Bitte nutzen Sie unseren Firmen-Copilot.",
    "aiNoticeUrl": "https://copilot.example.com/",
    "aiNoticeLinkText": "Zum Firmen-Copilot"
  },
  "aiSiteMode": "hint",
  "allowedAiSites": ["m365copilot", "copilot"],
  "blockedAiSites": ["deepseek"]
}
```

Ergebnis: Microsoft 365 Copilot und Copilot ohne Hinweis, DeepSeek gesperrt, alle anderen bekannten KI-Seiten mit Hinweis-Leiste.

### Freigegebene KI vorschlagen (Schatten-KI lenken)

`suggestedAiSite` nennt die eine KI, auf die Benutzer gelenkt werden. Beispiel [`enterprise/example-ki-lenkung.json`](../enterprise/example-ki-lenkung.json):

```json
{
  "branding": { "companyName": "Example AG", "aiNoticeText": "Bitte nutzen Sie den freigegebenen Firmen-Copilot." },
  "aiSiteMode": "hint",
  "allowedAiSites": ["m365copilot"],
  "blockedAiSites": ["deepseek"],
  "suggestedAiSite": "m365copilot"
}
```

Ergebnis: Auf ChatGPT, Claude, Gemini, Copilot und allen anderen bekannten KI-Seiten erscheint oben der Hinweis mit dem Knopf „Zu Microsoft 365 Copilot wechseln“; DeepSeek zeigt die Sperrseite mit demselben Knopf. Mit `"aiSiteMode": "block"` sperrt die Erweiterung alle nicht freigegebenen KI-Seiten und bietet nur noch den Knopf an. Der Knopf öffnet die Seite erst auf Klick in einem neuen Tab, ohne Referrer; es gibt keine automatische Weiterleitung.

**Auch auf der freigegebenen KI läuft die Eingabeprüfung weiter.** „Freigegeben“ schaltet nur Hinweis und Sperrseite ab; sensible Daten werden dort genauso erkannt, geschwärzt oder gestoppt.

Ohne Richtlinie ist nichts davon aktiv (Standard: `aiSiteMode` = `off`, `suggestedAiSite` leer). In der Gruppenrichtlinie (ADMX) heisst der Eintrag „Vorgeschlagene freigegebene KI“; die Erklärung listet alle gültigen IDs. ADMX-Textfelder können kein Muster erzwingen: ungültige Werte ignoriert die Erweiterung still.

#### PowerShell (ohne GPO/Intune, z. B. per RMM)

Als Administrator in `enterprise/` (Windows PowerShell 5.1). `Deploy-Policy.ps1` prüft die Datei gegen `managed_schema.json`, sichert vorhandene Werte und ersetzt den ganzen Richtlinien-Schlüssel der Erweiterung – die Felder oben also in die eigene, vollständige Richtlinie übernehmen ([Registry-Skripte](deployment/registry-skripte.md)). `<ID>` ist die Erweiterungs-ID (siehe [Installation](installation.md)).

```powershell
# 1. Nur anzeigen (ohne Adminrechte), dann Trockenlauf, dann schreiben (HKLM braucht Adminrechte)
.\Deploy-Policy.ps1 -ExtensionId <ID> -PolicyJson .\example-ki-lenkung.json -PlanOnly
.\Deploy-Policy.ps1 -ExtensionId <ID> -PolicyJson .\example-ki-lenkung.json -WhatIf
.\Deploy-Policy.ps1 -ExtensionId <ID> -PolicyJson .\example-ki-lenkung.json -Browser Edge,Chrome

# 2. Kontrolle (nur lesen)
Get-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Edge\3rdparty\extensions\<ID>\policy" -Name aiSiteMode, suggestedAiSite
Get-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\<ID>\policy" -Name aiSiteMode, suggestedAiSite
```

Danach im Browser `edge://policy` bzw. `chrome://policy` → „Richtlinien neu laden“. Intune (Einstellungskatalog oder ADMX-Import) und GPO setzen dieselben Werte: [Intune](deployment/intune.md), [GPO](deployment/gpo.md). In der Gruppenrichtlinie (ADMX) heissen die Einträge „KI-Seiten-Kontrolle“, „Freigegebene KI-Seiten“, „Gesperrte KI-Seiten“ und unter Branding „Hinweistext KI-Seiten“, „Link KI-Seiten-Hinweis“, „Knopftext KI-Seiten-Hinweis“.

## Rechte: einmal erlauben

Die Erweiterung hat kein Pflichtrecht auf alle Webseiten (einzige Ausnahme: der optionale Zugriff auf alle https-Seiten für den [Hinweis beim Kopieren](fuer-unternehmen.md#7-ki-seitenleisten-und-ki-erweiterungen-sperren), nur auf Klick des Benutzers). Für die KI-Seiten-Kontrolle fragt den Zugriff nur für die Hosts der Liste an, und zwar als **optionale Rechte** (`optional_host_permissions`), dazu das Recht `scripting` ohne Installationswarnung.

- Auf den sieben unterstützten KI-Seiten (ChatGPT, Claude, Gemini, Copilot, Microsoft 365 Copilot) wirkt die Kontrolle sofort.
- Für alle anderen Seiten der Liste muss jeder Benutzer den Zugriff **einmal** erlauben: Einstellungen → „KI-Seiten (freigegebene Tools)“ → „Zugriff auf KI-Seiten erlauben“. Das Popup zeigt einen Hinweis, solange der Zugriff fehlt.
- Auch bei Zwangsinstallation per Richtlinie werden optionale Rechte nicht automatisch gewährt (Stand der Browser-Dokumentation, nicht auf einem verwalteten Gerät gemessen). Benutzer können sie verweigern oder später entziehen; die Erweiterung erfährt das, meldet es aber niemandem.

## Harte Sperre: URLBlocklist

Die Sperrseite der Erweiterung ist eine Überlagerung. Wer Browser-Werkzeuge beherrscht, kann sie umgehen; ohne erteiltes Recht erscheint sie gar nicht. **Für eine echte Sperre zusätzlich die Browser-Richtlinie `URLBlocklist` setzen** (Edge und Chrome, per GPO/Intune). Eine aus der Liste erzeugte Vorlage steht in [ki-seiten-liste.md](ki-seiten-liste.md); vor dem Einsatz die freigegebenen Tools daraus entfernen. Die Erweiterung bleibt nützlich: Sie erklärt Benutzern freundlich, welches Tool sie stattdessen nutzen sollen, und prüft auf den erlaubten Seiten weiter die Eingaben.

## Grenzen

- Nur der Hauptframe: KI-Funktionen, die in andere Seiten eingebettet sind (z. B. Copilot in Office-Apps), werden nicht erfasst.
- Nur bekannte Seiten der mitgelieferten Liste (Stand siehe Liste); neue KI-Seiten kommen nur mit einem Update der Erweiterung dazu.
- Seiten, die sich den Host mit anderen Inhalten teilen (HuggingChat auf huggingface.co/chat, GitHub Copilot auf github.com/copilot), werden nur beim Laden der Pfade erkannt, nicht beim Wechsel innerhalb der Seite.
- Edge lässt auf einigen Microsoft-Copilot-Hosts keine Erweiterungen laufen (siehe [Über](ueber.md)). Dort wirkt nur `URLBlocklist`.
- Auf gesperrten unterstützten Seiten startet die Eingabeprüfung nicht; Senden und Einfügen werden gestoppt.
- „Anbieter-Sitz“ in der Liste ist der Firmensitz laut öffentlichen Angaben, keine Aussage zum Speicherort der Daten.

## Datenschutz

Gespeichert wird nichts über besuchte Seiten: keine URLs, keine Zählung, keine Protokolle. Im Sitzungsspeicher des Browsers liegt je angezeigtem Hinweis nur eine Zufallsnummer mit Tab, Dokument-Kennung, Art und Seitenname (bis der Tab schliesst, höchstens 12 Stunden). Der Wächter auf den KI-Seiten liest weder Eingaben noch Seiteninhalte.

