import { HomeGate } from "@/components/home/home-gate";
import { JsonLd } from "@/components/seo/json-ld";
import { homeJsonLd } from "@/lib/seo/catalog";
import { publicMetadata, publicSeoEnabled } from "@/lib/seo/server";

export async function generateMetadata() { return publicMetadata("/"); }

export default async function HomePage() {
  return <>{await publicSeoEnabled() && <JsonLd data={homeJsonLd()} />}<HomeGate /></>;
}
