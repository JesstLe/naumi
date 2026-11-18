import type { NextApiRequest, NextApiResponse } from "next";
import { identityProvider } from "@/lib/enterprise/identity/oidc";
export const config = { api: { bodyParser: false, externalResolver: true } };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const provider = await identityProvider();
    (req as NextApiRequest & { originalUrl?: string }).originalUrl = req.url;
    // Koa router expects a mounted URL. Provider's mountPath is used for generated URLs only.
    req.url =
      (req.url || "/").replace(/^\/api\/identity(?=\/|\?|$)/, "") || "/";
    await provider.callback()(req, res);
  } catch {
    if (!res.headersSent) res.status(503).json({ error: "统一登录暂未就绪" });
  }
}
