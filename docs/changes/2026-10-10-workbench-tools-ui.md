# 工作台26工具UI修复与分支交接

- 分支：`codex/workbench-tools-ui`；源码基线：`0c8c8c35917d804e8981fb392a73aebe1697d7d7`。
- 独立目录：`C:\Users\13357\.codex\worktrees\workbench-tools-ui\naumi`。
- 本轮集中验收完成，只提交分支，不合并、不发布新机、不回传旧机。
- 最后fetch的origin/main：`f6e9c47a59ae4e9dd8214c1d19dba0e3ed5696d3`。供应商渠道模块留给整合agent合并验收。
- 模型管理范围/报价/计费/鉴权/数据库/画布架构保留；无后端迁移或配置修改。

## 共享修复

1. 工具页面、导航、页脚使用局部浅色tokens，不改存储主题，画布/后台保留原主题。
2. minmax(0,1fr)与自适应高度替代固定890px；平板历史跨列，手机历史可见，对比图窄屏纵排。
3. 参数/模型/质量下拉统一42px、10px圆角；质量标签不换行；Portal视口保护，键盘/禁用项/关闭行为完整。面板内滚动不再误滚走整页；外部滚动重新定位。
4. picker/drag/通用剪贴板校验格式/大小/空文件；处理中锁定参数和输入。保留各工具上限；竞品保留自己的批量压缩链。
5. 非200历史结束骨架并可重试；历史查看/选择为分离原生按钮，支持键盘；ZIP使用现有鉴权头；无效source标记不作原图。
6. 套图/生图/A+预览变化不再误revoke或终止轮询；再编辑验证响应/文件，错误JSON不替换原图。
7. 修正无效参数、静态图误称360度、报价/选模feature不匹配、标题和检测重复模型入口。

## 逐工具验收矩阵

全部工具与工具中心均检查1440×900、1024×900、390×844浅色与布局。以下交互使用隔离fixture，不代表真实供应商效果。

| 工具与路由 | 修复/核验 | managed交互组数 |
|---|---|---|
| 竞品工作台 `/competitors` | 编辑器控件统一；框选、移除选区、下拉键盘 | 3 |
| AI 生图 `/generate` | 布局/手机历史、上传URL和轮询生命周期、历史失败重试 | 3 |
| 视频工作台 `/video` | 平板历史跨列、未配置禁用、目录失败重试、忙碌锁定、能力重置 | 3 |
| 一键套图 `/suite` | 计划/质量下拉、自定义镜头删除、URL/轮询生命周期 | 5 |
| Agent 任务 `/agent` | 上传失败保留文案/参考图、上传中禁发送、对话错误恢复 | 2 |
| A+ 详情页 `/aplus` | 统一参数下拉、忙碌锁定、URL/轮询生命周期 | 4 |
| 模切线转 3D `/packaging3d` | 16MB/SVG契约、参数圆角尺寸、文件校验和busy | 4 |
| 爆款复刻 `/replicate` | 复刻双输入校验、共享选择器、busy保护 | 4 |
| 图裂变 `/variations` | 显式image.generate，分类variation不改；轮询与再编辑失败恢复 | 4 |
| 产品精修 `/retouch` | 浅色参数面板、locale、同源下载替代跨域download属性 | 3 |
| AI 抠图 `/cutout` | 删除无效羽化/背景选项；实际透明PNG输出 | 4 |
| 抠头像 `/avatar` | 只显示白/黑/透明；黑底正确传参；删除无效尺寸 | 6 |
| 产品换色 `/recolor` | HEX中间态可编辑/六位提交/模糊恢复，选中反馈/同源下载 | 4 |
| AI 变清晰 `/upscale` | 注册表删除无8x能力；共享上传、历史和错误恢复 | 4 |
| 局部改图 `/inpaint` | 局部涂抹busy、picker/drag、再编辑下载和文件验证 | 4 |
| 风格转换 `/style` | 共享样式/参数/上传/历史/错误恢复 | 5 |
| AI 融图 `/fuse` | 显式image.generate，分类fusion不改；双图、轮询与再编辑恢复 | 4 |
| 去水印 `/dewatermark` | 共享样式/参数/上传/历史/错误恢复 | 5 |
| 服装上身 `/tryon` | 服装picker/drag与busy保护、再编辑响应验证 | 4 |
| 服装提取 `/garment` | 删除未生效挂拍；精细选项进入现有prompt | 5 |
| 3D 服装图 `/garment3d` | tool.garment3d正确报价/选模/分辨率；静态3D图非旋转模型；背面进入prompt | 5 |
| 服装去皱 `/dewrinkle` | 强度与纹理选项进入现有prompt | 5 |
| 标题生成 `/titles` | 只保留文字模型，移除图片执行模型；8MB验证 | 3 |
| 印花提取 `/extract` | 明确tool.extract，不再按printfile选模/报价；分类print保持 | 5 |
| 侵权检测 `/ipcheck` | 只保留一个分析模型并绑定tool.ipcheck | 3 |
| 印刷图 `/printfile` | 20MB契约；失败队列重试回pending；再编辑验证/busy | 3 |

