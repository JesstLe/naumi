/** Static ownership/ingress contract. Actual client/PG/billing behavior is covered
 * by the source-bound pricing and native application suites, not this scanner. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
const root = resolve(process.argv[2] || '.'), read = (file: string) => readFileSync(resolve(root, file), 'utf8');
let checks = 0;
function parsed(source: string) { const diagnostics = ts.transpileModule(source, { fileName: 'contract.tsx', reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve } }).diagnostics; assert.equal(diagnostics?.length ?? 0, 0, 'source must parse'); return ts.createSourceFile('contract.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
function collect(scope: ts.Node, test: (node: ts.Node) => boolean) { const rows: ts.Node[] = []; const visit = (node: ts.Node) => { if (test(node))
    rows.push(node); ts.forEachChild(node, visit); }; visit(scope); return rows; }
function noFeeConfirmation(source: string) { const sf = parsed(source); assert.equal(collect(sf, node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(sf) === 'window' && node.expression.name.text === 'confirm').length, 0, 'creation billing must not request a second fee confirmation'); }
function frozenQuoteSubmission(source: string) {
    const sf = parsed(source), declarations = collect(sf, node => ts.isVariableDeclaration(node) && node.name.getText(sf) === 'quoteAndSubmit') as ts.VariableDeclaration[];
    assert.equal(declarations.length, 1, 'one quoteAndSubmit owner');
    const callback = declarations[0].initializer;
    assert.ok(callback && ts.isCallExpression(callback));
    const fn = callback.arguments[0];
    assert.ok(ts.isArrowFunction(fn));
    const quote = collect(fn, node => ts.isVariableDeclaration(node) && !!node.initializer && ts.isAwaitExpression(node.initializer) && ts.isCallExpression(node.initializer.expression) && node.initializer.expression.expression.getText(sf) === 'getQuote') as ts.VariableDeclaration[];
    assert.equal(quote.length, 1, 'one server quote preparation');
    const quoteName = quote[0].name.getText(sf);
    const returns = collect(fn, node => ts.isReturnStatement(node) && !!node.expression && ts.isCallExpression(node.expression) && node.expression.expression.getText(sf) === 'submit') as ts.ReturnStatement[];
    assert.equal(returns.length, 1, 'submit original quote once');
    const call = returns[0].expression as ts.CallExpression;
    assert.equal(call.arguments[2]?.getText(sf), quoteName, 'server quote must reach submission unchanged');
    assert.equal(call.arguments[3]?.getText(sf), fn.parameters[3]?.name.getText(sf), 'preserve identity/scope guard through paid submission');
    const versionReads = collect(fn, node => ts.isBinaryExpression(node) && node.getText(sf).includes(quoteName + '.version') && node.getText(sf).includes('catalog.version'));
    assert.equal(versionReads.length, 0, 'current catalogue version must not block a server quote');
}
function hasCall(source: string, name: string) { const sf = parsed(source); return collect(sf, node => ts.isCallExpression(node) && node.expression.getText(sf) === name).length > 0; }
function noAgentQuoteConsent(source: string) {
    const sf=parsed(source);
    assert.equal(collect(sf,node=>ts.isPropertyAccessExpression(node)&&['pendingQuotes','userConfirmedQuote'].includes(node.name.text)).length,0,'cross-turn quote consent/quote pile must not return');
    assert.ok(hasCall(source,'getUser'),'retain real account/balance lookup');
    const quote=importedName(sf,'./quotation','quoteForActor'),owner=sf.statements.filter(ts.isFunctionDeclaration).find(node=>node.name?.text==='agentQuote');assert.ok(owner,'retain Agent quotation owner');
    const calls=collect(owner,node=>ts.isCallExpression(node)&&node.expression.getText(sf)===quote) as ts.CallExpression[];
    assert.equal(calls.length,1,'one typed server quotation');
    assert.equal(calls[0].arguments[0]?.getText(sf),'email','quote uses the authenticated actor');
    assert.equal(calls[0].arguments[3]?.getText(sf),'snapshot','quote retains the original server snapshot');
    assert.equal(collect(sf,node=>ts.isNewExpression(node)&&node.expression.getText(sf)==='Request').length,0,'Agent quotation must not synthesize HTTP authentication');
}
function importedName(sf:ts.SourceFile,module:string,name:string){
    const declarations=sf.statements.filter(ts.isImportDeclaration).filter(node=>ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text===module);
    const names=declarations.flatMap(node=>{const bindings=node.importClause?.namedBindings;return bindings&&ts.isNamedImports(bindings)?bindings.elements.filter(item=>(item.propertyName?.text||item.name.text)===name).map(item=>item.name.text):[];});
    assert.equal(names.length,1,`one actual ${module}:${name} import`);return names[0];
}
function factoryVariable(sf:ts.SourceFile,callee:string){
    const declarations=collect(sf,node=>ts.isVariableDeclaration(node)&&!!node.initializer&&ts.isCallExpression(node.initializer)&&node.initializer.expression.getText(sf)===callee) as ts.VariableDeclaration[];
    assert.equal(declarations.length,1,`one ${callee} binding`);assert.ok(ts.isIdentifier(declarations[0].name));
    return {name:declarations[0].name.text,call:declarations[0].initializer as ts.CallExpression};
}
function generationSessionSubmission(page:string,hook:string,owner:string,client:string){
    const pageFile=parsed(page),hookFile=parsed(hook),ownerFile=parsed(owner),clientFile=parsed(client);
    const pageHook=importedName(pageFile,'./use-generation-session','useGenerationSession');
    const billing= factoryVariable(pageFile,importedName(pageFile,'@/lib/billing/preview','useFeatureBilling'));
    const session=factoryVariable(pageFile,pageHook),configuration=session.call.arguments[0];
    assert.ok(configuration&&ts.isObjectLiteralExpression(configuration),'session receives explicit ports');
    const submit=configuration.properties.find(node=>ts.isPropertyAssignment(node)&&node.name.getText(pageFile)==='submit');
    assert.ok(submit&&ts.isPropertyAssignment(submit));assert.equal(submit.initializer.getText(pageFile),billing.name+'.submit','page passes the original quoted billing port');
    assert.ok(hasCall(page,session.name+'.generate'),'page consumes its bound generation session');
    const ownerFactory=importedName(hookFile,'@/lib/imagegen/generation-session','createGenerationSession');
    assert.equal(collect(hookFile,node=>ts.isCallExpression(node)&&node.expression.getText(hookFile)===ownerFactory).length,1,'hook creates the actual session owner');
    const ownerExports=ownerFile.statements.filter(ts.isFunctionDeclaration).filter(node=>node.name?.text==='createGenerationSession');
    assert.equal(ownerExports.length,1,'session import resolves to its actual exported factory');
    const adapters=collect(hookFile,node=>ts.isPropertyAssignment(node)&&node.name.getText(hookFile)==='submit'&&ts.isArrowFunction(node.initializer)&&ts.isCallExpression(node.initializer.body)&&node.initializer.body.expression.getText(hookFile)==='submit') as ts.PropertyAssignment[];
    assert.equal(adapters.length,1,'one session-to-transport submit adapter');
    const adapter=adapters[0].initializer as ts.ArrowFunction,forward=adapter.body as ts.CallExpression;
    assert.equal(forward.arguments[3]?.getText(hookFile),'input.submit','adapter retains the injected quoted port');
    assert.equal(forward.arguments[2]?.getText(hookFile),adapter.parameters[2]?.name.getText(hookFile),'adapter retains the owner identity guard');
    const transport=hookFile.statements.filter(ts.isFunctionDeclaration).find(node=>node.name?.text==='submit');assert.ok(transport);
    const sends=collect(transport,node=>ts.isCallExpression(node)&&node.expression.getText(hookFile)==='send') as ts.CallExpression[];
    assert.equal(sends.length,1,'one quoted transport call');
    const endpoint=sends[0].arguments[0];assert.ok(endpoint&&ts.isStringLiteral(endpoint));
    assert.equal(endpoint.text,'/api/generate-image','original public endpoint retained');
    assert.equal(sends[0].arguments[2]?.getText(hookFile),transport.parameters[2]?.name.getText(hookFile),'scope guard reaches billing after async intent hashing');
    const paid=collect(ownerExports[0],node=>ts.isCallExpression(node)&&node.expression.getText(ownerFile)==='context.submit') as ts.CallExpression[];
    assert.equal(paid.length,1,'one owner submission');
    const guard=paid[0].arguments[2];assert.ok(guard&&ts.isIdentifier(guard));
    const declarations=collect(ownerExports[0],node=>ts.isVariableDeclaration(node)&&node.name.getText(ownerFile)===guard.text) as ts.VariableDeclaration[];
    assert.equal(declarations.length,1);assert.ok(declarations[0].initializer&&ts.isArrowFunction(declarations[0].initializer));
    assert.ok(collect(declarations[0].initializer,node=>ts.isCallExpression(node)&&node.expression.getText(ownerFile)==='owns').length,'guard checks current session ownership');
    assert.ok(collect(declarations[0].initializer,ts.isThrowStatement).length,'detached identity stops the not-yet-sent request');
    const estimate=clientFile.statements.filter(ts.isFunctionDeclaration).find(node=>node.name?.text==='useBillingEstimate');assert.ok(estimate);
    const estimates=collect(estimate,node=>ts.isPropertyAssignment(node)&&node.name.getText(clientFile)==='submit'&&ts.isArrowFunction(node.initializer)) as ts.PropertyAssignment[];
    assert.equal(estimates.length,1);const facade=estimates[0].initializer as ts.ArrowFunction;
    assert.ok(ts.isCallExpression(facade.body));assert.equal(facade.body.expression.getText(clientFile),'billing.submit');
    assert.equal(facade.body.arguments[2]?.getText(clientFile),'current','facade reuses the server quote');
    assert.equal(facade.body.arguments[3]?.getText(clientFile),facade.parameters[2]?.name.getText(clientFile),'facade forwards the guard to the existing billing owner');
    for(const source of [page,hook,owner])noFeeConfirmation(source);
}
try {
    for (const source of ['function fixed(){return window.confirm("fee");}', 'function cost(q){if(q.mode==="api-cost-plus")return window.confirm("cap");}', 'function later(q){register(()=>window.confirm("fee"));}']) {
        assert.throws(() => noFeeConfirmation(source));
        checks++;
    }
    noFeeConfirmation('function fixed(){return submit();}');
    checks++;
    const client = read('src/lib/billing/client.tsx');
    noFeeConfirmation(client);
    frozenQuoteSubmission(client);
    checks++;
    const returned = 'return submit(url, init, q, beforeSubmit);';
    assert.ok(client.includes(returned));
    for (const replacement of ['if(q.version!==catalog.version)throw Error("changed");' + returned, 'return submit(url, init, {...q, version:catalog.version}, beforeSubmit);', 'return submit(url, init, q);']) {
        assert.throws(() => frozenQuoteSubmission(client.replace(returned, replacement)));
        checks++;
    }
    for (const header of ['x-naumi-image-quote', 'x-naumi-billing-version', 'x-naumi-billing-credits', 'x-naumi-billing-operation-id']) {
        assert.ok(client.includes(header), 'missing retained quote/operation metadata ' + header);
        checks++;
    }
    const canvas = read('src/components/canvas/canvas-client.tsx');
    assert.ok(hasCall(canvas, 'submitCanvasCreationRequest') && hasCall(canvas, 'billing.submit'), 'Canvas typed creation owner and billing port must remain wired');
    checks++;
    const genchat = read('src/components/genchat/genchat-client.tsx');
    assert.ok(hasCall(genchat, 'billing.quoteAndSubmit'));
    checks++;
    for (const source of [canvas, genchat]) {
        assert.ok(!source.includes('confirmAndSubmit') && !source.includes('提交前确认报价'));
        checks++;
    }
    const generation=read('src/components/generate/generate-client.tsx'),generationHook=read('src/components/generate/use-generation-session.ts'),generationOwner=read('src/lib/imagegen/generation-session.ts');
    generationSessionSubmission(generation,generationHook,generationOwner,client);checks++;
    const aliasPage=generation.replace('import {useGenerationSession}', 'import {useGenerationSession as useOriginalGeneration}').replace('const generation=useGenerationSession(', 'const generation=useOriginalGeneration(');
    generationSessionSubmission(aliasPage,generationHook,generationOwner,client);checks++;
    const aliasHook=generationHook.replace('createGenerationSession,','createGenerationSession as createOriginalSession,').replace('owner.current=createGenerationSession(', 'owner.current=createOriginalSession(');
    generationSessionSubmission(generation,aliasHook,generationOwner,client);checks++;
    for(const [page,hook,owner,billing]of [
        [generation.replace('./use-generation-session','./unrelated-session'),generationHook,generationOwner,client],
        [generation.replace('submit:billing.submit','submit:fetch'),generationHook,generationOwner,client],
        [generation.replace('generation.generate(', 'unrelated.generate('),generationHook,generationOwner,client],
        [generation,generationHook.replace('guard,input.submit','guard,fetch'),generationOwner,client],
        [generation,generationHook.replace('body},beforeSend)', 'body})'),generationOwner,client],
        [generation,generationHook,generationOwner.replace('owner.scope.submitAccount,assertCurrent','owner.scope.submitAccount,()=>{}'),client],
        [generation,generationHook,generationOwner,client.replace('billing.submit(url, init, current, beforeSubmit)','billing.submit(url, init, current)')],
        [generation,generationHook+'\nwindow.confirm("fee");',generationOwner,client],
    ]){assert.throws(()=>generationSessionSubmission(page,hook,owner,billing));checks++;}
    for (const name of ['cutout', 'retouch', 'replicate', 'garment3d', 'tryon', 'suite', 'aplus']) {
        assert.ok(hasCall(read(`src/components/${name}/${name}-client.tsx`), 'billing.submit'), name + ' quoted direct submission owner missing');
        checks++;
    }
    assert.ok(read('src/components/admin/admin-artworks.tsx').includes('window.confirm'), 'unrelated destructive confirmation must remain');
    checks++;
    const agent = read('src/lib/billing/agent.ts');
    noAgentQuoteConsent(agent);
    checks++;
    assert.throws(() => noAgentQuoteConsent(agent + '\nconst consent=session.userConfirmedQuote;'));
    checks++;
    noAgentQuoteConsent(agent.replace('import {quoteForActor}','import {quoteForActor as originalActorQuote}').replace('await quoteForActor(','await originalActorQuote('));checks++;
    for(const changed of [
        agent.replace('await quoteForActor(','await fabricatedQuote('),
        agent.replace('from "./quotation"','from "./server"'),
        agent.replace('quoteForActor(email,','quoteForActor(cred.cookie,'),
        agent.replace('},undefined,snapshot)','})'),
        agent.replace('    const quantity =','    new Request("http://internal");\n    const quantity ='),
    ]){assert.throws(()=>noAgentQuoteConsent(changed));checks++;}

    console.log(`DIRECT_SUBMISSION=PASS STATIC_CHECKS=${checks} CANVAS=OWNED GENERATION=SESSION_OWNER TOOLBOX=PASS GENCHAT=PASS FROZEN_QUOTE=REUSED OPERATION_ID=RETAINED CREATION_FEE_CONFIRM=0`);
}
catch (error) {
    console.error('DIRECT_SUBMISSION=FAIL ' + (error as Error).message);
    process.exitCode = 1;
}
