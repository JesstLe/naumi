import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readWorkflowClipboard, gaodingAssetUrl } from '../src/lib/canvas/workflow-clipboard';
import { inertSvg, pathSvg } from '../src/lib/canvas/workflow-vector';
import { gaodingFixture, clipboardHtml } from './fixtures/gaoding-clipboard';

const raw=gaodingFixture(), html=clipboardHtml(raw), parsed=readWorkflowClipboard(html)!;
assert.equal(parsed.nodes.length,6);assert.equal(parsed.groups.length,2);assert.equal(parsed.edges.length,4);assert.equal(parsed.missingReferences,0);
assert.equal(parsed.nodes.find(n=>n.sourceId==='text-b')!.height,7812.5);
assert.equal(parsed.nodes.find(n=>n.sourceId==='text-b')!.x,750);
assert.equal(parsed.nodes.find(n=>n.sourceId==='text-b')!.prompt,'保留商品主体');
assert.equal(parsed.nodes.find(n=>n.sourceId==='text-b')!.parameters.isNetwork,false);
assert.equal('privateKey' in parsed.nodes[0].parameters,false);
assert.equal(readWorkflowClipboard('<span>普通复制</span>'),null);
for(const url of ['http://st0.dancf.com/a.png','https://dancf.com.evil.test/a.png','https://localhost/a.png','https://a:secret@st0.dancf.com/a.png','https://st0.dancf.com:8443/a.png'])assert.throws(()=>gaodingAssetUrl(url));
assert.equal(gaodingAssetUrl('https://st0.dancf.com/a.png#x'),'https://st0.dancf.com/a.png');
assert.throws(()=>readWorkflowClipboard('<span data-app="editor-next" data-clipboard="abc"></span>'));
assert.throws(()=>readWorkflowClipboard('<span data-app="editor-next"></span>'+' '.repeat(8*1024*1024)));
const duplicate=gaodingFixture();duplicate.elements.push(duplicate.elements[0]);assert.throws(()=>readWorkflowClipboard(clipboardHtml(duplicate)),/重复/);
const cycle=JSON.parse(JSON.stringify(gaodingFixture()));cycle.elements[0].elements[0].metaInfo.workflow.previous=['image-b'];assert.throws(()=>readWorkflowClipboard(clipboardHtml(cycle)),/循环/);
const missing=JSON.parse(JSON.stringify(gaodingFixture()));missing.elements[0].elements[0].metaInfo.workflow.previous=['not-selected'];assert.equal(readWorkflowClipboard(clipboardHtml(missing))!.missingReferences,1);
for(const svg of ['<svg><script>alert(1)</script></svg>','<svg><image href="https://evil.test/a"/></svg>','<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg></svg>','<svg><path onload="alert(1)"/></svg>','<svg><path fill="url(https://evil.test)"/></svg>','<svg><path style="fill:expression(x)"/></svg>'])assert.throws(()=>inertSvg(svg));
assert.throws(()=>inertSvg('<svg><defs><filter id="f"><feImage href="https://evil.test/a"/></filter></defs></svg>'));
assert.throws(()=>inertSvg('<svg><defs><filter id="f"><feGaussianBlur stdDeviation="1000"/></filter></defs></svg>'));
assert.ok(inertSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1" fill="#ffffff"/></svg>'));
assert.throws(()=>pathSvg('" onload="alert(1)',20,20,'#fff','#000',0));
console.log('PARSER=PASS NESTED_GROUPS=2 MIXED_LINKS=4 LONG_TEXT=7812.5PX SOURCE_PARAMETERS=INERT SIZE_DEPTH_DUPLICATE_CYCLE=GUARDED SVG_EXTERNAL_CODE=REJECTED');
if(process.env.WORKFLOW_REAL_SAMPLE){
 const data=readWorkflowClipboard(fs.readFileSync(process.env.WORKFLOW_REAL_SAMPLE,'utf8'))!;
 const types=Object.fromEntries(['text','image','svg','path'].map(type=>[type,data.nodes.filter(n=>n.kind===type).length]));
 assert.deepEqual(types,{text:16,image:11,svg:3,path:3});assert.equal(data.groups.length,5);assert.equal(data.edges.length,19);assert.equal(data.missingReferences,0);
 console.log('REAL_SAMPLE=PASS TEXT=16 IMAGES=11 GROUPS=5 DECORATIONS=6 LINKS=19 MISSING_REFERENCES=0');
}
