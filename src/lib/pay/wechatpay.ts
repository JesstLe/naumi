import "server-only";
import crypto from "crypto";
import {
  decryptWechatResource,
  verifyWechatNotifySignature,
} from "./wechatpay-crypto";

// ---------------------------------------------------------------------------
// 原生微信支付 Native v3(扫码支付)对接。全站统一走原生收款。
//
// 严格按微信支付 APIv3 规范(https://pay.weixin.qq.com/docs/merchant/apis):
//  - 请求签名:Authorization 头
//      WECHATPAY2-SHA256-RSA2048 mchid="..",nonce_str="..",timestamp="..",
//      serial_no="<商户证书序列号>",signature="<sign>"
//    签名串 = `METHOD\nURL\ntimestamp\nnonce\nbody\n`,用商户 API 私钥
//    (apiclient_key.pem)RSA-SHA256 签 base64。
//  - 回调:先按 Wechatpay-Serial 获取/刷新平台证书并做 RSA-SHA256 验签，
//    验签通过后再用 APIv3 key 对 resource 做 AES-256-GCM 解密。
// ---------------------------------------------------------------------------

const WXPAY_API_BASE = "https://api.mch.weixin.qq.com";

/** 把商户 API 私钥(apiclient_key.pem)规范成 PEM(已是 PEM 则原样返回)。 */
function toPrivatePem(key: string): string {
  const k = key.trim();
  if (k.includes("-----BEGIN")) return k;
  const body = k.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? k;
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
}

export type WxpayConfig = {
  mchid: string;
  apiV3Key: string; // APIv3 密钥(32 字节字符串),用于回调 AES-GCM 解密
  privateKey: string; // 商户 API 私钥 apiclient_key.pem(PEM 文本)
  certSerial: string; // 商户证书序列号
  appid: string; // Native 下单绑定的公众号/小程序 appid
};

/** 生成 APIv3 请求所需的 Authorization 头(对给定 method/url/body 签名)。 */
function buildAuthorization(
  cfg: WxpayConfig,
  method: string,
  urlPath: string,
  body: string
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(16).toString("hex");
  // 签名串:METHOD\nURL\ntimestamp\nnonce\nbody\n
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(message, "utf8")
    .sign(toPrivatePem(cfg.privateKey), "base64");
  return (
    `WECHATPAY2-SHA256-RSA2048 ` +
    `mchid="${cfg.mchid}",` +
    `nonce_str="${nonceStr}",` +
    `timestamp="${timestamp}",` +
    `serial_no="${cfg.certSerial}",` +
    `signature="${signature}"`
  );
}

export type WxNativePrecreateInput = {
  outTradeNo: string;
  totalFen: number; // 分
  description: string;
  notifyUrl: string;
};

export type WxNativePrecreateResult = {
  ok: boolean;
  codeUrl?: string; // code_url,前端渲染成二维码(weixin:// 开头)
  error?: string;
};

/**
 * POST /v3/pay/transactions/native —— 下单拿 code_url。
 */
