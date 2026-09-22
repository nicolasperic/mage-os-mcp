import { describe, it, expect } from "vitest";
import { storeToken, getToken, authHeaders, revokeSession } from "../dist/magento/session.js";
import { logout } from "../dist/tools/logout.js";

describe("session store", () => {
  it("round-trips a token behind an opaque session id", async () => {
    const id = await storeToken("secret-token");
    expect(id).not.toBe("secret-token");
    expect(await getToken(id)).toBe("secret-token");
  });

  it("issues a distinct id per token", async () => {
    expect(await storeToken("a")).not.toBe(await storeToken("b"));
  });

  it("builds a bearer auth header from a session id", async () => {
    const id = await storeToken("tok");
    expect(await authHeaders(id)).toEqual({ Authorization: "Bearer tok" });
  });

  it("throws a helpful error for an unknown session id", async () => {
    await expect(getToken("nope")).rejects.toThrow(/login/i);
  });
});

describe("session revocation (scoped store)", () => {
  it("revokeSession invalidates a live session", async () => {
    const id = await storeToken("tok-x");
    expect(await getToken(id)).toBe("tok-x");
    expect(await revokeSession(id)).toBe(true);
    await expect(getToken(id)).rejects.toThrow(/login/i);
  });

  it("revoking an unknown session reports false", async () => {
    expect(await revokeSession("nope")).toBe(false);
  });

  it("the logout tool revokes and reports it", async () => {
    const id = await storeToken("tok-y");
    const out = await logout({ session_id: id });
    expect(out.revoked).toBe(true);
    await expect(getToken(id)).rejects.toThrow();
  });
});
