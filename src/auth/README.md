# `src/auth` — delegated B2B access (work in progress)

This directory is the MCP-side foundation for the Mage-OS B2B **delegated
authorization** model (see the *B2B Agent Access* sub-spec and
[`docs/b2b-reuse-review.md`](../../docs/b2b-reuse-review.md)). It is **additive
and not yet wired into the tools** — the existing shopper-facing server on
`main` is unchanged. This is slice 1 of that model.

## What's here

| File | Role |
|---|---|
| `scopes.ts` | The scope vocabulary + Read / Draft / Execute tiers + `requireScope`. |
| `actorContext.ts` | The server-side identity (customer, company, role, scopes, expiry). `safeView()` projects it for the client **without the credential**. |
| `sessionStore.ts` | Scoped-context store with expiry + revocation. Successor to `magento/session.ts`. |
| `authProvider.ts` | The seam: how a credential becomes an `ActorContext`. |

## The seams (where undefined store-side pieces plug in)

- **`DelegatedAuthProvider`** is where the real **OAuth 2.1 + PKCE** flow lands.
  It takes a `TokenVerifier` that will validate the access token (signature /
  introspection, audience + scope) and map its claims to a scoped context. Until
  the authorization server is defined, it refuses rather than pretends.
- **`PasswordAuthProvider`** is a **dev-only** stand-in (email + password →
  customer token) so the server keeps working locally. It is a resource-owner
  password flow — exactly what the B2B model replaces — and grants only
  read-only scopes. Not the production path.
- **`SessionStore`** is in-memory for now; a real deployment externalizes it so
  contexts survive restarts, span workers, and are never reused across actors.
  That swap happens behind this same interface.

## Next slice

The confirmation handoff: an operation state machine
(`pending_confirmation → confirmed → executed`, idempotency key), `place_order`
re-tiered to return `needs_confirmation` instead of executing, and a
`get_operation_status` tool — with the signed link + buyer-confirm step behind a
`ConfirmationProvider` seam.
