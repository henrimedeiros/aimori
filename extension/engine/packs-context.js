// Globales Paket context: kontextabhaengige Risiken.
// - identity_combo: Name + Geburtsdatum + Adresse/Telefon/Mail/Ausweis = Identitaet
// - art9_health, hr_record, art9_belief: besonders schuetzenswerte Inhalte, nur mit Personenbezug
// - mass_list: Listen/Tabellen mit vielen Mailadressen, Telefonnummern, IBANs oder Namen
// - postal_address: Postadresse, allein nur unsicher (grauer Hinweis)
// Design-Review Kontext 14.10.2026, Auflagen 1-14 mit Umsetzungsort in
// docs/sicherheit/design-review-kontext.md. Rein lokal, synchron, nichts gespeichert.
(function (g) {
  'use strict';
  const DLX = g.DLX;

  const MASS_MIN = 10, ID_PARTS = 3;    // Standard; Richtlinie massListMin / identityMinParts
  const MAX_CAND = 5000;                // Auflage 7: darueber direkt mass_list, Rest uebersprungen
  const MAX_N = 10000;                  // Anzahl hinaus nur gedeckelt (Auflage 4)
  const MAX_HITS = 2000;                // je Signal-Art
  const WIN_ART9 = 300, WIN_ID = 400;   // Auflage 9: Absatz geschnitten mit +-300 Zeichen

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&').replace(/ /g, '[ \\t]{1,3}');
  const alt = (list) => list.slice().sort((a, b) => b.length - a.length).map(esc).join('|');
  const B = '(?<![\\p{L}\\p{N}_])', E = '(?![\\p{L}\\p{N}_])';
  // Erster Buchstabe in beiden Schreibweisen, Rest wie geschrieben (Namen-Muster ohne i-Flag).
  const anyCase = (list) => list.map((w) => '[' + w[0].toUpperCase() + w[0].toLowerCase() + ']' + esc(w.slice(1))).join('|');

  // --- Normalisierung (Auflage 8) ------------------------------------------
  // Unsichtbare Zeichen weg, Sonder-Leerzeichen -> ' ', \r\n/\r -> \n, Vollbreite
  // und haeufige kyrillische/griechische Doppelgaenger -> Latein. map[i] = Index
  // im Originaltext, damit Funde auf den Originaltext zeigen.
  const HOMO = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd',
    'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'І': 'I', 'Ј': 'J', 'Ѕ': 'S',
    'ο': 'o', 'α': 'a', 'ν': 'v', 'ρ': 'p', 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
  };
  const isZw = (k) => k === 0xAD || k === 0x180E || (k >= 0x200B && k <= 0x200F) || (k >= 0x202A && k <= 0x202E) || (k >= 0x2060 && k <= 0x2064) || k === 0xFEFF;
  const isSp = (k) => k === 0xA0 || k === 0x1680 || (k >= 0x2000 && k <= 0x200A) || k === 0x202F || k === 0x205F || k === 0x3000;
  function norm(text) {
    const out = [], map = [];
    for (let i = 0; i < text.length; i++) {
      const k = text.charCodeAt(i);
      let c = text[i];
      if (isZw(k)) continue;
      if (k === 13) { if (text.charCodeAt(i + 1) === 10) continue; c = '\n'; }
      else if (isSp(k)) c = ' ';
      else if (k >= 0xFF01 && k <= 0xFF5E) c = String.fromCharCode(k - 0xFEE0);
      else if (k >= 0x370 && k <= 0x52F && HOMO[c]) c = HOMO[c];
      out.push(c);
      map.push(i);
    }
    map.push(text.length);
    return { s: out.join(''), map };
  }

  // --- Wortlisten (statisch, nie nachgeladen; Auflage 11) --------------------
  const HEALTH = [
    // de
    'Diagnose', 'diagnostiziert', 'Befund', 'Arztzeugnis', 'Arztbericht', 'Krankengeschichte', 'Patientenakte', 'Krankenakte', 'erkrankt an', 'leidet an',
    'Diabetes', 'Krebs', 'Krebserkrankung', 'Tumor', 'Leukämie', 'Depression', 'Depressionen', 'depressiv', 'Burnout', 'Burn-out', 'Angststörung', 'Panikstörung',
    'Essstörung', 'Magersucht', 'Bulimie', 'Schizophrenie', 'bipolar', 'ADHS', 'Autismus', 'Demenz', 'Alzheimer', 'Parkinson', 'Multiple Sklerose', 'Epilepsie',
    'HIV', 'Aids', 'Hepatitis', 'Asthma', 'Herzinfarkt', 'Schlaganfall', 'schwanger', 'Schwangerschaft', 'Fehlgeburt', 'Suchterkrankung', 'alkoholabhängig',
    'Alkoholsucht', 'drogenabhängig', 'Chemotherapie', 'Psychotherapie', 'psychiatrisch', 'Insulin', 'Metformin', 'Ritalin', 'Methylphenidat', 'Antidepressiva',
    'Antidepressivum', 'Sertralin', 'Fluoxetin', 'Citalopram', 'Escitalopram', 'Lithium', 'Methadon', 'Marcumar', 'Levothyroxin', 'Psychopharmaka',
    // en
    'diagnosis', 'diagnosed', 'medical record', 'medical history', 'suffers from', 'cancer', 'tumour', 'leukemia', 'leukaemia', 'depressed', 'anxiety disorder',
    'panic disorder', 'eating disorder', 'anorexia', 'bulimia', 'schizophrenia', 'ADHD', 'autism', 'dementia', 'multiple sclerosis', 'epilepsy', 'heart attack',
    'pregnant', 'pregnancy', 'miscarriage', 'addiction', 'alcoholism', 'chemotherapy', 'psychotherapy', 'psychiatric', 'antidepressants', 'antidepressant',
    'methylphenidate', 'sertraline', 'fluoxetine', 'methadone', 'warfarin', 'levothyroxine',
    // fr
    'diagnostic', 'diagnostiqué', 'diagnostiquée', 'dossier médical', 'atteint de', 'atteinte de', 'souffre de', 'tumeur', 'leucémie', 'dépression', 'dépressif',
    'trouble anxieux', 'schizophrénie', 'TDAH', 'autisme', 'démence', 'sclérose en plaques', 'épilepsie', 'hépatite', 'asthme', 'infarctus', 'AVC', 'enceinte',
    'grossesse', 'fausse couche', 'chimiothérapie', 'psychothérapie', 'antidépresseurs',
    // it
    'diagnosi', 'diagnosticato', 'diagnosticata', 'cartella clinica', 'affetto da', 'affetta da', 'soffre di', 'cancro', 'tumore', 'leucemia', 'depressione',
    'schizofrenia', 'autismo', 'demenza', 'sclerosi multipla', 'epilessia', 'epatite', 'infarto', 'ictus', 'incinta', 'gravidanza', 'aborto spontaneo',
    'chemioterapia', 'psicoterapia', 'antidepressivi',
    // es
    'diagnóstico', 'diagnosticado', 'diagnosticada', 'historia clínica', 'padece', 'cáncer', 'depresión', 'esquizofrenia', 'demencia', 'esclerosis múltiple',
    'epilepsia', 'embarazada', 'embarazo', 'aborto espontáneo', 'quimioterapia', 'antidepresivos',
    // pt
    'prontuário', 'sofre de', 'câncer', 'depressão', 'demência', 'esclerose múltipla', 'hepatite', 'enfarte', 'grávida', 'gravidez', 'antidepressivos',
    // nl
    'gediagnosticeerd', 'medisch dossier', 'lijdt aan', 'kanker', 'leukemie', 'depressie', 'schizofrenie', 'autisme', 'dementie', 'zwanger', 'zwangerschap',
    'miskraam', 'antidepressiva',
  ];
  const HR = [
    'Kündigung', 'fristlose Kündigung', 'gekündigt', 'Kündigungsschreiben', 'Aufhebungsvertrag', 'Abmahnung', 'abgemahnt', 'Verwarnung', 'Lohn', 'Löhne', 'Gehalt',
    'Gehälter', 'Salär', 'Monatslohn', 'Jahreslohn', 'Lohnabrechnung', 'Lohnausweis', 'Lohnerhöhung', 'Gehaltserhöhung', 'Gehaltsabrechnung', 'Lohnpfändung',
    'Leistungsbeurteilung', 'Mitarbeiterbeurteilung', 'Mitarbeitergespräch', 'Qualifikationsgespräch', 'Arbeitszeugnis', 'Zwischenzeugnis', 'Krankmeldung',
    'krankgeschrieben', 'Arbeitsunfähigkeit', 'arbeitsunfähig', 'Disziplinarmassnahme', 'Disziplinarmaßnahme',
    'termination', 'terminated', 'dismissal', 'dismissed', 'fired', 'layoff', 'laid off', 'written warning', 'final warning', 'disciplinary', 'salary', 'salaries',
    'wage', 'wages', 'pay rise', 'pay raise', 'payslip', 'pay slip', 'performance review', 'performance appraisal', 'appraisal', 'performance improvement plan',
    'sick note', 'sick leave',
    'licenciement', 'licencié', 'licenciée', 'rupture conventionnelle', 'avertissement', 'salaire', 'rémunération', 'fiche de paie', 'bulletin de salaire',
    'augmentation de salaire', 'évaluation annuelle', 'entretien annuel', 'arrêt maladie', 'arrêt de travail', 'certificat de travail', 'mesure disciplinaire',
    'licenziamento', 'licenziato', 'licenziata', 'richiamo disciplinare', 'lettera di richiamo', 'stipendio', 'retribuzione', 'busta paga', 'aumento di stipendio',
    'valutazione delle prestazioni', 'certificato di malattia', 'provvedimento disciplinare',
    'despido', 'despedido', 'despedida', 'amonestación', 'salario', 'sueldo', 'nómina', 'aumento de sueldo', 'evaluación de desempeño', 'baja médica',
    'baja por enfermedad', 'sanción disciplinaria',
    'demissão', 'demitido', 'demitida', 'despedimento', 'advertência', 'salário', 'folha de pagamento', 'recibo de vencimento', 'aumento salarial',
    'avaliação de desempenho', 'atestado médico', 'processo disciplinar',
    'ontslag', 'ontslagen', 'salaris', 'loon', 'loonstrook', 'salarisverhoging', 'beoordelingsgesprek', 'functioneringsgesprek', 'ziekmelding', 'ziekgemeld',
    'arbeidsongeschikt',
  ];
  const BELIEF = [
    'Konfession', 'konfessionslos', 'Religionszugehörigkeit', 'Glaubensbekenntnis', 'katholisch', 'römisch-katholisch', 'evangelisch', 'reformiert',
    'protestantisch', 'muslimisch', 'Muslimin', 'jüdisch', 'Jüdin', 'buddhistisch', 'hinduistisch', 'Kirchenaustritt', 'Zeugen Jehovas', 'Parteimitglied',
    'Parteimitgliedschaft', 'Parteizugehörigkeit', 'Mitglied der Partei', 'politische Gesinnung', 'politische Einstellung', 'politische Überzeugung',
    'Gewerkschaft', 'Gewerkschaftsmitglied', 'gewerkschaftlich organisiert',
    'religion', 'religious beliefs', 'religious affiliation', 'catholic', 'protestant', 'muslim', 'jewish', 'hindu', 'buddhist', 'atheist', 'party member',
    'party membership', 'political affiliation', 'political views', 'political opinions', 'trade union', 'labor union', 'labour union', 'union member',
    'union membership',
    'catholique', 'protestante', 'musulman', 'musulmane', 'juif', 'juive', 'athée', 'membre du parti', 'adhérent du parti', 'opinions politiques',
    'appartenance politique', 'syndicat', 'syndiqué', 'syndiquée',
    'religione', 'cattolico', 'cattolica', 'musulmano', 'musulmana', 'ebreo', 'ebrea', 'iscritto al partito', 'iscritta al partito', 'orientamento politico',
    'opinioni politiche', 'sindacato', 'iscritto al sindacato', 'iscritta al sindacato',
    'religión', 'católico', 'católica', 'musulmán', 'judío', 'judía', 'afiliado al partido', 'afiliada al partido', 'afiliación política', 'ideología política',
    'sindicato', 'afiliación sindical',
    'religião', 'muçulmano', 'muçulmana', 'judeu', 'judia', 'filiado ao partido', 'filiada ao partido', 'filiação partidária', 'orientação política',
    'sindicalizado', 'sindicalizada', 'filiação sindical',
    'geloofsovertuiging', 'religie', 'katholiek', 'moslim', 'joods', 'partijlid', 'politieke voorkeur', 'politieke overtuiging', 'vakbond', 'vakbondslid',
  ];
  const TRIGGER = [['art9_health', HEALTH], ['hr_record', HR], ['art9_belief', BELIEF]].map(([id, list]) => ({ id, re: new RegExp(B + '(?:' + alt(list) + ')' + E, 'giu') }));
  // ICD-10-Code nur mit ICD/Diagnose-Wort direkt davor.
  const ICD = new RegExp(B + '(?:ICD(?:-1[01])?(?:-GM|-CM)?|' + anyCase(['diagnose', 'diagnosis', 'diagnostic', 'diagnosi', 'diagnóstico', 'dx']) + ')' +
    '[ \\t]{0,3}(?:[Cc]ode|Kode|Schlüssel)?[ \\t:=#]{0,4}(?<icd>[A-TV-Z][0-9]{2}(?:\\.[0-9A-Z]{1,4})?)' + E, 'dgu');
  const TRIGGER_WORDS = new Set(HEALTH.concat(HR, BELIEF).map((w) => w.toLowerCase()));

  // --- Personenbezug ---------------------------------------------------------
  // \p{M}: zerlegte Umlaute (u + U+0308) zaehlen wie ein Zeichen, ohne den Text
  // umzuschreiben (Offsets bleiben gueltig; Design-Review Anrede 14.10.2026, Auflage 1).
  const CAP = '\\p{Lu}\\p{M}{0,2}\\p{Ll}[\\p{L}\\p{M}\'’-]{0,29}';
  const NAME = (gr) => '(?<' + gr + '>' + CAP + '(?:[ ]' + CAP + '){0,2})';
  // Nach einer Anrede auch GANZ GROSS ("Herr XY", "Frau MÜLLER-BEISPIEL"): mindestens
  // zwei Buchstaben, Bindestrich/Apostroph nur zwischen Buchstaben (Auflage 2).
  const UP = '\\p{Lu}\\p{M}{0,2}';
  const UPPER = UP + '(?:[\'’-]?' + UP + '){1,29}';
  const TNAME = '(?<t>(?:' + CAP + '|' + UPPER + ')(?:[ ](?:' + CAP + '|' + UPPER + ')){0,2})';
  const TITLES = ['Herr', 'Herrn', 'Frau', 'Hr.', 'Fr.', 'Mr', 'Mr.', 'Mrs', 'Mrs.', 'Ms', 'Ms.', 'Miss', 'Mx.', 'Monsieur', 'Madame', 'Mademoiselle', 'M.',
    'Mme', 'Mme.', 'Mlle', 'Mlle.', 'Signor', 'Signore', 'Signora', 'Signorina', 'Sig.', 'Sig.ra', 'Sr.', 'Sra.', 'Srta.', 'Señor', 'Señora', 'Señorita',
    'Doña', 'Senhor', 'Senhora', 'Dhr.', 'Mevr.', 'Mevrouw', 'Meneer', 'Dr.'];
  // "eine Frau", "der Herr" sind keine Anrede.
  const DET = '(?<!(?:[Ee]in|[Ee]ine|[Ee]iner|[Ee]inem|[Ee]inen|[Dd]ie|[Dd]er|[Dd]en|[Dd]em|[Dd]es|[Jj]ede|[Jj]eder|[Jj]edem|[Dd]iese|[Dd]ieser|[Ww]elche|[Kk]eine|[Mm]eine|[Ss]eine|[Ii]hre|[Uu]nsere|[Aa]lte|[Jj]unge|[Tt]he|[Aa]|[Uu]ne|[Ll]a|[Uu]na)[ ]{1,3})';
  // Akademische Titel samt Zusatz ("Dr. med.", "Dr. h.c."), hoechstens zwei (Auflage 3).
  const ZUS = '(?:[ ]?(?:med|phil|iur|jur|rer|nat|sc|dent|vet|oec|pol|h\\.[ ]?c)\\.){0,3}';
  const ACAD = ZUS + '[ ]{0,2}(?:(?:Dr|Prof|Dott|Ing|Dra)\\.?' + ZUS + '[ ]{1,2}){0,2}';
  // Woerter direkt nach der Anrede, die kein Name sind ("Herr Doktor", "Frau CEO",
  // "Fr. CHF"); Vergleich klein geschrieben, auch fuer GROSS. Kann eine Meldung nur
  // unterdruecken, nie ausloesen (Auflage 3).
  const NOT_NAME = new Set(['doktor', 'doktorin', 'professor', 'professorin', 'direktor', 'direktorin', 'präsident', 'präsidentin', 'pfarrer', 'pfarrerin',
    'ober', 'kollege', 'kollegin', 'nachbar', 'nachbarin', 'lehrer', 'lehrerin', 'minister', 'ministerin', 'bundesrat', 'bundesrätin', 'richter', 'richterin',
    'anwalt', 'anwältin', 'chef', 'chefin', 'kunde', 'kundin', 'patient', 'patientin', 'mitarbeiter', 'mitarbeiterin', 'gott',
    'president', 'director', 'doctor', 'officer', 'chairman', 'sir', 'madam', 'dottore', 'dottoressa', 'avvocato', 'ingegnere', 'docteur', 'maître',
    'doutor', 'doutora', 'le', 'la', 'ceo', 'cfo', 'cto', 'coo', 'hr', 'it', 'ag', 'gmbh', 'sa', 'ltd', 'ok', 'chf', 'eur', 'usd',
    'google', 'oetker', 'house', 'who', 'watson']);
  const NAME_KEYS = ['Name', 'Vorname', 'Nachname', 'Familienname', 'Full name', 'First name', 'Last name', 'Surname', 'Given name', 'Nom', 'Prénom',
    'Nom de famille', 'Nome', 'Cognome', 'Nombre', 'Apellido', 'Apellidos', 'Sobrenome', 'Naam', 'Voornaam', 'Achternaam', 'Patient', 'Patientin',
    'Mitarbeiter', 'Mitarbeiterin', 'Employee', 'Arbeitnehmer', 'Arbeitnehmerin', 'Versicherte', 'Versicherter', 'Paziente', 'Paciente', 'Patiënt'];
  const ROLES = ['Patient', 'Patientin', 'Mitarbeiter', 'Mitarbeiterin', 'Angestellte', 'Angestellter', 'Kollege', 'Kollegin', 'Kunde', 'Kundin', 'Klient', 'Klientin',
    'Bewerber', 'Bewerberin', 'Lernende', 'Lernender', 'Lehrling', 'Vorgesetzte', 'Vorgesetzter', 'Chef', 'Chefin',
    'patient', 'employee', 'colleague', 'coworker', 'co-worker', 'applicant', 'candidate', 'client', 'customer', 'staff member', 'team member', 'manager', 'boss',
    'patiente', 'salarié', 'salariée', 'employé', 'employée', 'collaborateur', 'collaboratrice', 'collègue', 'candidat', 'candidate',
    'paziente', 'dipendente', 'collega', 'candidato', 'candidata', 'cliente', 'collaboratore', 'collaboratrice',
    'paciente', 'empleado', 'empleada', 'trabajador', 'trabajadora', 'compañero', 'compañera',
    'funcionário', 'funcionária', 'colaborador', 'colaboradora', 'colega',
    'medewerker', 'medewerkster', 'werknemer', 'collega', 'patiënt', 'klant'];
  const POSS = ['mein', 'meine', 'meinem', 'meinen', 'meiner', 'unser', 'unsere', 'unserem', 'unseren', 'unserer', 'dein', 'deine', 'euer', 'eure',
    'my', 'our', 'his', 'her', 'their', 'mon', 'ma', 'notre', 'son', 'sa', 'leur', 'il mio', 'la mia', 'il nostro', 'la nostra', 'il suo', 'la sua',
    'mio', 'mia', 'nostro', 'nostra', 'mi', 'nuestro', 'nuestra', 'su', 'meu', 'minha', 'nosso', 'nossa', 'o meu', 'a minha', 'o nosso', 'a nossa',
    'mijn', 'onze', 'ons'];
  // Verbreitete Vornamen (keine echten Personen aus dem Umfeld; Auflage 11).
  const FIRST = ['Anna', 'Maria', 'Max', 'Peter', 'Thomas', 'Michael', 'Daniel', 'David', 'Martin', 'Andreas', 'Stefan', 'Christian', 'Markus', 'Lukas',
    'Laura', 'Sarah', 'Julia', 'Lisa', 'Sandra', 'Nicole', 'Petra', 'Claudia', 'Sabine', 'Monika', 'Ursula', 'Hans', 'Klaus', 'Wolfgang', 'Erika', 'Elena',
    'Sofia', 'Luca', 'Marco', 'Giuseppe', 'Giovanni', 'Francesca', 'Chiara', 'Paolo', 'Jean', 'Pierre', 'Marie', 'Sophie', 'Louis', 'Nicolas', 'Camille',
    'Julien', 'Isabelle', 'Nathalie', 'Philippe', 'John', 'James', 'Robert', 'William', 'Mary', 'Jennifer', 'Linda', 'Elizabeth', 'Susan', 'Jessica',
    'Emily', 'Emma', 'Olivia', 'Noah', 'Liam', 'Oliver', 'Jack', 'Harry', 'George', 'José', 'Juan', 'Carlos', 'Luis', 'Javier', 'Carmen', 'Ana',
    'Lucía', 'Pablo', 'João', 'Pedro', 'Paulo', 'Mariana', 'Beatriz', 'Gabriel', 'Rafael', 'Fernanda', 'Jan', 'Pieter', 'Sanne', 'Mohammed', 'Ahmed',
    'Fatima', 'Mehmet', 'Ayşe', 'Jane', 'Joe', 'Erik', 'Lars', 'Anders', 'Ingrid'];
  const BIRTH = ['geb.', 'geboren', 'born', 'b.', 'DOB', 'né', 'née', 'nato', 'nata', 'nacido', 'nacida', 'nascido', 'nascida', 'geboren op'];
  const NOT_FIRST = '(?!(?:Der|Die|Das|Den|Dem|Des|Ein|Eine|Unser|Unsere|Mein|Meine|Diese|Dieser|The|This|That|Our|My|Le|La|Les|Un|Une|Il|Lo|Gli|El|Los|Las|De|Het|Een)[ ])';
  // Jede Alternative beginnt mit einem Grossbuchstaben: Vorpruefung (?=\p{Lu}) spart Laufzeit
  // (Rollen hier nur gross; "patient Anna Muster" findet die Vornamen-Alternative).
  const PERSON_STRONG = new RegExp('(?=\\p{Lu})(?:' +
    DET + B + '(?:' + TITLES.map(esc).join('|') + ')[ ]{1,2}' + ACAD + TNAME + '(?![\\p{L}\\p{N}_\'’-])' +
    '|' + B + '(?:' + NAME_KEYS.map(esc).join('|') + ')[ ]{0,2}[:：][ ]{0,3}' + NAME('k') + E +
    '|' + B + '(?:' + ROLES.map((w) => esc(w[0].toUpperCase() + w.slice(1))).join('|') + ')[ ]{1,2}(?<r>(?:' + FIRST.map(esc).join('|') + ')(?:[ ]' + CAP + ')?)' + E +
    '|' + B + '(?<f>(?:' + FIRST.map(esc).join('|') + ')[ ]' + CAP + ')' + E +
    '|' + B + NOT_FIRST + '(?<b>' + CAP + '[ ]' + CAP + '(?:[ ]' + CAP + ')?)[ ]?,?[ ]{0,2}\\(?[ ]?(?:' + BIRTH.map(esc).join('|') + ')(?![\\p{L}])' +
    ')', 'gu');
  // Schwache Signale (Auflage 9 a-c): Possessiv + Rolle, Anrede + Initiale, Personal-/Patientennummer.
  const ID_KEYS = ['Personalnummer', 'Personal-Nr.', 'Pers.-Nr.', 'Pers.Nr.', 'Patientennummer', 'Patienten-Nr.', 'Versichertennummer', 'Versicherten-Nr.',
    'Mitarbeiternummer', 'MA-Nr.', 'employee id', 'employee number', 'employee no.', 'staff id', 'staff number', 'patient id', 'patient number',
    'member id', 'matricule', 'numéro de patient', 'numéro de salarié', 'numéro d\'employé', 'matricola', 'numero di paziente', 'numero dipendente',
    'número de empleado', 'número de paciente', 'número de funcionário', 'número do paciente', 'personeelsnummer', 'patiëntnummer'];
  const PERSON_WEAK = new RegExp(
    B + '(?:' + POSS.map(esc).join('|') + ')[ ]{1,2}(?:' + ROLES.map(esc).join('|') + ')' + E +
    '|' + B + '(?:' + TITLES.map(esc).join('|') + ')[ ]{1,2}\\p{Lu}\\.' +
    '|' + B + '(?:' + ID_KEYS.map(esc).join('|') + ')[ ]{0,2}[:#]?[ ]{0,2}[A-Z]{0,3}-?\\d{3,12}' + E,
    'giu');
  // Kategorien sicherer Grundfunde, die eine Person erkennbar machen.
  const PERSON_CATS = new Set(['kontakt', 'sozial', 'id-national', 'reise']);

  // --- Massenlisten ------------------------------------------------------------
  const NAME_COLS = new RegExp(B + '(?:' + alt(['vorname', 'nachname', 'familienname', 'first name', 'firstname', 'first_name', 'last name', 'lastname',
    'last_name', 'surname', 'given name', 'family name', 'full name', 'fullname', 'prénom', 'prenom', 'nom de famille', 'cognome', 'nome e cognome',
    'apellido', 'apellidos', 'nombre y apellidos', 'sobrenome', 'nome completo', 'voornaam', 'achternaam', 'contact name', 'kontaktperson',
    'ansprechpartner']) + ')' + E, 'iu');
  const JSON_NAME = /"(first_?name|last_?name|given_?name|family_?name|full_?name|surname|vorname|nachname|pr[eé]nom|cognome|apellidos?|sobrenome|voornaam|achternaam)"[ \t]{0,3}:[ \t]{0,3}"([^"\n]{1,80})"/giu;
  const SEPS = [';', '\t', '|', ','];

  // --- Postadresse (Grunddetektor, allein unsicher) ------------------------
  const PLZ_ORT = '(?:[A-Z]{1,2}-)?\\d{4,5}(?:-\\d{3})?(?:[ ][A-Z]{2})?[ ]\\p{Lu}[\\p{L}\'’-]{1,30}';
  const SUFFIX = ['strasse', 'straße', 'gasse', 'weg', 'platz', 'allee', 'ring', 'rain', 'graben', 'straat', 'laan', 'plein', 'gracht', 'kade', 'dijk'];
  const SUFFIX_WORD = ['Strasse', 'Straße', 'Gasse', 'Weg', 'Platz', 'Allee'];
  const ROMAN = ['rue', 'avenue', 'boulevard', 'chemin', 'route', 'place', 'impasse', 'allée', 'quai', 'via', 'viale', 'piazza', 'corso', 'vicolo', 'calle',
    'avenida', 'plaza', 'paseo', 'carrer', 'rua', 'travessa', 'praça', 'largo', 'estrada'];
  const EN_STREET = ['Street', 'St.', 'Road', 'Rd.', 'Avenue', 'Ave.', 'Lane', 'Drive', 'Boulevard', 'Blvd.', 'Way', 'Court', 'Place', 'Terrace', 'Close', 'Crescent'];
  const ADDR_KEYS = ['Adresse', 'Anschrift', 'Wohnadresse', 'Wohnort', 'wohnhaft in', 'wohnhaft an', 'Address', 'Home address', 'domicile', 'indirizzo',
    'residente in', 'dirección', 'domicilio', 'endereço', 'morada', 'adres'];
  const NR = '[ ]\\d{1,4}[a-zA-Z]?';
  const SEPP = '(?:[ ]?,[ ]?|[ ]{1,2})';
  const ADDRESS = new RegExp(
    B + '(?:\\p{Lu}[\\p{L}-]{0,40}(?:' + SUFFIX.join('|') + ')|\\p{Lu}[\\p{L}-]{0,40}str\\.|(?:\\p{Lu}[\\p{L}-]{1,30}[ ]){1,2}(?:' + SUFFIX_WORD.join('|') + '))' + NR + SEPP + PLZ_ORT +
    '|' + B + '(?:' + anyCase(ROMAN) + ')[ ](?:[\\p{L}\'’.-]{1,25}[ ]){1,4}?\\d{1,4}[a-zA-Z]?' + SEPP + PLZ_ORT +
    '|' + B + '\\d{1,4}(?:[ ]?(?:bis|ter))?,?[ ](?:' + anyCase(ROMAN) + ')[ ](?:[\\p{L}\'’.-]{1,25}[ ]?){1,4}?,?[ ]\\d{5}[ ]\\p{Lu}[\\p{L}\'’-]{1,30}' +
    '|' + B + '\\d{1,5}[ ](?:\\p{Lu}[\\p{L}.\'-]{0,30}[ ]){1,3}(?:' + EN_STREET.map(esc).join('|') + ')(?![\\p{L}\\p{N}_])' +
    '|' + B + '(?:' + anyCase(ADDR_KEYS) + ')[ ]?:?[ ]{1,3}(?:[\\p{L}\'’.-]{1,25}[ ]){1,4}?\\d{1,4}[a-zA-Z]?' + SEPP + PLZ_ORT,
    'gu');

  const NEVER = /(?!)/g;   // abgeleitete Typen: kein eigenes Muster (engine.scan ueberspringt derived)
  const D = (id, cat, en, de, extra) => Object.assign({ id, cat, cls: 'hoch', re: NEVER, derived: true, name: { en, de } }, extra || {});
  DLX.registerPack({
    id: 'context', kind: 'global',
    detectors: [
      { id: 'postal_address', cat: 'kontakt', cls: 'mittel', re: ADDRESS, alone: 'unsure', pre: /[G-Zg-z\u0080-\uffff]/,
        name: { en: 'Postal address', de: 'Postadresse' } },
      D('identity_combo', 'person', 'Identity: name + date of birth + address/phone/ID', 'Identität: Name + Geburtsdatum + Adresse/Telefon/Ausweis'),
      D('art9_health', 'gesundheit', 'Health data about a person (diagnosis, medication)', 'Gesundheitsdaten zu einer Person (Diagnose, Medikament)'),
      D('hr_record', 'person', 'HR data about a person (dismissal, salary, appraisal, sick note)', 'Personaldaten zu einer Person (Kündigung, Lohn, Beurteilung, Krankmeldung)'),
      D('art9_belief', 'person', 'Religion, political views or union membership of a person', 'Religion, politische Ansicht oder Gewerkschaft einer Person'),
      D('mass_list', 'person', 'Customer list / export (many entries)', 'Kundenliste/Export (viele Einträge)'),
      // Zellen heikler Spalten einer Personen-Tabelle (engine/tabelle.js, Design-Review 16.10.2026).
      D('mass_table', 'person', 'Table column with personal data', 'Tabellenspalte mit Personendaten'),
    ],
  });

  // --- Ableitung -------------------------------------------------------------
  class Timeout extends Error {}
  const LETTERS = /[G-Zg-z\u0080-\uffff]/;
  const NEEDS_NORM = /[\r\u00a0\u00ad\u0370-\u052f\u1680\u180e\u2000-\u206f\u3000\ufeff-\uffff]/;
  // Erster Index mit start >= a (arr nach start sortiert).
  function lower(arr, a) {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid].start < a) lo = mid + 1; else hi = mid; }
    return lo;
  }
  const hasIn = (arr, a, b) => { const i = lower(arr, a); return i < arr.length && arr[i].start < b; };
  const byStart = (a, b) => a.start - b.start;

  // text: Originaltext; cands: Grundkandidaten aller Pakete (auch die per "Kein
  // sensibler Wert" ausgeblendeten, Auflage 2); opts: { massMin, idParts };
  // act(id) -> Aktion. Ergebnis { add, meta, upgrade } oder Ausnahme (dann
  // verwirft engine.scan alles Abgeleitete, Auflage 1).
  function derive(text, cands, opts, deadline, clock, act) {
    const tick = () => { if (clock() > deadline) throw new Timeout('timeout'); };
    const massMin = opts && Number.isInteger(opts.massMin) ? opts.massMin : MASS_MIN;
    const idParts = opts && Number.isInteger(opts.idParts) ? opts.idParts : ID_PARTS;
    const add = [], meta = [], upgrade = [];
    // Telefon-Typen (weak) einmal je Lauf statt Detektor-Suche je Kandidat (Laufzeit).
    const phones = new Set();
    for (const p of Object.values(DLX.packs)) for (const d of p.detectors) if (d.weak) phones.add(d.id);
    const listType = (c) => (c.id === 'email' ? 'email' : c.id === 'iban' ? 'iban' : phones.has(c.id) ? 'phone' : null);
    const massAct = act('mass_list');
    // Auflage 7: zu viele Kandidaten -> direkt mass_list, Rest uebersprungen.
    if (cands.length > MAX_CAND) {
      if (massAct !== 'off') meta.push({ id: 'mass_list', cat: 'person', start: 0, end: text.length, n: Math.min(MAX_N, cands.length), action: massAct, sure: true, meta: true });
      return { add, meta, upgrade };
    }
    // Ohne Buchstaben ausser a-f gibt es weder Namen noch Stichworte (reine Ziffern-/Hex-Texte
    // wie Hashes und IDs): nur die Listen-Zaehlung, die grossen Muster werden dann nicht
    // einmal kompiliert (~10 ms). Ohne Zeichen, die norm() aendert, gilt der Text selbst.
    const letters = LETTERS.test(text);
    const N = !letters ? { s: '', map: null } : NEEDS_NORM.test(text) ? norm(text) : { s: text, map: null };
    const s = N.s, map = N.map;
    const o = map ? (i) => map[i] : (i) => i;
    const oe = map ? (i) => (i > 0 ? map[i - 1] + 1 : 0) : (i) => i;
    tick();

    // Absaetze (Leerzeile) in Originalkoordinaten.
    const breaks = [0];
    const PARA = /\n[ \t]*\n/g;
    let m;
    while (letters && (m = PARA.exec(s)) !== null) breaks.push(o(m.index + m[0].length));
    breaks.push(text.length + 1);
    const paraOf = (pos) => {
      let lo = 0, hi = breaks.length - 1;
      while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (breaks[mid] <= pos) lo = mid; else hi = mid; }
      return [breaks[lo], breaks[hi]];
    };

    // Personen: stark (Name) und schwach.
    const strong = [], names = [], whole = [], weak = [];   // whole: ganze Namensstelle inkl. Stichwort
    PERSON_STRONG.lastIndex = 0;
    while (letters && (m = PERSON_STRONG.exec(s)) !== null && strong.length < MAX_HITS) {
      const gr = m.groups;
      let full = gr.t || gr.k || gr.r || gr.f || gr.b;
      if (!full) continue;
      let ws = full.split(' ');
      // Anrede + Nicht-Name ("Herr Doktor Muster" -> "Muster", "Herr Doktor" -> nichts).
      if (gr.t) {
        let k = 0;
        while (k < ws.length && NOT_NAME.has(ws[k].toLowerCase())) k++;
        if (k === ws.length) continue;
        if (k) { ws = ws.slice(k); full = ws.join(' '); }
      }
      // Name endet vor dem ersten Stichwort ("Frau Muster Kuendigung").
      const cut = ws.findIndex((w) => TRIGGER_WORDS.has(w.toLowerCase()));
      const nm = cut === -1 ? full : ws.slice(0, cut).join(' ');
      if (!nm) continue;
      const ns = m.index + m[0].indexOf(full);
      const p = { start: o(ns), end: oe(ns + nm.length) };
      strong.push(p);
      names.push(p);
      whole.push({ start: p.start, end: oe(m.index + m[0].indexOf(full) + full.length) });
    }
    tick();
    PERSON_WEAK.lastIndex = 0;
    while (letters && (m = PERSON_WEAK.exec(s)) !== null && weak.length < MAX_HITS) weak.push({ start: o(m.index), end: oe(m.index + m[0].length) });
    for (const c of cands) if (c.sure && !c.ignored && PERSON_CATS.has(c.cat) && c.id !== 'postal_address') strong.push(c);
    strong.sort(byStart);
    weak.sort(byStart);
    names.sort(byStart);
    whole.sort(byStart);
    tick();

    // 1. Besonders schuetzenswerte Inhalte (Art. 9) und Personaldaten: nur mit Personenbezug.
    // Ein Stichwort in einer Namensstelle ("Herr Max Parkinson") ist ein Name, kein Fund.
    const overlapsName = (a, b) => { const i = lower(whole, a - 200); for (let k = i; k < whole.length && whole[k].start < b; k++) if (whole[k].end > a) return true; return false; };
    const hit = (id, a, b) => {
      const action = act(id);
      if (action === 'off' || overlapsName(a, b)) return;
      const [ps, pe] = paraOf(a);
      const ws = Math.max(ps, a - WIN_ART9), we = Math.min(pe, b + WIN_ART9);
      if (hasIn(strong, ws, we)) add.push({ id, cat: id === 'art9_health' ? 'gesundheit' : 'person', start: a, end: b, action, sure: true });
      else if (hasIn(weak, ws, we)) add.push({ id, cat: id === 'art9_health' ? 'gesundheit' : 'person', start: a, end: b, action, sure: false });
    };
    // Ohne jedes Personen-Signal kann kein Stichwort gemeldet werden: Suche sparen.
    const anyone = strong.length > 0 || weak.length > 0;
    for (const T of TRIGGER) {
      if (!anyone) break;
      T.re.lastIndex = 0;
      let n = 0;
      while (letters && (m = T.re.exec(s)) !== null && n++ < MAX_HITS) {
        hit(T.id, o(m.index), oe(m.index + m[0].length));
        if ((n & 255) === 0) tick();
      }
      tick();
    }
    ICD.lastIndex = 0;
    let ni = 0;
    while (anyone && (m = ICD.exec(s)) !== null && ni++ < MAX_HITS) {
      const [a, b] = m.indices.groups.icd;
      hit('art9_health', o(a), oe(b));
    }
    tick();

    // 2. Identitaet: Name + Geburtsdatum + weitere Teile im Umkreis.
    const idAct = act('identity_combo');
    if (idAct !== 'off' && names.length) {
      const parts = { dob: [], addr: [], phone: [], email: [], idn: [] };
      for (const c of cands) {
        if (c.ignored) continue;
        if (c.id === 'birthdate') parts.dob.push(c);
        else if (c.id === 'postal_address') parts.addr.push(c);
        else if (c.id === 'email') parts.email.push(c);
        else if (listType(c) === 'phone') parts.phone.push(c);
        else if (c.cat === 'sozial' || c.cat === 'id-national' || c.cat === 'reise') parts.idn.push(c);
      }
      for (const k of Object.keys(parts)) parts[k].sort(byStart);
      for (const nm of names) {
        const a = nm.start - WIN_ID, b = nm.end + WIN_ID;
        if (!hasIn(parts.dob, a, b)) continue;
        let count = 2;
        for (const k of ['addr', 'phone', 'email', 'idn']) if (hasIn(parts[k], a, b)) count++;
        if (count < idParts) continue;
        add.push({ id: 'identity_combo', cat: 'person', start: nm.start, end: nm.end, action: idAct, sure: true });
        // Auflage 3: Teile der Kombi werden selbst sichere Funde.
        for (const k of ['addr', 'phone']) for (let i = lower(parts[k], a); i < parts[k].length && parts[k][i].start < b; i++) upgrade.push(parts[k][i]);
      }
      tick();
    }

    // Tabellen mit Personendaten (engine/tabelle.js): Spaltenkoepfe und Wertformen, auch ohne
    // einzelne Nummern; Zellen der heiklen Spalten als eigene Funde, damit Schwaerzen nur
    // diese ersetzt (Design-Review Tabellen/Verschleierung/Umformen, Auflagen 5, 7, 8).
    const tabAct = act('mass_table');
    let tbl = null;
    if (DLX.tabelle && opts && opts.tableScan !== false && (tabAct !== 'off' || massAct !== 'off')) {
      tbl = DLX.tabelle.findings(text, { minRows: opts.tableMinRows, minCols: opts.tableMinColumns, mode: opts.tableRedaction }, tick);
      if (tabAct !== 'off') for (const c of tbl.cells) add.push(Object.assign({ id: 'mass_table', cat: 'person', action: tabAct, sure: true }, c));
      tick();
    }

    // 3. Massenlisten: eindeutige Werte je Art (Duplikate zaehlen einmal, Auflage 10).
    if (massAct !== 'off') {
      const sets = { email: new Set(), phone: new Set(), iban: new Set() };
      let s0 = Infinity, e0 = -1, phoneWord = null;
      for (const c of cands) {
        const t = listType(c);
        if (!t) continue;
        const v = text.slice(c.start, c.end);
        // Unsichere Telefonnummern nur mit + oder mit Telefon-Wort irgendwo im Text (z. B. Spaltenkopf);
        // gruppierte Lager-/Seriennummern und nackte Ziffern (auch 00...) zaehlen sonst nicht.
        if (t === 'phone' && !c.sure && !/^\s*\+/.test(v)) {
          if (phoneWord === null) { const low = s.toLowerCase(); phoneWord = (DLX.PHONE_CTX || []).some((w) => low.indexOf(w.toLowerCase()) !== -1); }
          if (!phoneWord) continue;
        }
        sets[t].add(t === 'email' ? v.toLowerCase() : DLX.algo.compact(v));
        s0 = Math.min(s0, c.start); e0 = Math.max(e0, c.end);
      }
      let names2 = 0;
      // Tabellen mit Namensspalte: Kopfzeile im Block oder direkt davor.
      const lines = s.split('\n');
      let pos = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const start = pos;
        pos += line.length + 1;
        if (!letters || line.length > 2000 || !NAME_COLS.test(line)) continue;
        const sep = SEPS.find((x) => line.indexOf(x) !== -1);
        if (!sep) continue;
        const rows = new Set();
        let p2 = pos, last = start;
        for (let j = i + 1; j < lines.length; j++) {
          const r = lines[j];
          if (!r.trim() || r.indexOf(sep) === -1) break;
          if (!/^[\s|:+-]+$/.test(r)) { rows.add(r.trim()); last = p2 + r.length; }
          p2 += r.length + 1;
        }
        if (rows.size > names2) { names2 = rows.size; s0 = Math.min(s0, o(start)); e0 = Math.max(e0, oe(last)); }
        if ((i & 255) === 0) tick();
      }
      const jsonSets = new Map();
      JSON_NAME.lastIndex = 0;
      while (letters && (m = JSON_NAME.exec(s)) !== null) {
        const k = m[1].toLowerCase().replace('_', '');
        if (!jsonSets.has(k)) jsonSets.set(k, new Set());
        jsonSets.get(k).add(m[2]);
        s0 = Math.min(s0, o(m.index)); e0 = Math.max(e0, oe(m.index + m[0].length));
      }
      for (const set of jsonSets.values()) names2 = Math.max(names2, set.size);
      let entries = Math.max(sets.email.size, sets.phone.size, sets.iban.size, names2);
      if (tbl && tbl.rows) { entries = Math.max(entries, tbl.rows); s0 = Math.min(s0, tbl.start); e0 = Math.max(e0, tbl.end); }
      if ((entries >= massMin || (tbl && tbl.rows)) && e0 > s0) meta.push({ id: 'mass_list', cat: 'person', start: s0, end: e0, n: Math.min(MAX_N, entries), action: massAct, sure: true, meta: true });
      tick();
    }
    return { add, meta, upgrade };
  }

  DLX.context = { MASS_MIN, ID_PARTS, MAX_CAND, MAX_N, HOMO, PERSON: PERSON_STRONG, norm, derive, Timeout };
})(globalThis);
