/**
 * The scope vocabulary for delegated B2B access, and the risk tier each scope
 * belongs to. Scopes mirror what a company member could do in the storefront;
 * a delegated token can never carry more than the member actually has.
 *
 * The mapping from a company role to a set of scopes is a store-side policy
 * decision (the authorization server's job) and is deliberately NOT encoded
 * here — this module only defines the vocabulary and how it's enforced.
 */

export const SCOPES = [
  // Read tier — no state change.
  "company.read",
  "catalog.read",
  "pricing.read",
  "orders.read.own",
  "orders.read.company",
  "credit.read",
  // Draft tier — prepare, never charge.
  "cart.draft",
  "lists.manage.own",
  "lists.manage.company",
  // Execute tier — spends money; always paired with confirmation.
  "purchase.propose",
  "purchase.execute",
  "quote.accept",
] as const;

export type Scope = (typeof SCOPES)[number];

export type ScopeTier = "read" | "draft" | "execute";

export const SCOPE_TIER: Record<Scope, ScopeTier> = {
  "company.read": "read",
  "catalog.read": "read",
  "pricing.read": "read",
  "orders.read.own": "read",
  "orders.read.company": "read",
  "credit.read": "read",
  "cart.draft": "draft",
  "lists.manage.own": "draft",
  "lists.manage.company": "draft",
  "purchase.propose": "execute",
  "purchase.execute": "execute",
  "quote.accept": "execute",
};

/**
 * A conservative, read-only default used by the development password provider
 * so it produces a usable-but-safe context without inventing a role policy.
 * Real deployments derive scopes from the authorization server, not from here.
 */
export const DEV_DEFAULT_SCOPES: Scope[] = [
  "company.read",
  "catalog.read",
  "pricing.read",
  "orders.read.own",
  "orders.read.company",
  "credit.read",
];

export function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}

export function hasScope(granted: readonly Scope[], required: Scope): boolean {
  return granted.includes(required);
}

/** Thrown when a call requires a scope the actor's token does not carry. */
export class ScopeError extends Error {
  constructor(public readonly required: Scope) {
    super(
      `This action requires the '${required}' scope, which the current ` +
        `session was not granted.`,
    );
    this.name = "ScopeError";
  }
}

export function requireScope(
  granted: readonly Scope[],
  required: Scope,
): void {
  if (!hasScope(granted, required)) {
    throw new ScopeError(required);
  }
}
