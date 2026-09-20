# mage-os-mcp

An open-source [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets AI agents **shop and query a Magento / Mage-OS store**. It connects to a store's public **storefront GraphQL API**, so any Magento 2.4+ / Mage-OS store can use it — no module to install, no admin credentials required for the core catalog tools.

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

Planned next: `check_stock`, `browse_categories` / `get_category_products`, then authenticated `get_order_status` and `get_customer` (via GraphQL customer token). B2B is intentionally out of scope for now.

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
