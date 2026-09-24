# Community feedback → what it changes for the MCP adapter

Working notes on the Mage-OS B2B RFC discussion (Shopify/commercetools modelling
from **paales**, operations + pricing + MultiCart from **Paul Hachmang**,
prioritisation from **Gregor Pollak**), read specifically for what it changes in
*this* server. Companion to [`b2b-mcp-requirements.md`](b2b-mcp-requirements.md)
(the RFC tracker) and [`b2b-auth-model.md`](b2b-auth-model.md) (our entity model).

Five findings, roughly in order of how much they cost to retrofit later.

> **Attribution to confirm.** §5 (and its GraphCommerce_MultiCart reference)
> suggests **paales is Paul Hachmang** of GraphCommerce — in which case §1's
> modelling and §2/§4's pricing/MultiCart are the same contributor, not two.
> Left as written until confirmed.

---

## 1. The acting context is a **triple**, not a pair — and we're missing a third of it

Shopify's reference model, reduced to what matters here:

```
Company ──< CompanyLocation
   └──< CompanyContact ──> Customer

CompanyContactRoleAssignment = { company, contact, location, role }
PurchasingCompany            = { company, contact, location }
Order.purchasingEntity       = Customer | PurchasingCompany
```

Two consequences, both of which our model currently misses:

**The role is assigned per `(contact, location)`, not per company.** The same
person can be an admin at one location and a buyer at another. Our
`ActorContext` carries `(customerId, companyId, roleId)` — a single `roleId` per
session is therefore under-specified, and `orders.read.company` is too coarse
(Shopify exposes `Company.orders` *and* `CompanyLocation.orders` separately).

**The location is part of the commercial terms.** It determines the catalog, the
price list and the payment terms (`buyerExperienceConfiguration`). So it is not
merely a delivery detail — it changes what the order costs.

### What we'd change

- Add `locationId` to `ActorContext`, and derive scopes from
  `(contact, location)` rather than from a bare role. This also de-risks open
  item #6 in the tracker: the *shape* of "derive scopes from Mage-OS
  permissions" is now known even though the authorization server isn't.
- Decide how a location gets picked. A contact at three locations gives the
  agent an ambiguous "act as who?" — our proposal: the session binds a default
  location, tools may override it per call.
- **Include the location in `snapshotDigest`.** This is the load-bearing one.
  The digest is what the buyer confirms out of band; if location isn't in it, a
  confirmed operation could execute against a different catalog, price list and
  payment terms than the buyer approved. Cheap now, a correctness bug later.

---

## 2. Prices must be self-describing, because there is no human to notice

Paul's point — price rendering depends on who is logged in (tax-inclusive for a
consumer, tax-exclusive for a company), B2B shops contain B2C shops, and in a
B2B2C setup a signed-in company may deliberately want to see *consumer* prices
via a "price view mode" toggle, the way display currency works.

For a storefront that's a UI toggle. **For an MCP adapter it's a silent
correctness failure.** We return this today:

```graphql
price_range { minimum_price { final_price { value currency } } }
```

A bare number. The agent cannot tell whether `49.99` is ex-VAT company pricing
or inc-VAT consumer pricing, so it will state it as fact — and be wrong for half
the audience. A human spots that instantly; an agent never does.

### What we'd change

- Return a **price envelope**, not a scalar:
  `{ amount, currency, tax_mode: "incl" | "excl", price_view: "consumer" | "company", catalog_id?, location_id? }`.
- Make `price_view` an explicit, settable parameter (session default +
  per-call override), mirroring display currency — which is exactly the
  mechanism Paul proposes for the storefront.
- **Surface quantity price breaks.** Shopify models these first-class
  (`QuantityPriceBreak { minimumQuantity, price, variant }`); we query none.
  An agent that quotes unit price without knowing 100+ drops it 30% gives
  actively harmful buying advice — the single most B2B-specific thing we
  currently get wrong.

This is worth feeding back to the RFC as a general principle, not just a fix
here: *any* MCP surface over commerce must make price context explicit, because
the consumer of the response cannot infer it.

---

## 3. LLM-based QuickOrder is not V2 — it falls out of the adapter for free

Paul: *"Ideally we would immediately go to LLM based approach where we let people
do whatever and the LLM cleans up the data and searches for the uses, but maybe
that is V2."*

That capability is what this adapter already is. It does **not** require any LLM
code inside the B2B modules. It requires one thing of the module:

> the resolve operation must return **candidates with ambiguity**, not a hard
> match or an error.

Given that, "paste anything" QuickOrder is an agent-side behaviour over the
Draft tier we already have (`cart.draft`): the agent takes free text, CSV, a
messy SKU column or *"20 of the blue widget"*, calls resolve, and disambiguates
with the buyer before anything is committed. No new risk tier, no new module
intelligence.

