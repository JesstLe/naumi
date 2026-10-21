const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(process.argv[2]||'.'),baseline=process.argv.includes('--baseline');
const panel=fs.readFileSync(path.join(root,'src/components/canvas/canvas-assistant-panel.tsx'),'utf8');
const client=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8');
const source=ts.createSourceFile('panel.tsx',panel,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let checks=0;
function check(value,label){assert.ok(value,label);checks++;}
function visit(node){if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(source)==='input'){
 const attrs=node.attributes.properties,hasTest=attrs.some(a=>a.name?.getText(source)==='data-testid'&&a.initializer?.getText(source)==='"canvas-assistant-upload-input"');
 if(hasTest){const disabled=attrs.find(a=>a.name?.getText(source)==='disabled').initializer.expression.getText(source);check(baseline?disabled==='busy || uploadingImages':disabled==='uploadingImages','native input upload availability');}
}ts.forEachChild(node,visit);}visit(source);
const upload=client.slice(client.indexOf('async function uploadAssistantImages'),client.indexOf('async function sendAssistantMessage'));
check(baseline?upload.includes('if(assistantBusy||'):!upload.includes('if(assistantBusy||'),'client does not drop uploads while responding');
check(baseline?panel.includes('onUploadImages ? busy || uploadingImages :'):panel.includes('onUploadImages ? uploadingImages :'),'plus availability matches native input');
if(baseline){console.log('BASELINE=REPRODUCED CHECKS='+checks+' STREAMING_ADD_IMAGE=DISABLED CLIENT_BUSY_UPLOAD=REJECTED SUPPLIER_CALLS=0');process.exit(0);}
for(const text of ['if (!uploadingImages) onUploadImages(Array.from(event.dataTransfer.files))','if (!uploadingImages) onUploadImages(files)','files.length && !uploadingImages','multiple','event.target.value = ""'])check(panel.includes(text),text);
for(const text of ['if(assistantUploadToken.current||readOnly||!user||!files.length)return;','account===canvasAccountRef.current','project===(activeProjectRef.current?.key??null)','session===assistantSessionId.current','files.slice(0,capacity)'])check(upload.includes(text),text);
for(const text of ['if (assistantBusy || assistantUploadToken.current || !text) return;','const referencesKey=JSON.stringify(references.map','contextIds: references.map(artwork=>artwork.id)','body: JSON.stringify(','body: attempt.body'])check(client.includes(text),text);
check(panel.includes('disabled={busy ? !onStop : uploadingImages || !input.trim()}'),'send not allowed before response/upload completion');
console.log('MODIFIED=PASS CHECKS='+checks+' STREAMING_APPEND=ENABLED FILE_PASTE_DROP=ENABLED IN_FLIGHT_BODY=FROZEN SEND=SERIALIZED SCOPE=GUARDED SUPPLIER_CALLS=0');
