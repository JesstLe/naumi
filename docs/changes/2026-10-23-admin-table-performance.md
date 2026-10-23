# 管理后台查表性能：对话列表与明细

## 范围与基线

- 工作树：`E:/Workspace/naumi-admin-table-performance-20261023`。
- 分支：`codex/admin-table-performance-20261023`；起点 `cd64d1ffd4eda66afcbe7817fc9016203c92be4a`。
- 保留 2026-10-21 已交付的作品、操作记录、用户、模型和总览优化，本轮不重做。
- 共享 checkout 的 18 个未提交 UI/画布文件原样保留；不修改 canvas、企业接口、权限或计费。
- 47 仅短超时只读 SQL 诊断；没有构建、切流、重启、建索引或收费供应商调用。

## 调研证据

1. 47 当前样本为 157 个 agent 会话、3 个 genchat 会话；原列表 SQL 在该次冷暖混合样本为 8.832ms，并非全后台都严重缓慢。
2. 列表旧 SQL 在 UNION ALL 内计算 `jsonb_array_length(messages/turns)`，再全局排序分页。实际计划中，1309 个命中会话全量读 JSON，页查询 shared hit blocks 为 29455；count 查询已由 PG 裁剪昂贵投影，不能错误声称 count 同样展开 JSON。
3. 长会话明细原 count/page 分别展开消息数组。agent 的内容数组还在过滤、投影与截断中重复拼接；genchat 的两个 UNION 分支分别展开同一 turns 数组。
4. 不用删记录、缩短日期、隐藏总数或全局陈旧缓存换速度；不新增表、索引或迁移。

## 实现

### 对话列表

- `conversationKeys()` 只读取来源、账号、ID、更新时间，保留全部原筛选。
- `selected AS MATERIALIZED` 先按原 `updated_at DESC,id DESC` 分页，再按来源+账号+ID 回表计算当前页 entries。
- count 与 page 仍处于原 `REPEATABLE READ READ ONLY` 快照，空页返回真实总数。
- agent ID 不能当全局唯一键；同账号不同来源、同 ID 不同账号均有回归样本。

### 对话明细

- 单 SQL 的 `extracted` 复用一次会话展开结果来计数和分页。
- agent 计数只判断是否存在非空 text 块，选中当前页 20 条后才按块原顺序拼接全文。
- genchat 用 LATERAL VALUES 将一条 turn 转成 user/assistant 两条，消除两次 turns 展开。
- 保持 user/assistant 可见性、空白字符串、非字符串 text 字段原转换、ordinal 顺序、20000 字符截断、truncated 和空页契约。
- 查询始终同时限定 email+id；鉴权、二次密码和访问审计完全不变。

## 集中验收

隔离本机 PostgreSQL 16 容器 `naumi-admin-table-pg-20261023`，仅回环端口 65436；不复用其他线程数据库。测试脚本创建随机 schema，结束删除自身 schema。

新增 `scripts/verify-admin-conversation-performance.ts`：

- 1000 agent+300 genchat，普通会话 60 条消息，另含 1500 条结构化消息的长会话及历史异常/跨账号/跨来源样本。
- 162 组 baseline/modified 完整响应等价；包括关键词/公司/账号类型/孤立历史账号/来源、翻页和深页、空结果、JSON 非数组/null、非文本/系统/工具消息、Unicode 截断、相同 ID 的账号隔离。
- 交替运行 baseline/modified 7 轮，报告中位数并保存原始计时与 EXPLAIN ANALYZE BUFFERS；不把单次热缓存作保证。

| 场景 | baseline 中位数 | modified 中位数 |
|---|---:|---:|
| 列表首页 | 95.98ms | 6.35ms |
| 列表第40页 | 96.80ms | 6.67ms |
| 1500消息 agent 明细 | 23.51ms | 15.61ms |
| genchat 明细 | 4.53ms | 3.21ms |

修改后列表页 SQL 实际计划先选 30 条，JSON 回表 30 条；shared hit blocks 降为 703。长 agent 明细仍要扫描完整数组获得精确总数，未将其描述为常数复杂度。

- 既有 `verify-admin-query-performance.ts`：145 组合等价（450 用户、8000 图像任务、10000 作品、12000 流水），含企业允许账号列表/空列表/越页、状态切换和旧用户列表。
- `verify-private-bi.ts`：PASS，涵盖管理边界、独立汇总、媒体、trace 脱敏与 CSV。
- 全量 `tsc --noEmit --incremental false`：exit 0。
- 完整 Next 15.5.27 production build：exit 0（保留仓库既有 lint warnings，不把 warnings 记为零）。
- 47 同一只读快照、相同 30 天日期/30 行 SQL，交替 3 轮执行时间 baseline `6.077/4.961/7.800ms`，modified `3.353/1.997/1.499ms`。这是数据库 SQL 取样，不等于公网 HTTP 或浏览器完成验收。
- 47 当前页只读 `EXCEPT ALL` 双向等价：`LIVE_PAGE_EQUIVALENCE|30|30|0`，未导出用户文本/账号。
- 原始字节 SHA256 `bd0ea56c9e8992ab4f34da57c061b3a4b4279a8ea3dbadaeba8f4900d527e566`；修改文件 SHA256 `f91a1c9505dc722a55c72943a79f5624b613c20e12283ff18d1f6283a05dcc98`。
- 独立修改副本经可执行 `ROLLBACK.sh` 恢复上述原始 SHA256，再重跑 162 组，PASS；原始版本/恢复副本的列表中位数均恢复约 100ms 级。任务源码及 `MODIFIED_FILE.ts` 保持修改态。
- 首次工具启动的 Node 条件未传入 tsx 子进程，server-only 导入报错；使用显式 `NODE_OPTIONS=--conditions=react-server` 和 tsx 条件后正常。失败产生的自身临时 schema/文件已定点清理，未改共享依赖。

## 交付及待完成状态

- 模块实现、集中回归、完整 Next build 和独立副本回滚完成；最终提交/推送在交接回执中记录。
- 原文件字节、SHA256、修改副本、diff、精确命令/结果、回滚脚本保存在 `E:/Workspace/naumi/output/admin-table-performance-20261023/`。
- 已通知现有 47 发布协调线程本轮文件范围；本线程不创建并行发布候选，提交后交付固定 SHA 供其整合，未声称已上线。
- 功能迭代计数：本轮 1；开工 fetch 后基线 cd64d1ff，合并/提交前再次 fetch（直连 TLS 失败后使用已存在的本机 7897 代理成功），origin/main 未变化。本轮不修改仓库全局代理配置。
