// Actual Canvas JSX/bindings and components, full-source A/B. External context,
// media transport and price fetching use identical ports; browser checks run separately.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const baseline=process.argv.includes('--baseline'),root=path.resolve(process.env.COMPOSER_SOURCE_ROOT||'.'),out=path.resolve(process.env.COMPOSER_EVIDENCE||'output/refactor-r3e-20261024');fs.mkdirSync(out,{recursive:true});
const file='src/components/canvas/canvas-client.tsx',source=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,source,99,true,4),functions={},views={};
(function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)functions[n.name.text]=n.getText(ast);if(ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)){const opening=ts.isJsxElement(n)?n.openingElement:n,tag=opening.tagName.getText(ast),attrs=opening.attributes.properties.map(p=>p.getText(ast)).join(' ');if(baseline&&tag==='CanvasComposerShell'){for(const kind of ['image','pending','text'])if(attrs.includes(`data-testid="${kind}-node-dock"`))views[kind]=n.getText(ast);}if(!baseline&&tag==='CanvasImageComposer')views[attrs.includes('pdock-')?'pending':'image']=n.getText(ast);if(!baseline&&tag==='CanvasTextComposer')views.text=n.getText(ast);}ts.forEachChild(n,walk);})(ast);
const noop=()=>{},ref=()=>({current:null}),node={id:'text-a',title:'Text title',content:'Saved answer',prompt:'Saved prompt',sourceIds:['a'],status:'completed',projectKey:'tree:a',canvasX:0,canvasY:0,width:380,height:240,createdAt:'2026-10-24',updatedAt:'2026-10-24'},members=[{id:'a',title:'Picture A',image:'/fixture/a.png'},{id:'b',title:'Picture B',image:'/fixture/b.png'}];
const taskIdle={busy:false,phase:'idle',error:'',hasResult:false};
function context(){return {locale:'zh',t:k=>k,L:(zh,en)=>zh,selected:{...members[0],marked:false},selectedPend:{id:'pend-a',generationFailure:undefined},selectedText:structuredClone(node),active:{members},lightCanvas:true,readOnly:false,
 panelRef:ref(),dockStyle:{left:15,top:180,width:820,maxHeight:400},imageDraft:{key:'scope:a',setReferenceBindings:noop},imageDraftNodeId:'a',composerReferences:[{key:'node:a',number:1,role:'edit-target',title:'Picture A',url:'/fixture/a.png',sourceNodeId:'a'}],editPrompt:'Edit instruction',setEditPrompt:noop,imageReferenceState:{bindings:{}},removeComposerReference:noop,setLightbox:noop,locateComposerReference:noop,referenceError:'',promptAreaRef:ref(),pendPromptRef:ref(),extraInputRef:ref(),pickExtra:noop,
 genError:null,genModel:'model-a',imageModels:[{id:'model-a',label:'Model A',supportsEdit:true},{id:'model-b',label:'Model B',supportsEdit:false}],canvasImageCatalogError:null,pickGenerationModel:noop,generationMode:'standard',setGenerationMode:noop,genRatio:'3:4',setGenRatio:noop,genResolution:'2K',setGenResolution:noop,genCount:2,setGenCount:noop,selectedGenerationCount:2,genStyle:'Product',setGenStyle:noop,toggleNodeMark:noop,setFocusId:noop,retrySelected:noop,selectedGenerating:false,selectedGenerationFailure:undefined,selectedGenerationRetry:undefined,generateChild:noop,selectedPendGenerating:false,generatePend:noop,setSelectedId:noop,setSelectedPendId:noop,ratioMenuOpen:false,setRatioMenuOpen:noop,ratioBtnRef:ref(),setImageComposerMenuOpen:noop,
 textComposerDockRef:ref(),textComposerBodyRef:ref(),textPromptRef:ref(),textComposerExpanded:false,setTextComposerExpanded:noop,textComposerManuallySized:false,setTextComposerManuallySized:noop,textReferenceMenuOpen:false,setTextReferenceMenuOpen:noop,mentionState:null,setMentionState:noop,overlaySafeArea:{left:8,right:8,top:64,bottom:84},canvasSize:{width:1440,height:1000},textPrompt:'Write a prompt',setTextPrompt:noop,setSelectedTextId:noop,selectedTextRefs:[members[0]],updateTextReference:noop,textTasks:{state:()=>taskIdle,retryable:()=>false},generateTextNode:noop,assistBusy:false,setProductPicker:noop,nodeSettingsReady:true,textImageSubmitting:false,isNodeLocked:()=>false,openTextImageMenu:noop,setTextComposerMenuOpen:noop};}
