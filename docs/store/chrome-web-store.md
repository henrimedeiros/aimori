# Chrome Web Store: Veröffentlichung

Ablauf und alle Texte für den Eintrag im Chrome Web Store. Platzhalter in spitzen Klammern (`<…>`) vor dem Einreichen ersetzen.

## 1. Paket bauen

```
npm ci --ignore-scripts
node scripts/pack-store.mjs
```

Das Skript baut Texterkennung und lokale KI aus den gepinnten Quellen, erzeugt ADMX/ADML und Doku neu, führt `npm run check` und alle Tests aus und schreibt `dist/aimori-<version>-chrome.zip` (ohne Manifest-Feld `key`, mit `LICENSE.txt`) samt SHA-256. Bricht ein Schritt ab, wird kein Paket geschrieben.

**Erste Einreichung und Erweiterungs-ID:** Eingereicht am 18.10.2026 ohne Schlüssel; der Store hat die ID `lefajbhockjgdhaohnacgaggfepianjh` vergeben. Die Richtlinien-Vorlagen (`enterprise/admx/`) und Beispiele nutzen diese Store-ID (`STORE_ID` in `scripts/build-admx.mjs`). Die entpackte Entwicklungsfassung behält ihre ID `hfgcdbigpgpdoegkhfbbbnibnkpdjkbb` aus dem Manifest-Feld `key` ([Für Unternehmen](../fuer-unternehmen.md)).

## 2. Eintrag (Store listing)

| Feld | Wert |
|---|---|
| Name | AImori (aus `_locales`, in allen Sprachen gleich) |
| Kurzbeschreibung | aus `_locales/*/messages.json` (`extDescription`), höchstens 132 Zeichen |
| Kategorie | Privacy & Security |
| Sprachen | Englisch (Standard), Deutsch, Französisch, Italienisch, Portugiesisch, Spanisch |
| Website | https://github.com/henrimedeiros/aimori |
| Support | https://github.com/henrimedeiros/aimori/issues |
| Datenschutzerklärung | öffentliche URL von [PRIVACY.md](../../PRIVACY.md), https://github.com/henrimedeiros/aimori/blob/main/PRIVACY.md |

### Ausführliche Beschreibung (Englisch)

```
AImori – the guardian for your AI prompts.

AImori checks what you type, paste or upload into AI chats for sensitive data – locally in your browser, before anything is sent. No server, no account, no telemetry: the extension has no network access at all.

What AImori detects
• Bank and card data: IBANs, credit card numbers (with checksums)
• National ID, social security and tax numbers of many countries
• Passport lines (MRZ), dates of birth, contact data
• API keys, passwords, tokens and other secrets – also inside pasted code
• Health data, HR records and customer lists in context
• Optional: names, companies and addresses with a local AI model, and text in pasted screenshots (local text recognition)

What you can do
• Redact with one click, or replace values with placeholders like [IBAN_1] and read the AI answer with the real values inside the extension
• Edit your prompt or, if allowed, send anyway
• See whether an AI site uses your chats for training by default, with a link to the opt-out

Supported sites: ChatGPT, Claude, Gemini, Microsoft Copilot and Microsoft 365 Copilot. On over 60 other AI sites, organisations can show a notice or block the site (optional permission).

For organisations
• Central management via Group Policy (ADMX), Intune or registry
• White-label: your name, logo and colours
• Allowed and blocked AI tools, rules for business and personal accounts
• Protect your own terms (customer names, project code names) as salted hashes
• Numbers-only reports for GDPR, Swiss FADP, HIPAA, ISO 27001 and EU AI Act Art. 4

Privacy
Your prompts never leave your device. AImori stores only daily counters (site, category, decision) for 90 days – never your text, matches or file names.

Open source under the GNU AGPL v3: https://github.com/henrimedeiros/aimori

AImori helps against mistakes. It is not a complete data loss prevention system: desktop and mobile apps of AI providers and deliberately disguised data are not covered.
```

