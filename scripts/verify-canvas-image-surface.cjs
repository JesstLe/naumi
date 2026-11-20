const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),{build}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
(async()=>{
 const mocks={
  'lucide-react':`export const MapPin=()=>null,Lock=()=>null,Combine=()=>null,ImagePlus=()=>null,Loader2=()=>null,Scissors=()=>null;`,
  '@xyflow/react':`import React from 'react';export const Position={Left:'left',Right:'right'};export const Handle=()=>React.createElement('span',{'data-port':true});export const NodeResizer=p=>React.createElement('span',{'data-resizer-visible':p.isVisible?'yes':'no'});`,
  '@/lib/feature-access/client':`export const useFeatureAccess=()=>({can:()=>true});`,
  '@/lib/utils':`export const cn=(...x)=>x.filter(Boolean).join(' ');export const formatDate=x=>x;`,
  '../canvas-image':`import React from 'react';export const CanvasImage=p=>React.createElement('img',{src:p.source,alt:p.alt});`,
  '../image-pixel-size':`export const ImagePixelSize=()=>null;`,
  '../generation-placeholder':`import React from 'react';export const GenerationPlaceholder=()=>React.createElement('div',{'data-pending':true});`,
  '../video/player':`import React from 'react';export const VideoPlayer=()=>React.createElement('div',{'data-video':true});export const mediaDownloadHref=x=>x;`,
 };
 const baseline=process.argv.includes('--baseline'),override=process.env.CANVAS_SURFACE_SOURCE;
 const built=await build({stdin:{contents:'export {ArtNode} from "./src/components/canvas/nodes/artwork-node"',resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,plugins:[{name:'leaf-fixtures',setup(b){
  b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'leaf'}:undefined);
  b.onLoad({filter:/.*/,namespace:'leaf'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:process.cwd()}));
  if(override)b.onLoad({filter:/[\\/]nodes[\\/]artwork-node\.tsx$/},()=>({contents:fs.readFileSync(override,'utf8'),loader:'tsx'}));
 }}]});
 const m=new Module(path.resolve('scripts/.canvas-surface-render.cjs'),module);m.filename=path.resolve('scripts/.canvas-surface-render.cjs');m.paths=module.paths;m._compile(built.outputFiles[0].text,m.filename);
 let checks=0;const render=(patch={},selected=false)=>renderToStaticMarkup(React.createElement(m.exports.ArtNode,{id:'sample',selected,data:{id:'sample',label:'Sample',image:'sample.png',width:200,height:300,intrinsicWidth:200,intrinsicHeight:300,lightCanvas:true,...patch}}));
 for(const lightCanvas of [true,false])for(const selected of [false,true]){
  const markup=render({lightCanvas},selected);assert.equal(markup.includes('canvas-ui-image-surface'),!baseline);checks++;
  if(selected){assert.ok(markup.includes('canvas-ui-selected'));assert.ok(markup.includes('data-resizer-visible="yes"'));checks+=2;}
 }
 for(const patch of [{pending:true},{videoUrl:'video.mp4'},{missingAsset:true},{image:undefined}]){assert.equal(render(patch).includes('canvas-ui-image-surface'),false);checks++;}
 const css=fs.readFileSync('src/app/globals.css','utf8');if(!baseline){assert.ok(css.includes('.canvas-ui-node-card.canvas-ui-image-surface:not(.canvas-ui-selected)'));checks++;}
 console.log(`CANVAS_IMAGE_SURFACE=${baseline?'BASELINE_REPRODUCED':'PASS'} checks=${checks} image_only=true selected_chrome=preserved pending_video_missing=unchanged external_calls=0`);
})().catch(e=>{console.error(e);process.exitCode=1});
