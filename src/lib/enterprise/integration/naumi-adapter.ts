import 'server-only';
import type { TeamActor } from '@/lib/teams/grants';
import { TeamError } from "@/lib/teams/errors";
import { enterpriseList,enterpriseSnapshot,enterpriseRead } from '../server';
import { enterpriseAnalytics,analyticsQuerySchema } from '../analytics';
import {queryBi,queryEnterpriseOperations} from "@/lib/bi/repository";
import {ensureBiSchema} from "@/lib/bi/schema";

import { parseBiQuery } from '@/lib/bi/contracts';
import type { BiRow } from '@/lib/bi/contracts';
import type { DeploymentPolicy,EnterpriseDataPort,IntegrationPage,RecordQuery } from './contracts';
import { assertEnterpriseAllowed } from './policy';
import { normalizeRecord } from './normalize';

/** Same server-side functions as /enterprise; no HTTP self-call and no duplicate charge/account store. */
export class NaumiEnterpriseAdapter implements EnterpriseDataPort {
  readonly transport='in-process' as const;
  constructor(private actor:TeamActor,readonly policy:DeploymentPolicy){}
  async list(){return (await enterpriseList(this.actor)).filter(t=>!this.policy.allowedEnterpriseIds.length||this.policy.allowedEnterpriseIds.includes(t.id));}
  async members(id:string){assertEnterpriseAllowed(this.policy,id);return enterpriseSnapshot(this.actor,id);}
  async records(input:RecordQuery):Promise<IntegrationPage>{
    assertEnterpriseAllowed(this.policy,input.enterpriseId);
    const params=new URLSearchParams({section:input.kind==='generations'?'operations':input.kind==='ledger'?'ledger':'artworks'});
    for(const key of ['from','to','email','page','size'] as const)if(input[key]!==undefined)params.set(key,String(input[key]));
    const query=parseBiQuery(params);
    let rows:BiRow[],total:number,size:number,page:number,generatedAt:string;
    if(input.kind==='ledger'){
      // Reuse the enterprise ledger's authoritative delta/purpose/refund classification, not raw reason text.
      const analytics=await enterpriseAnalytics(this.actor,analyticsQuerySchema.parse({enterpriseId:input.enterpriseId,from:query.from,to:query.to,email:query.email,page:query.page}));
      rows=analytics.details.rows as unknown as BiRow[];total=analytics.details.total;size=analytics.details.size;page=analytics.details.page;generatedAt=analytics.generatedAt;
    }else{
      await ensureBiSchema();
      const data=await enterpriseRead(this.actor,input.enterpriseId,async(tx,scope)=>{
        if(query.email&&!scope.visible.has(query.email))throw new TeamError('没有该成员内容的查看权限');
        const access={client:tx,allowedEmails:[...scope.visible]};
        return input.kind==='generations'?queryEnterpriseOperations(query,access):queryBi(query,access);
      });
      ({rows,total,size,page,generatedAt}=data);
    }
    return {version:1,source:'naumi',instanceId:this.policy.sourceInstanceId,enterpriseId:input.enterpriseId,kind:input.kind,
      rows:rows.map(r=>normalizeRecord(this.policy.sourceInstanceId,input.enterpriseId,input.kind,r)),total,page,size,generatedAt,
      consistency:'source-read',attribution:'current-membership-not-historical-ownership'};
  }
}
