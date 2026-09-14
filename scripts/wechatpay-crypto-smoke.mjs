import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  decryptWechatResource,
  verifyWechatNotifySignature,
} from "../src/lib/pay/wechatpay-crypto.ts";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const timestamp = String(Math.floor(Date.now() / 1000));
const nonce = "local-notify-nonce";
const rawBody = JSON.stringify({ id: "local-notify", event_type: "TRANSACTION.SUCCESS" });
const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
const signature = crypto.sign("RSA-SHA256", Buffer.from(message), privateKey).toString("base64");
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

assert.equal(
  verifyWechatNotifySignature(publicPem, timestamp, nonce, rawBody, signature),
  true,
  "正确回调签名应通过"
);
assert.equal(
  verifyWechatNotifySignature(publicPem, timestamp, nonce, `${rawBody} `, signature),
  false,
  "被篡改的回调体必须拒绝"
);

const apiV3Key = "12345678901234567890123456789012";
const resourceNonce = "notify-nonce";
const associatedData = "transaction";
const plain = JSON.stringify({
  out_trade_no: "LOCAL-ORDER-1",
  transaction_id: "WX-LOCAL-1",
  trade_state: "SUCCESS",
  amount: { total: 199 },
});
const cipher = crypto.createCipheriv(
  "aes-256-gcm",
  Buffer.from(apiV3Key),
  Buffer.from(resourceNonce)
);
cipher.setAAD(Buffer.from(associatedData));
const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
const ciphertext = Buffer.concat([encrypted, cipher.getAuthTag()]).toString("base64");

assert.equal(
  decryptWechatResource(apiV3Key, {
    ciphertext,
    nonce: resourceNonce,
    associated_data: associatedData,
  }),
  plain,
  "合法 resource 应完整解密"
);
assert.throws(
  () =>
    decryptWechatResource(apiV3Key, {
      ciphertext,
      nonce: resourceNonce,
      associated_data: "tampered",
    }),
  undefined,
  "关联数据被篡改时必须拒绝解密"
);

console.log("wechatpay crypto smoke: PASS");
