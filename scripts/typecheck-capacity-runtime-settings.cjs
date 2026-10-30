#!/usr/bin/env node
'use strict';
// Focused semantic type check. External business I/O is declared, not imported;
// this is intentionally not a whole-project build or workflow-module check.
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const files = ['src/lib/image-job-queue.ts', 'src/lib/runtime/positive-integer.ts',
  'src/lib/video/worker-settings.ts', 'src/lib/video/worker.ts',
  'src/lib/video/coordination-pool.ts', 'src/lib/db/connection.ts'].map(file => path.join(root, file));
const stub = path.join(root, 'audit-artifacts/capacity-runtime-settings/io-declarations.d.ts');
const declarations = `
export const dbEnabled: boolean;
export function withBackgroundActivity<T>(scope: string, key: string, admission: string, action: () => Promise<T>, draining: () => T | Promise<T>): Promise<T>;
export function recoverDueVideoTasks(limit: number): Promise<number>;
export function recoverVideoWorkflows(limit: number): Promise<number>;
export function recoverDurableImageJobs(): Promise<number>;
export function scanSupplierCostsOnce(): Promise<number>;
export function recoverReferenceWorkbench(): Promise<void>;
`;
const options = { noEmit: true, strict: true, skipLibCheck: true, esModuleInterop: true,
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10,
  types: ['node'], typeRoots: [path.dirname(path.dirname(require.resolve('@types/node/package.json')))] };
const host = ts.createCompilerHost(options);
const read = host.readFile.bind(host), exists = host.fileExists.bind(host);
host.readFile = file => file === stub ? declarations : read(file);
host.fileExists = file => file === stub || exists(file);
const originalSource = host.getSourceFile.bind(host);
host.getSourceFile = (file, language, error, fresh) => file === stub ? ts.createSourceFile(file, declarations, language, true) : originalSource(file, language, error, fresh);
host.resolveModuleNames = (names, containingFile) => names.map(name => {
  if (name.startsWith('@/') || name === '../reference-workbench/service' || name === './workflow') return { resolvedFileName: stub, extension: ts.Extension.Dts };
  if (name === '../db') return { resolvedFileName: path.join(root, 'src/lib/db/connection.ts'), extension: ts.Extension.Ts };
  if (name === 'pg') return { resolvedFileName: path.join(path.dirname(require.resolve('@types/pg/package.json')), 'index.d.ts'), extension: ts.Extension.Dts };
  return ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
});
const program = ts.createProgram(files, options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.log(ts.formatDiagnostics(diagnostics, { getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
  process.exitCode = 1;
} else console.log('FOCUSED_TYPES=PASS files=6 external_io=declarations-only');
