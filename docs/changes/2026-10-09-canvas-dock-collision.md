# 画布双 Dock 重叠修复

## 交付范围

- 只修代码与本机验收；本轮不发布、不连接服务器。
- 基线：`8b501ac9223fdea9e9d3531d2d2acea26f4c8f47`。
- 保留图片生成、模型管理、计费与画布节点业务。界面沿用现有浅色布局。

## 根因和实现

1. 上置生成面板按 310px 计算位置，却允许实际高度超过该值，长提示词将底部控件推入节点工具条。
2. 工具条与生成面板原本独立定位，低窗口高度时没有共同碰撞兜底。
3. 相向位移动画会在入场时造成短暂重叠。

`src/lib/canvas/dock-placement.ts` 提供联合定位；本次在 `canvas-client.tsx` 接入，使用 `ResizeObserver` 读取真实宽高，保持至少 12px 间距；空间不足时堆叠并限制生成面板高度，内容内部滚动。监听会在 Dock 实际出现和窗口尺寸变化时重新建立，避免首帧没有 DOM 时漏测。工具条水平定位使用实测宽度，文字面板普通/展开状态的最小高度均服从安全区。两个 Dock 仅淡入，不再使用相向移动。

## 验收

- 基线复现：`DOCK_BASELINE=PASS REPRODUCED=OVERLAP OVERLAP_PX=50`。
- 回归矩阵：`DOCK_COLLISION=PASS CASES=2625 GAP=12 SAFE_BOUNDS=PASS ENTRY_TRANSFORM=NONE`。
- 全量 TypeScript 检查通过；定向 ESLint 通过，保留已有 `<img>` 性能提示。
- 本机隔离页面：图片 Dock 的长提示词、1234×550 / 1024×420 / 1093×614 / 390×844，实测间距均至少 12px，生成按钮命中正确元素；此前还验收了 1600×1000、1366×768、768×900。
- 文字 Dock：390×844 普通/展开、1024×420 展开/收起/长提示词，间距至少 12px、边界正确。
- 不触发生图/视频消费。图片验收点击了尺寸菜单；测试数据、账户与伪配置仅存在忽略目录中的隔离运行副本。
- 源码副本回滚演练验证原文件哈希和基线行为，实际工作区保留修复。

## 接手发布

源码位于 `E:\Workspace\naumi`；本次修复提交后由其他 Agent 按用户安排发布。依赖的 `dock-placement.ts` 已在基线主线中，本次提交包含调用接入、CSS、回归脚本和本文件。发布 Agent 应基于完整主线构建，勿只复制单个 TSX。

证据位于 `E:\Workspace\naumi\output\canvas-dock-collision-20261009`：`MODIFIED_FILE.tar` 为四个源码文件包，`DIFF_FILE.patch` 为完整本次变更，`VERIFICATION.txt` 为命令/输出/退出码记录，`ROLLBACK.sh` 为带哈希保护的源码回滚脚本。该脚本不是服务器发布回滚命令。

复验命令：

```powershell
node node_modules/tsx/dist/cli.mjs scripts/verify-canvas-dock-collision.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
```

接手提示词：

```text
阅读 docs/changes/2026-10-09-canvas-dock-collision.md 和对应 VERIFICATION.txt，检查本次 Git 提交。按用户最新部署目标发布完整主线，并验收长提示词、低高度窗口下的双 Dock 间距及按钮点击。本次执行 Agent 未发布；不要把本机截图视为线上结果。仅在用户明确要求时回传旧服务器。
```
