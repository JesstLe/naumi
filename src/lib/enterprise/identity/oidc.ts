import "server-only";
import Provider, { errors, type AdapterPayload } from "oidc-provider";
import { z } from "zod";
import { getPool } from "@/platform/db/pool";
import { settingsSecret } from "@/lib/settings-secret";
import { activeNativeAccountEmail } from "@/lib/native-auth";
import { enterpriseCreationRead } from "../server";
import {
  deploymentPolicy,
  assertEnterpriseAllowed,
} from "../integration/policy";
import { identityIssuer } from "./accounts";
import { ensureIdentitySchema } from "./schema";
import { TeamError } from "@/lib/teams/errors";

const clientSchema = z
  .array(
    z
      .object({
        clientId: z.string().min(3).max(100),
        clientSecret: z.string().min(32),
        enterpriseId: z.string().uuid(),
        productId: z.literal("design-ops"),
        redirectUri: z.string().url(),
      })
      .strict(),
  )
  .min(1)
  .max(20);
export function identityClients() {
  const clients = clientSchema.parse(
    JSON.parse(process.env.NAUMI_IDENTITY_OIDC_CLIENTS || "[]"),
  );
  if (new Set(clients.map((c) => c.clientId)).size !== clients.length)
    throw Error("DUPLICATE_OIDC_CLIENT");
  for (const c of clients) {
    assertEnterpriseAllowed(deploymentPolicy(), c.enterpriseId);
    const u = new URL(c.redirectUri);
    if (
      u.protocol !== "https:" &&
      !(u.protocol === "http:" && u.hostname === "127.0.0.1")
    )
      throw Error("INVALID_OIDC_REDIRECT");
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/api/auth/central/callback"
    )
      throw Error("INVALID_OIDC_REDIRECT");
  }
  return clients;
}

/** PostgreSQL owns every provider model; codes and replay markers survive restarts. */
class IdentityAdapter {
  constructor(private model: string) {}
  async upsert(id: string, payload: AdapterPayload, expiresIn?: number) {
    const values = [
      this.model,
      id,
      JSON.stringify(payload),
      payload.grantId ?? null,
      payload.uid ?? null,
      payload.userCode ?? null,
      expiresIn ?? 3600,
    ];
    if (this.model === "ReplayDetection") {
      const r = await getPool().query(
        `INSERT INTO app_identity_oidc_store(model,id,payload,grant_id,uid,user_code,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+$7*interval '1 second')
    ON CONFLICT(model,id) DO UPDATE SET payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at WHERE app_identity_oidc_store.expires_at<=now() RETURNING id`,
        values,
      );
      if (!r.rowCount) throw new errors.InvalidGrant("replayed request");
      return;
    }
    await getPool().query(
      `INSERT INTO app_identity_oidc_store(model,id,payload,grant_id,uid,user_code,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+$7*interval '1 second')
   ON CONFLICT(model,id) DO UPDATE SET payload=EXCLUDED.payload,grant_id=EXCLUDED.grant_id,uid=EXCLUDED.uid,user_code=EXCLUDED.user_code,expires_at=EXCLUDED.expires_at`,
      values,
    );
  }
  async find(id: string) {
    if (this.model === "Client") return undefined;
    return (
      await getPool().query(
        "SELECT payload FROM app_identity_oidc_store WHERE model=$1 AND id=$2 AND expires_at>now()",
        [this.model, id],
      )
    ).rows[0]?.payload;
  }
  async findByUid(uid: string) {
    return (
      await getPool().query(
        "SELECT payload FROM app_identity_oidc_store WHERE model=$1 AND uid=$2 AND expires_at>now()",
        [this.model, uid],
      )
    ).rows[0]?.payload;
  }
  async findByUserCode(code: string) {
    return (
      await getPool().query(
        "SELECT payload FROM app_identity_oidc_store WHERE model=$1 AND user_code=$2 AND expires_at>now()",
        [this.model, code],
      )
    ).rows[0]?.payload;
  }
  async consume(id: string) {
    const r = await getPool().query(
      "UPDATE app_identity_oidc_store SET payload=jsonb_set(payload,'{consumed}',to_jsonb(extract(epoch FROM clock_timestamp())::bigint)) WHERE model=$1 AND id=$2 AND expires_at>now() AND NOT(payload ? 'consumed') RETURNING id",
      [this.model, id],
    );
    if (!r.rowCount)
      throw new errors.InvalidGrant("authorization already consumed");
  }
  async destroy(id: string) {
    await getPool().query(
      "DELETE FROM app_identity_oidc_store WHERE model=$1 AND id=$2",
      [this.model, id],
    );
  }
  async revokeByGrantId(id: string) {
    await getPool().query(
      // Provider revokes token models separately and destroys the Grant explicitly.
      // An account-switch Interaction can still reference that Grant while resuming.
      "DELETE FROM app_identity_oidc_store WHERE model=$1 AND grant_id=$2",
      [this.model, id],
    );
  }
}

