# B2B MCP — requirements & progress

Tracks the MCP requirements from the Mage-OS B2B RFC (rev 3), section
*"Storefront, GraphQL and MCP"*, against what this server has today. Kept in the
repo so progress is visible next to the code.

**Legend:** ✅ done · 🟡 partial · 🔩 modeled (built behind a seam, not wired
live) · ⬜ missing.

> **On "OAuth".** The RFC asks for **"authenticated account binding"** — it does
> *not* prescribe OAuth. This server proposes **OAuth 2.1 + PKCE** (see the
> *B2B Agent Access* sub-spec) as one way to satisfy it: delegated, scoped,
> revocable authority without the agent holding store credentials. The mechanism
> is open for the group to decide; the *requirement* is account binding.

## The RFC requirements, mapped

| # | RFC requirement | Status | Where it lives | Notes / next |
|---|---|---|---|---|
| 1 | **Company, product & order reads** first | ✅ | `main` — read tools | Product / catalog / order reads use **native** storefront GraphQL (always available): `search_products`, `get_product`, `check_stock`, `browse_categories`, `get_category_products`, `get_customer`, `get_order_status`. **Company** read (`get_my_company`, and `get_requisition_lists`) needs the store to have the Orangecat suite **plus our companion GraphQL module** (`Orangecat_CompanyGraphQl` / `Orangecat_ProductListsGraphQl`) — Oliverio's package has no GraphQL of its own; without the companion the tool returns `supported:false`. Verified live end-to-end on a store that has both. |
| 2 | Then **cart / list drafts** | 🟡 | `main` — cart tools | Guest cart drafts exist (`create_guest_cart`, `add_to_cart`, `view_cart`). Missing: requisition **lists** as a tool, and re-tiering carts to **company-scoped** Draft under a resolved context. |
| 3 | **Authenticated account binding** (before placement) | 🟡 | `branch` — `src/auth`, `magento/session.ts` | The scoped `SessionStore` is now the server's **live** session layer — expiry + revocation are active (proven end-to-end; a `logout` tool revokes, and a revoked/expired session is rejected on the next call). The real binding — `DelegatedAuthProvider` + a `TokenVerifier` (OAuth 2.1 + PKCE, or whatever the group picks) — is a stub that refuses until wired. Current live `login` is still a dev-only resource-owner flow to **replace**. |
| 4 | **Explicit user confirmation** (before placement) | 🔩 | `branch` — `placeOrderFlow.ts`, `confirmation.ts` | `requestPlaceOrder` returns `needs_confirmation` and never places; the buyer confirms out of band against the exact `snapshotDigest`. Real confirmation surface (store-hosted signed-link page) is the `ConfirmationProvider` seam. |
| 5 | **Duplicate-request protection** (idempotency) | 🔩 | `branch` — `operations.ts` | Idempotency key on every operation; a replayed key returns the same operation, a replay with different terms is a conflict, and execution is at-most-once. |
| 6 | **Retrieve the outcome after a timeout** | 🔩 | `branch` — `getOperationStatus` | A timed-out agent re-polls by `operation_id` and gets the settled result (or `pending`) — never blindly re-orders. |
| 7 | **Business permissions remain in Mage-OS** | 🟡 | `branch` — `scopes.ts` | Tools gate on scope tiers (Read/Draft/Execute), and scopes are meant to mirror the member's Mage-OS permissions. Today `PasswordAuthProvider` assigns read-only defaults as a placeholder; **deriving scopes from real Mage-OS company permissions** is pending the authorization server. |
| 8 | MCP is an **adapter to the same operations** (no privileged backdoor) | ✅ | design | Tools call the storefront GraphQL operations; no admin/integration credential path. Holds by construction. |
| 9 | **Code & runtime review** of this repo | ✅ | `main` — [`b2b-reuse-review.md`](b2b-reuse-review.md) | Adopt / adapt / replace assessment delivered. |

## What we have now (summary)

- **Reads** — the full company/product/order read surface, live on `main`.
- **Cart drafts** — guest-cart flow on `main` (needs company-scoping + Draft tier).
- **The whole placement-safety model** — authenticated-binding shape, confirmation
  handoff, idempotency, and outcome-after-timeout — built and tested on the
  `b2b-delegated-auth` branch, behind seams. 47/47 tests green.

## What's missing / next

1. **Finish wiring `src/auth/*` into the live server.** Done so far: the scoped
   `SessionStore` now backs the live session layer (expiry + revocation, `logout`
   tool). Remaining: replace the `login` tool with the delegated flow, scope-gate
   tools, and route placement through `requestPlaceOrder` / `getOperationStatus`
   (the last needs company-scoped carts).
2. **Requisition lists** as an MCP tool (Draft tier) — currently absent.
3. **Company-scope the cart** — drafts should build company carts under the
   resolved context, not guest carts.
4. **Real `TokenVerifier`** — the authenticated-account-binding mechanism, once
   the authorization server is decided (RFC-level, cross-project).
5. **Real `ConfirmationProvider`** — a store-hosted signed-link confirmation page.
6. **Derive scopes from Mage-OS company permissions**, so #7 is enforced from the
   authoritative source rather than placeholder defaults.
7. **Externalize `SessionStore` / `OperationStore`** so state survives restarts
   and spans workers.
8. **Store→agent security tests** (prompt-injection, PII egress) from the sub-spec.

## Dependency note

Items 1–3, 7, 8 are **MCP-side and unblocked** — buildable now. Items 4–6 depend
on **RFC-level decisions** (the authorization server, the confirmation surface,
and how company permissions map to scopes) and are represented in code as seams
so the MCP work isn't blocked waiting on them.

See [`b2b-auth-model.md`](b2b-auth-model.md) for the entities these reference.
