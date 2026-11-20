import assert from 'node:assert/strict';
import sharp from 'sharp';
async function main() {
 const {makeMediaVariants}=await import('../src/lib/media-variants');
 assert.equal(typeof makeMediaVariants,'function','bounded persisted variants needed');
 const png=await sharp({create:{width:2400,height:1200,channels:4,background:'#28a'}}).png().toBuffer();
 const variants=await makeMediaVariants(png);
 assert.equal(variants.width,2400);assert.equal(variants.height,1200);
 const small=await sharp(variants.thumbnail).metadata(),large=await sharp(variants.preview).metadata();
 assert.equal(small.width,512);assert.equal(small.height,256);assert.equal(small.format,'webp');
 assert.equal(large.width,1600);assert.equal(large.height,800);
 // Transparent image nodes must reveal the same canvas at every quality band.
 // Assert actual encoded alpha, not just the source file's format or metadata.
 const transparent=await sharp({create:{width:2400,height:1200,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
  .composite([{input:await sharp({create:{width:800,height:800,channels:4,background:'#137b54'}}).png().toBuffer(),left:800,top:200}]).png().toBuffer();
 const original=Buffer.from(transparent),transparentVariants=await makeMediaVariants(transparent);
 for(const bytes of [transparentVariants.thumbnail,transparentVariants.preview]){
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(data[3],0,'transparent corner must not become a white matte');
  assert.ok(data[(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4+3]>0,'visible subject retained');
 }
 assert.deepEqual(transparent,original,'variant generation must not modify the original PNG');
 await assert.rejects(()=>makeMediaVariants(Buffer.from('not a photo')));
 console.log('PASS bounded thumbnail, preview, original dimensions and invalid image');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
