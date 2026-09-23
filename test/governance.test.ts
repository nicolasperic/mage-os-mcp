import { describe, it, expect, vi } from "vitest";
import {
  MemoryAuditSink,
  HashChainAuditSink,
  verifyChain,
} from "../dist/governance/audit.js";
import { redactArgs } from "../dist/governance/redact.js";
import { governTool, installGovernance } from "../dist/governance/governTool.js";

describe("redactArgs", () => {
  it("masks credential-shaped keys and truncates long strings", () => {
    const out = redactArgs({
      email: "a@b.com",
      password: "hunter2",
      access_token: "xyz",
      note: "x".repeat(300),
      nested: { api_key: "k", sku: "24-WB01" },
    });
    expect(out.password).toBe("***");
    expect(out.access_token).toBe("***");
    expect((out.nested as any).api_key).toBe("***");
    expect((out.nested as any).sku).toBe("24-WB01");
    expect(out.email).toBe("a@b.com");
    expect(String(out.note)).toMatch(/\[300 chars\]$/);
  });
});

describe("governTool audit", () => {
  const resolveActor = async (args: any) =>
    args.session_id
      ? { type: "customer" as const, customerId: 1, companyId: 7, roleId: 1, scopes: ["company.read"] }
      : { type: "anonymous" as const };

  it("records an ok event with actor, redacted input and duration", async () => {
    const sink = new MemoryAuditSink();
    const wrapped = governTool(
      "get_my_company",
      async () => ({ ok: true }),
      { sink, resolveActor },
    );
    const res = await wrapped({ session_id: "s1" });
    expect(res).toEqual({ ok: true });
    expect(sink.events).toHaveLength(1);
    const e = sink.events[0];
    expect(e.tool).toBe("get_my_company");
    expect(e.outcome).toBe("ok");
    expect(e.actor).toMatchObject({ type: "customer", companyId: 7 });
    expect(typeof e.durationMs).toBe("number");
    expect(e.correlationId).toBeTruthy();
  });

  it("records an error event (incl. authz denials) and rethrows", async () => {
    const sink = new MemoryAuditSink();
    const wrapped = governTool(
      "place_order",
      async () => {
        const err = new Error("requires 'purchase.execute'");
        err.name = "ScopeError";
        throw err;
      },
      { sink, resolveActor },
    );
    await expect(wrapped({ session_id: "s1" })).rejects.toThrow(/purchase.execute/);
    expect(sink.events[0]).toMatchObject({ tool: "place_order", outcome: "error" });
    expect(sink.events[0].error).toMatch(/ScopeError/);
  });

  it("never logs a credential", async () => {
    const sink = new MemoryAuditSink();
    const wrapped = governTool("login", async () => ({ success: true }), { sink, resolveActor });
    await wrapped({ email: "a@b.com", password: "hunter2" });
    expect(JSON.stringify(sink.events[0])).not.toContain("hunter2");
    expect((sink.events[0].input as any).password).toBe("***");
  });

  it("marks anonymous when there is no session", async () => {
    const sink = new MemoryAuditSink();
    const wrapped = governTool("search_products", async () => ({}), { sink, resolveActor });
    await wrapped({ search: "bag" });
    expect(sink.events[0].actor.type).toBe("anonymous");
  });
});

describe("installGovernance", () => {
  it("wraps every registered tool's handler", async () => {
    const sink = new MemoryAuditSink();
    const registered: Record<string, Function> = {};
    const fakeServer = {
      registerTool: (name: string, _spec: any, handler: Function) => {
        registered[name] = handler;
      },
    };
    installGovernance(fakeServer, { sink });
    fakeServer.registerTool("search_products", {}, async () => ({ hits: 1 }));

    const out = await registered.search_products({ search: "bag" });
    expect(out).toEqual({ hits: 1 });
    expect(sink.events[0].tool).toBe("search_products");
  });
});

