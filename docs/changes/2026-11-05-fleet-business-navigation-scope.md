# Fleet 账户筛选 URL：保留跨站页面归属

## 模块、接口与归属

- 模块：`src/components/admin/business-data/model.ts` 的纯 URL 导航规则。
- 公共接口：`businessNavigation(params, patch, initialView)`；它继续合并最新 URL，不修改输入，不拥有用户、钱包、账本、查询回执或数据库事务。
- 页面归属仍由实际 Next usage page 与 `businessLocalDetail(params, true)` 判断。没有改动旧邮箱详情入口、服务端权限、connector 协议或数据读写。

## 原因与修复

CodeRabbit review `5773744890` 对 `92bc0166` 指出：账户筛选生效时，导航仍把默认 `site=all` 和默认 view 删除。随后刷新得到只有 email 的 URL，服务端将它识别为旧本站详情链接，跨站视图意外变回本站视图。

现在只要合并后的 `next.email` 存在，导航保留显式 site 与 view，包括默认值。清空账户后仍清理默认参数；无账户的导航保持原有紧凑 URL。days=30、page=1 的清理规则、无关参数和原始 URL 对象保持不变。

例如，`?site=all&view=usage&email=...` 切至 90 天后仍携带 `site=all&view=usage`。未进入 fleet dashboard 的原始 `/admin/usage?email=...` 仍由本地详情 owner 处理。

## 正式回归与证据层级

扩展已经接入 `.github/workflows/fleet-business.yml` 的 `scripts/verify-fleet-business-usage-entry.mjs`，不新增工作流或跳过条件。

- 加载实际 `model.ts`、实际 entry helper 和实际 async Next usage page，只在 admin auth 与展示组件边界使用有限 fixture。
- 14 组导航 round trip 覆盖周期、页码、标签、返回默认标签、remote→all、remote/local 站点、增加账户、默认周期/首页，以及 users/orders/ledger/creations 的 entry 默认值。
- 对导航输出重新调用实际页面，检查页面继续选择 fleet、权限检查继续先执行，同时验证参数/账户不变、清除账户及无账户默认清理。原 12 组入口、匿名拒绝和旧 bare-email 行为继续执行。
- 副本模式现在必须从指定副本加载全部三个实际源码文件；缺少 page/helper/model 任一文件就失败，不回落到工作树。
- 可选 `--output-dir` 仅改变证据输出目录；CI 默认路径及既有 artifact upload 无变化。旧一轮证据未覆盖。

本地集中结果：

| 层级 | 命令/输入 | 实际结果 |
| --- | --- | --- |
| 原版反例 | entry verifier `--baseline=92bc0166e8458a949de3ab017767f01a096294da` | 137 项中 36 项失败，exit 1；含真实页面 reload 归属反例 |
| 修改版 | entry verifier，当前实际三个源码文件 | 137/137，exit 0 |
| 既有 UI contract | `node --import tsx scripts/verify-fleet-business-data-ui.ts` | 75/75，exit 0 |
| 全库类型 | `node node_modules/typescript/bin/tsc --noEmit --incremental false` | stdout/stderr 空，exit 0 |
| 现有发布 preparation | `python -B output/fleet-business-data-20261104/deploy103-preparation/verify-preparation.py modified` | verifier exit 0；模板仍在任何 host 调用前 exit 78，部署执行数 0 |

该导航回归不是浏览器、HTTP、PG 或生产验收；本切片没有重跑不受影响的 144 项 PG/HTTP protocol。副本 rollback、原行为恢复、later-edit 零写守卫以及四产物的最终命令、字面输出、哈希与复开结果统一记录在：

`output/fleet-business-navigation-scope-20261105/final/VERIFICATION.txt`

回滚只恢复隔离副本的源码字节，不代表生产 central 支持保留新业务状态后的降级。相关条件风险与待验证矩阵见 [回退兼容性记录](2026-11-05-fleet-business-rollback-compatibility.md)。该记录未实现兼容 gate，未确认可用 rollback image floor。

## 状态与下一步

基线 HEAD 为 `92bc0166`；开工 fresh fetch 的 `origin/main` 为 `ca00b1f125fff1077277c3a3b0cbf5b7df4b34f3`，`HEAD...origin/main` 为 `393 / 0`，主线无未包含提交，本切片没有合并整个重构线到 main。

GitHub 的 core/fleet-business/verify 在原通知 429 与当前 92 均未启动任何 step，官方 annotation 为账户支付/支出门禁；不是测试断言失败。本地结果不替代当前候选的 CI。新提交仍需对应 SHA 的检查和复审；本记录不宣称这些已通过。

未合 main、未发布本切片到 103/47、未执行生产数据迁移或用户验收。103 发布 preparation 保持 HOLD；下一步分别处理 CI 外部门禁、当前提交复审与实际 rollback image 的 retained-state 准入证据。
