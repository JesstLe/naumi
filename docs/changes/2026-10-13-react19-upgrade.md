# React 19 升级

## 范围与版本

用户于2026-10-13要求升级React19，并明确本轮服务器目标为103.30.76.93。独立受管worktree/分支`codex/react19-upgrade-20261013`，开工基线`47824d64731033c4ac77cf734d36fe0ffa34b854`；随后刷新main到`5e0bb2882694dfb7b2ef1b3fe61f6440cc01ed5c`，新增README/截图文档不覆盖。

- React/React DOM固定19.3.0，类型包固定19.3.0。
- Next及eslint-config-next固定15.5.27。Next14不声明支持稳定React19，不能只改React版本或使用legacy-peer-deps绕过。
- Lucide固定0.475.0，保留现有组件API，并取得稳定React19 peer支持。其他直接依赖保持原值。
- Next App Router使用框架自带的React19.2 canary构建；独立React/React DOM包为19.3.0。未替换Next内部打包依赖，不把npm包版本称为App Router内部精确运行版本。

来源：[React官方迁移指南](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)、[Next15迁移指南](https://nextjs.org/docs/app/guides/upgrading/version-15)，以及2026-10-13读取的npm精确版本/peer元信息。

## 必要兼容调整

headers/cookies改为await；服务端locale调用同步适配，保留cookie优先于Accept-Language。页面searchParams及动态API params采用Promise，保持旧登录/注册/brain跳转查询、模型回调、媒体/下载、竞品和任务接口行为。内部直接调用媒体路由与既有fixture传Promise。

Next原生依赖配置改用正式serverExternalPackages。React refs显式初始化，按钮RefObject类型允许null，JSX使用React命名空间。新版Next lint发现两个已有首页a链接，改用文件已导入的Link。没有数据库迁移、供应商调用/价格/范围配置调整，历史冻结任务、私有媒体鉴权和ComfyUI保留。

## 已完成验收

- npm依赖树React/React DOM/类型去重一致，无invalid peer。
- 非增量TypeScript通过；正式Next build编译/类型/静态生成83/83通过，既有hook/img警告保留。
- 新`verify-react19-upgrade.mjs`在正式构建上验证五页面英文/中文cookie与header优先级、三个旧入口查询跳转、七个动态鉴权/路径拒绝及无效上游回调；真实浏览器首页/生图/工具/隐私和390px工具页水合，无客户端异常、无横溢、无sync-dynamic-apis警告。
- 完整画布浏览器定向6项：真实React Flow/Agent SSE呈现、attention、EOF失败、ABORTED、小球拖动与390px侧栏通过。供应商响应为隔离fixture，真实模型消费0。
- 私有媒体/直传/下载/ZIP匿名与遍历拒绝、222项小球模块、2625项Dock矩阵通过。
- 仅覆盖升级相关路径，未重跑同事全量26工具/供应商/计费验收。

证据：`E:/workspace/naumi/output/react19-upgrade-20261013`。首次正式构建被旧a标签lint阻止，修复后通过；生产smoke首次误期待未配置后台403，实际既有隐藏策略为404，按原鉴权策略修正fixture，不改变权限。

## 服务器与发布门槛

103只读核对App/Worker仍为`1d21508e27f5b9171a61398519d949174596b603`，版本1791860709，约33%磁盘使用/75GiB可用，内存约5.8GiB可用。原私有R2、数据库、媒体、渠道和网关保留；不连接120、香港或101。

最新`docs/RELEASE_RUNBOOK.md`明确要求常规发布先启动并验收新槽、平滑切流、旧连接/活动Agent/任务排空、旧JS/CSS及RSC兼容。当前`deploy-fixed-image.sh`仍直接重建App，蓝绿/活动会话归属/Worker交接/旧Next协议版本路由尚未实现。本轮React/Next跨大版本不能按历史直接重建流程宣称连续可用。候选构建与发布结果须在实际完成后追加，当前不声称线上已升级。

维护：本轮尚无成功发布，103原维护计数1保持；文档提交不计发布。本机C/E均超过190GiB可用，无需删除其他同事文件。开发功能迭代计数1，合并前已重新fetch。

## 接手

刷新main和实际103镜像/配置；不要照抄旧120发布地址。使用固定clean SHA，保留私有R2和最新模型/积分/元数据；完整Naumi/Hub部署锁、可读DB/env/Compose备份、兼容回滚后，按RELEASE_RUNBOOK完成安全连续切换。不能重放已接受任务、回灌测试库或强刷有未保存内容的画布。当前未合入的imagegen-capabilities分支只有设计/计划，四条历史回滚分支亦不混入产品。
