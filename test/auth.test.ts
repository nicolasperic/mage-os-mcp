import { describe, it, expect, vi } from "vitest";
import { ClientError } from "graphql-request";
import {
  SCOPE_TIER,
  requireScope,
  hasScope,
  ScopeError,
  DEV_DEFAULT_SCOPES,
  type Scope,
} from "../dist/auth/scopes.js";
import { safeView, isExpired } from "../dist/auth/actorContext.js";
import { SessionStore, SessionError } from "../dist/auth/sessionStore.js";
import {
  PasswordAuthProvider,
  DelegatedAuthProvider,
  AuthError,
} from "../dist/auth/authProvider.js";

function baseContext(overrides = {}) {
  return {
    customerId: 1,
    companyId: 7,
    roleId: 1,
    scopes: ["company.read"] as Scope[],
    token: "SECRET-BEARER",
    expiresAt: Date.now() + 60_000,
    via: "test",
    ...overrides,
  };
}

describe("scopes", () => {
  it("assigns each scope to a tier", () => {
    expect(SCOPE_TIER["catalog.read"]).toBe("read");
    expect(SCOPE_TIER["cart.draft"]).toBe("draft");
    expect(SCOPE_TIER["purchase.execute"]).toBe("execute");
  });

  it("requireScope passes when granted and throws otherwise", () => {
    expect(() => requireScope(["cart.draft"], "cart.draft")).not.toThrow();
    expect(() => requireScope(["cart.draft"], "purchase.execute")).toThrow(ScopeError);
  });

  it("the dev default is read-only", () => {
    for (const s of DEV_DEFAULT_SCOPES) {
      expect(SCOPE_TIER[s]).toBe("read");
    }
    expect(hasScope(DEV_DEFAULT_SCOPES, "purchase.execute")).toBe(false);
  });
});

describe("actor context", () => {
  it("safeView never exposes the bearer token", () => {
    const view = safeView(baseContext({ sessionId: "s1" }) as any);
    expect(JSON.stringify(view)).not.toContain("SECRET-BEARER");
    expect(view).toMatchObject({ session_id: "s1", company_id: 7 });
    expect("token" in view).toBe(false);
  });

  it("isExpired reflects the clock", () => {
    const ctx = baseContext({ expiresAt: 1000 }) as any;
    expect(isExpired(ctx, 999)).toBe(false);
    expect(isExpired(ctx, 1000)).toBe(true);
  });
});

describe("session store", () => {
  it("stores and resolves a live context, asserting scope", () => {
    const store = new SessionStore();
    const id = store.store(baseContext({ scopes: ["cart.draft"] as Scope[] }));
    expect(store.resolve(id).customerId).toBe(1);
    expect(store.resolveWithScope(id, "cart.draft").sessionId).toBe(id);
    expect(() => store.resolveWithScope(id, "purchase.execute")).toThrow(ScopeError);
  });

  it("treats expired contexts as unknown and evicts them", () => {
    const store = new SessionStore();
    const id = store.store(baseContext({ expiresAt: 500 }));
    expect(() => store.resolve(id, 600)).toThrow(SessionError);
    expect(store.size()).toBe(0);
  });

  it("revokes immediately", () => {
    const store = new SessionStore();
    const id = store.store(baseContext());
    store.revoke(id);
    expect(() => store.resolve(id)).toThrow(SessionError);
  });

  it("unknown session ids throw", () => {
    expect(() => new SessionStore().resolve("nope")).toThrow(SessionError);
  });
});

describe("password auth provider (dev)", () => {
  it("returns a read-only context and keeps the token off the safe view", async () => {
    const request = vi.fn().mockResolvedValue({
      generateCustomerToken: { token: "TOK-123" },
    });
    const provider = new PasswordAuthProvider({ request } as any);
    const ctx = await provider.authenticate({ email: "a@b.com", password: "pw" });

    expect(ctx.token).toBe("TOK-123");
    expect(ctx.scopes).toEqual(DEV_DEFAULT_SCOPES);
    expect(hasScope(ctx.scopes, "purchase.execute")).toBe(false);
    expect(JSON.stringify(safeView({ ...ctx, sessionId: "s" }))).not.toContain("TOK-123");
  });

  it("maps bad credentials to a clean AuthError", async () => {
    const request = vi.fn().mockRejectedValue(
      new ClientError(
        { errors: [{ message: "The account sign-in was incorrect" }], status: 200, headers: {} as any },
        { query: "" },
      ),
    );
    const provider = new PasswordAuthProvider({ request } as any);
    await expect(provider.authenticate({ email: "a@b.com", password: "bad" }))
      .rejects.toThrow(/incorrect/);
  });
});

describe("delegated auth provider (stub)", () => {
  it("refuses when no verifier is configured", async () => {
    const provider = new DelegatedAuthProvider();
    await expect(provider.authenticate({ access_token: "x" }))
      .rejects.toThrow(/not configured/i);
  });

  it("delegates to the injected verifier when present", async () => {
    const verify = vi.fn().mockResolvedValue(baseContext({ via: "delegated-oauth" }));
    const provider = new DelegatedAuthProvider(verify);
    const ctx = await provider.authenticate({ access_token: "good-token" });
    expect(verify).toHaveBeenCalledWith("good-token");
    expect(ctx.via).toBe("delegated-oauth");
  });

  it("requires an access token", async () => {
    const provider = new DelegatedAuthProvider(vi.fn());
    await expect(provider.authenticate({})).rejects.toThrow(AuthError);
  });
});
