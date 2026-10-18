# Für Unternehmen und IT-Dienstleister: Rollout je Kunde mit eigenem Logo

Sie betreuen mehrere Kunden (MSP) oder mehrere Gesellschaften? Dann pflegen Sie **eine Basis-Richtlinie** und
je Kunde nur die **Abweichungen** (Logo, Farbe, strengere Regeln, erlaubte KI-Seiten). Das Werkzeug
`scripts/mandanten.mjs` erzeugt daraus je Kunde alle Dateien für **Intune** und **Gruppenrichtlinien (GPO)**.

Das Werkzeug arbeitet nur lokal: kein Netzwerk, keine Anmeldung, keine Graph- oder Tenant-Aufrufe – es lädt
nichts hoch. Sie entscheiden, was Sie wo hochladen. Die Erweiterung selbst hat weiterhin keinen Netzwerkzugriff;
das Logo steckt als kleines Bild direkt in der Richtlinie und wird nie von einer URL nachgeladen.

## 1. Mandanten-Datei anlegen

Vorlage: [`enterprise/mandanten/beispiel.json`](../enterprise/mandanten/beispiel.json) (drei erfundene Kunden).

```json
{
  "erweiterung": {
    "edge":   { "id": "<Erweiterungs-ID in Edge>",   "updateUrl": "https://…" },
    "chrome": { "id": "<Erweiterungs-ID in Chrome>", "updateUrl": "https://…" }
  },
  "basis": { "language": "auto", "rules": { "iban": "redact" }, "aiSiteMode": "hint" },
  "kunden": [
    { "id": "kunde-a", "name": "Kunde A AG", "logo": "logos/kunde-a.png",
      "richtlinie": { "branding": { "primaryColor": "#b4461e" }, "rules": { "ch_ahv": "block" } } }
  ]
}
```

| Feld | Regel |
|---|---|
| `erweiterung.<browser>.id` | 32 Zeichen `a`–`p`. Fehlt sie, gilt die Entwicklungs-ID aus dem Manifest. Edge-Add-ons und Chrome Web Store vergeben unterschiedliche IDs. |
| `erweiterung.<browser>.updateUrl` | Optional, nur `https://` ohne Benutzer/Passwort und ohne `#`. Store: Edge `https://edge.microsoft.com/extensionwebstorebase/v1/crx`, Chrome `https://clients2.google.com/service/update2/crx`; sonst die URL Ihres Update-Servers (signiertes CRX). Ohne URL wird nur die Richtlinie verteilt, die Erweiterung aber nicht erzwungen. |
| `basis` | Richtlinie wie in [Einstellungen](einstellungen.md) beschrieben. |
| `kunden[].id` | Ordnername der Ausgabe: `a`–`z`, `0`–`9`, `-`, höchstens 40 Zeichen. |
| `kunden[].name` | Wird zu `branding.companyName` („Verwaltet von …“), falls die Richtlinie keinen eigenen setzt. |
| `kunden[].logo` | Optional, Pfad **relativ zur Mandanten-Datei** (siehe Abschnitt 3). |
| `kunden[].richtlinie` | Abweichungen: Objekte (z. B. `branding`, `rules`) werden zusammengeführt, Listen (z. B. `allowedAiSites`) ersetzt. |

## 2. Dateien erzeugen

```powershell
node scripts/mandanten.mjs C:\Rollout\mandanten.json --out C:\Rollout\ausgabe
```

Ohne `--out` landet alles im Ordner `ausgabe` neben der Mandanten-Datei. Liegt der Ausgabeordner in einem
Git-Repository, muss er dort gitignoriert sein – sonst bricht das Werkzeug ab. Bestehende Dateien werden nur mit
`--force` überschrieben (und nur die bekannten Dateinamen; nichts wird gelöscht).

Jede Kunden-Richtlinie wird **nach** dem Zusammenführen gegen `extension/managed_schema.json` geprüft; bei einem
Fehler nennt das Werkzeug nur den Feldpfad (nie den Wert) und erzeugt nichts.

