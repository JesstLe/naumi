import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {planModelOnboarding} from '../src/lib/model-config/onboarding';
import {GPT26_PROFILES,gpt26Upstream} from '../src/lib/model-config/gpt26-onboarding';
import {modelCreditView} from '../src/lib/model-config/management-pricing';
import {publicModelCatalog} from '../src/lib/model-config/public-catalog';
import {validateModelConfig} from '../src/lib/model-config/schema';
async function main(){
 const evidence=process.env.NAUMI_GPT26_EVIDENCE_DIR;if(!evidence)throw Error('READONLY_SNAPSHOT_DIRECTORY_REQUIRED');
 const live=JSON.parse(JSON.parse(await readFile(join(evidence,'LIVE_CATALOG_PRICES_R1.json'),'utf8')).stdout);
 const billing=JSON.parse(await readFile(join(evidence,'LIVE_BILLING_SNAPSHOT.json'),'utf8'));billing.version=Number(billing.version);
 const snapshot=live.current;snapshot.version=Number(snapshot.version);
 const entries=GPT26_PROFILES.map(p=>({publicId:p.publicId,label:p.label,source:{upstream:gpt26Upstream(p.id,'apib-image')},features:['image.generate','canvas.image'] as ('image.generate'|'canvas.image')[],price:{mode:'copy' as const,sourceModelId:'gpt-image-2'}}));
 const result=planModelOnboarding(snapshot,billing,{entries,enabled:true,capabilityConfirmed:true});
 validateModelConfig(result.config);const after={version:snapshot.version+1,digest:'fixture-derived',config:result.config};const matrix=[];
 for(const feature of ['image.generate','canvas.image'] as const){
  const original=publicModelCatalog(snapshot,'image',feature,true),current=publicModelCatalog(after,'image',feature,true);
  assert.equal(current.defaultModelId,original.defaultModelId);assert.deepEqual(current.models.slice(0,original.models.length),original.models);
  for(const quality of ['low','medium','high','xhigh','max'])for(const resolution of ['1K','2K','4K']){
   const source=modelCreditView(billing,snapshot,feature,'gpt-image-2',quality,resolution);assert.equal(source.estimated,false);assert.notEqual(source.credits,null);
   for(const p of GPT26_PROFILES)assert.equal(modelCreditView(billing,after,feature,p.publicId,quality,resolution).credits,source.credits);
   matrix.push({feature,quality,resolution,credits:source.credits});
  }
 }
 await writeFile(join(evidence,'LIVE_PRICE_COPY.json'),JSON.stringify({sourceModelVersion:snapshot.version,billingVersion:billing.version,sourcePublicId:'gpt-image-2',comparisons:120,matrix,productionWrites:0},null,2));
 console.log(`LIVE_PRICE_COPY=PASS MODEL_VERSION=${snapshot.version} BILLING_VERSION=${billing.version} PAIRS=120 OLD_CATALOG_AND_DEFAULT=UNCHANGED PRODUCTION_WRITES=0 EXIT=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
