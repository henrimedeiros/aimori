// Globales Paket: Technik, Zugangsdaten, Schluessel.
// Formate nach den oeffentlichen Anbieter-Dokumentationen; Liste der Anbieter
// angelehnt an gitleaks (MIT, siehe THIRD_PARTY_NOTICES.md). Muster selbst
// geschrieben, alle Quantoren begrenzt (Design-Review Geheimnisse/Vermerke 14.10.2026).
(function (g) {
  'use strict';
  const DLX = g.DLX;

  // Platzhalter nur, wenn der GANZE Wert einer ist (Auflage 6): ein Teilwort wie
  // "example" in einem echten Schluessel stellt ihn nicht frei.
  const PLACEHOLDER = new RegExp('^(?:\\*{3,}|[xX]{3,}|\\.{3,}|-{3,}|_{3,}|0{6,}|' +
    'changeme|change[_-]me|replace[_-]?me|password|passwort|secret|example|sample|dummy|test|todo|tbd|fixme|' +
    'null|nil|none|undefined|true|false|redacted|\\[redacted\\]|' +
    '<[^<>\\r\\n]{1,80}>|\\$\\{[^}\\r\\n]{1,80}\\}|\\$\\{\\{[^}\\r\\n]{1,80}\\}\\}|\\{\\{[^}\\r\\n]{1,80}\\}\\}|%[^%\\s]{1,80}%|\\$[A-Za-z_][A-Za-z0-9_]{0,80}|' +
    // Pflicht-Trenner zwischen Wortgruppen: eindeutig, kein Backtracking (Pflicht-Pruefung 14.10.2026).
    '(?:your|insert|enter)(?:[-_ ]?[A-Za-z]{1,20})(?:[-_ ][A-Za-z]{1,20}){0,6}|[A-Za-z]{1,20}(?:[-_][A-Za-z]{1,20}){0,6}[-_]here|' +
    '[xX*]{2,}(?:[-_.:][xX*]{2,}){1,10})$', 'i');
  // Dokumentierte Beispielwerte (AWS-Dokumentation) - exakt, nie als Teilwort.
  const DOC_SAMPLES = new Set(['AKIA' + 'IOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/' + 'bPxRfiCYEXAMPLEKEY']);
  const isPlaceholder = (v) => PLACEHOLDER.test(v) || DOC_SAMPLES.has(v);

  // Shannon-Entropie in Bit je Zeichen.
  function entropy(s) {
    const n = new Map();
    for (const ch of s) n.set(ch, (n.get(ch) || 0) + 1);
    let e = 0;
    for (const c of n.values()) { const p = c / s.length; e -= p * Math.log2(p); }
    return e;
  }

  function secretValueOk(v) {
    if (isPlaceholder(v)) return false;
    if (/^\d+$/.test(v) && v.length < 6) return false;
    return new Set(v).size >= 4;
  }

  // Anbieter-Schluessel mit fester Struktur: nur Fuellwerte (xxxx, 0000, abab)
  // fallen heraus; ein zufaelliger Schluessel liegt weit ueber 3 Bit je Zeichen.
  const keyOk = (v) => !isPlaceholder(v) && entropy(v) >= 3;

  // Werte, die im Code eine Variable/ein Aufruf sind, kein Geheimnis:
  // process.env.X, config["x"], getPassword(), user_password, newPassword.
  function codeRef(v) {
    if (/^[A-Za-z_$][\w$]*(?:(?:\.|->|::)[A-Za-z_$][\w$]*)*(?:[(\[][^\s]*)?[;,)]*$/.test(v) &&
      (/\.|->|::|[(\[]|;$/.test(v) || /^[a-z]{2,}(?:_[a-z]{2,})+$/.test(v) || /^[a-z]{2,}(?:[A-Z][a-z]{2,})+$/.test(v))) return true;
    return false;
  }

  // Passwort/Geheimnis in Konfiguration: Wert in Anfuehrungszeichen = Literal;
  // ohne Anfuehrungszeichen keine Code-Verweise.
  function cfgValueOk(v, gr) {
    if (!secretValueOk(v)) return false;
    if (gr && gr.q) return true;
    return !codeRef(v) && !/^(?:\/|\.{1,2}\/|~\/|[A-Za-z]:\\)/.test(v);
  }

  // .env-Zeile: Name in GROSSBUCHSTABEN (Konvention; klein = cfg_password) mit Geheimnis-Wort; Namen fuer Laenge, Datei, URL usw. und
  // Werte wie Pfade/URLs/Zahlen fallen heraus.
  const ENV_SKIP_NAME = /(?:^|[_.])(?:FILE|PATH|DIR|NAME|TYPE|HEADER|ENABLED|REQUIRED|LENGTH|LEN|TTL|EXPIRY|EXPIRES|EXPIRATION|TIMEOUT|LIFETIME|URL|URI|ENDPOINT|HOST|PORT|ISSUER|AUDIENCE|ALGORITHM|ALG|POLICY|MODE|PROVIDER|FIELD|PARAM|ID|USER|USERNAME|VERSION|PREFIX|SCOPE|SCOPES|REGION|COUNT|MIN|MAX|SIZE|STRATEGY|KIND|FORMAT|ROTATION|DAYS|HOURS|MINUTES|SECONDS|MS)$/i;
  const ENV_KEEP_NAME = /(?:DATABASE|DB|CONNECTION|CONN|WEBHOOK|DSN|REDIS|MONGO|AMQP|BROKER)(?:[_.](?:URL|URI))?$/i;
  function envValueOk(v, gr) {
    const k = gr && gr.k ? gr.k : '';
    if (ENV_SKIP_NAME.test(k) && !ENV_KEEP_NAME.test(k)) return false;
    if (/^(?:\/|\.{1,2}\/|~\/|[A-Za-z]:\\)/.test(v)) return false;
    if (/^https?:\/\//i.test(v) && !/WEBHOOK/i.test(k) && !/:[^\s/@]{1,200}@/.test(v)) return false;
    if (/^(?:on|off|yes|no|enabled|disabled|required|optional|bearer|basic|hs256|rs256|es256|plain|sha256|aes-256-gcm)$/i.test(v)) return false;
    return cfgValueOk(v, gr);
  }

  // JSON Web Token: Kopf muss JSON mit "alg" sein, Nutzdaten ein JSON-Objekt.
  // Laengengrenze vor dem Dekodieren, alles in try/catch, Inhalt wird nicht
  // gehalten (Auflage 5). Eigener base64url-Dekodierer (kein atob noetig).
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64urlText(s) {
    if (s.length > 8192 || s.length % 4 === 1) return null;
    let out = '', buf = 0, bits = 0;
    for (const ch of s) {
      const v = B64.indexOf(ch);
      if (v < 0) return null;
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 0xff); }
    }
    return out;
  }
  function jwtOk(v) {
    const p = v.split('.');
    if (p.length !== 3) return false;
    try {
      const h = JSON.parse(b64urlText(p[0]));
      const b = JSON.parse(b64urlText(p[1]));
      return !!h && typeof h === 'object' && typeof h.alg === 'string' && !!b && typeof b === 'object' && !Array.isArray(b);
    } catch (e) {
      return false;
    }
  }

  // Passwort in Verbindungs-Strings (Gruppe p bzw. p2).
  const connOk = (v, gr) => { const p = gr && (gr.p !== undefined ? gr.p : gr.p2); return p === undefined || secretValueOk(p); };

  // Oeffentliche IPv4-Adressen; private, Loopback, Link-Local, CGNAT,
  // Dokumentationsnetze (RFC 5737) und Multicast/reserviert zaehlen nicht.
  function publicIpv4(v) {
    const o = v.split('.').map(Number);
    if (o.length !== 4) return false;
    const [a, b, c] = o;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }

  // Rahmen privater Schluessel (RFC 7468); Text zusammengesetzt, damit der
  // Quelltext selbst keinen Schluesselrahmen enthaelt. Fund = ganzer Block bis
  // END; fehlt END, bis zur Grenze von 12000 Zeichen bzw. Textende (Auflage 3).
  const PEM = new RegExp('-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP |ANY )?' + 'PRI' + 'VATE KEY(?: BLOCK)?-----' +
    '(?:[\\s\\S]{0,12000}?-----END [A-Z ]{1,40}-----|[\\s\\S]{0,12000})', 'g');
  const PUTTY = /PuTTY-User-Key-File-[23]: [^\r\n]{1,100}(?:[\s\S]{0,12000}?Private-MAC: [0-9a-fA-F]{1,128}|[\s\S]{0,12000})/g;

  // Woerter in Namen von Geheimnissen (.env, Konfiguration).
  const ENV_WORDS = 'SECRET|SECRETS|PASSWORD|PASSWD|PASSWORT|KENNWORT|PWD|PASS|TOKEN|APIKEY|API_KEY|ACCESS_KEY|ACCESSKEY|PRIVATE_KEY|' +
    'AUTH_KEY|SECRET_KEY|CLIENT_SECRET|CREDENTIAL|CREDENTIALS|CONNECTION_STRING|CONNECTIONSTRING|CONN_STR|DSN|DATABASE_URL|DB_URL|' +
    'SAS|SAS_TOKEN|SIGNING_KEY|ENCRYPTION_KEY|MASTER_KEY|WEBHOOK|WEBHOOK_URL|SALT|PEPPER|PRIVATEKEY|ACCOUNT_KEY|ACCOUNTKEY|SHARED_KEY';

  // --- Eingefuegter Code (Design-Review Code und Bilder 16.10.2026, Auflagen 1, 4) ---
  // Nur die ersten 200 Zeilen bzw. 20k Zeichen; eine Zeile zaehlt als Code, wenn ein
  // Merkmal passt (Anweisungsende, Klammern, Schluesselwort, Tag, Zuweisung, YAML/JSON).
  const CODE_MAX = 20000, CODE_LINES = 200;
  const SHELL = '(?:curl|wget|ssh|scp|git|docker|kubectl|npm|pip|psql|mysql|sqlcmd|az|aws|gcloud|Invoke-\\w{1,30})\\s';
  const CODE_LINE = new RegExp('[;{}(]$|^[}\\])]|=>|^' + SHELL + '|^(?:import|export|from|const|let|var|function|def|class|return|if|elif|for|while|' +
    'public|private|package|using|namespace|async|await|try|catch|echo|set|SELECT|INSERT|UPDATE|CREATE)\\b|^#include\\b|^<\\/?[A-Za-z][\\w:-]{0,40}[\\s>/]|' +
    '^[A-Za-z_][\\w.-]{0,60}[ \\t]{0,3}=[ \\t]{0,3}\\S|^[a-z_][\\w.-]{0,60}:[ \\t]|^"[^"]{1,80}"[ \\t]{0,3}:|^- [a-z_][\\w.-]{0,60}:|^(?:\\/\\/|#|--) ?\\S');
  // Einzeiler nur mit starkem Merkmal (Shell-Befehl oder Code-Merkmal mit Klammer/Anweisungsende).
  const CODE_SHELL = new RegExp('^' + SHELL);
  const CODE_ONE = /[;{}()]|=>/;
  function isCode(text) {
    if (typeof text !== 'string') return false;
    const lines = text.slice(0, CODE_MAX).split('\n', CODE_LINES).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return false;
    if (lines.length === 1) return CODE_SHELL.test(lines[0]) || (CODE_LINE.test(lines[0]) && CODE_ONE.test(lines[0]));
    const hits = lines.filter((l) => l.length <= 2000 && CODE_LINE.test(l)).length;
    return hits >= 2 && hits * 2 >= lines.length;
  }
  // Zeilennummern (ab 1) je Datentyp, hoechstens 5, in einem Durchgang; nur Nummern, nie Werte.
  function linesOf(text, findings) {
    const out = new Map();
    const list = findings.filter((f) => !f.meta && f.start >= 0).sort((a, b) => a.start - b.start);
    let line = 1, pos = 0;
    for (const f of list) {
      for (; pos < f.start && pos < text.length; pos++) if (text.charCodeAt(pos) === 10) line++;
      const l = out.get(f.id) || [];
      if (l.length < 5 && l[l.length - 1] !== line && line <= 100000) l.push(line);
      out.set(f.id, l);
    }
    return out;
  }
  DLX.code = Object.freeze({ MAX: CODE_MAX, LINES: CODE_LINES, isCode, linesOf });

  // Interne Hosts: Namen mit internen Endungen; private IPv4 nur in URL, nach "@" oder
  // als Wert von host/server/... (Versionsnummern bleiben aussen vor, Auflage 2).
  const OCT = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
  const INTERNAL = new RegExp('(?<![\\w.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.){1,8}(?:localdomain|local|lan|internal|intranet|intra|corp|home\\.arpa)(?![\\w-]|\\.[a-z0-9])|' +
    '(?<=(?:[a-z]{2,10}:\\/\\/|@|\\b(?:host|hostname|server|addr|address|ip|endpoint|bind|proxy|data source)["\']?[ \\t]{0,3}[:=][ \\t]{0,3}["\']?))' +
    '(?:10(?:\\.' + OCT + '){3}|172\\.(?:1[6-9]|2\\d|3[01])(?:\\.' + OCT + '){2}|192\\.168(?:\\.' + OCT + '){2})(?!\\d|\\.\\d)', 'gi');

  // Hohe Entropie (angelehnt an gitleaks generic-api-key): Literal oder Zuweisungswert,
  // nur in Code, immer unsicher (Auflage 3). Ausgeschlossen: UUID, Integrity-Hashes,
  // Platzhalter, Pfade/Bezeichner (klein mit . oder /), Werte ohne Ziffern.
  const ENTROPY = /(?:["'`]|[=:][ \t]{0,3})(?<v>[A-Za-z0-9+/_.=-]{20,200})(?![A-Za-z0-9+/_.=-])/dg;
  function entropyOk(v) {
    if (isPlaceholder(v) || /^(?:sha(?:1|256|384|512)|md5)-/i.test(v)) return false;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return false;
    if (/[./]/.test(v) && !/[A-Z]/.test(v)) return false;
    if (/[xX*]{4}/.test(v) || codeRef(v)) return false;
    const digits = (v.match(/\d/g) || []).length;
    if (digits < 2) return false;
    if (/^[0-9a-f]+$/i.test(v)) return v.length >= 32 && entropy(v) >= 3;
    return /[a-z]/.test(v) && /[A-Z]/.test(v) && entropy(v) >= 4;
  }

  const D = (id, cls, re, name, extra) => Object.assign({ id, cat: 'technik', cls, re, name }, extra || {});
  // Anbieter-Schluessel: Klasse hoch, Fuellwerte per Entropie ausgeschlossen.
  // pre: Literal-Vorpruefung des ganzen Texts (schnell); ohne sie kein Musterlauf.
  const K = (id, re, en, de, pre) => D(id, 'hoch', re, { en, de }, { valid: keyOk, pre });

  DLX.registerPack({
    id: 'secrets', kind: 'global',
    detectors: [
      K('aws_akid', /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b/g, 'AWS access key ID', 'AWS-Zugriffsschlüssel-ID', /AKIA|ASIA|ABIA|ACCA/),
      D('aws_secret', 'hoch', /aws.{0,20}?secret.{0,20}?[=:"' ]{1,5}(?<v>[A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/dgi,
        { en: 'AWS secret access key', de: 'AWS-Geheimschlüssel' }, { group: 'v', valid: keyOk , pre: /[Aa][Ww][Ss]/ }),
      D('azure_storage', 'hoch', /\b(?:AccountName|AccountEndpoint)=[^;\s]{1,255};(?:[^;\s]{1,255};){0,3}AccountKey=[A-Za-z0-9+/]{86}==/g,
        { en: 'Azure storage / Cosmos DB connection string', de: 'Azure-Storage-/Cosmos-DB-Verbindungszeichenfolge' }, { valid: keyOk , pre: /AccountKey=/ }),
      D('azure_sb', 'hoch', /\bEndpoint=sb:\/\/[^;\s]{1,255};SharedAccessKeyName=[^;\s]{1,256};SharedAccessKey=[A-Za-z0-9+/]{42,43}=/g,
        { en: 'Azure Service Bus / Event Hubs connection string', de: 'Azure-Service-Bus-/Event-Hubs-Verbindung' }, { valid: keyOk , pre: /SharedAccessKey=/ }),
      K('azure_secret', /\b[a-zA-Z0-9_~.]{3}\dQ~[a-zA-Z0-9_~.-]{31,34}(?![a-zA-Z0-9_~.-])/g, 'Entra ID client secret', 'Entra-ID-Client-Geheimnis', /Q~/),
      D('azure_sas', 'hoch', /(?:[?&]|\b)sv=\d{4}-\d{2}-\d{2}&[^\s"']{0,500}?sig=[A-Za-z0-9%/+=]{20,200}/g,
        { en: 'Azure shared access signature', de: 'Azure-SAS-Signatur' }, { pre: /sig=/ }),
      K('gcp_apikey', /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g, 'Google API key', 'Google-API-Schlüssel', /AIza/),
      D('gcp_sa', 'hoch', /"type"\s{0,5}:\s{0,5}"service_account"[\s\S]{0,400}?"private_key"/g,
        { en: 'Google service account key file', de: 'Google-Dienstkonto-Schlüsseldatei' }, { pre: /service_account/ }),
      K('google_oauth', /\b(?:GOCSPX-[A-Za-z0-9_-]{28}|1\/\/0[A-Za-z0-9_-]{40,300})(?![A-Za-z0-9_-])/g, 'Google OAuth secret / refresh token', 'Google-OAuth-Geheimnis', /GOCSPX-|1\/\/0/),
      K('github_pat', /\bgh[pousr]_[A-Za-z0-9]{36}\b/g, 'GitHub token', 'GitHub-Token', /gh[pousr]_/),
      K('github_fg', /\bgithub_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}\b/g, 'GitHub fine-grained token', 'GitHub-Token (fein granular)', /github_pat_/),
      K('gitlab_pat', /\b(?:glpat|gldt|glrt|glptt)-[A-Za-z0-9_-]{20,100}(?![A-Za-z0-9_-])/g, 'GitLab token', 'GitLab-Token', /gl(?:pat|dt|rt|ptt)-/),
      K('slack_token', /\b(?:xox[abeoprs]-[A-Za-z0-9-]{10,200}|xapp-\d-[A-Za-z0-9-]{10,200})(?![A-Za-z0-9-])/g, 'Slack token', 'Slack-Token', /xox|xapp-/),
      D('slack_webhook', 'hoch', /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{1,20}\/B[A-Z0-9]{1,20}\/[A-Za-z0-9]{20,64}/g,
        { en: 'Slack webhook URL', de: 'Slack-Webhook-URL' }, { pre: /hooks\.slack\.com/ }),
      D('teams_webhook', 'hoch', /https:\/\/[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,5}\.(?:webhook\.office\.com|logic\.azure\.com)(?::\d{1,5})?\/[^\s"'<>]{40,2000}/g,
        { en: 'Microsoft Teams / Logic Apps webhook URL', de: 'Teams-/Logic-Apps-Webhook-URL' }, { pre: /webhook\.office\.com|logic\.azure\.com/ }),
      D('discord_webhook', 'hoch', /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9_-]{60,80}/g,
        { en: 'Discord webhook URL', de: 'Discord-Webhook-URL' }, { pre: /discord/ }),
      K('stripe_key', /\b(?:(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,250}|whsec_[A-Za-z0-9]{32,100})\b/g, 'Stripe secret key', 'Stripe-Geheimschlüssel', /_live_|_test_|whsec_/),
      K('openai_key', /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,200}T3BlbkFJ[A-Za-z0-9_-]{20,200}(?![A-Za-z0-9_-])|\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{58,250}(?![A-Za-z0-9_-])/g,
        'OpenAI API key', 'OpenAI-API-Schlüssel', /sk-/),
      K('anthropic_key', /\bsk-ant-(?:api03|admin01)-[A-Za-z0-9_-]{80,250}(?![A-Za-z0-9_-])/g, 'Anthropic API key', 'Anthropic-API-Schlüssel', /sk-ant-/),
      K('groq_key', /\bgsk_[A-Za-z0-9]{52}\b/g, 'Groq API key', 'Groq-API-Schlüssel', /gsk_/),
      K('perplexity_key', /\bpplx-[A-Za-z0-9]{48}\b/g, 'Perplexity API key', 'Perplexity-API-Schlüssel', /pplx-/),
      K('xai_key', /\bxai-[A-Za-z0-9]{80}\b/g, 'xAI API key', 'xAI-API-Schlüssel', /xai-/),
      K('sendgrid', /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g, 'SendGrid API key', 'SendGrid-API-Schlüssel', /SG\./),
      K('mailchimp_key', /\b[0-9a-f]{32}-us\d{1,2}\b/g, 'Mailchimp API key', 'Mailchimp-API-Schlüssel', /-us\d/),
      K('mailgun_key', /\bkey-[0-9a-f]{32}\b/g, 'Mailgun API key', 'Mailgun-API-Schlüssel', /key-/),
      K('brevo_key', /\bxkeysib-[a-f0-9]{64}-[A-Za-z0-9]{16}\b/g, 'Brevo (Sendinblue) API key', 'Brevo-API-Schlüssel', /xkeysib-/),
      K('pypi_token', /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,1000}(?![A-Za-z0-9_-])/g, 'PyPI upload token', 'PyPI-Token', /pypi-/),
      K('docker_pat', /\bdckr_pat_[A-Za-z0-9_-]{27}(?![A-Za-z0-9_-])/g, 'Docker Hub access token', 'Docker-Hub-Token', /dckr_pat_/),
      K('shopify_token', /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/g, 'Shopify access token', 'Shopify-Token', /shp(?:at|ca|pa|ss)_/),
      K('square_token', /\b(?:EAAA|sq0atp-|sq0csp-)[A-Za-z0-9_-]{22,60}(?![A-Za-z0-9_-])/g, 'Square access token', 'Square-Token', /EAAA|sq0/),
      K('do_token', /\bdo[opr]_v1_[a-f0-9]{64}\b/g, 'DigitalOcean token', 'DigitalOcean-Token', /_v1_/),
      K('atlassian_token', /\bATATT3[A-Za-z0-9_=-]{150,250}(?![A-Za-z0-9_=-])/g, 'Atlassian API token', 'Atlassian-API-Token', /ATATT3/),
      K('databricks_token', /\bdapi[a-f0-9]{32}(?:-\d)?\b/g, 'Databricks token', 'Databricks-Token', /dapi/),
      K('linear_key', /\blin_api_[A-Za-z0-9]{40}\b/g, 'Linear API key', 'Linear-API-Schlüssel', /lin_api_/),
      K('notion_token', /\b(?:ntn_\d{11}[A-Za-z0-9]{35}|secret_[A-Za-z0-9]{43})\b/g, 'Notion integration token', 'Notion-Token', /ntn_|secret_/),
      K('postman_key', /\bPMAK-[a-f0-9]{24}-[a-f0-9]{34}\b/g, 'Postman API key', 'Postman-API-Schlüssel', /PMAK-/),
      K('grafana_token', /\b(?:glsa_[A-Za-z0-9]{32}_[A-Fa-f0-9]{8}|glc_[A-Za-z0-9+/]{32,400}={0,2})(?![A-Za-z0-9+/=])/g, 'Grafana token', 'Grafana-Token', /glsa_|glc_/),
      K('newrelic_key', /\bNRAK-[A-Z0-9]{27}\b/g, 'New Relic API key', 'New-Relic-API-Schlüssel', /NRAK-/),
      K('sentry_token', /\b(?:sntrys_eyJ[A-Za-z0-9+/=_-]{60,1000}|sntryu_[a-f0-9]{64})(?![A-Za-z0-9+/=_-])/g, 'Sentry auth token', 'Sentry-Token', /sntry/),
      K('telegram_bot', /\b\d{8,10}:AA[0-9A-Za-z_-]{33}(?![0-9A-Za-z_-])/g, 'Telegram bot token', 'Telegram-Bot-Token', /:AA/),
      K('alibaba_key', /\bLTAI[A-Za-z0-9]{20}\b/g, 'Alibaba Cloud access key ID', 'Alibaba-Cloud-Schlüssel-ID', /LTAI/),
      K('age_key', /\bAGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}\b/g, 'age private key', 'age-Schlüssel', /AGE-SECRET-KEY-/),
      K('vault_token', /\bhv[sb]\.[A-Za-z0-9_-]{90,300}(?![A-Za-z0-9_-])/g, 'HashiCorp Vault token', 'Vault-Token', /hv[sb]\./),
      K('terraform_token', /\b[A-Za-z0-9]{14}\.atlasv1\.[A-Za-z0-9_=-]{60,70}(?![A-Za-z0-9_=-])/g, 'Terraform Cloud token', 'Terraform-Cloud-Token', /\.atlasv1\./),
      K('doppler_token', /\bdp\.pt\.[A-Za-z0-9]{43}\b/g, 'Doppler token', 'Doppler-Token', /dp\.pt\./),
      K('pulumi_token', /\bpul-[a-f0-9]{40}\b/g, 'Pulumi access token', 'Pulumi-Token', /pul-/),
      K('cloudflare_ca', /\bv1\.0-[a-f0-9]{24}-[a-f0-9]{146}\b/g, 'Cloudflare Origin CA key', 'Cloudflare-Origin-CA-Schlüssel', /v1\.0-/),
      K('mapbox_secret', /\bsk\.eyJ[A-Za-z0-9_-]{50,1000}\.[A-Za-z0-9_-]{20,100}(?![A-Za-z0-9_-])/g, 'Mapbox secret token', 'Mapbox-Geheimtoken', /sk\.eyJ/),
      D('jwt', 'hoch', /\beyJ[A-Za-z0-9_-]{10,2000}\.eyJ[A-Za-z0-9_-]{10,8000}\.[A-Za-z0-9_-]{10,2000}(?![A-Za-z0-9_-])/g,
        { en: 'JSON Web Token', de: 'JSON Web Token' }, { valid: jwtOk , pre: /eyJ/ }),
      D('pem_private', 'hoch', PEM, { en: 'Private key block', de: 'Privater Schlüssel' }, { pre: /-----BEGIN / }),
      D('putty_key', 'hoch', PUTTY, { en: 'PuTTY private key file', de: 'PuTTY-Schlüsseldatei' }, { pre: /PuTTY-User-Key-File-/ }),
      D('conn_db', 'hoch', /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql|sqlserver):\/\/[^\s:/@]{0,200}:(?<p>[^\s@/]{1,200})@[^\s/]{1,255}/g,
        { en: 'Database connection string with password', de: 'Datenbank-Verbindung mit Passwort' }, { valid: connOk, validGroups: true, pre: /:\/\// }),
      D('conn_jdbc', 'hoch', /\bjdbc:[a-z0-9]{2,20}:[^\s"']{0,300}?[;?&](?:password|pwd)=(?<p>[^;&\s"']{1,200})/gi,
        { en: 'JDBC connection string with password', de: 'JDBC-Verbindung mit Passwort' }, { valid: connOk, validGroups: true, pre: /jdbc:/i }),
      D('conn_ado', 'hoch', /(?:(?:Server|Data Source|Host|Address|Addr|Network Address)=[^;\r\n]{1,200};[^\r\n]{0,300}?(?:Password|Pwd)=(?<p>[^;\s"']{1,200})|(?:Password|Pwd)=(?<p2>[^;\s"']{1,200});[^\r\n]{0,300}?(?:Server|Data Source|Host)=[^;\s]{1,200})/gi,
        { en: 'Connection string with password', de: 'Verbindungszeichenfolge mit Passwort' }, { valid: connOk, validGroups: true, pre: /p(?:assword|wd)=/i }),
      D('conn_redis', 'hoch', /(?<![A-Za-z0-9.-])[A-Za-z0-9.-]{1,253}:\d{2,5},(?:[^,\s]{1,100},){0,10}password=(?<p>[^,\s"']{1,200})/gi,
        { en: 'Redis connection string with password', de: 'Redis-Verbindung mit Passwort' }, { valid: connOk, validGroups: true, pre: /password=/i }),
      D('env_secret', 'hoch', new RegExp('^[ \\t]{0,8}(?:export[ \\t]{1,4})?(?<k>(?:[A-Z0-9]{1,30}[_.]){0,6}(?:' + ENV_WORDS + ')(?:[_.][A-Z0-9]{1,30}){0,6})' +
        '[ \\t]{0,4}=[ \\t]{0,4}(?<q>["\']?)(?<v>[^\\s"\'#]{4,500})', 'dgm'),
        { en: 'Secret in .env file', de: 'Geheimnis in .env-Datei' }, { group: 'v', valid: envValueOk, validGroups: true, pre: /=/ }),
      D('cfg_password', 'hoch', /(?<![A-Za-z0-9])(?:password|passwd|pwd|passwort|kennwort|mot_de_passe|contrase(?:ñ|n)a|senha|secret|client_secret|secret_key|api_?key|apikey|access_token|auth_token|token)["']?[ \t]{0,4}[=:][ \t]{0,4}(?<q>["']?)(?<v>[^\s"';]{6,200})/dgi,
        { en: 'Password or secret in configuration', de: 'Passwort oder Geheimnis in Konfiguration' }, { group: 'v', valid: cfgValueOk, validGroups: true, pre: /[=:]/ }),
      D('basic_auth_url', 'hoch', /\bhttps?:\/\/[^\s:/@]{1,200}:(?<p>[^\s@/]{1,200})@[^\s/]{1,255}/g,
        { en: 'URL with embedded credentials', de: 'URL mit Zugangsdaten' }, { valid: connOk, validGroups: true, pre: /@/ }),
      D('ipv4', 'mittel', /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\d]|\.\d)/g,
        { en: 'Public IPv4 address', de: 'Öffentliche IPv4-Adresse' },
        { valid: publicIpv4, fmtOnly: true, ctx: ['IP ', 'IP:', 'IP-', 'IPv4', 'ip address', 'adresse ip', 'indirizzo ip', 'endereço ip', 'Server', 'Host'] }),
      // Nur in eingefuegtem Code (code: true), ergaenzen die Detektoren oben (Auflage 4).
      D('internal_host', 'mittel', INTERNAL, { en: 'Internal host name or address', de: 'Interner Hostname oder interne Adresse' },
        { code: true, pre: /\.(?:local|lan|internal|intra|corp|home\.arpa)|10\.|172\.|192\.168/i }),
      D('entropy_secret', 'mittel', ENTROPY, { en: 'Random-looking string in code (possible key)', de: 'Zufällig wirkende Zeichenfolge im Code (möglicher Schlüssel)' },
        { code: true, group: 'v', valid: entropyOk, alone: 'unsure', generic: true, pre: /[=:"'`]/ }),
    ],
  });

  DLX.validators = Object.assign(DLX.validators || {}, { publicIpv4, secretValueOk, isPlaceholder, entropy, jwtOk, entropyOk });
})(globalThis);
