import http from "node:http";

const port = Number(process.env.PARTIAL_MOCK_PORT || 4010);
const successCount = Math.max(
  0,
  Number(process.env.PARTIAL_SUCCESS_COUNT || 2)
);
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+4GkM9QAAAABJRU5ErkJggg==";
let requests = 0;

const server = http.createServer((request, response) => {
  request.resume();
  request.on("end", () => {
    if (!request.url?.includes("/images/")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "not found" } }));
      return;
    }
    requests += 1;
    if (requests <= successCount) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ created: Date.now(), data: [{ b64_json: png }] }));
      return;
    }
    response.writeHead(500, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: { message: "simulated partial failure", type: "server_error" },
      })
    );
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`partial image API mock listening on ${port}`);
});
