# KI-Agenten und KI-Browser – Machbarkeit

Stand 2026-10-16. Dieser Bericht beschreibt, was die Erweiterung (Manifest V3) in Browsern mit KI-Agenten leisten kann und was nicht. Kennzeichnung jeder Aussage: **laut Hersteller** (Primärquelle des Herstellers), **Sekundärquelle** (Fachpresse, Foren, Drittanbieter) oder **geprüft (Attrappe)** (nur, was im Abschnitt [Was die Erweiterung umsetzt](#was-die-erweiterung-umsetzt) steht).

## Kurzfazit

Eine Browser-Erweiterung kann einen KI-Agenten nicht verlässlich erkennen und nicht verlässlich anhalten: Agenten tippen und klicken wie ein Mensch, teils mit echten Browser-Ereignissen, teils von ausserhalb des Browsers oder aus einer Cloud. Die Erweiterung kann nur das tun, was sie auch bei Menschen tut: Daten in Eingabefeldern der unterstützten KI-Seiten prüfen – egal, wer tippt oder einfügt. Zusätzlich prüft sie eingefügte Texte und hochgeladene Textdokumente auf Hinweise auf versteckte Anweisungen (unsichtbare Zeichen, versteckter Text, typische Umgehungs-Sätze). Den grössten Datenabfluss – Seiteninhalt und Screenshots, die der Browser selbst an den Agenten-Dienst schickt – sieht keine Erweiterung; dagegen helfen nur Hersteller-Einstellungen und Richtlinien. Die Erweiterung verspricht deshalb keinen Schutz vor KI-Agenten und keine Erkennung von Prompt-Injection. Zulässig ist: „warnt bei Hinweisen auf versteckte Anweisungen“ und „prüft Eingaben, auch wenn ein KI-Agent sie eintippt“.

## Übersicht je Agent und Browser

Legende Status: **aktiv** = laut Hersteller verfügbar; **eingestellt** = laut Hersteller beendet; **Vorschau** = eingeschränkt verfügbar; **unklar** = nicht belegt.

| Agent / Browser | Erweiterungen laufen? | Gesperrte Hosts | Wie handelt der Agent | Was die Erweiterung sehen kann | Was sie stoppen kann | Quelle (Datum) | Status |
|---|---|---|---|---|---|---|---|
| ChatGPT Atlas (Agent-Modus) | Ja, Chromium mit Web-Store-Erweiterungen (Sekundärquelle) | Die meisten Erweiterungen auf chatgpt.com gesperrt (Sekundärquelle) | Klickt und tippt im Tab; abgemeldeter Agent-Modus ohne vorhandene Cookies (laut Hersteller, Suchauszug) | Feldinhalte auf unterstützten KI-Seiten ausser chatgpt.com; nicht das Agenten-Seitenfenster | Einfügen/Senden auf den unterstützten Seiten mit Hinweis anhalten (nur Bremse) | help.openai.com Atlas-Artikel (o. D.); superchargebrowser.com (17.06.2026) | **eingestellt** laut Suchauszug der Herstellerseite (Seite beim Abruf nicht erreichbar): seit 09.08.2026 ausser Betrieb, angekündigt 09.07.2026 – vor Entscheidungen selbst prüfen |
| ChatGPT Agent / Cloud-Browser in ChatGPT | Nein – läuft in einem Browser auf einem separaten Rechner in der Cloud von OpenAI (laut Hersteller) | – | Liest Seiten, klickt, füllt Formulare in der Cloud (laut Hersteller) | Nichts – für eine lokale Erweiterung nicht erreichbar | Nichts | help.openai.com „ChatGPT agent“, „Using cloud browser in ChatGPT“ (o. D.) | ChatGPT Agent laut Hersteller nicht mehr verfügbar, abgelöst durch Cloud-Browser (ChatGPT Work) |
| Perplexity Comet | Ja, die meisten Chrome-Web-Store-Erweiterungen; einzelne Funktionen evtl. nicht (laut Hersteller) | Nicht dokumentiert | Steuert die Seite über eine interne Komponente, Spuren im DOM (Sekundärquelle) | Feldinhalte auf den unterstützten KI-Seiten | Einfügen/Senden mit Hinweis anhalten (nur Bremse) | perplexity.ai Help Center „Extensions“ (o. D.); softwareseni.com (2026) | aktiv; Verhalten der Erweiterung im Agent-Modus ungeprüft |
| Edge Copilot Mode / Copilot Actions („Browse with Copilot“) | Ja, ausser auf Copilot-Hosts (Sekundärquelle) | copilot.microsoft.com u. a. (Sekundärquelle); Edge 150 sperrte alle Erweiterungen auf *.cloud.microsoft, Korrektur ab Edge 151 angekündigt (Sekundärquelle, Forum) | Klickt, scrollt, tippt im aktuellen oder neuen Tab, lokal im Browser; fragt bei Kauf, Mail, Löschen nach (laut Hersteller) | Feldinhalte auf unterstützten Seiten ausserhalb der Copilot-Hosts; nicht den Seitenkontext für Copilot | Einfügen/Senden mit Hinweis anhalten (nur Bremse); Seitenkontext nur per Richtlinie | support.microsoft.com „Browse with Copilot“ (o. D.); techcommunity.microsoft.com (2026) | aktiv |
| Chrome mit Gemini („auto browse“) | Ja; Gemini-Seitenfenster für Erweiterungen nicht zugänglich (Sekundärquelle) | Gemini-Seitenfenster (Sekundärquelle) | Klickt, tippt, sendet Formulare; fragt vor Absenden von Formularen, Mitteilungen, Datenänderung nach; Passwörter gehen nicht an Gemini (laut Hersteller) | Feldinhalte auf den unterstützten KI-Seiten | Einfügen/Senden mit Hinweis anhalten (nur Bremse) | support.google.com/chrome/answer/16821166 (o. D., Abruf 2026-10-16); blog.google (12/2025) | Vorschau: nur Desktop, USA, ab 18, Englisch, AI Pro/Ultra; Arbeitskonten nur mit Admin-Freigabe (laut Hersteller) |
| Microsoft 365 Copilot | Auf Microsoft-Copilot-Hosts in Edge nicht (Sekundärquelle); in Chrome ungeprüft | *.cloud.microsoft in Edge 150 (Sekundärquelle, Forum) | Kein Browser-Agent im engeren Sinn; Seitenkontext aus dem Edge-Seitenfenster (laut Hersteller, Richtlinie) | Wo Erweiterungen laufen: Feldinhalte; nie den Seitenkontext aus dem Seitenfenster | Wo Erweiterungen laufen: Einfügen/Senden anhalten; sonst nur Richtlinie | learn.microsoft.com EdgeEntraCopilotPageContext (18.08.2026); techcommunity.microsoft.com (2026) | aktiv |
| Dia | Ja, Unterstützung eingeschränkt (Sekundärquelle) | Nicht dokumentiert | Assistent im Seitenfenster (Sekundärquelle) | Wie Chrome, ungeprüft | Wie Chrome, ungeprüft | superchargebrowser.com (2026) | unklar |
| Opera Neon | Unklar, frühe Versionen ohne Erweiterungen (Sekundärquelle, schwach) | Nicht dokumentiert | Agent „Neon Do“ (Sekundärquelle) | Ungeprüft | Ungeprüft | Vergleichsseiten (o. D.) | unklar |

Für keinen der Agenten ist belegt, ob seine Eingaben als echte Tastatur-Ereignisse (`isTrusted`) ankommen. Die Erweiterung behandelt Agenten-Eingaben deshalb genau wie menschliche.

## Eingebaute Browser-KIs und KI-Seitenleisten

Stand 17.10.2026. Eine Erweiterung erreicht nur Webseiten, die in einem normalen Tab laufen und die der Browser für Erweiterungen nicht sperrt. Eingebaute KI-Assistenten und Seitenleisten laufen in privilegierten Bereichen des Browsers; was sie lesen, geht nicht über die Webseite. Dort prüft keine Erweiterung etwas, auch AImori nicht. Wirksam ist nur die Browser-Richtlinie ([Für Unternehmen, Kapitel 7](fuer-unternehmen.md#7-ki-seitenleisten-und-ki-erweiterungen-sperren)).

| Oberfläche | Für die Erweiterung erreichbar? | Grund | Was gilt |
|---|---|---|---|
| Copilot-Seitenleiste in Edge, Copilot Mode, „Browse with Copilot“ | **Nein** | Lädt Copilot-Hosts (u. a. copilot.microsoft.com, edgeservices.bing.com), die Edge für Erweiterungen fest sperrt; der Seitenkontext geht browserintern an Copilot (Sekundärquelle, Forum; beobachtet mit Edge 155) | Edge-Richtlinien in Kapitel 7.1 (z. B. `EdgeEntraCopilotPageContext`, `CopilotPageContext`, `AllowBrowsingWithCopilot`) |
| Microsoft Copilot im Tab (copilot.com) | **Ja – geschützt** | Normale Webseite; in Chrome und Edge erreichbar (Attrappe), copilot.microsoft.com nur in Chrome (in Edge gesperrt) | Volle Prüfung wie bisher |
| Gemini-Seitenfenster in Chrome, „auto browse“ | **Nein** | Privilegiertes Seitenfenster; Erweiterungen dürfen nicht hinein (Sekundärquelle, 03/2026) | Chrome-Richtlinie `GeminiSettings` (Kapitel 7.2); Arbeitskonten nur mit Admin-Freigabe (laut Hersteller) |
| Gemini im Tab (gemini.google.com) | **Ja – geschützt** | Normale Webseite | Volle Prüfung wie bisher |
| Assistent-Seitenleiste in Comet | **Nein** | Interne Komponente des Browsers, keine Webseite im Tab (Sekundärquelle) | Hersteller-Steuerung „Comet Policies and Controls“ (Inhalt nicht im Einzelnen geprüft) |
| Perplexity im Tab (perplexity.ai, www.perplexity.ai), auch in Comet | **Ja – neu geschützt** (17.10.2026) | Normale Webseite; Eingabefeld und Senden-Knopf nach öffentlicher Oberfläche angenommen, nicht an angemeldeten Seiten gemessen. Ohne erkanntes Feld meldet die Erweiterung „Schutz nicht aktiv“ | Volle Prüfung (Tippen, Senden, Einfügen, Ablegen, Hochladen), Site-ID `perplexity`. Andere Subdomains (z. B. labs.perplexity.ai) bewusst nicht |
| Brave Leo, Opera Aria | **Nein** | Im Browser eingebaut, keine Webseite im Tab | Richtlinien des Herstellers (Namen hier nicht geprüft) |
| Apps in der Edge-Seitenleiste, Web-Panels in Opera/Vivaldi | **Ungeprüft** | Ob Erweiterungen dort laufen, ist nicht dokumentiert und nicht gemessen; nicht als geschützt betrachten | Edge: `EdgeSidebarAppUrlHostBlockList` (Kapitel 7.1) |
| KI-Seitenleisten anderer Erweiterungen (z. B. Claude in Chrome) | **Nein** | Seiten fremder Erweiterungen sind für andere Erweiterungen gesperrt | `ExtensionInstallBlocklist` / `ExtensionSettings` (Kapitel 7) |
| Schreibhilfen in Textfeldern (z. B. Umschreiben mit Copilot in Edge) | **Nein** | Browserintern | Edge: `ComposeInlineEnabled` (Kapitel 7.1) |

Teilschutz für alle „Nein“-Zeilen: Der Hinweis beim Kopieren (`copySidebarHint`, siehe [Für Unternehmen, Kapitel 7](fuer-unternehmen.md#7-ki-seitenleisten-und-ki-erweiterungen-sperren)) erinnert daran, dass Seitenleisten nicht geprüft werden; er hält nichts auf. Die Einstellungsseite von AImori nennt diese Grenze unter „Eingebaute KI-Seitenleisten“ in allen sechs Sprachen.

**Geprüft:** Unit-Tests der Seitenerkennung (`tests/content.test.mjs`: nur exakte Hosts, Gross-/Kleinschreibung, Punkt am Ende, keine Doppelgänger, Userinfo, fremde Hosts; Tippen + Enter, Klick auf Senden, „Schutz nicht aktiv“ ohne Feld) und `tests/manifest.test.mjs` (Manifest und Service Worker kennen dieselben Origins). Nicht auf der echten Perplexity-Seite und nicht in Comet gemessen.

**Änderung 17.10.2026 – Rechte:** Perplexity steht neu fest im Manifest (Content Script). Bei einer von Hand installierten Erweiterung kann der Browser sie beim Update deaktivieren, bis der Nutzer der neuen Seite zustimmt; bis dahin ist der Schutz auf allen Seiten aus. Per Richtlinie installierte Erweiterungen sind nicht betroffen. Bestehende Richtlinien mit `allowedSites` ohne `perplexity` sperren Eingaben auf Perplexity (strenger, nie lockerer).

## Was die Erweiterung umsetzt

### Versteckte Anweisungen

Beim **Einfügen, Ablegen (Drag & Drop) und Hochladen** auf den unterstützten KI-Seiten zeigt die Erweiterung einen Hinweis, wenn sie Folgendes findet:

- **Unsichtbare Unicode-Zeichen:** Zero-Width-Zeichen, Bidi-Steuerzeichen, Unicode-Tag-Zeichen. Ausgenommen sind Zeichen, die in Emojis, Flaggen, Schriften mit Schreibrichtung rechts nach links und als BOM normal vorkommen.
- **Versteckter Text in eingefügtem HTML:** `display:none`, `visibility:hidden`, Attribut `hidden`, `opacity: 0`, winzige Schrift, Text in Hintergrundfarbe (z. B. Weiss auf Weiss), weit ausserhalb des sichtbaren Bereichs positioniert.
- **Typische Umgehungs-Sätze** wie „ignore previous instructions“ und ähnliche Formulierungen in 6 Sprachen.
- **Textdokumente** `.txt`, `.md`, `.csv`, `.tsv`, `.json`, `.xml`, `.html`, `.log` bis 2 MB werden vor dem Hochladen auf dieselben Merkmale geprüft; die KI-Seite erhält das Dokument erst danach. Grössere Dokumente gelten als nicht prüfbar (`warn`: Hinweis, `block`: gesperrt).

Der Hinweis nennt nur **Art und Anzahl** der Funde, nie Ausschnitte des Textes. Es wird nichts gespeichert und nichts gesendet.

| Richtlinie | Werte | Standard | Wirkung |
|---|---|---|---|
| `hiddenInstructionScan` | `true`, `false` | `true` | Prüfung ein- oder ausschalten. |
| `hiddenInstructionAction` | `warn`, `block` | `warn` | `warn`: Hinweis, der Benutzer entscheidet. `block`: Einfügen/Hochladen wird gestoppt. |

**Geprüft (Attrappe):** Unit-Tests für alle Merkmale und Ausnahmen (`tests/versteckt.test.mjs`); End-to-End-Schritt `versteckt` (`E2E_NUR=versteckt node scripts/e2e/e2e.mjs`) auf lokalen Attrappen von chatgpt.com, claude.ai, gemini.google.com und copilot.com, mit Sperrtest, dass dabei keine Netzwerk-Anfrage hinausgeht. Nicht auf den echten KI-Seiten und nicht in den Agenten-Browsern gemessen.

Die Prüfung funktioniert in jedem Chromium-Browser, in dem die Erweiterung auf der KI-Seite läuft – auch wenn ein Agent den Text einfügt, denn sie prüft den Inhalt, nicht den Absender.

### Formularwache

Für Seiten, die der Admin per Richtlinie `formGuardSites` (oder der Benutzer in den Einstellungen) einträgt, prüft die Erweiterung **beim Absenden eines Formulars** die Feldinhalte lokal mit derselben Erkennung wie auf den KI-Seiten (IBAN, Ausweisnummern, Schlüssel, eigene Begriffe usw.). Das gilt **egal, wer die Felder ausgefüllt hat** – ein Mensch oder ein KI-Agent im Browser (Comet, Edge Copilot Actions, Chrome Gemini auto browse). Die Erweiterung versucht nicht zu erkennen, ob ein Agent tippt.

- **Rechte:** keine neuen Manifest-Rechte. Je Seite einmal Zugriff per Klick in den Einstellungen (optionale Host-Rechte); Seiten ohne Zugriff nennt die Einstellungsseite ausdrücklich als ungeprüft. Das Skript läuft nur im Hauptframe dieser Seiten und wird bei Entzug oder Listenänderung abgemeldet.
- **Geprüft:** Textfelder, Textbereiche, bearbeitbare Bereiche und Felder, die per `form="…"` zum Formular gehören. **Nicht** geprüft: Passwort-, Datei- und versteckte Felder.
- **Bei Fund:** Absenden gestoppt; ein **eigenes Fenster der Erweiterung** (ausserhalb der Webseite) nennt Seite, Datentyp und Anzahl, nie Werte, mit „Nicht senden“ und „Senden einmal erlauben“ (nur mit `allowUserOverride`). Erlauben gilt 30 Sekunden einmal für genau diesen Inhalt; danach sendet der Benutzer erneut. Höchstens ein Fenster je Tab, höchstens eine Meldung je 3 Sekunden.
- **Daten:** Werte verlassen das Content Script nie; an den Service Worker gehen nur Datentyp und Anzahl. Nichts gespeichert ausser der Seitenliste, kein Netz.

**Grenzen (ehrlich):** Viele Web-Apps senden Daten per Skript (`fetch`/XHR) statt per Formular – das sieht die Formularwache nicht; ebenso `form.submit()` und versteckte Felder. Ein Agent mit Browser-Steuerung kann im Fenster echte Klicks erzeugen: Die Formularwache ist eine **Bremse, keine Sperre**. Für Seiten, auf denen keine Daten eingegeben werden sollen, ist eine Sperre per Browser-Richtlinie (`URLBlocklist`) wirksamer.

**Geprüft (Attrappe):** Unit-Tests (`tests/formwache.test.mjs`, Service-Worker-Prüfungen in `tests/background.test.mjs`) und End-to-End-Schritt `formwache` (`E2E_NUR=formwache node scripts/e2e/e2e.mjs`) auf einem Testformular einer lokalen Attrappe: sauberes Formular geht durch, Fund wird gestoppt, gefälschter Durchlass von einer anderen Erweiterungsseite abgewiesen, kein zweites Fenster bei offenem Fenster, geänderter Inhalt neu geprüft, Netzwerk-Sperrtest. Nicht in echten Agenten-Browsern gemessen.

## Grenzen

- **PDF, DOCX und Bilder** werden nicht auf versteckte Anweisungen geprüft (auch nicht Text in Bildern).
- **Verschleierung** wird nicht erkannt: Base64 oder andere Kodierungen, umschriebene Anweisungen, Sprachen ausserhalb der 6 unterstützten.
- Die Prüfung ist eine **Heuristik, kein Nachweis**: Ein Hinweis kann harmlos sein, ein fehlender Hinweis heisst nicht, dass der Text sauber ist.
- **Seitenkontext und Screenshots**, die der Browser selbst an den Agenten-Dienst schickt (Seitenfenster, interne Kanäle), laufen an jeder Erweiterung vorbei. Das gilt auch für Agenten in einer Cloud-VM.
- **Gesperrte Hosts:** In Atlas lief die Erweiterung auf chatgpt.com nicht (Sekundärquelle; Atlas ist laut Hersteller eingestellt). In Edge laufen Erweiterungen auf Copilot-Hosts nicht (Sekundärquelle, siehe auch [Über](ueber.md)); dort wirkt nur die Browser-Richtlinie.
- **Bestätigungen in der Seite** kann ein Agent mit echten Klicks bedienen. Hinweise und `block` sind deshalb eine Bremse, keine Sperre gegen einen entschlossenen Agenten.
- **`isTrusted` ist kein verlässlicher Agenten-Nachweis:** Agenten, die über Browser-Schnittstellen tippen, erzeugen echte Ereignisse; andere sind nicht dokumentiert. Die Erweiterung versucht nicht, Agenten zu erkennen.
- Verhalten der Erweiterung in den einzelnen Agenten-Browsern ist nicht gemessen (nur Attrappen in Chromium).

## Empfehlungen für Admins

Der wirksamste Hebel liegt beim Browser-Hersteller. Die Erweiterung ergänzt, ersetzt aber nichts davon. Fertige Vorlagen (Edge, Chrome, Intune, GPO) zum Sperren von KI-Seitenleisten und KI-Erweiterungen: [Für Unternehmen, Kapitel 7](fuer-unternehmen.md#7-ki-seitenleisten-und-ki-erweiterungen-sperren).

**Microsoft Edge (laut Hersteller, learn.microsoft.com):**

- `EdgeEntraCopilotPageContext` (ab Edge 130, Boolean): steuert, ob Copilot im Edge-Seitenfenster Seiteninhalt, Verlauf und Video-Transkripte lesen darf, für Entra-Profile, inkl. Microsoft 365 Copilot Chat und Copilot mit Enterprise Data Protection. **Deaktivieren**, wenn Seiteninhalte nicht an Copilot gehen sollen. Ohne Richtlinie: in EU-Regionen aus, sonst an, Benutzer können umschalten. Seiten mit DLP-Schutz liest Copilot laut Hersteller nie.
- `CopilotPageContext` (ab Edge 124, Boolean): dasselbe für Copilot im Seitenfenster ohne Enterprise Data Protection, nur Entra-Profile (nicht für private Microsoft-Konten).
- Beide als Pflicht-Richtlinie setzen (GPO/Intune, `HKLM\SOFTWARE\Policies\Microsoft\Edge`). Wo Erweiterungen nicht laufen, nur Browser-Richtlinien wie `URLBlocklist` verwenden ([Erlaubte KI-Tools](ki-seiten.md)).
- Copilot Actions fragt laut Hersteller bei Kauf, Reservation, Mail-Versand und Löschen nach; Einstellungen wie Modus „Strikt“ oder Sperrlisten für Actions sind nur sekundär belegt – vor dem Einsatz im eigenen Edge prüfen.

**Google Chrome (laut Hersteller, support.google.com):**

- Gemini in Chrome mit Arbeits- oder Schulkonto ist nur nutzbar, wenn der Admin es freigibt. Freigabe in der Google-Admin-Konsole nur bewusst erteilen. Auto browse fragt vor dem Absenden von Formularen und vor Mitteilungen nach; Passwörter gibt der Passwortmanager nicht an Gemini.

**OpenAI (laut Hersteller):**

- Atlas ist laut Suchauszug der Herstellerseite seit dem 09.08.2026 eingestellt (Seite nicht direkt abrufbar, selbst prüfen); verbliebene Installationen entfernen. Die frühere Einstellung „ChatGPT page visibility“ je Website (Sekundärquelle/Suchauszug) ist damit hinfällig.
- Agenten im Cloud-Browser von ChatGPT laufen nicht auf dem Gerät; steuern lässt sich das nur über die Arbeitsbereich-Einstellungen von ChatGPT (Details nicht an Primärquelle geprüft).

**Perplexity Comet:** Für Unternehmen gibt es laut Hersteller eigene Richtlinien und Steuerungen („Comet Policies and Controls“, „Comet for Enterprise“); Inhalt nicht im Einzelnen geprüft.

## Quellen

Alle abgerufen am 2026-10-16. Seiten von help.openai.com lieferten beim Abruf HTTP 403; Inhalte stammen aus Suchauszügen der Herstellerseite.

- learn.microsoft.com, Richtlinie CopilotPageContext (Stand 20.05.2026): https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/copilotpagecontext
- learn.microsoft.com, Richtlinie EdgeEntraCopilotPageContext (Stand 18.08.2026): https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/edgeentracopilotpagecontext
- support.microsoft.com, „Browse with Copilot“ (o. D.): https://support.microsoft.com/en-us/topic/copilot-actions-in-edge-5ed5e17e-42df-40a3-984a-20420eba86e2
- techcommunity.microsoft.com, Edge 150 sperrt Erweiterungen auf *.cloud.microsoft (Forum, 2026): https://techcommunity.microsoft.com/discussions/edgeinsiderenterprise/edge-150-blocks-all-extensions-on--cloud-microsoft-regression-from-149---no-poli/4535027
- support.google.com, Gemini in Chrome auto browse (o. D.): https://support.google.com/chrome/answer/16821166
- blog.google, Sicherheitsarchitektur für Agenten in Chrome (12/2025): https://blog.google/security/architecting-security-for-agentic/
- help.openai.com, ChatGPT Atlas retirement (angekündigt 09.07.2026): https://help.openai.com/en/articles/20001371
- help.openai.com, Ask ChatGPT sidebar und Agent in Atlas (o. D.): https://help.openai.com/en/articles/12628199-using-ask-chatgpt-sidebar-and-chatgpt-agent-on-atlas
- help.openai.com, ChatGPT agent (o. D.): https://help.openai.com/en/articles/11752874-chatgpt-agent
- help.openai.com, Using cloud browser in ChatGPT (o. D.): https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt
- perplexity.ai, Comet Help Center „Extensions“ (o. D.): https://www.perplexity.ai/help-center/comet/en/articles/11734716-extensions
- perplexity.ai, Comet Policies and Controls (o. D.): https://www.perplexity.ai/help-center/en/articles/13529668-comet-policies-and-controls
- Sekundärquellen: superchargebrowser.com (Atlas, Comet, Dia; 2026), softwareseni.com (Comet; 2026), malwarebytes.com (Gemini-Seitenfenster; 03/2026), Vergleichsseiten zu Opera Neon (o. D., schwach)
