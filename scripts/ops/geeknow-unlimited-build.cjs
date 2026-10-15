const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ts = require(process.env.NAUMI_TYPESCRIPT || 'typescript');
const [original, output] = process.argv.slice(2);
fs.mkdirSync(output, { recursive: true });
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function replaceOnce(code, before, after) {
  if (code.split(before).length !== 2) throw Error('Expected exactly one patch site: ' + before.slice(0, 90));
  return code.replace(before, after);
}
function capacityModule(code) {
  const sf = ts.createSourceFile('bundle.js', code, ts.ScriptTarget.Latest, true);
  let result;
  function walk(n) {
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === '64643') result = n.initializer.getText(sf);
    ts.forEachChild(n, walk);
  }
  walk(sf);
  if (!result || !result.includes('SELECT a.alias,b.max_concurrent,count')) throw Error('Capacity module differs');
  return result;
}
const manifest = { policy: 'NAUMI_UNLIMITED_CONCURRENCY_PROVIDERS=geeknow-images', files: [], renames: {} };
let backend = fs.readFileSync(path.join(original, '5552.js'), 'utf8');
const oldModule = capacityModule(backend);
let nextModule = replaceOnce(oldModule, 'function k(a,b){', 'function unlimitedProvider(id){return(process.env.NAUMI_UNLIMITED_CONCURRENCY_PROVIDERS||" ").split(",").map(v=>v.trim()).filter(Boolean).includes(id)}function k(a,b){');
nextModule = replaceOnce(nextModule,
  'maxConcurrent:d?.max_concurrent??a.maxConcurrent,inFlight:d?.in_flight??0',
  'maxConcurrent:unlimitedProvider(a.id)?0:d?.max_concurrent??a.maxConcurrent,inFlight:d?.in_flight??0,unlimited:unlimitedProvider(a.id)');
nextModule = replaceOnce(nextModule, '(l=Number((await j.query("SELECT count(*) AS n FROM app_model_provider_leases WHERE identity=$1",[i])).rows[0].n)<a.max_concurrent)',
  '(l=unlimitedProvider(b.providerId)||Number((await j.query("SELECT count(*) AS n FROM app_model_provider_leases WHERE identity=$1",[i])).rows[0].n)<a.max_concurrent)');
backend = replaceOnce(backend, oldModule, nextModule);
fs.writeFileSync(path.join(output, '5552.js'), backend);
for (const [mode, module] of [['original', oldModule], ['modified', nextModule]])
  fs.writeFileSync(path.join(output, `capacity-${mode}.cjs`), 'module.exports=' + module + ';\n');
manifest.files.push({ path: 'server/chunks/5552.js', original: '5552.js', modified: '5552.js', before: hash(fs.readFileSync(path.join(original, '5552.js'))), after: hash(backend) });
for (const name of ['5982-8138960158aee39d.js', 'page-140650d47ba29dda.js']) {
  const before = fs.readFileSync(path.join(original, name), 'utf8');
  let after = before;
  if (name.startsWith('5982')) {
    after = replaceOnce(after, '(0,t.jsx)(s.oz,{label:"供应商并发上限",value:l.maxConcurrent,min:1,max:256,onChange:e=>j({maxConcurrent:e})})',
      'u?.unlimited?(0,t.jsx)(s.JE,{label:"供应商并发上限",value:"不限并发",disabled:!0,onChange:()=>{}}):(0,t.jsx)(s.oz,{label:"供应商并发上限",value:l.maxConcurrent,min:1,max:256,onChange:e=>j({maxConcurrent:e})})');
    // Use the same TextField export as the adjacent interface-address field.
    const textField = before.match(/\(0,t\.jsx\)\(s\.([A-Za-z0-9_$]+),\{label:"接口地址"/);
    if (!textField) throw Error('Missing TextField binding');
    after = after.replace('s.JE,{label:"供应商并发上限"', `s.${textField[1]},{label:"供应商并发上限"`);
    after = replaceOnce(after, '"当前保守并发上限：",u.maxConcurrent', '"当前并发上限：",u.unlimited?"不限":u.maxConcurrent');
    after = replaceOnce(after, 'u.inFlight,"。草稿上限在发布后适用，保留版本仍使用最低限制。"', 'u.inFlight,u.unlimited?"。":"。草稿上限在发布后适用，保留版本仍使用最低限制。"');
  } else after = replaceOnce(after, '(null==d?void 0:d.maxConcurrent)||(null==r?void 0:r.maxConcurrent)||1', 'd?.unlimited?"不限":((null==d?void 0:d.maxConcurrent)??(null==r?void 0:r.maxConcurrent)??1)');
  const oldHash = name.match(/(?:5982-|page-)([a-f0-9]+)\.js$/)[1], newHash = hash(after).slice(0, 16), renamed = name.replace(oldHash, newHash);
  manifest.renames[oldHash] = newHash;
  fs.writeFileSync(path.join(output, renamed), after);
  manifest.files.push({ path: name.startsWith('5982') ? 'static/chunks/' + name : 'static/chunks/app/admin/model-management/' + name, original: name, modified: renamed, before: hash(before), after: hash(after) });
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('BUILD=PASS; CAPACITY_MODULE=64643; BACKEND_CHUNKS=1; UI_CHUNKS=2; CACHE_HASHES=NEW; OTHER_MODULES=UNCHANGED');
