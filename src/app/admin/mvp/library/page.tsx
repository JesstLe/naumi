import { permanentRedirect } from "next/navigation";
import { adminDestination } from "@/lib/admin-navigation";

/** Compatibility for existing supplier-library bookmarks. */
export default async function LegacySupplierLibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, values] of Object.entries(await searchParams)) {
    for (const value of Array.isArray(values) ? values : values === undefined ? [] : [values]) query.append(key, value);
  }
  permanentRedirect(adminDestination(`/admin/mvp/library?${query}`));
}
