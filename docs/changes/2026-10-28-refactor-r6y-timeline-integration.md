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


## 固定应用源码的整画布收尾

固定应用提交 `8d4e0e8cca15d168397d5f8456bbc71f84900866` 的真实整画布已通过（`TIMELINE_NATIVE_CANVAS_CONTROL_FIXED_RUN.json`，exit0）：纯多轨项目创建/深链/刷新，真实素材导入与双端裁剪，原生音频 handle 与来源边，实际预览和私有成片像素、GainNode混音，丢受理回包且job列表离线后的同operation/job恢复，后到草稿保留，明确采用与原undo/redo，成片handle/@引用生成视频，删除后的原任务replay，以及拖动/锁/复制删除和撤销重做。实际媒体扣款3，模拟供应商create1，真实付费调用0，pageErrors0。

来源边恢复原 `e-timeline-input-${timeline.id}-${source}` 身份；同源多片段只显示一条边，源节点投影顺序不再影响连线存在。稳定scene回调与新memo依赖均已补齐；不通过改掉旧验收预期掩盖产品接线问题。

本轮新增6项验证入口已接原catalog（现89项）；这里只交付该完整模块与相邻链路的已验证源码，不宣称89全量或R6Y Linux镜像、runtime、双浏览器整站门禁已完成。源码四产物、4817原hash的副本恢复、远端及资源状态以本轮 `DELIVERY.json` / `LIVE_HANDOFF.json` 为准。整个重构目标继续 active；下一轮先跑固定源码完整门禁，再继续实际Canvas模板/导入和原生节点共享生命周期的变化传播收敛。

## 完整固定候选验收发现：Linux 多输入线程作用域

固定 `d9e96c01828cee317006e01b208029a409968ac5` 的核心89项实际执行（复用0）通过，完整生产 Dockerfile 的 Linux Web/direct Worker 打包通过；这两层没有替代运行验收。扩展实际 Linux 多轨合成时，同一镜像中的四源配方报 `Parsed_scale_39 / Resource temporarily unavailable`，原始失败与退出1保留在 `output/refactor-r6y-20261028/RUNTIME_RUN.json`，临时容器及网络退出清理通过。

同镜像、同配方、同沙箱和2 CPU/1536MiB容器的四组实际对照：原实现失败；仅补每输入2线程成功；仅补编码输出2线程仍失败；输入/输出均补成功。原 `nativeMediaArgs` 的 `-threads 2` 是下一个文件的 codec 参数，只约束首个输入，后续解码器仍自动扩展。采样到的进程线程峰值不是总资源或容量测量，不据此推断10万用户性能。

修复仅落到既有纯媒体 contract owner：每个输入和输出文件组先放入原有2线程默认值，再保留配方显式参数及流选择器的覆盖顺序；`ffprobe` 保持原字节，简单/复杂滤镜调度不变。没有修改沙箱RLIMIT、队列、并发、报价、钱包、Canvas配方或Worker引擎，也没有新增业务限制。新增纯合同验证旧3检查复现首输入作用域、新18检查覆盖多输入/多输出、显式参数优先、辅助文件及原错误。旧负例准备中误预期嵌入路径错误，实际原合同返回 `VIRTUAL_MEDIA_PATH_REQUIRED`，已修验证预期并保留失败exit1。

原镜像挂入修复contract的定向原生实验已成功，仅作为源代码overlay验证，不冒充最终镜像验收。四源像素/混音/源hash/退役回执验证现接入原 `verify-refactor-runtime.py` 与原 runtime fixture；移除新增块后原125检查体字节完全相同。素材向量必须来自同commit/digest、PASS的core报告，不能挪用旧候选结果。原core目录新增媒体默认值条目后为90项。最终固定源码 core90、重新构建、同镜像原生多轨/runtime与产品浏览器验收待本轮执行，旧D9的89与旧运行失败均保留，不套写成新候选通过。

最终收尾证据独立写入 `output/refactor-r6y-20261028/delivery-final/`；此前根目录四产物保持原模块检查点不覆盖。整个重构仍active；Canvas模板/导入和共享原生节点生命周期、同机性能、有效required CI及整体整合退出仍待后续。

## R6Y最终固定候选验收（2026-10-28）

固定应用源码 `32cd25de7d2097efd417351ae796cb6b49fa16a8`，digest `91667c31938457f94ba0e5ae6575745fd185060742859fc5f89423f1d4844719`，完整Linux镜像 `sha256:1c0065bc4e2647d315ac3c6cfc76a0d7cf75067f5dc9ed3a2ad6d6c8888dc7bb`。此前D9镜像的原生多轨失败未改写，修复后使用生产Dockerfile重新构建并完成同镜像Web/direct Worker验收；没有以contract overlay实验代替最终打包结果。

- **core90/90，failed0、notRun0，exit0**。宿主测试进程中断后，保留原未完成报告，核验进程已退出与自有fixture归属再排空/清理。原同源50项经相同commit/digest/环境及日志SHA验证复用，恢复后实际执行40项；不记成90项全新执行。旧场景未完成用例重新执行，素材向量五文件逐字节复制并校验四源hash，来源见 `CORE_RESUME_PROVENANCE.json`。
- **运行177项，exit0**。原125检查体保持，新增真实Linux四源合成52检查；输出320×180、3.5秒，五处叠加/转场像素对照通过。440Hz实际增益0.501022、660Hz实际增益0.247949，后段静音、四源hash不变及PATCH退役后GET410通过；没有替换镜像内媒体引擎。
- **完整产品双浏览器37检查，exit0**。实际登录、图文冲突/共享undo-redo、原位版本、原任务交付、剪贴板、三视图及Comfy工作流通过；7笔fixture交付/7笔42积分，弹窗0、页面异常0、外部供应商付费调用0。60秒混合读取是本地回归，不是容量或稳定运行SLO。
- 全项目TypeScript与本轮4文件ESLint exit0；实际源码扫描四类SCC均0。纯线程合同旧3复现、新18通过，原始预期错误、Linux真实失败及进程中断均留证。
- 根PG在core终止后核验其他连接0、随机schema0，再移除精确ID/label的自有容器；最终runtime/browser均完成同镜像Worker POSIX排空exit0，并删除各自容器与网络。中断前自有浏览器/场景fixture也已单独核验清理，未操作其他资源。

最终源码/补丁/验证/副本回滚交付位置为 `output/refactor-r6y-20261028/delivery-final/`，原根目录四产物保持封存不覆盖。完整源码、原4817hash恢复、后到编辑写0保护及最终远端SHA以该目录 `DELIVERY.json` / `VERIFICATION.txt` 为准；本段之后的文档提交与固定应用镜像分别绑定，并验证非docs字节相同。

**整体目标仍active，不合main、不部署，47 HOLD不变。** 截至本次fetch，main为 `b6b5af3b1b2cc3d7f9519e0035623f01cb5342b4`，相对于本轮已整合 `294beac9862f9877d763afd12d29ca83a544adfd` 尚有6条提交；先完成本轮固定候选，再在下一完整模块前普通整合，不在集中验收中移动源码。

🔴 **独立重构分支已超过48小时尚未合main。** 原因是用户要求持续独立整体重构，Canvas模板/导入、剩余共享生命周期的变化传播、同机性能、有效required CI及最终整合退出仍未完成；不是已经宣布整体完成的普通修复。下一切片复用现有document scope、artwork/text document、image-imports与history，收敛模板与工作流导入的异步归属及已创建回执恢复，不另建导入队列/历史系统。只读定位见 `NEXT_SLICE_READONLY.json`，尚未冒充实现。
