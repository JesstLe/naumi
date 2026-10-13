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
 await assert.rejects(()=>makeMediaVariants(Buffer.from('not a photo')));
 console.log('PASS bounded thumbnail, preview, original dimensions and invalid image');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
