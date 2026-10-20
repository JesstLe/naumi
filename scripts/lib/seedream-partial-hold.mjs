import assert from 'node:assert/strict';

const HELD = ['seedream-4-0','seedream-4-5','seedream-5-0-flash','seedream-5-0-lite'];
const PUBLIC = ['jimeng-image-4.0','jimeng-image-4.5','jimeng-image-5.0-flash','jimeng-image-5.0-lite'];

/** Exact inverse of this publication's four independent models only.
 * Does not remove/recreate Pro routing, restore a full snapshot, touch prices,
 * or discard subsequent unrelated administrator edits. Conflicts stay HOLD.
 */
export function holdIndependentSeedream(current, plan) {
  const config=structuredClone(current);
  const changes=plan.delta.filter(d=>d.kind==='field'&&d.group==='upstreamModels'&&HELD.some(id=>'apib:'+id===d.id)||d.kind==='public-add'&&PUBLIC.includes(d.id));
  assert.equal(changes.length,44,'Unexpected selective inverse boundary');
  for(const change of [...changes].reverse()){
    if(change.kind==='public-add'){
      const matches=config.publicModels.filter(m=>m.id===change.id);assert.deepEqual(matches,[change.after],'New public changed');
      assert.ok(!Object.values(config.bindings).includes(change.id),'New binding requires review');
      assert.ok(!Object.values(config.business||{}).some(f=>f.options.some(o=>o.modelId===change.id)),'New business dependency requires review');
      config.publicModels=config.publicModels.filter(m=>m.id!==change.id);
    }else{
      const matches=config.upstreamModels.filter(u=>u.id===change.id);assert.equal(matches.length,1);
      let parent=matches[0];for(const key of change.path.slice(0,-1)){assert.ok(parent[key]&&typeof parent[key]==='object');parent=parent[key];}
      const key=change.path.at(-1),value=Object.hasOwn(parent,key)?{present:true,value:structuredClone(parent[key])}:{present:false};
      assert.deepEqual(value,change.after,'Owned field changed; no overwrite');
      if(change.before.present)parent[key]=structuredClone(change.before.value);else delete parent[key];
    }
  }
  for(const wire of HELD){
    const id='apib:'+wire;assert.equal(config.upstreamModels.find(u=>u.id===id).enabled,false);
    assert.ok(!config.publicModels.some(p=>p.target.type==='upstream'&&p.target.id===id||p.supplierRouting?.channels.some(c=>c.upstreamId===id))&&!config.pools.some(p=>p.candidates.includes(id)),'New dependency requires review');
  }
  assert.deepEqual(config.publicModels.find(p=>p.id==='jimeng-image-5.0-pro'),current.publicModels.find(p=>p.id==='jimeng-image-5.0-pro'));
  assert.deepEqual(config.upstreamModels.find(u=>u.id==='apib:seedream-5-0-pro'),current.upstreamModels.find(u=>u.id==='apib:seedream-5-0-pro'));
  return config;
}
