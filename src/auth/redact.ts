import { hasScope, type Scope } from "./scopes.js";

/**
 * Field-level scope enforcement for tool output — the primitive behind two
 * requirements: keeping business permissions authoritative (a response only
 * carries what the token is allowed to see) and bounding PII/data egress to an
 * external agent (sensitive fields are omitted unless their scope is granted).
 *
 * Given a set of granted scopes and a map of `field -> scope it requires`, drop
 * any field whose scope is not granted. Nested paths are addressed with dots
 * (`credit.balance`). This is deliberately a pure function so it can wrap any
 * tool's result and be tested in isolation.
 */
export type FieldScopeMap = Record<string, Scope>;

export function redactByScope<T extends Record<string, unknown>>(
  data: T,
  granted: readonly Scope[],
  fieldScopes: FieldScopeMap,
): T {
  // Clone so we never mutate the caller's object.
  const clone: any = structuredClone(data);
  for (const [path, requiredScope] of Object.entries(fieldScopes)) {
    if (!hasScope(granted, requiredScope)) {
      deletePath(clone, path);
    }
  }
  return clone;
}

function deletePath(obj: any, path: string): void {
  const parts = path.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cursor == null || typeof cursor !== "object") return;
    cursor = cursor[parts[i]];
  }
  if (cursor && typeof cursor === "object") {
    delete cursor[parts[parts.length - 1]];
  }
}
