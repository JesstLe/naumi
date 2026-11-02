// Runs the real React component with a small deterministic hook/JSX host.
// This is component event/async-order evidence, not a rendered browser test.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript'), crypto = require('node:crypto');
const args = process.argv.slice(2), arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const positional = args.filter((value, index) => !value.startsWith('--') && !(index && args[index - 1].startsWith('--')));
const root = path.resolve(arg('--source-root', positional[0] || '.'));
const out = path.resolve(arg('--output-root', positional[1] || 'output/canvas-background-submit'));
const baseline = args.includes('--baseline'); fs.mkdirSync(out, { recursive: true });
const file = path.join(root, 'src/components/canvas/generation-submit-action.tsx'), source = fs.readFileSync(file, 'utf8');
const checks = [], loaded = [{ file, sha256: crypto.createHash('sha256').update(source).digest('hex') }];
const flush = () => new Promise(resolve => setImmediate(resolve));
function host(initial) {
  const slots = []; let cursor = 0, props = initial;
  const react = {
    useRef(value) { const i = cursor++; return slots[i] || (slots[i] = { current: value }); },
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useCallback: fn => fn,
  };
  const jsx = (type, value) => ({ type, props: value });
  const mod = { exports: {} }, code = ts.transpileModule(source, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const req = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === 'lucide-react') return { ArrowUp: 'ArrowUp', Loader2: 'Loader2', RotateCcw: 'RotateCcw' };
    throw Error('Unexpected component dependency ' + name);
  };
  vm.runInNewContext('(function(require,module,exports){' + code + '\n})', { console, Promise, Symbol, Error }, { filename: file })(req, mod, mod.exports);
  return { render(next) { if (next) props = { ...props, ...next }; cursor = 0; return mod.exports.GenerationSubmitAction(props); } };
}
function pendingRun() {
  let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject, submitted: undefined };
}
async function main() {
  const runs = [], makeRun = submitted => { const run = pendingRun(); run.submitted = submitted; runs.push(run); return run.promise; };
  const component = host({ generating: false, allowBackground: true, onGenerate: makeRun });
  const first = component.render(); assert.equal(first.props.disabled, false);
  first.props.onClick(); first.props.onClick(); await flush();
  assert.equal(runs.length, 1); assert.equal(component.render().props.disabled, true);
  checks.push('SAME_EVENT_DOUBLE_CLICK_STARTS_ONE_SUBMISSION');
  // A's durable response arrived, but its full generation/attachment Promise is pending.
  if (typeof runs[0].submitted === 'function') runs[0].submitted(); await flush();
  if (baseline) {
    const blocked = component.render({ generating: false }); assert.equal(blocked.props.disabled, true);
    blocked.props.onClick(); await flush(); assert.equal(runs.length, 1);
    checks.push('ACCEPTED_A_STILL_LOCKS_BUTTON_UNTIL_FULL_GENERATION_PROMISE_FINISHES');
    runs[0].resolve(); await flush();
    return { status: 'REPRODUCED', exit: 1 };
  }
  // The Canvas caller now supplies its submission-stage guard here, not the
  // existence of an already accepted background task. Component still honors it.
  assert.equal(component.render({ generating: true }).props.disabled, true);
  const accepted = component.render({ generating: false }); assert.equal(accepted.props.disabled, false);
  assert.equal(accepted.props['aria-busy'], false);
  checks.push('DURABLE_SUBMIT_RELEASES_BUTTON_WHILE_OLD_GENERATION_CONTINUES');
  accepted.props.onClick(); await flush(); assert.equal(runs.length, 2);
  assert.equal(component.render().props.disabled, true);
  runs[0].resolve(); await flush(); await flush();
  assert.equal(component.render().props.disabled, true);
  runs[0].submitted(); await flush(); assert.equal(component.render().props.disabled, true);
  component.render().props.onClick(); await flush(); assert.equal(runs.length, 2);
  checks.push('OLD_A_FINALLY_AND_LATE_ACK_DO_NOT_UNLOCK_B_SUBMISSION');
  runs[1].submitted(); await flush(); assert.equal(component.render().props.disabled, false);
  runs[1].reject(Error('fixture: background observation later failed')); await flush(); await flush();
  assert.equal(component.render().props.disabled, false);
  checks.push('B_ACCEPTED_THEN_OBSERVATION_FAILURE_DOES_NOT_RELOCK_COMPOSER');
  const legacyRuns = [], legacy = host({ generating: true, allowBackground: false, onGenerate: submitted => { const r = pendingRun(); r.submitted = submitted; legacyRuns.push(r); return r.promise; } });
  let button = legacy.render(); assert.equal(button.props.disabled, true); button.props.onClick(); await flush(); assert.equal(legacyRuns.length, 0);
  button = legacy.render({ generating: false }); button.props.onClick(); await flush(); assert.equal(legacyRuns.length, 1);
  legacyRuns[0].submitted?.(); await flush(); assert.equal(legacy.render().props.disabled, true);
  legacyRuns[0].resolve(); await flush(); await flush(); assert.equal(legacy.render().props.disabled, false);
  checks.push('NON_BACKGROUND_TOOLS_KEEP_ORIGINAL_FULL_RUN_BUSY_GUARD');
  return { status: 'PASS', exit: 0 };
}
main().then(result => {
  const stdout = `CANVAS_BACKGROUND_SUBMIT=${result.status} CHECKS=${checks.length} REAL_COMPONENT=1 SUPPLIER_CALLS=0 EXIT=${result.exit}`;
  fs.writeFileSync(path.join(out, baseline ? 'BASELINE.json' : 'RESULT.json'), JSON.stringify({ ...result, checks, loaded, stdout, evidence: 'Actual component event handlers and Promise races under deterministic React hook/JSX fixture' }, null, 2));
  console.log(stdout); process.exitCode = result.exit;
}).catch(error => {
  const stdout = `CANVAS_BACKGROUND_SUBMIT=FAIL CHECKS=${checks.length} REAL_COMPONENT=1 SUPPLIER_CALLS=0 EXIT=1`;
  fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ status: 'FAIL', checks, loaded, error: error.stack, stdout, exit: 1 }, null, 2));
  console.error(stdout); console.error(error); process.exitCode = 1;
});
