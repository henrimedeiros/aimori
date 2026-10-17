// Kleiner Pruefer fuer die Teilmenge von JSON Schema, die Chrome fuer
// managed_schema.json akzeptiert (type, properties, patternProperties,
// additionalProperties, items, enum, pattern, minimum, maximum, title,
// description, id, $ref). Keine Abhaengigkeiten.

export const ALLOWED_KEYWORDS = new Set(['type', 'properties', 'patternProperties', 'additionalProperties', 'items', 'enum', 'pattern', 'minimum', 'maximum', 'title', 'description', 'id', '$ref']);

// Liefert Liste unbekannter Schluesselwoerter im Schema (Chrome wuerde es ablehnen).
export function unknownKeywords(schema, path = '$') {
  const out = [];
  for (const [k, v] of Object.entries(schema)) {
    if (!ALLOWED_KEYWORDS.has(k)) out.push(`${path}.${k}`);
    if (k === 'properties' || k === 'patternProperties') {
      for (const [pk, pv] of Object.entries(v)) out.push(...unknownKeywords(pv, `${path}.${k}.${pk}`));
    } else if ((k === 'items' || k === 'additionalProperties') && typeof v === 'object') {
      out.push(...unknownKeywords(v, `${path}.${k}`));
    }
  }
  return out;
}

const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v);

// Validiert einen Wert gegen das Schema; liefert Liste von Fehlern (leer = gueltig).
// Wie Chrome: unbekannte Eigenschaften sind Fehler, ausser additionalProperties erlaubt sie.
export function validate(schema, value, path = '$') {
  const errs = [];
  const t = typeOf(value);
  const want = schema.type;
  if (want && !(want === t || (want === 'number' && (t === 'integer' || t === 'number')))) {
    return [`${path}: Typ ${t}, erwartet ${want}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: Wert nicht erlaubt`);
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: Muster verletzt`);
  if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${path}: zu klein`);
  if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${path}: zu gross`);
  if (t === 'array' && schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, `${path}[${i}]`)));
  if (t === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties && schema.properties[k]) { errs.push(...validate(schema.properties[k], v, `${path}.${k}`)); continue; }
      const pp = schema.patternProperties && Object.entries(schema.patternProperties).find(([re]) => new RegExp(re).test(k));
      if (pp) { errs.push(...validate(pp[1], v, `${path}.${k}`)); continue; }
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') { errs.push(...validate(schema.additionalProperties, v, `${path}.${k}`)); continue; }
      errs.push(`${path}.${k}: unbekannte Eigenschaft`);
    }
  }
  return errs;
}
