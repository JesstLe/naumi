const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),esbuild=require('esbuild');
const mode=process.argv[2]||'MODIFIED',root=path.resolve(process.argv[3]||'.'),modified=mode==='MODIFIED';
function load(source){const result=esbuild.buildSync({stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',nodePaths:[path.resolve('node_modules')]}),module={exports:{}};vm.runInThisContext('(function(module,exports,require){'+result.outputFiles[0].text+'\n})')(module,module.exports,require);return module.exports;}
const menu=load(`export {canvasNodeMenuItems} from './src/components/canvas/node-menu-items';`).canvasNodeMenuItems;
const items=menu({L:zh=>zh,readOnly:false,videoDisabled:false,onCreate:()=>{}});
assert.equal(items.find(item=>item.id==='stage-3d').disabled,!modified);
assert.equal(menu({L:zh=>zh,readOnly:true,videoDisabled:false,onCreate:()=>{}}).find(item=>item.id==='stage-3d').disabled,true);
assert.equal(items.find(item=>item.id==='character').disabled,!fs.existsSync(path.join(root,'src/lib/character/project.ts')));assert.equal(items.find(item=>item.id==='audio').disabled,!fs.existsSync(path.join(root,'src/lib/audio/project.ts')));
assert.ok(fs.existsSync(path.join(root,'src/lib/studio3d/project.ts')));
if(!modified){assert.equal(fs.existsSync(path.join(root,'src/lib/director/project.ts')),false);console.log(`${mode}_DIRECTOR=PASS MENU=DISABLED NATIVE_EDITOR=ABSENT PRODUCT_STUDIO=SEPARATE EXIT=0`);process.exit(0);}
const lib=load(`export * from './src/lib/director/project';export * from './src/lib/director/scene';export * from './src/lib/director/webm';export {disposeObject} from './src/lib/three/dispose';export * as THREE from 'three';`);
let cases=0;const check=fn=>{fn();cases++};
let project=lib.newDirectorProject();
check(()=>assert.deepEqual(lib.directorProjectSchema.parse(JSON.parse(JSON.stringify(project))),project));
for(const patch of [{version:2},{activeCameraId:'missing'},{duration:NaN},{entities:[...project.entities,...project.entities]},{cameras:[]}])check(()=>assert.equal(lib.directorProjectSchema.safeParse({...project,...patch}).success,false));
for(const kind of ['character','box','sphere','cylinder'])check(()=>{const entity=lib.newDirectorEntity('test-'+kind,kind,kind),object=lib.buildDirectorEntity(entity);lib.applyDirectorEntity(object,entity);object.updateMatrixWorld(true);const box=new lib.THREE.Box3().setFromObject(object);assert.ok(!box.isEmpty()&&Number.isFinite(box.max.y));const skin=object.getObjectByName('leftArm');if(skin){lib.applyDirectorEntity(object,{...entity,pose:lib.DIRECTOR_POSES.walk});assert.ok(Math.abs(skin.rotation.x-lib.THREE.MathUtils.degToRad(-28))<1e-9);}let disposed=0;object.traverse(item=>{if(item.isMesh)item.geometry.addEventListener('dispose',()=>disposed++)});lib.disposeObject(object);assert.ok(disposed>0);});
project.entities[0].position[0]=-2;project.entities[0].rotation[1]=170;project=lib.recordDirectorKeyframe(project,0,'frame-0');
project.entities[0].position[0]=2;project.entities[0].rotation[1]=-170;project.cameras[0].view.fov=60;project=lib.recordDirectorKeyframe(project,5,'frame-5');
const original=JSON.stringify(project),middle=lib.sampleDirectorProject(project,2.5);
check(()=>assert.equal(middle.entities[0].position[0],0));check(()=>assert.equal(middle.entities[0].rotation[1],180));check(()=>assert.equal(middle.cameras[0].view.fov,50));check(()=>assert.equal(JSON.stringify(project),original));
check(()=>assert.equal(lib.sampleDirectorProject(project,-1).entities[0].position[0],-2));check(()=>assert.equal(lib.sampleDirectorProject(project,99).entities[0].position[0],2));
check(()=>{const replaced=lib.recordDirectorKeyframe(project,5,'ignored');assert.equal(replaced.keyframes.length,2);assert.equal(replaced.keyframes[1].id,'frame-5');});
for(const keyframes of [[{...project.keyframes[0],cameraId:'missing'}],[{...project.keyframes[0],time:6}],[project.keyframes[0],{...project.keyframes[0],id:'other'}],[{...project.keyframes[0],entities:[{...project.keyframes[0].entities[0],id:'missing'}]}]])check(()=>assert.equal(lib.directorProjectSchema.safeParse({...project,keyframes}).success,false));
check(()=>{const independent={...project,activeCameraId:'camera-2',cameras:[...project.cameras,{id:'camera-2',name:'第二机位',view:{position:[0,4,5],target:[0,0,0],fov:30}}]};assert.equal(lib.sampleDirectorProject(independent,2).cameras[1].view.fov,30);});
check(()=>assert.equal(lib.directorCameraViewSchema.safeParse({position:[0,0,0],target:[0,0,0],fov:40}).success,false));
check(()=>assert.deepEqual(lib.directorOutputSize('16:9'),[1280,720]));check(()=>assert.deepEqual(lib.directorOutputSize('9:16'),[720,1280]));check(()=>assert.deepEqual(lib.directorOutputSize('1:1'),[1024,1024]));
assert.equal(lib.directorProjectSchema.safeParse(project).success,true);
async function webmChecks(){
 const head=[0x1a,0x45,0xdf,0xa3,0x80],segment=[0x18,0x53,0x80,0x67,0x01,0xff,0xff,0xff,0xff,0xff,0xff,0xff],info=[0x15,0x49,0xa9,0x66,0x87,0x2a,0xd7,0xb1,0x83,0x0f,0x42,0x40];
 const raw=new Blob([new Uint8Array([...head,...segment,...info])],{type:'video/webm'}),fixed=await lib.finalizeDirectorWebm(raw,2),bytes=new Uint8Array(await fixed.arrayBuffer());
 assert.equal(fixed.size,raw.size+11);assert.equal(new DataView(bytes.buffer).getFloat64(bytes.length-8),2000);cases++;
 const again=await lib.finalizeDirectorWebm(fixed,3),updated=new Uint8Array(await again.arrayBuffer());assert.equal(again.size,fixed.size);assert.equal(new DataView(updated.buffer).getFloat64(updated.length-8),3000);cases++;
 await assert.rejects(lib.finalizeDirectorWebm(raw,NaN));await assert.rejects(lib.finalizeDirectorWebm(new Blob(['invalid']),2));cases+=2;
}
webmChecks().then(()=>{console.log(`DIRECTOR_RULES=PASS CASES=${cases} SCHEMA=PASS JOINTS=PASS KEYFRAMES=IDENTITY_STABLE ANGLES=SHORTEST_PATH CAMERA_TRACKS=INDEPENDENT DISPOSAL=PASS WEBM_DURATION=FINALIZED MENU=WRITABLE_ONLY PRODUCT_STUDIO=PRESERVED EXIT=0`);}).catch(error=>{console.error(error);process.exitCode=1});
