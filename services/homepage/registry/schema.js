// Tiny config-schema validator for section `config` JSONB.
// Deliberately dependency-free (the backend has no validation library).
//
// A schema is a plain object: { fieldName: { type, default?, required?, min?, max?, values?, maxLength?, pattern? } }
// types: 'int' | 'number' | 'string' | 'boolean' | 'enum'
// Unknown keys are REJECTED (mass-assignment protection); defaults are applied for absent keys.

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {Record<string, object>} schema
 * @param {unknown} input   raw config from the request / DB
 * @returns {{ ok: boolean, value: object, errors: string[] }}
 */
export function validateConfig(schema, input) {
  const errors = [];
  const value = {};
  const src = input == null ? {} : input;

  if (!isPlainObject(src)) {
    return { ok: false, value: {}, errors: ['config must be an object'] };
  }

  for (const key of Object.keys(src)) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) errors.push(`unknown config key "${key}"`);
  }

  for (const [key, rule] of Object.entries(schema)) {
    const present = Object.prototype.hasOwnProperty.call(src, key) && src[key] !== undefined && src[key] !== null;
    if (!present) {
      if (rule.required) errors.push(`config.${key} is required`);
      else if (Object.prototype.hasOwnProperty.call(rule, 'default')) value[key] = rule.default;
      continue;
    }
    const v = src[key];
    switch (rule.type) {
      case 'int':
        if (!Number.isInteger(v)) { errors.push(`config.${key} must be an integer`); break; }
        if (rule.min != null && v < rule.min) { errors.push(`config.${key} must be >= ${rule.min}`); break; }
        if (rule.max != null && v > rule.max) { errors.push(`config.${key} must be <= ${rule.max}`); break; }
        value[key] = v; break;
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) { errors.push(`config.${key} must be a number`); break; }
        if (rule.min != null && v < rule.min) { errors.push(`config.${key} must be >= ${rule.min}`); break; }
        if (rule.max != null && v > rule.max) { errors.push(`config.${key} must be <= ${rule.max}`); break; }
        value[key] = v; break;
      case 'boolean':
        if (typeof v !== 'boolean') { errors.push(`config.${key} must be a boolean`); break; }
        value[key] = v; break;
      case 'string':
        if (typeof v !== 'string') { errors.push(`config.${key} must be a string`); break; }
        if (rule.maxLength != null && v.length > rule.maxLength) { errors.push(`config.${key} must be at most ${rule.maxLength} characters`); break; }
        if (rule.pattern && !rule.pattern.test(v)) { errors.push(`config.${key} has an invalid format`); break; }
        value[key] = v; break;
      case 'enum':
        if (!rule.values.includes(v)) { errors.push(`config.${key} must be one of: ${rule.values.join(', ')}`); break; }
        value[key] = v; break;
      default:
        errors.push(`config.${key}: unsupported schema type "${rule.type}"`);
    }
  }

  return { ok: errors.length === 0, value, errors };
}

/** JSON-schema-ish description for the admin UI (GET /admin/homepage/section-types). */
export function describeSchema(schema) {
  return Object.entries(schema).map(([key, rule]) => ({
    key,
    type: rule.type,
    default: rule.default ?? null,
    required: !!rule.required,
    ...(rule.min != null ? { min: rule.min } : {}),
    ...(rule.max != null ? { max: rule.max } : {}),
    ...(rule.values ? { values: rule.values } : {}),
    ...(rule.maxLength != null ? { maxLength: rule.maxLength } : {}),
  }));
}
