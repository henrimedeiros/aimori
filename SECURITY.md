# Security Policy

AImori protects sensitive data, so we take security reports seriously.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately instead:

- GitHub: "Report a vulnerability" (private security advisory) in this repository, or
- e-mail: `<KONTAKT-EMAIL>`

Please include the affected version, the browser and version, steps to reproduce and the impact you expect. Use only synthetic test data (for example official sample IBANs), never real personal or customer data.

We aim to confirm your report within 7 days and to agree on a disclosure date with you. Please give us reasonable time to release a fix before you publish details.

## Scope

In scope: the extension in `extension/`, the build and packaging scripts in `scripts/`, the policy templates in `enterprise/` and the pattern catalogue in `muster/`.

Especially relevant:

- any way the extension sends data over the network or stores prompt text,
- an AI site reading values the extension shows (dialog, placeholder view) or bypassing the check before sending,
- injection through policies, white-label settings or pattern catalogue entries,
- supply-chain issues in the pinned build inputs (`PINS.json`, `package-lock.json`).

Out of scope: limits that are documented as such (see [docs/ueber.md](docs/ueber.md)), for example desktop apps of AI providers or deliberately disguised data.

## Supported versions

Only the latest version published in the Chrome Web Store receives security fixes.

---

# Sicherheitsrichtlinie (Deutsch)

Sicherheitslücken bitte **nicht als öffentliches Issue** melden, sondern vertraulich über „Report a vulnerability“ in diesem Repository oder per E-Mail an `<KONTAKT-EMAIL>`. Bitte Version, Browser, Schritte zum Nachstellen und erwartete Auswirkung angeben und nur synthetische Testdaten verwenden. Wir bestätigen Meldungen innerhalb von 7 Tagen und stimmen den Veröffentlichungstermin mit Ihnen ab.
