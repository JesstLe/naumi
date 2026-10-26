function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// In-browser RSA-OAEP(SHA-256) so the key never leaves as plaintext.
// RSA-OAEP(4096) 单块明文上限 ~446B;支付宝/微信「应用私钥·证书」是 1600+ 字符,
// 超限会抛 "data too large" → 分块加密(每块 ≤400B),用 "|" 拼;服务端按块解密拼回。
// 短 key(如 sk-/r8_)只有一块、无 "|",与旧逻辑完全一致,向后兼容。
export async function encryptKey(plain: string, token: string): Promise<string> {
  const res = await fetch("/api/admin/pubkey", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "获取公钥失败");
  const pub = await crypto.subtle.importKey(
    "spki",
    pemToDer(data.pem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  const all = new TextEncoder().encode(plain);
  const CHUNK = 400; // < 446B 安全边界(调用方已保证 plain 非空)
  const parts: string[] = [];
  for (let off = 0; off < all.length; off += CHUNK) {
    const slice = all.slice(off, off + CHUNK);
    const ct = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, slice);
    let bin = "";
    const bytes = new Uint8Array(ct);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    parts.push(btoa(bin));
  }
  return parts.join("|");
}

// 是否安全上下文(HTTPS / localhost)——只有此时浏览器才有 crypto.subtle。
// HTTP 自托管(裸 IP,如 http://1.2.3.4)下 crypto.subtle=undefined,加密字段
// 改走「明文传输 + 服务端 AES 加密落库」:HTTP 本就无 TLS,transit 加密无意义,
// 真正保护的 at-rest 加密仍由服务端完成。
export function hasSubtle(): boolean {
  return typeof window !== "undefined" && !!window.crypto?.subtle;
}

