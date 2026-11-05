'use strict';
// Behavioral copy/rollback oracle. Both inputs use canvasDockLayout, which
// existed before compact mode; the baseline fails on geometry, not an export.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = path.resolve(option('--source-root', path.join(__dirname, '..')));
const out = path.resolve(option('--out', 'output/main-compact-dock-behavior'));
const sources = {}, cache = new Map(), checks = [];
const allowed = new Set(['src/lib/canvas/dock-layout.ts', 'src/lib/canvas/dock-placement.ts']);
function load(relative) {
  assert(allowed.has(relative), 'Unexpected source boundary: ' + relative);
  if (cache.has(relative)) return cache.get(relative).exports;
  const file = path.join(root, relative), bytes = fs.readFileSync(file);
  sources[relative] = {sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length};
  const compiled = ts.transpileModule(bytes.toString('utf8'), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  });
  assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const mod = {exports: {}};
  cache.set(relative, mod);
  const requireSource = id => {
    assert(id.startsWith('.'), 'Only the actual local geometry dependency is allowed');
    return load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), id)) + '.ts');
  };
  vm.runInThisContext('(function(require,module,exports){' + compiled.outputText + '\n})', {filename: file})(requireSource, mod, mod.exports);
  return mod.exports;
}
function check(name, actual, expected) {
  checks.push({name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected)});
}
fs.mkdirSync(out, {recursive: true});
try {
  const {canvasDockLayout} = load('src/lib/canvas/dock-layout.ts');
  const base = {
    nodeScreen: {left: 600, cx: 683.5, top: 250, bottom: 310},
    canvasSize: {width: 1440, height: 900},
    dockMetrics: {dockHeight: 220, toolbarHeight: 50, toolbarWidth: 620, dockMinimumHeight: 178},
    selectedTextId: null, textComposerExpanded: false, mediaComposerExpanded: false,
    readOnly: false, nodeTitleHeight: 38, protectNodeTitle: true,
  };
  const input = {...base, compactImage: true}, frozen = JSON.stringify(input);
  const compact = canvasDockLayout(input);
  check('IMAGE_ONLY_COMPACT_WIDTH', compact.dock.width, 620);
  check('NORMAL_HEIGHT_CAP', compact.dock.maxHeight, 360);
  check('NO_NODE_OR_VIEWPORT_MUTATION', JSON.stringify(input), frozen);
  const natural = canvasDockLayout({...input, dockMetrics: {...base.dockMetrics, dockHeight: 900, dockNaturalHeight: 220}});
  check('NATURAL_HEIGHT_IGNORES_CLIPPED_OR_EXPANDED_SAMPLE', natural, compact);
  const expanded = canvasDockLayout({...input, canvasSize: {width: 1920, height: 1080}, mediaComposerExpanded: true});
  check('EXPANDED_TARGET_HEIGHT', expanded.dock.height, 420);
  const largeChrome = canvasDockLayout({...input, canvasSize: {width: 1920, height: 1080},
    mediaComposerExpanded: true, dockMetrics: {...base.dockMetrics, dockMinimumHeight: 510}});
  check('EXPANDED_MAXIMUM_HEIGHT', largeChrome.dock.height, 480);
  check('VIDEO_NONCOMPACT_LEGACY_GEOMETRY', canvasDockLayout(base), {
    dock: {left: 273.5, top: 324, width: 820, maxHeight: 492}, toolbar: {left: 683.5, top: 150},
  });
  check('TEXT_NONCOMPACT_LEGACY_GEOMETRY', canvasDockLayout({...base, selectedTextId: 'text-fixture',
    nodeTitleHeight: 0, protectNodeTitle: false}), {
    dock: {left: 273.5, top: 324, width: 820, maxHeight: 492}, toolbar: {left: 683.5, top: 192},
  });
  const failed = checks.filter(c => !c.pass).length;
  const result = {status: failed ? 'FAIL' : 'PASS', sourceRoot: root, checks, sources,
    evidenceTier: 'actual pure production geometry with explicit screen inputs; no browser, PG or supplier',
    supplierCalls: 0, originalExportPresent: true};
  fs.writeFileSync(path.join(out, 'REPORT.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`MAIN_COMPACT_DOCK_BEHAVIOR=${result.status} CHECKS=${checks.length} FAILED=${failed} COMPACT_WIDTH=${compact.dock.width} EXPECTED_WIDTH=620 EXPANDED_HEIGHT=${expanded.dock.height} LEGACY=${checks.slice(-2).every(c => c.pass) ? 'UNCHANGED' : 'CHANGED'} ORIGINAL_EXPORT=1 SUPPLIER_CALLS=0`);
  process.exitCode = failed ? 1 : 0;
} catch (error) {
  fs.writeFileSync(path.join(out, 'REPORT.json'), JSON.stringify({status: 'ERROR', sourceRoot: root, sources, checks, error: String(error.stack || error)}, null, 2) + '\n');
  console.error(error.stack || error);
  process.exitCode = 2;
}
