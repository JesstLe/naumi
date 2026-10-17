import {createHash} from 'node:crypto';
import {z} from 'zod';
import {WorkflowError} from './contracts';
import {sharesSchema,type AcceptedFact,type Allocation,type Shares,type PublishedRule,type Snapshot,type ScoreResult} from './performance-contracts';
export const canonical=(v:unknown):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}':JSON.stringify(v);
export const digest=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
export function ensure(v:unknown,code:string,status=409):asserts v{if(!v)throw new WorkflowError(status,code);}
const instant=z.string().datetime({offset:true});
export function validFact(f:AcceptedFact){return Number.isInteger(f.points)&&f.points>=1&&f.points<=100&&Number.isInteger(f.quality)&&f.quality>=1&&f.quality<=5&&Number.isSafeInteger(f.reworkCount)&&f.reworkCount>=0&&[f.occurredAt,f.dueAt,f.submittedAt,f.acceptedAt].every(v=>instant.safeParse(v).success)&&Date.parse(f.acceptedAt)===Date.parse(f.occurredAt)&&Date.parse(f.submittedAt)<=Date.parse(f.acceptedAt)&&!!f.contributor&&f.participants.length>0&&f.participants.every(p=>typeof p==='string'&&p.length>0);}
export function validateShares(f:AcceptedFact,shares:Shares){ensure(sharesSchema.safeParse(shares).success,'INVALID_ALLOCATION',400);ensure(shares.length===f.participants.length&&shares.every(s=>f.participants.includes(s.subject)),'INVALID_CONTRIBUTOR',400);}
/** Largest remainder ensures that rounding never creates or loses task points. Stable code-point tie-break. */
export function distribute(total:number,shares:Shares){const parts=shares.map(s=>{const n=BigInt(total)*BigInt(s.bps);return {...s,value:Number(n/BigInt(10000)),remainder:Number(n%BigInt(10000))};}).sort((a,b)=>b.remainder-a.remainder||(a.subject<b.subject?-1:a.subject>b.subject?1:0));let left=total-parts.reduce((n,p)=>n+p.value,0);for(const p of parts){if(left<=0)break;p.value++;left--;}return new Map(parts.map(p=>[p.subject,p.value]));}
export function calculate(facts:AcceptedFact[],allocations:Map<string,Allocation>,rule:PublishedRule,claimed:Set<string>):Snapshot{
 const rows:Snapshot['rows']=[],blocked:Snapshot['blocked']=[],results=new Map<string,ScoreResult>();
 for(const f of facts){if(claimed.has(f.id)){blocked.push({factId:f.id,code:'FACT_ALREADY_CONFIRMED'});continue;}if(!validFact(f)){blocked.push({factId:f.id,code:'FACT_INCOMPLETE'});continue;}
  const a=allocations.get(f.id),single=f.participants.length===1&&f.contributionBps===10000;
  const shares=single?[{subject:f.contributor,bps:10000}]:a?.status==='approved'?a.shares:null;
  if(!shares){blocked.push({factId:f.id,code:'ALLOCATION_REVIEW_REQUIRED'});continue;}try{validateShares(f,shares);}catch{blocked.push({factId:f.id,code:'INVALID_ALLOCATION'});continue;}
  const onTime=Date.parse(f.submittedAt)<=Date.parse(f.dueAt),reworkBps=10000-Math.min(f.reworkCount*rule.rule.reworkPenaltyBps,rule.rule.maxReworkPenaltyBps),baseMilli=f.points*1000,numerator=BigInt(baseMilli)*BigInt(rule.rule.qualityBps[f.quality-1])*BigInt(onTime?10000:rule.rule.lateBps)*BigInt(reworkBps),scoreMilli=Number((numerator+BigInt(500000000000))/BigInt(1000000000000)),base=distribute(baseMilli,shares),score=distribute(scoreMilli,shares);
  const parts=shares.map(s=>({...s,baseMilli:base.get(s.subject)!,scoreMilli:score.get(s.subject)!}));rows.push({fact:f,allocationVersion:single?0:a!.version,allocationApprovedBy:single?null:a!.reviewedBy!,shares,onTime,reworkBps,baseMilli,scoreMilli,parts});
  for(const p of parts){const r=results.get(p.subject)??{subject:p.subject,taskCount:0,onTimeCount:0,onTimeRateBps:0,reworkCount:0,baseMilli:0,scoreMilli:0};r.taskCount++;r.onTimeCount+=onTime?1:0;r.reworkCount+=f.reworkCount;r.baseMilli+=p.baseMilli;r.scoreMilli+=p.scoreMilli;results.set(p.subject,r);}
 }
 const summary=[...results.values()].sort((a,b)=>a.subject<b.subject?-1:1);for(const r of summary)r.onTimeRateBps=Math.round(r.onTimeCount/r.taskCount*10000);
 const value={rule,rows,results:summary,blocked,factCount:facts.length};return {...value,previewHash:digest(value)};
}
export const rangeEnd=(date:string)=>new Date(Date.parse(date+'T00:00:00+08:00')+86400000).toISOString();
export function scoreCsv(rows:ScoreResult[]){const cell=(v:unknown)=>{let s=String(v??'');if(typeof v==='string'&&/^[\s\u0000-\u001f]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\ufeff'+[['账号','参与任务数','及时任务数','及时率百分比','返工次数','分摊工作量点','规则计分点'],...rows.map(r=>[r.subject,r.taskCount,r.onTimeCount,r.onTimeRateBps/100,r.reworkCount,r.baseMilli/1000,r.scoreMilli/1000])].map(r=>r.map(cell).join(',')).join('\r\n');}
