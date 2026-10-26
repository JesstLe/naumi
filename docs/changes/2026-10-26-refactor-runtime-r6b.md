# R6B：同完整镜像 Web / Worker 实际运行验收

## 目标与固定输入

- 整体重构继续 active，不合 main、不部署。R6A 后第 2 个模块。
- 复用 `0afcde0896915df3535005342b393b742f09a19a` 的完整镜像；不重复构建，也不重新执行 R6A 的 21 项 core。
- `scripts/verify-refactor-runtime.py` 编排自有 internal Docker network、临时 PG、合成图片供应商、完整 Web 和同固定 Image ID 的独立 combined Worker。
- 测试源码仅负责 fixture 准备、HTTP 客户端和数据库观察；不替换 Web/Worker 的 planner、任务、账务、交付实现。编译 fixture 的所有 production imports 必须逐字节匹配镜像输入。

## 验收内容

真实登录及会话、HTTP 冻结报价与提交、排队、独立 Worker 执行、原始图片保存与读取、父子回执与一次扣款；原 6 / current 17；慢供应商期间 Web 可用、第二任务唤醒；暂停与排空、取消后零生成；Canvas 图片字段冲突及 canonical receipt；工作台两个输出及显式取消；四类历史任务恢复、live lease 保留和 UNKNOWN 不重放。

运行使用明确的合成供应商，internal network 无外部出口。原生媒体使用真实 C launcher/FFmpeg：对实际已交付图片转换、完整解码、SHA/像素核对并退休回执，不使用 fixture media engine。此轮不把镜像运行替代真实浏览器控件、持续热态、混合负载、容量、远端 CI 或历史用户个案验收。

## 状态

完整应用镜像实际运行通过 **125 检查**，报告在 `runtime-8/RUNTIME_RESULT.json`。Web/Worker真实source均为`0afcde0896915df3535005342b393b742f09a19a`，同Image ID `sha256:b619066c2db26f015e6e2e52470d0a1da8c805e9606f718ae6bfcce063093c7f`。本轮只新增验收脚本、npm入口及文档，不修改生产src/services；fixture bundle所有production imports与镜像来源hash一致。

- 用户原报价6、current17，两笔23；工作台再交付2张34，总4笔57。四类retained任务只结算3笔18。取消任务、贫余额、UNKNOWN无供应商重放。跨账号读取拒绝。
- 两笔供应商调用处于hold时Web健康5次分别8/7/7/5/6ms；只是本机小样本，不是吞吐或SLO。
- 原图片HTTP字节回读1024×1024、作品已持久化；图片字段冲突409、无关字段合并、重试canonical；文字内容/尺寸三方合并和真实冲突409。
- 相同combined Worker的媒体sandbox真实处理图片并核验输出SHA、像素、probe和410退休状态。
- Worker后台回调未完成时drain明确DRAINING；完成后tick、回执、媒体均空闲，再SIGTERM实际进程exit0。Web/Worker/source身份及实际执行者由容器Image ID与PG tick receipts核验，不凭配置推断。
- 所有尝试的自有容器和网络均清理；最终5容器exit0，临时PG仅在tmpfs中，无持久业务数据。候选镜像与本地证据保留。

## 原始失败与修正

首次元数据读取默认GBK失败，改明确UTF-8；`runtime-1` PG初始化临时socket被误判ready，改TCP就绪；`runtime-2`挂载脚本的sharp解析基址错误，改`createRequire('/app/package.json')`；`runtime-3`测试Worker临时目录128MiB装不下真实media runtime，沿既有部署配置单列2GiB sandbox tmpfs；`runtime-4`fixture未提供managed-mode环境，补内部假控制连接（没有调用控制API）；`runtime-5`验收误读canonical receipt层级，改`.node`；`runtime-6/7`retained旧任务处于legacy执行上下文，需同时保留旧managed ID和legacy env catalog，未重写任务或放宽产品分支。原始exit1和日志全部保留，不称第一次运行通过。

本轮baseline是“旧仓库没有整包运行验收入口”的静态证据缺口，不是产品旧行为失败；新增运行入口验证既有重构应用。副本回滚只恢复旧验收面/文档，不改变已构建应用行为，不把它包装成生产缺陷A/B修复。集中类型检查、四产物、完整4471hash回滚与远端以`DELIVERY.json`为准。

```powershell
npm run verify:refactor-runtime -- --image-manifest output/refactor-r6a-20261026/image-clean/BUILD_RESULT.json --out output/refactor-r6b-next-run
```
