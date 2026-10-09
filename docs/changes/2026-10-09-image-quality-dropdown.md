# 质量下拉菜单样式统一

## 范围与实现

- 分支 `codex/image-quality-dropdown-style`；从 `d7d7f5f3148c7abc168c560ae41cdc3da3d68594` 开始，发布前重新整合 origin/main。
- 原质量选择器使用原生 select，展开后由操作系统绘制，无法匹配画布的圆角、颜色、选中态和间距。
- 仅替换质量展示组件，新增独立 ImageQualitySelect，不改全站 SelectMenu 或正在协作修改的 canvas-client。
- 画布使用 canvas-ui 的触发框、菜单卡片、hover/选中令牌；portal复制最近画布主题，默认浅色。工具页使用 c-card/c-border/c-text。
- 菜单通过portal绕过Dock裁切；自动选择上下空间、夹紧水平位置、短窗口内部滚动。
- 保留质量标签、价格、分辨率报价、模型能力禁用、偏好更新与原生尺寸提示。画布仍三档，其他工具页仍五档。
- 支持方向键/Home/End/Enter/空格/Escape/Tab、禁用项跳过、选中勾号、外部点击和失焦关闭、页面滚动/缩放关闭；不会触发画布快捷键。

## 状态

集中源码测试、TypeScript、lint及参数/Dock/UI回归通过。首次新机固定版本1d936eb构建与发布通过，真实浏览器三档选择、深浅色、390px窄屏和独立组件禁用/键盘测试通过。窄屏截图发现菜单估高遗漏2px边框，已补计并添加精确118px回归；最终修订版发布与验收继续完成后追加。样式测试不触发模型生成；数据库、媒体、模型管理配置保持。旧机不连接、不回传；视频、OSS继续延期。

## 接手

```text
先读AGENTS.md、docs/AGENT_COLLABORATION.md和本文。质量业务逻辑仍在
image-quality-control.tsx；只展示和交互在ui/image-quality-select.tsx，
几何/键盘索引在ui/image-quality-select-layout.ts。不要恢复原生select，
不要借样式修复改变质量档位或计价。发布前合并最新main，新机全过程
持deploy.lock，备份后只切NAUMI_IMAGE，浏览器验证菜单再释放锁。
```
