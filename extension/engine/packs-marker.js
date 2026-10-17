// Globales Paket: Vertraulichkeits-Vermerke und Microsoft-Purview-Labels in
// eingefuegtem Text (Design-Review Geheimnisse/Vermerke 14.10.2026).
// Einzelwoerter ("intern", "confidential", "NDA") nur in Vermerk-Stellung:
// nach einem Schluessel wie "Klassifizierung:" bzw. "classified as", allein auf
// einer Zeile oder in GROSSBUCHSTABEN; mehrteilige Wendungen ueberall (Auflage 10).
(function (g) {
  'use strict';
  const DLX = g.DLX;

  // Alle Regex-Syntaxzeichen escapen (ein "-" ausserhalb einer Klasse ist im
  // u-Modus bereits ein Literal und darf dort nicht escaped werden).
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&').replace(/ /g, '[ \\t]{1,3}');
  const alt = (list) => list.slice().sort((a, b) => b.length - a.length).map(esc).join('|');

  // Einzelwoerter und Label-Namen (Vermerk-Stellung). Purview-Standardlabels:
  // Confidential, Highly Confidential (de: Vertraulich, Streng vertraulich);
  // Public/General/Personal sind keine Vermerke und fehlen absichtlich.
  const WORDS = [
    'vertraulich', 'streng vertraulich', 'intern', 'nur intern', 'geheim', 'streng geheim',
    'confidential', 'highly confidential', 'strictly confidential', 'internal', 'internal only', 'restricted', 'secret', 'top secret', 'proprietary', 'highly sensitive',
    'confidentiel', 'confidentielle', 'interne', 'restreint', 'diffusion restreinte',
    'riservato', 'riservata', 'confidenziale', 'interno', 'segreto',
    'confidencial', 'reservado', 'restringido', 'secreto', 'restrito', 'sigiloso',
    'vertrouwelijk', 'poufne', 'wewnętrzne', 'tajne', 'konfidentiell', 'hemlig', 'fortroligt', 'fortrolig', 'konfidensiell',
    'luottamuksellinen', 'sisäinen', 'salainen', 'důvěrné', 'interní', 'tajné',
    'конфиденциально', 'секретно', 'gizli', 'سري',
    '機密', '社外秘', '内部', '机密', '秘密', '기밀', '대외비',
    'nda', 'under nda',
  ];
  // Allein auf einer Zeile: ohne "intern"/"interne"/"interno" (dort oft Rolle
  // oder Ueberschrift, z. B. engl. "Intern" = Praktikant).
  const LINE_WORDS = WORDS.filter((w) => ['intern', 'interne', 'interno', 'internal'].indexOf(w) === -1);
  // Schluessel vor dem Vermerk (mit Doppelpunkt) bzw. Formen mit "als/as".
  const KEYS = ['klassifizierung', 'klassifikation', 'einstufung', 'vertraulichkeit', 'vertraulichkeitsstufe', 'vertraulichkeitsbezeichnung',
    'schutzstufe', 'schutzklasse', 'geheimhaltungsstufe', 'sensitivity', 'sensitivity label', 'classification', 'data classification',
    'security classification', 'information classification', 'label', 'confidentialité', 'niveau de confidentialité', 'classificazione', 'riservatezza',
    'clasificación', 'confidencialidad', 'classificação', 'confidencialidade', 'vertrouwelijkheid', 'classificatie', 'klasyfikacja',
    'klassificering', 'sekretessklass', 'luokitus', 'klasifikace', 'гриф', 'sınıflandırma', '機密区分', '密级', '보안등급'];
  const KEYS_AS = ['klassifiziert als', 'eingestuft als', 'classified as', 'classé', 'classée', 'classificato come', 'classificata come',
    'clasificado como', 'clasificada como', 'classificado como', 'classificada como', 'geclassificeerd als'];
  // Mehrteilige Wendungen, ueberall gemeldet.
  const PHRASES = [
    'streng vertraulich', 'nur für den internen gebrauch', 'nur für internen gebrauch', 'nur zum internen gebrauch', 'nur zur internen verwendung',
    'nur für den dienstgebrauch', 'vertrauliche verschlusssache', 'streng geheim', 'nicht zur weitergabe', 'unter nda',
    'strictly confidential', 'highly confidential', 'company confidential', 'confidential and proprietary', 'proprietary and confidential',
    'internal use only', 'for internal use only', 'internal distribution only', 'not for distribution', 'not for external distribution',
    'do not distribute', 'under nda', 'subject to nda', 'top secret', 'restricted distribution',
    'strictement confidentiel', 'strictement confidentielle', 'hautement confidentiel', 'usage interne uniquement', 'usage interne seulement',
    'pour usage interne', 'à usage interne', 'diffusion restreinte', 'confidentiel défense', 'ne pas diffuser', 'sous nda',
    'strettamente riservato', 'strettamente riservata', 'strettamente confidenziale', 'ad uso interno', 'solo uso interno', 'uso interno esclusivo', 'uso interno exclusivo', 'non divulgare',
    'estrictamente confidencial', 'altamente confidencial', 'solo para uso interno', 'difusión restringida', 'no divulgar',
    'estritamente confidencial', 'apenas para uso interno', 'somente para uso interno', 'divulgação restrita', 'não divulgar',
    'strikt vertrouwelijk', 'zeer vertrouwelijk', 'alleen voor intern gebruik', 'uitsluitend voor intern gebruik',
    'ściśle poufne', 'do użytku wewnętrznego', 'strikt konfidentiell', 'endast för internt bruk', 'strengt fortroligt', 'kun til internt brug',
    'strengt fortrolig', 'kun til intern bruk', 'erittäin luottamuksellinen', 'vain sisäiseen käyttöön', 'přísně důvěrné', 'pouze pro interní potřebu',
    'строго конфиденциально', 'для служебного пользования', 'коммерческая тайна', 'hizmete özel', 'kişiye özel', 'çok gizli',
    'سري للغاية', 'للاستخدام الداخلي فقط',
  ];
  // Ostasiatische Vermerke ohne Wortgrenzen (eindeutig genug).
  const CJK = ['社外秘', '部外秘', '極秘', '関係者外秘', '取扱注意', '绝密', '机密文件', '内部资料', '仅限内部使用', '僅限內部使用', '대외비', '극비'];
  // GROSSBUCHSTABEN ueberall (nicht in Aufzaehlungen/Zuweisungen wie Code-Enums).
  const CAPS = ['VERTRAULICH', 'INTERN', 'GEHEIM', 'CONFIDENTIAL', 'CONFIDENTIEL', 'CONFIDENTIELLE', 'RISERVATO', 'RISERVATA', 'CONFIDENZIALE',
    'CONFIDENCIAL', 'VERTROUWELIJK', 'POUFNE', 'KONFIDENTIELL', 'FORTROLIG', 'FORTROLIGT', 'KONFIDENSIELL', 'LUOTTAMUKSELLINEN', 'DŮVĚRNÉ',
    'КОНФИДЕНЦИАЛЬНО', 'GİZLİ'];

  const B = '(?<![\\p{L}\\p{N}_])', E = '(?![\\p{L}\\p{N}_])';
  // Vorab-Klasse: jede Alternative beginnt mit einem Buchstaben oder einem der
  // Zeilen-Vorzeichen; Ziffern u. a. scheiden so mit einem Vergleich aus (Laufzeit).
  const MARKER = new RegExp('(?=[\\p{L} \\t>*_\\[(|•-])(?:' +
    // 1. Schluessel + Vermerk
    B + '(?:' + alt(KEYS) + ')[ \\t]{0,3}[:：][ \\t]{0,3}["\'„“«\\[(*_]{0,2}(?:' + alt(WORDS) + ')' + E +
    '|' + B + '(?:' + alt(KEYS_AS) + ')[ \\t]{1,3}["\'„“«*_]{0,2}(?:' + alt(WORDS) + ')' + E +
    // 2. allein auf einer Zeile (Unterlabel wie "Confidential\All Employees" erlaubt)
    '|^[ \\t>*_\\[(|•-]{0,6}(?:' + alt(LINE_WORDS) + ')(?:[\\\\/][^\\r\\n]{1,60})?[ \\t]{0,2}[\\])*_.!:]{0,3}[ \\t]{0,3}(?=\\r?$)' +
    // 3. Wendungen
    '|' + B + '(?:' + alt(PHRASES) + ')' + E +
    '|(?:' + CJK.join('|') + ')' +
    // 4. Grossbuchstaben
    '|(?<![\\p{L}\\p{N}_.$-])(?<![,({\\[=][ \\t]{0,3})(?<caps>' + CAPS.join('|') + ')' + E + '(?![ \\t]{0,3}[,;:=(){}\\]]))',
    'gimu');
  // Gruppe caps: nur echte Grossschreibung zaehlt (Regex selbst ohne Gross/Klein).
  const markerOk = (v, gr) => !gr || gr.caps === undefined || (gr.caps === gr.caps.toUpperCase() && gr.caps !== gr.caps.toLowerCase());

  // Purview-Metadaten (z. B. aus kopiertem Office-XML): MSIP_Label_<GUID>_Name=...
  // Oeffentliche/allgemeine/persoenliche Labels zaehlen nicht. Der Fund traegt
  // wie jeder Fund nur id und Position, nie GUID oder Namen.
  const NOT_SENSITIVE = /^(?:public|general|personal|non-business|öffentlich|allgemein|persönlich|nicht geschäftlich|publique?|général|personnel|pubblico|generale|personale|público|publico|general|personal|geral|openbaar|algemeen|persoonlijk)$/i;
  const MSIP = /\bMSIP_Label_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_Name=(?<n>[^;\r\n"<]{1,100})/g;
  const msipOk = (v, gr) => !!gr && !NOT_SENSITIVE.test(String(gr.n).trim());

  DLX.registerPack({
    id: 'marker', kind: 'global',
    detectors: [
      { id: 'conf_marker', cat: 'firma', cls: 'mittel', re: MARKER, valid: markerOk, validGroups: true, pre: /\p{L}/u,
        name: { en: 'Confidentiality marking', de: 'Vertraulichkeits-Vermerk' } },
      { id: 'conf_label', cat: 'firma', cls: 'mittel', re: MSIP, valid: msipOk, validGroups: true,
        name: { en: 'Sensitivity label (Purview or own label name)', de: 'Vertraulichkeitsbezeichnung (Purview oder eigener Label-Name)' } },
    ],
  });

  // Eigene Label-Namen aus der Richtlinie labelNames (Auflage 4): einmal je
  // Richtlinien-Aenderung gebaut (engineConfig), NFC, alles escaped, ohne
  // Gross/Klein, Wortgrenzen, Teile zu hoechstens 50 Namen. Namen, die schon
  // eingebaute Einzelwoerter sind, laufen ueber conf_marker (Vermerk-Stellung).
  const BUILTIN = new Set(WORDS);
  function compile(names) {
    if (!Array.isArray(names) || !names.length) return null;
    const list = [];
    for (const n of names) {
      const v = String(n).normalize('NFC').trim().toLowerCase();
      if (v && !BUILTIN.has(v) && list.indexOf(v) === -1) list.push(v);
    }
    const out = [];
    for (let i = 0; i < list.length; i += 50) out.push(new RegExp(B + '(?:' + alt(list.slice(i, i + 50)) + ')' + E, 'giu'));
    return out.length ? out : null;
  }

  DLX.markers = { compile, markerOk };
})(globalThis);