### Ausführliche Beschreibung (Deutsch)

```
AImori – der Wächter für deine KI-Prompts.

AImori prüft, was du in KI-Chats tippst, einfügst oder hochlädst, auf sensible Daten – lokal im Browser, bevor etwas gesendet wird. Kein Server, kein Konto, keine Telemetrie: Die Erweiterung hat keinerlei Netzwerkzugriff.

Was AImori erkennt
• Bank- und Kartendaten: IBAN, Kreditkartennummern (mit Prüfziffern)
• AHV-, Sozialversicherungs-, Steuer- und Ausweisnummern vieler Länder
• Passzeilen (MRZ), Geburtsdaten, Kontaktdaten
• API-Schlüssel, Passwörter, Tokens und andere Geheimnisse – auch in eingefügtem Code
• Gesundheitsdaten, Personaldaten und Kundenlisten im Zusammenhang
• Optional: Namen, Firmen und Adressen per lokaler KI sowie Text in eingefügten Screenshots (lokale Texterkennung)

Was du tun kannst
• Mit einem Klick schwärzen oder Werte durch Platzhalter wie [IBAN_1] ersetzen und die Antwort der KI in der Erweiterung mit den echten Werten lesen
• Den Prompt bearbeiten oder, falls erlaubt, trotzdem senden
• Sehen, ob eine KI-Seite deine Chats standardmässig zum Training nutzt – mit Link zum Abschalten

Unterstützte Seiten: ChatGPT, Claude, Gemini, Microsoft Copilot und Microsoft 365 Copilot. Auf über 60 weiteren KI-Seiten können Organisationen einen Hinweis zeigen oder die Seite sperren (optionale Berechtigung).

Für Unternehmen
• Zentrale Verwaltung per Gruppenrichtlinie (ADMX), Intune oder Registry
• Whitelabel: eigener Name, Logo und Farben
• Freigegebene und gesperrte KI-Tools, Regeln für Firmen- und Privatkonten
• Eigene Begriffe (Kundennamen, Projekt-Codenamen) als gesalzene Prüfsummen schützen
• Berichte nur mit Zahlen für revDSG, DSGVO, HIPAA, ISO 27001 und EU AI Act Art. 4

Datenschutz
Deine Prompts verlassen dein Gerät nie. AImori speichert nur Tageszähler (Seite, Kategorie, Entscheidung) für 90 Tage – nie Texte, Funde oder Dateinamen.

Open Source unter der GNU AGPL v3: https://github.com/henrimedeiros/aimori

AImori hilft gegen Versehen. Es ist kein vollständiges DLP-System: Desktop- und Handy-Apps der KI-Anbieter und absichtlich verschleierte Daten sind nicht abgedeckt.
```

### Bilder

| Bild | Grösse | Stand |
|---|---|---|
| Symbol | 128 × 128 PNG | `extension/icons/icon128.png` |
| Screenshots Englisch (1–4) | 1280 × 800 PNG | [Leiste beim Senden](bilder/screenshot-en-1-senden.png), [Hinweis beim Tippen](bilder/screenshot-en-2-tippen.png), [Popup](bilder/screenshot-en-3-popup.png), [Einstellungen](bilder/screenshot-en-4-einstellungen.png) |
| Screenshots Deutsch (1–4) | 1280 × 800 PNG | [Leiste beim Senden](bilder/screenshot-de-1-senden.png), [Hinweis beim Tippen](bilder/screenshot-de-2-tippen.png), [Popup](bilder/screenshot-de-3-popup.png), [Einstellungen](bilder/screenshot-de-4-einstellungen.png) |
| Kleine Werbekachel | 440 × 280 PNG (Pflicht) | [kachel-klein-440x280.png](bilder/kachel-klein-440x280.png) |
| Grosse Werbekachel | 1400 × 560 PNG (optional) | [kachel-gross-1400x560.png](bilder/kachel-gross-1400x560.png) |

