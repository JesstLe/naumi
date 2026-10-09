import {requireAdminPage} from "@/lib/admin-page";
import {AdminCenterShell} from "@/components/admin/center-shell";
import {SupplierModelLibrary} from "@/components/admin/mvp/supplier-model-library";
export const runtime="nodejs",dynamic="force-dynamic";
export const metadata={title:"供应商模型元数据与成本库 — Naumi",robots:{index:false,follow:false}};
export default async function SupplierLibraryPage(){await requireAdminPage("/admin/mvp/library");return <AdminCenterShell active="mvp"><SupplierModelLibrary/></AdminCenterShell>;}
