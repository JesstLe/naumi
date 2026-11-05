// Execute the real Canvas action functions and draft modules. HTTP responses and
// React state commits are controlled boundaries; no server/provider is contacted.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto'), ts = require('typescript');
const args = process.argv.slice(2), arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = path.resolve(arg('--source-root', path.join(__dirname, '..')));
const output = path.resolve(arg('--output-root', 'output/canvas-background-runs'));
const baseline = args.includes('--baseline'), checks = [], errors = [], loaded = new Map();
const plain = value => JSON.parse(JSON.stringify(value));
fs.mkdirSync(output, { recursive: true });
function read(relative) {
  const file = path.join(root, relative), bytes = fs.readFileSync(file);
  loaded.set(relative, { path: file, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  return bytes.toString('utf8');
}
function transpile(source, file) {
  return ts.transpileModule(source, { fileName: file, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
}
const source = read('src/components/canvas/canvas-client.tsx');
const ast = ts.createSourceFile('canvas-client.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), functions = {};
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions[node.name.text] = node.getText(ast);
  ts.forEachChild(node, visit);
})(ast);
const unexpected = name => () => { throw new Error('UNEXPECTED_BOUNDARY:' + name); };
const globals = { console, Date, Math, Map, Set, WeakMap, Promise, Response, Request, Headers, FormData, File, Blob,
  TextEncoder, TextDecoder, URL, Error, JSON, Array, Uint8Array, Buffer, AbortController, AbortSignal,
  crypto: crypto.webcrypto, structuredClone, setTimeout: fn => setImmediate(fn), clearTimeout: clearImmediate,
  fetch: unexpected('external fetch'), cancelImagegen: unexpected('cancel'), refund: unexpected('refund') };
function moduleLoader() {
  const context = vm.createContext(globals), cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    const mod = { exports: {} }; cache.set(relative, mod);
    const requireLocal = id => {
      const start = id.startsWith('@/') ? 'src/' + id.slice(2) : id.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(relative), id)) : null;
      if (!start) return require(id);
      for (const extension of ['', '.ts', '.tsx', '/index.ts']) {
        if (fs.statSync(path.join(root, start + extension), { throwIfNoEntry: false })?.isFile()) return load(start + extension);
      }
      throw Error('MODULE_NOT_FOUND:' + start);
    };
    vm.runInContext('(function(require,module,exports){' + transpile(read(relative), relative) + '\n})', context, { filename: relative })(requireLocal, mod, mod.exports);
    return mod.exports;
  }
  return { load };
}
const modules = moduleLoader();
let ownerBundle;
const helpers = {
  ...modules.load('src/lib/canvas/generation-parameters.ts'),
  ...modules.load('src/lib/canvas/generation-feedback.ts'),
  ...modules.load('src/lib/canvas/generation-fanout.ts'),
  ...modules.load('src/lib/canvas/image-references.ts'),
  ...modules.load('src/lib/imagegen/reference-labels.ts'),
  ...modules.load('src/lib/imagegen/http.ts'),
  ...modules.load('src/lib/canvas/generation-failure.ts'),
  ...modules.load('src/lib/canvas/image-node-drafts.ts'),
  ...modules.load('src/lib/canvas/image-reference-drafts.ts'),
  ...modules.load('src/lib/browser-crypto.ts'),
  ...(!baseline ? modules.load('src/lib/canvas/background-generation.ts') : {}),
  ...(!baseline ? modules.load('src/lib/canvas/generation-presentation.ts') : {}),
  ...(!baseline ? modules.load('src/lib/canvas/pending-presentation.ts') : {}),
};
// Private catalogue algorithms remain exercised from their actual owner. They
// are not copied into the Canvas composition just to satisfy the old harness.
if(!functions.projectKey){const catalog=read('src/lib/canvas/project-catalog.ts'),tree=ts.createSourceFile('catalog.ts',catalog,99,true);for(const n of tree.statements)if(ts.isFunctionDeclaration(n)&&['rootOf','isSuiteBatch','projectKey'].includes(n.name?.text))functions[n.name.text]=n.getText(tree);}
function compile(names, environment) {
  const defaults={__ports:{workspace,revision:1,auth:async()=>({}),read:async()=>new Blob(['reference-pixels'],{type:'image/png'})},flushImagePrompts:async()=>{},user:{email:account},batchRunMountedRef:{current:true},canvasAccountRef:{current:account},currentWorkspace:()=>workspace,activeProjectRef:{current:{key:project}},canvasContextEpochRef:{current:0},imageSubmissionRef:{current:new Map()},originalImageChecksRef:{current:new Map()},setImageSubmissionEpoch:()=>{}};
  const context = vm.createContext({ ...globals, ...helpers,...defaults,...environment });
  if(ownerBundle){context.module={exports:{}};context.exports=context.module.exports;vm.runInContext(ownerBundle,context);Object.assign(context,context.module.exports,defaults,environment);}
  if(environment.readCanvasGenerationReceipt)context.fetch=async(url,init)=>String(url).includes('/position')?environment.privateFetchRaw(url,init):(await environment.readCanvasGenerationReceipt(new URL(String(url),'http://fixture').searchParams.get('job'),init.headers)).response;
  for(const name of ['canvasImageRunContext','canvasImageCreationServices'])if(functions[name]&&!names.includes(name))names=[...names,name];
  context.renameGeneratedArtwork=unexpected('unused rename');context.generateDetailSequence=unexpected('unused detail');
  for (const name of names) assert.ok(functions[name], 'source function exists: ' + name);
  vm.runInContext(transpile(names.map(name => functions[name]).join('\n') + '\nglobalThis.actions={' + names.join(',') + '};', 'canvas-actions.tsx'), context);
  return context.actions;
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function until(predicate, label) {
  for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(setImmediate); }
  throw Error('FIXTURE_WAIT_EXHAUSTED:' + label);
}
function check(name) { checks.push(name); console.log('CHECK=' + name); }
const account = 'canvas@example.test', project = 'tree:original', workspace = 'personal';
const original = { id: 'original', title: 'Source', image: '/original.png', width: 1024, height: 1024,
  ratio: '1:1', canvasImageRevision: 3, canvasX: 50, canvasY: 50, prompt: 'original recipe' };
