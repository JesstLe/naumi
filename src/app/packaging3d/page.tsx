import { Packaging3dClient } from "@/components/packaging3d/packaging3d-client";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `模切线转 3D — ${BRAND}` };

export default function Packaging3dPage() {
  return <Packaging3dClient />;
}
