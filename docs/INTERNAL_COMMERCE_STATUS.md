# 内测价目与功能开放状态

更新时间：2026-10-03

## 统一产品

所有部署统一提供全部产品功能，不再区分 OSS、Pro 或云版，无需授权激活。多用户、兑换码、品牌、用量和部署管理保留管理员权限检查，已有配置和历史订单不删除。旧授权购买商品已停用，旧授权页面跳转部署与更新。

## 内测配置

```env
NAUMI_BETA_PREVIEW=1
NAUMI_IMAGE_QUALITY_SUPPORTED=1
NAUMI_PUBLIC_COMMERCE=0
```

价目入口和 `/plans` 向内测同事开放，首屏列出当前实际测试价：低 4、标准 6、高 10、超高 14、最高 18 积分/张。开启计费时按所选档位和成功张数结算，失败张数不扣，用户自带接口的站内消耗为 0。下方套餐与模型分辨率价目标为待审核参考方案。

全部质量档可选择，按所选参数提交实际通道；上游拒绝参数时使用既有回退并记录执行档位。界面明确提示实验参数效果取决于通道。

公开价目独立于支付订单：充值仍由 `NAUMI_PUBLIC_COMMERCE` 和后台支付配置控制。关闭时 `/checkout` 跳回首页，支付 API 返回 `404`；管理员发放积分与兑换码可继续用于测试。

Docker Compose 修改 `.env` 后需重新创建应用。发布脚本保留生产配置，补齐上述环境绑定，移除旧 edition/license 功能绑定。

## 验证

```powershell
npx tsc --noEmit
npm run build
npx tsx --conditions react-server scripts/verify-quality-billing.ts
npm run verify:image-gateway
npm run verify:credit-billing
npm run verify:single-product
```

数据库验证脚本要求独立本地 PostgreSQL，以及 `NAUMI_VERIFY_ISOLATED_DB=1`。统一产品验收覆盖无需 license 的多用户与后台功能、普通用户权限拒绝、已配置实例的安装锁和旧授权商品下架。
