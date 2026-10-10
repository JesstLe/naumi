# 正式模型管理命名

原MVP作为正式后台模型管理模块继续维护，文件与代码符号改为model-management／management及对应ModelManagement、ManagedModel命名。组件和样式同目录迁移，业务入口、价格模块、管理类型、调用方及验收脚本／npm命令同步更新。历史部署记录保留，当前模块说明迁至docs/admin-model-management.md，原文档保留链接。

正式页面/admin/model-management、元数据库/library及对应API；后台最上方导航为“模型管理”。原页面永久跳转，查询参数保留，登录回跳白名单支持新旧地址。原API使用相同处理器和鉴权，不通过重定向重复POST。没有数据库或配置迁移。

持久兼容协议保持：旧provider和upstream ID、mvp-credit规则前缀、发布和计费actor标记与参与指纹的reason格式、操作互斥锁、sessionStorage待处理key。因此旧客户端和新客户端对同操作使用相同锁／版本记录；历史报价／任务及结果未知重试不因文件改名而失效。这些字段有代码注释，后续不能作为普通名称替换。

验证包括TypeScript、原生管理发布／凭据／目录／结果未知恢复、积分覆盖及冻结钱包、质量映射、范围／排序／元数据冲突和权限；真实浏览器验证正式入口、旧页面查询跳转、旧API权限、旧入口提交→新入口同ID重试、原sessionStorage记录恢复、改名前reason／actor完整历史指纹重试及现有改名／接入／范围／积分／版本／手机。

仅发布120.27.162.85，保留原配置、DB、媒体与代理。固定回滚源码b73533d74a2b4c92761bd6d2ef5c2745668d9f64基于08e0354，仅添加四个正式页面／API兼容入口；保留旧界面和业务实现，理解当前systems、qualityPolicy和matrix。回滚后正式URL与新前端API仍可使用，新旧前端均能读取原规则与待处理操作。

发布完成：固定源码5cb8600f1cbe14be0dbd7fbbe4c705ce7e545f6a，APP／Worker镜像ghcr.io/jesstle/naumi:5cb8600f1cbe14be0dbd7fbbe4c705ce7e545f6a，Image ID sha256:07370677c52b6958af4ad7fc96d0e26462f9d41b97f0d2e151a4e6bf54045d75，实际版本1791599031 / v2026.10.10-102351。证据/完整备份/回滚脚本 /opt/naumi-staging/evidence/model-management-naming-20261010-r2；COMBINED_RELEASE=PASS，DEPLOY_LOCK_FREE=1。初版候选d32fa01只构建未部署，发现reason历史指纹兼容问题后取消，运行镜像保持08e0354；修正并增加原生历史记录重试验收后发布最终候选。

线上新旧页面与API权限／查询跳转、参数映射编辑／元数据默认恢复／库编辑弹窗、单个画布勾选及模块明细、手机、4图片家族／选择刷新／实际报价／扩图选择／排序取消均通过。浏览器只读验收阻止目录发现POST和业务写入，不发收费生成。模型v66／计费v8；完整配置hash696ee8840093f6e3dbf1d5317b6529d1、全部草稿hashd34b6d55ce1f19a053733efa25f5c08b、元数据861条hash8b408426b95e7b5fd48e05fcb468c63f、修订863条hash593f44ae5f54ca1f021109b792cf08df及采购价格完整指纹与发布前一致。历史自带图片接口与ComfyUI摘要保持。

固定兼容回滚镜像Image ID sha256:9e98745315e8a637633671f4c7c62326f926a093b2cd53c1ca2a32629df155c4已构建并检查；命令 bash /opt/naumi-staging/evidence/model-management-naming-20261010-r2/ROLLBACK.sh --apply，自行获取共用锁并确认当前候选镜像，只切镜像、不回灌数据库或媒体。临时cookie已清理，原始密钥不修改；隔离DB已停止。旧机未连接，视频／OSS延期、local媒体约定保持。后续验收脚本与文档提交不另发业务镜像。
