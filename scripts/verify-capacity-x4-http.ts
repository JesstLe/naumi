// Run through verify-capacity-x4.cjs: it supplies an allowlisted environment.
// Production modules, HTTP transport, bounded readers, and sharp are real.
// Only the Hub ledger is in-memory via its existing explicit override seam.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const sourceRoot = path.resolve(process.argv[process.argv.indexOf('--source-root') + 1]);
const source = (file: string) => import(pathToFileURL(path.join(sourceRoot, 'src/lib', file)).href);
async function main() {
  const channel = await source('model-config/channel-image-response.ts');
  const hub = await source('model-config/reverse-hub-images.ts');
  const gateway = await source('image-gateway.ts');
  const flow = await source('new-api-image.ts');
  const storage = await source('storage.ts');
  const raw = Buffer.alloc(1024 * 1024 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (Math.imul(i, 73) + (i >>> 10)) & 255;
  const png = await sharp(raw, { raw: { width: 1024, height: 1024, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  const b64 = png.toString('base64');
  assert.ok(png.length > 3 * 1024 * 1024);
  let checks = 0, posts = 0, gets = 0, chat = '', task: any, hubItem: any, record: any;
  const requests: Array<{ path: string; method: string; authorization?: string }> = [];
  const server = createServer(async (req, res) => {
    requests.push({ path: req.url || '', method: req.method || '', authorization: req.headers.authorization });
    const parts = []; for await (const part of req) parts.push(Buffer.from(part));
    const body = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {};
    if (req.url === '/chat/completions') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: chat } }] })); return; }
    if (req.url === '/image.png' || req.url?.endsWith('/artifacts/image.png/content')) { res.setHeader('Content-Type', 'image/png'); res.end(png); return; }
    if (req.url === '/redirect') { res.writeHead(302, { location: '/image.png' }); res.end(); return; }
    if (req.url === '/large') { res.end(Buffer.alloc(32 * 1024 * 1024 + 1)); return; }
    if (req.url === '/tasks' && req.method === 'POST') {
      posts++; task = { id: '22222222-2222-4222-8222-222222222222', operation_id: body.operation_id, model: body.model, state: 'succeeded', result: { data: [hubItem] } };
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(task)); return;
    }
    if (req.url?.startsWith('/tasks/')) { gets++; task.result.data = [hubItem]; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(task)); return; }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const options = { trustedOrigins: [origin] };
  const convert = (item: any) => channel.completedChannelImage(Response.json({ created: 7, data: [item], usage: { fixture: 1 } }), AbortSignal.timeout(10000), options);
  const failure = async (item: any, message: string, stage: string) => {
    await assert.rejects(convert(item), (e: any) => e.message === message && channel.channelImageFailureStage(e) === stage); checks++;
  };
  const exact = async (response: Response) => {
    const data = await response.json(), decoded = Buffer.from(data.data[0].b64_json, 'base64');
    assert.deepEqual(decoded, png);
    assert.deepEqual(await sharp(decoded).raw().toBuffer(), raw);
    const meta = await sharp(decoded).metadata();
    assert.equal(meta.width, 1024); assert.equal(meta.height, 1024); assert.equal(meta.format, 'png'); checks++;
    return data;
  };
  try {
    if (process.argv.includes('--http-stress')) {
      chat = '!['.repeat(524288) + ' ' + origin + '/image.png';
      console.log('X4_HTTP_STRESS=START PREFIX_CHARS=1048576');
      const t = performance.now();
      const image = await flow.generateNewApiImage({ model: 'fixture-flow', prompt: 'fixture', settings: { baseUrl: origin, apiKey: 'x4-fixture' } });
      assert.deepEqual(image.buffer, png);
      assert.deepEqual(await sharp(image.buffer).raw().toBuffer(), raw);
      console.log(JSON.stringify({ result: 'X4_HTTP_STRESS=PASS', ms: +(performance.now() - t).toFixed(3), pngBytes: png.length, pixels: 'exact' }));
      return;
    }
    const data = await exact(await convert({ b64_json: b64, revised_prompt: 'fixture' }));
    assert.equal(data.created, 7); assert.equal(data.data[0].revised_prompt, 'fixture'); assert.deepEqual(data.usage, { fixture: 1 });
    // Node's existing Unicode whitespace decoding quirks stay byte-for-byte:
    // compare full decoded output, not a newly normalized Base64 interpretation.
    for (const w of [' ', '\t', '\n', '\r', '\v', '\f', '\u00a0', '\u1680', '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff']) {
      const value = b64.slice(0, -4) + w + b64.slice(-4);
      const expected = Buffer.from(value, 'base64');
      try {
        const result = await convert({ b64_json: value });
        assert.deepEqual(Buffer.from((await result.json()).data[0].b64_json, 'base64'), expected);
      } catch (e: any) {
        assert.equal(e.message, 'supplier-image-invalid-output');
        assert.equal(channel.channelImageFailureStage(e), 'decode-pixels');
        await assert.rejects(sharp(expected, { failOn: 'error', limitInputPixels: 100_000_000 }).resize(1, 1).raw().toBuffer());
      }
      checks++;
    }
    for (const value of ['', b64 + '!', 'AA=A', 'AA===', 'AA-_', 'AA\u200b', `data:image/png;base64,${b64}`]) await failure({ b64_json: value }, 'supplier-image-missing', 'decode-base64');
    for (const value of [' ', 'A']) await failure({ b64_json: value }, 'supplier-image-size-invalid', 'validate-size');
    for (const value of ['AA=', 'AA==', 'AA\n==']) await failure({ b64_json: value }, 'supplier-image-invalid-output', 'decode-pixels');
    await failure({ b64_json: 'A'.repeat(Math.ceil((32 * 1024 * 1024 + 1) / 3) * 4) }, 'supplier-image-size-invalid', 'validate-size');
    await failure({ url: 'not a URL' }, 'Invalid URL', 'parse-image-url');
    await failure({ url: `data:image/png;base64,${b64}` }, 'supplier-image-download-failed', 'download-image');
    await exact(await convert({ url: origin + '/image.png' }));
    await exact(await convert({ b64_json: b64 + '!', url: origin + '/image.png' }));
    await failure({ url: origin + '/redirect' }, 'supplier-image-download-failed', 'download-image');
    await failure({ url: origin + '/large' }, 'supplier-image-download-failed', 'download-image');
    const beforeUntrusted = requests.length;
    await assert.rejects(channel.completedChannelImage(Response.json({ data: [{ url: origin + '/image.png' }] }), AbortSignal.timeout(10000), {}), /supplier-image-download-failed/);
    assert.equal(requests.length, beforeUntrusted); checks++;
    const largeBody = new Response(new ReadableStream({ start(c) { for (let i = 0; i < 49; i++) c.enqueue(new Uint8Array(1024 * 1024)); c.close(); } }));
    await assert.rejects(channel.completedChannelImage(largeBody, AbortSignal.timeout(10000), {}), (e: any) => e.message === 'receipt too large' && channel.channelImageFailureStage(e) === 'read-response'); checks++;
    const inline = storage.dataUrlToBytes(`data:image/png;base64,${b64}`);
    assert.equal(inline.contentType, 'image/png'); assert.deepEqual(Buffer.from(inline.bytes), png); checks++;
    for (const invalid of ['', 'https://example.invalid/a', 'data:;base64,AA==', 'data:image/png;charset=utf8;base64,AA==', 'data:image/png;base64,A', 'data:image/png;base64,AA=A', 'data:image/png;base64,AA\u202f==']) { assert.equal(storage.dataUrlToBytes(invalid), null); checks++; }
    chat = `![first](${origin}/image.png) https://ignored.invalid/no-network`;
    let image = await flow.generateNewApiImage({ model: 'fixture-flow', prompt: 'fixture', settings: { baseUrl: origin, apiKey: 'x4-fixture' } });
    assert.deepEqual(image.buffer, png); assert.equal(image.contentType, 'image/png'); checks++;
    chat = `data:image/png;base64,${b64}`;
    image = await flow.generateNewApiImage({ model: 'fixture-flow', prompt: 'fixture', settings: { baseUrl: origin, apiKey: 'x4-fixture' } });
    assert.deepEqual(image.buffer, png); checks++;
    const scope: any = {
      connection: { providerId: 'x4-fixture', protocol: 'openai-images', baseUrl: origin, apiKey: 'x4-fixture', wireModel: 'jimeng/jimeng-image-5.0-pro', timeoutMs: 10000, options: { imageAdapter: 'reverse-hub' } },
      frozen: { publicModelId: 'fixture-hub', modelVersion: 1, facts: { resolution: '1K', ratio: '1:1' } },
      capabilities: { maxReferenceImages: 10 }, parameterMap: {},
    };
    const ledger: any = {
      account: async () => {}, begin: async () => record ||= { id: 'x4-call', parameters: null },
      apply: async (_id: string, receipt: any) => { record.task_id ||= receipt.taskId; record.state = receipt.state; },
      pool: { query: async (sql: string, args: any[]) => {
        if (sql.startsWith('SELECT')) return { rows: [record] };
        if (sql.includes('parameters=$2') && !record.parameters) record.parameters = JSON.parse(args[1]);
        else if (sql.includes('parameters=parameters')) Object.assign(record.parameters, JSON.parse(args[1]));
        return { rowCount: 1 };
      } },
    };
    const adapter = hub.reverseHubImageFetch(scope, options, { ledger, context: { operationId: 'x4-op', feature: 'canvas.image', phase: 'generation' }, pollMs: 0 });
    const run = () => gateway.withImageOperation('fixture-hub', { id: 'x4-op' }, () => adapter(origin + '/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'fixture', n: 1 }) }));
    hubItem = { b64_json: b64 }; await exact(await run()); await exact(await run());
    assert.equal(posts, 1); assert.equal(gets, 1); assert.equal(record.parameters.acceptedOutputs, 1); checks++;
    hubItem = { artifact: 'image.png' }; await exact(await run());
    for (const [item, message] of [[{ b64_json: b64 + '!' }, 'reverse-hub-artifact-missing'], [{ b64_json: ' ' }, 'reverse-hub-image-size-invalid'], [{ b64_json: 'A'.repeat(Math.ceil((32 * 1024 * 1024 + 1) / 3) * 4) }, 'reverse-hub-image-size-invalid'], [{ artifact: '../escape', url: origin + '/image.png' }, 'reverse-hub-artifact-missing']]) {
      hubItem = item;
      await assert.rejects(run(), (e: any) => e instanceof gateway.ImageOperationPending && e.operationId === 'x4-op' && e.cause?.message === message); checks++;
    }
    assert.equal(posts, 1); assert.ok(requests.filter(r => r.path === '/image.png').every(r => !r.authorization));
    assert.ok(requests.filter(r => r.path.startsWith('/tasks')).every(r => r.authorization === 'Bearer x4-fixture')); checks++;
    console.log(JSON.stringify({ result: 'X4_HTTP=PASS', checks, pngBytes: png.length, base64Chars: b64.length, sha256: createHash('sha256').update(png).digest('hex'), pixels: '1024x1024 RGB exact', hubPosts: posts, recoveredGets: gets, ledger: 'in-memory fixture', dbConnections: 0 }));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    console.log('X4_HTTP_SERVER=CLOSED');
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
