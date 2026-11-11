import type { MetadataRoute } from "next";
import { publicRobots } from "@/lib/seo/catalog";
import { publicSeoEnabled } from "@/lib/seo/server";

export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  return publicRobots(await publicSeoEnabled());
}
