# 后台失败原因：结构化记录与可读核对

## 本轮目标

用户确认浅色后台原型后，要求排查“失败原因未记录、不明确”。本轮沿真实执行/供应回执/创作诊断代码修改；不以原型文案替换真实证据，不部署服务器。

开工基线：`cde64c6aedd75c5197ee2ae17e7bac8759fb8bed`。
最终整合基线：`fada2f9a94f357eec59f4359ec80295b4a05a3cd`；保留 main 新增的图片交付有限帧诊断和已接受的后台原型，未合重构分支。
独立分支：`codex/admin-failure-clarity-20261027`。

## 静态定位

1. `creation-failures.ts` 原来只读少量 `failureCode/result.error.code`，未读取已存 `deliveryFailure` 阶段、视频 `error_code`、Canvas 有限本地错误，也不关联工作流节点。
2. 生成执行 `runJob` 的 catch 常将异常仅打日志，任务里只存 `safeError`；外层 Worker 错误收尾也仅有笼统 `image-worker-failed`。
3. 供应 collector 的响应流异常只调用 `finish('unknown')`，未将流异常的连接错误码传入证据；无响应 body 的非 2xx 路径也未补充 HTTP 状态分类。
4. 关联深度达到上限时，原代码会让同页其他已完整读取的任务也丢失诊断。

## 已实施

### 新异常记录

- 新增 `imagegen/task-diagnostics.ts`：有限错误码、有限步骤、有限异常原因分类与时间；不保存自由文本消息、stack、prompt、URL、密钥。
- 普通错误正文中的 `timeout` / `unexpected token` 等回显文字不单独成为已确认根因；需有限错误码、精确本地签名或类型匹配的原生异常。
- `generate-image/runJob` 在错误收尾前保存结构化诊断；记录失败不替换原异常、不授权重新生成。
- 原父任务汇总 catch、Durable Worker 收尾和 `failUndeliveredImageJob` 同步保留该字段；不改原收费、租约释放或恢复决定。
- collector 记录响应流中断错误码，无 body 响应也保留 HTTP 状态；不复制或缓冲额外完整图片响应。

### 读取旧证据

- 已有图片交付检查点说明具体保存阶段；视频码、Canvas 精确本地签名和工作流 blocked 节点进入诊断。
- 只按精确任务 ID、owner 与既有 tenant family 关联；成功子任务的历史错误不归给失败父任务。
- 不把整个 payload、输出 bytes 或自由文本错误传给前端；递归 SQL 只传有限诊断投影。
- 有具体本地交付异常时，不再被“供应已有输出”的泛化提示覆盖。
- 单个任务链截断只影响该根任务；全局读取上限仍显式标不完整，不以不完整数据声称全量核对完成。

### 管理后台

`CreationFailureView` 增加原因确认状态、已记录事实、缺失证据、执行/供应关联 ID、核对步骤。原错误原因、阶段、供应/账务区分继续保留。

明确区分：
- **已确认异常**：例如 `ENOSPC`，保存图片文件时空间不足。
- **执行结果待确认**：例如 `ECONNRESET`，通信失败已知，但供应是否接受/收费尚未确认。
- **证据待补齐**：只有旧失败状态，没有具体错误；保留最后状态与缺哪段证据，不编造根因。

新增诊断仍仅平台管理员可读；企业/成员输出继续不含这些内部字段。

## 验证层次

- `verify-admin-failure-clarity.cjs`：完整模块 transpile；真实独立 PostgreSQL 事务查询；旧版复现、有限分类、归属边界、可选表、读失败、零写入、实际 supplier collector（边界替身）等。
- `verify-admin-failure-evidence.ts`：既有新/旧创作 API、权限、企业数据隔离、账务保持、成功子任务与查询错误回归。
- `verify-imagegen-parent-completion.cjs`：原完整 Durable + dispatch + repository/creation writer fixture，新增模块真实加载而非替换逻辑；原并发、UNKNOWN、唤醒与零结算重放断言保留。
- `verify-admin-failure-clarity-ui.cjs`：真实 UI 组件加载真实 PG 查询生成的诊断对象，桌面与手机逐场景检查。
- 全项目 TypeScript 检查使用本 worktree 的锁文件独立依赖，不沿用共享目录的不同 React/three 依赖。

精确命令、首次失败、最终结果和副本回滚证据写入 `E:/Workspace/naumi/output/admin-failure-clarity-20261027-r1/`。

## 实际边界

- 旧记录从未保存过的异常不会因修改 UI 自动还原；本轮只解释现有证据与缺口。
- 进程硬退出、主机断电、DB 同时不可写仍可能阻断最后一条异常的持久化。本轮不把这类情况标成“原因已确认”。
- 本轮未引入全局日志平台、全领域事务 outbox 或统一故障重放器；未回填生产旧记录、改账或重提供应任务。
- 新结构化异常写入覆盖本轮图像执行、父汇总及 Durable 收尾边界；视频/Canvas/工作流读取已有记录，其所有外部系统的新增错误码仍需有具体映射后扩展。
- 最新 main 已包含用户接受的本地 UI 预览；本轮在独立 worktree 整合该基线，保留共享目录的 18 项未提交修改。按仓库协作约定完成后普通合 main，保持本轮不发布。源码完成和本地测试通过不是线上已生效。


## 集中结果

- 原基线真实复现：4 项正控/缺口检查，`REPRODUCED`，预期 exit 1。
- 当前诊断：24 项通过；真实 PG，读取前后任务/供应/账务摘要一致，供应商 POST 0。
- 既有后台新/旧创作接口与归属/权限回归：39 项通过。
- 原父子收尾回归：25 项通过，真实加载新诊断模块；包含 Durable catch 字段落入任务快照断言，原有 UNKNOWN/租约/防重放断言保持。
- 真实失败组件：7 场景 × 2 宽度 = 14 场景通过；既有 UI 19 项通过。
- 独立锁文件依赖下全量 tsc 通过；最初沿用共享目录时遇到不同 React/缺 three 的依赖错误已保留，不计为产品 PASS。

首轮诊断脚本的错误测试忘记回滚只读事务、初版 UI 脚本缺一层循环括号，以及旧父回归 loader 缺新模块导入，均作为测试材料问题修正；业务断言未降级。
