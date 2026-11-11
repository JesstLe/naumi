import { TemplateLibrary } from "@/components/templates/template-library";

// Keep templates independently accessible from a disabled workspace.
export default function TemplatesPage() {
  return <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8"><TemplateLibrary /></div>;
}
