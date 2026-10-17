// Sicher umformulieren: heikle Details lokal durch
// allgemeine Beschreibungen ersetzen, die Frage bleibt gleich - z. B.
// "Herr Meier, 45, Diabetes" -> "ein Patient mittleren Alters mit chronischer
// Erkrankung". Regelbasiert; Funde der lokalen KI (Personen, Firmen, Adressen,
// Gesundheit) kommen als normale Funde mit. Die Ersatztexte enthalten nie Teile
// des Originals: nur feste Woerter und Altersgruppen, keine Namensteile oder
// Initialen (Design-Review Tabellen/Verschleierung/Umformen 16.10.2026, Auflage 14).
// Rein lokal, synchron, nichts gespeichert.
(function (g) {
  'use strict';
  const DLX = g.DLX;

  // --- Feste Texte je Sprache -------------------------------------------------
  // subj: Person (m/f/x), mit Gesundheitsbezug als Patient; age: Altersgruppe nach dem
  // Subjekt; with: Verbindungswort + Erkrankung; one: Erkrankung allein; v: allgemeine Werte.
  const T = {
    de: {
      subj: { m: 'ein Mann', f: 'eine Frau', x: 'eine Person', pm: 'ein Patient', pf: 'eine Patientin', px: 'eine Person' },
      age: { kid: 'im Kindes- oder Jugendalter', young: 'im jungen Erwachsenenalter', mid: 'mittleren Alters', old: 'im h\u00f6heren Alter' },
      withWord: 'mit',
      with: { chronic: 'chronischer Erkrankung', psych: 'psychischer Erkrankung', serious: 'schwerer Erkrankung', med: 'regelm\u00e4ssiger Medikation', preg: 'Schwangerschaft', other: 'einer Erkrankung' },
      one: { chronic: 'eine chronische Erkrankung', psych: 'eine psychische Erkrankung', serious: 'eine schwere Erkrankung', med: 'ein Medikament', preg: 'eine Schwangerschaft', other: 'eine Erkrankung' },
      ageAlone: 'mittleren Alters',
      v: { mail: 'eine E-Mail-Adresse', phone: 'eine Telefonnummer', bank: 'eine Bankverbindung', address: 'eine Adresse', birth: 'ein Geburtsdatum',
        idnr: 'eine Ausweis- oder Versichertennummer', secret: 'ein Zugangsschl\u00fcssel', org: 'eine Firma', hr: 'eine Personalangelegenheit',
        belief: 'eine pers\u00f6nliche \u00dcberzeugung', person: 'eine Person', value: 'eine vertrauliche Angabe', rows: 'weitere Zeilen' },
    },
    en: {
      subj: { m: 'a man', f: 'a woman', x: 'a person', pm: 'a patient', pf: 'a patient', px: 'a patient' },
      age: { kid: 'under 18', young: 'of young adult age', mid: 'of middle age', old: 'of older age' },
      withWord: 'with',
      with: { chronic: 'a chronic condition', psych: 'a mental health condition', serious: 'a serious illness', med: 'regular medication', preg: 'a pregnancy', other: 'an illness' },
      one: { chronic: 'a chronic condition', psych: 'a mental health condition', serious: 'a serious illness', med: 'a medication', preg: 'a pregnancy', other: 'an illness' },
      ageAlone: 'middle-aged',
      v: { mail: 'an e-mail address', phone: 'a phone number', bank: 'a bank account', address: 'an address', birth: 'a date of birth',
        idnr: 'an ID or insurance number', secret: 'an access key', org: 'a company', hr: 'an HR matter', belief: 'a personal belief',
        person: 'a person', value: 'a confidential detail', rows: 'more rows' },
    },
    fr: {
      subj: { m: 'un homme', f: 'une femme', x: 'une personne', pm: 'un patient', pf: 'une patiente', px: 'une personne' },
      age: { kid: 'mineure', young: 'jeune adulte', mid: "d'\u00e2ge moyen", old: "d'\u00e2ge avanc\u00e9" },
      withWord: 'avec',
      with: { chronic: 'une maladie chronique', psych: 'un trouble psychique', serious: 'une maladie grave', med: 'un traitement m\u00e9dicamenteux', preg: 'une grossesse', other: 'une maladie' },
      one: { chronic: 'une maladie chronique', psych: 'un trouble psychique', serious: 'une maladie grave', med: 'un m\u00e9dicament', preg: 'une grossesse', other: 'une maladie' },
      ageAlone: "d'\u00e2ge moyen",
      v: { mail: 'une adresse e-mail', phone: 'un num\u00e9ro de t\u00e9l\u00e9phone', bank: 'un compte bancaire', address: 'une adresse', birth: 'une date de naissance',
        idnr: "un num\u00e9ro d'identit\u00e9 ou d'assurance", secret: "une cl\u00e9 d'acc\u00e8s", org: 'une entreprise', hr: 'une question RH', belief: 'une conviction personnelle',
        person: 'une personne', value: 'une information confidentielle', rows: 'autres lignes' },
    },
    it: {
      subj: { m: 'un uomo', f: 'una donna', x: 'una persona', pm: 'un paziente', pf: 'una paziente', px: 'una persona' },
      age: { kid: 'minorenne', young: 'giovane adulto', mid: 'di mezza et\u00e0', old: 'in et\u00e0 avanzata' },
      withWord: 'con',
      with: { chronic: 'una malattia cronica', psych: 'un disturbo psichico', serious: 'una malattia grave', med: 'una terapia farmacologica', preg: 'una gravidanza', other: 'una malattia' },
      one: { chronic: 'una malattia cronica', psych: 'un disturbo psichico', serious: 'una malattia grave', med: 'un farmaco', preg: 'una gravidanza', other: 'una malattia' },
      ageAlone: 'di mezza et\u00e0',
      v: { mail: 'un indirizzo e-mail', phone: 'un numero di telefono', bank: 'un conto bancario', address: 'un indirizzo', birth: 'una data di nascita',
        idnr: 'un numero di identit\u00e0 o di assicurazione', secret: 'una chiave di accesso', org: "un'azienda", hr: 'una questione HR', belief: 'una convinzione personale',
        person: 'una persona', value: "un'informazione riservata", rows: 'altre righe' },
    },
    pt: {
      subj: { m: 'um homem', f: 'uma mulher', x: 'uma pessoa', pm: 'um paciente', pf: 'uma paciente', px: 'uma pessoa' },
      age: { kid: 'menor de idade', young: 'jovem adulto', mid: 'de meia-idade', old: 'de idade avan\u00e7ada' },
      withWord: 'com',
      with: { chronic: 'uma doen\u00e7a cr\u00f4nica', psych: 'um transtorno ps\u00edquico', serious: 'uma doen\u00e7a grave', med: 'uso de medica\u00e7\u00e3o', preg: 'uma gravidez', other: 'uma doen\u00e7a' },
      one: { chronic: 'uma doen\u00e7a cr\u00f4nica', psych: 'um transtorno ps\u00edquico', serious: 'uma doen\u00e7a grave', med: 'um medicamento', preg: 'uma gravidez', other: 'uma doen\u00e7a' },
      ageAlone: 'de meia-idade',
      v: { mail: 'um endere\u00e7o de e-mail', phone: 'um n\u00famero de telefone', bank: 'uma conta banc\u00e1ria', address: 'um endere\u00e7o', birth: 'uma data de nascimento',
        idnr: 'um n\u00famero de identidade ou de seguro', secret: 'uma chave de acesso', org: 'uma empresa', hr: 'um assunto de RH', belief: 'uma convic\u00e7\u00e3o pessoal',
        person: 'uma pessoa', value: 'uma informa\u00e7\u00e3o confidencial', rows: 'mais linhas' },
    },
    es: {
      subj: { m: 'un hombre', f: 'una mujer', x: 'una persona', pm: 'un paciente', pf: 'una paciente', px: 'una persona' },
      age: { kid: 'menor de edad', young: 'joven adulto', mid: 'de mediana edad', old: 'de edad avanzada' },
      withWord: 'con',
      with: { chronic: 'una enfermedad cr\u00f3nica', psych: 'un trastorno ps\u00edquico', serious: 'una enfermedad grave', med: 'medicaci\u00f3n regular', preg: 'un embarazo', other: 'una enfermedad' },
      one: { chronic: 'una enfermedad cr\u00f3nica', psych: 'un trastorno ps\u00edquico', serious: 'una enfermedad grave', med: 'un medicamento', preg: 'un embarazo', other: 'una enfermedad' },
      ageAlone: 'de mediana edad',
      v: { mail: 'una direcci\u00f3n de correo', phone: 'un n\u00famero de tel\u00e9fono', bank: 'una cuenta bancaria', address: 'una direcci\u00f3n', birth: 'una fecha de nacimiento',
        idnr: 'un n\u00famero de identidad o de seguro', secret: 'una clave de acceso', org: 'una empresa', hr: 'un asunto de RR. HH.', belief: 'una convicci\u00f3n personal',
        person: 'una persona', value: 'un dato confidencial', rows: 'm\u00e1s filas' },
    },
  };

  // --- Gesundheitswoerter -> Gruppe (fest, mehrsprachig) ------------------------
  const HEALTH = {
    chronic: ['Diabetes', 'Diabetiker', 'Diabetikerin', 'diabetic', 'diab\u00e8te', 'diabete', 'diabetes', 'Asthma', 'asthme', 'asma', 'Hepatitis', 'h\u00e9patite', 'epatite', 'hepatite',
      'HIV', 'Aids', 'Epilepsie', 'epilepsy', '\u00e9pilepsie', 'epilessia', 'epilepsia', 'Multiple Sklerose', 'multiple sclerosis', 'scl\u00e9rose en plaques', 'Parkinson',
      'Rheuma', 'rheumatism', 'Morbus Crohn', 'Crohn', 'COPD', 'Niereninsuffizienz', 'Herzinsuffizienz', 'Bluthochdruck', 'hypertension', 'Hypertonie'],
    psych: ['Depression', 'Depressionen', 'depressiv', 'depressed', 'd\u00e9pression', 'depressione', 'depress\u00e3o', 'depresi\u00f3n', 'Burnout', 'Burn-out', 'Angstst\u00f6rung',
      'anxiety disorder', 'Panikst\u00f6rung', 'Schizophrenie', 'schizophrenia', 'schizophr\u00e9nie', 'schizofrenia', 'esquizofrenia', 'bipolar', 'bipolare', 'ADHS', 'ADHD',
      'TDAH', 'Autismus', 'autism', 'autisme', 'autismo', 'Essst\u00f6rung', 'eating disorder', 'Magersucht', 'anorexia', 'anorexie', 'Bulimie', 'bulimia',
      'Suchterkrankung', 'Alkoholsucht', 'alkoholabh\u00e4ngig', 'alcoholism', 'drogenabh\u00e4ngig', 'PTBS', 'PTSD'],
    serious: ['Krebs', 'Krebserkrankung', 'cancer', 'cancro', 'c\u00e2ncer', 'c\u00e1ncer', 'Tumor', 'tumeur', 'tumore', 'Leuk\u00e4mie', 'leukemia', 'leuc\u00e9mie', 'leucemia',
      'Herzinfarkt', 'heart attack', 'infarctus', 'infarto', 'Schlaganfall', 'stroke', 'AVC', 'ictus', 'Demenz', 'dementia', 'd\u00e9mence', 'demenza', 'dem\u00eancia',
      'demencia', 'Alzheimer', 'Chemotherapie', 'chemotherapy', 'chimioth\u00e9rapie', 'chemioterapia', 'quimioterapia'],
    med: ['Insulin', 'insuline', 'insulina', 'Metformin', 'metformine', 'metformina', 'Ritalin', 'Methylphenidat', 'methylphenidate', 'Antidepressiva', 'Antidepressivum',
      'antidepressant', 'antid\u00e9presseur', 'antidepressivo', 'antidepresivo', 'Sertralin', 'sertraline', 'Fluoxetin', 'fluoxetine', 'Citalopram', 'Escitalopram',
      'Lithium', 'Methadon', 'methadone', 'Marcumar', 'Levothyroxin', 'levothyroxine', 'Psychopharmaka', 'Opioide', 'opioids'],
    preg: ['schwanger', 'Schwangerschaft', 'pregnant', 'pregnancy', 'enceinte', 'grossesse', 'incinta', 'gravidanza', 'gr\u00e1vida', 'gravidez', 'embarazada', 'embarazo'],
  };
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ ]{1,2}');
  const HB = '(?<![\\p{L}\\p{N}])', HE = '(?![\\p{L}\\p{N}])';
  const HEALTH_GROUP = new Map();
  for (const [grp, list] of Object.entries(HEALTH)) for (const w of list) HEALTH_GROUP.set(w.toLowerCase(), grp);
  const HEALTH_RE = new RegExp(HB + '(?:' + Array.from(HEALTH_GROUP.keys()).sort((a, b) => b.length - a.length).map(esc).join('|') + ')' + HE, 'giu');

  // Alter: "45 Jahre (alt)", "45-j\u00e4hrig", "45 years old", "45 ans", "45 anni", "45 anos/a\u00f1os".
  const AGE_RE = /(?<![\p{L}\p{N}])([0-9]{1,3})[ -]?(?:j\u00e4hrige[rnms]?|j\u00e4hrig|Jahre[n]?(?:[ ]alt)?|J\.|years?(?:[ ]old)?|y\.?o\.?|ans|anni|anos|a\u00f1os)(?![\p{L}])/giu;
  const bucket = (n) => (n < 18 ? 'kid' : n < 30 ? 'young' : n < 60 ? 'mid' : 'old');

  // Anrede -> Geschlecht (m/f), sonst x.
  const FEM = /^(?:Frau|Fr\.|Mrs\.?|Ms\.?|Miss|Madame|Mme|Mademoiselle|Mlle|Signora|Sig\.ra|Senhora|Sra\.?|Se\u00f1ora|Dona|Do\u00f1a|Patientin|Mitarbeiterin|Kundin|Klientin|Bewerberin|Kollegin|patiente|paziente|paciente)(?![\p{L}])/iu;
  const MASC = /^(?:Herr|Herrn|Hr\.|Mr\.?|Monsieur|M\.|Signor|Sig\.|Senhor|Sr\.?|Se\u00f1or|Dom|Don|Patient|Mitarbeiter|Kunde|Klient|Bewerber|Kollege)(?![\p{L}])/iu;
  const gender = (s) => (FEM.test(s) ? 'f' : MASC.test(s) ? 'm' : 'x');

  // Generische Beschreibung eines Funds (Art -> Schluessel in T[l].v).
  function kindOf(f) {
    const d = DLX.engine && DLX.engine.findDetector ? DLX.engine.findDetector(f.id) : null;
    if (f.id === 'email') return 'mail';
    if (d && d.weak) return 'phone';
    if (f.id === 'iban' || f.cat === 'finanz') return 'bank';
    if (f.id === 'birthdate') return 'birth';
    if (f.id === 'postal_address' || f.id === 'address') return 'address';
    if (f.id === 'hr_record') return 'hr';
    if (f.id === 'art9_belief' || f.id === 'special_category') return 'belief';
    if (f.id === 'identity_combo' || f.id === 'person' || f.cat === 'person') return 'person';
    if (f.cat === 'sozial' || f.cat === 'id-national' || f.cat === 'reise' || f.cat === 'steuer') return 'idnr';
    if (f.cat === 'technik') return 'secret';
    if (f.cat === 'firma' || f.id === 'company') return 'org';
    if (f.cat === 'kontakt') return 'address';
    return 'value';
  }

  const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const atSentenceStart = (text, i) => /(?:^|[.!?]\s+|\n\s*)$/.test(text.slice(Math.max(0, i - 4), i));

  // text: Originaltext; findings: Funde der Pruefung (Regeln + lokale KI); lang: Sprache der
  // Oberflaeche. Ergebnis { text, n } - n = Anzahl Ersetzungen.
  function rephrase(text, findings, lang) {
    const L = T[lang] || T.en;
    const spans = [];   // { start, end, out, prio }
    const add = (start, end, out, prio) => { if (end > start) spans.push({ start, end, out, prio }); };
    const healthAt = [];
    let m;
    HEALTH_RE.lastIndex = 0;
    while ((m = HEALTH_RE.exec(text)) !== null && healthAt.length < 2000) healthAt.push({ start: m.index, end: m.index + m[0].length, grp: HEALTH_GROUP.get(m[0].toLowerCase()) || 'other' });
    const ages = [];
    AGE_RE.lastIndex = 0;
    while ((m = AGE_RE.exec(text)) !== null && ages.length < 2000) ages.push({ start: m.index, end: m.index + m[0].length, n: Number(m[1]) });

    // Personen: Namensstellen aus dem Paket context, Funde von Regeln und KI.
    const persons = [];
    const P = DLX.context && DLX.context.PERSON;
    if (P) {
      P.lastIndex = 0;
      while ((m = P.exec(text)) !== null && persons.length < 2000) {
        // Anrede/Rolle + Name: ganze Stelle; "Name: ..." und "... geb.": nur der Name.
        const gr = m.groups || {};
        const nm = gr.k || gr.b;
        const start = nm ? m.index + m[0].indexOf(nm) : m.index;
        persons.push({ start, end: nm ? start + nm.length : m.index + m[0].length, g: gender(m[0]) });
      }
    }
    for (const f of findings) {
      if (f.meta || !(f.end > f.start)) continue;
      if (f.id === 'identity_combo' || f.id === 'person') {
        const pre = text.slice(Math.max(0, f.start - 12), f.start).split(/\s+/).filter(Boolean).pop() || '';
        persons.push({ start: f.start, end: f.end, g: gender(pre) || 'x' });
      }
    }
    const healthIn = (a, b) => healthAt.some((h) => h.start >= a && h.end <= b);

    // Kombination Person [, Alter] [, Erkrankung] -> ein Satzteil (Beispiel im Kopf).
    const AFTER_AGE = /^[ ]{0,2}[,(][ ]{0,2}([0-9]{1,3})(?:[ -]?(?:j\u00e4hrig|Jahre(?:[ ]alt)?|J\.|years?(?:[ ]old)?|ans|anni|anos|a\u00f1os))?[ ]{0,2}\)?/iu;
    const LINK = /^[ ]{0,2}(?:[,;(][ ]{0,2})?(?:(?:mit|hat|leidet an|with|has|suffering from|avec|atteinte? de|con|affett[oa] da|com|tem)[ ]{1,2})?/iu;
    for (const p of persons) {
      // Personen in Anrede-Form beginnen mit der Anrede ("Herr Meier"); die ganze Stelle wird ersetzt.
      let end = p.end, age = null, health = null;
      const a = AFTER_AGE.exec(text.slice(end, end + 40));
      if (a) { age = bucket(Number(a[1])); end += a[0].length; }
      else {
        const ag = ages.find((x) => x.start >= end && x.start - end <= 4);
        if (ag) { age = bucket(ag.n); end = ag.end; }
      }
      const l = LINK.exec(text.slice(end, end + 40));
      const h = healthAt.find((x) => x.start >= end && x.start <= end + (l ? l[0].length : 0) + 1);
      if (h) { health = h.grp; end = h.end; }
      const near = health || healthIn(p.end, Math.min(text.length, p.end + 200));
      let out = L.subj[(near ? 'p' : '') + p.g];
      if (age) out += ' ' + L.age[age];
      if (health) out += ' ' + L.withWord + ' ' + L.with[health];
      add(p.start, end, out, 3);
    }
    for (const x of ages) add(x.start, x.end, L.age[bucket(x.n)], 1);
    for (const h of healthAt) add(h.start, h.end, L.one[h.grp] || L.one.other, 1);
    for (const f of findings) {
      if (f.meta || !(f.end > f.start)) continue;
      const k = kindOf(f);
      if (k === 'person') continue;
      if (f.id === 'art9_health' || f.id === 'health') {
        const h = healthAt.find((x) => x.start < f.end && x.end > f.start);
        add(f.start, f.end, L.one[h ? h.grp : 'other'], 2);
        continue;
      }
      add(f.start, f.end, f.rows ? '[' + L.v.rows + ']' : L.v[k], 2);
    }

    // Ueberlappungen: hoehere Prioritaet, dann laenger; von hinten nach vorne ersetzen.
    spans.sort((a, b) => b.prio - a.prio || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    const kept = [];
    for (const s of spans) if (kept.every((k) => s.end <= k.start || s.start >= k.end)) kept.push(s);
    kept.sort((a, b) => b.start - a.start);
    let out = text;
    for (const s of kept) out = out.slice(0, s.start) + (atSentenceStart(text, s.start) ? capFirst(s.out) : s.out) + out.slice(s.end);
    return { text: out, n: kept.length };
  }

  DLX.umformen = Object.freeze({ rephrase, kindOf, bucket, LANGS: Object.keys(T) });
})(globalThis);
