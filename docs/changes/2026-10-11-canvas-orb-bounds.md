# 小球可移动范围扩大与本地同步

## 原因与修改

- 原orbBounds硬性预留顶部76px、底部最多136px、横向12px，尤其窄屏可用竖向范围过小。
- 四边仅保留8px间距，仍按88×112的完整球体/状态标签范围收边，不允许拖出画布viewport；不进入独立Agent侧栏，不随画布平移/缩放移动。
- 浮层z-index 24→32，高于普通画布工具栏30，避免拖到顶端后被工具栏遮住而难以拖出；仍低于侧栏/菜单/弹窗，浮层空白处保持pointer-events:none。
- 720px高画布的竖向可移动距离396px→592px，增196px（约49%）；672px高画布348px→544px。账号位置保持原归一化数据，适配新范围不清空位置。
- 保留拖动6px阈值、pointer capture、取消复位、键盘、明暗主题、真实Agent终态与富文本。本轮仅改边界函数和对应测试，不变更后端/计费。

## Git核对

- 开工fetch后任务工作树与origin/main均为0cf5e63；先补全上一轮已发布验收文档，8b8bbde推送main。
- E:/Workspace/naumi原main为21a6616，落后19次提交且clean；已fetch并merge --ff-only至8b8bbde，无冲突、不切共享分支、不重置。开发继续在独立worktree分支codex/canvas-orb-bounds。
- 开工基线8b8bbde8847940dbd68ce49dec17602b295dd4a4，实际新机运行0cf5e63。集中模块验收与新机发布待执行。

## 接手提示词

```text
orbBounds以完整88x112浮层为尺寸，四边8px；保持归一化账号位置和拖动取消行为。
只改前端边界，不改Agent/SSE/富文本/计费。fetch main，保护其他工作树，
新机固定镜像发布持deploy.lock至浏览器边界核验，旧机不回传。
```
