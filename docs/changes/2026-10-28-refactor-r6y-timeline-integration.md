# R6Y：多轨工程接入既有 Canvas 与媒体 owners

## 固定输入与当前状态

- 工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 原始重构源码 `e1501cbd973f41c81d3a0d7d0add4878c971488d`，4817 个原始文件及 SHA256 已保存于 `output/refactor-r6y-20261028/BASELINE.json` / `BASELINE_SOURCE.tar`。
- 固定 main `294beac9862f9877d763afd12d29ca83a544adfd`，3 commits / 45 paths；11 处 merge 冲突的三个 stage 原文保留在本轮证据目录。
- 当前为实现与集中验证阶段。上一轮 R6X 的 83/125/37 不作为本轮验收结果；本轮未合 main、未部署，47 HOLD 保持。整体重构目标 active。

## 模块、接口、数据与事务归属

1. `timeline/project` / `edit` / `render` 保留已完成的纯工程、媒体配方、剪辑、预览和 FFmpeg 规则。节点 revision、原操作及冻结导出归 `canvas/timeline-node-*`；报价、预留、执行、恢复、取消及结算继续归原媒体 job。
2. `canvas/timeline-actions` 接管创建、字段补丁、上传、render/adopt 尝试身份。公开 `bind(scope, ports)` 依赖现有节点 store、素材、history 和 media-job ports，不导入 React/Next/DB。原 operation 的未知受理不换号重提；采用保持显式操作，不自动覆盖后来的草稿。
3. Canvas 只持 React 订阅与编辑器显示状态，组装原 `CanvasDocumentScope` 及端口；不新增 timeline render/adopt attempt maps。
4. renderer registry、scene projection、项目目录、选择、连线、history contract/compiler/controller、node operations/copy/delete 承接新增节点类型，不再复制主线旧 Canvas 巨石中的平行实现。
5. 连线在应用边界读取真实媒体摘要，纯 link compiler 只使用已检验材料；时长/音轨/素材身份不按客户端 URL 猜测。实际历史写入继续走原 controller 的冻结请求、CAS 与原图文版本约束。
6. 多轨原有两表 SQL 保持，由 `canvas/storage-schema` 唯一拥有；`application/persistence` 显式初始化。repository 使用 platform pool 和叶子 snapshot-value，避免新模块经 db/config 大出口形成循环。
7. 复制、混合历史、项目删除保持原 graph 锁及同一事务。事务中读取已解码的媒体证据，真实解码 I/O 仍在锁外；原图片/文字预期版本不回退。
8. 主线媒体取消 ACK 修复转入 `services/media-worker/main.mjs`，旧 CLI 继续只调用原实现；不重建第二个 Worker 或账务体系。

## 已完成与尚待核验

- 已保存原始源码、主线输入、冲突原文及实现脚本。
- 已接入服务端 schema/启动、节点/历史事务、原媒体 Worker 修复与前端命令 owner。
- 集中类型、纯 owner 对照、真实 PG/HTTP/Worker/FFmpeg、实际产品控件和架构扫描尚待本轮结果。
- 本轮四产物、独立副本回滚、固定提交与远端 SHA 以本轮 `DELIVERY.json` 为准，未生成的记录不当作已完成。

## 整体接续

该切片的目标是保留主线已完成能力并降低实际变化传播，不以“兼容可运行”替代职责迁移。整体退出仍需 Canvas 模板/导入及剩余编排收敛、同机性能对照、远端 required CI 的有效证据，以及完整候选整合验收。

## 集中验证与实际发现（本轮继续）

- 全项目 TypeScript、ESLint exit 0；新出现的 timeline scene memo 依赖遗漏已补，旧无关 lint warnings 保留，不通过关闭规则掩盖。
- 纯 timeline owner 17 组 / 70 检查，原音频 owner 18 / 67，原 history 67 / 184，8 项真实菜单、timeline 108 组真实 FFmpeg 与组件真实解码/GainNode/390px/英文只读通过。
- 真实 PG startup 三阶段36检查：原始完整源码42 owners、新版43 owners，热态 DDL=0，钱包预留/UNKNOWN/原报价及待执行任务保持；原 node operations PG32通过。
- 新版及原始源码的 scope receipt 各23通过。补齐的是叶子 import/schema/任务调度等验证端口，不修改产品权限/报价/原回执行为。
- 真实 Next/PG/媒体 Worker/FFmpeg application、非零账务与重启矩阵已通过：原价3、取消7释放、未知回包重启同 job、并发一胜出、失败释放、冻结后改工程及采用结果和删除来源保持。
- 真实整画布先发现 stable scene delegates 漏 timelineEdit，已补；随后发现来源边 identity 与主线不符，已恢复 `e-timeline-input:<target/source>` 对应的原连线约定，并在所有 native nodes 投影完成后生成去重来源边。纯 owner 新增了晚投影视频源和同源多片段反例。
- Windows Next dev 捕获到 layout.js 仅655360字节，而 ETag及磁盘均为5513155；原脚本确为完整文件前缀。双浏览器对完整 identity/gzip 均通过，截断样本均复现 SyntaxError。这是取证，不等于已证明底层截断唯一根因或生产冷加载通过。
- 功能 fixture 现一次预读实际页面及每份真实 gzip 脚本并校验 ETag长度/JS语法后启动控件；没有页面 retry、route mock 或产品压缩配置修改，不将功能验收记为冷启动性能。原始截断、失败屏幕及原始literal全部保留。
- 最新整画布已通过导入、裁剪、原生音频 handle、预览/导出、迟到草稿保留、显式采用和undo/redo，随后遇到一次 Node fixture HTTP ECONNRESET；具体接口与后续完整运行仍待收尾。验证控制请求现使用单次独立连接并记录 method/path，浏览器和故意丢回包请求不改，不自动重放POST。
- 旧 fixture 默认输出曾覆盖本地历史 persistence cold log；精确原字节未捕获，不虚构恢复。原失败副本及影响记录在 EVIDENCE_OUTPUT_FINDING，后续所有入口显式绑定本轮独占证据目录。

当前整体仍 active；新增6项入口已登记原 required core catalog（89项），但本轮89全量、最终Linux镜像/runtime/product-browser尚待运行，不套用R6X的通过数字。
