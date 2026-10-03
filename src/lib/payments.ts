import "server-only";
import {
  getCreditPack,
  fmtCredits,
  RMB_PACK_FEN,
} from "@/lib/mock-data";

// RMB charge amounts (分) come from mock-data so the displayed price and the
// amount actually charged share one source of truth — see RMB_PACK_FEN there.
export { RMB_PACK_FEN };

export type ResolvedItem = {
  kind: "pack" | "pro";
  itemId: string;
  title: string;
  credits: number;
  amount: number; // 分
};

// 积分充值包由服务端解析,价格不可被前端篡改。历史授权订单仍保留记录,不再出售。
export function resolveItem(kind: string, itemId: string): ResolvedItem | null {
  if (kind !== "pack") return null;
  const pack = getCreditPack(itemId);
  if (!pack) return null;
  return {
    kind: "pack",
    itemId,
    title: `${fmtCredits(pack.credits)} 积分`,
    credits: pack.credits,
    amount: pack.fen,
  };
}
