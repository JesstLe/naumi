# 模型管理：概况优先、按需展开

## 用户问题与设计

用户确认功能正确，但原模型映射页难以理解：每行同时展示全部应用工具、全部启停通道及多列操作；行高由最复杂模型决定，前端名称与真实调用模型的关系反而不突出。

本轮仅重组管理界面，不改模型配置、路由、定价、API 或发布执行器。

- 默认一行对应一个前端模型，按「前端显示名称 / 实际调用模型 / 应用范围 / 积分售价 / 配置」浏览。
- 实际模型摘要仅来自启用 routes；通道数量按 upstreamId 去重，多实际模型显示额外数量，无启用通道明确提示；0 积分保持 0，不当成未配置。
- 点「配置」展开调用通道与配置入口。停用通道保留在二级 details 中；应用工具完整标签仅在展开时展示。
- 配置入口按「展示与积分 / 调用方式 / 生成参数」分组；原显示名称、积分、切换、供应通道、参数、分辨率、视频能力、范围均沿用原处理及锁定条件。
- 图像高级参数从页尾全局按钮移到各图片模型配置内，使用该行模型，不再默认为第一个图片模型。原弹窗和发布方法保持。
- 页面标题改为「模型管理」，移除口号、三步介绍条与冗余页脚；浅色布局。
- 新增 CSS module，不修改共享 checkout 尚未提交的 `model-management.module.css` 及其他 admin UI 文件。

## 实现

- `model-mapping-card.tsx` / `.module.css`：只读摘要、展开状态、通道分层、配置分组、390px 响应式。
- `model-management-clarity.module.css`：本页标题/工具栏增量样式。
- `model-management.tsx`：将既有 setter/禁用条件绑定为 MappingAction。API、幂等发布、pending 恢复与既有所有弹窗函数不变，静态 AST 比较确认。
- 5 份既有 UI 回归脚本显式调用 `expandManagedModelConfig` 后访问配置入口，适配默认折叠；断言未删除。

## 验收与证据

1. 源码基线：原版 inline 操作、全 routes、全工具标签展开，检查复现通过。
2. 修改版结构：默认折叠、分离启停、0 积分、ARIA 状态、原 dialog/helper 函数及发布主体保持，检查通过。
3. 使用 esbuild 打包真实 ModelManagement、全部原有弹窗及真实 CSS modules，API/auth/Next Link 隔离成本机 fixture。T3 浏览器 29 项通过：8 类配置弹窗、启停展示、筛选、隐藏模型 ID 搜索、空结果、排序弹窗、真实组件改名提交 payload、原路由与价格不变；只读浏览 0 写，唯一显式改名 1 次本机写。
4. 390px 默认/展开横向溢出均 0，1440px 列表与展开截图保存并打开检查；未配置与 pending 状态的既有修改禁用、核对入口保留，未自动重放 pending。
5. 全量 TypeScript 通过（Next 15.5.27 / React 19.3.0）。既有依赖隔离 PostgreSQL 的大套 UI 回归本轮只适配交互入口，未整套执行，不把本机 API fixture 等同真实 DB/Router 发布验收。
6. 独立 rollback-copy 对 6 个已修改旧文件执行实际脚本恢复，逐文件 SHA256 相同；恢复入口组件经同一源码检查及真实浏览器复现原 UI，通过。新增文件保留作审计，入口回退后不再引用新 UI，不删除业务数据；修复 worktree 保持新版。

失败过程保留边界：fixture 首次因 CSS Uint8Array 直接字符串化未正确送出样式，已修 UTF-8 解码；价格 fixture 初次缺全规格网格导致原 PriceDialog 报错，已补完整矩阵后重跑 29 项通过。一次源码检查仅 CRLF/LF 差异失败，规范化换行后通过；未改原弹窗业务实现来迎合 fixture。

证据目录：本 worktree `output/model-mapping-clarity-20261017`，含原始 TSX/哈希、BASELINE/MODIFIED/ROLLBACK 日志、浏览器 JSON、summary/expanded/mobile 截图、MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、可执行 ROLLBACK.sh；最终四产物均重开。

## Git / 发布状态

起点 `e997b290b39fc9df63e4c3b6387fa008b7b0e18d`，独立 `codex/model-mapping-clarity-20261017`。提交前 fetch 到 `65a91af25f3773138b94af94e3115827030d3474`，新增仅视频验收，与本模块无交集；选择性提交后普通合并该 main，不覆盖共享 checkout。与前一作品提示词模块累计 2 次，本轮主动整合最新 main 后计数归零。

本地 UI 模块完成并交统一线程整合；分支推送不等于 main 或生产上线。未 SSH、创建线上候选、持服务器锁、重启、切流或改 Worker；真实供应商调用 0，生产 DB/配置未连接。后续发布仍按三锁蓝绿与目标站最新基线验收。
