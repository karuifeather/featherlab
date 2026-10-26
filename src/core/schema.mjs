/**
 * A deliberately small, dependency-free schema checker.
 *
 * It exists to give path-aware messages ("checks[2].params.name: must be ...") for
 * hand-written YAML. It is not a general JSON Schema implementation; extend it only
 * when a real definition needs more.
 *
 * Spec shape:
 *   { type: "string"|"integer"|"number"|"boolean"|"array"|"object"|"any",
 *     required?, enum?, pattern?, min?, max?, minLength?, maxLength?,
 *     items?: spec,              // arrays
 *     properties?: {k: spec},    // objects; unknown keys are rejected unless `open`
 *     values?: spec,             // objects used as maps: validates every value
 *     open?: boolean }
 */

export class Problems {
  #list = [];
  #prefix;

  constructor(file = "", prefix = "") {
    this.file = file;
    this.#prefix = prefix;
  }

  add(path, message) {
    this.#list.push({ file: this.file, path: join(this.#prefix, path), message });
  }

  get list() {
    return this.#list;
  }

  get ok() {
    return this.#list.length === 0;
  }

  /** A view that prepends `prefix` to every path it records. */
  scoped(prefix) {
    const child = new Problems(this.file, join(this.#prefix, prefix));
    child.#list = this.#list;
    return child;
  }
}

function join(prefix, path) {
  if (!prefix) return path;
  if (!path) return prefix;
  return path.startsWith("[") ? `${prefix}${path}` : `${prefix}.${path}`;
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** Validate `value` against `spec`, recording defects on `problems`. */
export function check(value, spec, path, problems) {
  if (value === undefined) {
    if (spec.required) problems.add(path, "is required");
    return;
  }
  const actual = typeOf(value);
  const expected = spec.type ?? "any";
  if (expected === "integer") {
    if (!Number.isInteger(value))
      return void problems.add(path, `must be an integer (got ${actual})`);
  } else if (expected === "number") {
    if (typeof value !== "number" || !Number.isFinite(value))
      return void problems.add(path, `must be a number (got ${actual})`);
  } else if (expected !== "any" && actual !== expected) {
    return void problems.add(path, `must be ${article(expected)} ${expected} (got ${actual})`);
  }

  if (spec.enum && !spec.enum.includes(value))
    problems.add(path, `must be one of ${spec.enum.map((v) => JSON.stringify(v)).join(", ")}`);
  if (typeof value === "string") {
    if (spec.minLength !== undefined && value.length < spec.minLength)
      problems.add(path, `must be at least ${spec.minLength} characters`);
    if (spec.maxLength !== undefined && value.length > spec.maxLength)
      problems.add(path, `must be at most ${spec.maxLength} characters`);
    if (spec.pattern && !spec.pattern.test(value))
      problems.add(path, spec.patternHint ?? `must match ${spec.pattern}`);
  }
  if (typeof value === "number") {
    if (spec.min !== undefined && value < spec.min) problems.add(path, `must be >= ${spec.min}`);
    if (spec.max !== undefined && value > spec.max) problems.add(path, `must be <= ${spec.max}`);
  }
  if (actual === "array") {
    if (spec.minItems !== undefined && value.length < spec.minItems)
      problems.add(path, `must contain at least ${spec.minItems} item(s)`);
    if (spec.items) value.forEach((item, i) => check(item, spec.items, `${path}[${i}]`, problems));
  }
  if (actual === "object") {
    if (spec.properties) {
      for (const [key, sub] of Object.entries(spec.properties))
        check(value[key], sub, path ? `${path}.${key}` : key, problems);
      if (!spec.open)
        for (const key of Object.keys(value))
          if (!(key in spec.properties))
            problems.add(
              path ? `${path}.${key}` : key,
              `unknown property (allowed: ${Object.keys(spec.properties).join(", ")})`,
            );
    }
    if (spec.values)
      for (const [key, item] of Object.entries(value))
        check(item, spec.values, path ? `${path}.${key}` : key, problems);
  }
}

function article(type) {
  return /^[aeiou]/.test(type) ? "an" : "a";
}
