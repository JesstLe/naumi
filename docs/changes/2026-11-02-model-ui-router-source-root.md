# 经典模型浏览器验收：Router 来源路径归属

## 实际入口与反例

基线为 `61ef32cc18a6cd14948743f2c7c00bb4846b781e`。新头 Image 验收在第18步 `Business admin publication and feature model browser acceptance` 失败，原始注释为 `Fixture Router build failed`。工作流传入相对 `NAUMI_VERIFY_ROUTER_SOURCE=output/model-config-20261004/router-source`，而共享 runner 将 fixture cwd 切到隔离源码副本；pinned Router 的输出目录不属于该源码副本。

受控反例调用原共享 runner 与真实 `spawnSync(go build)`：Router 位于调用方输出目录，子进程仍收到相对路径，Go 启动尝试因 cwd 不存在返回 `status=null/error=ENOENT`，fixture setup 失败。该实验没有启动 Next、连接 PG 或请求供应商；本地回环数据库 URL 仅满足原 fixture 入口校验。

## 职责与实现

- 调用方拥有外部固定 Router checkout 的路径，runner 拥有 source copy、IPC、随机端口和子进程清理。
- runner 只在组装 childEnv 时按原 caller root 解析 `NAUMI_VERIFY_ROUTER_SOURCE`。相对路径正确指向原输出目录；绝对路径保持其目标；缺省语义与调用方 env 对象保持。
- fixture 仍在隔离源码副本执行，不把 Go 源码复制进每个源码副本，不修改 Router、供应商、数据库、生产存储或任务协议。
- 现有 `verify-model-ui-runner.mjs` 已注册到 core，新增两 profile × 相对/绝对路径四种实际子进程场景。原成功、checker失败、setup失败、超时、cleanup失败、后续编辑、外来marker和端口检查保留。

## 验证与交付

基线、修改版、独立副本回滚、真实离线 Go 构建、正式生命周期验证、语法/lint检查及四件重开产物，见 `output/model-ui-router-source-root-20261102/VERIFICATION.txt` 和 `DELIVERY.json`。这些受控验证不替代新提交的真实 Next/PG/Go/浏览器 CI。

本任务独立工作树，不覆盖 `E:/Workspace/naumi-refactor-20261024` 中正在进行的付费断线浏览器验收，也不混入另一份草稿上下文修复。历史3fa作业的1小时超时及后续路由生命周期修复另行保存；取消不是通过，后续被跳过的步骤不计完成。未合main、未部署，47HOLD。

## 已完成的集中验证

- 相同受控目录归属反例：原 runner 的真实 Go 启动尝试因 cwd 失效返回 `status=null/error=ENOENT`，exit1；修改版实际离线最小 Go 模块编译 exit0，fixture/checker/IPC清理通过。
- 已注册生命周期回归：128 检查通过，原104项保留，新增两profile × 相对/绝对路径四场景；caller env、隔离copy cwd和外部marker均核对。
- 原统一runner合同：20场景、367检查通过；两个MJS的Node语法检查、定向lint、diff-check均exit0。
- 原2,149个产品文件raw SHA全部保持；只改变两个验收MJS并新增本文档。未重跑全项目TypeScript、完整Next构建或整版core，不借用旧通过冒充新头验收。
- Go实验编译的是离线最小模块，不冒充完整pinned Router/Next/PG/浏览器。新头真实CI仍须独立完成。
