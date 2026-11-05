# P2-3 模型管理接口按职责拆分（2026-11-05）

依据：[管理后台评估](../design/admin-architecture-review-20261105.md) A3。基线 main `1c0781b7`。

## 问题

`src/lib/model-config/management-access.ts`（33.9KB）的一个闭包里塞了：输入协议、进程内排队与跨进程咨询锁、页面读取视图（GET）、20 多个操作的配置变更规则，以及回执、加锁、发布、响应的编排。改任何一个操作，都要在这个大闭包里找位置。

## 本次实现（只搬代码，不改行为）

按职责拆成 5 个文件，代码按原文件的精确行号切分搬运，没有改动逻辑：

| 文件 | 职责 | 大小 |
|---|---|---|
| `management-input.ts` | POST 输入协议（zod 联合类型，属于需持久兼容的协议）、`ManagementInput` / `ManagementAdministration` 类型 | 4.6KB |
| `management-locks.ts` | 每个连接池一个进程内排队，加上按操作编号加的跨进程咨询锁（等待期间不占用连接） | 3.7KB |
| `management-read.ts` | `managementRows`，以及 GET 页面视图 `readManagementView`：行数据、资料默认值、价格、健康状态 | 4.1KB |
| `management-actions.ts` | `applyManagementConfigAction`：把一个操作应用成下一份模型配置的业务规则 | 9.0KB |
| `management-access.ts` | 编排：鉴权、同源、解析、回执与重放、加锁、凭据/目录/积分分支、校验与投影、发布、草稿清理、错误映射 | 14.8KB |

- 依赖方向：access → input / locks / read / actions；actions → read、input（仅类型）；read → input（仅类型）。没有循环依赖，也没有新的跨模块依赖。
- 对外导出不变：`createModelManagementHandler`、`modelManagementHandler`。10 个直接调用它的测试脚本无需修改。
- 为了让搬过去的代码一字不改就能运行，两个新函数里各保留了一行转接代码：`readManagementView` 里的 `rows`/`deps`，`applyManagementConfigAction` 里的 `deps`。之后可以再整理。
- 导入表按各文件实际用到的名字重新生成；`tsc --noUnusedLocals` 检查这 5 个文件没有未使用的导入。

## 验证（隔离库；零外网、零供应商调用）

- 处理器级测试通过 8 个：model-management、model-management-concurrency、model-management-credit-pricing、model-management-metadata-defaults、model-management-tool-scope、model-supplier-channels、resolution-parameters、text-supplier-channels。
- 其他回归通过：model-batch、model-admin、model-draft-retention、image-parameter-plan-pg、image-mapping-ui、`verify-model-management-ui`（整页浏览器）；tsc、eslint。
- 未通过、但与本次无关的两个：
  - `verify-model-management-quality-parameters`：EXECUTION_MISMATCH"冻结参数映射与原配置不符"。在 main `1c0781b7` 上、以及换回 `1a6c0ce5` 版本代码后同样失败，属于既有问题；根因已交给协作模型调查（见下）。
  - `verify-admin-management-performance`：依赖不进 Git 的 `output/admin-query-performance-20261021/MANAGEMENT_PERFORMANCE.json`。
- 证据层级：隔离库加真实组件；**未发布**。

## 并行协作

- GPT-6.1（`codex/admin-settings-hardening-20261105`）：加固 `/api/admin/settings` 写接口：统一守卫，先完成全部校验再写入，管理日志不记录密钥。
- GPT-6 Astra（`codex/frozen-plan-mismatch-20261105`）：查清上面 EXECUTION_MISMATCH 是测试过时还是真实缺陷，并做最小修复。
- 两者都只在各自分支上提交，由主线程审查、复测后再合入。

## 交接

```text
模块与职责：模型管理写接口的编排与业务规则分层（见上表）。
公共接口、依赖方向、数据/状态/事务归属：对外仍为 createModelManagementHandler；内部按 input/locks/read/actions 单向依赖；事务、锁与回执语义不变。
本次实现与迁移状态：完成机械拆分；转接代码待后续整理。
验证命令、结果及证据层级：见上；未发布。
未完成项与下一步：整理转接代码；等两个协作分支完成后审查合入。
```
