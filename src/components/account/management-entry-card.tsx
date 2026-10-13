"use client";
import Link from 'next/link';
import { ChevronRight, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/locale-context';
import { entryStatusLabel } from '@/lib/teams/entry-contract';
import { useManagementEntry } from './use-management-entry';

export function ManagementEntryCard() {
  const { user } = useAuth(), { locale } = useI18n();
  const { data, state, refresh } = useManagementEntry(user);
  const english = locale === 'en';
  const status = state === 'ready' ? data!.status : state;
  const title = data?.enterprise ? (english ? 'Enterprise management' : '企业管理入口') : (english ? 'Team management' : '团队入口');
  const date = (value: string) => new Date(value).toLocaleString(english ? 'en-US' : 'zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  return <section data-testid="management-entry-card" className="mb-8 rounded-2xl border border-border bg-card px-6 py-5 card-shadow">
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Users className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{state !== 'ready' ? entryStatusLabel(status, english) : data?.allowed
          ? data.expiresAt ? `${english ? 'Valid until' : '有效至'} ${date(data.expiresAt)}` : english ? 'Permanent access' : '永久有效'
          : data?.status === 'scheduled' && data.startsAt ? `${english ? 'Starts' : '生效时间'} ${date(data.startsAt)}` : entryStatusLabel(status, english)}</p>
      </div>
      <span role="status" className={`rounded-full px-2.5 py-1 text-xs font-medium ${data?.allowed ? 'bg-emerald-50 text-emerald-700' : 'bg-secondary text-muted-foreground'}`}>{entryStatusLabel(status, english)}</span>
      {data?.allowed && <Link href={data.href} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-secondary">{english ? 'Open' : '进入管理'}<ChevronRight className="h-3.5 w-3.5" /></Link>}
      <button type="button" aria-label={english ? 'Refresh entry status' : '刷新入口授权'} onClick={refresh} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"><RefreshCw className="h-4 w-4" /></button>
    </div>
  </section>;
}