describe("hash-chained audit (tamper evidence)", () => {
  it("chains events and detects tampering", async () => {
    const mem = new MemoryAuditSink();
    const chained = new HashChainAuditSink(mem);
    for (const tool of ["login", "get_my_company", "logout"]) {
      await chained.record({
        ts: new Date().toISOString(),
        correlationId: tool,
        tool,
        actor: { type: "customer", customerId: 1 },
        input: {},
        outcome: "ok",
        durationMs: 1,
      } as any);
    }
    expect(verifyChain(mem.events)).toBe(true);

    // Tamper with a past entry → chain no longer verifies.
    mem.events[1].tool = "delete_everything";
    expect(verifyChain(mem.events)).toBe(false);
  });

  it("verifies regardless of key insertion order (canonicalization)", async () => {
    const mem = new MemoryAuditSink();
    const chained = new HashChainAuditSink(mem);
    await chained.record({
      tool: "login", ts: "t", correlationId: "c", actor: { type: "customer" },
      input: {}, outcome: "ok", durationMs: 1,
    } as any);

    // Rebuild the recorded event with keys in a different order — same content.
    const e = mem.events[0];
    const reordered: any = {};
    for (const k of Object.keys(e).reverse()) reordered[k] = (e as any)[k];
    expect(verifyChain([reordered])).toBe(true);
  });
});

import { sessionStore } from "../dist/magento/session.js";

describe("centralized scope enforcement", () => {
  async function seedSession(scopes: string[]) {
    // Store a session in the shared store the wrapper reads from.
    return sessionStore().store({
      customerId: 1, companyId: 7, roleId: 1,
      scopes: scopes as any, token: "BEARER",
      expiresAt: Date.now() + 60_000, via: "test",
    });
  }

  it("allows a call when the session carries the required scope", async () => {
    const sink = new MemoryAuditSink();
    const sid = await seedSession(["company.read"]);
    const wrapped = governTool("get_my_company", async () => ({ ok: true }), {
      sink, toolScopes: { get_my_company: "company.read" as any },
    });
    const res = await wrapped({ session_id: sid });
    expect(res).toEqual({ ok: true });
    expect(sink.events[0].outcome).toBe("ok");
  });

  it("denies (and audits) when the session lacks the scope", async () => {
    const sink = new MemoryAuditSink();
    const sid = await seedSession(["company.read"]); // no purchase.execute
    const wrapped = governTool("place_order", async () => ({ placed: true }), {
      sink, toolScopes: { place_order: "purchase.execute" as any },
    });
    await expect(wrapped({ session_id: sid })).rejects.toThrow();
    expect(sink.events[0]).toMatchObject({ tool: "place_order", outcome: "error" });
    expect(sink.events[0].error).toMatch(/scope/i);
  });

  it("denies when there is no session at all", async () => {
    const sink = new MemoryAuditSink();
    const wrapped = governTool("get_my_company", async () => ({ ok: true }), {
      sink, toolScopes: { get_my_company: "company.read" as any },
    });
    await expect(wrapped({})).rejects.toThrow();
    expect(sink.events[0].outcome).toBe("error");
  });

  it("does not enforce on tools without a declared scope", async () => {
    const sink = new MemoryAuditSink();
    const wrapped = governTool("search_products", async () => ({ hits: 1 }), { sink });
    const res = await wrapped({ search: "bag" });
    expect(res).toEqual({ hits: 1 });
    expect(sink.events[0].outcome).toBe("ok");
  });
});

describe("governance robustness", () => {
  it("a failing audit sink does not change the tool outcome", async () => {
    const throwingSink = { record: async () => { throw new Error("disk full"); } };
    const wrapped = governTool("search_products", async () => ({ hits: 1 }), { sink: throwingSink as any });
    // The tool result must still come back even though the sink blew up.
    await expect(wrapped({ search: "bag" })).resolves.toEqual({ hits: 1 });
  });

  it("redactArgs caps deep nesting instead of overflowing", () => {
    let deep: any = {};
    let cur = deep;
    for (let i = 0; i < 5000; i++) { cur.n = {}; cur = cur.n; }
    // Should return without throwing (depth-capped).
    const out = redactArgs(deep);
    expect(JSON.stringify(out)).toContain("[max depth]");
  });
});