```
ausgabe/
  _admx/edge/…, _admx/chrome/…        ADMX/ADML für Central Store bzw. Intune-Import
  kunde-a/
    richtlinie.json                   fertige Richtlinie
    intune/edge-extensionsettings.json  Wert für „ExtensionSettings“ (Erweiterung erzwingen)
    intune/edge-oma-uri.json          Zeilen für ein benutzerdefiniertes Intune-Profil (OMA-URI)
    gpo/edge-richtlinie.reg           Registry-Variante
    (dasselbe für chrome)
    Rollout.ps1                       PowerShell-Rollout (Plattformskript, Startskript, RMM)
    ANLEITUNG.md                      Kurzanleitung für diesen Kunden
```

**Vertraulich behandeln:** Die Dateien können Salz und Prüfsummen [eigener Begriffe](eigene-begriffe.md)
enthalten. Nicht in Sync-Ordnern (OneDrive, Dropbox) ablegen und nach dem Rollout löschen.

## 3. Firmenlogo und Farben

| Format | Grenzen |
|---|---|
| PNG | höchstens 64 KB und 512 × 512 Pixel; empfohlen 64 × 64 oder 128 × 128 mit transparentem Rand |
| SVG | höchstens 32 KB, UTF-8 ohne BOM, nur einfache Formen (`svg`, `g`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `defs`, Verläufe, `clipPath`, `mask`, `use`, `symbol`, `text`, `title`, `desc`) |

Abgelehnt werden u. a. Skripte, Ereignis-Attribute (`onload` …), `foreignObject`, `style`, eingebettete Bilder,
Links, Animationen, `DOCTYPE`/Entitäten und Verweise nach aussen (nur `#id` innerhalb der Datei). Das Werkzeug
bereinigt nicht still, sondern nennt den Grund; entfernen Sie das Element im Grafikprogramm („SVG 1.1, Stile als
Attribute“) und exportieren Sie neu. Die Erweiterung prüft das Logo beim Laden der Richtlinie noch einmal und zeigt bei
einem ungültigen Logo das Standardsymbol.

Das Logo erscheint im **Popup**, in der **Warnleiste** (im erweiterungseigenen Frame, nie im Code der KI-Seite), in den
Einstellungen und auf dem **KI-Kompetenz-Nachweis** (auch im PDF-Export). Name und Farben kommen aus `branding`
(`productName`, `companyName`, `primaryColor`, `accentColor`) – siehe [Branding](branding.md). Alternativ kann ein
eigenes Paket das Logo fest mitbringen (`extension/branding.js`).

## 4. Rollout mit Intune – Schritt für Schritt

Voraussetzung: Die Erweiterung ist im Store veröffentlicht oder liegt als signiertes CRX auf Ihrem Update-Server
(eine entpackte Entwicklungsfassung lässt sich nicht erzwingen).

**A) Erweiterung erzwingen (Einstellungskatalog)**
1. Intune Admin Center → Geräte → Windows → Konfiguration → Erstellen → Neue Richtlinie → Windows 10 und höher →
   **Einstellungskatalog**.
2. Einstellungen hinzufügen → Suche „Extension management settings“ → Kategorie *Microsoft Edge → Erweiterungen*
   (bzw. *Google → Google Chrome → Extensions*) → „Configure extension management settings“ / „Extension management
   settings“ (`ExtensionSettings`).
3. Aktivieren und den Inhalt von `intune/edge-extensionsettings.json` (bzw. `chrome-…`) als Wert einfügen.
   Bestehende `ExtensionSettings` für andere Erweiterungen zusammenführen – die Richtlinie gibt es nur einmal pro Gerät.
4. Gerätegruppe des Kunden zuweisen.

**B) Richtlinie der Erweiterung – Variante benutzerdefiniertes Profil (OMA-URI)**
1. Konfiguration → Erstellen → Windows 10 und höher → Vorlagen → **Benutzerdefiniert**.
2. Für **jede Zeile** aus `intune/edge-oma-uri.json` eine OMA-URI-Einstellung anlegen: Name = `name`,
   OMA-URI = `omaUri`, Datentyp = **Zeichenfolge**, Wert = `value`. Die **erste Zeile** (`…/ADMXInstall/…`) lädt die
   ADMX ins Gerät und muss dabei sein; die weiteren setzen die Werte (`<enabled/><data … />`).
3. Gerätegruppe zuweisen. Für Chrome dasselbe mit `chrome-oma-uri.json` (eigenes Profil).

