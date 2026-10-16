const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const out=path.resolve(process.argv[2]||'output/canvas-generation-progress-20261016');fs.mkdirSync(out,{recursive:true});
const result=esbuild.buildSync({entryPoints:['src/components/canvas/generation-placeholder.tsx'],bundle:true,platform:'node',format:'cjs',write:false,outdir:path.join(out,'render'),external:['react','react-dom','next/*'],loader:{'.module.css':'local-css'},jsx:'automatic'});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
// Evaluate the exact production component with normal React; no duplicate JSX mock.
const Module=require('node:module'),m=new Module(path.join(process.cwd(),'progress-render.cjs'));m.filename=path.join(process.cwd(),'progress-render.cjs');m.paths=module.paths;m._compile(js,m.filename);
const Component=m.exports.GenerationPlaceholder,now=Date.now();
const cards=[['准备素材',{stage:'preparing',startedAt:now-4500}],['生成画面',{stage:'generating',startedAt:now-110000}],['放入画布',{stage:'saving',startedAt:now-150000}]];
const contents=cards.map(([label,props])=>`<section class="sample"><div class="sampleLabel">${label}</div><div class="card">${renderToStaticMarkup(React.createElement(Component,props))}</div></section>`).join('');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>画布生图进度</title><style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,"Microsoft YaHei",sans-serif;color:#303641;background:transparent} .board{padding:26px 24px 30px;background:#f6f8fc;border-radius:16px} .row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.sampleLabel{font-size:12px;color:#7e899d;margin:0 0 10px 3px}.card{height:268px;border:1px solid #dfe6f2;border-radius:13px;background:#fff;box-shadow:0 4px 18px #52668c05;overflow:hidden;--canvas-ui-text:#303641;--canvas-ui-muted:#8a95a8}svg{display:inline-block;flex-shrink:0} @media(max-width:600px){.board{padding:20px 16px}.row{grid-template-columns:1fr}.card{height:238px}}${css}</style><main class="board"><div class="row">${contents}</div></main></html>`;
fs.writeFileSync(path.join(out,'progress-design.html'),html);fs.writeFileSync(path.join(out,'component-render.css'),css);
console.log('COMPONENT_RENDER=PASS ACTUAL_COMPONENT=TRUE STATES=3 HTML='+path.join(out,'progress-design.html'));
