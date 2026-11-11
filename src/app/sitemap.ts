import type { MetadataRoute } from "next";
import { canonicalUrl, guides, publicPages } from "@/lib/seo/catalog";
import { publicSeoEnabled } from "@/lib/seo/server";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!(await publicSeoEnabled())) return [];
  return publicPages.map(page => {
    const guide = guides.find(g => page.path === `/guides/${g.slug}`);
    // Only actual editorial dates; never manufacture freshness on every request.
    return { url: canonicalUrl(page.path), ...(guide ? { lastModified: guide.modified } : {}) };
  });
}