**B′) Variante Plattformskript (einfacher, ein Schritt)**
1. Geräte → Skripts und Wartungen → Plattformskripts → Hinzufügen → Windows 10 und höher.
2. `Rollout.ps1` hochladen; *Skript mit Anmeldeinformationen des Benutzers ausführen* = **Nein** (läuft als SYSTEM),
   *64-Bit-PowerShell* = **Ja**.
3. Gerätegruppe zuweisen. Das Skript prüft die Richtlinie gegen das Schema, sichert vorhandene Werte und ersetzt nur den
   eigenen Schlüssel `…\3rdparty\extensions\<ID>\policy`; mit Update-URL hängt es zusätzlich einen eigenen Eintrag an
   `ExtensionInstallForcelist` an (dann Schritt A weglassen).

Vorher auf einem Testgerät: `powershell -ExecutionPolicy Bypass -File Rollout.ps1 -PlanOnly` zeigt nur, was geschrieben
würde. Verteilen Sie das Skript nur über Intune/GPO oder signiert (Authenticode) – es läuft mit Administratorrechten.

**Prüfen:** auf dem Gerät `edge://policy` bzw. `chrome://policy` → „Richtlinien neu laden“; unter der Erweiterung
stehen die Werte. Das Popup der Erweiterung zeigt Logo und „Verwaltet von …“.

## 5. Rollout per Gruppenrichtlinie (GPO) – Schritt für Schritt

**A) Administrative Vorlagen (empfohlen)**
1. `_admx/edge/dlx-edge.admx` (bzw. `chrome`) in den Central Store kopieren:
   `\\<domäne>\SYSVOL\<domäne>\Policies\PolicyDefinitions`, die ADML in `en-US` bzw. `de-DE`.
2. Je Kunde eine GPO anlegen und mit der OU des Kunden verknüpfen.
3. Computerkonfiguration → Richtlinien → Administrative Vorlagen → „<Produktname> (Microsoft Edge)“: die Werte aus
   `richtlinie.json` übernehmen ([Bedeutung](einstellungen.md)). Das Logo (`branding.logo`) als ganze Zeile
   `data:image/…` aus `richtlinie.json` kopieren.
4. Erweiterung erzwingen: mit der offiziellen Edge- bzw. Chrome-ADMX „Configure extension management settings“ aktivieren
   und den Inhalt von `intune/edge-extensionsettings.json` einfügen (eine Zeile).
5. `gpupdate /force`, dann `edge://policy` prüfen.

**B) Startskript statt Werte klicken**
1. GPO → Computerkonfiguration → Richtlinien → Windows-Einstellungen → Skripts → **Starten** → Registerkarte
   *PowerShell-Skripts* → `Rollout.ps1` hinzufügen (die Datei liegt dann in der GPO auf SYSVOL; Zugriff auf die
   Computer der OU beschränken).
2. Beim nächsten Start schreibt das Skript die Richtlinie wie in Intune B′.

**C) Registry-Datei**
`gpo/edge-richtlinie.reg` setzt dieselben Werte (`reg import edge-richtlinie.reg` als Administrator, z. B. per RMM).
Sie löscht vorher nur den eigenen Schlüssel `…\3rdparty\extensions\<ID>\policy`.

Zusätzlich empfohlen: `DeveloperToolsAvailability` = 2, Erweiterung per Forcelist/`ExtensionSettings` erzwingen,
KI-Desktop-Apps sperren, wenn nur der geschützte Browser genutzt werden soll – siehe [GPO](deployment/gpo.md).

## 6. Grenzen und Hinweise

- Das Werkzeug wurde mit Schema-, Format- und Parser-Tests geprüft; ein Upload in einen echten Intune-Tenant und eine
  echte Domäne gehört nicht dazu. Testen Sie jede neue Vorlage zuerst auf einem Testgerät (`-PlanOnly`, `edge://policy`).
- Die Werte der benutzerdefinierten OMA-URI-Zeilen folgen dem ADMX-Format von Microsoft (Listen mit dem Trennzeichen
  `U+F000`, Auswahllisten mit dem Wert). Intune begrenzt die Länge einzelner Werte; halten Sie das Logo klein
  (empfohlen unter 20 KB), sonst nehmen Sie Variante B′.
