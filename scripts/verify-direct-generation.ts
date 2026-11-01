/** Static ownership/ingress contract. Actual client/PG/billing behavior is covered
 * by the source-bound pricing and native application suites, not this scanner. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
const root = resolve(process.argv[2] || '.'), read = (file: string) => readFileSync(resolve(root, file), 'utf8');
let checks = 0;
function parsed(source: string) { const sf = ts.createSourceFile('contract.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); assert.equal(sf.parseDiagnostics.length, 0, 'source must parse'); return sf; }
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
function noAgentQuoteConsent(source: string) { const sf = parsed(source); assert.equal(collect(sf, node => ts.isPropertyAccessExpression(node) && ['pendingQuotes', 'userConfirmedQuote'].includes(node.name.text)).length, 0, 'cross-turn quote consent/quote pile must not return'); assert.ok(hasCall(source, 'getUser'), 'retain real account/balance lookup'); assert.ok(hasCall(source, 'quoteForRequest'), 'retain server quotation'); }
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
    for (const name of ['generate', 'cutout', 'retouch', 'replicate', 'garment3d', 'tryon', 'suite', 'aplus']) {
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
    console.log(`DIRECT_SUBMISSION=PASS STATIC_CHECKS=${checks} CANVAS=OWNED TOOLBOX=PASS GENCHAT=PASS FROZEN_QUOTE=REUSED OPERATION_ID=RETAINED CREATION_FEE_CONFIRM=0`);
}
catch (error) {
    console.error('DIRECT_SUBMISSION=FAIL ' + (error as Error).message);
    process.exitCode = 1;
}
