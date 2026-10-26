// 配置块状态徽标:已生效(绿)/ 未生效(琥珀)。登录与支付各卡片头部统一用它。
export function ReadyBadge({
  ready,
  className = "",
}: {
  ready: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        ready
          ? "bg-emerald-500/10 text-emerald-600"
          : "bg-amber-500/10 text-amber-600"
      } ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          ready ? "bg-emerald-500" : "bg-amber-500"
        }`}
      />
      {ready ? "已生效" : "未生效"}
    </span>
  );
}

