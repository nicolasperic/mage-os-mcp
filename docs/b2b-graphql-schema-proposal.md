# B2B GraphQL schema proposal — the acting-context triple

A concrete Mage-OS **storefront GraphQL** schema for the core B2B entities:
**Company · CompanyLocation · CompanyContact · Role assignment**. It turns the
object model Paul Hachmang (paales) shared in
[discussion #22](https://github.com/mage-os/mage-os/discussions/22) into a
reviewable contract, and maps each type to what Magento has today vs. what is
net-new.

Scope of this slice is deliberately the **read model for the triple** — the part
everything else (orders, draft orders/quotes, catalogs, pricing) hangs off.
Those are referenced here but specified in later slices.

> **Provenance.** The object shape is Shopify's B2B API model, shared in the
> discussion as the target. An API's *shape* is a fair conceptual basis for an
> open schema; this document authors its own SDL and (later) resolvers, and
> reuses no vendor source. It adapts the model to Magento conventions rather than
> copying Shopify's: `snake_case` fields, `pageSize`/`currentPage` +
> `items`/`page_info` pagination, an authenticated-customer entry point, and
> reuse of the existing `Customer`, `CustomerAddress` and `Money` types.

It extends the existing companion module
[`Orangecat_CompanyGraphQl`](https://github.com/nicolasperic/mage-os-b2b-graphql)
(which already exposes the current customer's company); the net-new part is
**locations and per-`(contact, location)` roles**.

---

## Why the triple first

The load-bearing insight from the discussion (feedback §1): **a role is assigned
per `(contact, location)`, not per company**, and **the location is part of the
commercial terms** — it selects the catalog, price list and payment terms. So
the location isn't a delivery detail; it changes what an order costs and what a
contact is allowed to do. Nothing downstream is correct until the triple is
modelled.

It also unblocks *this project's* MCP adapter: `ActorContext.locationId` and the
confirmation `snapshotDigest` already carry a location (currently always null) —
they were built location-shaped on purpose. This schema is the store-side piece
that lets that field become real.

---

## SDL

```graphql
# Entry point: the authenticated customer's company. Null for a customer who is
# not a company member; guests are rejected (GraphQlAuthorizationException),
# matching the existing AuthenticatedCustomerTrait.
type Query {
  company: Company
}

type Company {
  id: ID!
  name: String!
  main_contact: CompanyContact
  contacts(pageSize: Int = 20, currentPage: Int = 1): CompanyContacts
  locations(pageSize: Int = 20, currentPage: Int = 1): CompanyLocations
  roles(pageSize: Int = 20, currentPage: Int = 1): CompanyRoles
  # orders / draft_orders (quotes) — later slice
}

type CompanyContact {
  id: ID!
  # Reuse the existing storefront Customer type rather than re-describing a person.
  customer: Customer!
  is_main_contact: Boolean!
  # The triple: a contact's roles are per location.
  role_assignments: [CompanyContactRoleAssignment!]!
  # orders / draft_orders scoped to this contact — later slice
}

# NET-NEW upstream. The core of the proposal.
type CompanyLocation {
  uid: ID!
  name: String!
  phone: String
  billing_addresses: [CustomerAddress!]!
  shipping_addresses: [CustomerAddress!]!
  buyer_experience_configuration: BuyerExperienceConfiguration
  tax_settings: CompanyLocationTaxSettings
  role_assignments: [CompanyContactRoleAssignment!]!
  # catalogs / orders / draft_orders / store_credit — later slices
}

type CompanyContactRole {
  id: ID!
  name: String!   # store-defined, e.g. "admin" | "buyer" — kept free-form
  note: String
}

# Binds the triple together: this contact, at this location, has this role.
type CompanyContactRoleAssignment {
  role: CompanyContactRole!
  contact: CompanyContact!
  # Null on a store that does not model locations (see "graceful degradation").
  company_location: CompanyLocation
}

type BuyerExperienceConfiguration {
  checkout_to_draft: Boolean!
  deposit_percentage: Float
  editable_shipping_address: Boolean
  payment_terms_template: PaymentTermsTemplate
}

type PaymentTermsTemplate {
  name: String!
  due_in_days: Int!
  payment_terms_type: PaymentTermsType!
}

enum PaymentTermsType {
  FIXED
  FULFILLMENT
  NET
  RECEIPT
  UNKNOWN
}

type CompanyLocationTaxSettings {
  tax_exempt: Boolean!
  tax_registration_id: String
}

# Referenced by Order / DraftOrder in a later slice; defined here because the
# triple is what a purchasing entity is made of.
type PurchasingCompany {
  company: Company!
  contact: CompanyContact!
  company_location: CompanyLocation
}

union PurchasingEntity = Customer | PurchasingCompany

# Pagination wrappers — Magento's items/page_info convention, not Relay.
type CompanyContacts {
  items: [CompanyContact!]!
  page_info: SearchResultPageInfo
  total_count: Int
}

type CompanyLocations {
  items: [CompanyLocation!]!
  page_info: SearchResultPageInfo
  total_count: Int
}

# CompanyRoles already exists in Adobe B2B GraphQL; shown for completeness.
type CompanyRoles {
  items: [CompanyContactRole!]!
  page_info: SearchResultPageInfo
  total_count: Int
}
```

`Customer`, `CustomerAddress`, `Money` and `SearchResultPageInfo` are existing
Magento storefront types — reused, not redefined.

---

## Mapping: what exists vs. net-new

| Type / field | Status | Backing / note |
|---|---|---|
| `Company`, `main_contact`, `roles` | ✅ exists | Adobe Commerce B2B / Orangecat expose the company + roles. |
| `CompanyContact` | 🟡 rename | Adobe B2B calls these company **users**; this proposal uses Shopify's **contact**. Same entity — see open questions. |
| `CompanyContactRole` | ✅ exists | Adobe B2B roles (with permission resources). |
| `Customer`, `CustomerAddress`, `Money` | ✅ reuse | Native storefront types. |
| **`CompanyLocation`** and everything on it | ❌ **net-new** | No upstream model. The heart of the proposal. |
| **`buyer_experience_configuration`**, `payment_terms_template` | ❌ net-new | Payment terms exist conceptually in B2B but not as this per-location config. |
| **`CompanyContactRoleAssignment.company_location`** | ❌ net-new | Today a role is per company; the per-`(contact, location)` binding is new. |
| `CompanyLocationTaxSettings` | 🟡 partial | Tax classes/exemptions exist; not surfaced per location. |
| `PurchasingEntity` / `PurchasingCompany` | 🟡 partial | Maps to Magento Quote/Order ownership; formalised here. |
| `Catalog` / `PriceList` / `QuantityPriceBreak`, `DraftOrder` (Quote) | ⬜ later slice | Referenced, specified next. |

---

## Design decisions

- **Authenticated entry point.** `company` resolves the *current* customer's
  company — never a company id argument — so a caller can only read their own.
  Reuses the existing `AuthenticatedCustomerTrait` guard.
- **Magento conventions over Shopify's.** snake_case fields; `pageSize` /
  `currentPage` args with `items` / `page_info` results; reuse of `Customer`,
  `CustomerAddress`, `Money`.
- **Graceful degradation for locations.** A store that doesn't model locations
  exposes **one implicit default location**, so the `(contact, location)` model
  works everywhere and `role_assignments[].company_location` need not be null in
  practice. This keeps every consumer (frontend and MCP) on one code path.
- **Roles stay free-form strings**, per Shopify's note (`admin` / `buyer` are
  conventions, not an enum), so a store can define its own.
- **`uid` for the net-new `CompanyLocation`**, `id` for the entities that already
  exist with integer ids (`Company`, `CompanyContactRole`) — consistency with
  current Adobe B2B rather than a big-bang id migration (open question).

---

## Open questions for the discussion

1. **`contact` vs `user`.** Align with Shopify (`contact`) for the shared model,
   or with Adobe B2B's existing `users` field for least migration? A field alias
   could bridge both during transition.
2. **Where a location's catalog/price list attaches** — on `CompanyLocation` (as
   Shopify) or resolved via a market/condition selector. Affects the pricing
   slice.
3. **Do we expose role → permission *resources* here**, or keep permissions
   internal and let each consumer derive its own capabilities (the MCP derives
   scopes from `(contact, location)`)?
4. **Id convention** — standardise on `uid` for all B2B types, or keep integer
   `id` for the ones that already ship with it?

---

## What this unblocks in the MCP adapter

- `ActorContext.locationId` resolves from `company { … role_assignments { company_location } }`
  instead of being null — closing feedback §1 / tracker #3.
- **Scope derivation from `(contact, location)`** becomes possible — tracker #6,
  whose *shape* is now defined even before the authorization server exists.
- The confirmation `snapshotDigest` (already location-inclusive) becomes
  meaningful, so an order confirmed for one location can't execute against
  another's pricing.
- New reads it enables: `get_company_locations`, and enriching `get_my_company`
  with contacts and per-location roles.

See [`b2b-community-feedback.md`](b2b-community-feedback.md) §1 for the modelling
rationale and [`b2b-auth-model.md`](b2b-auth-model.md) for the MCP entities these
feed.
