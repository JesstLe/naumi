// Actual Next CanvasClient plus the real ratio admission/parameter compiler.
// Auth, account data and supplier output are local fixtures; no paid requests.
require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
process.env.CANVAS_EDIT_ASPECT_PORT ||= '14995';
const file=path.resolve('scripts/serve-canvas-edit-aspect-fixture.cjs');
let source=fs.readFileSync(file,'utf8');
const replace=(from,to)=>{if(!source.includes(from))throw Error('Fixture source drift: '+from.slice(0,60));source=source.replace(from,to)};
replace("const state={submissions:[]", "const state={plans:[],submissions:[]");
replace("if(p==='/api/imagegen/plan')return json(res,{request:body,intent:{operation:'generate',background:null,requirements:[],conflicts:[]},steps:[{key:'generate',operation:'generate',credits:0}],warnings:[],confirmationRequired:false,totalCredits:0,billingVersion:1,modelVersion:1});", `if(p==='/api/imagegen/plan'){
 const {imageRequestAdmission}=require('../src/lib/imagegen/request-admission.ts');
 const {compileImageParameterPlan}=require('../src/lib/model-config/image-parameter-plan.ts');
 const upstream={id:'local-image',model:'fixture-image',parameterMap:{apimartImages:{schemaVersion:1,ratios:['1:1','3:4','16:9'],maxOutputs:4,supportsMask:false},resolutionPolicy:{mode:'map',field:'resolution',ratioField:'aspect_ratio',values:{'1K':'1K'}}}};
 const rejected=imageRequestAdmission(body.parameters.ratio,'image-a',false,upstream);
 state.plans.push({request:body,rejected});
 if(rejected.length)return json(res,{code:'IMAGEGEN_NO_CHANNEL',error:'所选模型没有支持本次生成参数的可用通道'},409);
 const wire=compileImageParameterPlan(upstream,body.parameters,{publicModelId:'image-a',protocol:'apimart-images',modelVersion:1});state.plans.at(-1).wire=wire.wire;
 return json(res,{request:body,intent:{operation:body.mode,background:null,requirements:[],conflicts:[]},steps:[{key:'generate',operation:body.mode,credits:0}],warnings:[],confirmationRequired:false,totalCredits:0,billingVersion:1,modelVersion:1});
 }`);
replace("if(!['suppl-main.png','suppl-selling.png'].includes(name))", "if(['baseline-result.png','modified-result.png'].includes(name)){res.writeHead(200,{'content-type':'image/png'});return res.end(fs.readFileSync(path.join(process.env.CANVAS_EDIT_ASPECT_EVIDENCE||'E:/Workspace/naumi/output/canvas-edit-aspect-20261028',name)))}if(!['suppl-main.png','suppl-selling.png'].includes(name))");
replace("SETTINGS_SECRET:crypto.randomUUID()", "SETTINGS_SECRET:crypto.randomBytes(32).toString('hex')");
const fixture=new Module(file,module);fixture.filename=file;fixture.paths=module.paths;fixture._compile(source,file);