const reference = { id: 'reference', title: 'Reference', image: '/reference.png', width: 1024, height: 1024 };
function references(file = new File(['original-reference'], 'reference.png', { type: 'image/png' })) {
  return [{ key: 'node:reference', sourceNodeId: 'reference', number: 1, role: 'edit-target', title: 'Reference', url: reference.image },
    { key: 'upload:second', number: 2, role: 'reference', title: 'Uploaded', url: 'blob:input', file }];
}

async function selectionIdentity() {
  const selected = structuredClone(original), calls = [], submittedEvents = [], submitted = () => submittedEvents.push(true);
  const environment = { selected, dockReferenceState: {}, referenceError: null, visibleDockRefs: [reference], extraFiles: [], MAX_TOTAL_IMAGES: 16,
    generationMode: 'standard', editPrompt: 'same deliberate input', genCount: 1, genRatio: '1:1', genStyle: '', genResolution: '4K',
    composerReferences: references(), FAITHFUL_REGEN_PROMPT: 'faithful', setGenError: unexpected('selection error'),
    runGen: async (...input) => { calls.push(input); input[2].onSubmitted?.(); } };
  const action = compile(['generateSelectedImage'], environment).generateSelectedImage;
  await action(submitted); await action(submitted);
  const effectiveKeys = calls.map(([, , options]) => options.operationKey || `node:${selected.id}`);
  if (baseline) {
    assert.equal(effectiveKeys[0], effectiveKeys[1]);
    check('BASELINE_TWO_GENERATE_ACTIONS_REUSE_NODE_RECEIPT_KEY');
    return;
  }
  assert.notEqual(effectiveKeys[0], effectiveKeys[1]);
  assert.ok(effectiveKeys.every(key => /^node:original:attempt:[a-f0-9-]{36}$/.test(key)));
  assert.ok(calls.every(([, , options]) => typeof options.onSubmitted === 'function' && options.replaceNode && options.resolution === '4K'));
  assert.equal(submittedEvents.length,2,'both accepted callbacks still reach the caller');
  assert.deepEqual(plain(selected), original);
  check('REAL_SELECTED_ACTION_ALLOCATES_NEW_KEY_EVEN_WITH_IDENTICAL_PROMPT');
}

function draftIsolation() {
  const source = { id: 'pend-A', x: 20, y: 30, parentId: 'reference', linked: true, label: 'Draft', inputs: ['reference'],
    generating: true, generationSubmitted: true, generationFailure: { message: 'old' }, taskId: 'paid-A', paid: true,
    operationKey: 'old', generationStartedAt: 123, progress: 70, uploading: true, cancelRequested: true };
  const fork = helpers.forkPendingImageDraft(source, 'pend-B', { x: 420, y: 30 });
  assert.deepEqual(plain(fork), { id: 'pend-B', x: 420, y: 30, parentId: 'reference', linked: true, label: 'Draft', inputs: ['reference'], uploading: false, progress: 0 });
  fork.inputs.push('only-B'); assert.deepEqual(source.inputs, ['reference']);
  let sequence = 0; const revoked = [];
  const uploads = new helpers.ImageReferenceDraftStore({ createObjectURL: () => `blob:owned-${++sequence}`, revokeObjectURL: value => revoked.push(value) });
  const file = new File(['pixels'], 'ref.png', { type: 'image/png' });
  uploads.add('A', [{ key: 'upload:2', file }]); uploads.copy('A', 'B');
  const a = uploads.read('A')[0], b = uploads.read('B')[0];
  assert.equal(a.key, b.key); assert.equal(a.file, b.file); assert.notEqual(a.url, b.url);
  uploads.remove('A', 'upload:2'); assert.equal(uploads.read('B').length, 1); assert.deepEqual(revoked, [a.url]);
  uploads.add('C', [{ key: 'user-edited', file }]); uploads.copy('B', 'C'); assert.equal(uploads.read('C')[0].key, 'user-edited');
  uploads.clear(); assert.equal(new Set(revoked).size, revoked.length);
  check('REAL_DRAFT_FORK_EXCLUDES_EXECUTION_AND_COPIES_REFERENCE_URL_OWNERSHIP');
}

