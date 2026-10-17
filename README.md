# AImori

**The guardian for your AI prompts.** AImori is a browser extension for Chrome and Edge (Manifest V3) that checks what you type, paste or upload into AI chats for sensitive data, **locally on your device**, before it is sent.

- **No network access.** The extension has no server, no account, no telemetry and no network code (`connect-src 'none'`, enforced by tests).
- **Nothing is stored.** Only daily counters (site, category, decision) stay in your browser for 90 days. Your text, matches and file names are never stored.
- **Open source** under the [GNU Affero General Public License v3.0](LICENSE).

German documentation: [LIESMICH.md](LIESMICH.md) · [docs/](docs/README.md)

## What it does

- Checks every prompt on ChatGPT, Claude, Gemini, Microsoft Copilot and Microsoft 365 Copilot before it is sent or pasted (Enter, send button, paste, drag and drop).
- Detects over 200 data types with checksums where they exist: IBANs, credit cards, national ID, social security and tax numbers of many countries, passport lines (MRZ), API keys and secrets, contact data, health data in context. See the [list of data types](docs/datentypen.md).
- Optional local AI detection of names, companies and addresses (bundled ONNX model, runs offline) and text recognition in pasted images (bundled Tesseract).
- Lets you **redact**, replace values with **placeholders** like `[IBAN_1]`, edit, or (if allowed) send anyway.
- Shows a training indicator: whether the AI site uses your chats for training by default, with a link to the opt-out.
- For organisations: managed via Group Policy (ADMX), Intune or the registry; white-label (name, logo, colours); allowed and blocked AI sites; rules per account type; own protected terms as salted hashes; numbers-only compliance reports.

AImori helps against mistakes. It is not a full DLP system: desktop and mobile apps of AI providers, other browsers and deliberately disguised data are out of scope. Details: [what it does and what it does not](docs/ueber.md).

## Install

- **Chrome Web Store:** `<STORE-URL>`
- **From source (unpacked):** `chrome://extensions` or `edge://extensions` → developer mode → "Load unpacked" → select the `extension` folder. Text recognition and the local AI model are build outputs and must be built first (see below).

## Build and test

Requires Node.js 20 or newer. Package install scripts are never run (`.npmrc` sets `ignore-scripts=true`).

```bash
npm ci --ignore-scripts
node scripts/build-ocr.mjs
node scripts/build-ki.mjs
npm test
npm run check
```

`npm run build` regenerates the ADMX/ADML templates and the generated docs. `node scripts/pack-store.mjs` builds, verifies and writes the Chrome Web Store package to `dist/`.

| Folder | Content |
|---|---|
| `extension/` | The extension: manifest, detection engine, content scripts, UI, locales (en, de, fr, it, pt, es) |
| `enterprise/` | ADMX/ADML templates, PowerShell deploy/detect/remove scripts, example policies |
| `muster/` | Signed community pattern catalogue |
| `scripts/` | Build, check, packaging and end-to-end test scripts |
| `tests/` | Unit tests (`node:test`) |
| `docs/` | Documentation (German) |

## Contributing

Detection patterns are welcome as pull requests to `muster/katalog.json`; for code, please open an issue first. See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: please follow [SECURITY.md](SECURITY.md) and do not open a public issue.

## Privacy

See [PRIVACY.md](PRIVACY.md).

## License

Copyright (C) 2026 The AImori authors.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, version 3. It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY. See [LICENSE](LICENSE).

Bundled third-party components (Tesseract, ONNX Runtime Web, tokenizers, model, fonts) keep their own licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
