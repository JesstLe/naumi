// Existing NOVA claim/license code formats, shared without importing repositories.

// 无歧义字符集(去掉 0/O/1/I/L),NOVA-XXXX-XXXX-XXXX。
const CARD_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randCardCode(): string {
  const seg = () =>
    Array.from(
      { length: 4 },
      () => CARD_CHARSET[Math.floor(Math.random() * CARD_CHARSET.length)]
    ).join("");
  return `NOVA-${seg()}-${seg()}-${seg()}`;
}

// License Key = 5 段,与积分兑换码(4 段)区分。
export function randLicenseKey(): string {
  const seg = () =>
    Array.from(
      { length: 4 },
      () => CARD_CHARSET[Math.floor(Math.random() * CARD_CHARSET.length)]
    ).join("");
  return `NOVA-${seg()}-${seg()}-${seg()}-${seg()}`;
}
