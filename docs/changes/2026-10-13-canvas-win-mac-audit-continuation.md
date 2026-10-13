# 画布 Windows / macOS 继续排查

Audit-State: AUDITED

## 目标与边界

补查上一轮未充分覆盖的真实组件：裁剪、比例/分辨率、属性、Agent历史、创作Skills的输入法、焦点与关闭契约；补查编辑保存、重试、缺MIME文件和剪贴板优先级。输出独立复现、正向对照、当前源码位置与优先级，不把未验证项目记为通过。

- 日期2026-10-13；沿用独立分支 `codex/canvas-win-mac-audit-20261012` 和worktree，不更改共享checkout。
- 已刷新 origin/main，并在干净任务worktree普通快进 `ab5d7f1 → aaf92d8b33d54032bafb7b164747cb7825b3bae3`。
- 最新主线新增创作Skills。此前10类缺陷涉及的产品handler尚未修复；本轮不重复把旧问题记为新发现。
- JPEG下载统一PNG命名继续作为规则；不改产品、生产数据或服务器，不调用收费供应商。
- 本轮优先直接打包当前源码组件和实际函数作隔离测试。组件夹具不是完整Next应用/生产验收，也不是原生Mac输入法或系统剪贴板验收。
- 使用Windows Chrome/Edge与Mac平台模拟Chrome/Windows WebKit，集中跑完整补查模块；不反复跑上轮全套。

## 完成标准

1. 所有新结论具备实际组件或实际源码函数证据、触发输入和正向对照。
2. 输入法真实组合态与Safari keyCode229模拟分开分类，原生Mac结果不外推。
3. 保存失败、成功和重试分别验证；产品规则不记bug。
4. 报告、diff、验证与报告副本回滚重开检查，选择性提交并推任务分支。

## 本轮结果

新增 **6项确认问题（C13—C18）、1项Safari兼容风险（R02）、2项待确认/防护观察（O01/O02）**。前轮10类问题保留，不将同一已知入口重复计为新增；最新主线没有修复那些handler。本轮不实施产品修复。

**组件矩阵96项，64通过、32失败**（基础92项按键盘开启契约评估60/32，真实readonly补测4/0）；32次失败是跨配置、同组件多断言，包含风险/防护观察，不等于32个bug。实际源码函数另有7个正向对照通过、2个行为观察（1确认问题、1规则冲突），不混入组件矩阵。

### 新增确认问题

源码位置以固定 `aaf92d8` 基线为准，路径相对仓库；所有事件、回调和API为隔离组件/函数夹具。

| ID | 级别/范围 | 复现与实际结果 | 原因与建议 |
| --- | --- | --- | --- |
| C13 | P2，Win与Mac模拟 | 打开裁剪，焦点放百分比输入，发送 `Escape/isComposing=true`，dialog从1变0；四配置相同。普通非组合态Esc关闭、键盘开启后恢复焦点均有通过对照。 | `image-crop-dialog.tsx:25` 未检查组合态。对齐属性panel已有guard，组合期间Esc只交给输入法，保留裁剪区域。 |
| C14 | P2，Win与Mac模拟 | 比例/分辨率popover打开后焦点未进入panel；把焦点放最后按钮按Tab，焦点落到背景，四配置两条断言失败。补测只用参数按钮作为children，与当前调用场景相符。 | `parameter-popover.tsx:10-27,38-44` 没有初焦点、Tab边界或背景inert。统一受控初焦点、键盘循环/关闭恢复和可访问语义。无aria-modal声明不等于键盘可用。 |
| C15 | P2，Win与Mac模拟 | Agent历史→改名→填写未确认名称，组合态Esc令名称输入从1变0；没有保存请求，但草稿被隐藏并可能被下次编辑重置。四配置复现。 | `canvas-assistant-panel.tsx:227` 的局部input handler先取消改名，绕过外层188行组合态guard。局部guard必须一致；保存/取消期间保留输入法控制。 |
| C16 | P2，Win与Mac模拟，最新新增Skills | Skills→创建→输入创作流程，组合态Esc关闭整个技能库并清空draft；四配置复现。普通Esc清理inert/overflow与detail/draft的Shift+Tab边界均通过。 | `skill-book.tsx:73-76` Esc不检查组合态；`close()`清draft。至少组合态不关闭；未保存稿保留/确认关闭作为单独UX决定。 |
| C17 | P2，Win与Mac模拟 | 裁剪→保存，使真实busy=true；所有控件禁用后按Tab，document.activeElement落到背景而不是dialog。四配置复现；没有模拟真实服务器慢请求，只验证busy受控状态。 | `image-crop-dialog.tsx:26,28,38-40` 的focus圈依赖可用控件；全部禁用时没有可聚焦容器/背景inert。busy时保留dialog焦点，背景不应获得操作焦点。 |
| C18 | P2，条件性跨平台兼容缺陷 | 实际 `saveLocalImageEdit` 输入真正PNG字节、中文`.PNG`名称、size754906、`type=''`，请求数0，提示“请选择12MB以内的PNG、JPEG或WebP”。同一字节type=image/png会进入保存通道。未声称原生Finder/Explorer选文件实测。 | `canvas-client.tsx:6108-6110` 只检查file.type，而根上传/剪贴板已识别缺MIME扩展名。复用统一文件识别并实际解码/规范化，不凭扩展名跳过内容验证。 |

