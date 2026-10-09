import assert from "node:assert/strict";
import { createServer } from "node:http";
import { modelEndpointFetch } from "../src/lib/model-config/transport";

async function main() {
  let tunnels = 0;
  const proxy = createServer();
  proxy.on("connect", (request, socket) => {
    tunnels++; assert.equal(request.url, "approved.example:443");
    assert.equal(request.headers.authorization, undefined, "API key must stay inside the TLS tunnel");
    socket.end("HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n");
  });
  await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const before = [process.env.MODEL_CONFIG_PROXY_URL, process.env.MODEL_CONFIG_PROXY_ORIGINS];
  try {
    process.env.MODEL_CONFIG_PROXY_URL = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
    process.env.MODEL_CONFIG_PROXY_ORIGINS = "https://approved.example";
    const transport = modelEndpointFetch("https://approved.example/v1");
    const response = await transport("https://approved.example/v1/models", { headers: { authorization: "Bearer fixture-secret" }, signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 407); assert.equal(tunnels, 1);
    await assert.rejects(transport("https://elsewhere.example/v1/models"), /超出/);
    assert.throws(() => modelEndpointFetch("https://127.0.0.1/v1"), /允许列表/);
    process.env.MODEL_CONFIG_PROXY_ORIGINS = "https://approved.example.evil.test";
    await assert.rejects(modelEndpointFetch("https://approved.example/v1")("https://approved.example/v1/models", { signal: AbortSignal.timeout(500) }));
    assert.equal(tunnels, 1, "origin prefix must not authorize proxying");
    console.log("MODEL_PROXY=PASS EXACT_ORIGIN=PASS TLS_CREDENTIAL_ISOLATION=PASS PRIVATE_ENDPOINT_REJECTED=PASS OTHER_ORIGINS_DIRECT=PASS");
  } finally {
    for (const [index, name] of ["MODEL_CONFIG_PROXY_URL", "MODEL_CONFIG_PROXY_ORIGINS"].entries()) { if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index]; }
    await new Promise<void>(resolve => proxy.close(() => resolve()));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
