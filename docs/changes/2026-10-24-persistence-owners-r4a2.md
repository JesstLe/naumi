# R4A2：初始化、设置持久化与注册赠额的真实归属

2026-10-24；工作区 `E:/Workspace/naumi-refactor-20261024`；分支 `codex/core-refactor-20261024`。
完整基线 `67e53682e30221a98844f6f5a9469d5be7e10fe5`。继续整体重构，不把本模块完成扩大为全部业务查询/运行DDL迁移完成。

## 实现

- `src/lib/persistence/schema.ts`：兼容初始化的唯一 owner，保留原 single-flight、失败清缓存、FLEET/LOGIN只读探测、原DDL、billing schema标记和advisory事务锁。不import业务db/repository；此处明确是应用持久化兼容层，不伪装成纯 `platform/db`。
- `src/lib/settings/repository.ts`：只负责 app_settings 的原字符串读取/写入。缺键返回null，空串、`0`、`false`、空白字符串保持；初始化/查询错误原样向上传递，未加缓存或新回退策略。
- `src/lib/billing/signup.ts`：注册赠额读取/更新归账务，保留实际billing config及旧无DB回退，不把业务赠额放进通用settings repository。
- `db.ts` 删除对应五个实现，兼容导出同一函数；其余业务函数保持。**43个实际调用文件、102个绑定**切换至明确owner，包括native/admin auth、billing runtime、model administration、Canvas和视频持久化。
- `settings.ts` 的OpenAI/SMTP/加解密有效配置逻辑不重写；未引入另一分支的批读实现。原key、env回退、currentModelExecution冻结优先和保存规则保持。

原 `db.ts` **5928→5321行**；502个非目标函数正文不变，43个调用方仅改import。

## 同时关闭的初始化连接等待

旧 ensureSchema 已持有一个建表事务，却通过 `getPool().query` 再借一条连接检查供应商表主键。普通池5条中另4条被占用时，初始化等待自己之外的第6条连接。

新实现只将该检查改为 **`schemaDb.query`，使用已经持有的同一事务连接**。所有DDL SQL字面值不变；原供应商迁移仍先复制再切表。

真实PG对照：持有4条连接、fixture checkout timeout=500ms；旧实现超时且整个DDL回滚，释放后可重试；新实现同条件成功，不额外借连接。500ms仅为确定性测试设置，生产连接预算/超时未改。原advisory锁仍由既有schema-lock实测确认，不用减少锁来绕过等待。

## 结构效果

| 同一TS擦除后扫描 | 之前 → 之后 |
|---|---|
| 旧db静态消费者 | **178 → 144** |
| 最大静态SCC | **56 → 24** |
| 其他主要静态SCC | 视频20保持；原大环分离出6文件model/billing组装环，继续跟进 |
| 新schema/settings/signup owner静态环成员 | **0** |
| 含动态import的最大SCC | **70 → 66**，尚未关闭 |

这是依赖方向改善，不是线上吞吐或故障率承诺。旧db仍有身份、资产、钱包、任务等业务查询，兼容门面继续存在是因为仍有真实调用方，不把它记为已退休。

## 集中验收

证据根 `output/refactor-r4a2-20261024/`；精确命令、literal、退出状态和原hash见 `VERIFICATION.txt`。

| 层次 | 实际结果 |
|---|---|
| 原函数与真实settings getter A/B | **29场景，基线89 / 新版90检查**：初始化single-flight/重试、旁路只读、raw字符串、异常传播、赠额、OpenAI/SMTP完整返回值、坏密文/env回退、冻结scope优先 |
| 真实隔离PG，独立进程场景 | **6类，基线61 / 新版78检查**：新库、旧email主键供应商库、连接压力、事务中失败后重试、fleet、login |
| schema对照 | 新/旧库/压力/重试4组，**35表、380个列描述逐项一致**；DDL SQL原字节保持，未用比较列名代替SQL核对 |
| 老数据 | 供应商原协议/加密字段字节/模型列表/false状态保留，生成新ID；历史作品字节URL和父子group回填保持 |
| 实际身份/账务 | native账号读取与封禁、生效赠额7→0与新账号零赠额、原/新门面交叉读写，真实加密OpenAI/SMTP读回 |
| 既有事务/入口 | schema namespace barrier、wallet、creation writer、Canvas copy/delete/history32检查、model publication均exit0 |
| 类型/lint | 全项目tsc exit0；所有受影响产品TS和新PG脚本lint exit0、0warning |

新PG检查真实身份函数/赠额/设置持久化，不宣称完整浏览器登录或生产发布验收。model publication使用既有loopback控制服务；本轮外部供应商/生产调用0，未跑浏览器/full build。

## 失败原件及纠正

- `BASELINE_FIRST.log`/`MODIFIED_FIRST.log`：settings模块的动态billing import被esbuild继续展开，fixture缺未使用深层模块导出而setup exit1；将未调用的billing边界显式stub，保留实际effective getter/crypto与相同I/O ports，最终完整A/B通过。
- 第一次PG基线已通过fresh/legacy/pressure，在retry用例的fixture monkey-patch错误重写 `Pool.connect` 后丢失callback形态，形成自有子进程等待；这是测试注入错误，不是产品基线缺陷。检查了实时PID/命令及PG活动，停止唯一该retry子进程36492，删除它的随机schema；原父进程exit1和原件保留。
- 改用 `Pool.on('connect')` 对真实client注入一次真实SQL错误，未改Pool.connect。随后基线6类全跑；新版首个完整运行在修正后启动并6类全过，原日志直接复制为FINAL，绑定说明在 `PG_FINAL_LOG_BINDING.json`。
- 成功及失败schema/连接均已清理；未将停止前未执行的retry/fleet/login断言记为通过。

## 回滚、同步与后续

四产物为 `MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。独立完整源码副本覆盖新版归档后恢复 **46个原文件、移除6个新增文件**，原SHA核对并重跑29/89基线行为；原PK检查恢复第二pool方式，实际重构工作树保持新版。四产物及源码/归档哈希重新打开检查。

自有PG `naumi-refactor-r4a2-pg-20261024` 的固定ID和独占匿名卷已核验后停止/删除；65448无监听，其他client计数0，CLEANUP=PASS。不是删除共享数据或操作生产。

本轮为上次main同步后的第 **1** 个模块；只提交/推送独立分支，不合main、不部署。整体goal active。

下一步继续数据owner拆分，优先核对身份/钱包/资产查询如何跨边界组装；24文件和6文件静态环、66动态环继续按具体边追踪。R4B显式迁移/启动流程尚未实施：兼容DDL仍可能由第一次业务调用触发，不能把“迁入独立文件”标成“运行热路径已无DDL”。R3外围UI/CAS、旧intent升级、R5/R6与最终build/容量验收仍在总台账。

```text
从R4A2固定提交继续整体重构；只在独立worktree修改。
下一模块先核对实际身份/钱包/资产query和调用者；建立明确owner与窄事务接口，
不要移出函数后再import整个db。保持旧库/历史任务/冻结报价/tenant/幂等结算。
模块集中A/B与真实PG、记录原失败、独立副本回滚、选择性提交；不接管发布。
```
