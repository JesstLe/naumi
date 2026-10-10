# 正式模型管理命名

原MVP作为正式后台模型管理模块继续维护，文件与代码符号改为model-management／management及对应ModelManagement、ManagedModel命名。组件和样式同目录迁移，业务入口、价格模块、管理类型、调用方及验收脚本／npm命令同步更新。历史部署记录保留，当前模块说明迁至docs/admin-model-management.md，原文档保留链接。

正式页面/admin/model-management、元数据库/library及对应API；后台最上方导航为“模型管理”。原页面永久跳转，查询参数保留，登录回跳白名单支持新旧地址。原API使用相同处理器和鉴权，不通过重定向重复POST。没有数据库或配置迁移。

持久兼容协议保持：旧provider和upstream ID、mvp-credit规则前缀、发布和计费actor标记与参与指纹的reason格式、操作互斥锁、sessionStorage待处理key。因此旧客户端和新客户端对同操作使用相同锁／版本记录；历史报价／任务及结果未知重试不因文件改名而失效。这些字段有代码注释，后续不能作为普通名称替换。

验证包括TypeScript、原生管理发布／凭据／目录／结果未知恢复、积分覆盖及冻结钱包、质量映射、范围／排序／元数据冲突和权限；真实浏览器验证正式入口、旧页面查询跳转、旧API权限、旧入口提交→新入口同ID重试、原sessionStorage记录恢复、改名前reason／actor完整历史指纹重试及现有改名／接入／范围／积分／版本／手机。上线版本与结果完成后补录。

仅发布120.27.162.85，保留原配置、DB、媒体与代理。固定回滚源码b73533d74a2b4c92761bd6d2ef5c2745668d9f64基于08e0354，仅添加四个正式页面／API兼容入口；保留旧界面和业务实现，理解当前systems、qualityPolicy和matrix。回滚后正式URL与新前端API仍可使用，新旧前端均能读取原规则与待处理操作。