## 集中测试结果

- 基线契约：`BASELINE_CONTRACT=PASS TOOLS=26 CONFIRMED_GAPS=6`。基线渲染无外层溢出和客户端异常，不冒称曾复现外层溢出。
- 修复契约：`MODIFIED_CONTRACT=PASS TOOLS=26 FIXED_GAPS=7 UNIT_CASES=45`，另检查检测单入口与正确feature。
- 普通目录全量：`MODIFIED_BROWSER=PASS TOOLS=26 VIEWPORTS=3 OVERFLOW_CASES=0 CLIENT_ERRORS=0 FIXTURE_POSTS=34 INTERACTIONS=92 REAL_UPSTREAM=0`。
- managed目录全量：`MODIFIED_BROWSER=PASS TOOLS=26 VIEWPORTS=3 OVERFLOW_CASES=0 CLIENT_ERRORS=0 FIXTURE_POSTS=34 INTERACTIONS=104 REAL_UPSTREAM=0 MODEL_MODE=MANAGED`。
- 质量标签/检测单入口最后定向复验：`MODIFIED_BROWSER=PASS TOOLS=2 VIEWPORTS=3 OVERFLOW_CASES=0 CLIENT_ERRORS=0 FIXTURE_POSTS=3 INTERACTIONS=9 REAL_UPSTREAM=0 MODEL_MODE=MANAGED`。
- TypeScript、lint、优化build、质量选择器与画布浅色契约回归退出0；保留原annotate-editor img lint警告。build完成编译、类型检查、92页静态生成；Windows依赖junction导致standalone trace复制EPERM，非Linux镜像验收。
- 记录覆盖失败/重试/成功、历史失败重试、历史键盘、再编辑失败/恢复（无自动提交）、多图、局部涂抹、自定义镜头删除、HEX编辑、竞品框选移除、视频目录恢复、Agent错误恢复。
- 业务API均隔离模拟，真实上游调用0；未改生产数据库/账户。视频仅未配置/配置fixture/失败恢复，真实视频配置/生成仍未验收。

## 证据与复验

完整截图/请求/原始日志：`E:\Workspace\naumi\output\workbench-tools-ui-20261010`。
其中MODIFIED_FILE.tar.gz、DIFF_FILE.patch、VERIFICATION.txt、ROLLBACK.sh为交付证据。原hash是git基线字节；回滚只在独立源码副本演练，不是服务器回滚，真实worktree保留修复。脚本全量hash预检后仅还原明确修改文件并移除新增文件。

```powershell
node node_modules/tsx/dist/cli.mjs scripts/verify-workbench-tools.ts
$env:TOOLS_EVIDENCE_DIR='E:\Workspace\naumi\output\workbench-tools-ui-20261010\managed-browser'
node scripts/verify-workbench-tools-browser.mjs --managed-fixture
node node_modules/typescript/bin/tsc --noEmit --pretty false
node node_modules/next/dist/bin/next lint
$env:NEXT_DIST_DIR='.next-workbench-build'
node node_modules/next/dist/bin/next build
node node_modules/tsx/dist/cli.mjs scripts/verify-image-quality-select.ts
node scripts/canvas-light-theme-smoke.mjs
```

## 接手提示词

```text
阅读AGENTS.md、docs/AGENT_COLLABORATION.md与本记录。fetch最新main后，整合origin/codex/workbench-tools-ui任务提交。
保留他人改动；重点复核共享SelectMenu/ImageQualitySelect/AppShell与模型管理/画布整合，保持后台模型范围和API/报价。
集中跑26工具普通与managed-fixture浏览器验收，随后在Linux构建固定SHA镜像并执行实际运行验收。
不要把fixture成功当作真实模型输出验收；不要改数据库/媒体/模型配置。是否发布遵守接手任务最新用户要求；禁止自动回传旧机。
本分支交付未发布；回滚证据仅源码副本演练。
```


## 第二轮继续排查（2026-10-10，基线39f6208）

仍仅交付 `codex/workbench-tools-ui`，不合并、不发布。开工fetch确认 `origin/main=b20e148c257120cd85e33bf8b7999c5c42d192a7`；集中整合由接手agent进行。

### 已复现与修复范围