Die englischen Bilder gehören zum Standard-Eintrag, die deutschen zum deutschen Eintrag. Alle Bilder sind 24-Bit-PNG ohne Alphakanal und ohne Text-Metadaten (geprüft von `tests/store-bilder.test.mjs`).

Bilder nur aus den Attrappen der E2E-Prüfung (Wegwerf-Profil, synthetische Testwerte), nie von echten Konten. Neu erzeugen (hell, Englisch und Deutsch, Popup über der Attrappe auf 1280 × 800, Kacheln aus Signet, Wortmarke und Schriften der Erweiterung; Popup und Einstellungen zeigen den Status der lokalen KI, dafür vorher `node scripts/build-ki.mjs`):

```
E2E_BILDER=docs/store/bilder E2E_NUR=store node scripts/e2e/e2e.mjs
```

## 3. Datenschutz-Angaben (Privacy practices)

**Einziger Zweck (single purpose):**
> AImori checks prompts, pasted content and uploads on AI sites locally for sensitive data and lets the user redact them before they are sent.

**Begründung je Berechtigung:**

| Berechtigung | Begründung (Englisch, für das Formular) |
|---|---|
| `storage` | Stores the user's settings and local daily counters (site, data category, decision) on the device. No prompt content is stored. |
| `scripting` | Registers optional scripts only after the user grants the matching optional host permission in the settings: the notice or block on AI sites the organisation has not approved, the copy notice, marking text copied from confidential source pages, and the form check on sites the user adds. |
| `offscreen` | Runs local text recognition for pasted images and the bundled local AI model in an offscreen document (Web Workers). Nothing is sent over the network. |
| `activeTab` | When the user clicks the toolbar icon, the popup recognises which AI site the current tab shows to display its training indicator. The address is not stored. |
| `declarativeContent` | Lets the browser colour the toolbar icon on known AI sites without the extension reading the address. |
| Host-Zugriff (Content Scripts auf chatgpt.com, claude.ai, gemini.google.com, copilot.microsoft.com, copilot.com, copilot.cloud.microsoft, m365.cloud.microsoft) | Checks the text in the chat input locally before it is sent, which is the core function. |
| Optionale Host-Rechte (weitere KI-Seiten, `https://*/*`) | Requested only on a click in the settings, after an explanation: AI site control, copy notice, confidential sources, form check. |

**Remote Code:** Nein. Alle Skripte, WebAssembly-Dateien und das Modell liegen im Paket; die CSP erlaubt nur `'self'` und `'wasm-unsafe-eval'` (für die mitgelieferte WebAssembly).

**Datennutzung:** Keine der Datenkategorien ankreuzen – AImori erhebt und überträgt keine Daten. Die drei Bestätigungen (kein Verkauf an Dritte, keine Nutzung ausserhalb des Zwecks, keine Bonitätsprüfung) ankreuzen.

## 4. Vor dem Einreichen prüfen

- [ ] Platzhalter in `README.md`, `PRIVACY.md`, `SECURITY.md`, `.github/CODEOWNERS` und hier ersetzt
- [ ] `PRIVACY.md` unter einer öffentlichen URL erreichbar
- [ ] Version in `extension/manifest.json` gesetzt; jede neue Einreichung braucht eine höhere Version
- [ ] `node scripts/pack-store.mjs` ohne Fehler, ZIP unter 2 GB (das Paket ist wegen des lokalen Modells gross)
- [ ] ZIP entpackt einmal in Chrome geladen und auf den Attrappen geprüft (`node scripts/e2e/e2e.mjs`)
- [ ] Namensrechte der Marke geprüft
- [ ] Bilder und Werbekachel hochgeladen
- [ ] Nach der Freigabe: Store-URL in `README.md` eintragen; bei neuer ID die Richtlinien-Vorlagen neu erzeugen