async function main(){
 for(const kind of ['image','pending','text'])assert.ok(views[kind],kind+' actual entry');
 const locals=Object.keys(context()).join(','),baseControls=baseline?source.slice(source.indexOf('  const openRatioMenu ='),source.indexOf('  const recoveryScope=')):source.slice(source.indexOf('  const generationParameters='),source.indexOf('  const recoveryScope='));
 const imports=`import React,{useRef,useState} from 'react';import {createPortal} from 'react-dom';
 import {ArrowUp,Box,ChevronDown,Focus,GalleryVerticalEnd,Image as ImageIcon,Loader2,MapPin,PenLine,Plus,Rotate3d,RotateCcw,Ruler,Sparkles,Upload,X} from 'lucide-react';
 import {cn} from './src/lib/utils';import {cdnUrl} from './src/lib/cdn';import {GENERATION_STYLES} from './src/lib/mock-data';import {isHostedImageUrl as hasRenderableImage} from './src/lib/media-url';
 import {CANVAS_RATIO_OPTIONS,CANVAS_MAX_COUNT,canvasModelParameters,canvasCombinationSupported} from './src/lib/canvas/generation-parameters';
 import {changeImageReferenceRole} from './src/lib/canvas/image-references';
 import {CanvasComposerShell,CanvasComposerFooter,CanvasComposerOptions} from './src/components/canvas/composer-shell';
 import {CanvasParameterPopover} from './src/components/canvas/parameter-popover';import {CanvasModelSelect} from './src/components/canvas/model-select';
 import {ImageQualityControl} from './src/components/image-quality-control';import {ImageReferenceComposer} from './src/components/canvas/image-reference-composer';
 import {GenerationSubmitAction} from './src/components/canvas/generation-submit-action';import {CachedImage} from './src/components/cached-image';
 import {Textarea} from './src/components/ui/textarea';import {TextModelSelect} from './src/components/ui/text-model-select';import {FeatureVisible} from './src/lib/feature-access/client';
 const CANVAS_RATIOS=CANVAS_RATIO_OPTIONS,MAX_GENERATION_COUNT=CANVAS_MAX_COUNT,MAX_TOTAL_IMAGES=16;`;
 const entry=imports+(baseline?['RatioIcon','DarkSelect','ImageCountControl'].map(n=>functions[n]).join('\n'):`import {CanvasImageComposer} from './src/components/canvas/image-composer';import {CanvasTextComposer} from './src/components/canvas/text-composer';`)+Object.entries(views).map(([kind,view])=>`export function ${kind}(p){const {${locals}}=p;${kind==='text'?'':baseControls}return (${view});}`).join('\n');
 const fixture={
  locale:`export const useI18n=()=>({locale:globalThis.__locale,t:k=>k});`,
  quality:`import React from 'react';export const ImageQualityControl=p=><i data-price-feature={p.feature} data-price-model={p.modelId} data-price-ratio={p.ratio} data-price-resolution={p.resolution} data-price-quantity={p.quantity}/>;`,
  image:`import React from 'react';export const CachedImage=({src,alt,className})=><img src={src} alt={alt} className={className}/>;`,
  textmodel:`import React from 'react';export const TextModelSelect=()=> <i data-text-model="original"/>;`,
  feature:`import React from 'react';export const useFeatureAccess=()=>({can:()=>true});export const FeatureVisible=({children})=><>{children}</>;`,css:'export default {};',
 };
 const bundle=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',external:['react','react/jsx-runtime','react-dom'],plugins:[{name:'ports',setup(b){
  for(const [filter,p] of [[/i18n\/locale-context$/,'locale'],[/image-quality-control$/,'quality'],[/components\/cached-image$/,'image'],[/ui\/text-model-select$/,'textmodel'],[/feature-access\/client$/,'feature'],[/\.css$/,'css']])b.onResolve({filter},()=>({path:p,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'tsx',contents:fixture[a.path]}));
 }}]});
 const module={exports:{}},c=vm.createContext({module,exports:module.exports,require,console,process:{env:{}},__locale:'zh'});vm.runInContext(bundle.outputFiles[0].text,c);
 const rows=[];let checks=0;
 for(const locale of ['zh','en'])for(const kind of ['image','pending','text'])for(const variant of kind==='text'?['normal','empty','retry-empty','busy','old-generating','error','expanded','no-refs','assist-busy','images-disabled']:['standard','detail','triptych','split','busy','retry','error','no-refs','model-error','readonly']){
  const p=context();p.locale=c.__locale=locale;p.L=(zh,en)=>locale==='en'?en:zh;
  if(kind!=='text'){
   if(['standard','detail','triptych','split'].includes(variant))p.generationMode=variant;
   if(variant==='readonly'){if(kind==='pending')continue;p.readOnly=true;}
   if(variant==='busy')p.selectedGenerating=p.selectedPendGenerating=true;
   if(variant==='retry'){p.selectedGenerationFailure=p.selectedPend.generationFailure={kind:'sync',message:'Original result retained'};p.selectedGenerationRetry=p.selectedPend.onGenerationRetry=noop;}
   if(variant==='error')p.genError='Original error';if(variant==='no-refs')p.composerReferences=[];
   if(variant==='model-error'){p.imageModels=[];p.canvasImageCatalogError='load failed';}
   p.selectedGenerationCount=p.generationMode==='split'?3:p.generationMode==='triptych'?1:p.genCount;
  }else{
   let state={...taskIdle};if(variant==='empty'||variant==='retry-empty')p.textPrompt='';if(variant==='retry-empty')state={...state,phase:'retry',hasResult:true};
   if(variant==='busy'){state={...state,phase:'submitting',busy:true};p.selectedText.status='generating';}
   if(variant==='old-generating')p.selectedText.status='generating';if(variant==='error')state.error='Original text error';
   p.textTasks={state:()=>state,retryable:()=>variant==='retry-empty'};
   if(variant==='expanded')p.textComposerExpanded=true;if(variant==='no-refs'){p.selectedText.sourceIds=[];p.selectedTextRefs=[];}
   if(variant==='assist-busy')p.assistBusy=true;if(variant==='images-disabled')p.textImageSubmitting=true;
  }
  const html=renderToStaticMarkup(React.createElement(module.exports[kind],p)).replace(/_R_[\w]+_/g,'REACT_ID');
  assert.ok(html.includes(`data-testid="${kind}-node-dock"`));checks++;
  if(kind!=='text'&&!p.readOnly){const count=kind==='pending'?p.genCount:p.selectedGenerationCount;assert.ok(html.includes(`data-price-quantity="${count}"`)&&html.includes('data-price-model="model-a"'));checks++;}
  rows.push({locale,kind,variant,html});
 }
 fs.writeFileSync(path.join(out,baseline?'RENDER_BASELINE.json':'RENDER_MODIFIED.json'),JSON.stringify(rows,null,2));
 if(!baseline){const before=JSON.parse(fs.readFileSync(path.join(out,'RENDER_BASELINE.json'),'utf8'));assert.equal(rows.length,before.length);rows.forEach((row,i)=>{assert.deepEqual(row,before[i],`${row.kind}/${row.variant}/${row.locale}`);checks++;});}
 console.log(`CANVAS_COMPOSERS=PASS mode=${baseline?'BASELINE':'MODIFIED'} cases=${rows.length} checks=${checks} ACTUAL_CANVAS_BINDINGS=1 REACT_SSR=1 HTML=${baseline?'CAPTURED':'EQUAL'} PRICE_INPUTS=RETAINED SUPPLIER=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
