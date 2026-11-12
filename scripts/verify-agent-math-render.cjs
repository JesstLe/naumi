/* 会话消息 LaTeX 渲染回归：
 * 真实 creation-message.tsx 经 esbuild 打包（react-markdown + remark-math +
 * rehype-katex + katex 为真实依赖），用 react-dom/server 静态渲染。
 * 场景：行内公式 / 独立公式块 / 代码块内公式不渲染 / 图片语法不受影响 /
 *      普通段落保持不变 / 非法表达式不崩渲染。
 */
const assert=require("assert");
const path=require("path");
const fs=require("fs");
const os=require("os");
const esbuild=require("esbuild");

const ROOT=path.join(__dirname,"..");
const SRC=path.join(ROOT,"src","components","home","creation-message.tsx");

let checks=0,failures=0;
function check(name,cond){checks++;if(cond){console.log("PASS",name);}else{failures++;console.log("FAIL",name);}}

const STUBS={
  "./creation-workbench.module.css":'const h=new Proxy({},{get:(_t,k)=>typeof k==="string"?"cx_"+k:""});export default h;',
  "./creation-activity":'export const CreationActivity=()=>null;',
  "@/lib/desktop/navigation":'export const useWorkspaceRouter=()=>({push(){}});',
  "@/lib/download":'export const downloadImage=async()=>{};',
  "@/lib/feature-access/client":'export const useFeatureAccess=()=>({can:()=>true,canPage:()=>true});',
  "@/components/cached-image":'export const CachedImage=(p)=>globalThis.__stubElt("img",p);',
  "lucide-react":'const mk=k=>(p)=>globalThis.__stubElt("svg",{"data-icon":k,...p});const icons={};for(const n of ["Download","Ellipsis","Expand","Loader2","Palette","PanelsTopLeft","RotateCcw","ScanEye","Scissors","Shirt","SquarePen","Sun","Blend","X"])icons[n]=mk(n);module.exports=icons;',
};
const STUB_FILTER=/^(@\/|lucide-react$|next\/link$|\.\/(creation-activity|creation-workbench\.module\.css)$)/;

async function build(){
  const outfile=path.join(ROOT,`node_modules`,`.verify-math-${process.pid}.cjs`);
  await esbuild.build({entryPoints:[SRC],bundle:true,format:"cjs",platform:"node",jsx:"automatic",outfile,logLevel:"silent",
    loader:{".css":"empty"},
    external:["react","react/jsx-runtime","react-dom","react-dom/server"],
    plugins:[{name:"stub",setup(b){
      b.onResolve({filter:STUB_FILTER},args=>({path:args.path,namespace:"stub"}));
      b.onLoad({filter:/.*/,namespace:"stub"},args=>{if(args.path==="@/lib/agent/media-policy")return{contents:fs.readFileSync(path.join(ROOT,"src","lib","agent","media-policy.ts"),"utf8"),loader:"ts"};return{contents:STUBS[args.path]||"module.exports={};",loader:"js"};});}}]});
  return outfile;
}

(async()=>{
  const outfile=await build();
  process.env.NODE_ENV="production";
  const {renderToStaticMarkup}=require("react-dom/server");
  const {createElement}=require("react");
  globalThis.__stubElt=createElement;
  const {CreationMessage}=require(outfile);

  const port={busy:false,unavailable:false,stage(){},regenerate(){},resolveArtwork:async()=>null};
  const render=(message,previous)=>renderToStaticMarkup(createElement(CreationMessage,{message,previous,port,onPreview:()=>{}}));

  /* t1 行内公式渲染为 KaTeX，不再残留原始 $...$ */
  const inline=render({role:"assistant",content:"质能方程 $E=mc^2$ 是物理学基石。",pending:false});
  check("t1a inline-math-renders-katex",inline.includes('class="katex"'));
  check("t1b inline-math-keeps-tex-annotation",inline.includes('encoding="application/x-tex"')&&inline.includes("E=mc^2"));
  check("t1c inline-math-no-raw-dollar-text",!/>\$E=mc\^2\$\s*是/.test(inline));

  /* t2 独立公式块渲染 katex-display */
  const block=render({role:"assistant",content:"积分如下：\n\n$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$\n\n完毕。",pending:false});
  check("t2a block-math-renders-display",block.includes("katex-display"));
  check("t2b block-math-parses-without-error",block.includes("<math")&&!block.includes("katex-error"));
  check("t2c surrounding-paragraph-intact",block.includes("积分如下")&&block.includes("完毕"));

  /* t3 代码块内的公式保持原样（交给系统提示词约束模型不放代码块） */
  const fenced=render({role:"assistant",content:"源码：\n\n```latex\n\\sum_{n=1}^{\\infty} \\frac{1}{n^2}\n```\n",pending:false});
  check("t3a fenced-code-stays-code",fenced.includes("<code"));
  check("t3b fenced-code-not-katex",!fenced.includes('class="katex"'));

  /* t4 生成图片 Markdown 语法不受 math 插件影响 */
  const image=render({role:"assistant",content:"![结果](/media/task/out.webp)",pending:false},{role:"user",content:"画一张",});
  check("t4a result-image-still-renders",image.includes('src="/media/task/out.webp"'));
  check("t4b image-tools-render",image.includes("产品精修")&&image.includes("发送到画布"));

  /* t5 非法公式不崩渲染，可见错误回退 */
  const invalid=render({role:"assistant",content:"坏公式 $\\frac{$$ 与普通文字",pending:false});
  check("t5a invalid-formula-does-not-crash",typeof invalid==="string"&&invalid.length>0&&invalid.includes("普通文字"));

  /* t6 用户消息不经过 katex 管线 */
  const user=render({role:"user",content:"$E=mc^2$ 是什么"},);
  check("t6a user-message-plain-text",user.includes("$E=mc^2$")&&!user.includes('class="katex"'));

  console.log(`AGENT_MATH_RENDER={"checks":${checks},"failed":${failures},"source":"actual creation-message.tsx via esbuild"}`);
  fs.unlinkSync(outfile);
  process.exit(failures?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
