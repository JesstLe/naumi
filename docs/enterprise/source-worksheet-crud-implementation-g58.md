# G58 实施记录：原排期表CRUD

## 用户决定与本轮执行边界

- 2026-10-19：47保持4核8GiB，继续调优及目标机容量验收，资源升级不作为默认选项。
- 使用时间线上不动：本轮未连接47、未发布、未修改线上配置/账务/事件。G57已被停止的采样没有完整回执，不把它计为容量证明。
- 用户对补充试点人员答“随便吧”：可按规则选择候选，但本轮不虚构第二名员工、不猜真名花名、不扩权。真实独立验收人的绑定仍需实际身份核对，不阻断本地编辑模块实现。
- 两历史事件先结案再部署的G56约定继续生效。

## 实现

新增SourceWorksheetStore与037迁移，独立工作文档、幂等命令、审计和上传文件表；原始import表只读。FormalImportStore复用现有manage+启用目录管理员鉴权。本机适配器使用回环会话及token；正式BFF/运行时接入同一命令协议和文件校验。

新增sheet-grid-model/ui/css，四个排期视图共享后端文档；表头筛选排序、任意文字/空格编辑、行/列CRUD、回收站、图片原图抽屉、上传/选择来源附件及审计已接原UI。来源和正式工作流状态分离。

本地`prepare-local-sheet.ts`先备份原库，再在同一个本机PG容器中建立**不同数据库**`enterprise_sheet_local_g58`；复制原数据后补齐迁移1–37，原库仍保持原版本与原记录。源文件只读复用原blob目录。`data/enterprise-sheet-workspace/connection.json`被忽略，不入Git；18494数据服务和18482页面服务只重启本机已核验的原进程，使用新的独立工作库。没有新建一套客户代码。

本机副本不是未来生产独立PG容器的替代验收。新库保留原始来源表，编辑进入独立工作表；两个数据库的来源四表hash在准备后核对一致。准备工具没有覆盖或删除已存在目标库的自动路径。

## 构建一致性修复

基线release-check exit1暴露旧build.mjs仅编译基础Demo，漏掉后来注入的30个模块；若直接运行会丢掉大量已完成UI。以本轮基线preview.html为权威，逐模块恢复其中已存在但未回写的6份源文件，提取formal-source-ui.js，建立bundle-spec.json与assemble.mjs。

现在一个构建命令包含基础UI、原正式来源适配、全部30个已有嵌入模块，再接工作表模块；现有每个build-xxx --check仍验证精确嵌入。原预览内全部具名函数均保留，PRODUCT_SOURCE_RECONCILIATION.json列出来源/数量。不是以较小Demo替代原完整产品。

运行包schemaVersion由36到37，正式发布需显式迁移；没有线上自动升级。目标本机新库为37，原库不变。

## 集中测试及修正

- 模型15检查：筛选、自然/数字排序、父上下文、删除父行后的子项、空值及删除状态。
- 独立PG/正式HTTP42检查：CAS竞争、幂等、软删除恢复、字段保护、数字/日期验证、撤权/跨企业/匿名、图片解码/哈希、文件作用域、服务对象重建读回、失败回滚、源表未变、正式订单0。
- 浏览器29检查：独立无头浏览器、实际364行来源副本，真实点击各操作；上传图片/附件、图像打开、行列删除恢复、刷新及整页reload、冲突保留输入、修改记录、390px、pageerror0。测试数据只写临时PG。
- 原release-check及完整服务构建通过；服务自身TypeScript通过。全仓同依赖/编译器源文件覆盖比对为基线35条、修改35条、新增0；全仓tsc仍exit2，不称全仓绿。
- 原18482最终只读验收：364行/292附件、工作表v0、原产品图实际解码、原模块保留、pageerror0。真实工作副本没有留下验收创建的行。

保留的失败证据：首次后端测试遗漏accounts前置记录导致FK失败，补齐合成身份；首次浏览器测试未等待异步审计抽屉，修正等待后通过；早期图片截图截到抽屉动画中间，后续等待动画结束重拍并打开检查。未通过放宽业务约束来消除错误。

## 使用及运维

入口：http://127.0.0.1:18482/preview.html?v=4 → 团队排期 → 导入真实数据。点击列头筛选/排序，点单元格编辑；右上新增记录，行末···管理整行；字段菜单管理列，回收站恢复，修改记录追溯。

```powershell
node design/enterprise-demo/build.mjs
node design/enterprise-demo/release-check.mjs
node design/enterprise-demo/sheet-grid-tests.mjs
node scripts/verify-source-worksheet.mjs
npm run typecheck --prefix services/enterprise-workflow
npm run build --prefix services/enterprise-workflow
# 仅本机，已准备过的新库不要重复初始化；原数据保留
node --import tsx services/enterprise-workflow/tools/prepare-local-sheet.ts check data/enterprise-sheet-workspace OUTPUT_DIRECTORY
```

本机启动脚本`scripts/start-enterprise-local-sheet.ps1`只匹配本机18482/18494、精确程序及参数后处理进程，输出独立日志及LOCAL_READY.json；它不连接服务器。持续服务的PID及HTTP应重新核验，不把READY单独当全链路完成。

## 回滚与剩余

源码回滚只在独立副本实际测试；不得恢复业务数据库覆盖新编辑。若停用本机新版，保留新工作库、备份/文件/审计，切回兼容程序及原来源入口，不删除新工作库。生产程序回滚仍需既有蓝绿/备份/身份兼容流程，本轮未做线上切回。

本轮证据：E:/Workspace/naumi/output/enterprise-sheet-crud-g58-20261019。四件产物、完整命令/输入/输出/退出状态、原hash及副本回滚见VERIFICATION.txt；Git仅提交本任务文件。

整体企业目标继续进行中：正式员工、生产容量/独立库/服务/蓝绿、历史事件真实结案、第三方配置、未取得子表及企业规则仍保留。这里只完成截图所指排期工作表模块的本机可运行交付。
