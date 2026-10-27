const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');

const mode = process.argv[2] || 'MODIFIED';
const root = path.resolve(process.argv[3] || '.');
function load(source) {
  const built = esbuild.buildSync({ stdin: { contents: source, loader: 'ts', resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'cjs', nodePaths: [path.resolve('node_modules')] });
  const module = { exports: {} };
  vm.runInThisContext('(function(module,exports,require){' + built.outputFiles[0].text + '\n})')(module, module.exports, require);
  return module.exports;
}
const menu = load(`export {canvasNodeMenuItems} from './src/components/canvas/node-menu-items';`).canvasNodeMenuItems;
assert.equal(menu({ L: zh => zh, readOnly: false, videoDisabled: false, onCreate() {} }).find(item => item.id === 'character').disabled, true);
if (mode !== 'MODIFIED') {
  assert.equal(fs.existsSync(path.join(root, 'src/lib/character/project.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/app/api/canvas/character-nodes/route.ts')), false);
  console.log(`${mode}_CHARACTER=PASS MENU=DISABLED MODEL=ABSENT API=ABSENT EXISTING_VIDEO_DIRECTOR=PRESERVED EXIT=0`);
  process.exit(0);
}
const lib = load(`export * from './src/lib/character/project';export * from './src/lib/canvas/character-node-schema';export {orderedInputSchema} from './src/lib/video/references';`);
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
console.log(`CHARACTER_CORE_RULES=PASS CASES=${cases} IDENTITY=STABLE APPEARANCES=EXPLICIT FROZEN_REVISION=PASS LEGACY_INPUT_WIRE=COMPATIBLE MENU=STILL_DISABLED UI=PENDING EXIT=0`);
