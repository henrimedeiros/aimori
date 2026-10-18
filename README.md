<p align="center">
  <img src="docs/store/bilder/kachel-gross-1400x560.png" alt="AImori – The guardian for your AI prompts. Runs locally, no account, no telemetry, open source." width="100%">
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/lefajbhockjgdhaohnacgaggfepianjh"><img src="https://img.shields.io/badge/Chrome%20Web%20Store-AImori-F0244F?logo=googlechrome&logoColor=white" alt="Chrome Web Store"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-FF7A3D" alt="License: AGPL-3.0"></a>
  <img src="https://img.shields.io/badge/Manifest-V3-1C1C20" alt="Manifest V3">
  <img src="https://img.shields.io/badge/network%20access-none-1C1C20" alt="Network access: none">
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#features">Features</a> ·
  <a href="#for-organisations">For organisations</a> ·
  <a href="#build-and-test">Build</a> ·
  <a href="LIESMICH.md">Deutsch</a>
</p>

**AImori checks what you type, paste or upload into AI chats for sensitive data – locally in your browser, before anything is sent.** IBANs, card numbers, ID and tax numbers, API keys, health data: AImori stops the send, shows what it found and lets you redact it with one click.

No server, no account, no telemetry. The extension has no network access at all (`connect-src 'none'`, enforced by tests).

## Install

