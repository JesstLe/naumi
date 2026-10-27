// Verify scripts import server-only-guarded modules; stub the guard for Node.
const Module = require("module");
const orig = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  if (request === "server-only") return __dirname + "/server-only-stub.cjs";
  return orig.call(this, request, ...args);
};
