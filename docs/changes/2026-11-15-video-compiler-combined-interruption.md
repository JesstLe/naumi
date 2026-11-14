# 视频编译架构：真实combined监督器在途信号与恢复

## 模块与职责

源码基线 main `b7ced36254d3a110de40abcd9c51beec4b5d8f36`；固定产品镜像沿用 `d4b6a58b`/1794680841/image958898f7，b7相对产品镜像只增加已验收的测试驱动和文档。本片针对RFC A14/A19尚未覆盖的combined活动中断，不能用单独scanner或先drain再重启替代。

## 公共接口、依赖方向、状态归属

- 复用原实际Next/PG/发布模型fixture，`--combined-interrupt`只在固定production-package下运行；不改变默认底座路径。原Web鉴权HTTP仍拥有任务准入/冻结/幂等，独立combined Worker执行产品代码。
- `video-compiler-combined-host.mjs`在宿主持有精确Docker容器句柄；产品容器不挂Docker socket。driver和Worker是两个独立容器，共用本次本地fixture network namespace；没有公网端口、生产数据库或真实供应商。
- Worker直接执行镜像内`video-worker-with-media.mjs`，root PID1，不通过嵌入supervisor类或假造PID验证；其子scanner为UID1001、媒体为UID0/原生sandbox。状态/素材/共享scratch只属于本次fixture路径。
- file RPC只发出当前拥有容器的start/signal/inspect/wait/cleanup，记录实际image/container/退出状态；SIGTERM、SIGKILL直接发给产品PID1。真实供应商HTTP挂起POST/GET，测试只控制何时返回，不替换产品请求或处理函数。

## 计划的验收与不变量

1. POST已发出、尚未返回回执时SIGTERM；保持响应超过原12秒grace，combined不得强杀scanner或重复POST；释放原响应后先保存真实upstream_id再退出。
2. 同一状态文件重启，按原回执GET、真实解码/落片/单账本，原7积分不因当前17而改变。
3. POST在途SIGKILL；原tick保持UNKNOWN、paused和相同tick身份，media保持draining，resume/显式retry拒绝，原租约不得被提前夺取。
4. 原210秒task lease自然到期后用明确的新Worker身份检查原sending任务转needs_attention，旧UNKNOWN状态文件逐字不变；不把换身份写成旧tick已核实，不重发POST、不收费。
5. GET在途SIGKILL；保存的upstream_id保持，原Worker UNKNOWN不解除。第二次自然租约过期后，替代Worker只GET原任务、落原结果、单次17积分。

不调整时间、lease、任务/receipt状态或数据库余额来制造上述成功。替代Worker代表显式接班实例，不是自动擦除旧UNKNOWN；原实例的待核对债务必须继续保留。

## 验证记录与未完成

精确命令/回执在 `E:/Workspace/naumi/output/video-compiler-combined-interrupt-20261115`。首轮测试sandbox tmpfs误设256MiB，原生字体复制ENOSPC；改为既有验收的1GiB隔离挂载，不放宽sandbox或伪称容量验收。原失败及停止/清理回执保留。

实际进程完成后再登记最终结论；固定生产浏览器/既有Worker49等证据不替代本片。产品配置写入0、付费0、部署0，47 HOLD和103实验线隔离保持。完整RFC仍ACTIVE；混合版本、双槽、实际绑定和授权上游继续独立验收。


## 在真实SIGKILL中确认的产品缺陷与修复

旧scanner发送POST后被SIGKILL，原task保留queued/sending，lease自然210秒到期。替代Worker仍把queued+无upstream_id统一作为新claim；发布活动中的旧active/unknown记录正确地拒绝新付费claim，于是任务也无法走到既有creation_unknown分类。实际失败保留第二轮日志，不能把未重发等同恢复成功。

修复集中在视频模块的`videoRecoveryAdmission`：只有v2/v3已非prepared、无上游回执的任务作为continuation进入原恢复逻辑。原`videoCreationRetryConfigMatches`仍拒绝这些任务重新POST，只将原任务转待核查；旧release activity和Worker UNKNOWN记录不修改。prepared、legacy、未知未来版本及已回执的原分类全部保持。两个实际恢复入口复用同一函数；13输入×2路径反控覆盖这一精确变化，并注册到既有回归目录。

产品修复必须重新固定镜像；旧d4镜像中的五项部分通过和最终失败不作为修复版完整通过。新固定版本、实际重跑和回滚继续追加。
