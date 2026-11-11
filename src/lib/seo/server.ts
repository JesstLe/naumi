import "server-only";
import { cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { enterpriseSiteIdentity } from "@/lib/site-control/identity";
import { canonicalUrl, isPublicSeoHost, NO_INDEX, publicPage, SEO_IMAGE, SEO_ORIGIN } from "./catalog";

/** No forwarded-host trust, DB/network I/O or tenant data in crawler endpoints. */
export const publicSeoEnabled = cache(async () => isPublicSeoHost(
  (await headers()).get("host"), !!enterpriseSiteIdentity(), process.env.FLEET_PORTAL_ONLY === "1",
));

export async function publicMetadata(path: string, fallbackTitle?: string): Promise<Metadata> {
  const page = publicPage(path);
  if (!page) throw new Error(`Unknown public page: ${path}`);
  if (!(await publicSeoEnabled())) return { ...(fallbackTitle ? { title: fallbackTitle } : {}), robots: NO_INDEX };
  const title = path === "/" ? page.title : `${page.title} - Naumi`;
  return {
    metadataBase: new URL(SEO_ORIGIN), title, description: page.description,
    alternates: { canonical: canonicalUrl(path) },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    openGraph: { type: "website", url: canonicalUrl(path), title, description: page.description, siteName: "Naumi", locale: "zh_CN", images: [{ url: SEO_IMAGE, width: 1200, height: 630, alt: "Naumi AI Design" }] },
    twitter: { card: "summary_large_image", title, description: page.description, images: [SEO_IMAGE] },
  };
}
