# R4B4 — 显式Web启动与基础持久化初始化

## 基线与实际启动图

独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`；基线 `f03151236cdd1697588d9dcc570785b851b7da3a` 的4238个原文件字节与SHA保存于 `output/refactor-r4b4-20261025/BASELINE_SOURCE.tar`、`BASELINE.json`。

实际框架是Next 15.5.27，镜像Web默认 `node server.js`，本地 `next start`；Worker同镜像但独立运行 `.mjs` 扫描器，通过HTTP驱动Web，不直接承担业务数据库迁移。现有受控Worker默认paused与supervisor控制保持，不接管发布或在途任务。

## 实现

- `src/instrumentation.ts`使用Next标准Node启动钩子；Edge、production-build跳过，不在构建期连接数据库。
- `application/startup.ts`顺序调用13个已有基础owner：core、billing、model/runtime、video defaults、creation、media、login、image skills、两类quotes、batch与workbench。原SQL和各owner事务不改写，不引入DI容器、事件总线或新执行器。
- 同进程启动合并为同一Promise；失败清除入口Promise，按各owner已有失败重试合同恢复。无DB和auth/fleet sidecar不执行一般应用迁移。
- 实际Next验证发现instrumentation与route编译入口各有模块缓存：初版即使打印启动成功，health仍重复core/billing DDL，login仍重复login DDL。现将查询Pool收敛为Node进程内的lazy singleton；`platform/db/schema-readiness.ts`仅按真实Pool和owner共享就绪Promise，13个owner继续持有原SQL、锁、事务及清除失败Promise的逻辑。没有引入全局业务状态、DI或新的任务框架。
- 不启动供应商发现、生成任务、队列扫描或费用重提；原报价、余额、素材归属、operation与结算语义保持。
- 默认Compose增加Web健康检查，HTTP成功且`db.ok===true`才健康；Worker从service_started改为service_healthy。Worker本身仍是HTTP角色，未赋予DB迁移职责，原控制许可保持。

## 实际集中验收

- 新增三个专用verifier：`verify-web-startup-pg.ts`、`verify-web-startup-next.ts`、`verify-web-startup-compose.mjs`。测试均在独立loopback fixture；Next用完整源码字节副本，实际登录/health handler和13-owner probe，不以替代业务实现作为通过依据。
- 13个owner共102个`.query(...)`调用的全部参数AST文本与完整旧基线逐项一致；SQL职责未迁入平台层。就绪状态由原owner维护，平台只共享实际Pool和状态容器。
- PG旧版2组12检查；新版7组53检查，均exit0。新版覆盖并发8次共用Promise、build/Edge/无DB/两个sidecar不运行普通初始化、真实PG event-trigger DDL故障后的回滚/重试、Pool/owner就绪状态隔离，以及另一进程预置的原任务、unknown、钱包、12积分预占和冻结6积分报价逐行不变。
- 实际Next 15.5.27：旧版15检查、新版19检查，均exit0。新旧build SQL均为0；旧版启动DDL=0、首个登录DDL=3、13-owner请求集合DDL=15；新版启动DDL=15、首个登录DDL=0、请求集合DDL=0。新版实际观察到一个PG连接，health请求发生在启动SQL之后；正确密码200/cookie及错误密码401保持。
- Next CLI的`Ready`日志可能早于应用初始化完成，测试已改用真实health与SQL阶段次序；原错误预期和初版重复DDL的失败日志均保留，不将其改写为PASS。
- Compose实际配置解析：旧7检查、新12检查；新版实际执行health命令的ready、DB错误但HTTP200、HTTP503、无效JSON四个输入，exit分别为0/1/1/1。没有启动完整Compose产品栈或Worker进程。
- 最终类型、变更文件lint及相邻回归的完整命令/字面结果见`output/refactor-r4b4-20261025/VERIFICATION.txt`。相邻覆盖platform、模型读/执行、身份/creation、准备/原价、钱包/配置、真实195账号登录和视频冻结来源；本轮未执行外部供应商调用。
- 独立副本回滚、4238原文件hash、旧启动/首请求行为、补丁独立重放及任务分支提交/远端核验，统一由本轮VERIFICATION与DELIVERY记载；实际工作区保留新版。

本模块的直接收益是把基础初始化放到明确的启动阶段，并消除已验证入口的跨bundle重复DDL/额外Pool；没有添加用户侧确认、改价或重提交。启动/请求延迟、容量提升尚未测量，不以SQL数量替代性能结论。

## 失败与环境记录

- PG第一次在容器尚未ready时连接失败，原exit1留存；等待`pg_isready`后执行完整基线。
- Windows `NODE_OPTIONS`反斜杠路径被当作转义、C/E跨卷Next相对入口解析失败，均保留原构建exit1。预加载路径改正斜杠，fixture改到与现有依赖同卷的本轮新目录，未重装依赖。
- 视频来源脚本要求`naumi_video_fixture_*`数据库名，第一次不匹配的exit1保留；改用本任务容器内符合约定的独立fixture DB，不弱化检查。
- 旧R3缓存删除被执行器拒绝，十个目标均保留；未换工具绕过。本轮仅使用新fixture目录，构建前磁盘实测及实际产物路径已留证。

## 未完成边界

这不是全部schema owner的最终迁移器。真正空库的模型registry首次发现/导入，以及其它域的兼容ensure仍需后续梳理；不把预热13个owner写成全站DDL退出。直接库调用仍保留兼容ensure，冻结执行只读链不被全局启动包装。Worker执行/恢复重构、20/12依赖环、外围UI/CAS、R6完整候选build/CI/性能容量仍未完成。

实际Next验收是`next build`/`next start`的最小路由fixture，保留真实业务源码，但不是完整产品build、standalone打包、浏览器、完整容器栈或生产验收；这些继续在R6，不从本轮通过外推。

这是main同步后第1模块；不合main、不部署。实际命令/输入/字面输出、退出码、回滚及提交推送以本轮VERIFICATION/DELIVERY为准。
