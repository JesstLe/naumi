# 图片节点操作栏图标统一

## 交付边界

用户最新要求：本轮只在分支修复，由其他人统一合并并发布。分支 `codex/canvas-action-icons`，基线 `4390f37df54be04335c080f4bfd0af9fce8b116c`。本轮不合并到main、不连接服务器、不发布新机或旧机、不触发模型生成。

## 实现

- 截图对应 `canvas-client.tsx` 的 `image-node-toolbar`，左侧快捷操作和最右侧动作混用了emoji与Lucide SVG。
- 使用已有Lucide依赖和QUICK_ACTIONS.icon字段，移除冗余emoji字段，统一16×16px、shrink-0、默认2px线宽、currentColor；颜色继承现有浅/深画布主题。
- 换背景→Image、打光→Sun、多角度→Rotate3d、加文案→Type、抠图→Scissors、高清→ScanSearch、改比例→Maximize2；最右侧重命名/添加/下载/查看大图→Pencil/Upload/Download/Maximize。
- 已有改字/扩图/标注/工作流/视频/助手也规范为相同图标类与装饰性aria-hidden。
- 图标按钮补明确aria-label；提示、禁用条件、onClick、生成提示词、计价、工具栏布局均保留。

## 验证状态

实现和本地集中验证完成；只提交/推送任务分支，等待统一合并和发布。

- `node scripts/verify-canvas-action-icons.mjs .`：14个源码图标槽位通过；实际渲染17个主图标。四个尾部按钮具备明确访问名称，图片操作栏emoji为0。
- 带`--business-baseline`对照原始源码：全文件事件回调、关键生成处理函数的AST一致，业务行为不变。
- TypeScript检查通过；单文件Next lint通过，有一条既有`<img>`警告（`@next/next/no-img-element`），没有新增lint错误。
- 既有Dock碰撞2625案例、参数288组合/90拒绝/5实际路由、6模块浅深主题UI回归通过；供应商调用为0。
- 本地浏览器从真实修改/基线源码抽取整个图片工具栏、QUICK_ACTIONS、DarkSelect、真实CSS和Lucide依赖，完成隔离视觉预览：浅/深色、禁用、390px窄屏内部横向滚动、高清1K/2K/4K下拉与尾部按钮本地回调。主图标始终16×16、currentColor、2px线宽；下拉箭头维持12px。
- 预览将动作替换成本地记录，不连接数据库、不触发生成或实际下载/上传；它不是完整应用或线上验收。未运行完整`npm run build`，交给统一合并负责人在组合版本集中构建/验收。
- `ROLLBACK.sh --fixture WORKTREE`在独立副本恢复原始字节/hash与emoji基线，任务源码与MODIFIED_FILE保持修改。只演练源码副本，不执行服务器回滚。

本地证据目录：`E:\Workspace\naumi\output\canvas-action-icons-20261009`。包含原始hash、源码基线、修改后副本、patch、VERIFICATION.txt、可执行ROLLBACK.sh、浅/深/窄屏与基线截图、browser-evidence.json和测试日志。首次预览生成遇到Windows ESM绝对路径和浏览器process未定义，均只修复输出目录的预览生成器并重跑成功，未为此改变业务源码。

交付前已刷新origin/main：`75affea3b69ea518ee5270e718faadc77294ab95`。相比任务基线，他人变更未触及本次`canvas-client.tsx`；本轮按用户要求不合并main，整合负责人以最新main合并本分支再集中验收。旧主工作区的未提交内容保持不动。

## 接手提示词

```text
阅读AGENTS.md、docs/AGENT_COLLABORATION.md和本文。拉取
codex/canvas-action-icons，审查canvas-client.tsx的image-node-toolbar diff，
保留同文件并行改动，通过提交合并而不是覆盖整个文件。本轮只改图标/ARIA，
事件回调与业务逻辑不变。统一合并负责人刷新main并集中验收后自行发布。
不要把此分支提交或本地预览当作新机已上线；发布仍须备份和deploy.lock。
```