function makeFixture({ pending = true, activeProject = project } = {}) {
  const state = { nodes: pending ? [{ id: 'pend-A', x: 100, y: 80, parentId: 'reference', linked: true, label: 'Image', inputs: ['reference'], uploading: false, progress: 0 }] : [],
    selectedPendId: pending ? 'pend-A' : null, selectedId: pending ? null : 'original', tasks: [], calls: [], positions: [], history: [], completed: [], errors: [], notices: [],
    works: [structuredClone(original), structuredClone(reference)], prompt: 'A frozen 【图1】', refs: references(), project: activeProject,
    userUpdates: [], cancelCalls: 0, refundCalls: 0, rawReferenceReads: 0 };
  const receiptStorage=new Map(),sessionStorage={getItem:k=>receiptStorage.get(k)||null,setItem:(k,v)=>receiptStorage.set(k,v),removeItem:k=>{const value=receiptStorage.get(k);if(value)state.completed.push(JSON.parse(value).jobId);receiptStorage.delete(k);},get length(){return receiptStorage.size},key:i=>[...receiptStorage.keys()][i]};
  const refs = { pend: { current: state.nodes }, selectedPend: { current: state.selectedPendId }, selected: { current: state.selectedId },
    account: { current: account }, project: { current: activeProject ? { key: activeProject } : null }, epoch: { current: 1 }, operations: { current: new Set() },
    positions: { current: {} }, sizes: { current: {} }, textNodes: { current: [] }, editTasks: { current: new Map() }, fanoutHistory: { current: new Map() },
    pendingNode: { current: null }, works: { current: state.works }, tasks:{current:state.tasks}, submissions:{current:new Map()}, originalChecks:{current:new Map()} };
  let generation,pendingView;
  if(!baseline){const scope=JSON.stringify([account,workspace,activeProject||'workspace']);generation=helpers.createCanvasGenerationPresentation().bind(scope);pendingView=helpers.createCanvasPendingPresentation().bind(scope);pendingView.set(state.nodes);
   Object.defineProperty(state,'nodes',{get:()=>pendingView.getSnapshot(),set:value=>pendingView.set(value)});
   Object.defineProperty(refs.pend,'current',{get:()=>pendingView.getSnapshot(),set:value=>pendingView.set(value)});
   Object.defineProperty(state,'tasks',{get:()=>generation.getSnapshot().tasks});
   Object.defineProperty(refs.operations,'current',{get:()=>generation.getSnapshot().operations});
   Object.defineProperty(refs.positions,'current',{get:()=>generation.getSnapshot().positions});
  }
  const drafts = new helpers.ImageNodeDraftStore(); let urlSequence = 0;
  const uploads = new helpers.ImageReferenceDraftStore({ createObjectURL: () => `blob:fixture-${++urlSequence}`, revokeObjectURL: () => {} });
  const draftScope = helpers.imageDraftScope(account, null, activeProject, workspace), key = id => helpers.imageDraftKey(draftScope, id);
  const uploadKey = id => JSON.stringify([workspace, key(id)]);
  drafts.write(key(pending ? 'pend-A' : 'original'), { prompt: state.prompt, ratio: '1:1', referenceBindings: state.refs.map(({ key, number, role }) => ({ key, number, role })) });
  uploads.add(uploadKey(pending ? 'pend-A' : 'original'), [{ key: 'upload:second', file: state.refs[1].file }]);
  const setNodes = update => { state.nodes = typeof update === 'function' ? update(state.nodes) : update; refs.pend.current = state.nodes; };
  const setSelectedPend = update => { state.selectedPendId = typeof update === 'function' ? update(state.selectedPendId) : update; refs.selectedPend.current = state.selectedPendId; };
  function render() {
    const selectedDraft = state.selectedPendId || state.selectedId;
    const draft = drafts.read(key(selectedDraft));
    const env = {
      generationPresentation:generation,pendingPresentation:pendingView,batchRunMountedRef:{current:true},
      sessionStorage,
      artworkNodeSize:()=>({width:384,height:384}),livePendingPosition:(id,fallback)=>{const node=state.nodes.find(n=>n.id===id);return node?{x:node.x,y:node.y}:fallback;},
      __ports:{workspace,revision:1,auth:async()=>({}),read:async()=>new Blob(['reference-pixels'],{type:'image/png'})},
      canvasTextDocument:{attachImageResults:async()=>{}},canvasHistory:{consumePending:id=>state.history.push({consumed:id})},projectNavigation:{requestNode:id=>{refs.pendingNode.current=id;}},
      readOnly: false, user: { email: account }, targetEmail: null, activeKey: state.project, active: state.project ? { key: state.project, members: state.works } : null,
      pendNodes: state.nodes, pendNodesRef: refs.pend, selectedPendId: state.selectedPendId, selectedPendIdRef: refs.selectedPend,
      selectedIdRef: refs.selected, selected: state.works.find(item => item.id === state.selectedId),
      editPrompt: state.prompt, generationMode: 'standard', genRatio: '1:1', genResolution: '4K', genQuality: 'medium', genStyle: '', genCount: 1, genModel: 'fixture-model',
      imageModels: [], routeImageModel: value => value, composerReferences: state.refs, referenceError: null, dockReferenceState: {}, visibleDockRefs: [reference], extraFiles: [], MAX_TOTAL_IMAGES: 16,
      isNodeLocked: () => false, textNodes: [], textNodesRef: refs.textNodes, generationOperationRef: refs.operations,
      generationTaskPosRef: refs.positions, generationTaskSizeRef: refs.sizes, generationTasks: state.tasks, generationTasksRef:refs.tasks,
      imageSubmissionRef:refs.submissions,originalImageChecksRef:refs.originalChecks,setImageSubmissionEpoch:()=>{},flushImagePrompts:async()=>{if(state.promptSave)await state.promptSave.promise;},
      fanoutHistoryRef: refs.fanoutHistory, editTaskStateRef: refs.editTasks,
      rfRef: { current: { getNode: id => {
        const node = state.nodes.find(item => item.id === id) || state.works.find(item => item.id === id);
        return node ? { id, position: { x: node.x ?? node.canvasX ?? 0, y: node.y ?? node.canvasY ?? 0 } } : undefined;
      }, getNodes: () => state.nodes.map(node => ({ id: node.id, position: { x: node.x, y: node.y } })) } }, rfNodes: [],
      flowNodeSize: () => ({ width: 384, height: 384 }), adaptiveCanvasImageSize: () => ({ width: 384, height: 384 }), X_GAP: 90, NODE_LABEL_H: 32,
      canvasAccountRef: refs.account, activeProjectRef: refs.project, canvasContextEpochRef: refs.epoch,
      currentWorkspace: () => workspace, currentWorkspaceRevision: () => 1, pendingNodeRef: refs.pendingNode, worksRef: refs.works,
      FAITHFUL_REGEN_PROMPT: 'faithful', t: value => value,
      setPendNodes: setNodes, setSelectedPendId: setSelectedPend, setSelectedId: id => { state.selectedId = id; refs.selected.current = id; },
      setGenerationTasks: update => { state.tasks = update(state.tasks); refs.tasks.current=state.tasks; }, setTextNodes: update => { refs.textNodes.current = update(refs.textNodes.current); },
      persistTextNode: async () => {}, setGenError: error => { if (error) state.errors.push(error); }, flashTip: message => state.notices.push(message),
      imageDraft: { ...draft, read: (id, scope = draftScope) => drafts.read(helpers.imageDraftKey(scope, id)),
        seed: (id, patch, scope = draftScope) => drafts.write(helpers.imageDraftKey(scope, id), patch) },
      referenceDraft: { copyTo: (target, source = key(selectedDraft)) => uploads.copy(JSON.stringify([workspace, source]), JSON.stringify([workspace, target])),
        remove: unexpected('background completion clears reference'), clear: unexpected('background completion clears references') },
      readBrowserImage: async () => { state.rawReferenceReads++; return new Blob(['reference-pixels'], { type: 'image/png' }); },
      appendComposerReferences: async (form, list) => {
        for (const item of list) form.append('image', item.file || new File([item.url], item.key + '.png', { type: 'image/png' }));
        form.set('canvasReferences', JSON.stringify(helpers.imageReferenceManifest(list)));
      },
      authHeader: async () => ({}), readJsonSafe: response => response.json(),
      privateFetch: async (url, init) => {
        assert.equal(url, '/api/generate-image'); assert.equal(init.method, 'POST');
        const form = init.body, actionKey = String(form.get('imagegenNodeId'));
        const previous = state.calls.find(call => call.key === actionKey), ack = deferred(), result = deferred();
        const call = { key: actionKey, prompt: String(form.get('prompt')), ratio: form.get('ratio'), resolution: form.get('resolution'),
          images: form.getAll('image'), references: form.get('canvasReferences'), form, ack, result, queries: 0,
          jobId: previous?.jobId || `imagegen-${crypto.randomUUID()}`, recovered: !!previous };
        state.calls.push(call);
        const scopeProject=activeProject||'workspace',operationId=call.jobId.slice('imagegen-'.length),receiptKey='naumi:imagegen-pending:v1:'+JSON.stringify([account,workspace,scopeProject,'node:'+actionKey]);
        sessionStorage.setItem(receiptKey,JSON.stringify({version:1,owner:account,workspace,project:scopeProject,actionKey:'node:'+actionKey,operationId,request:{operationId,variants:1},authorizedCredits:1,confirmationRequired:false,accepted:'accepted',jobId:call.jobId,context:{workspace,projectContext:scopeProject}}));
        await ack.promise;
        if (call.failAck) throw Error('connection lost after durable acceptance');
        return Response.json({ jobId: call.jobId });
      },
      readCanvasGenerationReceipt: async (jobId, headers) => {
        assert.equal(new Headers(headers).get('x-naumi-workspace'), workspace);
        const call = [...state.calls].reverse().find(item => item.jobId === jobId); assert.ok(call);
        call.queries++;
        const data = await call.result.promise;
        return { response: Response.json(data), data };
      },
      privateFetchRaw: async (url, init) => {
        assert.equal(url, '/api/artworks/position');
        const body = JSON.parse(init.body); state.positions.push(body); return Response.json({ ok: true });
      },
      expectJsonOk: response => response.json(), mergeWorks: async ids => state.works.filter(art => ids.includes(art.id)),
      applyServerUser: value => state.userUpdates.push(value), imageOutputWarningText: () => '',
      completeCanvasImagegen: job => state.completed.push(job), consumePendingNodeHistory: id => state.history.push({ consumed: id }),
      pushAddUndo: id => state.history.push({ added: [id] }), pushAddUndoMany: ids => state.history.push({ added: Array.from(ids) }), pushUndo: value => state.history.push(value),
      pendingAttemptKey: (...parts) => parts.join('|'), readPendingAttempt: () => null, updateCanvasImagegenPlacement: unexpected('unused fanout'),
      cancelImagegen: () => { state.cancelCalls++; throw Error('Unexpected cancellation'); }, refund: () => { state.refundCalls++; throw Error('Unexpected refund'); },
    };
    return compile(['rootOf', 'isSuiteBatch', 'projectKey', ...(baseline?['reserveGenerationPosition', 'rememberGenerationDrag']:[]), 'runGen', 'generateSelectedImage',
      ...(baseline ? [] : ['generatePendingImage']), 'generatePend'], env);
  }
  function edit(id, prompt, patch = {}) { drafts.write(key(id), { prompt, ...patch }); state.prompt = prompt; }
  async function acknowledge(call) { call.ack.resolve(); await until(() => call.queries > 0, 'receipt poll ' + call.key); }
  function finish(call, id, attachment, artwork = {}) {
    if(attachment?.applied){const node=state.works.find(art=>art.id===attachment.nodeId);if(node)node.canvasImageVersionId=attachment.versionId;}
    state.works.push({ id, image: '/' + id + '.png', width: 2048, height: 2048, prompt: call.prompt, ...artwork });
    call.result.resolve({ status: 'done', operationStatus: 'succeeded', images: [{ id, url: '/' + id + '.png', width: 2048, height: 2048 }], ...(attachment ? { canvasAttachment: attachment } : {}) });
  }
  return { state, refs, drafts, uploads, key, uploadKey, render, edit, acknowledge, finish };
}