- Die Anzeige im Browser-Menü und im Store (Name, Symbol der Symbolleiste) lässt sich per Richtlinie nicht ändern.
- Design-Review: [Mandanten-Vorlagen und Firmenlogo](sicherheit/design-review-mandanten.md).

## 7. KI-Seitenleisten und KI-Erweiterungen sperren

AImori prüft Eingaben auf KI-Webseiten. **KI-Seitenleisten** im Browser (Copilot in Edge, Gemini in Chrome) und
**KI-Erweiterungen** (z. B. Claude in Chrome) kann eine Erweiterung nicht erreichen: Sie laufen in privilegierten
Bereichen des Browsers bzw. als eigene Erweiterung, und was sie lesen, geht nicht über die Webseite. Wirksam ist hier
nur die Browser-Richtlinie. Die folgenden Vorlagen sperren diese Wege ganz oder schränken sie ein.

**Was AImori selbst beiträgt (Teilschutz):** Wer auf einer https-Seite Text mit sensiblen Daten kopiert, sieht
einen dezenten Hinweis, dass Seitenleisten und KI-Erweiterungen nicht geprüft werden (Einstellung `copySidebarHint`,
Standard an, siehe [Einstellungen](einstellungen.md)). Der Hinweis hält nichts auf. Er wirkt erst, wenn der Benutzer
in den Einstellungen von AImori den optionalen Zugriff auf alle https-Seiten erteilt; **eine Richtlinie kann den
Hinweis einschalten oder abschalten, den Zugriff aber nicht ohne Klick des Benutzers erteilen.** Nicht abgedeckt
sind http-Seiten, Inhalte in iframes (z. B. manche Webmail-Editoren), Kopieren in anderen Programmen, Seitenfenster
von KI-Agenten-Browsern und KI-Desktop-Apps.

Stand der Richtliniennamen: 16.10.2026, aus den Richtlinienlisten der Hersteller (Quellen unten). Browser-Versionen
ändern Richtlinien laufend – prüfen Sie jede Vorlage zuerst auf einem Testgerät unter `edge://policy` bzw.
`chrome://policy`. Ohne Gewähr.

### 7.1 Microsoft Edge

Registry-Pfad (Pflicht-Richtlinie): `HKLM\SOFTWARE\Policies\Microsoft\Edge`. GPO: Computerkonfiguration →
Richtlinien → Administrative Vorlagen → Microsoft Edge (offizielle Edge-ADMX). Intune: Einstellungskatalog,
Kategorie *Microsoft Edge*, nach dem Richtliniennamen oder Anzeigenamen suchen.

| Richtlinie | Ab Edge | Typ | Wert | Wirkung |
|---|---|---|---|---|
| `HubsSidebarEnabled` | 99 | Boolean | `0` | Seitenleiste ganz aus. Steuert ab Edge 141 das Copilot-Symbol nicht mehr. |
| `Microsoft365CopilotChatIconEnabled` | 139 | Boolean | `0` | Kein Copilot-Symbol in Symbolleiste und Seitenleiste (Entra-Profile). |
| `EdgeEntraCopilotPageContext` | 130 | Boolean | `0` | Copilot im Seitenfenster liest keinen Seiteninhalt, keinen Verlauf, keine Video-Transkripte (Entra-Profile, inkl. Microsoft 365 Copilot Chat und Enterprise Data Protection). |
| `CopilotPageContext` | 124 | Boolean | `0` | Dasselbe für Copilot ohne Enterprise Data Protection (Entra-Profile). Zusammen mit der Zeile darüber setzen. |
| `AllowBrowsingWithCopilot` | 148 | Boolean | `0` | „Browsing with Copilot“ (Copilot handelt selbst im Browser) aus. |
| `EdgeSidebarAppUrlHostBlockList` | 127 | Liste | `*` | Alle Apps in der Seitenleiste gesperrt; Ausnahmen mit `EdgeSidebarAppUrlHostAllowList`. |
| `ComposeInlineEnabled` | 115 | Boolean | `0` | Schreibhilfe (Umschreiben mit Copilot) in Textfeldern aus (Entra-Konten). |

Nicht verwenden: `CopilotCDPPageContext` ist veraltet; `EdgeCopilotEnabled` gilt nur für Edge auf Android/iOS.

