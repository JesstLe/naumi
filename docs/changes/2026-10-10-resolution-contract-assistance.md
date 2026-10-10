# 自动匹配分辨率接口，运营只选实际规格

用户指出实际参数名不应由运营猜测。原线上82ec570/版号1791613905，开工main ab34516；本轮业务源码b6d226ebeeba525169d4f289a12de79c8b29153d。

## 结果

- 常规分辨率表变成实际规格下拉。自动字段不再占用主流程，参数名/比例字段/任意实际值放入高级设置；无可靠定义的通道保持原调用，明确待确认。已保存人工配置不会伪称自动识别。
- 通过供应商正式页面核对两款香蕉：resolution设置1k/2k/4k，size设置比例；现有chat/completions兼容入口也遵循该契约。正式资料来源 https://console.prompt-hubs.com/docs/model/nano-banana-pro 、 https://console.prompt-hubs.com/docs/model/nano-banana-2 与 https://console.prompt-hubs.com/docs#chat-image-compat 。文档目录导出URL从供应商页面公开导出逻辑确认，未从名称猜测。
- 自动采集结构化目录 https://console.prompt-hubs.com/docs/catalog.json，全107模型字段/枚举/示例分别归档到两个现有Prompt Hubs适配入口。公共规格与当前密钥权限、真实效果验证独立。资料更新保留人工价格/默认映射，报价HTTP缺失时仍采集规格。管理员保存时冻结resolution+ratio字段，回退到其他供应商使用其各自映射。
- 合入同事codex/canvas-interaction-feedback的88de02e：画布图片/文字右键菜单、键盘/边界与长菜单滚动、生成占位和真实阶段反馈。沿用同事14浏览器案例、参数/布局/主题回归及构建记录，按用户要求不重复全量跑。

## 验收

- 隔离真实PostgreSQL/管理API与HTTP协议：默认值/资料冲突/幂等、JSON/multipart、Flow不同供应商映射、用户原始分辨率冻结、分辨率与比例分开发送、历史任务/原传参兼容、公开全量规格归档/重复采集不增修订、人工映射优先、报价404仍有规格、无认证字段泄漏通过；供应商价格导入原有定向脚本通过。测试库清理并停止本机PG。收费调用0。
- TypeScript及新机固定Linux优化构建通过。
- 线上原生API/权限/旧MVP兼容、模型范围、配置/价格保持通过；正式规格导入每入口107个，香蕉默认字段与三档值核对通过，执行模型/用户显示/客户售价与人工采购价未改。
- 桌面/390px手机：主流程无原始参数选择、官方实际枚举选择、保存请求resolution与ratioField序列化核对（拦截不写线上）、多来源长列表实际滚动及无溢出通过，客户端错误0。浏览器fixture错误必须带真实operationNotStaged字段，未将测试拦截造成的待核对状态误记产品失败。

## 上线与回滚

仅新机120.27.162.85。实际版号1791615864 / v2026.10.10-150424，业务源码b6d226e，APP/Worker Image ID sha256:170c3820ce3400c6f2b0a5ca13edacf4760a95e69b8723c6cb795dee248b572a。完整备份/持续deploy.lock/固定版本流程，先核对主分支和原线上基线，切换前配置和元数据指纹再次一致。只切NAUMI_IMAGE，DB、媒体、Compose、Router与公网代理保留。f834557初始候选未上线，补充报价HTTP缺失后固定构建最终b6d226e。

证据/opt/naumi-staging/evidence/resolution-contract-assistance-20261010，含发布前完整DB/env/Compose备份、资料导入后完整database.after-docs.dump、归档与接口/UI结果。模型v98、计费v8和完整配置/草稿/人工采购价保持；元数据库1244条，修订合计3667，新增正式参数快照与资料修订为本轮授权采集。

最终健康、实际版号、APP/Worker镜像及受影响UI检查通过，发布脚本记录COMBINED_RELEASE=PASS BROWSER=PASS DEPLOY_LOCK=RELEASED。临时验收会话文件已清理。

固定兼容回滚71b97fecb545be76d8086624b6793e8c9e1f97d6 / sha256:4fbb2c24e37cf36ce18f0ffcdf1e2ff21f7267fd7e9ffb35d36db87264d7c455，理解新ratioField与后续冻结任务，保留新元数据而恢复先前UI。不能直接退回82ec570严格旧schema。执行ROLLBACK.sh --apply仍须持锁核对候选，数据库备份不自动回灌；旧机未连接/回传。
