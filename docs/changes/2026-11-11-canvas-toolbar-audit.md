# 图片节点工具栏逐项核验与模型执行统一

## 当前用户决定与基线

- 用户要求检查截图全部工具，发现问题直接修复；后续同意智能处理全部改为直接调用大模型。
- 统一含义：换背景、换视角、文案图、重新打光、AI增强、比例重构、扩图、标注改图和识字/改字使用后台已配置的模型。重命名、裁剪、替换、查看和下载保持原生确定性行为；图片解码、上传、必要蒙版/像素合成是配套处理，不是CPU智能算法服务。
- 不是删除模型真实能力、管理员配置、权限、余额、冻结任务及UNKNOWN状态；“可调用模型”不等于完整链路验收通过。不通过历史任务重放来测试。
- 开发基线main `974fa2c2191447771048d84a190cd80449778c3f`，分支 `codex/canvas-toolbar-audit-20261111`。共享checkout保持原分支和25个原有文件。证据根 `E:/Workspace/naumi/output/canvas-toolbar-audit-20261111`。
- 47只读页面 `/api/version` 仍为 `5cfe8333634eb253708536bd8a91ca59ac4088bb / 1794022409`。不是main，未在生产点击智能处理提交；47发布HOLD保持。

## 模块与职责

- UI工具可用状态：`canvas/image-tool-state.ts`，统一图片是否存在、只读、设置就绪、锁定、抠图模型目录状态；不拥有模型配置或任务。
- `canvas/generation-failure.ts`维护明确未受理、明确终态、结果同步和未知状态的展示分类；图片任务/编辑任务继续拥有原请求、原job及回执，不引入第二套执行器。
- `canvas/ocr`路由负责认证、原图读取、图像预处理、视觉模型请求与坐标规范化。移除Paddle调用与REQUIRED门槛；不改文字编辑任务、报价或计费归属。扫描图只缩放一次，发送像素与提示中坐标系一致。
- `imagegen/cutout.ts`在有托管图片执行范围时优先使用已发布图片模型，不再让旧Replicate设置抢走该执行。保留其他历史入口兼容，不迁移配置、不修改供应商资料。
- 依赖保持 UI→既有应用用例→配置/模型适配；作品、画布历史、任务与账务沿用原owner，无数据库迁移。

## 调研与修复

1. 换背景/视角/文案/AI增强本来使用runGen；把这些视为CPU工具是误判。现已复用同一可用状态，锁定/未就绪时不再显示可点击却静默退出。
2. 扩图/标注原有入口缺少统一锁定检查；补在UI与应用调用边界，在线改字打开/提交同样检查对应源图。
3. 原失败分类把未知提交一律当failed，部分409又当明确未受理；保留原任务状态，显示“任务待核查/查询原任务”，结果已知但回填失败显示“同步结果”。不把核查提示改写成普通“请重试”。
4. 原OCR可受PADDLE_OCR_REQUIRED阻断；现直接使用所选视觉模型，不再请求Paddle服务。预处理后又缩到1024会使实际图与声明扫描尺寸不一致，已移除第二次缩图。
5. 托管抠图不再被旧分割服务配置优先级覆盖。

## 验证命令、结果与层级

| 验证 | 命令与结果 | 证据层级 |
| --- | --- | --- |
| 源模块基线/修改/回滚 | `node scripts/verify-canvas-toolbar-audit.cjs --source-root SOURCE --mode BASELINE或MODIFIED或ROLLBACK --output-root ../checks`；基线8项复现，修改10项通过，另副本回滚还原原行为 | 真实状态表达式/分类模块/OCR route/抠图应用用例，边界为显式fixture |
| 全页按钮、菜单和结果回填 | `node scripts/verify-canvas-toolbar-ui.cjs`；21项通过，10次模型结果、2次原生编辑；1440/390可达；pageerror0 | 完整Next15/React19/ReactFlow与Chromium，API和图片为本机fixture |
| 原有次级创作用例 | `node scripts/verify-canvas-secondary-generation.cjs`；50案例171断言通过；未知供应商重放0、已知结果再次提交0 | 原Canvas函数+原控制器，窄HTTP/时钟fixture |
| 原报价身份 | `node scripts/verify-canvas-tool-quote-scope.cjs --output-root ../scope`；20项通过 | 原BillingProvider、scope、quote模块，SQL/auth边界fixture |
| 托管图片调用 | `NODE_OPTIONS=--conditions=react-server`、`NAUMI_VERIFY_ISOLATED_DB=1`、本机127.0.0.1 PostgreSQL16.15；`node node_modules/tsx/dist/cli.mjs scripts/verify-tool-image-operation-apib.ts`；15断言通过 | 真route/PG/模型适配、供应商loopback HTTP；真实供应商调用0 |
| 类型/lint | `node node_modules/typescript/bin/tsc --noEmit --incremental false` exit0；受影响TS/TSX ESLint exit0 | 全量类型；旧Canvas中6条既有hooks warning，未扩大无关修改 |

按钮清单：重命名、图片助手、大图、原图下载、换背景、换视角、文案图、重新打光、抠图、AI增强、比例重构、扩图、识字/改字、标注、裁剪、替换、更多菜单；另验证锁定时保留查看/下载、未配置抠图时禁用。外部自备ComfyUI工作流和视频供应商执行不混称本轮图片工具验收，菜单只检查入口清单；未为测试运行用户自备工作流或付费视频。

集中验证修正了旧fixture与现行协议不一致之处：cutout必须有ok/url、generate必须有job前缀、image-prompts原有持久协议、model actions移到更多菜单的无障碍名称、local-edit原生结果位置。原reported-tools旧fixture失败在BASELINE-UI.log保留，不能据此认定产品抠图失败；两个存量AST harness增加真实可用性模块和现行完整回执，不减少原断言。

原始包SHA256：`109e18e8d79d3acc450b5e528f674a36a03d7076da722ac6c276048f4a6587b2`。四件套、命令字面结果、独立副本回滚和后续编辑保护记录在证据根VERIFICATION.txt；无数据库/媒体回滚。

## 未完成项与下一步

集中验收后普通合入并推送main，实际SHA及远端/共享文件核验见FINAL_STATE.json。47不发布，历史失败不重放；本地供应商fixture通过不当作线上效果质量验收，也不等于替所有模型补齐配置。用户解除发布HOLD后仍需真实业务结果/透明像素和图像质量验收。
