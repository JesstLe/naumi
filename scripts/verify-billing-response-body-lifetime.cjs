#!/usr/bin/env node
"use strict";

// Narrow browser/protocol oracle, not full billing/product UI acceptance.
// Executes the actual source statements, with real Playwright Response/Request
// objects and real HTTP. No route interception, response replacement, or retries.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createServer } = require("node:http");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { resolve, join, dirname, relative } = require("node:path");
const { createRequire } = require("node:module");
const { performance } = require("node:perf_hooks");
const ts = require("typescript");
const { chromium, expect } = require("@playwright/test");

const TEST_NAME = "publish preserves the user's frozen price, conflict draft and restore";
const options = { sourceRoot: process.cwd(), out: null };
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (key === "--source-root" && process.argv[i + 1]) options.sourceRoot = process.argv[++i];
  else if (key === "--out" && process.argv[i + 1]) options.out = process.argv[++i];
  else throw new Error(`Unknown/incomplete argument: ${key}`);
}
options.sourceRoot = resolve(options.sourceRoot);
options.out = resolve(options.out || join(options.sourceRoot, "output/billing-response-body-lifetime"));
mkdirSync(options.out, { recursive: true });
const reportPath = join(options.out, "REPORT.json");
const sha256 = value => createHash("sha256").update(value).digest("hex");

