# R8N：共享模型目录与身份生命周期

## 模块、调研与原始基线

工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`，原始源码 `033fdef0903cb10d88703640e13c0a278d01ffc9`。5,297 个 tracked 文件原始 raw SHA、完整 tar 与独立原始副本保存在 `output/refactor-r8n-20261031`；开工刷新 main 为 `e2f56255`，R8L 同步后第 2 个产品模块正在实施。

原 `feature-client` 同时维护 FeatureId 全局 Map、HTTP/偏好存储、选择规则和每个 hook 的局部目录/错误状态。effect 只依赖 feature，账号或工作空间切换不使旧目录退休；ensure 与 hook 对同一目录可能呈现不同状态。authHeader 和 response.json 等待没有读身份约束，旧 selector callback 也没有原生命周期归属。ImageQualityProvider 只按 email 重读配置，Canvas 自己的模型投影又可能保留旧目录。

首轮实际 React/AuthProvider/workspace/quality-provider 原始复现 14 项、10 处生命周期异常。首个 fixture 缺少浏览器 process.env 定义，启动失败 exit1 原日志保留；只补明确的浏览器环境端口后完成复现。后续新增 logout、同邮箱/工作空间 ABA、质量配置迟到、Canvas 本地投影与 click-before-effect 组合，最终运行数字以本轮 VERIFICATION 为准。

当前 `/api/models` 发布目录仍是原服务端公开配置入口，本片不把受控账号/空间响应差异写成已证实的线上跨租户泄露；它证明实际客户端生命周期和迟到响应控制。服务端权限、目录与计价规则未改。

## 公共接口、依赖与状态归属

- `model-config/feature-catalog` 唯一拥有当前生命周期的目录、选中项、Canvas image/text 联动、inflight 和订阅快照；纯 TypeScript，不依赖 React、Next、HTTP、浏览器存储或 auth-context。
- `feature-catalog-browser` 适配原 authHeader、原 GET /api/models、工作空间 revision 和可选 localStorage；每个应用只有一组刷新/focus/visibility 监听，仅刷新被订阅 feature，同 feature 请求合流。旧请求 finally 只能删除自己登记的 promise。
- 原 `feature-client` 保留真实调用方正在使用的函数、事件名和 FeatureCatalog 类型重导出，改为窄 React 订阅入口，不再维护第二套 Map 或每 hook 的目录副本。
- 现有 AuthProvider 在其真实 persist、登录、退出、恢复和 session-ended 路径发布目录读身份。此通知只为读状态分区，不建立会话或授予权限；不引入新的认证系统。身份/同邮箱重登录与 workspace revision 分别组成读生命周期，ABA 不复活旧请求。
- ImageQualityProvider 复用同一个 scope，配置值带 scope 标记，换空间即不再呈现旧配置；auth、JSON 和并行刷新都核对原请求身份。它继续拥有原 config/quality 状态，没有第二套配置缓存。
- Canvas image-model hook 的 model/options/resolution 按同一 scope 标记；旧 pick/resolution callback 不写后来的编辑会话。原 node-draft 仍拥有提示词、比例与文档草稿，模型规则不再 type-import React 入口。

原 managed/legacy 语义、模型家族合并、默认/保存选择顺序、完整目录元数据和管理员 cutout 语义保留。暂存目录不跨身份复用；失败保留真实 error，而不是成功空目录，原已失效选中项不再用于报价输入。

偏好仅按 actor/workspace 持久化，session epoch 不进入偏好 key。旧无归属的 origin-wide preference 只迁给第一个读取它的非匿名 actor/workspace；迁移标记阻止每个后续账号重复继承，返回原 actor 可恢复自身偏好。存储访问异常不阻断内存选择。旧无归属值不被当成权限或任务身份。

## 保持及未完成项

没有新增业务限额、用户确认、模型自动替换、报价/任务/钱包/保存/目录服务；没有改服务器路由、供应商能力、当前售价、冻结 plan、素材授权、UNKNOWN 或付费 POST 重试语义。UI 文案与浅色布局不改。

集中验证将覆盖实际 React＋真实身份入口/原工作空间、正常目录/选择逐值对照、原 Canvas 模型/质量/报价/任务回归、类型和依赖图。原始目录/auth/config/账务读端口分别记录，不把 fixture 当生产或 10 万容量证明。完整固定镜像与整套运行边界由最终证据给出，未运行项不借历史绿灯。

整体 ACTIVE，未合 main、未部署，47 HOLD。候选分支超过 48h，按用户完整重构版本要求保留；剩余 Canvas Shell、R8J 调度等待诊断、持续混合/真实生产容量、有效远端 CI、最终 main 整合和整版验收仍待。

## 模块集中预检

最终扩大原/新实际 React 组合到 20 项，原始副本复现 15 处生命周期异常，新版同组异常为 0；四组完整正常目录/选择/元数据快照 EXACT。真实 AuthProvider、workspace、ImageQualityProvider 和 Canvas model hook 均执行；HTTP/auth/billing/browser-cache 为明确读端口，不冒充生产。未新增付费 POST。

全项目类型 exit0，lint exit0。初次依赖图在尚未 git add 的新文件上有未解析边，不能用它冒充完整图；固定 tracked 源后重扫。原文本反馈验证器的实际 feature-client 直接调用补齐新的 document EventTarget 读端口，OCR 合流/空目录语义断言不改；原 Canvas model DOM fixture 补同一账号/workspace scope 端口，原 12 项/正常快照与规格断言不改。
