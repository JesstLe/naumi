# 画布双 Dock 重叠修复

## 交付范围

- 初始要求只修代码；用户随后明确要求“直接发布并验收”，本轮已发布新机 `120.27.162.85`，旧机未回传。
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

源码位于 `E:\Workspace\naumi`；Dock 修复提交 `17aa3e6`，发布提交 `7a34942c833617460ab9e48a067c26e22c0b2c8c`。发布版本合并已有管理员模型策略和模型家族显示修复，未重新开放画布操作模型选择器。

证据位于 `E:\Workspace\naumi\output\canvas-dock-collision-20261009`：`MODIFIED_FILE.tar.gz` 为实际发布固定源码包，`DIFF_FILE.patch` 相对于新机此前版本 `1f23c02`，`VERIFICATION.txt` 为命令/输出/退出码记录。`ROLLBACK.sh` 在新机使用 `--fixture` 演练源码副本回滚、使用 `--apply` 回滚新机应用/Worker；远程证据目录为 `/opt/naumi-staging/evidence/dock-model-release-20261009`。

## 新机发布验收

- 固定镜像：`ghcr.io/jesstle/naumi:7a34942c833617460ab9e48a067c26e22c0b2c8c`。
- 镜像 ID：`sha256:e271d91c2b9808790f327fb2659440f44e3a73bcbeca4f40d234b397b04cc8b4`，公网 `BUILD_VERSION=1791531509`。
- 新机已备份数据库与配置；仅修改 `NAUMI_IMAGE`。DB 容器、媒体挂载、Compose 和公网反代保持不变。
- 公网模型菜单只有 `gpt-image-2`、`gemini-3.0-pro-image`、`imagen-4.0-generate-preview`、`gemini-3.1-flash-image`，没有方向/比例后缀。
- 公网 1234×550、1024×420、1093×614、390×844 的图片 Dock 间距最小 12px，生成按钮命中正确元素；长提示词已恢复，未触发生成消费。
- 七项管理员模型策略和报价覆盖检查通过；未登录管理/Worker 接口仍为 403。旧服务器未连接、未发布。

复验命令：

```powershell
node node_modules/tsx/dist/cli.mjs scripts/verify-canvas-dock-collision.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
```

接手提示词：

```text
阅读 docs/changes/2026-10-09-canvas-dock-collision.md 和对应 VERIFICATION.txt。新机已发布 7a34942，保持模型家族显示、双 Dock 避让与管理员模型策略；先核验当前版本再做后续工作。视频和 OSS 后续独立处理，仅在用户明确要求时回传旧服务器。
```
