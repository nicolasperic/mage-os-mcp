# mage-os-mcp

[![CI](https://github.com/nicolasperic/mage-os-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/nicolasperic/mage-os-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An open-source [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets AI agents **shop and query a Magento / Mage-OS store**. It connects to a store's public **storefront GraphQL API**, so any Magento 2.4+ / Mage-OS store can use it — no module to install, no admin credentials required for the core catalog tools.

> **Mage-OS B2B initiative:** this server is a reuse candidate for the community B2B suite's MCP adapter.
> - [`docs/b2b-reuse-review.md`](docs/b2b-reuse-review.md) — adopt / adapt / replace review of this server.
> - [`docs/b2b-mcp-requirements.md`](docs/b2b-mcp-requirements.md) — the RFC's MCP requirements mapped to progress.
> - [`docs/b2b-auth-model.md`](docs/b2b-auth-model.md) — entities, ER diagram and the operation state machine.
> - Work in progress lives on the `b2b-delegated-auth` branch (`src/auth/`).

> Point Claude (or any MCP client) at your store and ask: _"Find me a waterproof jacket under $100 and tell me if it's in stock."_

## Why another Magento MCP?

Most existing Magento MCP servers are either **developer tooling** (help you write Magento code), **admin/BI dashboards** (REST + admin token), or **coupled to a commercial SaaS**. `mage-os-mcp` is deliberately different:

- **Shopper-first.** A small, curated, read-first toolset focused on the "let an AI agent shop" use case — quality over surface area.
- **API-based & portable.** Talks to the storefront GraphQL endpoint. Works against any store, self-hosted or cloud. No Magento module to deploy.
- **GraphQL-first.** Uses the storefront GraphQL API where practical; REST/direct only where GraphQL genuinely can't do it.
- **Truly open — MIT licensed.** Fork it, ship it, build on it.

## Status

Early v1. Working tools:

| Tool | Description | API |
|---|---|---|
| `search_products` | Free-text catalog search → SKU, name, price, stock, image | GraphQL |
| `get_product` | Full product detail by SKU → description, pricing, discounts, stock, categories, media | GraphQL |
| `check_stock` | Batch availability check for up to 100 SKUs → in-stock flag + low-stock qty | GraphQL |
| `browse_categories` | Store category tree (departments + subcategories) with product counts | GraphQL |
| `get_category_products` | List products in a category by `uid`, with pagination & sorting | GraphQL |
| `create_guest_cart` | Start an anonymous shopping cart → returns a `cart_id` | GraphQL |
| `add_to_cart` | Add products (SKU + quantity) to a guest cart; per-item errors surfaced | GraphQL |
| `view_cart` | View a guest cart's line items and totals by `cart_id` | GraphQL |
| `login` | Authenticate a customer (email + password) → returns a `session_id` | GraphQL |
| `logout` | Revoke a `session_id` immediately | — |
| `get_customer` | Logged-in customer's profile & saved addresses (by `session_id`) | GraphQL |
| `get_order_status` | Logged-in customer's orders — status, totals, items, tracking | GraphQL |
| `set_shipping_address` | Checkout step 1: set guest email + address → available shipping methods | GraphQL |
| `set_shipping_method` | Checkout step 2: pick a shipping method → available payment methods + totals | GraphQL |
| `set_payment_method` | Checkout step 3: pick a payment method → confirm totals | GraphQL |
| `place_order` | Checkout final step: submit the cart → returns the order number | GraphQL |
| `get_my_company` | Authenticated customer's **B2B company** + team roster (optional) | GraphQL |
| `get_requisition_lists` | Authenticated customer's **B2B requisition lists** + items (optional) | GraphQL |

> **Note on B2B:** `get_my_company` and `get_requisition_lists` require the store to expose B2B data over GraphQL — the open-source [Orangecat B2B suite](https://github.com/olivertar/m2_b2bsdk) plus the companion modules ([`Orangecat_CompanyGraphQl`](https://github.com/nicolasperic/mage-os-b2b-graphql), [`Orangecat_ProductListsGraphQl`](https://github.com/nicolasperic/mage-os-b2b-requisition-graphql)). On stores without them, the tools return `supported: false` instead of erroring, so they stay safe to include against any store.

> **Sessions:** `login` returns an opaque `session_id`; the underlying credential is held server-side and never returned. Sessions carry a scoped context with expiry and can be revoked (`logout`) — see the delegated-access model in [`docs/b2b-auth-model.md`](docs/b2b-auth-model.md).

> **Governance & audit:** every tool call is audited — a redacted, append-only record of who / what / outcome / timing — via a pluggable sink (`MCP_AUDIT`, `MCP_AUDIT_CHAIN` for tamper-evidence). This is the access-control + audit-trail foundation for adopting an MCP under SOC 2-style compliance. See [`src/governance/`](src/governance/README.md).

### End-to-end shopping flow

The tools compose into a complete "AI shops the store" journey:

```
search_products / browse_categories   → discover
get_product / check_stock             → evaluate
create_guest_cart → add_to_cart       → build a basket
set_shipping_address                  → (returns shipping options)
set_shipping_method                   → (returns payment options + totals)
set_payment_method → place_order      → order number 🎉
```

> **Note on checkout:** the flow uses Magento's **guest checkout** mutations. `place_order` is **irreversible** — an agent should confirm the totals with the user first (the tool description instructs it to). Offline payment methods (e.g. `checkmo`, Check / Money Order) work out of the box; online gateways that need client-side tokenization are out of scope.

> **Note on carts:** the cart tools use Magento's **guest cart** mutations (no login required). `add_to_cart` currently targets **simple products** by SKU; configurable/bundle products (which need selected options) are reported back in `user_errors` and are a planned enhancement.

> **Note on authentication:** `login` exchanges credentials for a Magento customer token via `generateCustomerToken`. The **token is stored server-side (in memory) and never returned** to the client — tools take an opaque `session_id` instead, so the raw credential stays out of the model's context. Sessions live for the server process lifetime; if it restarts, log in again.

## Requirements

- Node.js >= 20
- A reachable Magento 2.4+ / Mage-OS store with the storefront GraphQL endpoint enabled (the default)

## Setup

```bash
git clone https://github.com/<you>/mage-os-mcp.git
cd mage-os-mcp
npm install
cp .env.example .env   # then edit .env
npm run build
```

### Configuration

Configuration is via environment variables (see `.env.example`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `MAGENTO_BASE_URL` | ✅ | — | Store base URL, no trailing `/graphql`. e.g. `https://app.mage-os.test` |
| `MAGENTO_STORE_CODE` | | `default` | Store view code, sent as the `Store` header |
| `MAGENTO_INSECURE_TLS` | | `false` | `true` to accept self-signed certs (local Warden/Docker). **Never** in production. |
| `MAGENTO_TIMEOUT_MS` | | `15000` | Per-request timeout in milliseconds |

## Running

```bash
# Development (no build step, via tsx)
npm run dev

# Production
npm run build && npm start
```

The server speaks MCP over **stdio**. `stdout` is reserved for the protocol; logs go to `stderr`.

### Try it with the MCP Inspector

```bash
npm run inspect
```

## Testing

Unit tests (Vitest) run each tool against a mocked GraphQL client, so they need
no live store:

```bash
npm test          # builds, then runs the suite once
npm run test:watch
```

CI (GitHub Actions) type-checks, builds, and tests on Node 20 & 22 for every
push and pull request — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

### Use with Claude Desktop / Claude Code

Add to your MCP client config (e.g. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mage-os": {
      "command": "node",
      "args": ["/absolute/path/to/mage-os-mcp/dist/index.js"],
      "env": {
        "MAGENTO_BASE_URL": "https://app.mage-os.test",
        "MAGENTO_INSECURE_TLS": "true"
      }
    }
  }
}
```

## Architecture

```
src/
├── index.ts              # MCP server: registers tools, wires stdio transport
├── config.ts             # env-based config loader
├── magento/
│   ├── client.ts         # GraphQL client (Store header, TLS/timeout handling)
│   └── queries.ts        # GraphQL documents (one place to review what we ask for)
└── tools/
    ├── searchProducts.ts # search_products
    └── getProduct.ts     # get_product
```

Each tool is a small, testable function that takes the GraphQL client + validated args and returns a plain JSON object. `index.ts` handles MCP registration and serialization. Adding a tool = one file in `tools/` + one query in `queries.ts` + one `registerTool` call.

## License

MIT — see [LICENSE](LICENSE).
