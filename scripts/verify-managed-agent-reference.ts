import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
async function main(){
 process.env.STORAGE_DRIVER='local';process.env.MEDIA_PRIVATE='0';
 process.env.MEDIA_DIR=await mkdtemp(path.join(tmpdir(),'agent-reference-'));
 const png=await sharp({create:{width:20,height:12,channels:3,background:'blue'}}).png().toBuffer();
 await writeFile(path.join(process.env.MEDIA_DIR,'fixture.png'),png);
 const {managedAgentReference}=await import('../src/lib/agent/managed-reference');
 const image=await managedAgentReference('http://site.test/media/fixture.png',['http://site.test'],'owner@test');
 assert.equal(image?.contentType,'image/png');assert.deepEqual(image?.bytes,png);
 assert.equal(await managedAgentReference('https://foreign.test/media/fixture.png',['http://site.test'],'owner@test'),null);
 await assert.rejects(()=>managedAgentReference('http://user:pass@site.test/media/fixture.png',['http://site.test'],'owner@test'));
 console.log('PASS same-origin managed Agent reference, decoded MIME and foreign-origin rejection');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
