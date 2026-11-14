# 视频编译器真实Web与独立应用Worker

## 模块与职责

本切片把函数级 App 验证推进到真实进程边界，并修复组合 Worker 环境投影漏传参考媒体公网入口。不是新增视频能力矩阵，也不是放宽媒体鉴权。

## 根因及实现

`scripts/direct-worker-settings.mjs` 的显式 scanner 环境白名单保留了 `MEDIA_PRIVATE`、`MEDIA_REMOTE_ACCESS`，但遗漏 `VIDEO_REFERENCE_PUBLIC_BASE_URL`。因此 Web 和直接启动 Worker 能读取同一配置，而生产组合 supervisor 启动的 scanner 丢失签名媒体入口。实际 Next 已受理 v3 图片任务后，投影环境中的独立 Worker 报 `VIDEO_REFERENCE_PUBLIC_BASE_URL 未配置为外部媒体访问入口`，任务仍 queued，供应商未发送；原本是启动配置被丢弃，不是上游图片能力不足。

修复只把该字段加入已有白名单：沿用管理员现有值，不生成默认公网域名、不更改已发布 Binding、不将其传给原生媒体子进程。不存在的配置仍保持不存在，未知变量/密钥不会因修复而整体扩散。

## 公共接口、依赖、状态与事务归属

- `directWorkerEnvironment(env)` 继续是 supervisor→scanner 的显式配置边界；`combinedWorkerPlan` 使用它，不依赖视频领域实现。
- 视频身份、参数编译、媒体签名、任务/Creation/账务及租约仍由各既有 owner 负责，没有新增事务/队列或内部 HTTP 任务自调用。
- 独立应用 Worker 运行真实 `build-application-worker.mjs` bundle，扫描并消费原持久化任务；Next 保持 worker 模式，只受理与查询。
- 新验收脚本生成独立schema/媒体目录，启动自己的Next dev、应用Worker和媒体Worker，清理必须取得每个子进程终止回执后再关闭池/删除自己的schema。任务和媒体留在证据目录，不触碰共享开发服务。

## 验证范围

`verify-video-compiler-process.ts --projected-worker-env` 的14项真实进程检查覆盖 Web中间件/API/Cookie、预览零副作用、冻结型号/凭据/售价、一次参数映射、同操作并发、真实签名媒体GET与原始hash、独立Worker持久tick身份、drain与两次重启、原回执查询/真实解码落片、下游Canvas节点/父子资产/账务、取消与显式retryOf、LIVE lease及sending/UNKNOWN不重放。3次成片对应3笔41积分fixture账本；没有付费上游。

`verify-direct-worker-runtime.mjs` 新增投影保真、未配置不造值、媒体子进程隔离用例，连同Worker runtime共34项；追加非受理与恢复进程共43项集中通过。`--browser` 额外使用真正Next `/video` 和Edge/React/真实API，4项检查已通过：实际会话/历史水合、原请求4K参数显示、保留普通reference的历史复用/当前17积分报价、390px草稿与报价保持；pageerror0、额外供应商调用0。浏览器不替换任何HTTP/React组件。

证据：`E:/Workspace/naumi/output/video-compiler-process-20261114`。原始基线真实进程复现、环境丢失断言失败、修复后结果、失败驱动日志、完整类型与解压/回退命令在最终 `VERIFICATION.txt` 中记录。早期driver缺Worker密钥/初始站点配置、签名媒体模式未设proxy、Windows环境类型、观察期内页面未发起水合请求等失败均保留；未因此改业务校验或伪造页面成功，最终实际浏览器有独立结果。引用 [逐项验收账本](2026-11-14-video-compiler-acceptance.md)，不把这一切片称为全部P4完成。

## 未完成与发布

真实Next dev不代表生产固定构建；应用Worker与媒体Worker虽为真实独立进程，但Windows媒体fixture不代表生产Linux沙箱/资源验收。剩余全入口浏览器矩阵、全部实际无Profile/env配置迁移、A19双槽兼容及授权真实上游/蓝绿继续。47HOLD和103隔离实验分支保持，生产配置0、付费0、部署0。四件套及本轮原始SHA/副本回退以最终证据为准。
