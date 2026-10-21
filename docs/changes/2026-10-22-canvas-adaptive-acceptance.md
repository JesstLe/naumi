# 画布自适应集中验收与交接

用户最新范围：做好自适应，不再增加长图按钮/静态长图比例或独立长图功能。2026-10-21实现记录按当时进度保留，本记录与VERIFICATION为最终状态。

- 程序提交7323f1b83f2f33aa341e46c646fbc5cf4e71fcce，普通整合去背景f45b90aa及timeline7fb9e7cc；main刷新仍53a32a0d且已在祖先中。共享未提交未覆盖。
- 20模块最终集中全通过：关键画幅71、多图45、auto原生网格133、详情真实parser/worker/query15、480参数矩阵、草稿55、选择队列13、去背景真实PG、管理员映射/计费、模型执行、失败24、timeline29+PG、续写、harness104、stream356、上传19及tsc0。
- 真实CanvasClient1440/390共6交互通过：旧作品ratio1:1+实际96x288→新草稿auto→提交1:3→结果节点可见；助手仍传auto；无新增1:3按钮；pageerror0。截图实际打开检查。
- 扩图真实handler+隔离PG+回环HTTP3次：普通无蒙版、明确支持蒙版、Flow edit-only各200且各1结算；原图区域逐像素一致；原receipt查询无新增POST；相同比例400无收费；非扩图Flow用户mask仍拒绝。Agent真实计划5次覆盖上传双顺序/关键图/显式3:4/无ratio标签1:3，报价2不变。
- 四件output/canvas-key-frame-long-image-20261021：MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、ROLLBACK.sh；包/补丁绑定程序7323f1b8，后继仅本封存工具与文档，不冒充新程序版本。
- 独立副本先跑修改行为，再真执行ROLLBACK：15原始hash恢复/8新增移除，重跑基线策略和实际handler再现旧auto→square、1:3原路由400，生产写0。原工作树23源码hash仍修复态。脚本显式marker/.git拒绝、可执行位核验通过。初次Python商店别名失败保留transaction-initial.json，改解释器probe后完整7命令全0。
- 正式Dockerfile固定git archive7323f1b8完成Linux91页build exit0，build1792603640，镜像sha256:7532e85c5391a47c093a9ace8d8a54399212d1999d9395242cb9877b37546486；network=none临时容器/api/version200真实返回此source/build，已停止移除，无生产挂载。
- 当前未合main、未SSH、未获取47锁/新建生产候选/切流/修改Worker；外部供应商0。本地构建/HTTP200不等于线上或供应商真实画质验收。后续统一47发布需重新刷新main/在线基线，持三锁走蓝绿并排空旧槽。
- 自适应不绕过真实上游能力/管理员设置。GPT原生1:3上限仍保留，其他通道按冻结能力；不静默改方图、不裁切交付、不重解释旧任务、不重放未知付费提交。
