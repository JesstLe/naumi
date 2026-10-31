# R8P：原生验证准备与进程生命周期

## 基线与调研

独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`；基线 `5116d7e8a272f25e77d27c281f6878225a8ad131`，5306个原raw哈希、完整归档和副本保留。刷新main仍为e2f56255。上一轮为有效进展：调度writer与三处等待行为已实现，实际同预算负载/副本回滚和远端提交已完成；整体仍ACTIVE。

R8O完整目录实际191PASS/1FAIL，失败是scene组合内首次director outputs请求的Next开发服务器Jest worker500；第一轮还有sharp分页文件不足/V8内存失败。原log/case/source保持，不把其余通过拼为完整core绿。原runtime177因完整core门槛在业务检查前退出，门槛不改。

静态调用顺序核对发现，已经通过的director完整应用在Canvas/WebGL前通过GET405准备references、director outputs和video generate三条仅写接口；scene只准备了读取接口和HTML/静态资产，在重型UI已驻留时才首次触发outputs编译。该区别提出了可控的准备顺序假设，不提前声称所有500只由内存造成。

另两处确定的fixture缺陷：scene失败收集将缺失的spawnSync streams相加为NaN，再传writeFile掩盖原异常；共享stopChild在taskkill启动错误/非零时仍resolve，曾使cleanup报告PASS但自有Next仍运行。

## 模块、接口与状态归属

- `scripts/verification/native-route-readiness.ts` 只拥有现有仅写路由的GET405准备。scene和director调用同一实现；原读取/HTML/资产准备仍保留。它不上传、渲染或发生成POST，405仍是硬断言，不重试失败。
- `scripts/video-fusion/process-lifecycle.ts` 只拥有本fixture创建的ChildProcess退出收据与spawnSync文本诊断。Windows沿原taskkill /T /F，POSIX沿原TERM再KILL；信号/命令成功不等于观察到子进程退出，失败不再返回假cleanup成功。
- 原harness继续拥有App/Worker/media/router及PG/supplier整体生命周期，不建立进程管理平台。scene原始失败先输出，补充日志失败不替换原异常。
- 本片不改任何src/services、API产品实现、场景内容、输出数量、WebGL/媒体字节、钱包、原operation/UNKNOWN或并发资源预算。

## 验证设计

新增verifier执行实际scene准备函数至明确browser-context边界，并执行原director准备块/新共享函数；browser/HTTP/fetch为显式端口，不冒充整应用。它对照原19条读取、原director3条GET405、命令/诊断失败、正常POSIX与已退出进程，以及修改后真实自有子进程退出。原实现缺准备/假停止/掩盖原错误按预期复现；修改与回滚结果以实际日志为准。

首次集中控制结果：原12项复现缺准备1、假停止2、原异常被遮盖2；修改17项为0/0/0，正常读取/原director准备/正常命令与POSIX行为EXACT，真实自有子进程退出后才返回。首轮VM端口缺少原生AbortSignal而exit1，修正端口后使用新标签/输出重跑，失败日志保留；不是产品失败。core catalogue新增1项到193，并为该项和已有image-scheduling-pg显式传递自有证据目录，不再把默认输出误归到其他轮次。

准备与生命周期完整模块完成后集中验证；完整scene/API/PG/WebGL与所有原业务断言沿原入口执行，类型与全量core不与本任务重型镜像构建并行。只有完整core实际通过后才重新执行原runtime177，不构造假PASS父报告或放宽该guard。

## 当前未完成

实现后待集中baseline/modified控制、真实完整core、同固定镜像runtime/产品及副本回滚。准备顺序假设尚待实际结果；旧R8O失败记录不删除。整体目标ACTIVE，分支未合回main、未部署，47 HOLD。超过48小时的独立候选仍为完整版本工作区，剩余Shell/持续与生产容量/有效CI/最终main整版验收保持未完成。

## 集中预检

完整类型exit0，5086个实际compiler/config/依赖输入raw哈希在检查前后相同；lint exit0，既有warning保留。全部2136个src/services原文件raw哈希保持。本片是验证资产修正，不新增产品功能迭代；完整193目录、原生场景实际输出和同镜像runtime仍待本轮实际结果，不提前写通过。

## 首轮完整core的具体修正

固定cafa8050的193目录到129PASS后，audio未知ACK重启矩阵暴露了本轮进程owner的过早失败：taskkill255提示某个后代已退休，原root退出事件可能晚于命令close。本轮不把非零当停止或仍运行的证据，统一在原有5秒边界内观察root退出后决定。所有具体PID随后核验已不存在，原native/core PG均清理；原失败日志与未执行63项保留。新增partial-tree延迟退出控制，未改音频/UNKNOWN/重启业务断言，不增加时限或资源。后续固定新source完整重跑，不跨SHA拼接129项。

修正后的控制为原13项/6个异常观测（缺准备1、假停止3、掩盖原异常2）对修改18项/0异常，正常合同EXACT；完整类型与lint再次exit0，当前5053实际输入raw SHA已固定。接下来只接受新固定source的完整193实测，不复用先前129项。

## 当前交付与明确未完成

当前候选源码 `a98e313bd8441035f2d43d4eac66eca9e2aeffd8`。验证资产的两个窄owner及真实调用方已实现，原13控制/修改18控制与正常合同对照通过；**整版原生GUI验收仍OPEN：当前raw报告135PASS/1FAIL/57NOT_RUN，fullCorePass=false**。失败项在本机提交内存耗尽后中止，不写成业务通过。

本片只改验证资产。scene/director复用GET405路由准备；process-lifecycle观察真实root退出，而不以taskkill成功或失败推断状态；缺失spawnSync streams转为文本，诊断失败保留原异常。全部2136个原src/services raw SHA保持，没有修改产品入口、UI、钱包、任务、UNKNOWN或资源预算。

实际验证分层保留：cafa8050首版core129PASS/1FAIL/63NOT_RUN，在audio未知ACK重启矩阵暴露taskkill255/后代已退休时root退出事件的竞态；修正后a98e313b完整目录继续至135PASS，音频/时间线API矩阵已通过，timeline-native-canvas只读GET发生ECONNRESET。一次同source/digest/env的续跑核验复用135条原日志，未使用cafa129或R8O191冒充当前通过；该次已完成真实时间线导出/采用，随后Next连续ERR_MEMORY_ALLOCATION_FAILED/Jest异常，最低观测可用提交内存116300KiB。原始runtime、进程树与隔离PG快照保留；只终止确证自有的异常App及未收尾case进程树，按精确ID/源码owner清理其tmpfs PG和临时fixture凭据，其他线程/系统分页文件未动。该次中止仍为FAIL，后续57项未运行。

本轮未构建新镜像、未执行新的runtime177或产品browser92；原完整core门槛保持，不伪造PASS父报告、不放宽断言或用历史绿灯覆盖。R8O镜像/450秒/产品92继续只归原source；本片只证明产品raw字节不变，不冒认新的容量、生产或全应用验收。

最终类型exit0，5087个实际compiler/config/依赖输入重新固定；原2个.Next生成route type漂移单列，旧输入/类型结果保留，所有原生进程结束后重新完整类型检查，不改产品或配置。lintexit0、原warning保留。原13控制复现缺准备1/假停止3/原异常被遮盖2，修改18控制为0/0/0，原19读取/director3GET405/POSIX/正常日志EXACT；实际自有子进程退出已运行。

**🔴 独立候选超过48h：用户要求持续完整重构，工作区保留。整体ACTIVE，未合回main、未部署、47 HOLD；验证资产不计产品功能迭代，main刷新仍e2f56255、计数0/3。原生整版验证待资源窗口；继续推进Canvas两处直接I/O与菜单/属性选择投影，持续/生产容量、有效CI、最终main整版与生产验收尚待。**

源码归档、字节补丁、独立副本原13控制恢复与5306原raw SHA回滚，以最终VERIFICATION/ROLLBACK_RESULT为准。准备顺序对完整scene的假设仍待实际整版运行，不把控制端口通过当原Scene整链闭合。
