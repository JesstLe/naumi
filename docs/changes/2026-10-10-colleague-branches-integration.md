# 同事功能分支集中整合（2026-10-10）

用户要求将此前列出的四个未合入功能分支全部合入并发布新机。基线为 origin/main 8c6cacc9216cbcb189a7b246eae7b3023960b466，现有新机业务版本5cb8600f1cbe14be0dbd7fbbe4c705ce7e545f6a。使用独立 codex/colleague-branches-integration 分支/worktree；旧机不连接、不回传。

## 合并范围

- codex/canvas-toolbar-copy：77e0ab4，画布工具栏中英文提示文案。
- codex/model-brand-icons：85a7388及其两项前序提交，统一33种模型品牌/产品身份图标、公开别名识别及完整本地彩色SVG，保留MIT来源和校验资料。
- codex/image25-output-price-table：f70983a及2632adf，管理员APIMart原生输出参考价格表、人民币折算、筛选和下载；没有写入/自动定价接口。
- codex/pricing-page-preview：08825b9，套餐预览组件、月年切换与咨询入口。

实际通过git merge保存各分支历史。package.json冲突保留全部命令；套餐页冲突保留最新公开定价关闭规则，预览代码并入但 /plans 与 /pricing 继续404。首页预览同时遵守pricingVisible与commerceVisible。移除旧分支已失效的editionName/自部署分类，遵循现有单产品架构。不开启支付、不改变环境开关、采购价或客户积分。

价格表中的旧medium质量上限文案改为来源日期的供应商原生参考档，实际能力/映射以正式模型管理和元数据库为准；不覆盖当前五档参数。新增页面接入现有安全登录返回白名单；匿名页面进入管理员登录，API仍404，写方法405。

## 集中验收

- TypeScript、diff whitespace检查通过。
- 工具栏19项双语、33项源几何/许可、51项基础识别、129项覆盖/反例、25项彩色及重复渐变ID校验通过。
- 原生输出价格45规格、225档位、900项金额及900项人民币金额精确检查通过；仅参考，不修改真实扣费。
- 套餐预览离线报价/咨询/可访问性及最新双开关、废弃edition不恢复检查通过。
- 480项生成参数组合、90项非法参数、2625项Dock位置、冻结/积分矩阵/部分失败结算及管理员权限/安全返回原生检查通过。
- 隔离真实PG/Next浏览器：完整画布裁剪新版本、替换图片、撤销重做、文字样式保存刷新/锁定、五档质量、模拟助手SSE与390px布局通过，配置/价格/草稿不变，真实供应商生成0。
- 隔离价格表浏览器：真实API权限/no-store/405、公开定价404、45行和筛选、人民币/美元、刷新/JSON下载、390px布局通过；完整模型与计费配置保持。

隔离证据 output/colleague-integration-20261010（价格）与output/canvas-ui-integration-20261009/local（画布）。首次画布测试缺少初始化节点的fixture开关、首次价格测试错误假设未登录页面404，修正为实际节点fixture与现有307登录门槛后重跑通过；未修改授权边界。

## 发布状态

本提交为已验收候选；发布将在新机deploy.lock下完整备份、固定镜像构建、核对基线后进行。回滚到5cb8600固定镜像，保留数据库、配置、媒体和已有正式地址兼容。最终镜像、版号、线上验收及锁释放记录由发布后跟进追加，不能将候选提交当作已上线。


## 最终发布与线上验收

已发布新机120.27.162.85。固定源码6446fab68aaccc6cccdfa8217bbaebed95d27ac9，APP/Worker镜像ghcr.io/jesstle/naumi:6446fab68aaccc6cccdfa8217bbaebed95d27ac9，Image ID sha256:f1c5f505d129d38b08a1aabcfb9a4d1925efd0f22a28f94fbd0348fb8d5235ca，实际版号1791600281 / v2026.10.10-104441。四个分支对origin/main的独有提交均为0。

生产构建、原生健康/权限/旧新入口/价格只读405与公开定价404、七项目录、五档参数通过。线上浏览器验证原生价格表筛选/人民币美元/刷新/下载/手机、四家族稳定顺序和选择刷新/真实报价、模型菜单品牌与SVG渐变ID唯一性、扩图/排序弹窗、元数据默认映射和单个画布勾选/用途/手机通过；配置不提交，供应商真实生成0。

从备份读取基线到最终浏览器验收持续持deploy.lock，完整数据库、env、Compose备份与固定5cb8600回滚准备通过。最终APP/Worker同固定镜像且running，公网health db.ok=true，/api/version准确，COMBINED_RELEASE=PASS，锁确认释放。模型v66、价格v8、整个配置696ee8840093f6e3dbf1d5317b6529d1、草稿d34b6d55ce1f19a053733efa25f5c08b保持；元数据861条/8b408426b95e7b5fd48e05fcb468c63f、修订863条/593f44ae5f54ca1f021109b792cf08df、采购价格0条完整指纹前后相同。DB容器、媒体、Compose、其他env与公网代理保留；旧机未连接，local媒体、视频/OSS延期规则保留。

证据及备份 /opt/naumi-staging/evidence/colleague-integration-20261010，发布记录release.log、deploy.log；实际浏览器live/、canvas-live/、management-live/。ROLLBACK.sh --apply自行取锁、校验当前候选并退回固定5cb8600，保持现有正式路由和数据，无迁移回灌。临时浏览器会话文件与容器测试helper已清理，隔离PG已停止。本文和协作说明跟进仅为文档，不另发业务镜像。
