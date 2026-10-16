// Offline evidence package only. This deliberately does not deploy or touch live files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript'),cp=require('node:child_process');
const out=path.resolve(process.argv[2]);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const original=fs.readFileSync(path.join(out,'ORIGINAL_8458.js')),modified=fs.readFileSync(path.join(out,'MODIFIED_FILE.js'));
const meta=JSON.parse(fs.readFileSync(path.join(out,'runtime-meta.json'),'utf8'));
if(hash(original)!==meta.originalSha256||hash(modified)!==meta.modifiedSha256)throw Error('Package hash mismatch');
fs.copyFileSync(path.join(out,'MODIFIED_FILE.js'),path.join(out,'ROLLBACK_COPY.js'));
const rollback=`#!/usr/bin/env bash
set -euo pipefail
DIR=$(cd -- "$(dirname -- "$0")" && pwd -P)
TARGET="$DIR/ROLLBACK_COPY.js"
# Fixture-only rollback: never writes a deployed container, Nginx, DB or media.
test "$(sha256sum "$DIR/ORIGINAL_8458.js" | cut -d' ' -f1)" = '${meta.originalSha256}'
test "$(sha256sum "$TARGET" | cut -d' ' -f1)" = '${meta.modifiedSha256}'
cp -- "$DIR/ORIGINAL_8458.js" "$TARGET"
cmp -s -- "$DIR/ORIGINAL_8458.js" "$TARGET"
test "$(sha256sum "$DIR/MODIFIED_FILE.js" | cut -d' ' -f1)" = '${meta.modifiedSha256}'
printf 'ROLLBACK_COPY=PASS ORIGINAL_HASH=EXACT MODIFIED_FILE=UNCHANGED EXIT=0\\n'
`;
fs.writeFileSync(path.join(out,'ROLLBACK.sh'),rollback,{mode:0o755});
const diff=cp.spawnSync('git',['diff','--no-index','--text','--','ORIGINAL_8458.js','MODIFIED_FILE.js'],{cwd:out,encoding:'utf8'});
if(diff.status!==1)throw Error('Expected a real changed diff');fs.writeFileSync(path.join(out,'DIFF_FILE.patch'),diff.stdout);
// Extract the exact same compiled functions as the local runtime verifier. This
// portable probe runs on the deployed Linux Sharp, without production requests.
const modules=[];
for(const [label,bytes] of [['BASELINE',original],['MODIFIED',modified],['ROLLBACK',original]]){
 const s=bytes.toString(),a=ts.createSourceFile('chunk.js',s,99,true,ts.ScriptKind.JS),parts=[],helpers=[];
 function go(n){if(ts.isFunctionDeclaration(n)&&['T','U','V','Z','$'].includes(n.name?.text))parts.push(n.getText(a));if(ts.isVariableDeclaration(n)&&['__frameSharp','__naumiFrame'].includes(n.name.getText(a)))helpers.push('const '+n.getText(a)+';');ts.forEachChild(n,go)}go(a);
 modules.push({label,code:helpers.join('\n')+parts.join('\n')+';globalThis.test={T,Z,dims:$};'});
}
const probe=`const sharp=require('sharp'),vm=require('node:vm'),assert=require('node:assert/strict');
const modules=${JSON.stringify(modules)},input=Buffer.from('${fs.readFileSync(path.join(out,'EDGE_FIXTURE.png')).toString('base64')}','base64');
const decode=url=>({bytes:Buffer.from(url.split(',')[1],'base64')});
(async()=>{for(const item of modules){const ctx=vm.createContext({Buffer,c:{t:()=>({default:sharp})},j:{wA:decode}});vm.runInContext(item.code,ctx);const image={url:'data:image/png;base64,'+input.toString('base64'),ratio:'3:4'};const r=(await ctx.test.Z([image],{ratio:'3:4',targetWidth:0,targetHeight:0}))[0],b=decode(r.url).bytes,m=await sharp(b).metadata();if(item.label==='MODIFIED'){assert.deepEqual(b,input);assert.deepEqual(await ctx.test.T(input,'3:4'),input);assert.equal((await ctx.test.dims([image]))[0].ratio,'2:3');}else assert.equal(m.height,1365);console.log('LINUX_'+item.label+'=PASS OUTPUT='+m.width+'x'+m.height+' EXIT=0');}})().catch(e=>{console.error(e);process.exitCode=1});
`;
fs.writeFileSync(path.join(out,'LINUX_RUNTIME_PROBE.cjs'),probe);
console.log('PACKAGE=PASS ORIGINAL_HASH=EXACT DIFF=CHANGED ROLLBACK=FIXTURE_ONLY LIVE_DEPLOY=NOT_RUN');