Recommendation for the RFC: design the QuickOrder operation's **return shape**
for ambiguity now (cheap), and the LLM half needs no separate version at all.

---

## 4. MultiCart collapses our list roadmap from N tools to ~4

Gregor and Paul both put negotiable quotes last (Paul: the Adobe Commerce version
needs a fully custom checkout to work at all). Paul's alternative is a MultiCart
"cart group" system that subsumes requisition lists, purchase orders, wishlists,
save-for-later, project lists and spare-parts lists — each a group with a config:

```
MultiCartGroupConfig {
  allow_multiple, can_copy_items_to, can_move_items_to, can_move_cart_to,
  can_become_real, can_view_item_prices, can_view_totals, can_view_additional
}
```

This is unusually good for MCP, because **it is capability discovery expressed as
data**:

| Config field | What it tells the agent |
|---|---|
| `can_become_real` | whether the Execute tier applies to this list at all |
| `can_view_item_prices` / `can_view_totals` | what we're permitted to return |
| `can_copy_items_to` / `can_move_items_to` / `can_move_cart_to` | the legal transitions it may attempt |

So instead of one tool per list flavour, the adapter needs roughly four generic
ones — `list_carts`, `get_cart`, `modify_cart`, `move_items` — driven by group
config. New list types then need **zero** MCP work.

### What we'd change

- Reframe tracker items #2 and #3 (requisition lists as a tool, company-scoped
  carts) as *one* generic multi-cart surface, and treat today's
  `get_requisition_lists` as a special case of it.
- Drop negotiable quotes down the priority list; keep the `quote.accept` scope
  in the vocabulary (it costs nothing to reserve).
- **Gap this exposes:** `can_view_item_prices` / `can_view_totals` are
  *per-list* permissions, but our governance layer enforces scope *per tool*.
  A per-object permission check is a new layer we don't have. Worth solving
  generically rather than per-list.

Paul has said he can discuss open-sourcing this — which makes the generic surface
above the realistic target rather than a speculative one.

---

## 5. QuoteLike entities: RequisitionList and NegotiableQuote are one abstraction

paales, extending the MultiCart thread (discussion #22): treat **QuoteLike**
entities — a **RequisitionList** (a limited quote) and a **NegotiableQuote** (a
quote with more features) — as *actual Quotes*. Then:

- they **check out through the existing checkout flow** with minimal change
  ("mainly permissions");
- an **admin grid** can list them, with stored/default views to filter and pick
  columns per implementation;
- **developers define their own QuoteLike entities** without reinventing each
  step.

Already running in production as **GraphCommerce_MultiCart** (GraphQL-only today,
but nothing inherent to that).

### What we'd change

- **Reinforces §4 — don't build per-entity tools.** A QuoteLike entity is a
  cart/quote plus config; `can_become_real` means "this one is checkoutable",
  i.e. the Execute tier applies. The generic surface from §4
  (`list_carts` / `get_cart` / `modify_cart` / `move_items`) already fits, so a
  new QuoteLike type needs **zero** MCP work.
- **NegotiableQuote moves back up.** §4 put it last because the Adobe version
  needs a fully custom checkout; reframed as a richer QuoteLike that checks out
  through the normal flow, it's no longer a special case. The reserved
  `quote.accept` scope is exactly the accept-a-quote permission.
- **Sharpens the per-object permission gap.** "Mainly permissions" is *per
  quote / per list*, but our governance enforces scope *per tool*. This is the
  same new layer §4 flagged — one more reason to solve object-level permissions
  generically rather than per entity.

---

## Net effect on the tracker

| Tracker item | Change |
|---|---|
| #2 cart / list drafts | Reframe as generic MultiCart surface, not a requisition-list tool |
| #3 authenticated binding | Add `locationId` to the context; location into `snapshotDigest` |
| #6 derive scopes from permissions | Shape now known: derive from `(contact, location)` |
| Pricing (new) | Price envelope + `price_view` + quantity breaks — not currently tracked |
| Negotiable quotes | ~~Explicitly last~~ → reframed as a QuoteLike that checks out through the normal flow; no longer necessarily last (§5) |
| QuoteLike surface (§5) | RequisitionList + NegotiableQuote + custom entities as one generic Quote surface; per-object permissions the open layer |

The pricing row is the only genuinely *new* requirement this feedback surfaces;
the rest sharpen or reprioritise items already in the tracker. §5 unifies the
list/quote entities under one abstraction and is the strongest signal yet that
the adapter should expose a generic Quote/cart surface, not per-entity tools.
