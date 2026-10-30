# 画布亮暗主题完整接线修复

## 范围、基线与证据

- 用户要求修复前轮排查出的亮暗主题漏项。基线 `82a7aa7305c38c631be9b62467d7e99be95601c6`，包含前轮画布反馈修复及同事新合入的自动画幅修正；不倒退到旧 `4038b061`。
- 独立工作树 `E:/Workspace/naumi-canvas-theme-20261030`；证据目录 `E:/Workspace/naumi/output/canvas-theme-fix-20261030`。
- 前轮原始排查：`E:/Workspace/naumi/output/canvas-theme-audit-20261030/REPORT.md`，四组合真实页面及计算颜色已证明错误，不以grep命中代替复现。
- 103独立模型映射实验线及重构分支不合入；只调整UI表现、局部主题上下文和主题本地初始化，不改生成参数、计费、任务或供应商逻辑，不部署。

## 模块归属与接口

- `ui/surface-appearance.tsx` 提供一个可选的局部 `light | dark` React context。CanvasClient最外层提供值，普通控件读取；React Portal保留context，但DOM仍显式挂 `canvas-ui-light/dark`。无context时保持组件既有工具页/后台行为，不读取或覆盖全站主题。
- `globals.css` 仅在已有Canvas主题作用域补齐通用HSL/旧 `--c-*` 中性色、状态色和组背景色。既有 `--canvas-ui-*` 为画布色值的主来源；不全站改工具和后台样式。
- 公共创作栏、优化/参数/历史版本、文字生图/画幅对话框：去掉硬编码浅色，用统一context和既有token。
- 通用SelectMenu、文字/质量模型菜单：包括已展开的Portal跟随当前局部主题，不再将Canvas菜单误用 `tool-popover`；其他页面的固定浅色保留。
- 分组、生成失败、任务恢复：只改变背景、文字、边框/hover。持久组ID、拖动/撤销、回执恢复流程保持。
- 画布本地主题初始化：服务器与客户端首次render同为默认浅色，hydration后layout effect恢复 `nv:canvas:bg`，避免首次属性树不一致；不改全站 `theme` 或加入自动跟随系统逻辑。

## 已实现问题清单

| 编号 | 修复 |
|---|---|
| T01 | 原位生成遮罩从不存在的surface token改为panel-solid，标题使用同一主题文字 |
| T02 | 分组底板/选中/边框/阴影主题化；暗色标题不再落近白底板 |
| T03 | 文字失败原因改主题warning文字，图片失败卡和按钮配套warning色 |
| T04 | 文字模型不再强制light，旧--c-*在Canvas局部桥接，不再白底浅字 |
| T05 | 图片/空图/文字/视频创作栏主题统一，footer和参数按钮不再重设固定浅色 |
| T06 | 优化/更多参数/版本/文生图/画幅/历史素材弹层显式继承Canvas主题 |
| T07 | 恢复任务/导入状态与共用模型Portal跟随Canvas，打开中切主题同样更新 |

## 实现分工与集中验收

父维护CanvasClient、globals、公共context和主线整合；两个实现子代理分工panel与共享控件/状态；第三子代理维护完整Next四组合回归。每个模块集中测试，不为小改反复跑构建。

计划验收：全站light/dark×Canvas light/dark、刷新localStorage持久、主面板/Portal、hover/focus/disabled/loading/error、4项已知文字对比度不少于4.5:1、工具/后台固定浅色保护。完整Next以本地API/媒体fixture运行，实际组件/CSS/点击真实执行，真实供应商0；罕见对话框另用实际组件fixture并明确层级。

最终命令、结果、源码哈希、副本回滚及截图见各模块文档及证据目录 `artifacts/VERIFICATION.txt`。本段随集中验收更新，不将准备中的用例写成已通过。

## 初轮集中验收发现与补修

- 旧完整Next四组合实际复现4类可读性缺陷，非静态颜色推断。
- 修改版第一轮已修复旧4类问题，但实际测试补出浅色文字模型按钮4.4249:1略低于4.5；将Canvas muted从#697383调到#626d7c，并保持旧token桥接一致，未降低验收阈值。
- 输入/按钮focus使用主题accent，生成主按钮也明确:focus-visible；真实键盘Tab验证，不用鼠标模式下programmatic focus冒充键盘焦点。
- 主题预绘制脚本合法地改变html.dark，因此html单层标记suppressHydrationWarning；Canvas子树仍正常验证hydration。测试移除历史fixture的HTML头部注入，仅通过addInitScript设置本地项目入口，避免测试污染产品SSR结构。
- 同类快捷键帮助Portal、导入同步/定位按钮也接同一token，不改快捷键/搜索/任务行为。
- 初轮完整Next修正版88项通过，4组合0违规、0pageerror、0hydration警告；最终整合版仍另记录。

## 最终整合与验收

- 已普通整合main `d4dcea3a0c893e57ae75ce36505d71d9d4778ad0`（同事自动画幅/最接近比例修复保留），主题产品树固定于 `dc3d3cfe700e995ee92a900e9a7230732662d430`，最终额外提交仅测试/文档。
- 完整Next最终：4组合、97检查、0违规、0pageerror、0hydration警告；四组合逐次刷新偏好保持。原d4归档使用同runner复现36违规，exit1为预期。
- 实际组件：panels23 PASS、controls15 PASS；整合后父又跑一轮，均exit0。四处关键文字对比：原位生成14.17:1、文字失败10.50:1、分组选中10.94/未选中12.69:1、浅色模型按钮4.85:1。
- 完整tsc exit0，fanout相邻核心15 PASS；帮助目录测试原有selectionKeyCode字面落后于基线和bg-white断言落后于主题，改为当前手形逻辑和主题类/context明确断言，不删快捷键/焦点/无障碍检查。
- 独立静态审阅以d4→dc3主题净增量：无新增确定P1/P2；未以静态审阅替代上述浏览器实测。
- 生成/计费/恢复业务逻辑未改，main推送不代表线上部署；本次仍不发布47或103。
- 最终副本回滚、补丁重放与四制品路径/哈希由证据根 `FINAL_STATUS.json`、`artifacts/VERIFICATION.txt` 登记，原测试失败过程保留。