export async function wechatNativePrecreate(
  cfg: WxpayConfig,
  input: WxNativePrecreateInput
): Promise<WxNativePrecreateResult> {
  const urlPath = "/v3/pay/transactions/native";
  const payload = {
    appid: cfg.appid,
    mchid: cfg.mchid,
    description: input.description,
    out_trade_no: input.outTradeNo,
    notify_url: input.notifyUrl,
    amount: { total: input.totalFen, currency: "CNY" },
  };
  const body = JSON.stringify(payload);
  const auth = buildAuthorization(cfg, "POST", urlPath, body);

  const r = await fetch(`${WXPAY_API_BASE}${urlPath}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "naumi-native-pay",
    },
    body,
    cache: "no-store",
  });
  const data = (await r.json().catch(() => null)) as
    | { code_url?: string; code?: string; message?: string }
    | null;
  if (r.status === 200 && data?.code_url) {
    return { ok: true, codeUrl: data.code_url };
  }
  return { ok: false, error: data?.message || "微信下单失败" };
}

export type WxNotifyDecrypted = {
  ok: boolean;
  outTradeNo?: string;
  transactionId?: string;
  tradeState?: string;
  totalFen?: number; // amount.total
  error?: string;
};

type PlatformCertificate = {
  serial: string;
  pem: string;
  effectiveAt: number;
  expiresAt: number;
  cachedAt: number;
};

const PLATFORM_CERTIFICATES = new Map<string, PlatformCertificate>();
const CERT_CACHE_TTL = 12 * 60 * 60 * 1000;

async function refreshPlatformCertificates(cfg: WxpayConfig): Promise<void> {
  const urlPath = "/v3/certificates";
  const response = await fetch(`${WXPAY_API_BASE}${urlPath}`, {
    method: "GET",
    headers: {
      Authorization: buildAuthorization(cfg, "GET", urlPath, ""),
      Accept: "application/json",
      "User-Agent": "naumi-native-pay",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`平台证书获取失败 ${response.status}: ${raw.slice(0, 300)}`);
  }
  const parsed = JSON.parse(raw) as {
    data?: {
      serial_no?: string;
      effective_time?: string;
      expire_time?: string;
      encrypt_certificate?: {
        ciphertext?: string;
        nonce?: string;
        associated_data?: string;
      };
    }[];
  };
  const now = Date.now();
  let added = 0;
  for (const item of parsed.data ?? []) {
    const encrypted = item.encrypt_certificate;
    if (!item.serial_no || !encrypted?.ciphertext || !encrypted.nonce) continue;
    const pem = decryptWechatResource(cfg.apiV3Key, {
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      associated_data: encrypted.associated_data,
    });
    const effectiveAt = Date.parse(item.effective_time ?? "");
    const expiresAt = Date.parse(item.expire_time ?? "");
    PLATFORM_CERTIFICATES.set(`${cfg.mchid}:${item.serial_no.toUpperCase()}`, {
      serial: item.serial_no.toUpperCase(),
      pem,
      effectiveAt: Number.isFinite(effectiveAt) ? effectiveAt : 0,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : now + CERT_CACHE_TTL,
      cachedAt: now,
    });
    added++;
  }
  if (added === 0) throw new Error("平台证书接口未返回可用证书");
}

async function getPlatformCertificate(
  cfg: WxpayConfig,
  serial: string,
  forceRefresh = false
): Promise<PlatformCertificate | null> {
  const key = `${cfg.mchid}:${serial.toUpperCase()}`;
  const now = Date.now();
  const cached = PLATFORM_CERTIFICATES.get(key);
  if (
    !forceRefresh &&
    cached &&
    now >= cached.effectiveAt &&
    now < cached.expiresAt &&
    now - cached.cachedAt < CERT_CACHE_TTL
  ) {
    return cached;
  }
  await refreshPlatformCertificates(cfg);
  const refreshed = PLATFORM_CERTIFICATES.get(key) ?? null;
  if (
    refreshed &&
    now >= refreshed.effectiveAt &&
    now < refreshed.expiresAt
  ) {
    return refreshed;
  }
  return null;
}

/**
 * 验签 + 解密微信回调。
 *  ① 校验回调必需头、时间戳与平台证书序列号。
 *  ② 拉取并缓存微信支付平台证书，按证书序列号做 RSA-SHA256 验签。
 *  ③ 验签通过后才用 APIv3 key 对 resource 做 AES-256-GCM 解密。
 */
export async function verifyAndDecryptWxNotify(
  cfg: WxpayConfig,
  headers: Headers,
  rawBody: string
): Promise<WxNotifyDecrypted> {
  if (Buffer.byteLength(cfg.apiV3Key, "utf8") !== 32) {
    return { ok: false, error: "APIv3 密钥必须为 32 字节" };
  }
  const timestamp = headers.get("Wechatpay-Timestamp") ?? "";
  const nonce = headers.get("Wechatpay-Nonce") ?? "";
  const signature = headers.get("Wechatpay-Signature") ?? "";
  const serial = headers.get("Wechatpay-Serial") ?? "";
  if (!timestamp || !nonce || !signature || !serial) {
    return { ok: false, error: "回调缺少微信支付验签头" };
  }
  const timestampSeconds = Number(timestamp);
  if (
    !Number.isFinite(timestampSeconds) ||
    Math.abs(Date.now() - timestampSeconds * 1000) > 10 * 60 * 1000
  ) {
    return { ok: false, error: "回调时间戳无效或已过期" };
  }
  try {
    let certificate = await getPlatformCertificate(cfg, serial);
    let verified =
      !!certificate &&
      verifyWechatNotifySignature(
        certificate.pem,
        timestamp,
        nonce,
        rawBody,
        signature
      );
    if (!verified) {
      certificate = await getPlatformCertificate(cfg, serial, true);
      verified =
        !!certificate &&
        verifyWechatNotifySignature(
          certificate.pem,
          timestamp,
          nonce,
          rawBody,
          signature
        );
    }
    if (!verified) return { ok: false, error: "微信支付回调签名无效" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "平台证书校验失败",
    };
  }
  let parsed: {
    resource?: {
      ciphertext?: string;
      nonce?: string;
      associated_data?: string;
    };
  };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: "回调体解析失败" };
  }
  const res = parsed.resource;
  if (!res?.ciphertext || !res.nonce) {
    return { ok: false, error: "回调缺少 resource" };
  }
  let plain: string;
  try {
    plain = decryptWechatResource(cfg.apiV3Key, {
      ciphertext: res.ciphertext,
      nonce: res.nonce,
      associated_data: res.associated_data,
    });
  } catch {
    return { ok: false, error: "回调解密失败" };
  }
  let obj: {
    out_trade_no?: string;
    transaction_id?: string;
    trade_state?: string;
    amount?: { total?: number };
  };
  try {
    obj = JSON.parse(plain);
  } catch {
    return { ok: false, error: "解密明文解析失败" };
  }
  return {
    ok: true,
    outTradeNo: obj.out_trade_no,
    transactionId: obj.transaction_id,
    tradeState: obj.trade_state,
    totalFen: obj.amount?.total,
  };
}
