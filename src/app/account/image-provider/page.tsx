import { ImageProviderClient } from "@/components/account/image-provider-client";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `图片生成接口 — ${BRAND}` };

export default function ImageProviderPage() {
  return <ImageProviderClient />;
}