async function pendingOrder(order) {
  const f = makeFixture(), aSubmitted = [], bSubmitted = [];
  const first = f.render(), runA = first.generatePendingImage(() => aSubmitted.push('accepted'));
  await until(() => f.state.calls.length === 1, 'A submit');
  assert.equal(await first.generatePendingImage(), false);
  assert.equal(f.state.calls.length, 1); assert.equal(aSubmitted.length, 0);
  const callA = f.state.calls[0]; await f.acknowledge(callA); assert.equal(aSubmitted.length, 1);
  assert.equal(f.state.nodes[0].generationSubmitted, true);
  f.edit('pend-A', 'B frozen 【图1】', { ratio: '1:1' });
  const runB = f.render().generatePendingImage(() => bSubmitted.push('accepted'));
  await until(() => f.state.calls.length === 2, 'B submit');
  const callB = f.state.calls[1], b = f.state.selectedPendId;
  assert.notEqual(b, 'pend-A'); assert.notEqual(callA.key, callB.key);
  assert.equal(callA.prompt, 'A frozen 【图1】'); assert.equal(callB.prompt, 'B frozen 【图1】');
  assert.equal(callA.resolution, '4K'); assert.equal(callB.resolution, '4K');
  assert.equal(f.state.nodes.find(node => node.id === 'pend-A').generating, true);
  assert.deepEqual(plain(f.state.nodes.find(node => node.id === b).inputs), ['reference']);
  assert.equal(callA.references, callB.references);
  assert.equal(callB.images.length, 2); assert.equal(await callA.images[1].text(), await callB.images[1].text());
  assert.notEqual(f.uploads.read(f.uploadKey('pend-A'))[0].url, f.uploads.read(f.uploadKey(b))[0].url);
  await f.acknowledge(callB); assert.equal(bSubmitted.length, 1);
  f.edit('pend-A', 'A live draft after acceptance'); f.edit(b, 'B live draft after acceptance');
  if (order === 'B_FIRST') {
    f.finish(callB, 'art-B'); assert.equal(await runB, true);
    assert.equal(f.state.selectedId, 'art-B');
    f.edit('art-B', 'newer edited result prompt');
    assert.equal(f.state.nodes.length, 1); assert.equal(f.state.nodes[0].id, 'pend-A');
    f.finish(callA, 'art-A'); assert.equal(await runA, true);
    assert.equal(f.state.selectedId, 'art-B');
    assert.equal(f.drafts.read(f.key('art-B')).prompt, 'newer edited result prompt');
  } else {
    f.finish(callA, 'art-A'); assert.equal(await runA, true);
    assert.equal(f.state.nodes.length, 1); assert.equal(f.state.nodes[0].id, b);
    assert.equal(f.state.selectedPendId, b); assert.equal(f.drafts.read(f.key(b)).prompt, 'B live draft after acceptance');
    f.finish(callB, 'art-B'); assert.equal(await runB, true);
    assert.equal(f.state.selectedId, 'art-B');
    assert.equal(f.drafts.read(f.key('art-B')).prompt, 'B live draft after acceptance');
  }
  assert.equal(f.drafts.read(f.key('art-A')).prompt, 'A live draft after acceptance');
  assert.equal(f.uploads.read(f.uploadKey('art-A')).length, 1); assert.equal(f.uploads.read(f.uploadKey('art-B')).length, 1);
  assert.equal(f.state.nodes.length, 0); assert.equal(f.state.calls.length, 2); assert.equal(f.state.completed.length, 2);
  assert.equal(f.state.cancelCalls, 0); assert.equal(f.state.refundCalls, 0); assert.deepEqual(f.state.errors, []);
  assert.equal(new Set(f.state.positions.map(position => position.x + ':' + position.y)).size, 2);
  assert.equal(f.refs.operations.current.size, 0);
  check('REAL_PENDING_' + order + '_DISTINCT_TASKS_DRAFTS_REFERENCES_AND_COMPLETION_OWNERSHIP');
}

