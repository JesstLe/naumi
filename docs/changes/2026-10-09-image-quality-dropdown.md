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

集中源码测试、TypeScript、lint及参数/Dock/UI回归通过。首次新机固定版本1d936eb构建与发布通过，真实浏览器三档选择、深浅色、390px窄屏和独立组件禁用/键盘测试通过。窄屏截图发现菜单估高遗漏2px边框，已补计并添加精确118px回归。

最终修订版已发布并完成实际浏览器验收：

- 源码 `f859393de304725458811e75186665a1191b4ee8`；镜像 `ghcr.io/jesstle/naumi:f859393de304725458811e75186665a1191b4ee8`。
- Image ID `sha256:22f4449431d22e30746d1df2f4f629a063e37cdaf52acb30d89719187c5cd714`；公网 `/api/version` 为 `1791541892`。
- 新机证据 `/opt/naumi-staging/evidence/image-quality-dropdown-20261009-r2`；本机 `E:\Workspace\naumi\output\image-quality-dropdown-20261009`。
- 从备份到浏览器验收持共享deploy.lock，release unit最终success/exit0并释放锁。切换前运行基线为1d936eb；env仅NAUMI_IMAGE变更，DB容器和公网代理状态/Compose hash不变。保留DB dump、env与前一镜像备份，不回灌数据。
- 浅色白底/深色继承画布令牌，菜单圆角12px；三档实际高118px，clientHeight=scrollHeight=116，没有无用滚动条。390×844实际菜单left154.14、right362.14，完整落在视口内。
- 实际End+Enter选高质量、价格10积分；鼠标选回标准6积分，选中态与焦点恢复正确；外部点击/Escape/Tab关闭。原质量标准与深色偏好已还原。
- 普通精修页实际五档、白色卡片与原报价一致；独立组件fixture实际测试禁用项拒绝选择、整体disabled、键盘跳过disabled、390×220菜单内部滚动。fixture与真实页面证据分别记录，不混称生产能力验证。
- 参数回归288组合/90次拒绝、Dock2625布局案例、既有UI6模块契约全部通过。样式验收不生成，任务/账单/ledger计数保持281/281/1448，canvas task为0。
- 首轮证据保留为被修订版替代；辅助验收shell首次CRLF造成语法exit2，已统一LF并bash -n/reopen，最终三分支exit0。发布切换短暂502后的工具页重新加载200，不记初次失败为通过。

## 四件套与回滚

`MODIFIED_FILE.tar.gz` 是固定f859393导出（不是最终文档提交）；`DIFF_FILE.patch` 对比最初d7d7f5f；原工作副本hash与Git规范化字节hash分别保留。`VERIFICATION.txt`含命令/输入/原始输出/exit/hash及浏览器JSON；`ROLLBACK.sh`远端mode700。

`ROLLBACK.sh --fixture`在另一个mktemp源码副本反向patch，六文件hash恢复d7d7f5f，并重跑原生菜单基线；主源码及主服务仍保留自定义菜单。此测试不冒充主服务实际回滚。`ROLLBACK.sh --apply`自动获取相同deploy.lock，仅当运行候选仍f859393且env等于本轮发布后副本时，恢复发布前1d936eb镜像并重验health，不操作DB/媒体。

```bash
# 三个分支都在真实新机运行成功，详细输出见VERIFICATION。
bash /opt/naumi-staging/evidence/image-quality-dropdown-20261009-r2/verify-transaction.sh BASELINE
bash /opt/naumi-staging/evidence/image-quality-dropdown-20261009-r2/verify-transaction.sh MODIFIED
bash /opt/naumi-staging/evidence/image-quality-dropdown-20261009-r2/verify-transaction.sh ROLLBACK
# 仅在需要撤销本轮发布时执行；内部获取共享锁，不用于日常验收。
bash /opt/naumi-staging/evidence/image-quality-dropdown-20261009-r2/ROLLBACK.sh --apply
```

数据库、媒体、模型管理配置保持。旧机不连接、不回传；视频、OSS继续延期。验收文档提交不代表额外应用版本。

## 接手

```text
先读AGENTS.md、docs/AGENT_COLLABORATION.md和本文。质量业务逻辑仍在
image-quality-control.tsx；只展示和交互在ui/image-quality-select.tsx，
几何/键盘索引在ui/image-quality-select-layout.ts。不要恢复原生select，
不要借样式修复改变质量档位或计价。发布前合并最新main，新机全过程
持deploy.lock，备份后只切NAUMI_IMAGE，浏览器验证菜单再释放锁。
```
