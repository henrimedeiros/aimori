// Einzige Stelle mit dem Produktnamen im Code (zusammen mit _locales/*).
// Namenswechsel: hier und in _locales/*/messages.json aendern, danach
// `npm run build` (ADMX/ADML werden neu erzeugt). Per Richtlinie
// `branding` laesst sich alles zur Laufzeit ueberschreiben (Whitelabel).
(function (g) {
  'use strict';
  const DLX = g.DLX || (g.DLX = {});
  DLX.branding = Object.freeze({
    productName: 'AImori',
    companyName: '',
    logo: '',
    // Leer = Farben der Design-Tokens (ui/tokens.css); Whitelabel setzt #rrggbb.
    primaryColor: '',
    accentColor: '',
    supportUrl: '',
    supportText: '',
    // Hinweis auf nicht freigegebenen KI-Seiten (Richtlinie aiSiteMode); leer = Standardtext.
    aiNoticeText: '',
    aiNoticeUrl: '',
    aiNoticeLinkText: '',
  });
})(globalThis);
