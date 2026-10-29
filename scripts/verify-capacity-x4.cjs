// No dotenv, inherited credentials, DB, or external supplier. Each large parse
// has a separate process deadline; the production parser itself is unchanged.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const ts = require('typescript');
const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const root = path.resolve(arg('--source-root') || '.');
const cleanEnv = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'USERPROFILE'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
cleanEnv.TSX_DISABLE_CACHE = '1';
cleanEnv.TSX_TSCONFIG_PATH = path.join(root, 'tsconfig.json');
function originalFunction(file, name) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(fn, name);
  const code = ts.transpileModule(fn.getText(ast).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(code + `\n${name}`, { Buffer, URL });
}
function legacyUrl(s) {
  const markdown = Array.from(s.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g));
  if (markdown.length) return markdown.at(-1)?.[1] || '';
  const urls = Array.from(s.matchAll(/https?:\/\/[^\s)]+/g));
  return urls.at(-1)?.[0] || '';
}
function parserChecks() {
  const parse = originalFunction('src/lib/new-api-image.ts', 'extractImageUrl');
  const whitespace = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
  const cases = ['', 'http://', 'https://', 'https://a', 'https://a) https://b', '![x](https://a) https://b', '![outer ![inner](https://a)', '![x](https://a![y](https://b)', '![x](https://a![y spaced](https://b)', '![] (https://a)', '![x](ftp://a) https://b', '![x](HTTPS://a)', '![x](https://a)![y](http://b)', '![x](https://a\n)![y](http://b)', 'data:image/png;base64,AAAA', '![x](https://a\u200bZ)'];
  for (const w of whitespace) cases.push(`![x](https://a${w}b) http://last`, `![a${w}b](https://a) http://last`);
  let seed = 0x4c34;
  const tokens = ['![', ']', '(', ')', 'https://', 'http://', ' ', '\n', 'x', '![](', 'https:/', '\u202f', '\u200b'];
  for (let i = 0; i < 12000; i++) {
    let s = '';
    for (let j = 0; j < 24; j++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; s += tokens[seed % tokens.length]; }
    cases.push(s);
  }
  for (const s of cases) assert.equal(parse(s), legacyUrl(s), JSON.stringify(s));
  console.log('URL_COMPATIBILITY=PASS CASES=' + cases.length + ' SEED=19508');
}
function base64Checks() {
  let checks = 0;
  for (const file of ['channel-image-response.ts', 'reverse-hub-images.ts']) {
    const src = fs.readFileSync(path.join(root, 'src/lib/model-config', file), 'utf8');
    const literal = src.match(/(\/\^\[A-Za-z0-9[^\n]+?)\.test\(item.b64_json\)/)?.[1];
    assert.ok(literal, file);
    const re = vm.runInNewContext(literal);
    for (const size of [1048576, 8388608, 46137344]) for (const [kind, tail, expected] of [['valid', '', true], ['illegal-tail', '!', false], ['unicode-whitespace', '\u202f', true]]) {
      const s = 'A'.repeat(size) + tail, t = performance.now();
      assert.equal(re.test(s), expected);
      console.log(JSON.stringify({ test: file, kind, chars: s.length, result: expected, ms: +(performance.now() - t).toFixed(3) })); checks++;
    }
    for (const [s, expected] of [['', false], ['=', false], ['A', true], ['AA=', true], ['AA==', true], ['AA===', false], ['AA=A', false], ['AA== ', false], ['AA==\n', false], ['AA\n==', true], [' \t', true], ['AA\u200b', false], ['AA\u0085', false], ['AA-_', false]]) { assert.equal(re.test(s), expected, JSON.stringify(s)); checks++; }
  }
  console.log('SUPPLIER_REGEX=PASS CHECKS=' + checks + ' STACK_FAILURES=0');
}
async function main() {
  if (arg('--worker') === 'url') {
    const parse = originalFunction('src/lib/new-api-image.ts', 'extractImageUrl');
    const size = Number(arg('--size'));
    const kind = arg('--kind');
    const unit = kind === 'no-close' ? '![' : '![x](https://';
    const s = unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
    const t = performance.now();
    assert.equal(parse(s), legacyExpected(kind, s));
    console.log(JSON.stringify({ test: 'url-stress', kind, chars: s.length, ms: +(performance.now() - t).toFixed(3), result: 'PASS' }));
    return;
  }
  parserChecks(); base64Checks();
  let failed = 0;
  for (const [kind, size] of [['no-close', 16384], ['no-close', 32768], ['no-close', 65536], ['no-close', 1048576], ['no-paren', 1048576]]) {
    const args = [__filename, '--source-root', root, '--worker', 'url', '--kind', kind, '--size', String(size)];
    const r = cp.spawnSync(process.execPath, args, { encoding: 'utf8', env: cleanEnv, timeout: 5000 });
    console.log(JSON.stringify({ command: [process.execPath, ...args], input: { kind, size }, stdout: r.stdout, stderr: r.stderr, exitStatus: r.status, signal: r.signal, error: r.error?.code || null }));
    if (r.status !== 0) failed++;
  }
  const args = ['--conditions=react-server', '--import', 'tsx', path.join(__dirname, 'verify-capacity-x4-http.ts'), '--source-root', root];
  const r = cp.spawnSync(process.execPath, args, { encoding: 'utf8', env: cleanEnv, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  console.log(JSON.stringify({ command: [process.execPath, ...args], input: 'isolated loopback HTTP; generated 1024x1024 PNG; no DB', stdout: r.stdout, stderr: r.stderr, exitStatus: r.status, signal: r.signal, error: r.error?.code || null }));
  if (r.status !== 0) failed++;
  const stressArgs = [...args, '--http-stress'];
  const stress = cp.spawnSync(process.execPath, stressArgs, { encoding: 'utf8', env: cleanEnv, timeout: 10000, maxBuffer: 1024 * 1024 });
  console.log(JSON.stringify({ command: [process.execPath, ...stressArgs], input: '1 MiB repeated ![ + loopback image URL in real supplier JSON response', stdout: stress.stdout, stderr: stress.stderr, exitStatus: stress.status, signal: stress.signal, error: stress.error?.code || null }));
  if (stress.status !== 0) failed++;
  console.log('X4=' + (failed ? 'FAIL' : 'PASS') + ' FAILED_GROUPS=' + failed);
  process.exitCode = failed ? 1 : 0;
}
function legacyExpected(kind, s) {
  // no-paren has no markdown match, and the first URL greedily contains the
  // remaining openers. Do not run the quadratic reference on the large sample.
  return kind === 'no-close' ? '' : s.slice(s.indexOf('https://'));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
