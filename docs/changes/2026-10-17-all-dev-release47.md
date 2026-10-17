# 全开发分支整合与47上线预检

## 本次用户指令

合并全部开发分支后上线47；用户进一步明确退役对象仅47旧Web/Worker槽位，不涉及103/120/香港/101。保持蓝绿、三锁、配置/DB/媒体和未知付费任务保护。

## 整合范围

基线origin/main 6dd5d51b。独立codex/all-dev-release47-20261017，未编辑共享checkout18项未提交。
全部15个未合入远端开发分支均已普通merge或被完整祖先包含；4个rollback兼容分支不合入。额外合入本地codex/admin-ui-modernization的已提交退役记录，不代提交其UI未提交修改。backup-4087与canvas-parameter-baseline等历史保留分支不合入；naumi-community是独立仓库不混入。
3D使用完整studio3d-packaging分支，包含基础/照片/展开包装，未只取增量。企业工作流服务和BFF源码合入；独立服务、数据库、身份签名与来源授权仍须单独配置，不把合源码称为已开通企业业务。

## 冲突与回归

release47_host.clone_web合并保留media_binding/before_create/runtime_recovery与reviewed_prior_state_dir参数及各自校验。两次maintenance-session冲突均保留当前媒体就绪/排空校验，合入NODE_OPTIONS CLI隔离。
SVG/面板删除guard原本要求助手函数与旧版本逐字相同；与已验证Agent流式分支冲突。现在仅restoreAssistantConversation/sendAssistantMessage两函数按精确f4f58dae提交核对，其余保持原AST比较，不删业务保护断言。
集中通过3D96/照片29/包装122、Agent流式356项、SVG183函数与回调、面板删除210项、映射/通道/真实提示词、imagegen契约/intent/恢复、Worker23项及真实进程崩溃恢复。TypeScript exit0。独立PG企业集成/作品/统计回归通过，真实供应商调用0。
Linux运维集中383项，0失败/0错误、6显式跳过。4套需历史捕获/独立Docker/真实Next环境的fixture未纳入该离线运行，不声称全套都跑。Windows目录fsync用例仅作环境失败记录，不修改Linux持久性逻辑。

## 实时上线预检

2026-10-17北京时间18:03前后，47当前Web/Worker仍7bdcd8b/1792146767，同14a8d2ab镜像，运行7容器，MemAvailable约3866MiB，Swap0；磁盘77%可用16GiB。当前三锁空闲，恢复timer active。
随后三锁内核对canonical为MIGRATED_CLEANUP_PENDING/revision40，legacyDrainProven=false。实际Web报告unknownLeases=2（supplier-scan、durable-image），历史付费任务job-d2c9a9c0…仍needs_attention、paid intent started/billing hold，原fence保留。2条会话归属实际idle，不是2个活动Agent任务，仍不能伪造成全面排空。
按现有协议上次未完成阻止下一发布；本轮不修改canonical、不清未知任务、不停当前槽、不覆盖恢复timer。三锁预检后释放；固定构建在本机完成，待门禁真正闭合后再旁路安装/切流。

## 公开更新记录

删除从103私有候选合入但从未上线的1792211906公开记录，新候选绑定本次真实buildVersion。只记录用户可感知改进，不含后台、供应商或运维内容；候选记录不代表47已发布。

## 证据

本worktree output/all-dev-release47-20261017：branch-inventory、各集中测试日志、三锁预检、固定构建与四件产物。最终main SHA/镜像ID/是否实际上线以VERIFICATION.txt和本线程结果为准。

## 构建后新业务刷新

构建后复核发现Agent分支新增703b33cc工具调用展开/计时/关联结果，已再次普通合入，相关两函数guard改按该精确提交验收；原3794c5ef镜像只作为中间构建，不发布。最终候选需按新SHA和新版号重新Linux构建。

## 最新上线继续核验

2026-10-17 19:01三锁内只读复核：当前Worker业务排空接口实际drained=true，五类执行租约0、activeTransactions0、advisoryLocks0，历史隔离fences6；不将该结果代替旧进程历史排空。canonical仍revision40，两个unknown观察和付费needs_attention原样保留。新版不能通过删除canonical或伪造旧排空进入下一轮。

构建后刷新又取得企业工作流5c8d8f6a（含来源关联c5b1b236、绩效分配与复核），为7705f114的普通快进，已纳入；新候选重新固定版本1792235064，之前1792232251本机镜像不部署。本轮先执行隔离PG来源/绩效/BFF和作品统计集中回归，再重新固定构建。企业独立服务仍未配置，不宣称业务启用。