### 风险与观察，不混入确认缺陷

| ID | 分类 | 证据与下一步 |
| --- | --- | --- |
| R02 | Safari组合态结束顺序风险 | `canvas-assistant-panel.tsx:313-315` 在合成 `Enter/isComposing=false/keyCode=229` 时调用onSend一次；`isComposing=true`时0次、普通Enter一次的对照通过。四配置都验证handler分支，但不能据此断言原生Safari当前拼音输入法一定产生该序列。用真实macOS/Safari记录compositionstart/end、keydown、beforeinput后决定采用229或组合生命周期guard。 |
| O01 | 参数primitive的防护观察 | `parameter-popover.tsx:22` 在合成组合态Esc时仍关闭。生产参数内容目前只有按钮，不是文字编辑；初筛的测试输入框已移除并用按钮重新验证。保留handler防护缺口，不将“候选文字丢失”写为当前可达产品bug。 |
| O02 | 剪贴板优先级规则待确认 | `handleCanvasPaste` 的注释称系统image永远优先，但 `canvas-client.tsx:6868-6872` 在图片文件提取前执行workflowPaste，识别稿定HTML时workflow=1/imageUpload=0；真实函数依赖替身复现。若产品希望复制工作流时HTML优先于附带预览图，该行为可接受；不能仅凭注释判bug。下一步用真实混合剪贴板样本核对规则；不要贸然将图片置前破坏工作流复制。 |

JPEG统一PNG命名是用户已确认规则；本轮既不更改该行为，也不重开相关bug。

### 正向对照与排除项

- 属性panel组合态Esc保持，普通Esc关闭；390px overlay Tab循环、真正readonly=true时跳过fieldset禁用控件，四配置均通过。
- Agent普通Enter单次提交、真实组合态Enter零提交；历史改名Tab仍在panel内。
- Skills detail/draft首按钮Shift+Tab到最后操作按钮；关闭后背景inert和body overflow正确恢复；390px dialog在视口内。没有把新Skills整体判为不可用。
- 实际保存函数：替换HTTP500提示可见且busy释放；裁剪成功刷新一次、记一次新增版本历史并关闭；文字保存HTTP500保留unsaved，重试成功清理；属性保存失败不修改本地、不推进undo，成功仅1条undo；纯图片粘贴进入上传。
- 全部source函数原体AST提取后转译，API/闭包状态受控；不属于真实DB持久化验收。虚拟机跨realm Error最初触发错误的fallback断言，统一Error构造器后纠正，不计产品缺陷。
- WebKit鼠标点击按钮不保证留下焦点，首轮“关闭后必须回到鼠标点过的trigger”预期不准确。改用Enter键开启后，真实组件恢复原焦点通过。首轮结果59/33不覆盖；`assessed-results.json`关联键盘复验，最终60/32。不是产品修复。
- 参数弹层初筛包含instrumentation输入框，后来按真实调用只保留按钮，16条专项重验同样是12失败/4通过；按同ID替换评估来源，不重复计数。

