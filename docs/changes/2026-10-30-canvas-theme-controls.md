# 画布主题：共用选择器与状态组件

## 范围与基线

- 父任务隔离工作树 `E:/Workspace/naumi-canvas-theme-20261030`，基线 `82a7aa7305c38c631be9b62467d7e99be95601c6`。
- 修复上一轮主题排查 T02/T04/T07 对应的选择器、分组、生成失败和恢复面板。生成请求、报价、持久任务和恢复逻辑不变。
- 本切片不改 `canvas-client.tsx` / `globals.css` / 创作栏壳；由父接入 `SurfaceAppearanceProvider` 和定义主题 token。后台、工具页仍按现有规则保持浅色。

## 职责与接口

`ui/surface-appearance.tsx` 是父定义的窄 UI context：值为 `light | dark | null`。Canvas 明确提供值；其他页面保持 `null`。Context 随 React portal 传递，portal DOM 根再挂 `canvas-ui-light/dark`，不从全站未知主题猜 Canvas 主题。

### SelectMenu / ImageQualitySelect

- 有局部主题时按钮与菜单使用 Canvas token，portal 挂对应主题类。
- 菜单已经打开时切换 context 会即时更新主题，不仅在点击瞬间采样。
- `SelectMenu` 在局部主题明确时只过滤调用方遗留的 `canvas-ui-light`、`canvas-ui-dark`、`tool-popover`；保留其他 `popoverClassName`。这覆盖图片模型以及视频模式/时长的旧固定浅色调用点，避免 light/dark 两类同时存在被 CSS 顺序反向覆盖。
- 没有 context 的工具页仍按原 `.tool-page` 检测附加 `tool-popover`。原键盘、焦点、搜索、禁用、选择、定位逻辑保持。

### TextModelSelect / FeatureModelSelect

- Canvas context 优先于旧 `dark` prop；普通文字栏即使历史调用点传 `dark=false`，也按所属 Canvas 显示。
- Agent composer 不再在 Canvas 内强加工具页浅色菜单。
- 内联菜单、自定义模型 portal、加载/失败、按钮和输入框使用同一局部色源。工具页及无 context 的 legacy 路径保留原样式分支。
- FeatureModelSelect 仅调整错误/加载文字样式，目录、能力与选择规则不变。

### 分组与生成/恢复状态

- 分组背景、选中背景、边框、阴影改为父维护的 `--canvas-ui-group-*`；标签和计数复用 `--canvas-ui-muted/soft`。保留原几何、层级、拖动、历史逻辑。
- 生成失败卡片使用 `--canvas-ui-warning-bg/text/border`，按钮背景使用 `--canvas-ui-panel-solid`；不改模拟进度或供应商阶段。
- 待恢复任务仅新增 context/样式类；不改原 receipt、轮询、作用域、合并或清理条件。

## 集中验证

脚本 `scripts/verify-canvas-theme-controls.cjs` 支持 `--source-root`、`--output-root`、`--baseline`。真实共享组件、生产 globals/Tailwind/CSS、真实 React 和浏览器点击；模型/身份/任务边界是明确的惰性 fixture，不访问生产。

```powershell
node scripts/verify-canvas-theme-controls.cjs --baseline --source-root E:/Workspace/naumi/output/canvas-theme-fix-20261030/baseline-source --output-root E:/Workspace/naumi/output/canvas-theme-fix-20261030/controls/baseline
node scripts/verify-canvas-theme-controls.cjs --source-root E:/Workspace/naumi-canvas-theme-20261030 --output-root E:/Workspace/naumi/output/canvas-theme-fix-20261030/controls/modified-final
```

Baseline 实际输出：

```text
CANVAS_THEME_CONTROLS=REPRODUCED CHECKS=1 REAL_COMPONENTS=YES SUPPLIER_CALLS=0 EXIT=1
```

预期 exit 1；实际原菜单仍白色、原分组背景仍为 `rgba(247,250,255,.96)`，不是以新组件缺失代替运行复现。

Modified 实际输出：

```text
CANVAS_THEME_CONTROLS=PASS CHECKS=15 REAL_COMPONENTS=YES SUPPLIER_CALLS=0 EXIT=0
```

覆盖四种全站/Canvas 组合、菜单打开中切主题、旧 light 类覆盖与自定义类保留、键盘与禁用选项、质量菜单、文字 inline/context 优先、自定义模型弹层、Agent 模型菜单、组/失败/恢复面板、工具页浅色保护、0 pageerror/外网。恢复面板打开未触发 task check。

首轮只有测试采样过早：从质量菜单切换后鼠标落在文字按钮上且颜色仍在 transition，读到 hover 中间值。测试移开鼠标并等待 computed background 稳定后通过；没有改产品颜色或放宽断言。失败保留 `controls/modified-r1/ERROR.json`。

集中 ESLint 对本切片五个 TSX 文件运行，无输出 exit 0。父执行全量 tsc、完整 Next 四组合、总副本回滚、合并与制品封存；此独立组件测试不替代生产上线验收。

## 状态

- 本模块完成源码与组件集中验证。
- 尚未部署服务器；不涉及 103 实验分支或生产供应商调用。
- 真实主页面截图与最终合入状态由父统一记录。
