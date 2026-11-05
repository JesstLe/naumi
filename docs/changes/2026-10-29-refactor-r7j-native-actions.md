# R7J：原生节点领域入口与三模块主线同步

完整基线2799b489。延续整体重构，不复活旧Canvas/db/storage单体。视频create/patch、角色/场景create/patch/upload/reference、导演create/patch/output移出React；音频/多轨已在原actions，保留其render/adopt与原native document。

## 所有权与依赖

- native-edit-commands只收敛角色/场景/导演已经重复的节点创建、CAS修改和scope绑定history，不持有节点数据、网络、任务或价格。
- reference-asset-actions组合原character/scene定义与提示词、素材端口及草稿准备，不调用付费生成。
- director-actions持有输出File的原上传/定位/attach attempt，按document scope和节点分区，原结果/定位回执/冲突重读规则保持。
- video-node-actions只由当前catalog构造native draft；loading只刷新不排队，旧模型和任务提交/报价仍原owner。
- Canvas保留editor显示/选择、DOM坐标和原模块端口，不再私自写上述领域请求；共同location/reveal/draft是UI适配，不是另一套状态或任务系统。

明确修正：晚到视频create不再抢当前项目；同File跨账号/workspace/project不继承旧artworkId。scope.documentCurrent与viewCurrent分别用于原history和当前界面，不增加用户确认、业务上限或价格检查。

## 验收与整合

新脚本执行实际Canvas入口、实际bindings和actions，仅I/O为夹具；对原创建/修改/reference的请求/history/文件字节做完整基线对照，另覆盖晚到与缓存隔离反例。最终真实PG/Next、集中矩阵、类型/SCC与回滚以本轮VERIFICATION为准，不预填通过数字。

本片是R7G同步后第3模块，完成时刷新并普通整合主线。各incoming修改必须迁入既有history/text/pending/platform/billing/agent owner，不恢复main旧大文件。记录准确main SHA、冲突、验证和未完成状态；Git合并/推送不当作部署。

四产物为MODIFIED_FILE.tar/DIFF_FILE.patch/VERIFICATION.txt/可执行ROLLBACK.sh，只在独立副本回滚，原工作区留新版。分支超过48小时因用户明确持续独立整体重构，完整版本退出未满足，整体ACTIVE、未合回main、未部署。完整目标还需最终全量集成、Linux/性能容量、有效required CI与主线交付；历史媒体原生errno仍OPEN。

## 三模块同步：主线 cb1d2f4932e402a75511485173027ed049ed342e

R7H/R7I/R7J 达到三模块同步点；从 d274d588 普通 merge origin/main，保留五个冲突的 base/ours/theirs 全文在 output/refactor-r7j-20261029/CONFLICTS。冲突不是选择 ours 后丢弃 main：逐条 incoming patch 已迁入以下 owner。

| 主线行为 | 迁移后的职责归属 |
|---|---|
| 空白创建 undo/redo、local/mixed delete、原 nonce 重试、slot 消费历史 | history-model/controller、node-commands/operations；Canvas 仅调用与选择/视图适配 |
| 隐藏失败卡不在返回项目时复活 | pending-presentation 自有 hidden/retained 状态；generation-presentation 自有显示/位置，无第二份 task/receipt |
| 删除键、失败卡选择、混合右键删除、空项目保持 undo 入口 | keyboard-command、selection、scene-projection 与 Canvas 薄适配 |
| 文字失败原因独立存储、刷新/撤销恢复与 field CAS | persistence/schema、text-node-repository、text-write/history-contract；UI text renderer 接 error |
| 五项反推先全部出 slot、逐项失败、导航停止未提交项、单批历史 | 既有 text-task/controller；保留原结果/operation，不把 main 的旧 paid HTTP 闭包搬回 UI |
| 上传原 ID 续同步、workspace 归属、读取后导航 | 既有 image-imports；不建 pendUploadReceiptsRef 第二份存储 |
| FIFO 只扣 funded prefix、旧入口共享 debitTx | billing/repository 自动整合，wallet-balance 兼容入口迁移；不恢复 db.ts 旧循环 |
| 借出/关闭中 PG 连接 error 观察 | platform/db/pool；db/connection 仍 export facade |
| 非冲突 Agent SSE/markdown、BI 用户 mutation、ops 分页/deadline | 保留 Git 自动整合结果，逐项运行原模块验证，不复写实现 |
| OCR 显式可见 vision 模型不再依赖旧 binding | requests 保留主线判断，featureDefaultModel 直接依赖原 policy owner |

