import { describe, it, expect } from "vitest";
import { storeToken, getToken, authHeaders } from "../dist/magento/session.js";

describe("session store", () => {
  it("round-trips a token behind an opaque session id", () => {
    const id = storeToken("secret-token");
    expect(id).not.toBe("secret-token");
    expect(getToken(id)).toBe("secret-token");
  });

  it("issues a distinct id per token", () => {
    expect(storeToken("a")).not.toBe(storeToken("b"));
  });

  it("builds a bearer auth header from a session id", () => {
    const id = storeToken("tok");
    expect(authHeaders(id)).toEqual({ Authorization: "Bearer tok" });
  });

  it("throws a helpful error for an unknown session id", () => {
    expect(() => getToken("nope")).toThrow(/login/i);
  });
});

import { revokeSession } from "../dist/magento/session.js";
import { logout } from "../dist/tools/logout.js";

describe("session revocation (scoped store)", () => {
  it("revokeSession invalidates a live session", () => {
    const id = storeToken("tok-x");
    expect(getToken(id)).toBe("tok-x");
    expect(revokeSession(id)).toBe(true);
    expect(() => getToken(id)).toThrow(/login/i);
  });

  it("revoking an unknown session reports false", () => {
    expect(revokeSession("nope")).toBe(false);
  });

  it("the logout tool revokes and reports it", async () => {
    const id = storeToken("tok-y");
    const out = await logout({ session_id: id });
    expect(out.revoked).toBe(true);
    expect(() => getToken(id)).toThrow();
  });
});
