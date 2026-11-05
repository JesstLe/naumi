# P1-c 模型积分显示生效来源（2026-11-05）

依据：[管理后台评估](../design/admin-architecture-review-20261105.md) A2、U5。基线 main `288bd8f3`。

## 核实结论（更正评估）

- 新模型管理页的积分（`modelCreditView`）本来就走真实报价路径：先 `freezeImagePresetQuote`，否则 `quote(businessBillingSnapshot(...))`。**显示的数字就是实际报价。**
- 实际生效的优先级是：**本页模型积分规则 > 成本预设 > 功能定价 > 价目表规则 > 价目表默认价**。评估初稿写成了"成本预设优先"，已更正。
- 真正的问题在于界面上看不出价格由哪一层决定，在低层修改价格不会生效，管理员也无从察觉。

## 本次实现

- 新增 `creditSource(billing, models, facts, matchedRuleId)`，按报价引擎的同一顺序判断来源层。价目表规则这一层用报价结果自带的 `matchedRuleId` 判断。
- `modelCreditView` 的返回值和价格网格的每一格都带上 `source`。
- 列表卡片的说明从"参考 · 自由生图"改为"标准 1K · 自由生图 · 价目表默认价"，写明是哪个规格、哪个工具、哪个来源。
- "设置模型积分"弹窗显示"当前生效来源：…"。来源不是本页时，补充提示"在此保存后，本页积分设置优先于其他来源"。

## 验证（零外网、零供应商调用）

- 新增 `npm run verify:model-credit-source`：
  - 用单元测试配置走真实报价路径，验证"价目表默认价 → 价目表规则（7 积分）→ 本页规则（9 积分）覆盖 → 清除本页规则后回到价目表规则（7 积分）"；
  - 用 103 的 v117/v8 只读导出做统计：16 个图片模型 × 4 个工具共 64 处，全部为"价目表默认价"（103 当前没有模型积分规则、成本预设或功能定价）。
  - 成本预设和功能定价两层沿用报价引擎自身的选择函数（`selectedImagePreset` / `selectedBusinessOption`），**本轮没有为这两层单独构造测试数据**。
- 回归通过：`verify-model-management-ui`（整页浏览器，含 PRICE_FIXED_MATRIX_RESTORE 等）、`verify-model-management`、tsc、eslint。
- 证据层级：真实报价函数，加隔离数据库的整页浏览器验证；**未发布**。

## 交接

```text
模块与职责：model-config 管理页价格视图（management-pricing.creditSource / modelCreditView / modelCreditGrid）与卡片、积分弹窗展示。
公共接口、依赖方向、数据/状态/事务归属：CreditSource {kind,label}；只读，不改报价和计费数据。
本次实现与迁移状态：完成。旧"价格表/定价测算/功能计费与路由"页面尚未显示来源，留待 P3 导航收敛时一并处理。
验证命令、结果及证据层级：见上；未发布。
未完成项与下一步：为成本预设和功能定价两层补测试数据；P1-d 接入向导。
```
