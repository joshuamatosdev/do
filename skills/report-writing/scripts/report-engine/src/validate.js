// Minimal, dependency-free JSON Schema validator.
// Covers exactly the subset report.schema.json uses: type, required,
// properties, additionalProperties:false, items, enum, $ref (#/$defs/*),
// minLength, minItems, minimum, maximum, and a light date-time format check.
//
// Rationale: zero runtime dependencies => zero dependency drift => maximally
// deterministic and installable offline. If the schema grows beyond this
// subset, swap this module for Ajv 2020 (see README "Upgrade path"); the
// engine/agent contract does not change.

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v; // number, string, boolean, object
}

function resolveRef(ref, root) {
  // Only local #/$defs/<name> refs are used.
  const m = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!m) throw new Error(`Unsupported $ref: ${ref}`);
  const def = root.$defs?.[m[1]];
  if (!def) throw new Error(`Unknown $ref target: ${ref}`);
  return def;
}

function check(value, schema, root, path, errors) {
  if (schema.$ref) {
    return check(value, resolveRef(schema.$ref, root), root, path, errors);
  }

  if (schema.type) {
    const t = typeOf(value);
    const ok = schema.type === "number" ? t === "number" || t === "integer" : t === schema.type;
    if (!ok) {
      errors.push(`${path}: expected type ${schema.type}, got ${t}`);
      return; // type mismatch — deeper checks would be noise
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value ${JSON.stringify(value)} not in enum [${schema.enum.join(", ")}]`);
  }

  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) {
      errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
    }
    if (schema.format === "date-time" && !ISO_DATETIME.test(value)) {
      errors.push(`${path}: not a valid UTC ISO-8601 date-time`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${path}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${path}: ${value} > maximum ${schema.maximum}`);
  }

  if (typeOf(value) === "array") {
    if (schema.minItems != null && value.length < schema.minItems) {
      errors.push(`${path}: array shorter than minItems ${schema.minItems}`);
    }
    if (schema.items) {
      value.forEach((item, i) => check(item, schema.items, root, `${path}[${i}]`, errors));
    }
  }

  if (typeOf(value) === "object" && (schema.type === "object" || schema.properties)) {
    for (const req of schema.required ?? []) {
      if (!(req in value)) errors.push(`${path}: missing required property '${req}'`);
    }
    const props = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) errors.push(`${path}: additional property '${key}' is not allowed (presentation fields are banned)`);
      }
    }
    for (const [key, subSchema] of Object.entries(props)) {
      if (key in value) check(value[key], subSchema, root, `${path}/${key}`, errors);
    }
  }
}

/** Validate `payload` against `schema`. Returns { valid, errors[] }. */
export function validate(payload, schema) {
  const errors = [];
  check(payload, schema, schema, "$", errors);
  return { valid: errors.length === 0, errors };
}
