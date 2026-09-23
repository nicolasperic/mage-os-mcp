/**
 * Redacts tool input before it enters the audit log. Two jobs: never log a
 * credential (mask sensitive keys by name), and keep entries bounded (truncate
 * very long strings). Pure and defensive — used on untrusted, arbitrary input.
 */

const SENSITIVE_KEY =
  /^(password|token|access_token|refresh_token|secret|authorization|auth|api[_-]?key)$/i;

const MAX_STRING = 200;

export function redactArgs(value: unknown): Record<string, unknown> {
  const walked = walk(value);
  // The top-level of tool args is always an object; normalize for the type.
  return walked && typeof walked === "object" && !Array.isArray(walked)
    ? (walked as Record<string, unknown>)
    : { value: walked };
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(walk);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? "***" : walk(v);
    }
    return out;
  }
  if (typeof value === "string" && value.length > MAX_STRING) {
    return `${value.slice(0, MAX_STRING)}…[${value.length} chars]`;
  }
  return value;
}
