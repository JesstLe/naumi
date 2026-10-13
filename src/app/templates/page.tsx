import { TemplatesClient } from "@/components/templates/templates-client";

// Keep templates independently accessible from a disabled workspace.
export default function TemplatesPage() {
  return <div className="px-5 py-7 sm:px-8"><TemplatesClient /></div>;
}
