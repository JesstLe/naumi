import { EnterpriseConsole } from "@/components/enterprise/enterprise-console";
export const dynamic = "force-dynamic";
export default async function EnterprisePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  return <EnterpriseConsole initialQuery={query} identityAuthorityEnabled={process.env.NAUMI_IDENTITY_AUTHORITY_ENABLED==='1'} />;
}
