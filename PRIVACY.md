# Privacy Policy – AImori

Effective date: `<DATUM-DER-VEROEFFENTLICHUNG>`
Publisher: `<NAME-ODER-ORGANISATION>`, contact: `<KONTAKT-EMAIL>`

AImori is a browser extension that checks text, pasted content and images you enter on AI sites for sensitive data. **All checks run locally in your browser.** AImori has no server and no network access (the extension's content security policy sets `connect-src 'none'`, and tests enforce that the code contains no network calls).

## What AImori does not do

- It does **not** collect, transmit, sell or share any personal data or any content you type, paste or upload.
- It does **not** use analytics, telemetry, advertising, tracking or remote code.
- It does **not** store your prompts, detected values, file names or browsing history.
- It does **not** read cookies, passwords, chat histories or AI answers for any purpose other than the local checks described below.

## What is processed locally

| Data | Purpose | Where and how long |
|---|---|---|
| Text, pasted content, dropped files and images on supported AI sites | Local check for sensitive data before sending | Only in memory while the check runs; never stored |
| Daily counters (AI site, data category, decision such as "redacted") | Statistics shown in the popup and options page | `chrome.storage.local` on your device, deleted after 90 days |
| Monthly counters per data-type group | Optional AI literacy record (EU AI Act Art. 4) | `chrome.storage.local`, deleted after 13 months; can be turned off |
| Your settings and your own protected terms | Configuration | `chrome.storage.local`; own terms only as salted hashes, never in plain text |
| Placeholder values (e.g. `[IBAN_1]` → original value) | Showing the AI answer with real values inside the extension | Only in memory of the current tab; never stored |
| Account type of a tab (business/personal/unknown) and AI model status | Rules per account, status display | `chrome.storage.session`, cleared when the browser closes |
| Policies set by your organisation | Central management | Read from `chrome.storage.managed` (set by your administrator) |

Nothing of this leaves your device. AImori has no way to send it anywhere, and neither the developers nor your administrator can retrieve your content through AImori.

## Permissions

- `storage`: settings and local counters as listed above.
- `scripting` and optional host permissions: only after you grant them in the settings – show a notice or block on AI sites your organisation has not approved, a notice when you copy sensitive data, marking text copied from confidential sources, and the form check on sites you add.
- `offscreen`: run text recognition and the local AI model in a hidden extension page on your device.
- `activeTab`: when you click the toolbar icon, the popup recognises which AI site the current tab shows. The address is not stored.
- `declarativeContent`: the browser colours the toolbar icon on known AI sites; the extension does not see the address.

## Children

AImori is not directed at children and does not knowingly process children's data.

## Changes

Changes to this policy are published in the source repository (`<GITHUB-REPO-URL>`) and take effect with the next extension version.

## Contact

Questions about privacy: `<KONTAKT-EMAIL>`.

---

# Datenschutzerklärung – AImori (Deutsch)

AImori prüft Eingaben auf KI-Seiten **ausschliesslich lokal im Browser** auf sensible Daten. Die Erweiterung hat keinen Server und keinen Netzwerkzugriff.

- Es werden **keine** personenbezogenen Daten oder Inhalte erhoben, übertragen, verkauft oder weitergegeben; keine Analyse, Telemetrie, Werbung oder Nachverfolgung.
- Eingaben, gefundene Werte, Dateinamen und besuchte Adressen werden **nicht gespeichert**. Geprüft wird nur im Arbeitsspeicher, solange die Prüfung läuft.
- Lokal auf dem Gerät gespeichert werden nur: Tageszähler (Seite, Kategorie, Entscheidung; 90 Tage), optional Monatszähler für den KI-Kompetenz-Nachweis (13 Monate, abschaltbar), Einstellungen, eigene Begriffe nur als gesalzene Prüfsummen sowie während der Browser-Sitzung die Kontoart je Tab und der Status der lokalen KI.
- Richtlinien Ihrer Organisation werden aus `chrome.storage.managed` gelesen.
- Nichts davon verlässt das Gerät. Weder die Entwickler noch Ihre IT können über AImori Inhalte abrufen.

Verantwortlich: `<NAME-ODER-ORGANISATION>`, Kontakt: `<KONTAKT-EMAIL>`.
