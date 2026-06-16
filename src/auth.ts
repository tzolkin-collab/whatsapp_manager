import { randomUUID, randomBytes } from "crypto";
import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

/**
 * Minimal, self-contained OAuth 2.1 authorization server for this single
 * deployment. There is no external identity provider and no real user
 * accounts — anyone who can reach the deployment's public URL and click
 * "Autorizar" on the consent page gets a token. This exists only so MCP
 * clients whose "add connector" flow requires OAuth (and won't accept a
 * bare unauthenticated URL) have something to talk to; it intentionally
 * does not try to be a multi-tenant identity system.
 *
 * Everything is in-memory: a container restart invalidates all registered
 * clients and tokens, and the user has to reconnect. Acceptable for a
 * personal automation tool; would need a real store for anything bigger.
 */

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PENDING_DECISION_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ): OAuthClientInformationFull {
    const client_id = randomUUID();
    const isPublicClient = client.token_endpoint_auth_method === "none";
    const full: OAuthClientInformationFull = {
      ...client,
      client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(isPublicClient ? {} : { client_secret: randomBytes(32).toString("hex") }),
    };
    this.clients.set(client_id, full);
    return full;
  }
}

type PendingDecision = {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  createdAt: number;
};

type AuthCodeEntry = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: URL;
  expiresAt: number;
};

type AccessTokenEntry = {
  clientId: string;
  scopes: string[];
  resource?: URL;
  expiresAt: number;
};

export class WhatsAppOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;

  private pendingDecisions = new Map<string, PendingDecision>();
  private authCodes = new Map<string, AuthCodeEntry>();
  private accessTokens = new Map<string, AccessTokenEntry>();

  constructor(clientsStore: OAuthRegisteredClientsStore) {
    this.clientsStore = clientsStore;
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [id, d] of this.pendingDecisions) {
      if (now - d.createdAt > PENDING_DECISION_TTL_MS) this.pendingDecisions.delete(id);
    }
    for (const [code, e] of this.authCodes) {
      if (now > e.expiresAt) this.authCodes.delete(code);
    }
    for (const [token, e] of this.accessTokens) {
      if (now > e.expiresAt * 1000) this.accessTokens.delete(token);
    }
  }

  // Renders a one-button consent page instead of auto-approving. There's no
  // real login here (no accounts to log into) — this is the only checkpoint
  // before a client gets a token, so it stays an explicit click rather than
  // a silent redirect.
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    this.sweepExpired();
    const decisionId = randomUUID();
    this.pendingDecisions.set(decisionId, { client, params, createdAt: Date.now() });

    const appName = client.client_name || client.client_id;
    res.set("Content-Type", "text/html; charset=utf-8").send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Autorizar conector WhatsApp</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f1efe8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: #fff; border-radius: 12px; padding: 32px; max-width: 420px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p { color: #555; font-size: 14px; line-height: 1.5; }
  .actions { display: flex; gap: 12px; margin-top: 24px; }
  button { flex: 1; padding: 10px 16px; border-radius: 8px; border: none; font-size: 14px; cursor: pointer; }
  .allow { background: #16a766; color: #fff; }
  .deny { background: #f1efe8; color: #333; }
</style>
</head>
<body>
  <div class="card">
    <h1>Autorizar conector WhatsApp</h1>
    <p><strong>${escapeHtml(appName)}</strong> está pedindo acesso ao servidor MCP do WhatsApp (Evolution API) — list_instances, send_text, send_media e demais ferramentas.</p>
    <form method="POST" action="/authorize/decision">
      <input type="hidden" name="decisionId" value="${decisionId}">
      <div class="actions">
        <button class="deny" name="decision" value="deny" type="submit">Negar</button>
        <button class="allow" name="decision" value="allow" type="submit">Autorizar</button>
      </div>
    </form>
  </div>
</body>
</html>`);
  }

  // Called by the POST /authorize/decision route (wired up in index.ts,
  // outside the SDK's router) once the user clicks Allow/Deny.
  resolveDecision(decisionId: string, allow: boolean): { redirectUrl: string } {
    this.sweepExpired();
    const pending = this.pendingDecisions.get(decisionId);
    if (!pending) {
      throw new Error("Decisão expirada ou inválida — peça pro cliente MCP iniciar a autorização de novo.");
    }
    this.pendingDecisions.delete(decisionId);
    const { client, params } = pending;
    const redirect = new URL(params.redirectUri);

    if (!allow) {
      redirect.searchParams.set("error", "access_denied");
      if (params.state) redirect.searchParams.set("state", params.state);
      return { redirectUrl: redirect.toString() };
    }

    const code = randomBytes(32).toString("hex");
    this.authCodes.set(code, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scopes: params.scopes ?? [],
      resource: params.resource,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });

    redirect.searchParams.set("code", code);
    if (params.state) redirect.searchParams.set("state", params.state);
    return { redirectUrl: redirect.toString() };
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const entry = this.authCodes.get(authorizationCode);
    if (!entry) throw new InvalidGrantError("Authorization code inválido ou expirado");
    return entry.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ): Promise<OAuthTokens> {
    this.sweepExpired();
    const entry = this.authCodes.get(authorizationCode);
    if (!entry || entry.clientId !== client.client_id) {
      throw new InvalidGrantError("Authorization code inválido, expirado, ou de outro client");
    }
    if (redirectUri && entry.redirectUri !== redirectUri) {
      throw new InvalidGrantError("redirect_uri não bate com o usado na autorização");
    }
    // Single use.
    this.authCodes.delete(authorizationCode);

    const accessToken = randomBytes(32).toString("hex");
    const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;
    this.accessTokens.set(accessToken, {
      clientId: client.client_id,
      scopes: entry.scopes,
      resource: resource ?? entry.resource,
      expiresAt,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: entry.scopes.join(" ") || undefined,
      // No refresh_token issued — tokens are long-lived (90 days) and the
      // user can just re-run the authorize flow when one expires. Keeps
      // exchangeRefreshToken() below from ever actually being exercised.
    };
  }

  async exchangeRefreshToken(): Promise<OAuthTokens> {
    // Never issued, so a well-behaved client should never call this.
    throw new InvalidGrantError("Refresh tokens não são emitidos por este servidor — reautorize.");
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    this.sweepExpired();
    const entry = this.accessTokens.get(token);
    if (!entry) throw new InvalidGrantError("Access token inválido, expirado, ou revogado");
    return {
      token,
      clientId: entry.clientId,
      scopes: entry.scopes,
      expiresAt: entry.expiresAt,
      resource: entry.resource,
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: { token: string }
  ): Promise<void> {
    this.accessTokens.delete(request.token);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
