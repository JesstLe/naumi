# R9V：经典发布草稿与原生验收生命周期

## 入口与实际发现

完整基线为 `59f1fbc35294f7a9e95115355d182c58a4bd5d13`，5375个原始文件已冻结。上一头769的Image失败于business-ui；59f的Image失败于更早的billing-ui。两次远端精确断言未从不可达的原始日志取得，不能把本轮本地问题冒认成它们的唯一根因。

原business-ui在独立PG、固定Go Router `b3fc8dd61e62c564ac2ba2a08cf943f7c391970c`、实际Next/Edge中首先复现：页面HTTP200后，`goto`等待整页load超过原30秒。第二次原参数诊断到达实际发布后，又在reload等待load超时。第三次带观察器的诊断和首次修改版出现本机Node原生内存提交失败；当时宿主机空闲物理内存约8.97GiB、虚拟内存余量约3.64GiB。保留全部失败，不把它们改写成通过或唯一CI归因。

转到依赖锁完全相同的已有Linux验收环境后，原business-ui全部业务断言通过；批量配置进一步复现真实产品问题：同一管理员第一次发布成功，未改动的草稿仍basedOnVersion=1，第二次正常发布在current=2时被PUBLISH_STALE_DRAFT_BASE拒绝。不是供应商或客户余额问题。

## 草稿数据所有权：实际产品修复

- `repository.markApplied`在原全局发布事务内，只推进发布者本人、且完整配置摘要仍等于该次已确认发布的工作草稿基线；同时增加revision，使旧tab写入继续受CAS保护。
- 不改草稿内容，不写其他管理员草稿；发布期间产生的新编辑摘要不同，就保留其原base/revision/content，不静默重建或覆盖。
- 原applied回执重读走原幂等分支，不重新推进、更不回退草稿。原发布版本内容和已受理任务冻结保持。
- `access`与`publication-result`对明确在stage插入之前抛出的PUBLISH_STALE_DRAFT_BASE传递一致not-staged证明；没有证明时仍保留UNKNOWN，不以404、超时或缺行推断未受理。
- 没有新schema、另一套草稿store、用户积分确认或业务限额；数据库操作继续使用原事务连接，不在事务内另借连接。

真实PG对照：原16检查复现第二次发布被拒，修改版17检查通过；其他管理员陈旧草稿仍409且publication行数0、在途编辑保留、旧回执不改草稿、原版本不可变，新增旧revision写入仍被CAS拒绝。原admin及publication整模块也通过。

## 原生验收所有权：复用而非第四套框架

- 三个经典命令business/model-batch/apimart复用原`model-management-ui-runner`，由两个固定profile绑定fixture和metadata。9→12个原命令共享source copy、IPC子进程句柄、随机回环端口及退出回执。
- 不再备份后无条件覆盖开发目录tsconfig，不通过任何找到的marker停止别人的进程。Go Router、Next及PG仍真实执行。
- 经典fixture拥有Go/Next/目录/池的清理，父进程只通过同runId IPC关闭它。fixture cleanup异常退出会使验收失败，不把checker exit0直接当全部清理通过；原checker非零退出仍保留。
- 导航以DOMContentLoaded进入，再由原编辑器/模型控件承担就绪验证；原控件超时和业务断言不放宽。三脚本原23/32/25个assert/expect调用逐AST核对；batch中唯一旧label定位改为实际combobox「执行模型」，原预期模型文本、matcher和超时保持，除此之外断言AST精确一致。
- 新失败观察器只记录本次验收页，不替换请求或响应；保存error/DOM/网络/图片并发出GitHub error annotation。billing Playwright在Actions中保留list/JSON，同时增加GitHub reporter；always产物包含经典runner与失败证据，日志下载受阻时仍有可读取断言。

原wrapper受控端口对照3项实际复现后续编辑被覆盖/Next types污染/exit7原样传播；修改版真实子进程104项覆盖两profile、成功/检查失败/启动失败/超时/清理失败、原目录后续编辑、外来marker和端口，均通过。这个层级不冒充Next或PG。

## 本地Linux执行边界

`NAUMI_MODEL_UI_DEV_IMAGE`仅用于本机验收，使用已有SDK的Linux依赖层，不运行旧`/fixed-app`。启动前校验当前源码每个原始字节和package-lock，再从当前源启动实际Next dev。镜像依赖为Node24.22.2、Next15.5.28、React19.3.0，lock与项目完全一致；容器3GiB/2CPU、仅回环发布端口、无Docker socket或业务数据挂载。PG、Go Router和浏览器仍走原真实链路。

它是当前源码的Linux开发验收，不是固定生产App/Worker整版证明、线上容量证明，也不把Windows原失败与Linux通过的差异全部归为本次源码修复。

## 验证与剩余

完整原生三入口均实际exit0：business为真实发布后75积分及文字/工具目录；model-batch连续三次真实发布、原65/90积分及用户「执行模型」；APIMart两次真实发布、倍率1.5→2带来8→10积分、预占10和max展示/medium执行。三者均包含移动端、非管理员404、真实PG/固定Go Router，供应商生成POST0；不是实际付费生图质量或线上验收。

batch首次完整运行已完成三次发布后，仅旧「tool.garment 模型」label失败；修正为实际role/name后原流程通过。APIMart首次Linux运行明确INVALID_PROJECTION：应用provider origin改为host.docker.internal桥接，但宿主Go Router仍只信任旧回环origin。fixture现在把同一个自有精确origin加入Go的独立allowlist；仅复测APIMart，原业务断言不变、两次发布通过。未扩大产品信任规则或绕过Router校验，未将这次本地环境问题冒认远端billing-ui唯一原因。

集中类型、lint、架构输入、精确命令、失败尝试、完整字面输出、各次源码桥接、四产物、独立副本回滚与清理以`output/refactor-r9v-20261101/VERIFICATION.txt`和`DELIVERY.json`为准。完整222目录本轮未在本机重跑；既有59f远端Core已实际SUCCESS，Image在更早billing-ui处FAIL，不重标成R9V新head通过。

整体ACTIVE，当前main未合、本轮未部署、47HOLD。原远端billing/browser失败、当前222目录完整同源CI、main整合及20退出要求/9类故障×5维继续逐项闭合；候选分支已超过48小时，原因仍是这些整体门槛尚未全部完成。
