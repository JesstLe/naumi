import { createHash } from "node:crypto";
import { readPelicanArtifact } from "@/lib/agent/pelican-artifact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public authored demo only, never user media; no arbitrary paths or uploads. */
export async function GET(request: Request) {
  const html = readPelicanArtifact();
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] || "";
  const hash = createHash("sha256").update(script.replace(/\r\n?/g, "\n")).digest("base64");
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(html, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="pelican-cycling.html"`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=3600",
    "Content-Security-Policy": `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
  } });
}
