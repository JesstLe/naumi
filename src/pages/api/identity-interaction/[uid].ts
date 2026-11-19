import type { NextApiRequest, NextApiResponse } from "next";
import { activeNativeUserEmail } from "@/lib/native-auth";
import {
  identityProvider,
  oidcAccount,
  identityClients,
} from "@/lib/enterprise/identity/oidc";
import { getPool } from "@/platform/db/pool";
import { TeamError } from "@/lib/teams/errors";
import { loginErrorResponse, type LoginErrorCode } from "@/lib/enterprise/identity/login-error";
export const config = { api: { bodyParser: false, externalResolver: true } };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "GET") return res.status(405).end();
  let configuredRedirectUri: string | undefined;
  const fail = (code: LoginErrorCode) => {
    const page = loginErrorResponse(code, configuredRedirectUri);
    for (const [name, value] of Object.entries(page.headers)) res.setHeader(name, value);
    return res.status(page.status).send(page.html);
  };
  try {
    const provider = await identityProvider(),
      details = await provider.interactionDetails(req, res);
    const client = identityClients().find((c) => c.clientId === details.params.client_id);
    if (details.uid !== req.query.uid || !client) return fail("login_expired");
    configuredRedirectUri = client.redirectUri;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    const email = await activeNativeUserEmail(
      new Request("https://localhost", { headers }),
    );
    if (!email) {
      res.redirect(
        303,
        `/?auth=sign-in&redirect=${encodeURIComponent("/api/identity-interaction/" + details.uid)}`,
      );
      return;
    }
    const subject = (
      await getPool().query(
        "SELECT subject_id FROM app_identity_subjects WHERE account_email=$1",
        [email],
      )
    ).rows[0]?.subject_id;
    if (!subject) return fail("product_access_required");
    await oidcAccount(subject, String(details.params.client_id));
    if (details.prompt.name === "login") {
      await provider.interactionFinished(
        req,
        res,
        { login: { accountId: subject } },
        { mergeWithLastSubmission: false },
      );
      return;
    }
    if (details.prompt.name === "consent") {
      if (details.session?.accountId !== subject)
        return fail("account_changed");
      const grant = details.grantId
        ? await provider.Grant.find(details.grantId)
        : new provider.Grant({
            accountId: subject,
            clientId: String(details.params.client_id),
          });
      if (!grant) return fail("login_expired");
      const missing = details.prompt.details.missingOIDCScope as
        string[] | undefined;
      if (missing) grant.addOIDCScope(missing.join(" "));
      const claims = details.prompt.details.missingOIDCClaims as
        string[] | undefined;
      if (claims) grant.addOIDCClaims(claims);
      const grantId = await grant.save();
      await provider.interactionFinished(
        req,
        res,
        { consent: { grantId } },
        { mergeWithLastSubmission: true },
      );
      return;
    }
    return fail("login_expired");
  } catch (error) {
    if (!res.headersSent) {
      if (error instanceof TeamError && error.status === 403) return fail("product_access_required");
      if (error instanceof TeamError && error.status === 401) return fail("account_changed");
      if (error instanceof Error && error.name === "SessionNotFound") return fail("login_expired");
      return fail("service_unavailable");
    }
  }
}