**Wichtig:** Fast alle Copilot-Richtlinien wirken nur in Profilen mit Arbeits- oder Schulkonto (Entra ID). Wer
private Profile zulässt, umgeht sie – zusätzlich die Anmeldung auf Firmenkonten beschränken (z. B.
`RestrictSigninToPattern`) und private Profile nicht erlauben.

**Vorlage A – streng (Seitenleiste aus), als `.reg`:**

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge]
"HubsSidebarEnabled"=dword:00000000
"Microsoft365CopilotChatIconEnabled"=dword:00000000
"EdgeEntraCopilotPageContext"=dword:00000000
"CopilotPageContext"=dword:00000000
"AllowBrowsingWithCopilot"=dword:00000000
"ComposeInlineEnabled"=dword:00000000

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge\EdgeSidebarAppUrlHostBlockList]
"1"="*"
```

**Vorlage B – einschränken (Copilot bleibt, sieht aber keine Seiten):** nur `EdgeEntraCopilotPageContext`,
`CopilotPageContext` und `AllowBrowsingWithCopilot` je `0`. Copilot kann dann weiter Fragen beantworten, liest aber
weder die offene Seite noch handelt er selbst. Was Mitarbeitende in Copilot eintippen oder einfügen, prüft AImori
dort nicht (Copilot-Seiten sind in Edge für Erweiterungen gesperrt).

### 7.2 Google Chrome

Registry-Pfad: `HKLM\SOFTWARE\Policies\Google\Chrome`. GPO: Administrative Vorlagen → Google → Google Chrome
(Gruppe „Generative AI“, offizielle Chrome-ADMX). Intune: Einstellungskatalog, Kategorie *Google → Google Chrome*.

| Richtlinie | Ab Chrome | Wert | Wirkung |
|---|---|---|---|
| `GeminiSettings` | 137 | `1` | Gemini in Chrome aus (`0` = erlaubt). |
| `GeminiActOnWebSettings` | 143 | `1` | Gemini handelt nicht selbst auf Webseiten („auto browse“). Feiner: `GeminiActOnWebBlockedForURLs` / `GeminiActOnWebAllowedForURLs`. |
| `HelpMeWriteSettings` | 121 | `2` | Schreibhilfe aus. |
| `TabCompareSettings` | 129 | `2` | KI-Tabvergleich aus. |
| `HistorySearchSettings` | 128 | `2` | KI-Verlaufssuche aus. |
| `DevToolsGenAiSettings` | 125 | `2` | KI in den Entwicklertools aus. |
| `AIModeSettings` | 138 | `1` | KI-Modus in Adressleiste und Neuer-Tab-Suche aus. |
| `SearchContentSharingSettings` | 144 | `1` | Kein Teilen von Seiteninhalten mit KI-Modus und Lens. |

`GenAiDefaultSettings` (Standard für alle KI-Funktionen, `2` = aus) gibt es nur in der Google-Admin-Konsole
(Cloud-Verwaltung), nicht per GPO/Registry.

**Vorlage C – Chrome, als `.reg`:**

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome]
"GeminiSettings"=dword:00000001
"GeminiActOnWebSettings"=dword:00000001
"HelpMeWriteSettings"=dword:00000002
"TabCompareSettings"=dword:00000002
"HistorySearchSettings"=dword:00000002
"DevToolsGenAiSettings"=dword:00000002
"AIModeSettings"=dword:00000001
"SearchContentSharingSettings"=dword:00000001
```

### 7.3 KI-Erweiterungen sperren (Edge und Chrome)

Beide Browser nutzen `ExtensionSettings` (JSON in einer Zeile, Typ Zeichenfolge) und `ExtensionInstallBlocklist`
(Liste). `installation_mode: "removed"` deinstalliert eine bereits installierte Erweiterung; `blocked` verhindert nur
die Installation. Die Richtlinie `ExtensionSettings` gibt es **nur einmal pro Browser**: mit dem Eintrag, der
AImori erzwingt (Abschnitt 4, `intune/edge-extensionsettings.json`), zu **einer** Zeile zusammenführen.

Bekannte IDs (Chrome Web Store, Stand 16.10.2026; aus Edge-Add-ons installierte Erweiterungen haben eigene IDs –
ID jeweils in der Store-Adresse ablesen):

