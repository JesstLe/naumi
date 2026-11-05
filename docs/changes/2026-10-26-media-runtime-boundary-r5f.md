# R5F：媒体执行合同、原生引擎与服务入口归属

## 基线与目标

独立目录 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`，基线 `3ae2a7e1acbd550f2f4fed938bbb03f77571bf8d`。4352个原文件完整归档并核对hash。开工main刷新为`368c93e2`；本轮是main同步后第3模块，收尾再按约定普通整合main，不合回main、不部署。

目标：Web只引用纯媒体参数/命令和bundle合同；真正spawn、runtime复制、探测/编码及子进程生命周期归独立media-worker。生产实现不再由`src`反向import测试脚本目录，也不复制测试目录充当运行产品。

## 实现

- `src/modules/media/contract.mjs`：原11个纯声明，包含原限值、名称/虚拟路径、probe解释与原生命令映射；没有child_process或文件I/O。
- `src/modules/media/bundle.mjs`：原HLS/DASH完整inventory解析，原算法不变。
- `services/media-worker/engine.mjs`：原MediaEngine、runtime复制与流式hash；引用纯合同和bundle，不引用scripts。
- `services/media-worker/main.mjs`：原实际HTTP服务、任务持久回执、并发、取消、共享退休对账、排空与关机；原算法不变。
- 原sandbox C与runtime组装shell迁入同服务目录，原字节保持。Docker实际编译与runtime COPY全部改绑。
- `scripts/video-media-worker.mjs`仅为稳定CLI，不改Compose/supervisor/部署调用参数。旧engine/bundle路径仅留测试import兼容重导出，实际生产消费者全部改绑。
- 原生fixture构建工具同步新目录，并继续支持固定旧提交；修正既有Docker FROM使用ARG后旧工具硬编码查找的问题。

没有新增业务限制、任务队列、网络重试、计费或FFmpeg参数规则。原native隔离/输出验证/owner与账务算法保持。

### 实测发现并修正：独立媒体容器缺KILL capability

旧root Compose/staging Compose/独立媒体发布工具只保留6项capability，FFmpeg经原C启动器setuid至10000+后，父进程的kill(-pid,SIGKILL)因为缺KILL而失败并被原catch吞掉。真实HTTP旧配置DELETE已受理但350ms后仍processing，最后直到原媒体时长才结束。原sandbox脚本只断言最终取消、没有时效断言，曾等待完整120秒后仍标PASS，不能据它证明及时取消。

本轮给上述独立启动配置、memory验证工具补齐KILL（已有combined worker配置本来就含KILL），不增加SYS_ADMIN、不更改子进程原seccomp。新增实际HTTP检查要求取消3秒内完成并验证持久cancelled/子进程回收，SIGTERM和重启回执也实际执行。负对照和原始超时literal保留；这不是静态配置猜测或线上故障唯一根因结论。

## 验收记录

- 纯合同完整基线/新版95项返回值及异常逐项相同，原兼容重导出保持同函数/同class；叶子输入3→2，仅node:path，旧bundle已可tree-shake，未声称原来必然执行FFmpeg。
- 7224声明逐token一致，50迁移归属；原C与runtime shell字节相同。新owner不入环，原全部SCC成员保持、最大3，src到scripts/video-fusion生产边归零。
- 实际Docker media-runtime stage重新C编译/组装通过；同一合成testsrc2+sine视频3,233,960字节，SHA256 `47e5cc25be731e1c9e8c411a9d42af1bb950fb429ef892871e4de5b3df3b2510`。不是用户媒体。
- 原生Linux基线/新版引擎实际抽帧、裁剪、流解码、篡改hash拒绝、取消、独立C启动器网络和跨目录隔离通过；新旧HTTP子进程各40检查，输出frame/trim字节hash完全相同。
- 完整Next standalone + application Worker + media C runtime产品候选镜像已构建；其内无旧fusion runtime文件，5个新runtime源hash匹配，Worker包不含native engine，真实镜像媒体HTTP40通过。
- 同完整镜像实际Web启动/37-owner PG初始化及六入口20检查通过；真实PG/独立应用Worker的视频65、图片71邻接通过。没有部署、真实付费供应商或负载容量证明。
- 共享退休缓存7进程38检查、真实60秒collector通过（Windows symlink权限不可用保留）；combined生命周期91模拟断言、独立媒体发布12/memory runner7通过，combined27中14skip如实保留。
- 全项目tsc和定向lint、独立副本完整4352hash恢复与原生回滚行为、四产物/补丁重放和Git远端以证据目录VERIFICATION/DELIVERY最终结果为准。

本轮旧已完成R5D/E重复解包副本清理7目录释放882,355,535字节，原始归档、四产物和失败日志保留。本轮原生/PG夹具在收尾统一清理。

失败记录不改写：contract基线值快照和结果meta误用同名；HTTP取消202与退休410期望修正；旧capability真实取消失败；镜像角色初次未显式root；internal network不映射host端口，改为容器内执行真实Web客户端。所有成功验收均绑定实际源码/固定image。

## 后续

模型transport/client3环及其它小环、外层UI/多tab-CAS、R6完整产品候选/CI/benchmark/容量继续，整体目标active。
