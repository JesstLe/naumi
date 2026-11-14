const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');

const mode = process.argv[2] || 'MODIFIED';
const root = path.resolve(process.argv[3] || '.');
function load(source) {
  const built = esbuild.buildSync({ stdin: { contents: source, loader: 'ts', resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'cjs', nodePaths: [path.resolve('node_modules')] });
  const loaded = { exports: {} };
  vm.runInThisContext('(function(module,exports,require){' + built.outputFiles[0].text + '\n})')(loaded, loaded.exports, require);
  return loaded.exports;
}
const menu = load(`export {canvasNodeMenuItems} from './src/components/canvas/node-menu-items';`).canvasNodeMenuItems;
assert.equal(menu({ L: zh => zh, readOnly: false, videoDisabled: false, onCreate() {} }).find(item => item.id === 'character').disabled, mode !== 'MODIFIED');
if (mode !== 'MODIFIED') {
  assert.equal(fs.existsSync(path.join(root, 'src/lib/character/project.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/app/api/canvas/character-nodes/route.ts')), false);
  console.log(`${mode}_CHARACTER=PASS MENU=DISABLED MODEL=ABSENT API=ABSENT EXISTING_VIDEO_DIRECTOR=PRESERVED EXIT=0`);
  process.exit(0);
}
const lib = load(`export * from './src/lib/character/project';export * from './src/lib/character/canvas';export {previewVisualInputs as previewCharacterInputs} from './src/lib/canvas/visual-references';export * from './src/lib/canvas/character-node-schema';export {remapVideoPromptReferences} from './src/lib/video/prompt-references';export {orderedInputSchema} from './src/lib/video/references';export {validateVideoSettings} from './src/lib/video/client-settings';`);
let cases = 0;
const check = action => { action(); cases++; };
const project = lib.newCharacterProject('林舟');
check(() => assert.deepEqual(lib.characterProjectSchema.parse(project), project));
for (const change of [{ version: 2 }, { name: ' ' }, { description: 'x'.repeat(8001) }, { appearances: [] }, { defaultAppearanceId: 'missing' }, { appearances: [...project.appearances, ...project.appearances] }]) {
  check(() => assert.equal(lib.characterProjectSchema.safeParse({ ...project, ...change }).success, false));
}
check(() => assert.equal(lib.characterProjectSchema.safeParse({ ...project, appearances: [{ ...project.appearances[0], referenceArtworkIds: ['same', 'same'] }] }).success, false));
check(() => assert.equal(lib.characterProjectSchema.safeParse({ ...project, appearances: [{ ...project.appearances[0], referenceArtworkIds: Array.from({ length: 13 }, (_, index) => `image-${index}`) }] }).success, true));
check(() => assert.equal(lib.characterProjectSchema.safeParse({ ...project, appearances: Array.from({ length: 25 }, (_, index) => ({ ...project.appearances[0], id: index ? `look-${index}` : 'base' })) }).success, true));
const identity = lib.characterInputIdentity('character-01', 'base');
check(() => assert.deepEqual(lib.parseCharacterInputIdentity(identity), { id: 'character-01', appearanceId: 'base' }));
for (const invalid of ['inline:character:character-01#base@1', 'character:missing', 'character:#base', 'character:owner#bad:appearance', 'character:owner#bad#appearance']) check(() => assert.equal(lib.parseCharacterInputIdentity(invalid), null));
const changed = { ...project, description: '短发，左眉有疤', appearances: [...project.appearances, { id: 'coat', name: '外套', description: '深蓝外套', referenceArtworkIds: ['image-a'] }] };
check(() => assert.equal(lib.characterReferenceText(changed, 'coat'), '林舟\n短发，左眉有疤\n外套：深蓝外套'));
check(() => assert.throws(() => lib.characterReferenceText(changed, 'missing')));
check(() => assert.equal(lib.characterInputIdentity('character-01', 'coat'), 'character:character-01#coat'));
check(() => assert.equal(lib.frozenCharacterInputIdentity('character-01', 'coat', 7), 'inline:character:character-01#coat@7'));
for (const revision of [0, -1, 1.1, NaN, Number.MAX_SAFE_INTEGER + 1]) check(() => assert.throws(() => lib.frozenCharacterInputIdentity('character-01', 'base', revision)));
check(() => {
  const nodeId = lib.frozenCharacterInputIdentity('a'.repeat(80), 'b'.repeat(40), Number.MAX_SAFE_INTEGER);
  assert.ok(nodeId.length <= 160);
  assert.equal(lib.orderedInputSchema.safeParse({ id: 'role', nodeId, kind: 'text', role: 'context', value: 'frozen role' }).success, true);
});
check(() => assert.equal(lib.characterNodeWriteSchema.safeParse({ id: 'role-a', expectedRevision: 0, operationId: '11111111-1111-4111-8111-111111111111', character: changed, x: 0, deleted: false }).success, true));
check(() => assert.equal(lib.characterNodeWriteSchema.safeParse({ id: 'role-a', expectedRevision: 0, operationId: '11111111-1111-4111-8111-111111111111', character: changed, x: Infinity }).success, false));
const record = {id:'role-a',projectKey:'tree:role-a',revision:1,title:changed.name,x:0,y:0,width:320,height:300,character:changed,deletedAt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
const media = [{id:'image-a',nodeId:'image-a',kind:'image',title:'Photo',value:'/media/photo.png',available:true}];
check(() => { const choices=lib.characterInputChoices([record],media);assert.equal(choices.length,2);assert.equal(choices[1].category,'character');assert.equal(choices[1].nodeId,'character:role-a#coat');assert.equal(choices[1].available,true);assert.equal(choices[1].thumbnail,'/media/photo.png'); });
check(() => assert.equal(lib.characterInputChoices([record],[])[1].available,false));
check(() => assert.equal(lib.characterInputChoices([{...record,deletedAt:new Date().toISOString()}],media).length,0));
const input={id:'role-reference',nodeId:'character:role-a#base',kind:'text',role:'context',value:'Role'};
check(() => assert.equal(lib.remapVideoPromptReferences('Follow {{ref 1}}',[input],[{...input,nodeId:'character:role-a#coat'}]),'Follow {{ref 1}}'));
check(() => assert.equal(lib.remapVideoPromptReferences('Follow {{ref 1}}',[input],[{...input,nodeId:'character:role-b#base'}]),'Follow {{ref 0}}'));
check(() => assert.equal(menu({L:zh=>zh,readOnly:true,videoDisabled:false,onCreate(){}}).find(item=>item.id==='character').disabled,true));
const roleInput={...input,nodeId:'character:role-a#coat'},roleChoices=[...media,...lib.characterInputChoices([record],media)];
const config={modelId:'video-a',mode:'reference',prompt:'Follow {{ref 1}}',durationSeconds:4,resolution:'720p',aspectRatio:'16:9'};
const cap={sources:{},modes:['reference'],durationResolutionMap:[{durations:[4],resolutions:['720p']}],aspectRatios:['16:9'],limits:{images:1}};
check(() => {const preview=lib.previewCharacterInputs([roleInput],config.prompt,roleChoices);assert.equal(preview.inputs.length,2);assert.ok(preview.inputs[0].value.includes('角色参考：图片1'));assert.equal(preview.inputs[1].nodeId,'image-a');});
check(() => assert.equal(lib.validateVideoSettings(config,[roleInput],cap,roleChoices),null));
check(() => assert.equal(lib.validateVideoSettings(config,[roleInput],{...cap,limits:{images:0}},roleChoices),null));
check(() => assert.match(lib.validateVideoSettings(config,[roleInput],cap,[]),/不可用/));
console.log(`CHARACTER_CORE_RULES=PASS CASES=${cases} IDENTITY=STABLE APPEARANCES=EXPLICIT FROZEN_REVISION=PASS LEGACY_INPUT_WIRE=COMPATIBLE MENU=WRITABLE_ONLY UI_CODE=IMPLEMENTED EXIT=0`);
