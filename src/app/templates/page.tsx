import { TemplatesClient } from "@/components/templates/templates-client";

// Keep templates independently accessible from a disabled workspace.
export default function TemplatesPage() {
  return <div className="workspace-page"><header data-page-header><h1>模板中心</h1></header><TemplatesClient variant="creation" gridClass="columns-2 lg:columns-4" /></div>;
}
