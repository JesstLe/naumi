// Offline generation only; never print private keys or credentials to stdout.
import { generateKeyPairSync, randomBytes, createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
const directory = process.argv[2];
if (!directory) throw Error("PRIVATE_OUTPUT_DIRECTORY_REQUIRED");
const out = resolve(directory);
mkdirSync(out, { recursive: true, mode: 0o700 });
const clientSecret = randomBytes(48).toString("base64url"),
  serviceToken = randomBytes(48).toString("base64url");
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
const key = {
  ...privateKey.export({ format: "jwk" }),
  kid: randomBytes(16).toString("hex"),
  alg: "RS256",
  use: "sig",
};
const file = join(out, "identity-secrets.private.json");
writeFileSync(
  file,
  JSON.stringify(
    {
      schemaVersion: 1,
      clientSecret,
      serviceToken,
      serviceTokenSha256: createHash("sha256")
        .update(serviceToken)
        .digest("hex"),
      jwks: { keys: [key] },
    },
    null,
    2,
  ),
  { mode: 0o600, flag: "wx" },
);
console.log("CREATED_PRIVATE_CONFIGURATION " + file);