## 当前基线复核与证据

工作根：`C:/Users/13357/.codex/worktrees/canvas-win-mac-audit-20261012/naumi`。

证据目录：该工作根下 `output/canvas-win-mac-audit-20261013`。

- `browser/results.json`：首轮四配置92项原始59/33；`components-verified.log`保留命令输出。
- `webkit-keyboard-focus/results.json`：Enter开启裁剪后的focus恢复复验；旧pointer结果另存，不计新bug。
- `parameters-button-verified/results.json`：真实按钮children专项16项。
- `readonly-verified/results.json`：真正readonly四配置4项通过；原基础项叫readonly但其实是普通overlay，评估时改正确名称，不冒充只读覆盖。
- `assessed-results.json`：所有最终判定、原始记录、补验来源与计数，文件不覆盖原始日志。
- `runtime/results.json`：两条行为观察与七项正向对照。
- `previous-baseline-review.json`：位置保存/多移动/ZIP/右键四函数原体相同；标注、ComfyUI和Orb四文件字节不变。对此前其它问题通过git差异审阅确认相关handler未变，不称本轮重新跑过完整旧UI矩阵。
- `component-failure-contact-sheet.png`：六类组件截图汇总重开复核；截图中的背景按钮是测试夹具，不是产品新增文字。
- `typecheck.log`：`npx tsc --noEmit --pretty false`输出空、退出0；三新脚本语法检查与git diff --check通过。
- `MODIFIED_FILE.md`、`DIFF_FILE.diff`、`VERIFICATION.txt`、`ROLLBACK.sh`：报告副本与报告回滚演练；不修改产品或服务器。

本轮直接打包当前源码React组件、当前global/Tailwind/module CSS，替换authHeader为测试边界并拦截Skills API。没有全应用Next构建，不复用前轮优化页面来冒充新Skills页面验收。无真实账户、供应商请求、生产DB操作；原生Mac/Safari/IME/系统剪贴板仍待实机。

## 修复分组与下一步

1. IME模块：前轮C01/C02/C09加本轮C13/C15/C16，逐个局部handler修复，保留普通快捷键对照；R02以实机事件序列补证。
2. 弹层模块：C11/C14/C17和旧C12小球避让，统一初焦点、busy焦点、背景隔离、Tab/关闭恢复，集中390px/桌面验收。
3. 保存/媒体模块：前轮C08、C05/C06/C07加C18。文字/属性成功与失败已有通过对照，不做不必要重写；O02先确认混合剪贴板产品优先级。
4. 未覆盖：真实Finder/Explorer文件、Safari系统写图、Win实际显示缩放/跨屏、macOS触控板与IME、完整页面所有弹层相互叠加、大画布性能、视频codec、生产刷新持久化；本轮组件矩阵不能替代这些。

## 复跑与接手

```powershell
# 在上述工作根；实际组件fixture和API无生产连接。
node scripts/audit-canvas-extended-browser.mjs
node scripts/audit-canvas-extended-runtime.mjs
# 真正只读状态补测，默认基础矩阵不重复执行。
$env:CANVAS_EXTENDED_CHECKS='properties-readonly-fields-filter'
$env:CANVAS_EXTENDED_EVIDENCE='output/canvas-win-mac-audit-20261013/readonly-verified'
node scripts/audit-canvas-extended-browser.mjs
Remove-Item Env:CANVAS_EXTENDED_CHECKS,Env:CANVAS_EXTENDED_EVIDENCE
```

```text
继续以本报告aaf92d8基线为参考修复或补实机证据。先刷新origin/main，保留独立codex分支/worktree与同事改动；一个完整模块完成后集中验证并更新文档。
保留JPEG统一PNG命名规则；区分C13—C18确认问题、R02真实Safari待测、O01防护观察和O02产品优先级待确认，不用夹具结果冒充上线/原生Mac验收。
```

本轮仅审计文档与测试脚本，功能模块迭代/发布次数0，维护计数不变；收尾origin/main仍aaf92d8。Git按任务文件选择性提交并推同一任务分支，不操作服务器。
