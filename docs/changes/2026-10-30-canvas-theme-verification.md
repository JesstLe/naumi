# 亮暗主题完整画布验证

## 模块与职责

`scripts/verify-canvas-theme-matrix.cjs` 对指定源码根启动真实 Next CanvasClient，使用真实 ReactFlow、组件、CSS、Portal、浏览器键盘/点击和computed style。身份、API和媒体为本地HTTP fixture，不调用真实供应商、不改生产DB。

- 初始诊断基线：`82a7aa7305c38c631be9b62467d7e99be95601c6`；最终整合验收与副本回滚基线：`d4dcea3a0c893e57ae75ce36505d71d9d4778ad0`。两者分别完整 `git archive` 解压，最终命令只使用后者。
- 默认独占端口15381（测试代理）/15382（Next），自动关闭本次父子进程，不扫描或停止其他应用。
- 支持 `--source-root`、`--output-root`、`--baseline`、`--port`；只从指定根加载产品源码，逐文件记录绝对路径与SHA256。
- 只调整已有本地fixture代理：删除原来的HTML脚本注入，不修改产品JS/CSS，不强制每次加载设亮色。真实Next GET /canvas 200完成才开始浏览器。
- Next自动增加的本次type-cache include在退出时经内容检查恢复；并发/非预期tsconfig变化保留，不覆盖他人修改。

## 关键覆盖

1. 全站light/dark × Canvas light/dark四组合：图片/文字/空图创作栏、优化Portal、图片历史、更多参数、文字生图、Agent模型菜单。
2. 真实键盘Tab/Shift+Tab焦点、模型按钮默认与hover颜色、文字失败、原位生成loading及disabled、原位失败pill、任务恢复列表。
3. 成组的选中/非选中底板和标题；实际组API数据fixture，但真实Canvas点击和层级。
4. 在线改字执行模型下拉Portal、全站和Canvas暗色本地偏好刷新保持、console hydration检查。
5. 帮助弹层light/dark，实际更多菜单入口、搜索、Escape。
6. 四处已确认的可读性缺陷使用浏览器实际颜色和层叠背景合成，对比度至少4.5；组标题使用后方实际分组底板而不是DOM透明父背景。

未在本完整Canvas脚本强行制造多参考图歧义来调出frame chooser。该对话框、文字生图细节/Tab/busy/checkbox、打开着切换主题由panels独立真实组件验证；整卡GenerationPlaceholder.failure与无Canvas工具页隔离由controls独立组件验证。二者与完整Next证据分层，不合称全部均为完整Canvas入口。

## 可复现命令

```powershell
node scripts/verify-canvas-theme-matrix.cjs --baseline --source-root E:/Workspace/naumi/output/canvas-theme-fix-20261030/integrated-baseline-source --output-root E:/Workspace/naumi/output/canvas-theme-fix-20261030/matrix/integrated-baseline-final
node scripts/verify-canvas-theme-matrix.cjs --source-root E:/Workspace/naumi-canvas-theme-20261030 --output-root E:/Workspace/naumi/output/canvas-theme-fix-20261030/matrix/modified-final
```

Baseline预期exit1且显式检查旧代码确有四处contrast不合格；Modified必须所有断言通过才exit0。最终实际命令与字面输出已记录于下方；副本回滚执行记录保存于证据根 artifacts/VERIFICATION.txt。

## 发现过程保留

- R1就绪探针只读mock API，早于Next监听，浏览器拿到502；修为等实际Next页面编译200。
- baseline R2将原位失败误定位为整卡；实际原位显示小pill，修测试定位不改产品。
- baseline R3真实复现四组合82断言中的39漏项，包含四类contrast缺陷。
- modified R1旧四项P2已全闭合，仍有light模型按钮对比4.4249，父已调整muted token。programmatic focus未模拟keyboard modality造成4个fixture失败，改真实Tab路径。
- 诊断代理原HTML项目脚本注入导致hydration脚本序列不一致，已删除整个HTML注入，项目仅Playwright initScript设置，不改变产品DOM。全站dark prepaint的html class与SSR不同由父单层html声明处理，不掩盖Canvas子树。

真实供应商调用0，生产写入0。此脚本不发布服务器、不修改计费/请求参数/恢复规则。

## 最终实际结果

父整合main后的任务HEAD为 `dc3d3cfe700e995ee92a900e9a7230732662d430`，原像为main `d4dcea3a` 的完整归档。相同最终runner连续运行：

```text
CANVAS_THEME_MATRIX=REPRODUCED COMBINATIONS=4 CHECKS=97 VIOLATIONS=36 FULL_NEXT=YES SUPPLIER_CALLS=0 EXIT=1
CANVAS_THEME_MATRIX=PASS COMBINATIONS=4 CHECKS=97 VIOLATIONS=0 FULL_NEXT=YES SUPPLIER_CALLS=0 EXIT=0
```

实际baseline exit1为预期复现；modified exit0。开始/结束产品hash一致，无运行中版本漂移；每个四组合都刷新核对原应用/画布偏好，没有fixture强制light；console hydration0、pageerror0、外部网络0。modified-final截图已打开：暗色优化、分组、生成中、浅色文字等；截图是实际完整Next，不是CSS示意稿。

最终主要对比度：原位生成标题14.17:1；暗文字失败10.50:1；组标题选中10.94:1、非选中12.69:1；浅色文字模型按钮4.85:1（详见RESULT JSON实际值）。全部已测可读性条件≥4.5。脚本在opacity disabled状态不宣称普通正文对比，需要正常可读信息已逐项单测。

完整记录：`matrix/integrated-baseline-final/RESULT.json`、`matrix/modified-final/RESULT.json`、各自同名.log。临时Next父子进程结束，端口15381/15382释放，任务tsconfig已恢复。没有修改产品文件。
