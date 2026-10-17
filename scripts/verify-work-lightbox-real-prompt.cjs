// Execute the actual TSX component with isolated hooks/side effects; no DB or suppliers.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const ts = require('typescript');
const input = process.argv[2] || 'src/components/works/work-lightbox.tsx';
const mode = process.argv[3] || 'modified';
const source = fs.readFileSync(input, 'utf8');
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.React, target:ts.ScriptTarget.ES2020}}).outputText;
let locale = 'zh', pushed = '', closed = 0;
const React = {createElement:(type, props, ...children)=>({type, props:props||{}, children}), useState:()=>[true,()=>{}], useEffect:()=>{}};
const req = id => {
  if(id === 'react') return React;
  if(id === 'react-dom') return {createPortal:v=>v};
  if(id.endsWith('/desktop/navigation')) return {useWorkspaceRouter:()=>({push:url=>{pushed=url;}})};
  if(id.endsWith('/locale-context')) return {useI18n:()=>({locale})};
  if(id.endsWith('/cdn')) return {cdnUrl:v=>v};
  if(id.endsWith('/utils')) return {cn:(...args)=>args.filter(Boolean).join(' ')};
  if(id.endsWith('/download')) return {downloadImage:()=>{}};
  if(id.endsWith('/media')) return {Media:()=>null};
  if(id === 'lucide-react') return Object.fromEntries(['X','Download','Heart','RotateCcw','Trash2'].map(k=>[k,()=>null]));
  throw new Error('Unexpected import: '+id);
};
const moduleObject = {exports:{}};
vm.runInNewContext(js, {require:req,module:moduleObject,exports:moduleObject.exports,URLSearchParams,document:{body:{}}}, {filename:input});
const flat = n => n == null || n === false ? [] : Array.isArray(n) ? n.flatMap(flat) : typeof n !== 'object' ? [String(n)] : flat(n.children);
const nodes = n => n && typeof n === 'object' ? (Array.isArray(n) ? n.flatMap(nodes) : [n,...nodes(n.children)]) : [];
let checks=0;
for(locale of ['zh','en']) {
  for(const prompt of [undefined,'','  \n\t','保留主体，淡蓝背景','  Keep the subject\nwith soft lighting.  ']) {
    const work={id:'fixture',image:'/fixture.png',prompt};
    const tree=moduleObject.exports.WorkLightbox({work,onClose:()=>{closed++;}});
    const text=flat(tree), label=locale==='zh'?'提示词':'Prompt';
    const hasReal=!!prompt?.trim();
    if(mode === 'baseline') {
      assert.equal(text.includes(label), true);
      if(!prompt) assert(text.some(t=>t.includes(locale==='zh'?'白底高级护肤精华瓶':'Premium skincare serum bottle')));
    } else {
      assert.equal(text.includes(label), hasReal, `Prompt section: ${locale} ${JSON.stringify(prompt)}`);
      assert(!text.some(t=>t.includes('白底高级护肤精华瓶')||t.includes('Premium skincare serum bottle')));
    }
    if(hasReal) assert(text.includes(prompt), 'Keep real prompt verbatim');
    const redo=nodes(tree).find(n=>n.type==='button'&&flat(n).includes(locale==='zh'?'重做':'Redo'));
    pushed='';redo.props.onClick();
    const q=new URL('http://fixture'+pushed).searchParams;
    assert.equal(q.get('src'),work.image);
    assert.equal(q.get('prompt'),prompt||null);
    checks++;
  }
}
assert.equal(closed,10);
assert.equal(moduleObject.exports.WorkLightbox({work:null,onClose:()=>{}}),null);
const route=fs.readFileSync(path.join(__dirname,'../src/app/api/artworks/add/route.ts'),'utf8');
assert(/prompt:\s*""/.test(route));
console.log(mode==='baseline'?'BASELINE=REPRODUCED DEMO_FALLBACK=VISIBLE EMPTY_SECTION=VISIBLE':'MODIFIED=PASS DEMO_FALLBACK=ABSENT EMPTY_SECTION=HIDDEN');
console.log('CASES=10 LOCALES=zh,en REAL_PROMPT=VERBATIM REDO=REAL_SOURCE NULL_WORK=PASS UPLOAD_PROMPT=EMPTY SUPPLIER_CALLS=0');
