# 原企业协作产品与 Naumi 来源整合 U2

2026-10-17。任务分支 `codex/enterprise-workflow-foundation-20261016`。本轮起点 `a3f8224468be83f45991fe33fe15f623f7fec85c`。

## 1. 产品决策与交付入口

用户明确：`http://127.0.0.1:18482/preview.html?v=4` 的原企业协作产品是最终交付方向；Naumi `/admin` 只是已有数据源后台。原有工作台、需求、任务、团队排期、多表视图、素材、贡献、成员与规则继续沿同一界面演进。

本轮撤除误加的 `/admin/enterprise-workbench` 页面、组件及导航。保留原管理后台功能和只读管理员诊断 API；产品前端不调用 `/api/admin/*`。没有 iframe 嵌后台，没有新建客户代码分叉。

## 2. 已实现的纵向链路

原“素材与交付”→“Naumi 创作记录”→同源 `/api/enterprise/integration`→`enterpriseAuthorize`→`NaumiEnterpriseAdapter`→现有企业作品、生成记录、积分账本及媒体接口。

新增三个视图：图片与提示词、生成任务、积分明细。支持来源企业、可见成员、日期筛选、分页、刷新；保留来源记录 ID、实例/企业标识、操作状态、时间、提示词全文。作品图片通过授权媒体接口读取为短期 blob，退出视图释放。

右上演示角色与来源登录用户明确分开。服务端采用实际来源会话与组织树授权，不接受前端 role 或员工列表。匿名 401、非企业用户 403、范围外企业 404；撤权后清除旧数据。当前预览用签名合成企业所有者而非平台管理员，页面标明“隔离验收数据”。

## 3. UI 与数据完整性

- 原 demo.js、排期模型、多表模型不因接入来源重写；来源 UI 是 build 中的增量模块。
- 不更换 localStorage origin，不迁移或清空用户原来的需求、排期配置。只读来源结果仅保存在内存，不写入本地业务事实或绩效。
- 预估积分与有流水证据的实际扣费分别显示；缺证据保留 null/未记录，不伪装为 0；扣费与退款保留独立账本行。
- 历史记录业务归属仍为 `unconfirmed`，`workflowTaskId=null`。本轮没有自动归因到设计师绩效。
- 使用请求 epoch + AbortController 防止旧响应覆盖新筛选。失败清旧数据，回到来源标签重新读取；前台每 30 秒/窗口聚焦重验授权。
- 前端校验来源实例、企业、记录、分页和媒体路径；服务端独立执行权限裁剪。

## 4. 本地运行与复现

入口固定 18482，同源代理只允许两个企业来源 API 和 readyz，固定回环后端 18491；未知路由 404，不接受任意上游 URL。它是隔离预览工具，不是生产通用代理。

```powershell
node design/enterprise-demo/build.mjs
$env:NAUMI_INTEGRATION_EVIDENCE_DIR='E:/Workspace/naumi/output/enterprise-direction-correction-20261017'
$env:ENTERPRISE_PREVIEW_PORT='18491'
# 独立终端 A；创建一次性 PostgreSQL，签名合成来源身份
node scripts/verify-enterprise-integration.mjs --product
# 独立终端 B，cwd 保持任务工作树
node scripts/serve-enterprise-product.mjs 18482 18491
```

首次加载遇到旧浏览器缓存时刷新页面；不要清 localStorage。后台 readyz 与 API 独立检查，不能只看静态 HTML 的 HTTP 200。旧误方向的 18490 和候选 18492 已结束；18483 既有进程未操作。

## 5. 集中验收与证据

`node design/enterprise-demo/release-check.mjs`：静态 1、排期/多表模型 36+32、来源模型 12、文档 5、验收定义 50。

T3 独立标签真实浏览器：原工作流 36、排期 42、多表 35、来源 18 项通过。覆盖完整原业务流程、布局草稿/发布/恢复、权限状态、来源图片、6 实扣/9 预估/null 未知、-6 扣费/+2 退款、迟到响应、503、撤权、源读取不改变业务 localStorage。

原 18482 再用独立 Playwright 浏览器验证：原导航/排期、来源 2 行、实扣 6/未知 null、无页面异常、390px、原业务存储不变。移动截图等待侧栏收起动画完成再拍，另检查侧栏 right<=1，避免仅“无横向溢出”掩盖遮挡。T3 截图连续超时后才使用此独立浏览器，不连接日常 Chrome/CDP。

`node scripts/verify-enterprise-integration.mjs --regression`：隔离 PostgreSQL 真实接口/作用域、shared 两企业/dedicated 一企业、匿名/跨企业/普通用户/撤权、媒体、旧企业作品和 analytics 回归通过；源数据指纹保持，真实供应商调用 0。

根 TypeScript 检查保留 4 个既有 React ref 诊断，涉及 canvas-action-menu、video/settings-dialog、site-version；本轮新接口无新增诊断。全仓正式 Next 构建未记为通过。验收原始输出、截图、Git SHA、差异包和副本回滚记录见 `E:/Workspace/naumi/output/enterprise-direction-correction-20261017/VERIFICATION.txt`。

## 6. 同一主干与后续工作

部署策略仍为同一代码 `shared/dedicated`，专属模式固定经审核的一个企业 UUID。当前 transport 为 in-process；远程 tenant-bound HTTP 适配、登录委托和跨部署凭据是后续模块，不把本地 fixture 代理用于客户生产。

下一完整模块：统一产品身份/租户与服务端工作流，把现有排期 S1 API 接入这个原 UI，再接真实天地合源实例及企业 UUID。随后建立 generation_context/任务关联、业务归属确认与绩效规则。真实钉钉/聚水潭接入、权限缺失子表、独立企业数据库/媒体、正式构建和 4 核 8GB 容量验收仍按原 PRD 逐模块推进。

本轮没有连接生产服务器、迁移真实账号、执行生成/扣费或发布线上；保持已有服务和数据。后续服务器变更遵循项目蓝绿约定。

## 7. Git 与回滚

本轮选择性提交，任务分支普通合入最新 origin/main，不在共享主工作树切换/覆盖他人修改。功能同步计数在整合后归零；服务器发布计数不增加。最终 SHA 以交付 GIT_STATUS.txt 为准。

回滚仅在标记的独立代码副本运行：恢复本轮修改/删除文件，移除本轮新增文件，逐文件核对原 SHA；原代码回归与基线输出一致。运行工作树与 MODIFIED_FILE.zip 保持新版，真实数据库/媒体不在回滚范围。恢复旧 admin 产品页面仅是副本中的历史行为证明，不建议将错误方向重新交付。
