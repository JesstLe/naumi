import crypto from "crypto";

/** AES-256-GCM 解密微信支付 APIv3 resource。失败时抛出异常。 */
export function decryptWechatResource(
  apiV3Key: string,
  resource: { ciphertext: string; nonce: string; associated_data?: string }
): string {
  const key = Buffer.from(apiV3Key, "utf8");
  if (key.length !== 32) throw new Error("APIv3 密钥必须为 32 字节");
  const cipherBuf = Buffer.from(resource.ciphertext, "base64");
  if (cipherBuf.length <= 16) throw new Error("resource 密文无效");
  const authTag = cipherBuf.subarray(cipherBuf.length - 16);
  const data = cipherBuf.subarray(0, cipherBuf.length - 16);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(resource.nonce, "utf8")
  );
  decipher.setAuthTag(authTag);
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
  }
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}

/** 按微信支付回调规范校验平台证书 RSA-SHA256 签名。 */
export function verifyWechatNotifySignature(
  certificatePem: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
  signature: string
): boolean {
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  try {
    return crypto.verify(
      "RSA-SHA256",
      Buffer.from(message, "utf8"),
      certificatePem,
      Buffer.from(signature, "base64")
    );
  } catch {
    return false;
  }
}
