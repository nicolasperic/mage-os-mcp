# mage-os-mcp — B2B reuse & runtime review

**Purpose.** The Mage-OS B2B RFC (rev 3) names this repository as a reuse candidate for the B2B suite's MCP adapter, and asks for a *code and runtime review* before another server is built. This document is that review: an honest **adopt / adapt / replace** assessment of the current server against the proposed B2B authorization model.

- **Reviewed at:** commit `f5634cf` (16 tools; TypeScript; storefront GraphQL-first).
- **Companion spec:** *B2B Agent Access* — the MCP delegated-authorization & agentic-execution model this is measured against.
- **Status:** assessment only. Nothing here changes the server; it records what transfers and what must be rebuilt.

---

## TL;DR

The **tool surface, GraphQL layer, output shaping, and test/CI discipline transfer well** and are the real value. The **authentication model does not** — the current `login` flow has the agent handle the customer's password, which the B2B model explicitly forbids. Treat this server as a **proven read/draft tool surface to adapt onto a new delegated-auth foundation**, not as a drop-in B2B MCP.

Rough split of the 16 tools: **~8 adopt** (reads), **~5 adapt** (cart/checkout re-tiered), **1 replace** (`login`), plus the **session store to rebuild** and **`place_order` to move behind confirmation**.

> **Progress since this review.** Much of the recommended path is now built on the
> `b2b-delegated-auth` branch (merged into `main`): the scoped session store is
> **live** (expiry + revocation + a `logout` tool), the confirmation handoff and
> idempotent operation model are built and tested, `redactByScope` enforces
> field-level scope, store→agent security tests exist, and a
> `get_requisition_lists` tool was added. What remains is genuinely blocked on
> RFC-level decisions (the delegated OAuth flow to replace `login`, company-scoped
> carts). See [`b2b-mcp-requirements.md`](b2b-mcp-requirements.md) for live status.

---

## Component assessment

| Component | Verdict | Notes |
|---|---|---|
| Read tools — `search_products`, `get_product`, `check_stock`, `browse_categories`, `get_category_products`, `get_customer`, `get_order_status`, `get_my_company` | **Adopt** | Map cleanly to the Read scope tier. Schemas, GraphQL queries and output shaping carry over as-is; only the identity source changes (from `session_id` lookup to a resolved token context). |
| GraphQL client (`magento/client.ts`) | **Adopt** | Thin wrapper, per-request auth headers, TLS/timeout handling. Storefront-endpoint assumption is compatible with the "adapters call authorized operations" model. |
| Output shapers (`shapeCart`, per-tool mappers) | **Adopt** | Deterministic, structured results — already aligned with "tool results are structured fields, not instruction-carrying prose." |
| Tests + CI (Vitest, mocked client, GitHub Actions) | **Adopt** | The discipline and the mock-the-client pattern transfer directly; new auth/confirmation flows need their own cases. |
| Cart tools — `create_guest_cart`, `add_to_cart`, `view_cart` | **Adapt** | Become the **Draft** tier and move from *guest* carts to *company-scoped* carts under the resolved actor. Logic mostly survives; scoping and ownership checks are added. |
| Checkout tools — `set_shipping_address`, `set_shipping_method`, `set_payment_method` | **Adapt** | Draft-tier cart preparation. Keep the step shapes; enforce company method policy server-side. |
| `session.ts` (in-memory `session_id → token` map) | **Adapt → rebuild** | The **indirection is right** (raw credential never reaches the model), but it stores only a bearer token: no scope, company/role, expiry, or revocation, and it is a single-process global map. Rebuild as a scoped-context store (see below). |
| `place_order` | **Adapt (gated)** | Today it places directly once a cart is ready. Must move **behind the confirmation handoff** and an idempotency key — Execute tier only. |
| `login` (email + password → `generateCustomerToken`) | **Replace** | The agent receives the customer's password (a resource-owner-password flow). The B2B model requires delegated **OAuth 2.1 + PKCE** — the password must never reach the agent. This tool is removed, not adapted. |

---

## The authentication gap (the one that matters)

The current flow:

```
agent → login(email, password) → generateCustomerToken → session_id
```

is a **resource-owner password credentials** flow. It was a reasonable choice for a single-operator demo, but for a *customer-facing* MCP it fails the first principle of the B2B model: **authority is granted, not shared.** The buyer's password ends up in the agent's hands, the token carries the customer's *full* storefront authority (no company/role scoping), and there is no revocation or expiry story.

The target, from the companion spec:

```
agent → authorization-code + PKCE → buyer authenticates & consents → scoped, audience-pinned token
```

So `login` is the clearest **replace**: delete the password tool, and obtain tokens through the delegated flow. Everything downstream (`authHeaders`, the per-tool `session_id` argument) can keep its *shape* — the argument becomes a handle to a resolved, scoped context instead of a raw token.

### Session store — what "rebuild" means

`session.ts` today maps an opaque id to a bearer string. Under the B2B model the stored value must become a **scoped actor context**: customer + company + role + permitted scopes + expiry, with revocation honored on the next call. That is a different object with a different lifecycle, not a field added to the current map. The *pattern* (opaque handle in, no credential out) is worth keeping; the contents are not.

---

## Runtime findings

- **In-memory, single process.** Sessions live in one process's heap — they vanish on restart and don't span workers. The B2B model requires that no worker reuse a prior actor's context; a shared, externalized, per-request-resolved context store is needed rather than a process-global map.
- **No expiry / revocation.** Tokens live until the process dies. The model needs short-lived access tokens and immediate revocation.
- **No scope enforcement.** A `session_id` grants whatever the underlying customer token can do. Scope tiers (Read / Draft / Execute) must gate which tools are even offered.
- **Direct execution.** `place_order` completes a purchase without a human-confirmation step; it must not, under the model.

None of these are defects for what the server was built to be (a shopper-facing storefront MCP). They are precisely the deltas between *that* and a *B2B delegated-authority* MCP.

---

## Tool surface → scope tiers

| Tier | Existing tools that map here |
|---|---|
| **Read** | `search_products`, `get_product`, `check_stock`, `browse_categories`, `get_category_products`, `get_customer`, `get_order_status`, `get_my_company` |
| **Draft** | `create_guest_cart` → company cart, `add_to_cart`, `view_cart`, `set_shipping_address`, `set_shipping_method`, `set_payment_method` |
| **Execute** | `place_order` (behind confirmation + idempotency), future `purchase.propose` / `quote.accept` |
| **Removed** | `login` (replaced by delegated auth) |

The Read tier alone is a large, working, demoable surface that transfers with high confidence — which is why the recommended path leads with it.

---

## Recommended path

1. ✅ **Keep** the Read tier, GraphQL client, shapers and tests as the foundation. *(done)*
2. 🟡 **Replace** `login` with the delegated OAuth 2.1 + PKCE flow; rebuild `session.ts` as a scoped actor-context store with expiry and revocation. *(session store rebuilt & live with expiry + revocation + `logout`; the delegated OAuth replacement for `login` is blocked on the authorization-server decision)*
3. 🟡 **Re-tier** cart/checkout tools onto company-scoped carts (Draft), and move `place_order` behind the confirmation handoff (Execute). *(the confirmation handoff + idempotent operation model are built and tested; wiring to live placement needs company-scoped carts, which are store-side)*
4. ✅ **Add** the store→agent security tests (prompt-injection, PII egress) alongside the existing suite. *(done)*

**Verdict:** adopt the surface, replace the auth. The reusable value here is real and sizeable; the authentication layer is the deliberate rebuild — now substantially built, with the remaining pieces blocked on RFC-level decisions rather than on this server.
