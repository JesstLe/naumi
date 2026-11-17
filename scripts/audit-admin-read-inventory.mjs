// Keep the audit's route list in sync while preserving evidence entered by reviewers.
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root=fileURLToPath(new URL('..',import.meta.url));
const inventory=new URL('../docs/changes/2026-11-17-admin-route-inventory.md',import.meta.url);
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const existing=existsSync(inventory)?readFileSync(inventory,'utf8'):'';
const statuses=new Map([...existing.matchAll(/^\| `([^`]+)` \| (.+) \| (.+) \|$/gm)].map(([,key,source,status])=>[`${key} ${source}`,status]));
const rows=new Map(),http=new Set(['GET','HEAD','OPTIONS','POST','PUT','PATCH','DELETE']);
function add(key,path){
 const label=`\`${path}\``;
 rows.set(key,`| \`${key}\` | ${label} | ${statuses.get(`${key} ${label}`)??'待核查'} |`);
}
function methods(path){
 const source=ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true);
 const names=new Set();
 for(const stmt of source.statements){
  if(ts.isExportDeclaration(stmt)&&stmt.exportClause&&ts.isNamedExports(stmt.exportClause))for(const ex of stmt.exportClause.elements)names.add(ex.name.text);
  if(!stmt.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
  if(ts.isFunctionDeclaration(stmt)&&stmt.name)names.add(stmt.name.text);
  if(ts.isVariableStatement(stmt))for(const decl of stmt.declarationList.declarations)if(ts.isIdentifier(decl.name))names.add(decl.name.text);
 }
 return [...names].filter(name=>http.has(name));
}
const tracked=execFileSync('git',['ls-files','-z','--','src/app/admin','src/app/enterprise','src/app/api/admin','src/app/api/enterprise','src/app/api/team','src/app/api/fleet'],{cwd:root,encoding:'utf8'}).split('\0');
for(const path of tracked){
 if(!/\/(page\.tsx|route\.ts|layout\.tsx)$/.test(path))continue;
 const route=path.slice('src/app'.length,path.lastIndexOf('/'));
 if(path.endsWith('/page.tsx'))add(`页面 ${route}`,path);
 else if(path.endsWith('/layout.tsx'))add(`布局 ${route}`,path);
 else {
  const verbs=methods(path);
  if(!verbs.length)throw Error(`Review route with unrecognized exports: ${path}`);
  for(const verb of verbs)add(`${verb} ${route}`,path);
 }
}
// The site mode middleware also acts as an entrypoint without a matching page file.
add('入口 /admin','src/middleware.ts');
add('入口 /enterprise（站点模式）','src/middleware.ts');

// These entrypoints run in the same Web process and business pool: a wave of
// ordinary media requests must not starve admin reads. Keep their evidence
// separate from the admin/enterprise assets endpoints' own permissions.
const sharedMedia=['src/app/media/[...path]/route.ts','src/app/api/media/image-cache/route.ts'];
for(const path of sharedMedia){
 const verbs=methods(path);
 if(!verbs.length)throw Error(`Review shared media route: ${path}`);
 const route=path.slice('src/app'.length,path.lastIndexOf('/'));
 for(const verb of verbs)add(`共享素材 ${verb} ${route}`,path);
}

const workflow='services/enterprise-workflow/src/server.ts';
const code=read(workflow);
const multiline=new Map([['/v1/publication-files',['GET','POST']],['/v1/uploads',['GET','PUT','POST']]]);
const workflowAdd=(verb,path)=>add(`工作流 ${verb} ${path}`,workflow);
for(const line of code.split(/\r?\n/)){
 const exact=[...line.matchAll(/url\.pathname\s*===\s*'([^']+)'/g)].map(m=>m[1]);
 if(!exact.length)continue;
 if(new Set(exact).size!==1)throw Error(`Review ambiguous workflow dispatch: ${line}`);
 let verbs=multiline.get(exact[0]);
 if(!verbs)verbs=[...line.matchAll(/req\.method\s*===\s*'([A-Z]+)'/g)].map(m=>m[1]);
 if(!verbs.length)throw Error(`Review workflow dispatch: ${exact[0]}`);
 for(const verb of verbs)workflowAdd(verb,exact[0]);
}
// Explicit bridges for the non-literal branches; the check fails on a new matcher.
const matchers={
 scheduleMatch:['/v1/teams/[teamId]/scheduling','/v1/teams/[teamId]/scheduling/audit','/v1/teams/[teamId]/scheduling/personal/[subject]'],
 historyMatch:['/v1/orders/[orderId]/history'],
 detailMatch:['/v1/orders/[orderId]/detail'],
 match:['/v1/orders/[orderId]'],
};
const matcherNames=[...code.matchAll(/\bconst (\w+)\s*=.*\.exec\(url\.pathname\)/g)].map(m=>m[1]).sort();
if(matcherNames.join()!==Object.keys(matchers).sort().join())throw Error(`Review workflow dynamic matchers: ${matcherNames}`);
for(const paths of Object.values(matchers))for(const path of paths)workflowAdd('GET',path);
const prefixes=[...code.matchAll(/url\.pathname\.startsWith\('([^']+)'\)/g)].map(m=>m[1]).sort();
if(prefixes.join()!=='/v1/demand-files/,/v1/imports/worksheet')throw Error(`Review workflow route prefixes: ${prefixes}`);
const fileDispatch=code.slice(code.indexOf("const path=url.pathname.slice('/v1/demand-files/'"),code.indexOf("url.pathname==='/v1/delivery/library'"));
for(const [,kind,verb] of fileDispatch.matchAll(/\bif\(path==='([^']+)'&&req\.method==='([A-Z]+)'\)/g))workflowAdd(verb,`/v1/demand-files/${kind}`);
const streams=/\bif\(\[([^\]]+)\]\.includes\(path\)&&req\.method==='([A-Z]+)'\)/.exec(fileDispatch);
if(!streams)throw Error('Review workflow demand-file streams');
for(const [,kind] of streams[1].matchAll(/'([^']+)'/g))workflowAdd(streams[2],`/v1/demand-files/${kind}`);

const heading=`# 后台逐入口排查清单

从 Git 跟踪的页面、布局、Next API 方法和工作流服务分发生成。另列与后台共用业务连接池的素材入口。它只枚举入口；同方法内的 \`action\`、\`operation\`、筛选、客户端触发及向下调用要在对应行追加证据。POST 也有只读预览，不能按方法直接划为写入。代理与直连分别记账；覆盖本表不代表完成生产验收。

\`待核查\` 表示尚未逐项验证；\`部分\` 说明已验证的分支；整行所有读取变体和边界都有证据时才标记 \`已核查\`。用 \`node scripts/audit-admin-read-inventory.mjs --update\` 刷新入口并保留未变化行的记录，默认命令仅检查清单是否漂移。

| 入口 | 定义 | 覆盖与证据 |
| --- | --- | --- |
`;
const rendered=heading+[...rows.keys()].sort().map(k=>rows.get(k)).join('\n')+'\n';
if(process.argv.includes('--update'))writeFileSync(inventory,rendered);
else if(existing.replace(/\r\n/g,'\n')!==rendered)throw Error('Inventory drift: run with --update and review newly listed entries');
console.log(`ADMIN_ROUTE_INVENTORY_PASS entries=${rows.size} workflow=${[...rows.keys()].filter(k=>k.startsWith('工作流 ')).length}`);