| | |
|---|---|
| **Chrome and Edge** | [**Add AImori from the Chrome Web Store**](https://chromewebstore.google.com/detail/lefajbhockjgdhaohnacgaggfepianjh) (the listing goes live once Google's review is complete). In Edge, allow extensions from other stores when asked. |
| **Organisations** | Force-install with the extension ID `lefajbhockjgdhaohnacgaggfepianjh` via Group Policy, Intune or the registry, see [for organisations](#for-organisations). |
| **From source** | Build first (see [Build and test](#build-and-test)), then `chrome://extensions` or `edge://extensions` → developer mode → "Load unpacked" → select the `extension` folder. Details: [installation](docs/installation.md). |

## How it works

1. **You type, paste or drop a file** into ChatGPT, Claude, Gemini or Copilot.
2. **AImori checks it on your device** – with checksums where they exist, a local AI model and local text recognition for images. Nothing leaves the browser.
3. **You decide:** redact, replace values with placeholders like `[IBAN_1]`, edit, or – if your organisation allows it – send anyway.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/store/bilder/screenshot-en-1-senden.png" alt="Sending paused: AImori detected an IBAN in a chat message and offers to redact it"></td>
    <td width="50%"><img src="docs/store/bilder/screenshot-en-2-tippen.png" alt="While typing, AImori points out the IBAN before the message is sent"></td>
  </tr>
  <tr>
    <td><b>Sending paused.</b> AImori shows what it found and why it matters, and redacts it with one click.</td>
    <td><b>Notice while typing.</b> A quiet hint as soon as sensitive data appears in the input.</td>
  </tr>
  <tr>
    <td><img src="docs/store/bilder/screenshot-en-3-popup.png" alt="Toolbar popup with protection status, detection counters and the AI training indicator for ChatGPT"></td>
    <td><img src="docs/store/bilder/screenshot-en-4-einstellungen.png" alt="Settings overview with protection status, local AI status and language"></td>
  </tr>
  <tr>
    <td><b>Popup.</b> Protection status, local counters and whether the AI site trains on your chats by default, with a link to the opt-out.</td>
    <td><b>Settings.</b> Detection, sites and exceptions, images and files, privacy – all searchable.</td>
  </tr>
</table>

<sub>Screenshots show a demo chat page with synthetic test values.</sub>

## Features

| | |
|---|---|
| **What it detects** | Over 200 data types with checksums where they exist: IBANs and credit cards, national ID, social security and tax numbers of many countries, passport lines (MRZ), dates of birth, contact data, API keys, passwords and tokens – also inside pasted code. Health data, HR records and customer lists in context. Full list: [data types](docs/datentypen.md). |
| **Local AI and images** | Optional detection of names, companies and addresses with a bundled ONNX model, and text recognition in pasted screenshots with bundled Tesseract. Both run offline in your browser. |
| **What you can do** | Redact, use [placeholders](docs/platzhalter.md) and read the AI answer with the real values inside the extension, edit the prompt, or send anyway if allowed. |
| **AI training indicator** | Shows whether the current AI site uses your chats for training by default, with a direct link to the opt-out. |
| **Where it works** | ChatGPT, Claude, Gemini, Microsoft Copilot and Microsoft 365 Copilot. On over 60 other AI sites, organisations can show a notice or block the site (optional permission). |
| **Languages** | English, German, French, Italian, Portuguese, Spanish. |

## Privacy

Your prompts never leave your device. AImori stores only daily counters (site, data category, decision) for 90 days – never your text, matches or file names. There is no server to send anything to. Details: [PRIVACY.md](PRIVACY.md).

AImori helps against mistakes. It is not a full data loss prevention system: desktop and mobile apps of AI providers, other browsers and deliberately disguised data are out of scope. More in [what it does and what it does not](docs/ueber.md).

## For organisations

- **Central management** via Group Policy (ADMX/ADML for Chrome and Edge), Intune or registry scripts: [GPO](docs/deployment/gpo.md) · [Intune](docs/deployment/intune.md) · [registry scripts](docs/deployment/registry-skripte.md) · [all policy keys](docs/einstellungen.md).
- **White-label:** your own name, logo and colours per policy ([branding](docs/branding.md)), also per customer for MSPs ([rollout guide](docs/fuer-unternehmen.md)).
- **Allowed and blocked AI tools**, [rules for business and personal accounts](docs/konto-regeln.md) of the same AI.
- **Your own terms** – customer names, project code names, internal domains – protected as salted hashes ([own terms](docs/eigene-begriffe.md)).
- **Numbers-only reports** for GDPR, Swiss FADP, HIPAA, ISO 27001 and Art. 4 EU AI Act ([compliance](docs/compliance/README.md)).

Chrome Web Store extension ID: `lefajbhockjgdhaohnacgaggfepianjh`

## Build and test

Requires Node.js 20 or newer. Package install scripts are never run (`.npmrc` sets `ignore-scripts=true`).

```bash
npm ci --ignore-scripts
node scripts/build-ocr.mjs
node scripts/build-ki.mjs
npm test
npm run check
```

`npm run build` regenerates the ADMX/ADML templates and the generated docs. `node scripts/pack-store.mjs` builds, verifies and writes the Chrome Web Store package to `dist/` ([store guide](docs/store/chrome-web-store.md)).

<details>
<summary><b>Repository layout</b></summary>

| Folder | Content |
|---|---|
| `extension/` | The extension: manifest, detection engine, content scripts, UI, locales (en, de, fr, it, pt, es) |
| `enterprise/` | ADMX/ADML templates, PowerShell deploy/detect/remove scripts, example policies |
| `muster/` | Signed community pattern catalogue |
| `scripts/` | Build, check, packaging and end-to-end test scripts |
| `tests/` | Unit tests (`node:test`) |
| `docs/` | Documentation (German), overview in [docs/README.md](docs/README.md) |

</details>

## Contributing

Detection patterns are welcome as pull requests to `muster/katalog.json` ([how it works](docs/muster-mitmachen.md)); for code, please open an issue first. See [CONTRIBUTING.md](CONTRIBUTING.md).

Found a security issue? Please follow [SECURITY.md](SECURITY.md) and do not open a public issue. Questions and bugs: [issues](https://github.com/henrimedeiros/aimori/issues).

## License

Copyright (C) 2026 The AImori authors.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, version 3. It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY. See [LICENSE](LICENSE).

Bundled third-party components (Tesseract, ONNX Runtime Web, tokenizers, model, fonts) keep their own licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