async function acceptedImageRuns() {
  const f = makeFixture({ pending: false }), callback = [];
  const a = f.render().generateSelectedImage(() => callback.push('A'));
  await until(() => f.state.calls.length === 1, 'image A'); const ca = f.state.calls[0]; await f.acknowledge(ca);
  f.edit('original', 'B image prompt');
  const b = f.render().generateSelectedImage(() => callback.push('B'));
  await until(() => f.state.calls.length === 2, 'image B'); const cb = f.state.calls[1]; await f.acknowledge(cb);
  assert.notEqual(ca.key, cb.key); assert.deepEqual(callback, ['A', 'B']); assert.equal(f.state.tasks.length, 2);
  f.edit('original', 'keep this newest draft');
  f.state.works.find(art => art.id === 'original').canvasImageRevision = 4;
  f.state.works.find(art => art.id === 'original').image = '/art-B.png';
  const attachment = { nodeId: 'original', applied: true, previousVersionId: 'initial', previousImage: '/original.png', versionId: 'art-B', revision: 4 };
  f.finish(cb, 'art-B', attachment); await b;
  assert.equal(f.state.tasks.length, 1); assert.equal(f.state.tasks[0].operationKey, ca.key);
  f.finish(ca, 'art-A', { ...attachment, applied: false, versionId: 'art-A', reason: 'changed' }); await a;
  assert.equal(f.state.tasks.length, 0); assert.equal(f.state.completed.length, 2);
  assert.equal(f.drafts.read(f.key('original')).prompt, 'keep this newest draft');
  assert.equal(f.uploads.read(f.uploadKey('original')).length, 1);
  assert.equal(f.state.history.filter(item => item.kind === 'image-version').length, 1);
  assert.equal(f.state.works.find(art => art.id === 'original').image, '/art-B.png');
  assert.equal(f.state.cancelCalls + f.state.refundCalls, 0); assert.deepEqual(f.state.errors, []);
  check('REAL_EXISTING_NODE_RUNS_NEW_IDS_KEEP_DRAFT_AND_USE_CAS_ATTACHMENT_RECEIPTS');
}

