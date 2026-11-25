/** Real PG + real publication/rollback and reader. No production or suppliers. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createModelFixture} from './model-config-fixture';
import {createPublishedModelReader,readPublishedModelSnapshot} from '../src/lib/model-config/published-repository';
import {modelCatalogWithPricing} from '../src/lib/model-config/catalog-pricing';
import {modelConfigDigest} from '../src/lib/model-config/snapshot-value';
import {fixtureConfig} from './billing-unit-fixture';

async function main(){
 const f=await createModelFixture();let checks=0;const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 const tx=await f.sql.connect();
 try{
  const original=await f.repo.current(),reader=createPublishedModelReader({pool:f.sql,trustedOrigins:[f.origin]});
  eq(await reader.current(),original);
  const all=await Promise.all(Array.from({length:100},()=>reader.current()));eq(all.map(s=>s?.digest),Array(100).fill(original.digest));
  all[0]!.config.providers[0].enabled=false;eq(all[1]!.config.providers[0].enabled,true);
  const billing={version:1,config:fixtureConfig()};
  eq(modelCatalogWithPricing((await reader.current())!,'image','canvas.image',billing),modelCatalogWithPricing(original,'image','canvas.image',billing));
  await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');eq(await readPublishedModelSnapshot(tx,{trustedOrigins:[f.origin]}),original);
  const draft=await f.repo.draft('cache-fixture');const config=structuredClone(draft.config);config.publicModels[0].label='new publication';
  const saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,actor:'cache-fixture',config});
  const stage=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:original.version,actor:'cache-fixture',reason:'reader immediate pointer visibility'});
  const next=await f.repo.markApplied(stage.id,stage.digest,saved.id);
  eq(await reader.current(),next);eq(await reader.byVersion(original.version),original);
  eq(await readPublishedModelSnapshot(tx,{trustedOrigins:[f.origin]}),original);await tx.query('COMMIT');
  eq(await readPublishedModelSnapshot(tx,{trustedOrigins:[f.origin]}),next);
  // A caller-owned uncommitted version can be read locally, but must not poison
  // the ordinary reader cache when the owner later rolls its transaction back.
  await tx.query('BEGIN');
  const testConfig=structuredClone(config);testConfig.publicModels[0].label='rolled back';
  const pending=(await tx.query(`INSERT INTO app_model_config_versions(operation_id,actor,reason,config,digest) VALUES($1,'fixture','rollback probe',$2::jsonb,$3) RETURNING version`,[randomUUID(),JSON.stringify(testConfig),modelConfigDigest(testConfig)])).rows[0];
  await tx.query('UPDATE app_model_config_state SET active_version=$1 WHERE singleton=true',[pending.version]);
  eq((await readPublishedModelSnapshot(tx,{trustedOrigins:[f.origin]}))!.config.publicModels[0].label,'rolled back');
  eq(await reader.current(),next);await tx.query('ROLLBACK');
  await assert.rejects(reader.byVersion(Number(pending.version)));checks++;eq(await reader.current(),next);
  // A pointer SELECT failure cannot return a last-known current snapshot.
  await f.sql.query('ALTER TABLE app_model_config_state RENAME TO app_model_config_state_hidden');
  await assert.rejects(reader.current());checks++;
  await f.sql.query('ALTER TABLE app_model_config_state_hidden RENAME TO app_model_config_state');
  eq(await reader.current(),next);
  // Even a manual UPDATE that preserves the digest cannot hide corruption
  // behind a warm current cache. xmin is checked without reading the body.
  await f.sql.query("UPDATE app_model_config_versions SET config=jsonb_set(config,'{publicModels,0,label}',to_jsonb('corrupted'::text)) WHERE version=$1",[next.version]);
  await assert.rejects(reader.current());checks++;
  await f.sql.query('UPDATE app_model_config_versions SET config=$2::jsonb WHERE version=$1',[next.version,JSON.stringify(next.config)]);
  eq(await reader.current(),next);
  console.log(`PUBLISHED_MODEL_READ_CACHE_PG=PASS checks=${checks} PUBLICATION=IMMEDIATE TRANSACTION=SNAPSHOT ROLLBACK=NO_CACHE_POISONING PRICING=EQUAL FROZEN=UNCHANGED SUPPLIER_POST=0`);
 }finally{await tx.query('ROLLBACK').catch(()=>{});tx.release();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
