import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createVideoFixture} from './video-fusion/harness';
import type {MediaJobOutput} from '../src/lib/video/media-job-schema';

async function main(){
  const h=await createVideoFixture({startWorker:false});
  const process=async(outputs:string[],args:string[],inputs=[h.refs.video.id])=>{
    const created=await h.request<{jobId:string}>('a','POST','/api/video/media-jobs',{operationId:randomUUID(),action:'ffmpeg',inputs,outputs,args});assert.equal(created.status,202,JSON.stringify(created.body));
    const deadline=Date.now()+60000;
    while(Date.now()<deadline){const r=await h.request<{job:{status:string;outputs:MediaJobOutput[]}}>('a','GET',`/api/video/media-jobs/${created.body.jobId}`);assert.equal(r.status,200);assert.ok(!['failed','cancelled'].includes(r.body.job.status));if(r.body.job.status==='completed')return r.body.job.outputs;await new Promise(resolve=>setTimeout(resolve,100));}
    throw new Error('Native format processing timed out');
  };
  try{
    const mkv=(await process(['native.mkv'],['-i','asset:0','-c','copy','output:0']))[0];assert.equal(mkv.mimeType,'video/x-matroska');assert.equal(mkv.probe?.videoCodec,'h264');
    const reused=(await process(['reused.mp4'],['-i','asset:0','-c','copy','output:0'],[mkv.artworkId]))[0];assert.equal(reused.probe?.width,1280);assert.equal(reused.mimeType,'video/mp4');
    const audio=(await process(['audio.mp4'],['-i','asset:0','-vn','-c:a','copy','output:0']))[0];assert.equal(audio.mimeType,'audio/mp4');assert.equal(audio.probe?.videoCodec,null);assert.deepEqual(audio.probe?.audioCodecs,['aac']);
    const bmp=(await process(['frame.bmp'],['-i','asset:0','-frames:v','1','output:0']))[0];assert.equal(bmp.mimeType,'image/bmp');assert.equal(bmp.probe?.videoCodec,'bmp');
    for(const output of [mkv,reused,audio,bmp]){const response=await h.request<ArrayBuffer>('a','GET',output.url);assert.equal(response.status,200);assert.equal(createHash('sha256').update(Buffer.from(response.body)).digest('hex'),output.sha256);assert.equal((await h.request('b','GET',output.url)).status,404);}
    console.log('VIDEO_NATIVE_FORMATS=PASS matroska_reuse=true audio_only_mp4=true bitmap=true actual_streams=true');
  }finally{await h.stop();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