async function slowPromptSaveSingleFlight() {
  const f=makeFixture({pending:false}), gate=deferred();f.state.promptSave=gate;
  const first=f.render().generateSelectedImage();await new Promise(setImmediate);
  f.state.selectedId='reference';f.refs.selected.current='reference';f.render();
  f.state.selectedId='original';f.refs.selected.current='original';
  await f.render().generateSelectedImage();assert.equal(f.state.calls.length,0,'saving draft must not dispatch');
  gate.resolve();await until(()=>f.state.calls.length===1,'single action after save');
  const a=f.state.calls[0];await f.acknowledge(a);
  const second=f.render().generateSelectedImage();await until(()=>f.state.calls.length===2,'explicit action after ACK');
  const b=f.state.calls[1];assert.notEqual(a.key,b.key);await f.acknowledge(b);
  for(const [call,id] of [[b,'after-ack-B'],[a,'original-A']]) f.finish(call,id,{nodeId:'original',applied:call===b,previousVersionId:'initial',previousImage:original.image,versionId:id,revision:4,...(call===a?{reason:'changed'}:{})});
  await Promise.all([first,second]);assert.equal(f.refs.submissions.current.size,0);
  check('SLOW_PROMPT_SAVE_RESELECT_A_B_A_SINGLE_POST_UNTIL_ACK_THEN_NEW_ATTEMPT');
}

function supersededAttemptProjection() {
  const rejected={id:'A',sourceId:'original',operationKey:'op-A',replaceNode:true,failure:{kind:'not-started'},onRetry:()=>{}};
  const unknown={id:'U',sourceId:'original',operationKey:'op-U',replaceNode:true,failure:{kind:'unknown'},onRetry:()=>{}};
  const current={id:'B',sourceId:'original',operationKey:'op-B',replaceNode:true};
  const tasks=helpers.beginCanvasImageAttemptTasks([rejected,unknown],[current]);
  assert.equal(helpers.projectCanvasImageAttempts(tasks,'original').current.id,'B');
  const after=tasks.filter(t=>t.id!=='B'),projection=helpers.projectCanvasImageAttempts(after,'original');
  assert.equal(projection.current,undefined);assert.deepEqual(plain(projection.recoverable.map(t=>t.operationKey)),['op-U']);
  const recheck=helpers.beginCanvasImageAttemptTasks(after,[{...unknown,id:'U-recheck',failure:undefined}]);
  assert.equal(helpers.projectCanvasImageAttempts(recheck,'original').current,undefined);
  assert.equal(recheck.find(t=>t.id==='U-recheck').displaySuperseded,true);
  const locks=new Map(),key=helpers.canvasImageSubmissionKey(account,workspace,project,'original');
  const unlock=helpers.beginCanvasImageSubmission(locks,key);assert(unlock);assert.equal(helpers.beginCanvasImageSubmission(locks,key),null);
  unlock();const newer=helpers.beginCanvasImageSubmission(locks,key);assert(newer);assert.equal(unlock(),false);assert(locks.has(key));newer();
  check('NEW_RESULT_NOT_OVERRIDDEN_BY_OLD_FAILURE_UNKNOWN_CHECK_RETAINED_TOKEN_CAS');
}

