# `src/governance` — audit & access governance

The controls that let an MCP server be adopted in a real project: **who did
what, under what permission, with what outcome — provably.** This is the gap
that gates enterprise/agency adoption (it's the SOC 2-style conversation:
access control + audit trail + data handling), independent of B2B.

It's cross-cutting — every tool call is governed, not just B2B ones — and
deployment-agnostic, so `mage-os-mcp` and `lp-mcp` (or any MCP built on this)
share the same layer.

## What's here

| File | Role |
|---|---|
| `audit.ts` | The `AuditEvent` record, the `AuditSink` port, sinks (`Null`, `Stderr`, `Memory`), and `HashChainAuditSink` + `verifyChain` for tamper-evidence. |
| `redact.ts` | `redactArgs` — masks credential-shaped keys and truncates long strings before anything is logged. |
| `governTool.ts` | The wrapper: resolves the actor server-side, times the call, and emits a redacted audit event per invocation. `installGovernance(server, …)` applies it to every tool in one call. |

## What each call records

`ts · correlationId · tool · actor (customer/company/role/scopes, resolved
server-side) · redacted input · outcome (ok / error, incl. authz denials) ·
durationMs`. Optional `prevHash`/`hash` when the chain sink is used.

## Configuration (env)

| Var | Effect |
|---|---|
| `MCP_AUDIT=off` | Disable auditing (`NullAuditSink`). |
| *(default)* | `StderrAuditSink` — one JSON line per event on stderr (stdout is the MCP protocol). |
| `MCP_AUDIT_CHAIN=true` | Wrap the sink in `HashChainAuditSink` for a tamper-evident trail. |

## Seams (for real deployments)

- **`AuditSink`** — point at a file, database, or log service (Datadog, CloudWatch,
  an append-only store). `StderrAuditSink` is the default; a collector ships it on.
- **`ActorResolver`** — the default reads the session store; inject your own to
  resolve identity from a different source (e.g. lp-mcp's).

## Not yet, but adjacent

- **Centralized scope enforcement** — tools declare a required scope and the
  wrapper checks it (today scope checks live inside the auth-bearing tools; the
  primitives are in `../auth/scopes.ts`). Denials are already audited as errors.
- **Rate limiting / quotas** per actor, on the same wrapper.
