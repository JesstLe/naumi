import { Studio3dClient } from "@/components/studio3d/studio3d-client";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `3D 工作台 — ${BRAND}` };
export default function Studio3dPage() {
  return <Studio3dClient />;
}
