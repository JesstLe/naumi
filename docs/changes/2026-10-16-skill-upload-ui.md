# 2026-10-16 · Agent Skill 文件直接导入 UI

## 范围与状态
- 基线 c2634fb；独立分支 `codex/brand-skill-upload-ui-20261016`，仅修改 `skill-book.tsx`、`skill-book.module.css` 与本记录。
- 已完成：共享 SkillBook 的点击/拖拽文件直存交互；供 Agent 与画布内技能库复用。非 compact 入口新增“导入 Skill”，打开“我的 Skills”；不在画布外层截取拖放。
- 未做：生产发布；本记录的浏览器验证使用真实 React/DOM + API fixture，不代表真实账号数据库端到端完成。真实存储与 Agent 调用由整合任务验收。

## 交互与请求
- 库顶部原生 button dropzone，支持鼠标和键盘；浅色紧凑设计，拖入高亮。支持 .md / .zip / .json，单次一个，非空且最多 512 KiB；多文件、扩展名、空文件、超限均显示明确错误，不提交。
- `POST /api/image-skills/import`，FormData 单一字段 `file`，`authHeader()`；不手动设置 Content-Type，不发送 email/accountKey，账号归属完全由服务端鉴权确定。
- 服务端返回 `{ skill, duplicate, warnings? }` 后直接加入当前账号“我的 Skills”，清空搜索/分类筛选并展示详情；不进入编辑草稿、不自动选择或执行。重复响应显示“此 Skill 已在我的 Skills 中”，按 id 去重；警示与错误均在对话框内可见。
- 上传前同步设置 AbortController ref 互斥，防止同一 tick 的拖放/change 双提交；上传期禁用导入/创建/关闭，页面切换账号或卸载时 abort 并作废回包。独立 epoch 阻止旧 GET 盖掉刚导入结果。
- 保留原编辑、导出、删除、从对话创建、焦点陷阱、Esc 与 inert；对话框/backdrop 处理文件拖放的 preventDefault 和 stopPropagation，不让文件跳转页面或触发画布拖入。

## 集中验证
- 构建：`node output/skill-upload-ui-20261016/bundle.mjs` → `FIXTURE_BUNDLE=PASS MODES=baseline,modified`，exit 0。
- T3 collaborative browser，本机 19164 的 fixture：26 项真实 React/DOM 通过，7 次模拟导入、2 次 abort；包含格式/多文件/大小/空文件、点击导入、拖放、同步互斥、重复去重、服务端报错/重试、当前账号切换及卸载取消/回包失效、旧 GET 竞态、前后焦点循环与 Esc。详细结果 `output/skill-upload-ui-20261016/browser-results.json`。
- 390 × 844：scrollWidth=390、dialogWidth=366、dropzoneWidth=332，无横向溢出；桌面与移动截图均已打开检查。
- 组件限定 tsc（真实 catalog、auth 仅类型声明）通过：`node node_modules/typescript/bin/tsc --project output/skill-upload-ui-20261016/tsconfig.json --noEmit --pretty false`，空输出，exit 0。非全量 App 类型验收。
- 原始 TSX SHA256 `487FFBF41C7E16E53DAA71A3D3F66BF6B053D095FF745347ADADD4D51BE96BE2`；CSS SHA256 `490A6EBFDD2EA071CD872BCDC1AFD777A6DC807AABB7A31F5AFEA8E944F76B62`。
- 副本回滚已执行：独立 rollback-copy 的源码与 CSS 恢复原字节/原哈希，JSON→草稿旧行为契约恢复；实际修改源文件保持新行为。证据目录中有 MODIFIED_FILE.tsx、DIFF_FILE.patch、VERIFICATION.txt、可执行 ROLLBACK.sh；均未提交 output 产物。

## 交接与迭代计数
- 本模块计数 +1（从 0 到 1），本轮不触发三模块同步阈值；开工基线由主任务 fetch 后指定。合并前主任务刷新 origin/main 并集中整合。
- 后端统一请求限额 512 KiB，zip 展开/路径/可执行内容验证及存储隔离由导入 API 模块负责。