async function unknownRecovery() {
  const f = makeFixture({ pending: false });
  const a = f.render().generateSelectedImage(); await until(() => f.state.calls.length === 1, 'unknown submit');
  const first = f.state.calls[0]; first.failAck = true; first.ack.resolve(); await a;
  assert.equal(f.state.tasks.length, 1); assert.ok(f.state.tasks[0].failure); assert.equal(f.state.completed.length, 0);
  f.edit('original', 'new draft must not enter old retry');
  const retry = f.state.tasks[0].onRetry(); await until(() => f.state.calls.length === 2, 'old retry');
  const second = f.state.calls[1]; assert.equal(second.key, first.key); assert.equal(second.prompt, first.prompt); assert.equal(second.jobId, first.jobId);
  await f.acknowledge(second);
  f.state.works.find(item => item.id === 'original').canvasImageRevision = 4;
  f.finish(second, 'recovered', { nodeId: 'original', applied: true, previousVersionId: 'initial', previousImage: original.image, versionId: 'recovered', revision: 4 });
  await retry;
  assert.equal(f.state.tasks.length, 0); assert.equal(f.state.cancelCalls + f.state.refundCalls, 0);
  assert.equal(f.drafts.read(f.key('original')).prompt, 'new draft must not enter old retry');
  check('REAL_RUNGEN_UNKNOWN_RETRY_CLOSURE_RETAINS_ORIGINAL_KEY_INPUT_AND_ID');
}

async function pendingUnknownRecovery() {
  const f = makeFixture();
  const firstRun = f.render().generatePendingImage();
  await until(() => f.state.calls.length === 1, 'pending unknown');
  const first = f.state.calls[0]; first.failAck = true; first.ack.resolve();
  assert.equal(await firstRun, false);
  const retained = f.state.nodes.find(node => node.id === 'pend-A');
  assert.ok(retained.generationFailure); assert.equal(typeof retained.onGenerationRetry, 'function');
  f.edit('pend-A', 'new explicit generation after unknown');
  const newRun = f.render().generatePendingImage();
  await until(() => f.state.calls.length === 2, 'new pending after unknown');
  const next = f.state.calls[1], newNode = f.state.selectedPendId;
  assert.notEqual(next.key, first.key); assert.notEqual(next.jobId, first.jobId);
  assert.equal(next.prompt, 'new explicit generation after unknown');
  assert.equal(f.state.nodes.find(node => node.id === 'pend-A').generationFailure, retained.generationFailure);
  await f.acknowledge(next);
  const recovery = retained.onGenerationRetry();
  await until(() => f.state.calls.length === 3, 'recover old pending');
  const recovered = f.state.calls[2];
  assert.equal(recovered.key, first.key); assert.equal(recovered.prompt, first.prompt); assert.equal(recovered.jobId, first.jobId);
  assert.equal(f.state.selectedPendId, newNode);
  await f.acknowledge(recovered);
  f.finish(recovered, 'old-recovered'); assert.equal(await recovery, true);
  assert.equal(f.state.nodes.length, 1); assert.equal(f.state.nodes[0].id, newNode);
  assert.equal(f.state.selectedPendId, newNode);
  f.finish(next, 'new-result'); assert.equal(await newRun, true);
  assert.equal(f.state.selectedId, 'new-result');
  assert.equal(f.state.cancelCalls + f.state.refundCalls, 0);
  check('FAILED_PENDING_NEW_ACTION_FORKS_WHILE_ORIGINAL_RETRY_PRESERVES_UNKNOWN_ID');
}

async function scopeChange() {
  const f = makeFixture(); const run = f.render().generatePendingImage();
  await until(() => f.state.calls.length === 1, 'scope submit'); const call = f.state.calls[0]; await f.acknowledge(call);
  f.refs.project.current = { key: 'tree:other-project' }; f.refs.epoch.current++;
  f.finish(call, 'old-project-art'); assert.equal(await run, false);
  assert.equal(f.state.completed.length, 0); assert.equal(f.state.positions.length, 0);
  assert.equal(f.state.history.length, 0); assert.equal(f.state.cancelCalls + f.state.refundCalls, 0);
  check('ACCEPTED_OLD_SCOPE_RESPONSE_DOES_NOT_ATTACH_OR_CANCEL_IN_NEW_PROJECT');
}

