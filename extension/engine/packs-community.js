// Automatisch erzeugt aus muster/katalog.json mit `node scripts/muster.mjs bauen` - nicht von Hand aendern.
// Katalog 2026.10.16-1, SHA-256 40ccddc5f1e7ce481e1d2ef44cd0186319bf74d0300e7819dcbff25c80e69471, signiert mit Schluessel 8ce769d5caa436c5b23c26edce22219a4feff928ca87247fb6e07185676ed959 (dev).
// Nur Daten: Regex-Quellen werden in engine/muster.js statisch geprueft (safeRegex), nichts wird nachgeladen.
(function (g) {
  'use strict';
  g.DLX.muster.register({
   "version": "2026.10.16-1",
   "muster": [
    {
     "id": "cm_tailscale_key",
     "name": {
      "de": "Tailscale-Schlüssel",
      "en": "Tailscale key"
     },
     "cat": "technik",
     "cls": "hoch",
     "regex": "\\btskey-(?:auth|api|client)-[A-Za-z0-9]{10,24}-[A-Za-z0-9]{24,40}\\b",
     "flags": "",
     "validator": "keiner",
     "ohneKontextSicher": true
    },
    {
     "id": "cm_figma_token",
     "name": {
      "de": "Figma-Zugangstoken",
      "en": "Figma access token"
     },
     "cat": "technik",
     "cls": "hoch",
     "regex": "\\bfigd_[A-Za-z0-9_-]{38,44}",
     "flags": "",
     "validator": "keiner",
     "ohneKontextSicher": true
    },
    {
     "id": "cm_rubygems_key",
     "name": {
      "de": "RubyGems-API-Schlüssel",
      "en": "RubyGems API key"
     },
     "cat": "technik",
     "cls": "hoch",
     "regex": "\\brubygems_[a-f0-9]{48}\\b",
     "flags": "",
     "validator": "keiner",
     "ohneKontextSicher": true
    }
   ]
  });
})(globalThis);
