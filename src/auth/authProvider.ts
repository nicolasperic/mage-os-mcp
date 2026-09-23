import { ClientError, type GraphQLClient } from "graphql-request";
import { GENERATE_TOKEN_MUTATION } from "../magento/queries.js";
import type { ActorContext } from "./actorContext.js";
import { DEV_DEFAULT_SCOPES, type Scope } from "./scopes.js";

/**
 * How a credential becomes a scoped ActorContext. This is the seam where the
 * B2B authorization model plugs in: the current password flow is a dev-only
 * stand-in, and the delegated (OAuth 2.1 + PKCE) provider is where production
 * auth lands once the authorization server is defined.
 */
export interface AuthProvider {
  readonly name: string;
  authenticate(credentials: unknown): Promise<ActorContext>;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * DEV / LEGACY ONLY. Exchanges email + password for a Magento customer token.
 *
 * This is a resource-owner-password flow: the agent handles the customer's
 * password, which the B2B delegated-auth model forbids. It exists so the
 * server keeps working locally while the delegated flow is built, and it grants
 * only the conservative read-only default scopes. Do not use it as the B2B
 * authentication path.
 */
export class PasswordAuthProvider implements AuthProvider {
  readonly name = "password-dev";

  constructor(
    private readonly client: GraphQLClient,
    private readonly ttlMs = 60 * 60 * 1000,
    private readonly scopes: Scope[] = DEV_DEFAULT_SCOPES,
  ) {}

  async authenticate(credentials: unknown): Promise<ActorContext> {
    const { email, password } = credentials as {
      email?: string;
      password?: string;
    };
    if (!email || !password) {
      throw new AuthError("email and password are required.");
    }

    let token: string;
    try {
      const data = await this.client.request<{
        generateCustomerToken: { token: string };
      }>(GENERATE_TOKEN_MUTATION, { email, password });
      token = data.generateCustomerToken.token;
    } catch (error) {
      const message =
        error instanceof ClientError
          ? (error.response.errors?.[0]?.message ?? "Authentication failed.")
          : "Authentication failed.";
      throw new AuthError(message);
    }

    return {
      sessionId: "",
      customerId: 0, // resolved lazily by tools today; delegated tokens carry it
      companyId: null,
      roleId: null,
      locationId: null,
      scopes: [...this.scopes],
      token,
      expiresAt: Date.now() + this.ttlMs,
      via: this.name,
    };
  }
}

/**
 * Verifies a delegated access token (from the OAuth 2.1 + PKCE flow) and
 * projects it into an ActorContext. The actual verification — signature / JWKS
 * or introspection, audience and scope checks, and mapping the token's claims
 * to customer / company / role — is supplied as `verify`, because it depends on
 * the authorization server that is still being defined. Until one is wired in,
 * this provider refuses rather than pretends.
 */
export interface DelegatedToken {
  access_token: string;
}

export type TokenVerifier = (accessToken: string) => Promise<ActorContext>;

export class DelegatedAuthProvider implements AuthProvider {
  readonly name = "delegated-oauth";

  constructor(private readonly verify?: TokenVerifier) {}

  async authenticate(credentials: unknown): Promise<ActorContext> {
    const { access_token } = (credentials ?? {}) as DelegatedToken;
    if (!access_token) {
      throw new AuthError("access_token is required.");
    }
    if (!this.verify) {
      throw new AuthError(
        "Delegated authorization is not configured yet. Wire in a token " +
          "verifier once the authorization server is defined.",
      );
    }
    return this.verify(access_token);
  }
}
