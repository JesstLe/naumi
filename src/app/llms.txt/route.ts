import { llmsText } from "@/lib/seo/catalog";
import { publicSeoEnabled } from "@/lib/seo/server";

export const dynamic = "force-dynamic";
export async function GET() {
  const enabled = await publicSeoEnabled();
  return new Response(enabled ? llmsText() : "Not found\n", {
    status: enabled ? 200 : 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