- 标题生成：更换商品图/文案/平台/语言/风格清除旧标题和卖点，生成失败不重新显示上一商品结果；异常返回不能直接进入 `.map`。
- 包装3D：任务ID必须为非空字符串，缺失立即报错，不再轮询 `job=undefined`；拖入空文件与选择器使用同一校验。
- 融图/裂变：完成状态必须有非空且合法的图片数组，异常结果展示可恢复错误，保留输入，拒绝在结果校验前走本地积分成功兜底；离开页面停止后续轮询。
- 生图底图：下载失败有短提示，校验图片类型/大小/空内容；携带现有鉴权；手动选图/移除使迟到下载失效并中止请求；替换释放旧预览；生成与底图下载互斥，保留血缘语义。
- 六类专用页：融图/裂变/局部改图/侵权检测/服装上身/印刷图的卸载清理读取最新预览，服装上身同时覆盖自定义模特。裂变移除在React updater内创建objectURL的副作用，保留多图中未替换的预览。
- 文字自定义模型弹窗：焦点循环、Escape关闭与焦点返回，现有全局/管理模型策略不变。
- 视频：终态停止中央轮询，同任务慢请求不会并发叠加；不改变延期的视频供应商配置。

### 当前证据

证据目录：`E:\Workspace\naumi\output\workbench-tools-ui-round2-20261010`。原始文件为本轮开工的真实工作副本字节hash，基线归档已留存。

基线浏览器已实证6种症状（标题残留、缺ID轮询、融图/裂变客户端异常、底图静默失败、SPA卸载预览残留）；退出0表示确认缺陷，不表示功能通过。源代码契约发现13条检查点缺失，不能与6个浏览器症状简单相加。

### 最终集中验收与交接

- `BASELINE_ROUND2_BROWSER=PASS CASES=6 CONFIRMED_GAPS=6 REAL_UPSTREAM=0`，退出0；这是缺陷复现成功，原始客户端异常24条（同一崩溃的重复报告），不是24个独立bug。
- `MODIFIED_ROUND2_BROWSER=PASS CASES=19 CONFIRMED_GAPS=0 REAL_UPSTREAM=0`，退出0；新回归客户端异常0。
- `BASELINE_ROUND2_CONTRACT=PASS CONFIRMED_GAPS=13`；`MODIFIED_ROUND2_CONTRACT=PASS FIXED_GAPS=13 UNIT_CASES=13`，均退出0。
- 最终26工具managed全量：`MODIFIED_BROWSER=PASS TOOLS=26 VIEWPORTS=3 OVERFLOW_CASES=0 CLIENT_ERRORS=0 FIXTURE_POSTS=34 INTERACTIONS=104 REAL_UPSTREAM=0 MODEL_MODE=MANAGED`，退出0。
- 原45例工具契约、质量选择器12视口契约、画布浅色11项、TypeScript和lint通过；保留原annotate-editor图片lint警告。
- 优化build编译成功并生成92/92页面，退出0。Windows依赖junction的standalone trace复制仍有一处EPERM，不作为Linux镜像运行验收。构建自动修改的tsconfig已恢复开工原字节。
- 结果截图还发现生图筛选“已完成”挤成两行；仅在该处增加不换行和不收缩样式，未改变共享Segmented。
- 交接前刷新main为 `6791c3eef7095e07af8ff37968434d37eea46cc7`；第一轮39f6208已是main祖先，本轮增量仍仅在当前任务分支，勿重复移植整轮目录。合并负责人刷新最新main并验证共享组件/模型管理整合。
- 浏览器业务响应均为隔离fixture，真实上游调用0。成功结果fixture不等同供应商效果、真实视频生成或线上发布验收。旧服务器、新服务器运行状态和数据均未修改。

```powershell
node scripts/verify-workbench-tools-browser.mjs --round2
node scripts/verify-workbench-tools-browser.mjs --managed-fixture
node node_modules/tsx/dist/cli.mjs scripts/verify-workbench-tools-round2.ts
```

新增回滚证据在本轮独立目录，原hash来自开工归档的实际文件字节；只对标记源码副本演练，不回滚真实工作分支。四项证据保留修改包、完整diff、验证记录、可执行回滚。

```text
接手此分支的第二轮增量；先阅读本节与AGENT_COLLABORATION，再刷新main。
不要替换目录、不要重复移植39f6208。重点验收底图取消/血缘、标题输入切换、
异常异步结果、六类预览释放、视频终态轮询与文字弹窗焦点。
保持后台模型范围/账务/媒体和数据库；统一合并后再执行Linux镜像与线上验收。
本轮任务未发布，用户禁止自动回传旧机。
```
