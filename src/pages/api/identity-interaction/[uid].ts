import type { NextApiRequest, NextApiResponse } from "next";
import { activeNativeUserEmail } from "@/lib/native-auth";
import {
  identityProvider,
  oidcAccount,
  identityClients,
} from "@/lib/enterprise/identity/oidc";
import { getPool } from "@/platform/db/pool";
export const config = { api: { bodyParser: false, externalResolver: true } };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "GET") return res.status(405).end();
  try {
    const provider = await identityProvider(),
      details = await provider.interactionDetails(req, res);
    if (
      details.uid !== req.query.uid ||
      !identityClients().some((c) => c.clientId === details.params.client_id)
    )
      return res.status(403).end();
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
    if (!subject) return res.status(403).send("账号尚未分配产品权限");
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
        return res.status(409).send("登录账号已变化，请重新发起登录");
      const grant = details.grantId
        ? await provider.Grant.find(details.grantId)
        : new provider.Grant({
            accountId: subject,
            clientId: String(details.params.client_id),
          });
      if (!grant) return res.status(409).end();
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
    res.status(400).send("请重新发起统一登录");
  } catch {
    if (!res.headersSent)
      res
        .status(403)
        .send("账号、企业或产品授权已失效，请重新登录或联系管理员");
  }
}
