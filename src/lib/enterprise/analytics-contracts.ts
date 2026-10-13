import { FEATURE_LABELS } from '@/lib/billing/labels';

export const PURPOSES: Record<string,string> = { ...FEATURE_LABELS, unknown:'历史用途未记录' };
export const EVENT_LABELS: Record<string,string> = {consume:'创作消费',refund:'积分返还',grant:'积分发放',purchase:'积分购买',expire:'积分过期',adjust:'管理员调账',other:'其他变动'};
export type AnalyticsFilter = {enterpriseId:string;from:string;to:string;group:'day'|'week'|'month';email:string;team:string;purpose:string;kind:string;page:number};
export type Usage = {consumed:number;refunded:number;net:number;events:number};
export type MemberUsage = Usage & {email:string;name:string;role:string;employment:string;supervisor:string;artworks:number;tasks:number;succeeded:number;failed:number;pending:number;unknown:number;available:number;reserved:number;expiring:number;banned:boolean;expiresAt:string|null};
export type LedgerEntry = {id:string;email:string;name:string;createdAt:string;kind:string;purpose:string;delta:number;operationId:string|null;source:'计费记录'|'历史摘要'|'未记录'};
export type EnterpriseAnalytics = {
  filter:AnalyticsFilter;generatedAt:string;timezone:'Asia/Shanghai';
  summary:Usage & {activeMembers:number;scopeMembers:number;artworks:number;tasks:number;succeeded:number;failed:number;pending:number;unknown:number;successRate:number|null;creditsPerArtwork:number|null;previousNet:number;changePercent:number|null;available:number;reserved:number;expiring:number;issued:number;adjustment:number;expired:number;unclassified:number};
  trend:(Usage & {date:string;artworks:number})[];
  purposes:(Usage & {purpose:string})[];
  members:MemberUsage[];
  choices:{email:string;name:string;supervisor:string}[];
  details:{rows:LedgerEntry[];total:number;page:number;size:number};
  risks:{code:string;count:number;amount:number;members:{email:string;name:string}[]}[];
};

export function shanghaiToday(now=new Date()){return new Date(now.getTime()+8*3600000).toISOString().slice(0,10)}
export function shiftDate(date:string,n:number){return new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)}
export function presetDates(preset:string,today=shanghaiToday()) {
  if(preset==='yesterday')return {from:shiftDate(today,-1),to:shiftDate(today,-1)};
  if(preset==='week'){const weekday=new Date(today+'T00:00:00Z').getUTCDay()||7;return {from:shiftDate(today,1-weekday),to:today}}
  if(preset==='month')return {from:today.slice(0,8)+'01',to:today};
  if(preset==='last7'||preset==='last30')return {from:shiftDate(today,preset==='last7'?-6:-29),to:today};
  return {from:today,to:today};
}
