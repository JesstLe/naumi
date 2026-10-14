import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const run=process.argv.find(value=>value.startsWith('--run='))?.slice(6);
assert.match(run||'',/^derived-media-[a-f0-9-]{36}$/);
const root=path.resolve('output/canvas-video-fusion-20261013/checkpoint-d'),folder=path.join(root,run);
const raw=await readFile(path.join(folder,'result.json')),result=JSON.parse(raw),nativeRaw=await readFile(path.join(folder,'native-creates.json')),native=JSON.parse(nativeRaw);
assert.equal(result.ok,true);assert.equal(result.actualAppDbRouterMediaAndVideoWorkers,true);assert.equal(result.paidVideoApiCalls,0);
for(const key of ['generatedCanvasSource','firstCurrentLastFramesDistinct','allDerivedSourceParentsProjectAndProvenance','independentFrameTrimAudioAndSplitProbes','invalidTimeAndSilentAudioRejectWithoutWritesOrFees','derivedFrameTrimAudioReferencedInNewCompletedVideo','frozenDerivedIdentitiesAndHashes','restartAndReplayNoExtraTasksFeesOrCreates','originalNodeAndMediaPreserved'])assert.equal(result[key],true);
assert.equal(result.videoTasks.length,2);assert.equal(result.mediaJobs.length,6);assert.equal(result.artifacts.length,7);assert.equal(native.length,2);
const frames=result.artifacts.filter(row=>row.action==='frame');assert.deepEqual(frames.map(row=>row.timestamp),['first',1.25,'last']);assert.equal(new Set(frames.map(row=>row.sha256)).size,3);
const trim=result.artifacts.find(row=>row.action==='trim'),audio=result.artifacts.find(row=>row.action==='extract_audio'),split=result.artifacts.filter(row=>row.action==='separate');
assert.equal(split.length,2);assert.ok(split.some(row=>row.probe.streams.length===1&&row.probe.streams[0].codec_type==='video'));assert.ok(split.some(row=>row.probe.streams.length===1&&row.probe.streams[0].codec_type==='audio'));
assert.equal(audio.probe.streams.length,1);assert.equal(audio.probe.streams[0].codec_type,'audio');assert.ok(Number(audio.probe.format.duration)>3.9);assert.ok(Math.abs(Number(trim.probe.format.duration)-2)<0.12);
assert.equal(new Set(result.artifacts.map(row=>row.parentId)).size,1);assert.equal(new Set(result.artifacts.map(row=>row.groupId)).size,1);
const names=row=>row.action==='frame'?['frame.png']:row.action==='trim'?['video.mp4']:row.action==='extract_audio'?['audio.wav']:row.probe.streams[0].codec_type==='video'?['silent.mp4']:['audio.wav'];
for(const row of result.artifacts){assert.match(row.artworkId,/^media-art-[a-f0-9-]{36}-\d+$/);const data=await readFile(path.join(folder,`${row.artworkId}-${names(row)[0]}`));assert.equal(createHash('sha256').update(data).digest('hex'),row.sha256);if(row.action==='frame'){assert.equal(row.probe.streams[0].codec_name,'png');assert.equal(row.probe.streams[0].width,1280);assert.equal(row.probe.streams[0].height,720);}}
assert.deepEqual(native[0].body.content.map(row=>row.type),['text']);const content=native[1].body.content;assert.deepEqual(content.map(row=>row.type),['text','image_url','video_url','audio_url']);assert.ok(content[0].text.includes('保留完整末句。'));
for(const [index,row] of [frames[1],trim,audio].entries()){const item=content[index+1],job=row.artworkId.slice(10,-2);assert.equal(item.role,['reference_image','reference_video','reference_audio'][index]);const pathname=new URL(item[item.type].url).pathname;assert.ok(pathname.includes(`/videos/processed/${job}/`));assert.ok(pathname.endsWith(`/${names(row)[0]}`));}
await writeFile(path.join(root,'derived-media-audit.json'),JSON.stringify({schemaVersion:1,ok:true,run,resultSha256:createHash('sha256').update(raw).digest('hex'),nativeSha256:createHash('sha256').update(nativeRaw).digest('hex'),actualAppDbRouterMediaAndVideoWorkers:true,firstCurrentLastTimeBoundariesAndSourceLinks:true,exactTrimAndIndependentAudioSplit:true,nativeDownstreamUsesActualDerivedImageVideoAudio:true,originalByteHashesAndOwnershipReviewed:true,restartReplayAndFrozenDerivedIdentitiesReviewed:true,realVideoQualityValidated:false,paidVideoApiCalls:0,wholeGoalAccepted:false},null,2));
process.stdout.write('VIDEO_DERIVED_MEDIA_AUDIT=PASS frames=3 jobs=6 artifacts=7 video_tasks=2 native_creates=2\n');