export async function oidcAccount(
  subject: string,
  clientId: string,
  authenticatedAt?: number,
) {
  const client = identityClients().find((c) => c.clientId === clientId);
  if (!client) throw new TeamError("产品尚未接入", 403);
  const identity = (
    await getPool().query(
      "SELECT account_email FROM app_identity_subjects WHERE subject_id=$1",
      [subject],
    )
  ).rows[0];
  if (
    !identity ||
    !(await activeNativeAccountEmail(
      identity.account_email,
      authenticatedAt ?? Date.now(),
    ))
  )
    throw new TeamError("账号状态已变化，请重新登录", 401);
  return enterpriseCreationRead(
    identity.account_email,
    client.enterpriseId,
    async (tx) => {
      const r = (
        await tx.query(
          `SELECT u.name,u.email,o.organization,g.roles FROM app_identity_subjects i JOIN app_users u ON u.email=i.account_email
   JOIN app_identity_organizations o ON o.subject_id=i.subject_id AND o.enterprise_id=$2
   JOIN app_identity_product_grants g ON g.subject_id=i.subject_id AND g.enterprise_id=o.enterprise_id AND g.product_id=$3
   WHERE i.subject_id=$1 AND g.enabled`,
          [subject, client.enterpriseId, client.productId],
        )
      ).rows[0];
      if (!r || !r.roles.length) throw new TeamError("此产品尚未授权", 403);
      return {
        sub: subject,
        name: r.name,
        email: r.email,
        enterprise_id: client.enterpriseId,
        authority: deploymentPolicy().sourceInstanceId,
      };
    },
  );
}

let provider: Promise<Provider> | undefined;
export async function identityProvider() {
  if (process.env.NAUMI_IDENTITY_AUTHORITY_ENABLED !== "1")
    throw new TeamError("统一登录尚未启用", 503);
  if (!provider)
    provider = (async () => {
      await ensureIdentitySchema();
      const issuer = identityIssuer();
      if (new URL(issuer).pathname !== "/api/identity")
        throw Error("IDENTITY_ISSUER_PATH_MUST_BE_API_IDENTITY");
      const jwks = JSON.parse(process.env.NAUMI_IDENTITY_JWKS || "{}");
      if (
        !Array.isArray(jwks.keys) ||
        !jwks.keys.length ||
        !jwks.keys.every(
          (k: Record<string, unknown>) => k.kid && k.d && k.use === "sig",
        )
      )
        throw Error("PERSISTENT_PRIVATE_SIGNING_JWKS_REQUIRED");
      const p = new Provider(issuer, {
        adapter: IdentityAdapter,
        jwks,
        conformIdTokenClaims: false,
        clients: identityClients().map((c) => ({
          client_id: c.clientId,
          client_secret: c.clientSecret,
          redirect_uris: [c.redirectUri],
          response_types: ["code"],
          grant_types: ["authorization_code"],
          token_endpoint_auth_method: "client_secret_basic",
        })),
        cookies: {
          keys: [settingsSecret()],
          short: {
            httpOnly: true,
            sameSite: "lax",
            secure: issuer.startsWith("https:"),
          },
          long: {
            httpOnly: true,
            sameSite: "lax",
            secure: issuer.startsWith("https:"),
          },
        },
        features: {
          devInteractions: { enabled: false },
          registration: { enabled: false },
          revocation: { enabled: true },
          introspection: { enabled: true },
        },
        pkce: { required: () => true },
        scopes: ["openid", "profile", "email"],
        claims: {
          openid: ["sub"],
          profile: ["name", "enterprise_id", "authority"],
          email: ["email"],
        },
        ttl: {
          AccessToken: 300,
          IdToken: 300,
          AuthorizationCode: 60,
          Interaction: 600,
          Session: 3600,
          Grant: 3600,
        },
        interactions: {
          url: (_ctx, interaction) =>
            `${new URL(issuer).origin}/api/identity-interaction/${interaction.uid}`,
        },
        async findAccount(ctx, id, token) {
          const clientId = ctx.oidc.client?.clientId;
          if (!clientId) return undefined;
          const session = ctx.oidc.session;
          const authTime =
            token && "authTime" in token && typeof token.authTime === "number"
              ? token.authTime
              : session?.authTime();
          if (token && !authTime) return undefined;
          const claims = await oidcAccount(
            id,
            clientId,
            authTime ? authTime * 1000 : undefined,
          );
          return { accountId: id, claims: async () => claims };
        },
      });
      // Only the deployment ingress may supply forwarding headers; never publish the Node port.
      p.proxy = true;
      return p;
    })().catch((e) => {
      provider = undefined;
      throw e;
    });
  return provider;
}
