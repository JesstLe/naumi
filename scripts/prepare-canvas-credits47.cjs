// Exact-runtime UI patch: keep all concurrently deployed backend fixes and old assets.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ts = require('typescript'), esbuild = require('esbuild');
const out = path.resolve(process.argv[2]);
const original = fs.readFileSync(path.join(out, 'BASELINE_FILE.js'), 'utf8');
const source = fs.readFileSync('src/components/canvas/use-canvas-credits.ts', 'utf8');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const ast = ts.createSourceFile('chunk.js', original, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let refresh;
function visit(n) {
  if (ts.isFunctionDeclaration(n) && n.name?.text === 'sy' && n.getText(ast).includes('creditsTotal')) {
    if (refresh) throw Error('Multiple refresh functions');
    refresh = n.getText(ast);
  }
  ts.forEachChild(n, visit);
}
visit(ast);
if (!refresh) throw Error('Exact refresh function missing');
const body = esbuild.transformSync(source.replace(/^import .* from "react";\r?\n/m, '').replace(/export /g, ''), {
  loader: 'ts', target: 'es2020', minify: false,
}).code;
const hook = `(()=>{const {useCallback,useEffect,useRef,useState}=C;${body};return useCanvasCredits;})()`;
function once(s, from, to) {
  if (s.split(from).length !== 2) throw Error('Expected unique anchor: ' + from.slice(0, 70));
  return s.replace(from, to);
}
let modified = once(original, '[l$,lQ]=(0,C.useState)(null)', `{credits:l$,refreshCredits:sy}=${hook}({user:eg,ready:ey,targetEmail:tt,request:aa})`);
modified = once(modified, refresh, '');
modified = once(modified, 'if(lQ(null),e$(null)', 'if(e$(null)');
const parsed = ts.createSourceFile('modified.js', modified, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
if (parsed.parseDiagnostics.length) throw Error('Modified chunk has syntax errors');
fs.writeFileSync(path.join(out, 'MODIFIED_FILE.js'), modified);
fs.writeFileSync(path.join(out, 'hook-expression.js'), hook);
fs.writeFileSync(path.join(out, 'patch-metadata.json'), JSON.stringify({
  originalSha256: hash(original), modifiedSha256: hash(modified), hookSourceSha256: hash(source),
  originalName: '1528-265e3cc8e4673727.js', modifiedName: '1528-' + hash(modified).slice(0, 16) + '.js',
  changed: ['Canvas credits state -> shared useCanvasCredits hook', 'Remove old refresh declaration', 'Remove artwork-effect credits reset'],
  untouched: 'Every other byte of the live chunk; backend, pricing, jobs, media and all existing assets unchanged',
}, null, 2));
console.log('PATCH=PASS UNIQUE_ANCHORS=3 SYNTAX=PASS OLD_ASSETS=PRESERVED');
