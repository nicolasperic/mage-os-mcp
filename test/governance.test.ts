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
});
