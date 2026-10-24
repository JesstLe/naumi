// No network, provider calls or production state. Run once per completed module.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const mode = process.argv[2] || 'modified', root = path.resolve(process.argv[3] || '.'), baseline = path.resolve(process.argv[4] || 'output/canvas-unified-dock-20261019/baseline');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const parse = text => ts.createSourceFile('source.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const clientPath = 'src/components/canvas/canvas-client.tsx', dialogPath = 'src/components/canvas/video/settings-dialog.tsx';
const client = read(clientPath), dialog = read(dialogPath);
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
function namedFunctions(text) { const file = parse(text), map = new Map(); function visit(n) { if (ts.isFunctionDeclaration(n) && n.name) map.set(n.name.text, n.getText(file).replace(/\r\n/g, '\n')); ts.forEachChild(n, visit); } visit(file); return map; }
const shells = (client.match(/<CanvasComposerShell\s/g) || []).length;
if (mode === 'baseline') {
  check(shells === 0, 'original separate wrappers');
  check(client.includes('presentation={videoEditId===selectedVideo.id?"dialog":"dock"}'), 'video edit selects large modal');
  check(client.includes('setVideoEditId(id)'), 'new/edit video opens modal');
  check(dialog.includes('if(dock)return <div'), 'video has separate styling');
  console.log(`BASELINE=CONFIRMED CHECKS=${checks} SHARED_SHELLS=0 VIDEO_EDIT=MODAL SUPPLIER_CALLS=0`);
  process.exit(0);
}
const extracted=client.includes('<CanvasImageComposer');
const image=extracted?read('src/components/canvas/image-composer.tsx'):'', text=extracted?read('src/components/canvas/text-composer.tsx'):'';
check(extracted ? (client.match(/<CanvasImageComposer\s/g)||[]).length===2 && (client.match(/<CanvasTextComposer\s/g)||[]).length===1 && [image,text].every(source=>source.includes('<CanvasComposerShell')) : shells===3, 'existing image, pending image, text all share shell');
check(extracted ? [image,text].every(source=>source.includes('<CanvasComposerFooter')) : (client.match(/<CanvasComposerFooter\s/g)||[]).length===3, 'shared footers');
check(dialog.includes('if(dock)return <CanvasComposerShell'), 'video shares shell');
check(client.includes('presentation="dock"') && !client.includes('videoEditId'), 'all normal canvas video entries use compact presentation');
check(!client.includes('↑</span>') && !client.includes('◆ {selectedTextRefs.length}'), 'no character-based icons in changed dock');
check(client.includes('const imageDraft = useImageNodeDraft('), 'upstream image draft isolation retained');
const shell = read('src/components/canvas/composer-shell.tsx'), css = read('src/components/canvas/composer-shell.module.css');
for (const token of ['forwardRef<HTMLDivElement, Props>', 'data-composer-kind={kind}', 'onDismiss', 'onToggleExpand', 'aria-expanded={expanded}', 'CanvasActionPanel', 'data-composer-controls', 'data-composer-actions']) check(shell.includes(token), token);
for (const token of ['container-type: inline-size', 'flex-wrap: wrap', 'min-width: 0', '#fff', '.actions > button:last-child', '[data-composer-body]']) check(css.includes(token), token);
const compact = read('src/components/canvas/video/compact-composer.tsx'), fields = read('src/components/canvas/video/settings-fields.tsx'), settings = read('src/components/canvas/video/settings-panel.tsx');
for (const token of ['<CanvasComposerFooter', 'numbered.length>0', 'label={V(\'视频生成模式\')}', 'label={V(\'视频时长\')}', 'advancedOpen&&<CanvasActionPanel', 'videoModeRoles', 'videoDurations(cap, config.mode)', 'onCloseAdvanced']) check(compact.includes(token), token);
check(fields.includes('advancedOnly={hideComposerFields}'), 'advanced keeps audio and uncommon capabilities');
check(settings.includes('!advancedOnly&&<>') && settings.includes('生成声音') && settings.includes('supportsNegativePrompt'), 'basic duplicate controls hidden, advanced capabilities remain');
for (const token of ['localComposerDrafts', 'JSON.stringify([draftScope,node.id])', 'localComposerDrafts.size > 64', 'incoming===baseline.current||incoming===local', "['needs_attention','creation_unknown']", 'submitting.current', 'estimate.quote']) check(dialog.includes(token), token);
const oldClient = fs.readFileSync(path.join(baseline,clientPath),'utf8'), oldDialog = fs.readFileSync(path.join(baseline,dialogPath),'utf8');
const before = namedFunctions(oldClient), after = namedFunctions(client);
let preserved = 0;
for (const [name, body] of before) {
  if (['CanvasClient','openVideoNodeFromSelection','openVideoEditor'].includes(name)) continue;
  if (after.has(name)) { assert.equal(after.get(name),body,'function changed: '+name); preserved++; }
}
check(preserved > 100, 'large-module function comparison');
assert.equal(namedFunctions(dialog).get('submit'),namedFunctions(oldDialog).get('submit'), 'save/generate/quote gate unchanged'); checks++;
console.log(`MODIFIED=PASS CHECKS=${checks} PRESERVED_FUNCTIONS=${preserved} COMMON_SHELLS=4 COMMON_FOOTERS=4 VIDEO_DEFAULT=DOCK ADVANCED=PORTAL SUPPLIER_CALLS=0`);