async function emptyCanvasDestinationScope() {
  const f = makeFixture({ activeProject: null });
  f.state.nodes[0].inputs = []; f.state.nodes[0].parentId = null;
  f.state.refs = [{ ...f.state.refs[1], number: 1 }];
  f.edit('pend-A', 'blank canvas frozen 【图1】', { referenceBindings: [{ key: 'upload:second', number: 1, role: 'reference' }] });
  const actions = f.render(), run = actions.generatePendingImage();
  await until(() => f.state.calls.length === 1, 'empty canvas submission');
  const call = f.state.calls[0]; await f.acknowledge(call);
  assert.equal(call.form.get('projectGroupId'), null); assert.equal(call.form.get('parentId'), null);
  f.edit('pend-A', 'new prompt typed while empty-canvas job runs', { ratio: '3:4' });
  // The actual returned group, not result ID or former null scope, determines
  // the project's composer key. Exercise the real projectKey/rootOf functions.
  const artwork = { groupId: 'actual-new-group', parentId: 'original' };
  f.finish(call, 'art-first-in-group', undefined, artwork); assert.equal(await run, true);
  const saved = f.state.works.find(art => art.id === 'art-first-in-group');
  const byId = new Map(f.state.works.map(art => [art.id, art]));
  const destinationProject = actions.projectKey(saved, byId);
  assert.equal(actions.rootOf(saved, byId).id, 'original');
  assert.equal(destinationProject, 'tree:actual-new-group');
  const destinationScope = helpers.imageDraftScope(account, null, destinationProject, workspace);
  const destinationKey = helpers.imageDraftKey(destinationScope, saved.id);
  const destinationDraft = f.drafts.read(destinationKey);
  assert.equal(destinationDraft.prompt, 'new prompt typed while empty-canvas job runs');
  assert.equal(destinationDraft.ratio, '3:4');
  assert.deepEqual(plain(destinationDraft.referenceBindings), [{ key: 'upload:second', number: 1, role: 'reference' }]);
  assert.equal(f.drafts.read(f.key(saved.id)).prompt, undefined, 'result draft is not stranded in the former null project');
  const destinationUploads = f.uploads.read(JSON.stringify([workspace, destinationKey]));
  assert.equal(destinationUploads.length, 1); assert.equal(destinationUploads[0].key, 'upload:second');
  assert.equal(destinationUploads[0].file, f.uploads.read(f.uploadKey('pend-A'))[0].file);
  assert.notEqual(destinationUploads[0].url, f.uploads.read(f.uploadKey('pend-A'))[0].url);
  assert.equal(f.refs.pendingNode.current, saved.id); assert.equal(f.state.selectedId, saved.id);
  assert.equal(f.state.nodes.length, 0); assert.equal(f.state.completed.length, 1);
  assert.equal(f.state.cancelCalls + f.state.refundCalls, 0); assert.deepEqual(f.state.errors, []);
  check('EMPTY_CANVAS_COMPLETION_MOVES_LIVE_DRAFT_AND_UPLOADS_TO_REAL_GROUP_PROJECT_SCOPE');
}

(async () => {
  try {
    if(!baseline){
      for(const file of ['image-runs','image-creation','image-task-controller','image-task-request','image-task-scope','result-attachment','generation-receipt','image-draft-completion'])read(`src/lib/canvas/${file}.ts`);
      read('src/lib/imagegen/client-recovery.ts');process.env.CANVAS_IMAGE_SOURCE_ROOT=root;
      ownerBundle=await require('./verify-canvas-image-task-refactor.cjs').bundle();
    }
    await selectionIdentity();
    if (baseline) {
      const f = makeFixture(); f.state.nodes[0].generating = true;
      assert.equal(await f.render().generatePend({ pend: f.state.nodes[0], prompt: 'changed input' }), false);
      assert.equal(f.state.calls.length, 0); check('BASELINE_RUNNING_PENDING_NODE_REJECTS_EXPLICIT_NEW_GENERATION');
    } else {
      draftIsolation(); await pendingOrder('B_FIRST'); await pendingOrder('A_FIRST');
      await acceptedImageRuns(); supersededAttemptProjection();
      await slowPromptSaveSingleFlight();
      await unknownRecovery(); await pendingUnknownRecovery(); await scopeChange(); await emptyCanvasDestinationScope();
    }
  } catch (error) { errors.push(error.stack || String(error)); }
  const status = errors.length ? 'FAIL' : baseline ? 'REPRODUCED' : 'PASS', exit = errors.length || baseline ? 1 : 0;
  const stdout = `CANVAS_BACKGROUND_RUNS=${status} CHECKS=${checks.length} FAILED=${errors.length} EXTERNAL_CALLS=0 EXIT=${exit}`;
  fs.writeFileSync(path.join(output, baseline ? 'BASELINE.json' : 'MODIFIED.json'), JSON.stringify({ status, checks, errors, loaded: [...loaded.values()], stdout, exit,
    evidence: 'AST-executed real Canvas actions and complete draft/helper modules. Deferred HTTP, React state and attachment responses are fixture boundaries; not provider billing or server CAS acceptance.' }, null, 2));
  console.log(stdout); if (errors.length) console.error(errors.join('\n')); process.exitCode = exit;
})();
