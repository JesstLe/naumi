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
