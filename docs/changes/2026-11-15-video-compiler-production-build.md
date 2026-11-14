# 视频编译架构：固定 Linux 生产构建与包验收

## 模块与职责

在完成输入等价与Worker原子状态修复后，从main固定提交 `dcbb94944be5b4fa451c15fd9d9525f12b65d0d8` 执行 `git archive` 导出干净上下文，使用现有Dockerfile完整构建生产runner。本切片没有改变产品实现或绕过构建检查。

- 构建版号：`1794674158`。
- 基础镜像：`node@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c`。
- 本机镜像：`naumi:video-compiler-local-dcbb9494-20261115`。
- Docker image ID：`sha256:6f30934eababf502252d77686ce2e8917fd932995fb4d7f2999b0d12d2a7a145`。
- OCI config：`sha256:359cbf8c73272ec9d8a0b1f3eae56093ebe170dd2aad8c49cf5af01e4f796485`。
- 平台/运行用户：Linux amd64 / nextjs；Node24.22.2、Next15.5.28。

## 公共接口、依赖方向、数据与状态归属

沿用 `npm run build`、`npm run build:worker` 以及 `scripts/verify-application-worker-package.mjs`。Web采用Next standalone；独立应用Worker采用既有 `createDirectWorkerApplication` 入口，不穿透Route。媒体runtime继续由Dockerfile构建，不替换现有协议、存储或任务实现。

运行验收容器使用 `--network none --read-only`，只给临时目录tmpfs；没有数据库、生产配置、供应商凭据或媒体挂载。HTTP检查从同一个容器内访问真实standalone监听器；这里明确验收无数据库启动，不把health200当作数据库/托管模型验收。Worker运行测试通过只读挂载固定提交中的五个测试文件，产品实现读取镜像内文件。所有临时验收容器已退出并移除，已有fixture PG保持运行。

## 实现及验证结果

证据根目录：`E:/Workspace/naumi/output/video-compiler-production-build-20261115`。

1. 完整生产Docker构建退出0：公开说明40项、原生参考工作台资源、Next编译/类型检查、97个静态页面、standalone追踪、独立Worker打包及依赖闭包、媒体sandbox/runtime和最终runner均完成。构建日志保留ESLint警告，没有把“构建成功”写成“零警告”，也没有关闭lint或类型检查。
2. Worker构建含2512个输入、2个外部依赖，bundle 4,831,743字节，SHA256 `e880f3c1cc80d9a4bb2664bcaf0564194f7b05c405a4d71d6092bddfde09233a`；`HTTP_ROUTE_INPUTS=0`、`PARENT_DEPENDENCIES=0`。pg8.20.0、sharp0.35.5在镜像包内解析。
3. 实际读取镜像Worker manifest，对其中574个tracked src/scripts输入逐一核对其与固定git archive文件的SHA；其余输入是锁定依赖，不把2512全称源码文件。
4. 同一镜像中Linux Worker49项通过、退出0。包括实际HTTP Worker进程干净重启、SIGKILL后原UNKNOWN身份保持且不重复POST；不声称这一项已经覆盖combined direct应用Worker活动中断。
5. 真实生产standalone7项检查通过、退出0：版号/commit、无外部集成health、`/video`与`/canvas` HTML、页面引用46个JS/CSS全部200、Worker bundle哈希/无Route输入，以及实际导入包入口。共50次HTTP均200；没有浏览器水合、登录或DB/生成行为，不把HTML/静态资源响应当完整页面交互验收。

原始完整命令、构建输入、镜像inspect、Worker manifest、HTTP响应/hash及逐字结果见 `BUILD_INPUT.json`、`BUILD.log`、`IMAGE_INSPECT.json`、`LINUX_WORKER_COMMAND.json`、`LINUX_WORKER49.log`、`PRODUCTION_HTTP_COMMAND.json`、`PRODUCTION_HTTP_RESULT.json` 和 `RESULT.json`。

## 未完成项与下一步

固定Linux生产构建及上述包验收已通过；此前96项完整Next/DB/Worker/浏览器组合运行的是development Next，不能自动视为固定生产镜像的96项通过。接下来仍需带隔离数据库的生产镜像全链路、完整Storyboard编辑/重构/审片/成片和报价确认按钮、全部实际启用/env-only绑定审计、combined direct活动中断、新旧Web/Worker与历史v2/新v3混合、排空/回滚/旧资产，以及有授权的真实上游和目标站蓝绿验收。

旧development缓存冷加载异常仍未建立根因；固定生产构建和静态资源通过不宣称修复了该异常。所有付费调用0、生产配置/数据库修改0、部署0，47 HOLD继续。总目标ACTIVE，镜像是本机构建产物，不是已上线版本。
