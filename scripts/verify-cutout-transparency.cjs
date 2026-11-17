const assert=require('node:assert/strict'),sharp=require('sharp'),fs=require('node:fs'),path=require('node:path');
const {loadCutoutFixture}=require('./cutout-transparency-fixture.cjs');
const baseline=process.argv.includes('--baseline');
(async()=>{
 const {state,execute}=await loadCutoutFixture();
 const board=alpha=>{const data=Buffer.alloc(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4;data.fill(((x>>2)+(y>>2))%2?255:210,i,i+3);data[i+3]=alpha}return sharp(data,{raw:{width:32,height:32,channels:4}}).png().toBuffer()};
 const almostOpaque=await board(254),bad=await execute(almostOpaque);
 if(baseline){assert.equal(bad.status,200);assert.equal(state.artworks.length,1);console.log('CUTOUT_TRANSPARENCY_BASELINE=REPRODUCED alpha254_checkerboard=accepted artwork_saved=true supplier_fixture_calls=1 external_calls=0');return;}
 assert.equal(bad.status,502);assert.equal(bad.body.code,'CUTOUT_OUTPUT_INVALID');assert.equal(state.artworks.length,0);assert.equal(state.checkpoints.length,0);assert.equal(state.ledger,0);
 for(const alpha of [255,128,1,0]){const r=await execute(await board(alpha));assert.equal(r.status,502);assert.equal(r.body.code,'CUTOUT_OUTPUT_INVALID');}
 const stray=await sharp(await board(255)).ensureAlpha().raw().toBuffer();stray[3]=0;
 const strayResult=await execute(await sharp(stray,{raw:{width:32,height:32,channels:4}}).png().toBuffer());assert.equal(strayResult.status,502);assert.equal(state.artworks.length,0,'one clear pixel is not removed background');
 const valid=await sharp({create:{width:32,height:32,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:16,height:16,channels:4,background:{r:28,g:55,b:90,alpha:254/255}}}).png().toBuffer(),left:8,top:8}]).png().toBuffer();
 const ok=await execute(valid);assert.equal(ok.status,200);assert.equal(state.artworks.length,1);assert.equal(state.checkpoints.length,1);assert.equal(state.ledger,1);assert.equal(state.artworks[0].image,'data:image/png;base64,'+valid.toString('base64'));assert.equal(state.artworks[0].parentId,'original');
 for(const count of [16,17]){const data=Buffer.alloc(128*128*4,255);for(let i=0;i<count;i++)data[i*4+3]=0;const result=await execute(await sharp(data,{raw:{width:128,height:128,channels:4}}).png().toBuffer());assert.equal(result.status,count===16?502:200,'0.1% cleared area boundary');}
 const tiny=Buffer.from([0,0,0,0,30,60,90,254,30,60,90,254,30,60,90,254]);assert.equal((await execute(await sharp(tiny,{raw:{width:2,height:2,channels:4}}).png().toBuffer())).status,200,'tiny real transparent image');
 assert.equal((await execute(await sharp({create:{width:1,height:1,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer())).status,502,'empty one-pixel image');
 if(process.env.CUTOUT_HISTORICAL_SAMPLE){const bytes=fs.readFileSync(process.env.CUTOUT_HISTORICAL_SAMPLE);assert.equal((await execute(bytes)).status,200);assert.equal(state.artworks.at(-1).image,'data:image/png;base64,'+bytes.toString('base64'));}
 const out=process.env.CUTOUT_EVIDENCE;if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'valid-transparent.png'),valid);fs.writeFileSync(path.join(out,'invalid-checkerboard.png'),almostOpaque);}
 console.log('CUTOUT_TRANSPARENCY=PASS pseudo_alpha=REJECTED opaque_checker=REJECTED stray_alpha=REJECTED area_boundary=PASS tiny=PASS empty=REJECTED valid_png=BYTE_IDENTICAL no_invalid_artwork=true no_automatic_retry=true external_calls=0');
})().catch(e=>{console.error(e);process.exitCode=1});
