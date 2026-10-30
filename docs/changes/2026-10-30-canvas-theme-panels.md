# 画布创作栏和弹层亮暗适配

## 范围、职责与兼容

- 起始主线：`82a7aa7305c38c631be9b62467d7e99be95601c6`。父统一工作树 `E:/Workspace/naumi-canvas-theme-20261030`。
- 本切片拥有 `composer-shell.tsx/.module.css`、`prompt-optimizer.tsx`、`image-version-control.tsx`、`text-image-generation-dialog.tsx`、`frame-ratio-dialog.tsx` 六个产品文件。
- 公共输入为父新增的 `useSurfaceAppearance(): "light" | "dark" | null`。Canvas 父 Provider 负责主题状态；组件只展示，未读取或写入另一份主题状态。React Portal 保留 context，但 DOM 根显式挂相应 `canvas-ui-light/dark`。
- 无 Provider 时使用原浅色默认，调用方 props API 不变。视频创作栏复用同一壳自动跟随；后台、工具页和全站主题的选择机制不改。
- 提示词/图像版本/画幅选择/文字生图的权限、报价、异步取消、参数和生成回调不变。未修改 `canvas-client.tsx`、`globals.css` 或父负责的 context 文件。

## 具体实现

1. `CanvasComposerShell` 删除硬编码浅色 class 和局部白色 token 覆盖。壳、footer、控件、placeholder、hover、focus、发送按钮改用既有 `--canvas-ui-*`；删除会压住 hover 的冗余 `!important` 控件覆盖，发送按钮与全局 primary token 一致。
2. `CanvasComposerOptions`、`CanvasPromptOptimizer`、`ImageVersionControl` 给原 `CanvasActionPanel` 传当前 context 的 light 判断，不再固定 `light`。打开状态中切主题同步刷新，不重置草稿/结果。
3. 优化错误、历史错误用父统一 `--canvas-ui-danger`；历史卡片、缩略图容器、已选边框使用 panel/soft/border/accent，避免只换外层后内部仍白底浅字。
4. `TextImageGenerationDialog` Portal 根挂局部主题；创作方式已选状态、checkbox accent/focus、遮罩跟随 token。原 showModal、键盘焦点、busy、取消门闩保持。
5. `FrameRatioDialog` Portal 根显式主题；参考卡片、说明文字、selected、按钮、边框、遮罩主题化。参考图像像素不改变，选择和继续/取消回调保持。

## 验证

测试脚本：`scripts/verify-canvas-theme-panels.cjs`。实际产品六组件、原 `CanvasActionPanel`、实际 Tailwind 编译的 `globals.css` 和 CSS module 在真实 Chromium 中执行。权限、CachedImage 媒体读取和业务回调为本地边界 fixture；没有替换主题组件或其 Portal。父另跑完整 Next CanvasClient 集成。

### 基线

```powershell
node scripts/verify-canvas-theme-panels.cjs --baseline --source-root E:/Workspace/naumi/output/canvas-theme-fix-20261030/panels/before --output-root E:/Workspace/naumi/output/canvas-theme-fix-20261030/panels/baseline
```

```text
CANVAS_THEME_PANELS=REPRODUCED FIXED_LIGHT_COMPONENTS=6 EXIT=1
```

实际 exit `1`，预期。此项是原始六文件的静态断言；不冒称 baseline 完整浏览器测试。真实旧版四组合截图在前轮 `canvas-theme-audit-20261030`，父负责新基线全集回归。

### 修改版

```powershell
node scripts/verify-canvas-theme-panels.cjs --source-root . --output-root E:/Workspace/naumi/output/canvas-theme-fix-20261030/panels/modified-hover-final
```

```text
CANVAS_THEME_PANELS=PASS CHECKS=23 REAL_COMPONENTS=6 APP_CANVAS_COMBINATIONS=4 SUPPLIER_CALLS=0 PAGEERRORS=0 EXIT=0
```

实际 exit `0`，覆盖：
- app light/dark × Canvas light/dark 的壳、优化、更多设置、历史版本、画幅选择、文字生图。
- 画幅按钮未选disabled→选中enabled、真实 selected 背景、取消和继续回调。
- 文字生图 checkbox、合并/逐条、Tab 焦点、Escape、busy 禁用与拒绝关闭。
- Portal 打开时切主题；无局部 Provider 时默认浅色；视频壳仍可用。
- 暗色错误字实际 `rgb(252,165,165)`，失败不能应用，原提示词不被覆盖。
- 控件真实 hover 背景为暗色 `rgb(42,46,56)`，不被 composer 基础 CSS 压回原色。
- pageerror `0`，外部网络 `0`，供应商调用 `0`。

`eslint` 五个修改 TSX 无输出，exit `0`；本模块未单独重复跑全项目 tsc。

前两轮失败为新测试 fixture 的 JSX 少一个闭括号，以及测试 useEffect 错把 `classList.toggle` 的 boolean 作为 cleanup 返回。修复仅限测试，未改变产品或放宽断言；原日志保留。

## 实际产物与交接

证据根：`E:/Workspace/naumi/output/canvas-theme-fix-20261030/panels/`。

- `BEFORE.json` 和 `before/`：修改前原字节与 SHA256。
- `baseline/BASELINE.json`、`baseline.log`：原静态缺陷复现。
- `modified-hover-final/RESULT.json`、`modified-hover-final.log`：23 项、加载文件绝对路径及 SHA256。
- `modified-hover-final/frame-dark.png`、`text-dialog-dark.png`、`composer-optimizer-dark.png`：真实组件渲染，已打开检查。

本切片未 Git commit/merge/push、未部署、未调用生产供应商。父负责总回滚制品、完整 Next 四组合与主线整合；局部通过不等于生产上线。