主线新验证脚本原先从 db.ts/Canvas 旧大函数提取规则，现绑定真实 owner；原13项节点历史断言全部保留，补 slot consume 与 ACK 期间新执行反例。纯展示 store 浏览器夹具的删除端口使用真实 local-history compiler，不复制删除规则。真实 text PG 使用完整 schema、CRUD/history handler 与 field-CAS，非旧 SQL 手写替代。

本次类型检查首次除已知 R7J generic 类型外，还暴露自动合并遗漏 featureDefaultModel import，已经补回 policy owner。第一次 local-history 新夹具漏 process.env，只补夹具环境。上述失败原日志保留，不改写为成功。

截至本记录：工作中间矩阵 native12、history67、nodeops19、text任务/图片导入、secondary50 已通过；text failure 真实PG10项通过；TypeScript exit0。最终同SHA矩阵、控件、完整产物与副本回滚见 VERIFICATION.txt，未运行项不提前填 PASS。该 merge 为 incoming main 到独立重构分支，不是重构合回 main；47 HOLD 不变。

### 集中PG暴露的同operation并发受理

固定85278f07的35项受影响矩阵在22PASS后发现import-owner-pg：五个相同 operation 并发HTTP响应为200/503/503/503/503。原始日志和新增逐响应诊断保留。实际调用链为withCreationOperation先startCreation，创建记录在导入owner的回执锁之前发生，竞争唯一source identity；不是模板重复插入或导入owner丢回执。

仅将withCreationOperation的受理入口由startCreation换为既有claimCreation。复用现有creation-accept identity锁、同事务scope核对和原creation记录，随后仍执行原领域receipt-aware操作；不另加表、任务、用户确认或任意重放。修正后真实原HTTP/PG63项全部通过（包括五并发同ID、owner/scope负例、导入故障回滚、准备不持事务及bulk61/100/200）；该结果不是生产验收。

另一次浏览器启动在创建page之前因系统页面文件不足退出，保留失败证据，未将其当产品逻辑缺陷；重启后同SHA恢复运行，已通过此前浏览器入口。最终固定版本统一重验，不把不同SHA和恢复记录混合为一个全绿报告。


### 继续验收与第二次主线刷新

2026-10-29 再次普通整合 main a5fe1c672323bffdb01baff66f5e3b69c1da3085。六个冲突三方全文保存在 MAIN_REFRESH_CONFLICTS。保留媒体/数据库 facade，源帧报价迁入 creation-request；原像素/尺寸落库修复直接复用 edited-image-output；billing rollback 保原错/discard坏连接迁入唯一 platform/db/transaction，service 仍是兼容导出。工作台只读恢复自动合并，独立原用例复验。

真实 Next 控件暴露两处原先观察端口未覆盖的问题：retained submission 首次 quote 没带原 project（同一任务 POST 带 project），已把请求冻结 headers 的 workspace/project 传给已有 BillingProvider.quote，重试仍原 quote/operation。新空项目上传作品已合并但仅赋 navigation ref，原 effect 可能已经消费本次作品更新，画面停在空项目；导航 target 改为现有组件单一 state，effect 明确订阅该 target，不增加任务/第二份作品状态。真实错误与截图保留。

混选调试曾观测原 Shift 事件为 true 而选择变为单选；原脚本相同源码有成功和失败，暂不归因为删除逻辑。Flow 的 modifier key 数组固定引用，避免每次编辑器 render 重装 held-key listener；最终需同时保留持键连续点击和每次 modifier 点击的原断言，不以一次偶然通过关闭。此处不修改供应商、钱包、任务提交规则。

固定 b24c8f2d 的后三组真实 Next 控件已通过：node history8、upload/reverse7、reported tools8（6产物＋OCR）；原始失败保留。最终同SHA全组、真实PG、类型/架构与封包回滚继续集中执行。platform primitive 旧断言原本期待 rollback 错盖 action 错，现依 main 修复改为要求保留原 error，不改事务次数、SQL顺序或余额断言。

完整 core120 首轮在 native-save-review 发现旧夹具仅摘录 patchVideoNode，未组装已迁出的 videoNodeActions；修正为绑定真实 actions＋同一 hook/scope/history，未更改23项业务断言或产品。37项受影响矩阵已同1ba32292全部通过；完整类型、lint、Worker包及四类SCC0通过。incoming15项通过，ops硬编码历史容器已停止导致单独失败，改为本任务隔离夹具绑定复验，不启动他人容器。