function extractSource() {
  const sourcePath = join(options.sourceRoot, "scripts/billing-ui.spec.ts");
  const raw = readFileSync(sourcePath);
  const source = ts.createSourceFile(sourcePath, raw.toString("utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let callback;
  function findTest(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "test" &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === TEST_NAME) {
      callback = node.arguments[1];
    }
    ts.forEachChild(node, findTest);
  }
  findTest(source);
  assert(callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)), "Named billing test callback must exist");
  let selected;
  function findStatements(node) {
    if (ts.isBlock(node)) {
      const statements = [...node.statements];
      const start = statements.findIndex(statement => ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(declaration => declaration.name.getText(source) === "response" &&
          declaration.initializer && /\b(?:u\.waitForResponse|captureBillingResponseBody)\(/.test(declaration.initializer.getText(source))));
      if (start !== -1) {
        let end = -1;
        const identities = new Set();
        for (let index = start; index < statements.length; index++) {
          const text = statements[index].getText(source);
          for (const identity of ["originalId", "quoteId", "jobId"]) {
            if (new RegExp(`\\bexpect\\(${identity}\\)\\.toBeTruthy\\(\\)`).test(text)) identities.add(identity);
          }
          if (identities.size === 3) { end = index; break; }
        }
        assert(end >= start, "All three original business identity assertions must remain in the extracted statements");
        selected = { start: statements[start].getStart(source), end: statements[end].end, statements: end - start + 1 };
      }
    }
    ts.forEachChild(node, findStatements);
  }
  findStatements(callback.body);
  assert(selected, "Actual response-consumption statement range must exist in the named test");
  const snippet = source.text.slice(selected.start, selected.end);
  const js = ts.transpileModule(snippet, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const bindings = {};
  const sources = { "scripts/billing-ui.spec.ts": { sha256: sha256(raw) } };
  let helperSource;
  // Only load the helper when the actual extracted source calls it. The old
  // baseline has no such import/export and must not receive durable buffering.
  if (/\bcaptureBillingResponseBody\(/.test(snippet)) {
    const helperImport = source.statements.find(statement => ts.isImportDeclaration(statement) &&
      statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(element => element.name.text === "captureBillingResponseBody"));
    assert(helperImport && ts.isStringLiteral(helperImport.moduleSpecifier), "Actual helper call must have its actual source import");
    const helperPath = resolve(dirname(sourcePath), helperImport.moduleSpecifier.text + ".ts");
    const helperRaw = readFileSync(helperPath);
    helperSource = helperRaw.toString("utf8");
    const helperJs = ts.transpileModule(helperSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const helperModule = { exports: {} };
    new Function("exports", "require", "module", "__filename", "__dirname", helperJs)(helperModule.exports, createRequire(helperPath), helperModule, helperPath, dirname(helperPath));
    assert.equal(typeof helperModule.exports.captureBillingResponseBody, "function");
    bindings.captureBillingResponseBody = helperModule.exports.captureBillingResponseBody;
    sources[relative(options.sourceRoot, helperPath).replaceAll("\\", "/")] = { sha256: sha256(helperRaw) };
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction("u", "expect", ...Object.keys(bindings), `${js}\nreturn { originalId, quoteId, jobId };`);
  const run = (u, assertions) => execute(u, assertions, ...Object.values(bindings));
  return {
    sourcePath, sourceHash: sha256(raw), snippetHash: sha256(snippet),
    firstLine: source.getLineAndCharacterOfPosition(selected.start).line + 1,
    lastLine: source.getLineAndCharacterOfPosition(selected.end).line + 1,
    statements: selected.statements, snippet, sources, helperSource, run,
  };
}

const configurations = [
  { name: "immediate-after-navigation", clickMode: "after-navigation", bodyDelayMs: 0 },
  { name: "delayed-body-after-navigation", clickMode: "after-navigation", bodyDelayMs: 80 },
  { name: "immediate-native-direct", clickMode: "native-direct", bodyDelayMs: 0 },
  { name: "delayed-body-native-direct", clickMode: "native-direct", bodyDelayMs: 80 },
];

async function main() {
  const extracted = extractSource();
  writeFileSync(join(options.out, "EXTRACTED_SOURCE.ts"), extracted.snippet + "\n");
  if (extracted.helperSource) writeFileSync(join(options.out, "EXTRACTED_HELPER.ts"), extracted.helperSource);
  const report = {
    tier: "real-browser loopback response-body-lifetime oracle; not complete product UI or paid-provider acceptance",
    claimBoundary: "Traces establish only observed local response/body/click/navigation order. A protocol-error suffix does not independently establish the historical CI navigation or its unique cause.",
    sourceRoot: options.sourceRoot, sourcePath: extracted.sourcePath,
    sourceHash: extracted.sourceHash, snippetHash: extracted.snippetHash,
    sources: extracted.sources,
    sourceLines: [extracted.firstLine, extracted.lastLine], sourceStatements: extracted.statements,
    extractedSource: extracted.snippet,
    supplierCalls: 0,
    fixture: { host: "127.0.0.1", price: 6, paidProviderCalls: 0, routeInterception: false, responseReplacement: false,
      clickModes: { "after-navigation": "native Locator.click(), then wait for the real completion navigation before resolving the click port", "native-direct": "unmodified native Locator.click() resolution" } },
    cases: [], cleanup: { browserClosed: false, serverClosed: false },
  };
  const states = new Map();
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const state = states.get(url.searchParams.get("case"));
    if (!state) { response.writeHead(404); response.end("unknown case"); return; }
    state.httpRequests.push({ method: request.method, pathname: url.pathname, atMs: state.now() });
    if (url.pathname === "/fixture") {
      const script = `
        const button = document.querySelector('[data-testid="billing-estimate"]');
        button.addEventListener('click', async () => {
          button.disabled = true;
          const response = await fetch('/api/generate-image?case=' + encodeURIComponent(${JSON.stringify(state.name)}), {
            method: 'POST', headers: {'content-type':'application/json',
              'x-naumi-billing-operation-id': ${JSON.stringify(state.expected.originalId)},
              'x-naumi-image-quote': ${JSON.stringify(state.expected.quoteId)}},
            body: JSON.stringify(${JSON.stringify(state.expected.payload)})
          });
          const accepted = await response.json();
          location.assign('/complete?case=' + encodeURIComponent(${JSON.stringify(state.name)}) + '&job=' + encodeURIComponent(accepted.jobId));
        });`;
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(`<!doctype html><html><head><title>Frozen quote fixture</title></head><body><button data-testid="billing-estimate">6</button><script>${script}</script></body></html>`);
    } else if (url.pathname === "/api/generate-image" && request.method === "POST") {
      const chunks = [];
      request.on("data", chunk => chunks.push(chunk));
      request.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        state.posts.push({ headers: request.headers, raw, payload: JSON.parse(raw), atMs: state.now() });
        state.trace.push({ event: "http-post", atMs: state.now() });
        const body = JSON.stringify(state.expected.accepted);
        response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
        response.flushHeaders();
        const finish = () => { state.trace.push({ event: "http-body-end", atMs: state.now() }); response.end(body.slice(1)); };
        response.write(body.slice(0, 1));
        if (state.bodyDelayMs) setTimeout(finish, state.bodyDelayMs); else finish();
      });
    } else if (url.pathname === "/complete") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end("<!doctype html><title>Complete</title><p>Complete</p>");
    } else { response.writeHead(404); response.end("not found"); }
  });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    report.fixture.origin = `http://127.0.0.1:${server.address().port}`;
    const channel = process.env.BILLING_UI_BROWSER || (process.platform === "win32" ? "msedge" : undefined);
    report.browser = { channel: channel || "chromium", version: null };
    browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
    report.browser.version = browser.version();
    for (const configuration of configurations) {
      const started = performance.now();
      const state = { ...configuration, now: () => +(performance.now() - started).toFixed(3), trace: [], posts: [], httpRequests: [], browserRequests: [],
        expected: { originalId: `lifetime-operation-${configuration.name}`, quoteId: `lifetime-quote-${configuration.name}`,
          jobId: `lifetime-job-${configuration.name}`, payload: { prompt: "Retain this local test prompt", requestedCredits: 6, ratio: "1:1" } } };
      state.expected.accepted = { jobId: state.expected.jobId, status: "queued", requestedCredits: 6 };
      states.set(state.name, state);
      const context = await browser.newContext();
      const page = await context.newPage();
      const nativeResponses = new WeakSet();
      page.on("request", request => state.browserRequests.push({ method: request.method(), url: request.url(), atMs: state.now() }));
      page.on("framenavigated", frame => { if (frame === page.mainFrame()) state.trace.push({ event: "nav", atMs: state.now(), url: frame.url() }); });
      page.on("pageerror", error => state.trace.push({ event: "page-error", atMs: state.now(), message: error.message }));
      page.on("response", response => { if (new URL(response.url()).pathname === "/api/generate-image") { nativeResponses.add(response); state.trace.push({ event: "response", atMs: state.now(), status: response.status(), url: response.url() }); } });
      const originalWaitForResponse = page.waitForResponse.bind(page);
      // The port passes through real Response objects; only native text() calls
      // are observed. Errors propagate unchanged into the actual source snippet.
      const u = {
        context: () => ({
          // Only the actual source helper invokes this port. Supply the real
          // page to real BrowserContext.newCDPSession, not the observed wrapper.
          newCDPSession: async candidate => {
            assert.equal(candidate, u, "Source helper must observe this same page");
            const session = await context.newCDPSession(page);
            state.trace.push({ event: "cdp-session-created", atMs: state.now() });
            const send = session.send.bind(session), detach = session.detach.bind(session);
            session.send = async (method, parameters) => {
              state.trace.push({ event: "cdp-send", method, parameters, atMs: state.now() });
              try {
                const result = await send(method, parameters);
                state.trace.push({ event: "cdp-send-done", method, atMs: state.now() });
                return result;
              } catch (error) {
                state.trace.push({ event: "cdp-send-error", method, atMs: state.now(), message: error.message });
                throw error;
              }
            };
            session.detach = async () => { await detach(); state.trace.push({ event: "cdp-session-detached", atMs: state.now() }); };
            return session;
          },
        }),
        waitForResponse: (...args) => originalWaitForResponse(...args).then(response => {
          assert(nativeResponses.has(response), "Must retain the identical native Response emitted by Playwright page");
          const text = response.text.bind(response);
          response.text = async (...textArgs) => {
            state.trace.push({ event: "body-start", atMs: state.now() });
            try {
              const value = await text(...textArgs);
              state.responseText = value;
              state.trace.push({ event: "body-done", atMs: state.now(), bytes: Buffer.byteLength(value), sha256: sha256(value) });
              return value;
            } catch (error) {
              state.trace.push({ event: "body-error", atMs: state.now(), name: error.name, message: error.message });
              throw error;
            }
          };
          return response;
        }),
        getByTestId: (...args) => {
          const locator = page.getByTestId(...args);
          const click = locator.click.bind(locator);
          locator.click = async (...clickArgs) => {
            state.trace.push({ event: "click-start", atMs: state.now() });
            await click(...clickArgs);
            state.trace.push({ event: "native-click-done", atMs: state.now() });
            if (state.clickMode === "after-navigation") await page.waitForURL(url => url.pathname === "/complete", { waitUntil: "load" });
            state.trace.push({ event: "click-done", atMs: state.now() });
          };
          return locator;
        },
      };
      let caught;
      try {
        await page.goto(`${report.fixture.origin}/fixture?case=${encodeURIComponent(state.name)}`);
        state.actual = await extracted.run(u, expect);
      } catch (error) { caught = error; }
      // Complete the one existing request/navigation; never submit a second POST.
      try {
        await page.waitForURL(url => url.pathname === "/complete", { waitUntil: "load" });
        assert.equal(state.posts.length, 1, "Exactly one real loopback POST; no paid replay");
        assert.equal(state.browserRequests.filter(request => request.method === "POST").length, 1);
        assert(state.browserRequests.every(request => new URL(request.url).origin === report.fixture.origin), "Every browser request stays on the owned loopback fixture");
        const post = state.posts[0];
        assert.equal(post.headers["x-naumi-billing-operation-id"], state.expected.originalId);
        assert.equal(post.headers["x-naumi-image-quote"], state.expected.quoteId);
        assert.deepEqual(post.payload, state.expected.payload);
        assert.equal(new URL(page.url()).searchParams.get("job"), state.expected.jobId);
        assert.equal(state.trace.find(event => event.event === "response").status, 200);
        assert(!state.trace.some(event => event.event === "page-error"), "Fixture browser must consume its real accepted JSON without errors");
        state.transportChecks = { singleLoopbackPOST: true, originalOperationHeader: true, frozenQuoteHeader: true,
          requestPayload: true, requestedCredits: 6, acceptedJobNavigation: true, status200: true, supplierCalls: 0, noPaidReplay: true };
        if (!caught) {
          assert.deepEqual(state.actual, { originalId: state.expected.originalId, quoteId: state.expected.quoteId, jobId: state.expected.jobId });
          assert.deepEqual(JSON.parse(state.responseText), state.expected.accepted);
        }
      } catch (error) { if (!caught) caught = error; else state.validationError = { name: error.name, message: error.message, stack: error.stack }; }
      finally { await context.close(); }
      const { now, ...serializable } = state;
      report.cases.push({ ...serializable, pass: !caught && !state.validationError, postCount: state.posts.length,
        error: caught ? { name: caught.name, message: caught.message, stack: caught.stack } : null });
    }
  } catch (error) {
    report.harnessError = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    try { if (browser) { await browser.close(); report.cleanup.browserClosed = true; } }
    finally { await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }); report.cleanup.serverClosed = true; }
    report.totalPosts = report.cases.reduce((sum, item) => sum + item.postCount, 0);
    report.fixtureHTTPPosts = report.totalPosts;
    report.pass = report.cases.length === configurations.length && report.cases.every(item => item.pass) && !report.harnessError && report.cleanup.browserClosed && report.cleanup.serverClosed;
    report.status = report.pass ? "PASS" : "FAIL";
    report.stdout = `BILLING_RESPONSE_BODY_LIFETIME=${report.status} CASES=${report.cases.length} REAL_BROWSER=${report.browser?.version ? 1 : 0} FIXTURE_HTTP_POSTS=${report.fixtureHTTPPosts} SUPPLIER_CALLS=${report.supplierCalls}`;
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    // Reopen generated evidence before claiming its durable path.
    const persisted = JSON.parse(readFileSync(reportPath, "utf8"));
    writeFileSync(join(options.out, "STDOUT.txt"), persisted.stdout + "\n");
    console.log(persisted.stdout);
    process.exitCode = persisted.pass ? 0 : 1;
  }
}

main().catch(error => {
  writeFileSync(join(options.out, "HARNESS_ERROR.txt"), error.stack + "\n");
  console.error(error.stack);
  process.exitCode = 1;
});
