# R4A4：作品/Canvas 数据归属与模型观测解环

## 基线与范围

- 工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 原提交 `109d1e8f1c88fc722af7d967cf699ff355b466e3`，完整 4165 文件原始工作区字节归档、逐文件 SHA 在 `output/refactor-r4a4-20261024/BASELINE_SOURCE.tar` / `BASELINE.json`。本轮直接保存工作区原字节，不依赖 Git archive 的换行转换。
- 不改变作品/任务表、收费、权限语义或运行参数。没有恢复旧积分确认，没有新限额，没有重提 unknown 付费任务。

## 真正的职责分离

### 作品与 Canvas

- `artworks/types.ts`：纯作品合同。
- `artworks/repository.ts`：作品读取、属性、回收站；三份完全相同的 30 字段 row projection 合一，空串、0、false、null、parentIds 与历史字段原样保持。
- `artworks/writer.ts`：作品写入与现有 creation evidence 编排；保留 caller-owned Tx，数据读取不加载写入编排。
- `artworks/administration.ts`：既有后台读取、模板导入引用查询、管理员删除与原媒体清理条件。
- `canvas/artwork-repository.ts`：作品对应画布位置、尺寸、编辑组和父子关系。
- `canvas/text-node-repository.ts`：文字节点保存/恢复/归属与结果关联。
- `canvas/project-repository.ts`：项目名称；`canvas/node-deletion.ts`：混合节点原子删除及原 operation 回执。

旧 db 只有同函数 re-export 兼容。实际生成、工作台、画布、媒体/视频调用方已迁到 owner；没有给每个函数造一层 class/store。

### 观测不再反向加载 HTTP/模型选择

- `bi/context.ts`：唯一 AsyncLocalStorage actor/operation owner，HTTP、原任务恢复与存储共享同一实例。
- `bi/model-calls.ts`：实际 SDK/stream 观测与写入，计费状态引用 `billing/synchronous-operation`，不导入 HTTP quotation facade。
- `bi/request.ts`：现有身份、creation、accepted continuation、model request 的 HTTP 包装，执行顺序和错误映射保持。
- `model-config/client-identity.ts`：唯一 managed-client WeakSet；创建器标记同一实例，观测只读该标记，不再反向 import 完整 client factory。
- `bi/model-observer.ts` 留 6 行同函数兼容出口；生产 src 调用方不再通过它获取上下文/SDK观测/HTTP包装。

媒体归属读取从原 `media-assets → bi/model-observer → model-config/requests` 改为 `media-assets → bi/context`。不通过把静态 import 改动态或增加通用 DI 容器来隐藏环。

## 结构与等价证据

- `db.ts` **3769 行**，原 4793 行；emitted 静态消费者 **130 → 87**。
- 主迁移登记 **144 个调用文件 / 358 绑定**；后续 writer/query 分离又改接 37 个 writer 引用（其中包含旧 db 的 export/import，不冒充 37 个新增调用文件）。
- 37 个 db 顶层声明、12 个 BI 声明迁移；旧 db 保留 175 个声明，其他 144 个调用文件的 986 个声明保留业务正文。比较只规范化经过绑定身份核对的 import、context/WeakSet helper 委派、已证明同一投影的 mapper，以及 TypeScript-only query 类型。
- **原 67 文件动态 SCC 拆开，全项目最大动态 SCC 为 20**；原 19 文件模型/报价静态环拆开，残留 transport/client 静态 3 环。
- 新 owner 均不在静态或动态 SCC。余下环明确保留：视频协议20、图片恢复动态12、模型组装动态8/静态6、身份/creation/billing动态7、视频/db动态6、storage/media动态2，以及其他小环。
- 这属于依赖关系证据，不是吞吐、首屏耗时或十万活跃承载结论。

## 集中验收

| 验证 | 实际结果 |
|---|---|
| 完整旧/新源码观测函数 | 各 21 场景 / 141 检查，exit0；30并发上下文、错误保真、请求包装顺序、观测故障不丢结果 |
| 完整旧/新源码真实 PG | 旧 2 场景 / 108 检查，新 2 / 176，exit0；增加项是新旧出口同函数检查，非68个新业务场景 |
| 作品字段与观测输出 | 两组 JSON 逐字段相同，SELECT/回收站投影保持，parent/group/尺寸/来源/原价相关数据不变 |
| 事务与归属 | 外账号读取/修改拒绝，批节点第二表真实异常回滚前序作品软删，原 operation 重放/冲突保持；实际 creation 作品+文字关联通过 |
| 实际流观测 | 正常/取消/异常 stream 保留输出与状态、同次 SDK 调用；实际 managed-client 身份共享 |
| Canvas现有真实入口 | history20、artwork-document14、node-operations32检查通过 |
| 私有媒体 | 原上传/完成/缩略/跨账号拒绝/重放通过，storage requests6，供应生成0 |
| 钱包、BI与creation | 原 wallet、private-BI、creation-writers通过 |
| 生成交付 | 原完整 handler fixture27检查：2K/4K、partial续交、父子回执、一次结算、unknown POST0；loopback供应响应1，真实供应调用0 |
| 作品溯源 | upload/copy/import/template/async/tool、历史证据、原归属、迁移幂等通过 |
| TypeScript | 全项目 `tsc --noEmit --incremental false` exit0 |

失败原样保留：初轮 unit VM 漏 URL；初轮 PG fixture 的删除 operation 错用非 UUID；verifier 的可选 assert.rejects 重载类型；AST比较器没规范化模板里的CRLF；旧溯源脚本在隔离 cwd 找不到 migrations 文件；lint 不接受 verifier 的局部 `module` 变量名。只修测试夹具/比较器并绑定原 migration 字节，不修改产品逻辑让断言通过。最终完整命令与每次退出码见 VERIFICATION。

## 留存边界

仍保留原已有策略与技术债：回收站读取时懒清理、模板根并发先查后插、管理员删除的模板引用检查范围、旧图文多 tab/CAS等。本轮未因分文件宣称这些问题关闭。新生产数据模块不导入旧db；跨域视频/任务及配置组装下一轮继续。

回滚只在本轮独立副本运行，实际工作树保持重构后源码。四产物、hash、恢复行为、提交及自有 PG 清理以 `output/refactor-r4a4-20261024/VERIFICATION.txt`、`DELIVERY.json` 为最终记录。

本轮是上次 main 同步后第3模块：收尾刷新并普通整合 origin/main，再将模块计数归零；不将重构分支合入 main，不部署。整体目标保持 active。