| Erweiterung | ID |
|---|---|
| Claude in Chrome (Anthropic) | `fcoeoabgfenejglbffodgkkbkcdhcgfn` |
| Sider | `difoiogjjojoaoomphldepapgpbgkhkb` |
| Monica | `ofpnmcalabcbjgholdjcjblkibolbppb` |
| HARPA AI | `eanggfilgoajaocelnaflolkadkeghjp` |

**Vorlage D – gezielt sperren** (alle übrigen Erweiterungen bleiben erlaubt):

```json
{"fcoeoabgfenejglbffodgkkbkcdhcgfn":{"installation_mode":"removed"},"difoiogjjojoaoomphldepapgpbgkhkb":{"installation_mode":"removed"},"ofpnmcalabcbjgholdjcjblkibolbppb":{"installation_mode":"removed"},"eanggfilgoajaocelnaflolkadkeghjp":{"installation_mode":"removed"}}
```

**Vorlage E – Freigabeliste** (alles gesperrt ausser ausdrücklich erlaubten Erweiterungen; wirksamster Schutz, aber
mit Pflegeaufwand):

```json
{"*":{"installation_mode":"blocked","blocked_permissions":["debugger"]},"lefajbhockjgdhaohnacgaggfepianjh":{"installation_mode":"force_installed","update_url":"https://clients2.google.com/service/update2/crx"}}
```

- Die AImori-ID oben ist die Store-ID aus dem Chrome Web Store (gilt für Chrome und Edge)
  ([Installation](installation.md)). Ohne eigenen Eintrag sperrt `"*": blocked` auch AImori.
- `"*": blocked` und `blocked_permissions: ["debugger"]` treffen auch legitime Erweiterungen (Passwortmanager,
  Barrierefreiheit, Entwicklerwerkzeuge). Benötigte Erweiterungen je einzeln mit `"installation_mode":"allowed"`
  eintragen und vorher eine Bestandsaufnahme machen (`edge://extensions`, Intune-Inventar).
- Viele KI-Agenten-Erweiterungen steuern den Browser über das Recht `debugger` (Chrome DevTools Protocol);
  `blocked_permissions: ["debugger"]` sperrt diesen Weg auch für noch unbekannte Erweiterungen.

**Einspielen:** GPO → Administrative Vorlagen → Microsoft Edge → Erweiterungen → „Configure extension management
settings“ (Chrome: Google Chrome → Extensions → „Extension management settings“) aktivieren und die Zeile einfügen.
Intune: Einstellungskatalog → `ExtensionSettings` wie in Abschnitt 4 A. Registry: Zeichenfolge `ExtensionSettings`
unter dem jeweiligen Richtlinienpfad.

### 7.4 Quellen (Abruf 16.10.2026)

- Microsoft Edge – Browser-Richtlinien (je Richtlinie eine Seite):
  https://learn.microsoft.com/deployedge/microsoft-edge-policies (`HubsSidebarEnabled`,
  `Microsoft365CopilotChatIconEnabled`, `EdgeEntraCopilotPageContext`, `CopilotPageContext`, `AllowBrowsingWithCopilot`,
  `EdgeSidebarAppUrlHostBlockList`, `ComposeInlineEnabled`, `ExtensionSettings`, `ExtensionInstallBlocklist`)
- Microsoft Edge – Browsing with Copilot verwalten: https://learn.microsoft.com/deployedge/microsoft-edge-management-browsing-with-copilot
- Google Chrome – Richtlinienliste: https://chromeenterprise.google/policies/ ; Definitionen der KI-Richtlinien im
  Chromium-Quellcode: https://github.com/chromium/chromium/tree/main/components/policy/resources/templates/policy_definitions/GenerativeAI
- Chrome `ExtensionSettings`: https://support.google.com/chrome/a/answer/9867568
- Erweiterungs-IDs: Adressen der Einträge im Chrome Web Store (chromewebstore.google.com/detail/…/<ID>)
- Machbarkeit und Grenzen bei KI-Agenten: [KI-Agenten und KI-Browser](ki-agenten.md); Design-Review:
  [Hinweis beim Kopieren](sicherheit/design-review-kopierwarnung.md)

